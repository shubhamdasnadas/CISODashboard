const express = require('express');
const router = express.Router();

// Date-windowed NVD "modified" sync.
//
// Unlike the full /api/nvd/sync (which paginates startIndex 0..end), this route
// syncs only the CVEs whose lastModificationTimestamp falls inside a time window:
//
//   https://services.nvd.nist.gov/rest/json/cves/2.0
//     ?lastModStartDate=2026-08-26T00:00:00.000Z
//     &lastModEndDate=2026-08-27T12:00:00.000Z
//
// Window rules (per org):
//   - FIRST run  -> lastModStartDate = 2026-08-13 (the configured start),
//                   lastModEndDate   = now.
//   - LATER runs -> lastModStartDate = the previous run's lastModEndDate
//                   (so we only pull CVEs modified since the last sync),
//                   lastModEndDate   = now.
// The window end is persisted in integration_credentials (integration='nvd_modified')
// so the next sync resumes from where it left off.
//
// Reuses the fetch + CVE-mapping helpers from routes/nvd.js.

const {
  fetchNvdPage,
  upsertVulnerability,
  NVD_URL,
  sleep,
} = require('./nvd');

// The fixed "first time" start date requested by the product.
const FIRST_RUN_START_DATE = '2026-08-13T00:00:00.000Z';

const INTEGRATION = 'nvd_modified';

