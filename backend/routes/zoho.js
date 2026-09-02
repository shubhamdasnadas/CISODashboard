const express = require('express');
const router = express.Router();

const ZOHO_CLIENT_ID     = '1000.J3CKPA2EZY8R02USWHPEWQVA7NGJJR';
const ZOHO_CLIENT_SECRET = 'f90d167c12050cc341e62a3e24cf2c762af0cec441';
const ZOHO_REDIRECT_URI  = 'https://www.zylker.com/oauthgrant';
const ZOHO_ORG_ID        = '60021258041';
const ZOHO_DOMAIN        = 'https://desk.zoho.in';

// Update this code when it expires (single-use OAuth authorization code)
const ZOHO_CODE = '1000.368495fba5640598374e5aec098a9c4f.fb2da326ff8552252ee370a8017c928b';

// Reads stored per-org Zoho credentials, falling back to the hardcoded
// defaults above for any field not yet configured via the Settings panel.
async function getZohoCredentials(pool) {
  const { rows } = await pool.query(
    "SELECT credentials FROM integration_credentials WHERE integration = 'zoho' LIMIT 1"
  );
  const stored = rows[0]?.credentials || {};
  return {
    clientId: stored.clientId || ZOHO_CLIENT_ID,
    clientSecret: stored.clientSecret || ZOHO_CLIENT_SECRET,
    redirectUri: stored.redirectUri || ZOHO_REDIRECT_URI,
    orgId: stored.orgId || ZOHO_ORG_ID,
    domain: stored.domain || ZOHO_DOMAIN,
    code: stored.code || ZOHO_CODE,
  };
}

