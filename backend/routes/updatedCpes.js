const express = require('express');
const router = express.Router();

// Date-windowed NVD "CPEs" sync. Mirrors routes/updatedNvd.js but hits the CPE
// LIST endpoint instead of the CVEs endpoint:
//
//   https://services.nvd.nist.gov/rest/json/cpes/2.0
//     ?lastModStartDate=2026-08-26T00:00:00.000Z
//     &lastModEndDate=2026-08-27T12:00:00.000Z
//
// IMPORTANT: the /cpes/2.0 response does NOT contain a CVE id — it returns
// products[].cpe with { cpeName, cpeNameId, lastModified, titles, deprecated }.
// We therefore update ONLY the CPE column (cpe_match) of CVEs that already exist
// in this org's `nvd` table and whose stored configurations reference the returned
// cpeName. CVEs with no match are left untouched, and no new CVE rows are created
// from CPE data. This is what "if data is available then only the CPE column of
// that CVE gets updated" means in practice.
//
// Reuses the retry/backoff fetch helper from routes/nvd.js.

const {
  fetchNvdPage,
  NVD_URL,
  sleep,
} = require('./nvd');

const CPE_URL = NVD_URL.replace('/cves/2.0', '/cpes/2.0');

const FIRST_RUN_START_DATE = '2026-08-13T00:00:00.000Z';
const INTEGRATION = 'nvd_cpe_modified';

// GET /api/updated-cpes/credentials
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
      apiUrl: c.apiUrl || CPE_URL,
      lastModStartDate: c.lastModStartDate || null,
      lastModEndDate: c.lastModEndDate || null,
      lastSyncedAt: rows[0].updated_at,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/updated-cpes/credentials — store the API key + base URL.
