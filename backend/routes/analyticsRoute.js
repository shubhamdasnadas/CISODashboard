const express = require('express');
const router = express.Router();

// Helper: build a WHERE clause (and params) for a date window against a
// timestamp column. Works with both DATE(...) friendly text columns and
// real timestamps. Inclusive on both ends (day granularity).
function dateWindow(col, from, to) {
  const clauses = [];
  const params = [];
  if (from) { params.push(from); clauses.push(`${col} >= $${params.length}`); }
  if (to) {
    // Include the whole "to" day.
    params.push(`${to} 23:59:59`);
    clauses.push(`${col} <= $${params.length}`);
  }
  return { clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns aggregated stats, optionally bounded to a date range. Also returns a
// `previous` block (the equal-length window immediately before `from`) and a
// `modules` snapshot of per-integration record counts for side-by-side
// comparison on the Analytics page.
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const pool = req.orgPool;

    // ── Daily events (bounded) ───────────────────────────────────────────────
    const win = dateWindow('created_at', from, to);
    const dailySql = `
      SELECT DATE(created_at)::text AS _id, COUNT(*)::int AS count
      FROM analytics_events
      ${win.clause}
      GROUP BY DATE(created_at) ORDER BY _id
    `;
    const dailyRes = await pool.query(dailySql, win.params);

    const hasRange = !!(from && to);
    let prevDailyRes = { rows: [] };
    let prevTotals = { totalEvents: 0, pages: 0, users: 0 };

    if (hasRange) {
      // Previous equal-length window immediately before `from`.
      const fromDt = new Date(`${from}T00:00:00`);
      const toDt = new Date(`${to}T23:59:59`);
      const spanMs = toDt - fromDt + 1;
      const prevTo = new Date(fromDt.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - spanMs + 1);
      const pf = prevFrom.toISOString().slice(0, 10);
      const pt = prevTo.toISOString().slice(0, 10);
      const pWin = dateWindow('created_at', pf, pt);

      prevDailyRes = await pool.query(
        `SELECT DATE(created_at)::text AS _id, COUNT(*)::int AS count
         FROM analytics_events ${pWin.clause}
         GROUP BY DATE(created_at) ORDER BY _id`,
        pWin.params
      );
      const [pTotal, pPages, pUsers] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS t FROM analytics_events ${pWin.clause}`, pWin.params),
        pool.query(`SELECT COUNT(DISTINCT page)::int AS t FROM analytics_events WHERE page IS NOT NULL ${pWin.clause.replace('WHERE', 'AND')}`, pWin.params),
        pool.query(`SELECT COUNT(DISTINCT "user")::int AS t FROM analytics_events WHERE "user" IS NOT NULL ${pWin.clause.replace('WHERE', 'AND')}`, pWin.params),
      ]);
      prevTotals = {
        totalEvents: pTotal.rows[0]?.t ?? 0,
        pages: pPages.rows[0]?.t ?? 0,
        users: pUsers.rows[0]?.t ?? 0,
      };
    }

    // ── Top pages / users (bounded to the selected window) ───────────────────
    const pageRes = await pool.query(
      `SELECT page AS _id, COUNT(*)::int AS count
       FROM analytics_events
       WHERE page IS NOT NULL ${win.clause.replace('WHERE', 'AND')}
       GROUP BY page ORDER BY count DESC LIMIT 20`,
      win.params
    );
    const userRes = await pool.query(
      `SELECT "user" AS _id, COUNT(*)::int AS count
       FROM analytics_events
       WHERE "user" IS NOT NULL ${win.clause.replace('WHERE', 'AND')}
       GROUP BY "user" ORDER BY count DESC LIMIT 10`,
      win.params
    );

    const rangeTotalRes = await pool.query(
      `SELECT COUNT(*)::int AS t FROM analytics_events ${win.clause}`,
      win.params
    );
    const totalEvents = rangeTotalRes.rows[0]?.t ?? 0;

    // ── Cross-module snapshot (live counts from integration tables) ──────────
    // Each entry is a real table count so the "comparison across pages" is
    // grounded in actual data, not page visits.
    const MODULES = [
      { key: 'checkpoint', label: 'Email Security', table: 'checkpoint_events' },
      { key: 'mdm', label: 'MDM', table: 'hexnode_devices' },
      { key: 'nvd', label: 'NVD', table: 'nvd' },
      { key: 'security', label: 'EDR (SentinelOne)', table: 's1_threats' },
      { key: 'zoho-one', label: 'Ticketing', table: 'zohotable' },
      { key: 'paloalto', label: 'Firewall', table: 'firewall_reports' },
    ];
    const moduleCounts = await Promise.all(
      MODULES.map(async (m) => {
        try {
          const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${m.table}`);
          return { key: m.key, label: m.label, count: r.rows[0]?.c ?? 0 };
        } catch {
          // Table may not exist for this org's schema yet — treat as 0.
          return { key: m.key, label: m.label, count: 0 };
        }
      })
    );

    res.json({
      totalEvents,
      pageStats: pageRes.rows,
      dailyStats: dailyRes.rows,
      topUsers: userRes.rows,
      previous: {
        dailyStats: prevDailyRes.rows,
        ...prevTotals,
      },
      modules: moduleCounts,
      range: { from: from || null, to: to || null },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/analytics
router.post('/', async (req, res) => {
  try {
    const { event, page, metadata } = req.body;
    if (!event) return res.status(400).json({ message: 'event is required' });

    await req.orgPool.query(
      `INSERT INTO analytics_events (event, page, "user", metadata) VALUES ($1, $2, $3, $4)`,
      [event, page || null, req.user.username || req.user.userId, metadata ? JSON.stringify(metadata) : null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
