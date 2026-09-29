const express = require('express');
const router = express.Router();
const axios = require('axios');

const BASE_V1 = 'https://graph.microsoft.com/v1.0';
const BASE_BETA = 'https://graph.microsoft.com/beta';
const BASE_MGMT = 'https://manage.office.com';
const BASE_DEFENDER = 'https://api.securitycenter.microsoft.com';

const ENDPOINTS = [
  // ── Graph API ──────────────────────────────────────────────────────────────
  { key: 'organization', path: '/organization', base: BASE_V1, table: 'ms_organization' },
  { key: 'subscribedSkus', path: '/subscribedSkus', base: BASE_V1, table: 'ms_subscribed_skus' },
  { key: 'domains', path: '/domains', base: BASE_V1, table: 'ms_domains' },
  { key: 'users', path: '/users', base: BASE_V1, table: 'ms_users' },
  { key: 'auditSignIns', path: '/auditLogs/signIns', base: BASE_V1, table: 'ms_audit_sign_ins' },
  { key: 'auditDirectory', path: '/auditLogs/directoryAudits', base: BASE_V1, table: 'ms_audit_directory' },
  { key: 'auditProvisioning', path: '/auditLogs/provisioning', base: BASE_V1, table: 'ms_audit_provisioning' },
  { key: 'riskyUsers', path: '/identityProtection/riskyUsers', base: BASE_V1, table: 'ms_risky_users' },
  { key: 'riskDetections', path: '/identityProtection/riskDetections', base: BASE_V1, table: 'ms_risk_detections' },
  { key: 'riskyServicePrincipals', path: '/identityProtection/riskyServicePrincipals', base: BASE_V1, table: 'ms_risky_service_principals' },
  { key: 'securityIncidents', path: '/security/incidents', base: BASE_V1, table: 'ms_security_incidents' },
  { key: 'securityAlerts', path: '/security/alerts_v2', base: BASE_V1, table: 'ms_security_alerts' },
  { key: 'secureScores', path: '/security/secureScores', base: BASE_V1, table: 'ms_secure_scores' },
  { key: 'secureScoreProfiles', path: '/security/secureScoreControlProfiles', base: BASE_V1, table: 'ms_secure_score_profiles' },
  { key: 'managedDevices', path: '/deviceManagement/managedDevices', base: BASE_V1, table: 'ms_managed_devices' },
  { key: 'compliancePolicies', path: '/deviceManagement/deviceCompliancePolicies', base: BASE_V1, table: 'ms_compliance_policies' },
  { key: 'deviceConfigurations', path: '/deviceManagement/deviceConfigurations', base: BASE_V1, table: 'ms_device_configurations' },
  { key: 'applications', path: '/applications', base: BASE_V1, table: 'ms_applications' },
  { key: 'servicePrincipals', path: '/servicePrincipals', base: BASE_V1, table: 'ms_service_principals' },
  { key: 'serviceHealth', path: '/admin/serviceAnnouncement/healthOverviews', base: BASE_V1, table: 'ms_service_health' },
  { key: 'serviceIssues', path: '/admin/serviceAnnouncement/issues', base: BASE_V1, table: 'ms_service_issues' },
  { key: 'purviewTrigger', path: '/security/triggers', base: BASE_V1, table: 'ms_purview_trigger', optional: true },
  { key: 'purviewLabels', path: '/security/labels', base: BASE_V1, table: 'ms_purview_label', optional: true },
  // ── Management Activity API ────────────────────────────────────────────────
  { key: 'mgmtActivitySubscriptions', path: null, base: BASE_MGMT, table: 'ms_mgmt_activity_subscriptions', optional: true, mgmt: true },
  // ── Microsoft Defender for Endpoint ───────────────────────────────────────
  { key: 'defenderMachines', path: '/api/machines', base: BASE_DEFENDER, table: 'ms_defender_machines', optional: true, defender: true },
  { key: 'defenderAlerts', path: '/api/alerts', base: BASE_DEFENDER, table: 'ms_defender_alerts', optional: true, defender: true },
  { key: 'defenderVulnerabilities', path: '/api/vulnerabilities', base: BASE_DEFENDER, table: 'ms_defender_vulnerabilities', optional: true, defender: true },
  { key: 'defenderRecommendations', path: '/api/recommendations', base: BASE_DEFENDER, table: 'ms_defender_recommendations', optional: true, defender: true },
  { key: 'defenderSoftware', path: '/api/software', base: BASE_DEFENDER, table: 'ms_defender_software', optional: true, defender: true },
  { key: 'defenderIndicators', path: '/api/indicators', base: BASE_DEFENDER, table: 'ms_defender_indicators', optional: true, defender: true },
  { key: 'defenderInvestigations', path: '/api/investigations', base: BASE_DEFENDER, table: 'ms_defender_investigations', optional: true, defender: true },
  { key: 'defenderLibraryFiles', path: '/api/libraryfiles', base: BASE_DEFENDER, table: 'ms_defender_library_files', optional: true, defender: true },
];