router.put('/credentials', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body;
    if (!apiKey) return res.status(400).json({ message: 'apiKey is required' });
    const creds = {
      apiKey,
      apiUrl: apiUrl || CPE_URL,
      lastModStartDate: FIRST_RUN_START_DATE,
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

// Resolve the window: frontend-supplied dates win; otherwise fall back to stored
// window end or the configured first-run date -> now.
function resolveWindow(body, storedCreds) {
  const bodyStart = body && body.lastModStartDate;
  const bodyEnd = body && body.lastModEndDate;
  if (bodyStart && bodyEnd) {
    return {
      lastModStartDate: new Date(bodyStart).toISOString(),
      lastModEndDate: new Date(bodyEnd).toISOString(),
      fromFrontend: true,
    };
  }
  const stored = storedCreds || {};
  const startDate = stored.lastModEndDate || stored.lastModStartDate || FIRST_RUN_START_DATE;
  return {
    lastModStartDate: new Date(startDate).toISOString(),
    lastModEndDate: new Date().toISOString(),
    fromFrontend: false,
  };
}

// Flatten all CPE `criteria` strings out of a stored CVE's configurations JSONB.
// configurations = [ { nodes: [ { cpeMatch: [ { criteria: 'cpe:2.3:...' } ] } ] } ]
function extractCpeCriteria(configurations) {
  const out = [];
  if (!Array.isArray(configurations)) return out;
  for (const cfg of configurations) {
    const nodes = Array.isArray(cfg.nodes) ? cfg.nodes : [];
    for (const n of nodes) {
      const matches = Array.isArray(n.cpeMatch) ? n.cpeMatch : [];
      for (const m of matches) {
        if (m && m.criteria) out.push(m.criteria);
      }
    }
  }
  return out;
}

// POST /api/updated-cpes/sync
//   Body (all optional, frontend-driven):
//     { apiKey, apiUrl, lastModStartDate, lastModEndDate }
//   Pulls every CPE whose lastModified falls in [start, end] over the window,
//   matches each cpeName to existing CVEs by their stored configuration criteria,
//   and updates ONLY the cpe_match column of the matching CVEs.
router.post('/sync', async (req, res) => {
  try {
    const bodyApiKey = req.body && req.body.apiKey;
    const bodyApiUrl = req.body && req.body.apiUrl;

    const { rows: credRows } = await req.orgPool.query(
      `SELECT credentials FROM integration_credentials WHERE integration = $1 LIMIT 1`,
      [INTEGRATION]
    );
    const creds = credRows[0]?.credentials || {};
    // Prefer the token the user typed in the UI (sent in the body); fall back to the
    // one they saved via "Save API Key". Either way it is the user's key — never a
    // hardcoded default. This is the token used for every NVD /cpes/2.0 call below.
    const apiKey = bodyApiKey || creds.apiKey;
    // ALWAYS hit the CPE endpoint. We deliberately ignore any apiUrl passed in the
    // body or stored in credentials (which may hold the CVE endpoint) so this route
    // can never accidentally call /cves/2.0.
    const baseUrl = CPE_URL;
    if (!apiKey) {
      return res.status(400).json({ message: 'NVD apiKey missing — enter and save your API key first' });
    }
    console.log(
      `[updatedCPE sync][org=${req.orgSlug}] using user ${bodyApiKey ? 'supplied' : 'saved'} apiKey ` +
      `(len ${apiKey.length}) against ${baseUrl}`
    );

    const { lastModStartDate, lastModEndDate, fromFrontend } = resolveWindow(req.body, creds);

    const resultsPerPage = 2000;
    const maxPages = 1000;

    let matched = 0;     // CVE rows whose cpe_match we updated
    let cpeReturned = 0; // total CPE products returned by NVD in the window
    let unmatched = 0;   // CPE products that matched no stored CVE
    let totalResults = 0;
    let pages = 0;
    let startIndex = 0;

    // Collect a BOUNDED sample of the raw NVD /cpes/2.0 API responses so we can
    // return real API data to the caller without holding every page in memory.
    // Keeping all pages (1000 × ~2000 CPEs) here is what previously caused the
    // Node process to OOM, so we cap it.
    const MAX_STORED_RESPONSES = 5;
    const apiResponses = [];

    // Cache the org's existing CVE -> CPE maps once (refreshed lazily).
    //   cpeNameIdToCve : cpeNameId (the stable NVD UUID) -> [cve_id,...]  (PRIMARY key)
    //   cpeNameToCve   : cpeName (the cpe:2.3:... criteria string) -> [cve_id,...] (FALLBACK)
    // The CVE API's `configurations` only carry the cpeName string, so the
    // cpeNameId map can only be built from CVEs that already have a `cpe_match`
    // populated from a previous /cpes/2.0 sync (which stores the cpeNameId).
    let cpeNameIdToCve = new Map();
    let cpeNameToCve = new Map();
    const rebuildMap = async () => {
      cpeNameIdToCve = new Map();
      cpeNameToCve = new Map();
      // Load in bounded chunks so a large `nvd` table does not blow the heap in a
      // single query result (the previous OOM cause).
      const CHUNK = 5000;
      let offset = 0;
      while (true) {
        const { rows: cveRows } = await req.orgPool.query(
          'SELECT cve_id, configurations, cpe_match FROM nvd ' +
          'WHERE configurations IS NOT NULL OR cpe_match IS NOT NULL ' +
          'LIMIT $1 OFFSET $2',
          [CHUNK, offset]
        );
        if (cveRows.length === 0) break;
        for (const r of cveRows) {
          // Fallback map: cpeName criteria extracted from the CVE's configurations.
          for (const criteria of extractCpeCriteria(r.configurations)) {
            if (!cpeNameToCve.has(criteria)) cpeNameToCve.set(criteria, []);
            cpeNameToCve.get(criteria).push(r.cve_id);
          }
          // Primary map: cpeNameId taken from the previously-stored cpe_match.
          let stored = r.cpe_match;
          if (typeof stored === 'string') {
            try { stored = JSON.parse(stored); } catch { stored = null; }
          }
          const storedCpeNameId =
            stored && (stored.cpeNameId || (stored.cpe && stored.cpe.cpeNameId));
          if (storedCpeNameId) {
            if (!cpeNameIdToCve.has(storedCpeNameId)) cpeNameIdToCve.set(storedCpeNameId, []);
            cpeNameIdToCve.get(storedCpeNameId).push(r.cve_id);
          }
        }
        offset += CHUNK;
        if (cveRows.length < CHUNK) break;
      }
    };
    await rebuildMap();

    while (true) {
      if (pages >= maxPages) {
        console.warn(`[updatedCPE sync][org=${req.orgSlug}] reached maxPages=${maxPages} — stopping`);
        break;
      }

      const url = new URL(baseUrl);
      url.searchParams.set('lastModStartDate', lastModStartDate);
      url.searchParams.set('lastModEndDate', lastModEndDate);
      url.searchParams.set('startIndex', String(startIndex));
      url.searchParams.set('resultsPerPage', String(resultsPerPage));

      const json = await fetchNvdPage(url.toString(), apiKey, startIndex, resultsPerPage, req.orgSlug);
      // Keep only a bounded sample of raw API responses to avoid OOM; the page is
      // still fully processed (matched/unmatched counted) regardless of sampling.
      if (apiResponses.length < MAX_STORED_RESPONSES) apiResponses.push(json);
      const products = Array.isArray(json.products) ? json.products : [];
      if (typeof json.totalResults === 'number') totalResults = json.totalResults;

      if (products.length === 0) break;

      // Collect (cpe, cveId) pairs for this page, then apply them in ONE
      // transaction instead of one UPDATE per CVE (avoids N+1 slowness).
      const updates = []; // { cpe, cveId }
      for (const product of products) {
        const cpe = (product && product.cpe) || null;
        const cpeName = cpe && cpe.cpeName;
        const cpeNameId = cpe && cpe.cpeNameId;
        if (!cpeName) continue;
        cpeReturned++;

        // Resolve the CVE(s) this product belongs to.
        //   PRIMARY : by cpeNameId (stable NVD UUID from the stored cpe_match).
        //   FALLBACK: by cpeName criteria string from the CVE's configurations
        //             (needed before any cpe_match has been stored, i.e. first run).
        let cveIds = (cpeNameId && cpeNameIdToCve.get(cpeNameId)) || [];
        if (cveIds.length === 0) cveIds = cpeNameToCve.get(cpeName) || [];

        if (cveIds.length === 0) {
          unmatched++;
          continue;
        }

        // Update ONLY the cpe_match (CPE) column of the matching CVE(s).
        // We store the full `cpe` object (which carries cpeName + cpeNameId) so
        // subsequent syncs can match purely by cpeNameId without re-reading
        // configurations.
        const cpeJson = JSON.stringify(cpe);
        for (const cveId of cveIds) {
          updates.push([cpeJson, cveId]);
          matched++;
        }

        // Keep both maps fresh so later pages in the same run can match this
        // product's cpeNameId even if it was just now populated.
        if (cpeNameId) {
          if (!cpeNameIdToCve.has(cpeNameId)) cpeNameIdToCve.set(cpeNameId, []);
          cpeNameIdToCve.get(cpeNameId).push(...cveIds);
        }
        if (!cpeNameToCve.has(cpeName)) cpeNameToCve.set(cpeName, []);
        cpeNameToCve.get(cpeName).push(...cveIds);
      }

      // Apply all updates for this page in a single transaction.
      if (updates.length > 0) {
        const client = await req.orgPool.connect();
        try {
          await client.query('BEGIN');
          for (const [cpeJson, cveId] of updates) {
            await client.query(
              `UPDATE nvd SET cpe_match = $1, cpe_synced_at = NOW() WHERE cve_id = $2`,
              [cpeJson, cveId]
            );
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        } finally {
          client.release();
        }
      }

      pages++;
      console.log(
        `[updatedCPE sync][org=${req.orgSlug}] page ${pages} — window ${lastModStartDate} -> ${lastModEndDate}, ` +
        `products=${products.length}, matched=${matched}, unmatched=${unmatched}`
      );

      startIndex += resultsPerPage;
      if (products.length < resultsPerPage || startIndex >= totalResults) break;
      await sleep(6000);
    }

    // Persist the window so the next run resumes correctly.
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [INTEGRATION, JSON.stringify({ ...creds, apiKey, apiUrl: baseUrl, lastModStartDate, lastModEndDate })]
    );

    console.log(
      `[updatedCPE sync][org=${req.orgSlug}] complete — ` +
      `matched=${matched}, unmatched=${unmatched}, cpeReturned=${cpeReturned}, pages=${pages}`
    );

    res.json({
      success: true,
      message: `CPE sync complete: ${matched} CVE CPE column(s) updated, ${unmatched} CPEs unmatched (no existing CVE) across ${pages} page(s).`,
      lastModStartDate,
      lastModEndDate,
      fromFrontend,
      matched,
      unmatched,
      cpeReturned,
      pages,
      totalResults,
      apiResponses,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
