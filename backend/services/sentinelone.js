const { getOrgPool } = require('../db');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllPages(baseUrl, apiToken, endpoint, extraParams = {}) {
  const all = [];
  let cursor = null;

  do {
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

    let res = null;
    for (let retry = 0; retry <= 5; retry++) {
      res = await fetch(url.toString(), {
        headers: { Authorization: `ApiToken ${apiToken}`, Accept: 'application/json' },
      });
      if (res.status !== 429) break;
      const wait =
        Number(res.headers.get('retry-after') || 0) * 1000 ||
        3000 * Math.pow(2, retry);
      console.warn(`[S1 sync] 429 — waiting ${wait}ms`);
      await sleep(wait);
    }

    if (!res || !res.ok) {
      const body = await res?.text();
      throw new Error(`S1 API ${res?.status}: ${body?.slice(0, 200)}`);
    }

    const json = await res.json();
    all.push(...(json?.data ?? []));
    cursor = json?.pagination?.nextCursor ?? null;
    if (cursor) await sleep(300);
  } while (cursor);

  return all;
}

async function syncCustomAlerts(orgSlug, creds) {
  const baseUrl = (creds.baseUrl || process.env.S1_BASE_URL)?.replace(/\/$/, '');
  const apiToken = creds.tokenKey;

  if (!baseUrl || !apiToken) {
    throw new Error('SentinelOne not configured — provide tokenKey/baseUrl');
  }

  const pool = getOrgPool(orgSlug);

  console.log(`[S1 custom-alerts][org=${orgSlug}] Fetching cloud detection alerts...`);
  const extraParams = {};
  if (creds.accountId) extraParams.accountIds = creds.accountId;
  const alerts = await fetchAllPages(baseUrl, apiToken, '/web/api/v2.1/cloud-detection/alerts', extraParams);
  console.log(`[S1 custom-alerts][org=${orgSlug}] Got ${alerts.length} alerts`);

  if (alerts.length > 0) {
    await pool.query('TRUNCATE TABLE s1_custome_alert');
    for (const a of alerts) {
      const id = a.id || a.alertId || null;
      await pool.query(
        `INSERT INTO s1_custome_alert (alert_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (alert_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
        [id, JSON.stringify(a)]
      );
    }
  }

  console.log(`[S1 custom-alerts][org=${orgSlug}] Done.`);
  return { alerts: alerts.length, syncedAt: new Date().toISOString() };
}

async function syncSentinelOne(orgSlug, creds) {
  const baseUrl = (creds.baseUrl || process.env.S1_BASE_URL)?.replace(/\/$/, '');
  const apiToken = creds.tokenKey;

  if (!baseUrl || !apiToken) {
    throw new Error('SentinelOne not configured — provide tokenKey/baseUrl');
  }

  const pool = getOrgPool(orgSlug);

  console.log(`[S1 sync][org=${orgSlug}] Fetching threats...`);
  const threats = await fetchAllPages(baseUrl, apiToken, '/web/api/v2.1/threats');
  console.log(`[S1 sync][org=${orgSlug}] Got ${threats.length} threats`);

  console.log(`[S1 sync][org=${orgSlug}] Fetching agents...`);
  const agents = await fetchAllPages(baseUrl, apiToken, '/web/api/v2.1/agents');
  console.log(`[S1 sync][org=${orgSlug}] Got ${agents.length} agents`);

  console.log(`[S1 sync][org=${orgSlug}] Fetching application CVE risks...`);
  let cves = [];
  try {
    const cveParams = creds.accountId ? { accountIds: creds.accountId } : {};
    cves = await fetchAllPages(baseUrl, apiToken, '/web/api/v2.1/application-management/risks', cveParams);
    console.log(`[S1 sync][org=${orgSlug}] Got ${cves.length} CVE risk records`);
  } catch (e) {
    console.warn(`[S1 sync][org=${orgSlug}] CVE risks fetch failed (non-fatal): ${e.message}`);
  }

  await pool.query('TRUNCATE TABLE s1_threats');
  for (const t of threats) {
    const id = t.id || null;
    await pool.query(
      `INSERT INTO s1_threats (threat_id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (threat_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
      [id, JSON.stringify(t)]
    );
  }

  const fetchedAgentIds = new Set(agents.map(a => String(a.id)).filter(Boolean));
  for (const a of agents) {
    const id = a.id || null;
    await pool.query(
      `INSERT INTO s1_agents (agent_id, data, removed_at)
       VALUES ($1, $2::jsonb, NULL)
       ON CONFLICT (agent_id) DO UPDATE
         SET data = EXCLUDED.data, synced_at = NOW(), removed_at = NULL`,
      [id, JSON.stringify(a)]
    );
  }
  if (fetchedAgentIds.size > 0) {
    await pool.query(
      `UPDATE s1_agents SET removed_at = NOW()
       WHERE removed_at IS NULL AND NOT (agent_id = ANY($1::text[]))`,
      [Array.from(fetchedAgentIds)]
    );
  }

  console.log(`[S1 sync][org=${orgSlug}] Fetching installed applications...`);
  let installedApps = [];
  let installedAppsError = null;
  try {
    const installedAppsParams = creds.accountId ? { accountIds: creds.accountId } : {};
    installedApps = await fetchAllPages(baseUrl, apiToken, '/web/api/v2.1/installed-applications', installedAppsParams);
    console.log(`[S1 sync][org=${orgSlug}] Got ${installedApps.length} installed app records`);
    if (installedApps.length > 0) {
      await pool.query('TRUNCATE TABLE s1_application_agent');
      for (const app of installedApps) {
        const id = String(app.id || `${app.agentId || ''}_${app.name || ''}_${app.version || ''}`);
        await pool.query(
          `INSERT INTO s1_application_agent (app_agent_id, data)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (app_agent_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
          [id, JSON.stringify(app)]
        );
      }
    }
  } catch (e) {
    installedAppsError = e.message;
    console.warn(`[S1 sync][org=${orgSlug}] Installed apps fetch failed (non-fatal): ${e.message}`);
  }

  if (cves.length > 0) {
    await pool.query('TRUNCATE TABLE s1_application_cve');
    for (const c of cves) {
      const id = c.applicationId || c.id || c.cveId || null;
      await pool.query(
        `INSERT INTO s1_application_cve (cve_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (cve_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
        [id, JSON.stringify(c)]
      );
    }
  }

  console.log(`[S1 sync][org=${orgSlug}] Done.`);
  return {
    threats: threats.length,
    agents: agents.length,
    cves: cves.length,
    installedApps: installedApps.length,
    installedAppsError: installedAppsError || null,
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { syncSentinelOne, syncCustomAlerts };
