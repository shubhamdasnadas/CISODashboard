const express = require('express');
const router = express.Router();
const syncService = require('../services/syncService');

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

// GET /api/dashboard/aggregate  — single endpoint that returns all data for the dashboard with Redis acceleration
router.get('/aggregate', async (req, res) => {
  try {
    const userId = req.user.userId;
    const pool = req.orgPool;
    const orgSlug = req.orgSlug;

    const [layoutRes, cacheRes] = await Promise.all([
      pool.query('SELECT layout FROM dashboard_layout WHERE user_id = $1 LIMIT 1', [userId]).catch(() => ({ rows: [] })),
      syncService.readCached(orgSlug, 'dashboard-aggregate').catch(() => ({ source: 'miss' })),
    ]);

    let aggData = cacheRes?.payload;
    if (!aggData || cacheRes?.source === 'miss') {
      try {
        await syncService.syncAndCache(orgSlug, 'dashboard-aggregate');
        const fresh = await syncService.readCached(orgSlug, 'dashboard-aggregate');
        aggData = fresh?.payload;
      } catch (e) {
        console.warn('[dashboard] aggregate sync fallback:', e.message);
      }
    }

    if (aggData) {
      return res.json({
        layout: layoutRes.rows[0]?.layout ?? null,
        ...aggData,
      });
    }

    const [
      threatsRows,
      agentsRows,
      appAgentRows,
      appCveRows,
      deviceControlRows,
      rssRows,
      customAlertRows,
      harmonyRows,
      fwWidgetsRows,
      zohoRows,
      hexnodeRows,
    ] = await Promise.all([
      pool.query('SELECT data FROM s1_threats ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_agents ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_application_agent ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_application_cve ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_device_control ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_rss ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM s1_custome_alert ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM checkpoint_events ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM firewall_widgets ORDER BY created_at ASC').catch(() => ({ rows: [] })),
      pool.query("SELECT data FROM zohotable WHERE data_name = 'ticket_data' LIMIT 1").catch(() => ({ rows: [] })),
      pool.query('SELECT data FROM hexnode_devices ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    ]);

    const allTools = await buildAllToolsSnapshot(pool);

    let tickets = [];
    if (zohoRows.rows[0]?.data) {
      const raw = zohoRows.rows[0].data;
      tickets = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    }
    const devices = hexnodeRows.rows.map(r => r.data).filter(Boolean);

    res.json({
      layout: layoutRes.rows[0]?.layout ?? null,
      sentinelone: {
        threats: threatsRows.rows.map(r => r.data),
        agents: agentsRows.rows.map(r => r.data),
        applicationAgent: appAgentRows.rows.map(r => r.data),
        applicationCve: appCveRows.rows.map(r => r.data),
        deviceControl: deviceControlRows.rows.map(r => r.data),
        rss: rssRows.rows.map(r => r.data),
        customAlerts: customAlertRows.rows.map(r => r.data),
      },
      harmony: {
        events: harmonyRows.rows,
      },
      firewall: {
        widgets: fwWidgetsRows.rows,
      },
      ticketing: { tickets },
      mdm: { devices },
      allTools,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Build per-tool current vs previous-month counts using each table's
// `synced_at` column when present. Tools without that column fall back to
// the total count for both buckets (delta == 0).
async function buildAllToolsSnapshot(pool) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const TOOLS = [
    { key: 'security',     label: 'EDR',       table: 's1_threats' },
    { key: 'agent',        label: 'Agents',    table: 's1_agents' },
    { key: 'checkpoint',   label: 'Email',     table: 'checkpoint_events' },
    { key: 'nvd',          label: 'NVD',       table: 'nvd' },
    { key: 'paloalto',     label: 'Firewall',  table: 'firewall_widgets' },
    { key: 'mdm',          label: 'MDM',       table: 'hexnode_devices' },
    { key: 'microsoft365', label: 'M365',      table: 'microsoft365' },
    { key: 'zoho',         label: 'Ticketing', table: 'zohotable' },
    { key: 'analytics',    label: 'OSINT',     table: 'analytics_events' },
  ];

  const results = await Promise.all(TOOLS.map(async (t) => {
    try {
      // Try synced_at split first; fall back to a single COUNT(*).
      const split = await pool.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE synced_at >= $1)::int AS current,
            COUNT(*) FILTER (WHERE synced_at >= $2 AND synced_at < $1)::int AS previous
         FROM ${t.table}`,
        [monthStart.toISOString(), prevMonthStart.toISOString()]
      );
      const row = split.rows[0] || { total: 0, current: 0, previous: 0 };
      return { key: t.key, label: t.label, current: row.current, previous: row.previous, total: row.total };
    } catch {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t.table}`);
        const total = r.rows[0]?.c ?? 0;
        return { key: t.key, label: t.label, current: total, previous: total, total };
      } catch {
        return { key: t.key, label: t.label, current: 0, previous: 0, total: 0 };
      }
    }
  }));

  return { tools: results, monthStart: monthStart.toISOString() };
}

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
