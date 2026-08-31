const express = require('express');
const router = express.Router();
const { syncSentinelOne, syncCustomAlerts } = require('../services/sentinelone');

// GET /api/sentinelone/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials, updated_at FROM integration_credentials WHERE integration = 'sentinelone' LIMIT 1"
    );
    if (!rows[0]) return res.json({});
    return res.json({ ...rows[0].credentials, lastSyncedAt: rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sentinelone/credentials
router.put('/credentials', async (req, res) => {
  try {
    const { accountId, tokenKey, baseUrl } = req.body;
    if (!tokenKey) {
      return res.status(400).json({ message: 'tokenKey is required' });
    }
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ('sentinelone', $1, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [JSON.stringify({ accountId, tokenKey, baseUrl })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sentinelone/sync
router.post('/sync', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'sentinelone' LIMIT 1"
    );
    if (!rows[0]) return res.status(400).json({ message: 'SentinelOne not configured' });

    const result = await syncSentinelOne(req.orgSlug, rows[0].credentials);
    const warnings = [];
    if (result.installedAppsError) warnings.push(`Installed apps: ${result.installedAppsError}`);
    res.json({
      success: true,
      message: `Synced ${result.threats} threats, ${result.agents} agents, ${result.installedApps} installed apps`,
      warnings: warnings.length ? warnings : undefined,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sentinelone/sync-custom-alerts
router.post('/sync-custom-alerts', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'sentinelone' LIMIT 1"
    );
    if (!rows[0]) return res.status(400).json({ message: 'SentinelOne not configured' });

    const result = await syncCustomAlerts(req.orgSlug, rows[0].credentials);
    res.json({ success: true, message: `Synced ${result.alerts} custom alerts`, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/threats
router.get('/db/threats', async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = 'SELECT data FROM s1_threats';
    const params = [];
    const conditions = [];
    if (from) {
      params.push(from);
      conditions.push(`(data->'threatInfo'->>'createdAt')::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`(data->'threatInfo'->>'createdAt')::date <= $${params.length}::date`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY synced_at DESC';
    const { rows } = await req.orgPool.query(query, params);
    res.json({ threats: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/agents/removed-count
router.get('/db/agents/removed-count', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      `SELECT COUNT(*)::int AS count FROM s1_agents WHERE removed_at IS NOT NULL`
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/agents
router.get('/db/agents', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      'SELECT data FROM s1_agents WHERE removed_at IS NULL ORDER BY synced_at DESC'
    );
    res.json({ agents: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/application-agent
router.get('/db/application-agent', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_application_agent ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/application-cve
router.get('/db/application-cve', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_application_cve ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/device-control
router.get('/db/device-control', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_device_control ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/rss
router.get('/db/rss', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_rss ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/db/custom-alert
// Returns EVERY stored cloud-detection alert (no LIMIT — full table).
router.get('/db/custom-alert', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_custome_alert ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/recent
// Combined feed: ALL threats + ALL custom alerts merged into one time-sorted
// list, newest first. No LIMIT — returns the full contents of both tables.
// Optional `from` / `to` ISO date params filter by event time.
router.get('/recent', async (req, res) => {
  try {
    const { from, to } = req.query;
    const [threatsRes, alertsRes] = await Promise.all([
      req.orgPool.query('SELECT data FROM s1_threats'),
      req.orgPool.query('SELECT data FROM s1_custome_alert'),
    ]);

    // Map a cloud-detection alert's status to mitigated / not_mitigated.
    // Status lives in alertInfo.incidentStatus ("Unresolved" / "Resolved").
    // NOTE: "unresolved" must be checked BEFORE "resolved" (it also contains it).
    const alertMitigation = (s) => {
      const str = String(s || '').toLowerCase().replace(/[_\s-]/g, '');
      if (str.includes('unresolved') || str.includes('inprogress') || str.includes('open')
        || str.includes('active') || str.includes('notapplicable') || str.includes('unmitigated')
        || str.includes('undefined')) return 'not_mitigated';
      if (str.includes('resolved') || str.includes('mitigated') || str.includes('fixed')) return 'mitigated';
      return 'unknown';
    };

    // Uses the real cloud-detection payload shape (ruleInfo.* / alertInfo.*).
    const normAlert = (a) => ({
      source: 'custom-alert',
      data: a,
      name: a.ruleInfo?.name || a.alertInfo?.indicatorName || a.ruleName
        || a.alertName || a.name || a.title || a.displayName || 'Custom Alert',
      createdAt: a.alertInfo?.createdAt || a.alertInfo?.reportedAt
        || a.alertInfo?.updatedAt || a.detectedAt || a.createdAt || a.timestamp
        || a.detectionInfo?.detectedAt || null,
      severity: a.ruleInfo?.severity || a.alertInfo?.severity || a.severity || '—',
      status: alertMitigation(a.alertInfo?.incidentStatus || a.alertInfo?.analystVerdict
        || a.status || a.alertStatus || ''),
      subtitle: a.agentDetectionInfo?.name || a.agentComputerName
        || a.computerName || a.sourceProcessInfo?.name || a.endpointName || '—',
    });

    const combined = [
      ...threatsRes.rows.map(({ data: t }) => ({
        source: 'threat',
        data: t,
        name: t.threatInfo?.threatName || 'Unknown',
        createdAt: t.threatInfo?.createdAt || null,
        severity: t.threatInfo?.confidenceLevel || t.threatInfo?.severity || '—',
        status: t.threatInfo?.mitigationStatus || 'unknown',
        subtitle: t.agentRealtimeInfo?.agentComputerName || '—',
      })),
      ...alertsRes.rows.map(({ data: a }) => normAlert(a)),
    ]
      .filter((x) => {
        if (!x.createdAt) return !from && !to;
        const t = new Date(x.createdAt).getTime();
        if (Number.isNaN(t)) return !from && !to;
        if (from && t < new Date(from).getTime()) return false;
        if (to && t > new Date(to).getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ data: combined, counts: { threats: threatsRes.rows.length, customAlerts: alertsRes.rows.length } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/threats  (alias — returns same as db/threats)
router.get('/threats', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_threats ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/agentinfo
router.get('/agentinfo', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_agents ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/applicationCVE
router.get('/applicationCVE', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_application_cve ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/applicationagent
router.get('/applicationagent', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_application_agent ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/devicecontrol
router.get('/devicecontrol', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_device_control ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sentinelone/rss
router.get('/rss', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query('SELECT data FROM s1_rss ORDER BY synced_at DESC');
    res.json({ data: rows.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
