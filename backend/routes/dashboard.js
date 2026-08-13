const express = require('express');
const router = express.Router();

// GET /api/dashboard/layout
router.get('/layout', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await req.orgPool.query(
      'SELECT layout FROM dashboard_layout WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    res.json({ layout: rows[0]?.layout ?? null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/dashboard/layout
router.put('/layout', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { layout } = req.body;
    await req.orgPool.query(
      `INSERT INTO dashboard_layout (user_id, layout, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = NOW()`,
      [userId, JSON.stringify(layout)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/aggregate  — single endpoint that returns all data for the dashboard
router.get('/aggregate', async (req, res) => {
  try {
    const userId = req.user.userId;
    const pool = req.orgPool;

    const [
      layoutRows,
      threatsRows,
      agentsRows,
      appAgentRows,
      appCveRows,
      deviceControlRows,
      rssRows,
      harmonyRows,
      fwWidgetsRows,
    ] = await Promise.all([
      pool.query('SELECT layout FROM dashboard_layout WHERE user_id = $1 LIMIT 1', [userId]),
      pool.query('SELECT data FROM s1_threats ORDER BY synced_at DESC'),
      pool.query('SELECT data FROM s1_agents ORDER BY synced_at DESC'),
      pool.query('SELECT data FROM s1_application_agent ORDER BY synced_at DESC'),
      pool.query('SELECT data FROM s1_application_cve ORDER BY synced_at DESC'),
      pool.query('SELECT data FROM s1_device_control ORDER BY synced_at DESC'),
      pool.query('SELECT data FROM s1_rss ORDER BY synced_at DESC'),
      pool.query('SELECT * FROM checkpoint_events ORDER BY synced_at DESC'),
      pool.query('SELECT * FROM firewall_widgets ORDER BY created_at ASC'),
    ]);

    res.json({
      layout: layoutRows.rows[0]?.layout ?? null,
      sentinelone: {
        threats: threatsRows.rows.map(r => r.data),
        agents: agentsRows.rows.map(r => r.data),
        applicationAgent: appAgentRows.rows.map(r => r.data),
        applicationCve: appCveRows.rows.map(r => r.data),
        deviceControl: deviceControlRows.rows.map(r => r.data),
        rss: rssRows.rows.map(r => r.data),
      },
      harmony: {
        events: harmonyRows.rows,
      },
      firewall: {
        widgets: fwWidgetsRows.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Compliance Health Scores ──────────────────────────────────────────────────
// Keeps one "latest" health-score snapshot per org.
// POST upserts (deletes old rows then inserts new), GET returns the latest.

// Ensure the compliance_health_scores table exists (idempotent)
async function ensureHealthScoresTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_health_scores (
      id                   SERIAL       PRIMARY KEY,
      edr_percentage       NUMERIC(5,2) NOT NULL DEFAULT 0,
      email_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0,
      ticketing_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      average_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0,
      created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

// GET /api/dashboard/health-scores — returns the latest health score for this org
router.get('/health-scores', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { rows } = await req.orgPool.query(
      'SELECT id, edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at FROM compliance_health_scores ORDER BY created_at DESC LIMIT 1'
    );
    if (rows.length === 0) {
      return res.json({ score: null });
    }
    res.json({ score: rows[0] });
  } catch (err) {
    console.error('[health-scores] GET error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/health-scores/history — returns all stored health scores (newest first)
router.get('/health-scores/history', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { rows } = await req.orgPool.query(
      'SELECT id, edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at FROM compliance_health_scores ORDER BY created_at DESC'
    );
    res.json({ scores: rows });
  } catch (err) {
    console.error('[health-scores] GET history error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/dashboard/health-scores — save / update the health score snapshot
// Body: { edr_percentage, email_percentage, ticketing_percentage }
// average_percentage is computed server-side.
// Behaviour:
//   - Same day (within 24h): UPDATE the existing row
//   - After 24h / new day: INSERT a new row, carrying over the last entry's values by default
//   - No row yet: INSERT a new row
router.post('/health-scores', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);

    const { edr_percentage, email_percentage, ticketing_percentage } = req.body;
    const edr = parseFloat(edr_percentage) || 0;
    const email = parseFloat(email_percentage) || 0;
    const ticketing = parseFloat(ticketing_percentage) || 0;
    const average = Math.round(((edr + email + ticketing) / 3) * 100) / 100;

    const client = await req.orgPool.connect();
    try {
      await client.query('BEGIN');
      const latestRes = await client.query(
        'SELECT * FROM compliance_health_scores ORDER BY created_at DESC LIMIT 1 FOR UPDATE'
      );
      const cur = latestRes.rows[0] || null;

      // Carry over the last entry's values for any field not explicitly provided.
      const edrVal = edr_percentage !== undefined ? edr : (cur ? parseFloat(cur.edr_percentage) || 0 : 0);
      const emailVal = email_percentage !== undefined ? email : (cur ? parseFloat(cur.email_percentage) || 0 : 0);
      const ticketingVal = ticketing_percentage !== undefined ? ticketing : (cur ? parseFloat(cur.ticketing_percentage) || 0 : 0);
      const avgVal = Math.round(((edrVal + emailVal + ticketingVal) / 3) * 100) / 100;

      let result;
      if (!cur) {
        const { rows } = await client.query(
          `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at`,
          [edrVal, emailVal, ticketingVal, avgVal]
        );
        result = rows[0];
      } else if (isSameDay(cur.created_at)) {
        const { rows } = await client.query(
          `UPDATE compliance_health_scores
             SET edr_percentage = $1, email_percentage = $2, ticketing_percentage = $3, average_percentage = $4
           WHERE id = $5
           RETURNING id, edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at`,
          [edrVal, emailVal, ticketingVal, avgVal, cur.id]
        );
        result = rows[0];
      } else {
        const { rows } = await client.query(
          `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at`,
          [edrVal, emailVal, ticketingVal, avgVal]
        );
        result = rows[0];
      }

      await client.query('COMMIT');
      console.log('[health-scores] Saved:', { edr: edrVal, email: emailVal, ticketing: ticketingVal, average: avgVal, id: result.id });
      res.status(201).json({ score: result });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[health-scores] POST error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Same-day helper (within 24h) shared with the health-scores logic
function isSameDay(existingCreatedAt) {
  if (!existingCreatedAt) return false;
  const now = new Date();
  const created = new Date(existingCreatedAt);
  const diffHours = (now - created) / (1000 * 60 * 60);
  return diffHours < 24;
}

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = req.orgPool;
    const [threats, agents, events, tickets] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM s1_threats'),
      pool.query('SELECT COUNT(*) FROM s1_agents'),
      pool.query('SELECT COUNT(*) FROM checkpoint_events'),
      pool.query('SELECT COUNT(*) FROM support_tickets WHERE status = $1', ['open']),
    ]);

    res.json({
      s1Threats: parseInt(threats.rows[0].count, 10),
      s1Agents: parseInt(agents.rows[0].count, 10),
      harmonyEvents: parseInt(events.rows[0].count, 10),
      openTickets: parseInt(tickets.rows[0].count, 10),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