// GET /api/updated-nvd/credentials
//   Returns { apiKey, apiUrl, lastModStartDate, lastModEndDate, lastSyncedAt }
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      `SELECT credentials, updated_at FROM integration_credentials WHERE integration = $1 LIMIT 1`,
      [INTEGRATION]
    );
    if (!rows[0]) return res.json({});
    const c = rows[0].credentials || {};
    return res.json({
      apiKey: c.apiKey || null,
      apiUrl: c.apiUrl || NVD_URL,
      lastModStartDate: c.lastModStartDate || null,
      lastModEndDate: c.lastModEndDate || null,
      lastSyncedAt: rows[0].updated_at,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/updated-nvd/credentials
//   Body: { apiKey, apiUrl, lastModStartDate? }
//   Stores the NVD key + the persisted window start. If lastModStartDate is not
//   supplied we fall back to the configured FIRST_RUN_START_DATE.
router.put('/credentials', async (req, res) => {
  try {
    const { apiKey, apiUrl, lastModStartDate } = req.body;
    if (!apiKey) {
      return res.status(400).json({ message: 'apiKey is required' });
    }
    const creds = {
      apiKey,
      apiUrl: apiUrl || NVD_URL,
      lastModStartDate: lastModStartDate || FIRST_RUN_START_DATE,
      lastModEndDate: null,
    };
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [INTEGRATION, JSON.stringify(creds)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Resolve the window for this run.
//   - If the frontend supplied lastModStartDate / lastModEndDate in the request
//     body, those win (this is the normal flow now).
//   - Otherwise fall back to the stored window (previous run's end) or the
//     configured FIRST_RUN_START_DATE -> now, for backwards compatibility.
function resolveWindow(body, orgPool) {
  const bodyStart = body && body.lastModStartDate;
  const bodyEnd = body && body.lastModEndDate;
  if (bodyStart && bodyEnd) {
    // Normalise to ISO; NVD wants the exact format.
    return {
      lastModStartDate: new Date(bodyStart).toISOString(),
      lastModEndDate: new Date(bodyEnd).toISOString(),
      fromFrontend: true,
    };
  }
  // Fallback: read stored creds (previous run's end) or first-run date.
  const stored = (orgPool && orgPool._storedCreds) || {};
  const startDate = stored.lastModEndDate || stored.lastModStartDate || FIRST_RUN_START_DATE;
  return {
    lastModStartDate: new Date(startDate).toISOString(),
    lastModEndDate: new Date().toISOString(),
    fromFrontend: false,
  };
}

// Reusable core sync used by both the HTTP route AND the cron job.
//   opts = { apiKey, apiUrl, lastModStartDate, lastModEndDate, pool, orgSlug }
// Returns { success, message, lastModStartDate, lastModEndDate, fromFrontend,
//           inserted, updated, pages, totalResults }.
async function runUpdatedNvdSync({ apiKey, apiUrl, lastModStartDate, lastModEndDate, pool, orgSlug }) {
  const baseUrl = apiUrl || NVD_URL;
  if (!apiKey) {
    throw new Error('NVD apiKey missing');
  }

  // Stored creds are read so the fallback path can resume from the previous run.
  const { rows: credRows } = await pool.query(
    `SELECT credentials FROM integration_credentials WHERE integration = $1 LIMIT 1`,
    [INTEGRATION]
  );
  const creds = credRows[0]?.credentials || {};

  // Resolve the window — explicit dates win (frontend or cron); otherwise fall
  // back to the stored window / first-run date.
  const body = { lastModStartDate, lastModEndDate };
  const { lastModStartDate: winStart, lastModEndDate: winEnd, fromFrontend } = resolveWindow(body, {
    _storedCreds: creds,
  });

  const resultsPerPage = 2000;
  const maxPages = 1000;

  let inserted = 0;
  let updated = 0;
  let totalResults = 0;
  let pages = 0;
  let startIndex = 0;

  // Paginate within the window until we've fetched totalResults CVEs.
  while (true) {
    if (pages >= maxPages) {
      console.warn(`[updatedNVD sync][org=${orgSlug}] reached maxPages=${maxPages} — stopping`);
      break;
    }

    // Build the windowed URL.
    const url = new URL(baseUrl);
    url.searchParams.set('lastModStartDate', winStart);
    url.searchParams.set('lastModEndDate', winEnd);
    url.searchParams.set('startIndex', String(startIndex));
    url.searchParams.set('resultsPerPage', String(resultsPerPage));

    const json = await fetchNvdPage(url.toString(), apiKey, startIndex, resultsPerPage, orgSlug);
    const vulnerabilities = Array.isArray(json.vulnerabilities) ? json.vulnerabilities : [];
    if (typeof json.totalResults === 'number') totalResults = json.totalResults;

    if (vulnerabilities.length === 0) break;

    for (const vuln of vulnerabilities) {
      const result = await upsertVulnerability(pool, vuln, null);
      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
    }

    pages++;
    console.log(
      `[updatedNVD sync][org=${orgSlug}] page ${pages} — window ${winStart} -> ${winEnd}, ` +
      `vulnerabilities=${vulnerabilities.length}, inserted=${inserted}, updated=${updated}`
    );

    startIndex += resultsPerPage;
    // Stop when we've pulled everything the window reports.
    if (vulnerabilities.length < resultsPerPage || startIndex >= totalResults) break;
    await sleep(6000);
  }

  // Persist the window so the next run resumes from where this one ended.
  await pool.query(
    `INSERT INTO integration_credentials (integration, credentials, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (integration) DO UPDATE SET
       credentials = EXCLUDED.credentials,
       updated_at  = EXCLUDED.updated_at`,
    [INTEGRATION, JSON.stringify({ ...creds, apiKey, apiUrl: baseUrl, lastModStartDate: winStart, lastModEndDate: winEnd })]
  );

  console.log(
    `[updatedNVD sync][org=${orgSlug}] window sync complete — ` +
    `inserted=${inserted}, updated=${updated}, pages=${pages}, total=${totalResults}`
  );

  return {
    success: true,
    message: `Windowed sync complete: ${inserted} new / ${updated} updated across ${pages} page(s) (total=${totalResults}).`,
    lastModStartDate: winStart,
    lastModEndDate: winEnd,
    fromFrontend,
    inserted,
    updated,
    pages,
    totalResults,
  };
}

// POST /api/updated-nvd/sync
//   Body (all optional, frontend-driven):
//     { apiKey, apiUrl, lastModStartDate, lastModEndDate }
//   Pulls all CVEs whose lastModified falls in [lastModStartDate, lastModEndDate],
//   upserts them, then persists the window for the next run.
router.post('/sync', async (req, res) => {
  try {
    // Token + base URL may be supplied directly from the frontend (request body)
    // OR read from stored credentials. The frontend values win when present.
    const bodyApiKey = req.body && req.body.apiKey;
    const bodyApiUrl = req.body && req.body.apiUrl;

    const apiKey = bodyApiKey;
    const apiUrl = bodyApiUrl;
    if (!apiKey) {
      return res.status(400).json({ message: 'NVD apiKey missing in request' });
    }

    const result = await runUpdatedNvdSync({
      apiKey,
      apiUrl,
      lastModStartDate: req.body.lastModStartDate,
      lastModEndDate: req.body.lastModEndDate,
      pool: req.orgPool,
      orgSlug: req.orgSlug,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.runUpdatedNvdSync = runUpdatedNvdSync;
