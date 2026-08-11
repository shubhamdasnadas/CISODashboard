const express = require('express');
const router = express.Router();

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

// GET / — latest snapshot
router.get('/', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { rows } = await req.orgPool.query(
      'SELECT * FROM compliance_health_scores ORDER BY created_at DESC LIMIT 1'
    );
    res.json({ score: rows[0] || null });
  } catch (err) {
    console.error('[compliance-health-scores] GET error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /history — all rows
router.get('/history', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { rows } = await req.orgPool.query(
      'SELECT * FROM compliance_health_scores ORDER BY created_at DESC'
    );
    res.json({ scores: rows });
  } catch (err) {
    console.error('[compliance-health-scores] GET /history error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST / — save / upsert snapshot
router.post('/', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { edr_percentage, email_percentage, ticketing_percentage } = req.body;
    const edr = parseFloat(edr_percentage) || 0;
    const email = parseFloat(email_percentage) || 0;
    const ticketing = parseFloat(ticketing_percentage) || 0;
    const average = Math.round(((edr + email + ticketing) / 3) * 100) / 100;

    await req.orgPool.query('DELETE FROM compliance_health_scores');
    const { rows } = await req.orgPool.query(
      `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [edr, email, ticketing, average]
    );
    console.log('[compliance-health-scores] Saved:', rows[0].id);
    res.status(201).json({ score: rows[0] });
  } catch (err) {
    console.error('[compliance-health-scores] POST error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// PUT /:id — update a specific row
router.put('/:id', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { id } = req.params;
    const { edr_percentage, email_percentage, ticketing_percentage } = req.body;
    const edr = parseFloat(edr_percentage) || 0;
    const email = parseFloat(email_percentage) || 0;
    const ticketing = parseFloat(ticketing_percentage) || 0;
    const average = Math.round(((edr + email + ticketing) / 3) * 100) / 100;

    const { rows } = await req.orgPool.query(
      `UPDATE compliance_health_scores
         SET edr_percentage=$1, email_percentage=$2, ticketing_percentage=$3, average_percentage=$4
       WHERE id=$5 RETURNING *`,
      [edr, email, ticketing, average, id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Record not found' });
    res.json({ score: rows[0] });
  } catch (err) {
    console.error('[compliance-health-scores] PUT error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /:id — delete a specific row
router.delete('/:id', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const result = await req.orgPool.query('DELETE FROM compliance_health_scores WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[compliance-health-scores] DELETE error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /email-security — harmony events data for Emailsecuritymttr
router.get('/email-security', async (req, res) => {
  try {
    // checkpoint_events stores each event as a row with individual columns (no "data" column)
    const { rows } = await req.orgPool.query(
      `SELECT event_id, type, state, severity, confidence_indicator,
              description, sender_address, saas, entity_id, entity_link,
              event_created, actions, additional_data
       FROM checkpoint_events ORDER BY synced_at DESC`
    );
    const total = rows.length;
    const remediated = rows.filter(e =>
      (e.state || '').toLowerCase() === 'remediated' ||
      (e.state || '').toLowerCase() === 'closed' ||
      (e.state || '').toLowerCase() === 'done'
    ).length;
    const percentage = total > 0 ? Math.round((remediated / total) * 100 * 100) / 100 : 0;
    res.json({ total, remediated, unremediated: total - remediated, percentage });
  } catch (err) {
    console.error('[compliance-health-scores] GET /email-security error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /edr — SentinelOne threats data for S1Mttr
router.get('/edr', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_threats ORDER BY synced_at DESC');
    let threats = [];
    for (const row of rows) {
      if (Array.isArray(row.data)) threats = threats.concat(row.data);
      else if (row.data && typeof row.data === 'object') threats.push(row.data);
    }
    const total = threats.length;
    const mitigated = threats.filter(t =>
      t.mitigated === true || t.status === 'mitigated' || t.analysis === 'Clean'
    ).length;
    const percentage = total > 0 ? Math.round((mitigated / total) * 100 * 100) / 100 : 0;
    res.json({ total, mitigated, unmitigated: total - mitigated, percentage });
  } catch (err) {
    console.error('[compliance-health-scores] GET /edr error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /ticketing — Zoho tickets data for Ticketingmttr
router.get('/ticketing', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT data FROM zohotable WHERE data_name = 'tickets' LIMIT 1"
    );
    let tickets = [];
    if (rows.length > 0 && rows[0].data) {
      tickets = Array.isArray(rows[0].data) ? rows[0].data : (rows[0].data.responseData || []);
    }
    const total = tickets.length;
    const closedStatuses = ['closed', 'technically closed', 'resolved'];
    const closed = tickets.filter(t =>
      closedStatuses.includes((t.status || '').toLowerCase())
    ).length;
    const percentage = total > 0 ? Math.round((closed / total) * 100 * 100) / 100 : 0;
    res.json({ total, closed, open: total - closed, percentage });
  } catch (err) {
    console.error('[compliance-health-scores] GET /ticketing error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// PATCH /update — update a single percentage field in the latest row
router.patch('/update', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { field, value } = req.body;
    const allowed = ['edr_percentage', 'email_percentage', 'ticketing_percentage'];
    if (!allowed.includes(field)) {
      return res.status(400).json({ message: `Invalid field. Must be one of: ${allowed.join(', ')}` });
    }
    const val = parseFloat(value) || 0;

    // Check if a row already exists
    const { rows: existing } = await req.orgPool.query(
      'SELECT * FROM compliance_health_scores ORDER BY created_at DESC LIMIT 1'
    );

    let result;
    if (existing.length === 0) {
      // Create a new row with this field set, others default 0
      const fields = { edr_percentage: 0, email_percentage: 0, ticketing_percentage: 0 };
      fields[field] = val;
      const avg = Math.round(((fields.edr_percentage + fields.email_percentage + fields.ticketing_percentage) / 3) * 100) / 100;
      const { rows } = await req.orgPool.query(
        `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [fields.edr_percentage, fields.email_percentage, fields.ticketing_percentage, avg]
      );
      result = rows[0];
    } else {
      const cur = existing[0];
      const edr = field === 'edr_percentage' ? val : parseFloat(cur.edr_percentage);
      const email = field === 'email_percentage' ? val : parseFloat(cur.email_percentage);
      const ticketing = field === 'ticketing_percentage' ? val : parseFloat(cur.ticketing_percentage);
      const avg = Math.round(((edr + email + ticketing) / 3) * 100) / 100;

      const { rows } = await req.orgPool.query(
        `UPDATE compliance_health_scores
           SET ${field} = $1, average_percentage = $2
         WHERE id = $3 RETURNING *`,
        [val, avg, cur.id]
      );
      result = rows[0];
    }

    console.log(`[compliance-health-scores] PATCH ${field} = ${val}`);
    res.json({ score: result });
  } catch (err) {
    console.error('[compliance-health-scores] PATCH error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;