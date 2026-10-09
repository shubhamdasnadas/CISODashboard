const { centralPool, getOrgPool } = require('../db');
const redis = require('../lib/redis');

/**
 * syncService — cache-aside read + write-through sync for the multi-tenant
 * CISO dashboard.
 *
 * Data flow for a write job (cron / webhook / manual):
 *   external API ─► syncAndCache(orgSlug, resourceKey)
 *                    ├─ fetch fresh payload from the integration
 *                    ├─ BEGIN; upsert into api_cache_data (central) ; COMMIT
 *                    └─ SET cache:<orgSlug>:<resourceKey> <ttl>   (Redis mirror)
 *
 * Data flow for a read route (GET /api/:resourceKey):
 *   Redis GET cache:<orgSlug>:<key>
 *     ├─ HIT  → return { source: 'redis' }
 *     └─ MISS → SELECT from api_cache_data (NEVER calls external API here)
 *               → repopulate Redis → return { source: 'postgres' }
 *
 * Separate credential-aware sync services (sentinelone/harmony/firewall/zoho)
 * are reused so we don't duplicate API logic.
 */

// ── Resource registry ────────────────────────────────────────────────────────
// Each resource declares: a TTL (seconds) for its Redis mirror, and a fetcher
// that returns the fresh payload. Fetchers run ONLY inside sync jobs — never
// inside read routes.
const RESOURCES = {
  'sentinelone-agents': { ttl: 300, fetcher: fetchSentinelOneAgents },
  'sentinelone-cves':   { ttl: 300, fetcher: fetchSentinelOneCves },
  'sentinelone-threats': { ttl: 300, fetcher: fetchSentinelOneAgents },
  'sentinelone-custom-alerts': { ttl: 300, fetcher: fetchSentinelOneCustomAlerts },
  'harmony-events':     { ttl: 300, fetcher: fetchHarmonyEvents },
  'firewall-reports':   { ttl: 300, fetcher: fetchFirewallReports },
  'zoho-tickets':       { ttl: 900, fetcher: fetchZohoTickets },
  // Whole-dashboard snapshot (covers the aggregate stat cards + all widgets).
  'dashboard-aggregate': { ttl: 120, fetcher: fetchDashboardAggregate },
  // Whole-analytics snapshot (covers all modules on the Analytics page).
  'analytics-aggregate': { ttl: 120, fetcher: fetchAnalyticsAggregate },
  // News sections.
  'news':               { ttl: 900, fetcher: fetchNews },
};

function getResource(resourceKey) {
  const r = RESOURCES[resourceKey];
  if (!r) throw new Error(`Unknown cache resource: ${resourceKey}`);
  return r;
}

// ── External fetchers (called only from sync jobs) ───────────────────────────

async function readCreds(orgSlug, integration) {
  const pool = getOrgPool(orgSlug);
  const { rows } = await pool.query(
    "SELECT credentials FROM integration_credentials WHERE integration = $1 LIMIT 1",
    [integration]
  );
  return rows[0]?.credentials || null;
}

async function fetchSentinelOneAgents(orgSlug) {
  const { syncSentinelOne } = require('./sentinelone');
  const creds = await readCreds(orgSlug, 'sentinelone');
  if (!creds) throw new Error('SentinelOne not configured');
  const r = await syncSentinelOne(orgSlug, creds);
  return { agents: r.agents, threats: r.threats, syncedAt: new Date().toISOString() };
}

async function fetchSentinelOneCves(orgSlug) {
  const { syncSentinelOne } = require('./sentinelone');
  const creds = await readCreds(orgSlug, 'sentinelone');
  if (!creds) throw new Error('SentinelOne not configured');
  const r = await syncSentinelOne(orgSlug, creds);
  return { applicationCve: r.applicationCve, syncedAt: new Date().toISOString() };
}

async function fetchSentinelOneCustomAlerts(orgSlug) {
  const { syncCustomAlerts } = require('./sentinelone');
  const creds = await readCreds(orgSlug, 'sentinelone');
  if (!creds) throw new Error('SentinelOne not configured');
  const r = await syncCustomAlerts(orgSlug, creds);
  return { alerts: r.alerts, syncedAt: new Date().toISOString() };
}

