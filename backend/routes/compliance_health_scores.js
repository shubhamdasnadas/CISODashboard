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

// Helper: Check if the latest row is from today (within 24 hours)
function isSameDay(existingCreatedAt) {
  if (!existingCreatedAt) return false;
  const now = new Date();
  const created = new Date(existingCreatedAt);
  const diffMs = now - created;
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours < 24;
}

// GET / — latest snapshot (always returns the most recent row)
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

// Allowed percentage columns
const SCORE_FIELDS = ['edr_percentage', 'email_percentage', 'ticketing_percentage'];

// Core upsert used by both POST and PATCH.
// Rules:
//   - No existing row            -> INSERT a new row (unspecified fields default to 0)
//   - Latest row is same day      -> UPDATE that row in place
//   - Latest row is older than 24h -> INSERT a NEW row, carrying over the last entry's
//                                     values for any field not explicitly provided
// Wrapped in a transaction with a row lock so concurrent requests can't create duplicate
// "new day" rows.
async function upsertSnapshot(pool, providedFields) {
  const provided = {};
  for (const f of SCORE_FIELDS) {
    if (providedFields[f] !== undefined && providedFields[f] !== null) {
      provided[f] = parseFloat(providedFields[f]) || 0;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the latest row so concurrent requests serialize here.
    const latestRes = await client.query(
      'SELECT * FROM compliance_health_scores ORDER BY created_at DESC LIMIT 1 FOR UPDATE'
    );
    const cur = latestRes.rows[0] || null;

    // Build the full row values, carrying over from the last entry when a field
    // is not explicitly provided (this is what makes a "new day" row inherit
    // the previous day's scores by default).
    const values = {};
    for (const f of SCORE_FIELDS) {
      if (provided[f] !== undefined) values[f] = provided[f];
      else if (cur) values[f] = parseFloat(cur[f]) || 0;
      else values[f] = 0;
    }
    const average =
      Math.round(((values.edr_percentage + values.email_percentage + values.ticketing_percentage) / 3) * 100) / 100;

    let result;
    if (!cur) {
      const { rows } = await client.query(
        `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [values.edr_percentage, values.email_percentage, values.ticketing_percentage, average]
      );
      result = rows[0];
      console.log('[compliance-health-scores] Created new row:', result.id, '(no prior entry)');
    } else if (isSameDay(cur.created_at)) {
      const { rows } = await client.query(
        `UPDATE compliance_health_scores
           SET edr_percentage = $1, email_percentage = $2, ticketing_percentage = $3, average_percentage = $4
         WHERE id = $5 RETURNING *`,
        [values.edr_percentage, values.email_percentage, values.ticketing_percentage, average, cur.id]
      );
      result = rows[0];
      console.log('[compliance-health-scores] Updated existing row:', result.id, '(same day)');
    } else {
      const { rows } = await client.query(
        `INSERT INTO compliance_health_scores (edr_percentage, email_percentage, ticketing_percentage, average_percentage, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [values.edr_percentage, values.email_percentage, values.ticketing_percentage, average]
      );
      result = rows[0];
      console.log('[compliance-health-scores] Created new row:', result.id, '(new day, copied from row', cur.id, ')');
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// POST / — save / upsert a full snapshot
// Same day (within 24h): UPDATE the existing row
// After 24h / new day: INSERT a new row carrying over the last entry's values by default
router.post('/', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { edr_percentage, email_percentage, ticketing_percentage } = req.body;
    const result = await upsertSnapshot(req.orgPool, { edr_percentage, email_percentage, ticketing_percentage });
    res.status(201).json({ score: result });
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
// Same day (within 24h): UPDATE the existing row's field
// After 24h / new day: CREATE a new row copying the last entry's values, then update the field
router.patch('/update', async (req, res) => {
  try {
    await ensureHealthScoresTable(req.orgPool);
    const { field, value } = req.body;
    if (!SCORE_FIELDS.includes(field)) {
      return res.status(400).json({ message: `Invalid field. Must be one of: ${SCORE_FIELDS.join(', ')}` });
    }
    const result = await upsertSnapshot(req.orgPool, { [field]: value });
    console.log(`[compliance-health-scores] PATCH ${field} = ${parseFloat(value) || 0} — row ${result.id}`);
    res.json({ score: result });
  } catch (err) {
    console.error('[compliance-health-scores] PATCH error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;