async function ensureZohoTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zohotable (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      data_name  TEXT        NOT NULL UNIQUE,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function fetchFromZoho(accessToken, domain = ZOHO_DOMAIN, orgId = ZOHO_ORG_ID) {
  const res = await fetch(
    `${domain}/api/v1/tickets?include=contacts,assignee,departments,team,isRead&limit=100`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        orgId,
        Accept: 'application/json',
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error('Zoho ticket fetch failed'), { status: res.status, data });
  return data;
}

async function storeTicketData(pool, ticketData) {
  await ensureZohoTable(pool);
  await pool.query(
    `INSERT INTO zohotable (data_name, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (data_name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    ['ticket_data', JSON.stringify(ticketData)]
  );
}

// Extract raw ticket array from stored JSONB (Zoho API returns { data: [...], count, ... })
function extractTickets(storedData) {
  if (!storedData) return [];
  if (Array.isArray(storedData)) return storedData;
  if (Array.isArray(storedData.data)) return storedData.data;
  return [];
}

async function exchangeCodeForTickets(pool, code, creds = {}) {
  const clientId     = creds.clientId || ZOHO_CLIENT_ID;
  const clientSecret = creds.clientSecret || ZOHO_CLIENT_SECRET;
  const redirectUri  = creds.redirectUri || ZOHO_REDIRECT_URI;

  const tokenUrl =
    `https://accounts.zoho.in/oauth/v2/token` +
    `?code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code` +
    `&client_id=${clientId}` +
    `&client_secret=${clientSecret}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const tokenRes  = await fetch(tokenUrl, { method: 'POST' });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw Object.assign(new Error('Token exchange failed'), { tokenData });

  // Zoho returns a refresh_token (only on the first exchange for a consent) that
  // lets the cron keep refreshing without a fresh single-use code. Persist it onto
  // the stored `zoho` credentials so services/zoho.js can use the refresh_token
  // grant going forward.
  if (tokenData.refresh_token) {
    try {
      const { rows } = await pool.query(
        "SELECT credentials FROM integration_credentials WHERE integration = 'zoho' LIMIT 1"
      );
      const existing = rows[0]?.credentials || {};
      if (existing.refreshToken !== tokenData.refresh_token) {
        await pool.query(
          `INSERT INTO integration_credentials (integration, credentials, updated_at)
           VALUES ('zoho', $1, NOW())
           ON CONFLICT (integration) DO UPDATE SET
             credentials = EXCLUDED.credentials,
             updated_at  = EXCLUDED.updated_at`,
          [JSON.stringify({ ...existing, refreshToken: tokenData.refresh_token })]
        );
        console.log('[Zoho] persisted refresh token from code exchange — cron will use it');
      }
    } catch (e) {
      console.warn('[Zoho] could not persist refresh token:', e.message);
    }
  }

  const ticketData = await fetchFromZoho(tokenData.access_token, creds.domain, creds.orgId);
  await storeTicketData(pool, ticketData);
  return extractTickets(ticketData);
}

// GET /api/zoho/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'zoho' LIMIT 1"
    );
    res.json(rows[0]?.credentials || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/zoho/credentials
router.put('/credentials', async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri, orgId, domain, code } = req.body ?? {};
    if (!clientId || !clientSecret) {
      return res.status(400).json({ message: 'clientId and clientSecret are required' });
    }
    // code is optional: it's single-use and expires quickly, so a save with nojknkjvndfkjnv
    // (or a stale) code just means credentials-sync will fall back to cached data.
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ('zoho', $1, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [JSON.stringify({ clientId, clientSecret, redirectUri, orgId, domain, code })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Returns whatever's cached in zohotable, for the "stale data" fallback below.
async function getCachedTickets(pool) {
  await ensureZohoTable(pool);
  const { rows } = await pool.query(
    'SELECT data, updated_at FROM zohotable WHERE data_name = $1 LIMIT 1',
    ['ticket_data']
  );
  return { responseData: extractTickets(rows[0]?.data), lastSyncedAt: rows[0]?.updated_at ?? null };
}

// POST /api/zoho/credentials-sync — authenticate + fetch using stored credentials
// (the Settings-page "Save & Sync" flow). Distinct from POST /sync below, which
// takes an already-obtained accessToken directly (used by the manual Zoho page).
//
// The authorization code is optional and single-use — if it's missing, already
// used, or expired, this falls back to whatever ticket data is already cached
// instead of failing outright, so the dashboard keeps showing stale-but-valid
// data until someone pastes in a fresh code.
router.post('/credentials-sync', async (req, res) => {
  const pool = req.orgPool;
  try {
    const creds = await getZohoCredentials(pool);

    if (creds.code) {
      try {
        const responseData = await exchangeCodeForTickets(pool, creds.code, creds);
        return res.json({ success: true, message: `Synced ${responseData.length} tickets`, count: responseData.length });
      } catch {
        // Code missing/expired/invalid — fall through to cached data below.
      }
    }

    const { responseData, lastSyncedAt } = await getCachedTickets(pool);
    const asOf = lastSyncedAt ? ` from ${new Date(lastSyncedAt).toLocaleString()}` : '';
    res.json({
      success: responseData.length > 0,
      stale: true,
      message: creds.code
        ? `Live sync failed (code likely expired) — showing cached data${asOf}.`
        : `No authorization code provided — showing cached data${asOf}.`,
      count: responseData.length,
      lastSyncedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/zoho — uses stored/configured credentials (or ?code= override) to
// fetch live data, falls back to DB cache if the code is expired/already used
router.get('/', async (req, res) => {
  const pool = req.orgPool;
  const creds = await getZohoCredentials(pool);
  const code = req.query.code || creds.code;

  // Try live fetch first
  if (code) {
    try {
      const responseData = await exchangeCodeForTickets(pool, code, creds);
      return res.json({ responseData, totalResults: responseData.length });
    } catch {
      // Code expired or already used — fall through to DB cache
    }
  }

  // Fall back to cached data
  try {
    await ensureZohoTable(pool);
    const { rows } = await pool.query(
      'SELECT data, updated_at FROM zohotable WHERE data_name = $1 LIMIT 1',
      ['ticket_data']
    );
    const responseData = extractTickets(rows[0]?.data);
    res.json({ responseData, totalResults: responseData.length, lastSyncedAt: rows[0]?.updated_at ?? null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/zoho/sync — force-refresh from Zoho using provided accessToken
router.post('/sync', async (req, res) => {
  try {
    const { accessToken, domain } = req.body ?? {};
    if (!accessToken) return res.status(400).json({ message: 'accessToken is required' });

    const ticketData = await fetchFromZoho(accessToken, domain);
    await storeTicketData(req.orgPool, ticketData);

    const responseData = extractTickets(ticketData);
    res.json({ success: true, count: responseData.length });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, ...(err.data && { response: err.data }) });
  }
});

// GET /api/zoho/tickets-db — read from zohotable (no external API call)
router.get('/tickets-db', async (req, res) => {
  try {
    const pool = req.orgPool;
    await ensureZohoTable(pool);

    const { rows } = await pool.query(
      'SELECT data, updated_at FROM zohotable WHERE data_name = $1 LIMIT 1',
      ['ticket_data']
    );

    const responseData = extractTickets(rows[0]?.data);
    res.json({ responseData, totalInDb: responseData.length, lastSyncedAt: rows[0]?.updated_at ?? null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