async function fetchHarmonyEvents(orgSlug) {
  const { syncHarmony } = require('./harmony');
  const creds = await readCreds(orgSlug, 'harmony');
  if (!creds) throw new Error('Harmony not configured');
  const r = await syncHarmony(orgSlug, creds);
  return { events: r.events || r, syncedAt: new Date().toISOString() };
}

async function fetchFirewallReports(orgSlug) {
  const { syncFirewall } = require('./firewall');
  const creds = await readCreds(orgSlug, 'firewall');
  if (!creds) throw new Error('Firewall not configured');
  const r = await syncFirewall(orgSlug, creds);
  return { reports: r.reports || r, syncedAt: new Date().toISOString() };
}

async function fetchZohoTickets(orgSlug) {
  const { syncZohoTickets } = require('./zoho');
  const creds = await readCreds(orgSlug, 'zoho');
  if (!creds) throw new Error('Zoho not configured');
  const r = await syncZohoTickets(orgSlug, creds);
  return { tickets: r.totalInDb, fetched: r.fetched, syncedAt: new Date().toISOString() };
}

// Techsec NMS: SD-WAN/Zabbix via sdwan_poller.py.
// NOT WIRED YET — there is no sdwan_poller.py in this repo, so the
// `sdwan-zabbix` resource is intentionally NOT registered. When the poller
// exists, add the resource back to RESOURCES above and use a fetcher like:
//
//   async function fetchSdwanZabbix(orgSlug) {
//     const fs = require('fs');
//     const path = require('path');
//     const outFile = process.env.SDWAN_POLLER_OUTPUT ||
//       path.join(__dirname, '..', 'nms', `${orgSlug}-sdwan.json`);
//     const raw = fs.readFileSync(outFile, 'utf8');
//     return { data: JSON.parse(raw), syncedAt: new Date().toISOString() };
//   }
//
// No external API call is ever made from a read route regardless.

