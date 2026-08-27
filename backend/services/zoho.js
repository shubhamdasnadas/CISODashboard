const { getOrgPool } = require('../db');

const ZOHO_REDIRECT_URI = 'https://www.zylker.com/oauthgrant';
// Optional refresh token from the environment. If set, the cron uses the
// `refresh_token` grant directly — fully autonomous, no single-use code needed.
// Obtain one once via a Zoho OAuth consent that returns a refresh_token and set
// ZOHO_REFRESH_TOKEN in backend/.env.
const ZOHO_ENV_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';

/**
 * Get a Zoho access token for the cron sync.
 *
 * The stored `zoho` credentials are populated via the Settings panel, which saves
 * an authorization `code` (single-use) — NOT a refresh token. So we prefer the
 * `authorization_code` grant to match the manual sync flow in routes/zoho.js.
 *
 * If the stored credentials DO contain a `refreshToken` (persisted here after a
 * successful code exchange), we use the `refresh_token` grant instead, which lets
 * the cron keep running without needing a fresh code every time.
 *
 * When a refresh token comes back from Zoho, we persist it onto the `zoho`
 * credentials row so subsequent runs reuse it.
 *
 * @param {Object} creds - { clientId, clientSecret, code?, refreshToken?, redirectUri?, dc? }
 * @param {string} orgSlug - org slug (needed to persist a refresh token)
 * @returns {Promise<{accessToken:string, refreshToken?:string}>}
 */
async function getZohoAccessToken(creds, orgSlug) {
  const dc = creds.dc || 'in';
  const tokenUrl = `https://accounts.zoho.${dc}/oauth/v2/token`;

  // Prefer a refresh token: env var first, then one persisted from a prior code
  // exchange. Falls back to the single-use authorization `code` last.
  const refreshToken = creds.refreshToken || ZOHO_ENV_REFRESH_TOKEN || '';

  const params = new URLSearchParams();
  let grant;
  if (refreshToken) {
    grant = 'refresh_token';
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
  } else if (creds.code) {
    grant = 'authorization_code';
    params.append('grant_type', 'authorization_code');
    params.append('code', creds.code);
    params.append('redirect_uri', creds.redirectUri || ZOHO_REDIRECT_URI);
  } else {
    throw new Error('Zoho credentials missing both refreshToken and authorization code');
  }
  params.append('client_id', creds.clientId);
  params.append('client_secret', creds.clientSecret);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Zoho token exchange failed (${res.status}, grant=${grant}): ${JSON.stringify(data)}`);
  }

  // Persist a freshly-issued refresh token so future cron runs don't need a new
  // (single-use) code. Harmless no-op if Zoho didn't return one.
  if (data.refresh_token && orgSlug) {
    try {
      const pool = getOrgPool(orgSlug);
      const { rows } = await pool.query(
        "SELECT credentials FROM integration_credentials WHERE integration = 'zoho' LIMIT 1"
      );
      const existing = rows[0]?.credentials || {};
      if (existing.refreshToken !== data.refresh_token) {
        await pool.query(
          `INSERT INTO integration_credentials (integration, credentials, updated_at)
           VALUES ('zoho', $1, NOW())
           ON CONFLICT (integration) DO UPDATE SET
             credentials = EXCLUDED.credentials,
             updated_at  = EXCLUDED.updated_at`,
          [JSON.stringify({ ...existing, refreshToken: data.refresh_token })]
        );
        console.log(`[Zoho sync][org=${orgSlug}] persisted refresh token for future cron runs`);
      }
    } catch (e) {
      console.warn(`[Zoho sync][org=${orgSlug}] could not persist refresh token: ${e.message}`);
    }
  }

  return { accessToken: data.access_token, refreshToken: data.refresh_token || creds.refreshToken };
}

/**
 * Sync Zoho tickets for an organization.
 * @param {string} orgSlug - Organization slug
 * @param {Object} creds - Zoho credentials
 * @returns {Promise<Object>} - Sync result with fetched, upserted, totalInDb counts
 */
async function syncZohoTickets(orgSlug, creds) {
  const pool = getOrgPool(orgSlug);

  // Get access token from the stored code (or previously-persisted refresh token).
  let accessToken;
  try {
    ({ accessToken } = await getZohoAccessToken(creds, orgSlug));
  } catch (e) {
    // No usable credential (e.g. the single-use code was already consumed and no
    // refresh token was captured). Don't hard-fail the cron — serve the last good
    // cached tickets (looked up under either row name this code base uses) so the
    // dashboard keeps showing data instead of erroring every 2 minutes.
    const { rows } = await pool.query(
      "SELECT data FROM zohotable WHERE data_name IN ('tickets','ticket_data') ORDER BY updated_at DESC LIMIT 1"
    );
    const cached = rows[0]?.data;
    if (cached) {
      const arr = Array.isArray(cached) ? cached : (Array.isArray(cached.data) ? cached.data : []);
      console.warn(`[Zoho sync][org=${orgSlug}] token exchange failed (${e.message}) — serving cached tickets (stale, ${arr.length} rows)`);
      return {
        fetched: 0,
        totalInDb: arr.length,
        syncedAt: new Date().toISOString(),
        stale: true,
        error: e.message,
      };
    }
    throw e;
  }

  const domain = creds.domain || `https://desk.zoho.${creds.dc || 'in'}`;
  const orgId = creds.orgId;

  const allTickets = [];
  let page = 1;
  const limit = 100;

  // Paginate through tickets
  while (true) {
    const url = `${domain}/api/v1/tickets?include=contacts,assignee,departments,team,isRead&limit=${limit}&page=${page}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        orgId,
        Accept: 'application/json',
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Zoho API failed (page ${page}, ${res.status}): ${JSON.stringify(data)}`);
    }

    if (!data) {
      throw new Error('Empty response from Zoho API');
    }

    const tickets = data.data || [];
    allTickets.push(...tickets);

    // Break if we've fetched all available tickets
    if (tickets.length < limit || page >= (data.pageCount || 1)) {
      break;
    }

    page++;
  }

  // Store tickets in zohotable.
  // Two different readers expect two different data_name values historically:
  //   - 'ticket_data' is what the frontend (/api/zoho/tickets-db) and the Zoho
  //     dashboard widgets (Topperformance, Funneldiagram, etc.) read.
  //   - 'tickets' is what /compliance-health-scores/ticketing (Ticketingmttr) reads.
  // The UNIQUE constraint on data_name means they are two separate rows, so we
  // write the same payload under BOTH names. This keeps every consumer populated
  // without changing any reader, fixing the "all Zoho widgets empty" symptom.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zohotable (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      data_name  TEXT        NOT NULL UNIQUE,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const payload = JSON.stringify(allTickets);
  for (const name of ['tickets', 'ticket_data']) {
    await pool.query(
      `INSERT INTO zohotable (data_name, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (data_name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [name, payload]
    );
  }

  // Get total count from DB
  const { rows } = await pool.query('SELECT COUNT(*) FROM zohotable WHERE data_name = $1', ['tickets']);
  const totalInDb = parseInt(rows[0].count, 10);

  console.log(`[Zoho sync][org=${orgSlug}] Fetched ${allTickets.length} tickets, total in DB: ${totalInDb}`);

  return {
    fetched: allTickets.length,
    totalInDb,
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { syncZohoTickets, getZohoAccessToken };