// ── Token helpers ──────────────────────────────────────────────────────────────

async function getToken(tenantId, clientId, clientSecret, scope) {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

const getMicrosoftToken = (t, c, s) => getToken(t, c, s, 'https://graph.microsoft.com/.default');
const getMgmtToken = (t, c, s) => getToken(t, c, s, 'https://manage.office.com/.default');
const getDefenderToken = (t, c, s) => getToken(t, c, s, 'https://api.securitycenter.microsoft.com/.default');

// ── Fetch helpers ──────────────────────────────────────────────────────────────

function buildError(err) {
  const apiErr = err.response?.data?.error;
  return apiErr
    ? `[${apiErr.code || err.response.status}] ${apiErr.message}`
    : err.response
      ? `[${err.response.status}] ${err.message}`
      : `[NetworkError] ${err.message}`;
}

// Generic GET — never throws
async function fetchEndpoint(accessToken, path, base, optional = false) {
  try {
    const res = await axios.get(`${base}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    });
    return { data: res.data, error: null };
  } catch (err) {
    if (optional) return { data: { value: [] }, error: null };
    return { data: null, error: buildError(err) };
  }
}

// Management Activity subscriptions — tenantId in URL
async function fetchMgmtSubscriptions(tenantId, mgmtToken) {
  try {
    const res = await axios.get(
      `${BASE_MGMT}/api/v1.0/${tenantId}/activity/feed/subscriptions/list`,
      { headers: { Authorization: `Bearer ${mgmtToken}` }, timeout: 30000 }
    );
    return { data: { value: Array.isArray(res.data) ? res.data : [res.data] }, error: null };
  } catch (err) {
    return { data: null, error: buildError(err) };
  }
}

// ── DB helper ──────────────────────────────────────────────────────────────────

async function upsertTable(pool, table, data) {
  const existing = await pool.query(`SELECT id FROM ${table} LIMIT 1`);
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE ${table} SET data = $1, synced_at = NOW() WHERE id = $2`,
      [JSON.stringify(data), existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO ${table} (data, synced_at) VALUES ($1, NOW())`,
      [JSON.stringify(data)]
    );
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/microsoft/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials, updated_at FROM integration_credentials WHERE integration = 'microsoft' LIMIT 1"
    );
    if (!rows[0]) return res.json({});
    const { clientSecret, ...safe } = rows[0].credentials;
    return res.json({ ...safe, lastSyncedAt: rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/microsoft/credentials
router.post('/credentials', async (req, res) => {
  try {
    const { tenantId, clientId, clientSecret } = req.body;
    if (!tenantId || !clientId || !clientSecret)
      return res.status(400).json({ message: 'tenantId, clientId and clientSecret are required' });

    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ('microsoft', $1, NOW())
       ON CONFLICT (integration) DO UPDATE SET credentials = EXCLUDED.credentials, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify({ tenantId, clientId, clientSecret })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/microsoft/sync
router.post('/sync', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'microsoft' LIMIT 1"
    );
    if (!rows[0])
      return res.status(400).json({ message: 'Microsoft not configured. Save credentials first.' });

    const { tenantId, clientId, clientSecret } = rows[0].credentials;

    // Graph token — required
    let accessToken;
    try {
      accessToken = await getMicrosoftToken(tenantId, clientId, clientSecret);
    } catch (err) {
      const msg = err.response?.data?.error_description || err.message;
      return res.status(401).json({ message: `Token fetch failed: ${msg}` });
    }

    // Mgmt + Defender tokens — non-fatal if missing
    let mgmtToken = null;
    let defenderToken = null;
    try { mgmtToken = await getMgmtToken(tenantId, clientId, clientSecret); } catch (_) { }
    try { defenderToken = await getDefenderToken(tenantId, clientId, clientSecret); } catch (_) { }

    const results = await Promise.allSettled(
      ENDPOINTS.map(async (ep) => {
        let data, error;

        if (ep.mgmt) {
          if (!mgmtToken) return { key: ep.key, ok: true, error: null, skipped: true };
          ({ data, error } = await fetchMgmtSubscriptions(tenantId, mgmtToken));
          if (error) return { key: ep.key, ok: true, error: null, skipped: true }; // non-fatal
        } else if (ep.defender) {
          if (!defenderToken) return { key: ep.key, ok: true, error: null, skipped: true };
          ({ data, error } = await fetchEndpoint(defenderToken, ep.path, ep.base, ep.optional));
          if (error) return { key: ep.key, ok: true, error: null, skipped: true }; // non-fatal
        } else {
          ({ data, error } = await fetchEndpoint(accessToken, ep.path, ep.base, ep.optional));
        }

        if (error) return { key: ep.key, ok: false, error };
        try {
          await upsertTable(req.orgPool, ep.table, data);
          return { key: ep.key, ok: true, error: null };
        } catch (dbErr) {
          return { key: ep.key, ok: false, error: `DB write failed: ${dbErr.message}` };
        }
      })
    );

    await req.orgPool.query(
      "UPDATE integration_credentials SET updated_at = NOW() WHERE integration = 'microsoft'"
    );

    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { key: '?', ok: false, error: r.reason?.message }
    );
    const failed = summary.filter((s) => !s.ok);
    const skipped = summary.filter((s) => s.ok && s.skipped);
    const synced = summary.filter((s) => s.ok && !s.skipped);

    res.json({
      success: true,
      message: `Synced ${synced.length}/${summary.length} endpoints${skipped.length ? ` (${skipped.length} skipped — token not configured)` : ''}`,
      syncedAt: new Date().toISOString(),
      results: summary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/microsoft/data
router.get('/data', async (req, res) => {
  try {
    const out = {};
    await Promise.all(
      ENDPOINTS.map(async (ep) => {
        try {
          const { rows } = await req.orgPool.query(
            `SELECT data, synced_at FROM ${ep.table} ORDER BY synced_at DESC LIMIT 1`
          );
          out[ep.key] = rows[0] ? { data: rows[0].data, syncedAt: rows[0].synced_at } : null;
        } catch (tableErr) {
          out[ep.key] = null;
        }
      })
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/microsoft/data/:key
router.get('/data/:key', async (req, res) => {
  const ep = ENDPOINTS.find((e) => e.key === req.params.key);
  if (!ep) return res.status(404).json({ message: 'Unknown key' });
  try {
    const { rows } = await req.orgPool.query(
      `SELECT data, synced_at FROM ${ep.table} ORDER BY synced_at DESC LIMIT 1`
    );
    if (!rows[0]) return res.json({ data: null });
    res.json({ data: rows[0].data, syncedAt: rows[0].synced_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