// Whole-dashboard snapshot — mirrors the /api/dashboard/aggregate response so
// the main stat cards + every widget can be served from the cache. Reads the
// per-org tables directly (no external call); the S1/Harmony/FW/Zoho/MDM pieces are
// already kept fresh by their own cron syncs, so this is a fast DB aggregation.
async function fetchDashboardAggregate(orgSlug) {
  const pool = getOrgPool(orgSlug);
  const [
    threatsRows, agentsRows, appAgentRows, appCveRows,
    deviceControlRows, rssRows, customAlertRows, harmonyRows, fwWidgetsRows,
    zohoRows, hexnodeRows,
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

  // Per-tool current vs previous-month counts (delta drives the badge).
  const allTools = await buildAllToolsSnapshot(pool);

  let tickets = [];
  if (zohoRows.rows[0]?.data) {
    const raw = zohoRows.rows[0].data;
    tickets = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  }

  const devices = hexnodeRows.rows.map((r) => r.data).filter(Boolean);

  // NOTE: the per-user dashboard_layout is intentionally excluded here — it is
  // user-specific and fetched live from the DB on the client, not cached
  // org-wide. Everything else (shared widget data) is cached.
  return {
    sentinelone: {
      threats: threatsRows.rows.map((r) => r.data),
      agents: agentsRows.rows.map((r) => r.data),
      applicationAgent: appAgentRows.rows.map((r) => r.data),
      applicationCve: appCveRows.rows.map((r) => r.data),
      deviceControl: deviceControlRows.rows.map((r) => r.data),
      rss: rssRows.rows.map((r) => r.data),
      customAlerts: customAlertRows.rows.map((r) => r.data),
    },
    harmony: { events: harmonyRows.rows },
    firewall: { widgets: fwWidgetsRows.rows },
    ticketing: { tickets },
    mdm: { devices },
    allTools,
    syncedAt: new Date().toISOString(),
  };
}

// Same shape as the route's helper — used by the cache fetcher so the
// dashboard-aggregate snapshot always carries current vs previous month counts.
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

// News sections — reads the latest stored articles per query term. The news
// route itself calls NewsAPI when stale; here we just mirror the stored cache
// so the dashboard news widgets can be served from Redis.
async function fetchNews(orgSlug) {
  const pool = getOrgPool(orgSlug);
  const { rows } = await pool.query(
    `SELECT query_term, MAX(fetched_at) AS last_fetched FROM news_articles
       GROUP BY query_term ORDER BY last_fetched DESC NULLS LAST LIMIT 20`
  );
  const terms = rows.map((r) => r.query_term);
  const byTerm = {};
  for (const term of terms) {
    const r = await pool.query(
      'SELECT source_name, author, title, description, url, url_to_image, published_at FROM news_articles WHERE query_term = $1 ORDER BY published_at DESC LIMIT 20',
      [term]
    );
    byTerm[term] = r.rows;
  }
  return { terms, byTerm, syncedAt: new Date().toISOString() };
}

function toArray(v) {
  if (!v) return null;
  return Array.isArray(v) ? v : [v];
}

function extractFirewallTableHelper(raw) {
  if (!raw) return null;
  try {
    const entry =
      toArray(raw?.report?.result?.entry) ||
      toArray(raw?.report?.result?.report?.entry) ||
      toArray(raw?.response?.result?.report?.entry) ||
      toArray(raw?.response?.result?.entry) ||
      toArray(raw?.result?.report?.entry) ||
      toArray(raw?.result?.entry) ||
      toArray(raw?.entry);
    if (entry && entry.length > 0) {
      const colSet = new Set();
      entry.forEach((item) => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach((k) => {
            if (k === '@name') colSet.add('name');
            else if (!k.startsWith('@')) colSet.add(k);
          });
        }
      });
      const columns = Array.from(colSet);
      const rows = entry.map((item) => {
        const row = {};
        columns.forEach((col) => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] = typeof value === 'object' && value !== null && '#text' in value ? value['#text'] : (value ?? '');
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) {
      return { columns: Array.from(new Set(raw.flatMap((item) => Object.keys(item || {})))), rows: raw };
    }
  } catch { /* ignore */ }
  return null;
}

// Whole-analytics snapshot — aggregates all data required by the Analytics page
// into a single cached JSON payload so the entire Analytics view renders in < 1s.
async function fetchAnalyticsAggregate(orgSlug) {
  const pool = getOrgPool(orgSlug);

  const FW_REPORT_NAMES = [
    'risk-trend', 'top-attacker-sources', 'top-attacker-destinations',
    'top-denied-destinations', 'top-denied-sources',
    'top-attacks', 'top-connections',
    'bandwidth-trend', 'threat-summary', 'blocked-websites',
  ];

  const MS_TABLES = [
    { key: 'organization', table: 'ms_organization' },
    { key: 'subscribedSkus', table: 'ms_subscribed_skus' },
    { key: 'domains', table: 'ms_domains' },
    { key: 'users', table: 'ms_users' },
    { key: 'auditSignIns', table: 'ms_audit_sign_ins' },
    { key: 'auditDirectory', table: 'ms_audit_directory' },
    { key: 'auditProvisioning', table: 'ms_audit_provisioning' },
    { key: 'riskyUsers', table: 'ms_risky_users' },
    { key: 'riskDetections', table: 'ms_risk_detections' },
    { key: 'riskyServicePrincipals', table: 'ms_risky_service_principals' },
    { key: 'securityIncidents', table: 'ms_security_incidents' },
    { key: 'securityAlerts', table: 'ms_security_alerts' },
    { key: 'secureScores', table: 'ms_secure_scores' },
    { key: 'secureScoreProfiles', table: 'ms_secure_score_profiles' },
    { key: 'managedDevices', table: 'ms_managed_devices' },
    { key: 'compliancePolicies', table: 'ms_compliance_policies' },
    { key: 'deviceConfigurations', table: 'ms_device_configurations' },
    { key: 'applications', table: 'ms_applications' },
    { key: 'servicePrincipals', table: 'ms_service_principals' },
    { key: 'serviceHealth', table: 'ms_service_health' },
    { key: 'serviceIssues', table: 'ms_service_issues' },
    { key: 'purviewTrigger', table: 'ms_purview_trigger' },
    { key: 'purviewLabels', table: 'ms_purview_label' },
    { key: 'mgmtActivitySubscriptions', table: 'ms_mgmt_activity_subscriptions' },
    { key: 'defenderMachines', table: 'ms_defender_machines' },
    { key: 'defenderAlerts', table: 'ms_defender_alerts' },
    { key: 'defenderVulnerabilities', table: 'ms_defender_vulnerabilities' },
    { key: 'defenderRecommendations', table: 'ms_defender_recommendations' },
    { key: 'defenderSoftware', table: 'ms_defender_software' },
    { key: 'defenderIndicators', table: 'ms_defender_indicators' },
    { key: 'defenderInvestigations', table: 'ms_defender_investigations' },
    { key: 'defenderLibraryFiles', table: 'ms_defender_library_files' },
  ];

  const [
    agentsRows, cvesRows, threatsRows,
    devicesRows, appsRows,
    cpRows,
    fwRows,
    zohoRows,
  ] = await Promise.all([
    pool.query('SELECT data FROM s1_agents ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT data FROM s1_application_cve ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT data FROM s1_threats ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT data FROM hexnode_devices ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT data FROM hexnode_applications ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT * FROM checkpoint_events ORDER BY synced_at DESC').catch(() => ({ rows: [] })),
    pool.query('SELECT report_name, data FROM firewall_reports').catch(() => ({ rows: [] })),
    pool.query("SELECT data FROM zohotable WHERE data_name = 'ticket_data' LIMIT 1").catch(() => ({ rows: [] })),
  ]);

  const fwReportMap = {};
  for (const r of fwRows.rows) {
    if (r.report_name) fwReportMap[r.report_name] = r.data;
  }
  const fwReports = FW_REPORT_NAMES.map((name) => {
    const raw = fwReportMap[name] || null;
    const table = extractFirewallTableHelper(raw);
    return { report: name, rows: table?.rows ?? [], columns: table?.columns ?? [] };
  });

  let zohoTickets = [];
  if (zohoRows.rows[0]?.data) {
    const raw = zohoRows.rows[0].data;
    zohoTickets = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  }

  const mapCpEvent = (e) => {
    const ad = e.additional_data || e.additionalData || {};
    return {
      eventId: e.event_id, type: e.type, state: e.state, severity: e.severity,
      description: e.description, senderAddress: e.sender_address,
      receiverAddress: ad.receiver_address || ad.recipient_address || ad.receiverAddress || ad.recipientAddress || ad.to || null,
      subject: ad.subject || ad.email_subject || ad.mail_subject || null,
      threatType: e.threat_type || ad.threat_type || null,
      mitigation: e.mitigation_action || ad.mitigation_action || null,
      confidenceIndicator: (e.confidence_indicator ?? ad.confidence_indicator ?? ad.confidenceIndicator ?? e.threat_confidence ?? ad.threat_confidence ?? null) || null,
      platform: e.mail_domain ?? e.platform ?? ad.platform ?? e.saas ?? ad.mail_domain ?? null,
      eventCreated: e.event_created, saas: e.saas,
    };
  };
  const cpEvents = cpRows.rows.map(mapCpEvent);

  const msData = {};
  await Promise.all(
    MS_TABLES.map(async (ep) => {
      try {
        const { rows } = await pool.query(
          `SELECT data, synced_at FROM ${ep.table} ORDER BY synced_at DESC LIMIT 1`
        );
        msData[ep.key] = rows[0] ? { data: rows[0].data, syncedAt: rows[0].synced_at } : null;
      } catch {
        msData[ep.key] = null;
      }
    })
  );

  return {
    agents: agentsRows.rows.map((r) => r.data),
    cves: cvesRows.rows.map((r) => r.data),
    threats: threatsRows.rows.map((r) => r.data),
    devices: devicesRows.rows.map((r) => r.data),
    apps: appsRows.rows.map((r) => r.data),
    cpEvents,
    fwReports,
    zohoTickets,
    msData,
    syncedAt: new Date().toISOString(),
  };
}

// ── Distributed lock (prevents duplicate sync runs across instances) ──────────

/**
 * Acquire a Redis lock: SET lock:<orgSlug>:<key> <token> NX EX <ttl>.
 * Returns true if acquired, false if already held by another instance.
 */
async function acquireLock(orgSlug, resourceKey, ttlSeconds = 600) {
  const client = await redis.getRedisClient();
  if (!client) return true; // no Redis → allow (single-instance safety)
  const lockKey = redis.buildLockKey(orgSlug, resourceKey);
  const token = `${Date.now()}-${process.pid}`;
  try {
    const ok = await client.set(lockKey, token, { NX: true, EX: ttlSeconds });
    return ok === 'OK';
  } catch {
    return true; // tolerate Redis errors → allow the job
  }
}

async function releaseLock(orgSlug, resourceKey) {
  const client = await redis.getRedisClient();
  if (!client) return;
  try {
    await client.del(redis.buildLockKey(orgSlug, resourceKey));
  } catch { /* ignore */ }
}

// ── Core write-through sync ────────────────────────────────────────────────────

/**
 * Fetch fresh data for (orgSlug, resourceKey), upsert into Postgres inside a
 * transaction, then mirror into Redis with the resource's TTL.
 * Returns { source: 'sync', orgSlug, resourceKey, updatedAt }.
 *
 * @param {string} orgSlug  server-resolved tenant slug (NEVER client input)
 * @param {string} resourceKey  one of RESOURCES keys
 */
async function syncAndCache(orgSlug, resourceKey) {
  if (!orgSlug) throw new Error('syncAndCache: orgSlug is required (tenant isolation)');
  const resource = getResource(resourceKey);

  // Distributed lock: skip if another instance is already syncing this key.
  const locked = await acquireLock(orgSlug, resourceKey);
  if (!locked) {
    console.warn(`[sync][org=${orgSlug}] skip ${resourceKey} — lock held by another instance`);
    return { source: 'skip-locked', orgSlug, resourceKey };
  }

  let client = null;
  try {
    const payload = await resource.fetcher(orgSlug);

    // Transactional upsert into the durable table.
    const tx = await centralPool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(
        `INSERT INTO api_cache_data (org_slug, resource_key, payload, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (org_slug, resource_key) DO UPDATE SET
           payload    = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        [orgSlug, resourceKey, JSON.stringify(payload)]
      );
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }

    // Mirror into Redis (best-effort; app works without it).
    client = await redis.getRedisClient();
    if (client) {
      const cacheKey = redis.buildCacheKey(orgSlug, resourceKey);
      await client.set(cacheKey, JSON.stringify(payload), { EX: resource.ttl });
    }

    console.log(`[sync][org=${orgSlug}] cached ${resourceKey} (ttl=${resource.ttl}s)`);
    return { source: 'sync', orgSlug, resourceKey, updatedAt: new Date().toISOString() };
  } catch (err) {
    console.error(`[sync][org=${orgSlug}] ${resourceKey} failed:`, err.message);
    throw err;
  } finally {
    await releaseLock(orgSlug, resourceKey);
  }
}

// ── Cache-aside read (used by GET /api/:resourceKey) ──────────────────────────

/**
 * Read a cached resource for an org. Redis first (source: 'redis'), then
 * Postgres fallback (source: 'postgres', repopulates Redis). NEVER calls an
 * external API from here.
 * Returns { source, orgSlug, resourceKey, payload, updatedAt }.
 */
async function readCached(orgSlug, resourceKey) {
  if (!orgSlug) throw new Error('readCached: orgSlug is required (tenant isolation)');
  getResource(resourceKey); // validate resourceKey exists

  const client = await redis.getRedisClient();
  if (client) {
    try {
      const cacheKey = redis.buildCacheKey(orgSlug, resourceKey);
      const hit = await client.get(cacheKey);
      if (hit) {
        return {
          source: 'redis',
          orgSlug,
          resourceKey,
          payload: JSON.parse(hit),
          updatedAt: null,
        };
      }
    } catch (e) {
      console.error(`[cache][org=${orgSlug}] redis read error:`, e.message);
    }
  }

  // MISS → Postgres (durable source of truth), then repopulate Redis.
  const { rows } = await centralPool.query(
    `SELECT payload, updated_at FROM api_cache_data
       WHERE org_slug = $1 AND resource_key = $2 LIMIT 1`,
    [orgSlug, resourceKey]
  );
  if (rows.length === 0) {
    return { source: 'miss', orgSlug, resourceKey, payload: null, updatedAt: null };
  }

  const row = rows[0];
  if (client) {
    try {
      const cacheKey = redis.buildCacheKey(orgSlug, resourceKey);
      const ttl = getResource(resourceKey).ttl;
      await client.set(cacheKey, JSON.stringify(row.payload), { EX: ttl });
    } catch { /* ignore repopulate failure */ }
  }

  return {
    source: 'postgres',
    orgSlug,
    resourceKey,
    payload: row.payload,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns every resource key registered for sync (used by the scheduler).
 */
function listResourceKeys() {
  return Object.keys(RESOURCES);
}

module.exports = {
  RESOURCES,
  listResourceKeys,
  syncAndCache,
  readCached,
  acquireLock,
  releaseLock,
};
