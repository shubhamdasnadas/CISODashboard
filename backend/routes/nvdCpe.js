const express = require('express');
const router = express.Router();

// CPEmatch API — a *different* endpoint from the CVEs endpoint.
// Fetches CPE match data for a single CVE id.
const CPE_MATCH_URL = 'https://services.nvd.nist.gov/rest/json/cpematch/2.0';

// NVD API token, set statically as requested.
const CPE_API_KEY = '68bfccb2-c5a2-4d4d-9cf7-29a5fa8b0af8';

// Delay between CPE API calls. With a valid apiKey NVD allows ~50 req / 30s,
// so ~0.7s keeps us comfortably under the limit. Tune via env if needed.
const CPE_CALL_DELAY_MS = parseInt(process.env.NVD_CPE_CALL_DELAY_MS || '700', 10);

// Track in-flight background jobs per org so a second click can't start a
// duplicate sync over the same (huge) dataset.
const runningJobs = new Set();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch CPE match data for ONE CVE id. Retries on 429 / 503 with backoff.
 * Returns the parsed JSON (the whole cpematch response), or throws.
 */
async function fetchCpeMatch(cveId, orgSlug) {
  const url = new URL(CPE_MATCH_URL);
  url.searchParams.set('cveId', cveId);

  let attempt = 0;
  while (true) {
    const response = await fetch(url.toString(), {
      headers: { apiKey: CPE_API_KEY, Accept: 'application/json' },
    });

    if (response.status === 429 || response.status === 503) {
      if (attempt > 5) {
        const body = await response.text();
        throw new Error(`CPE API ${response.status} after retries: ${body.slice(0, 200)}`);
      }
      const wait =
        (Number(response.headers.get('retry-after')) || Math.pow(2, attempt) * 2) * 1000;
      console.warn(`[NVD CPE][org=${orgSlug}] ${cveId} ${response.status} — waiting ${wait}ms`);
      await sleep(wait);
      attempt++;
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CPE API ${response.status}: ${body.slice(0, 200)}`);
    }

    return response.json();
  }
}

/**
 * Background bulk job: iterate every stored CVE that has NOT yet had its CPE
 * data pulled, fetch CPEmatch for each, and store the response in the same
 * `nvd` table (cpe_match column). Logs each call to the server console.
 */
async function runBulkCpeSync(orgPool, orgSlug) {
  // Grab the full list of CVEs still needing CPE data ONCE, so the in-loop
  // UPDATEs don't shift an OFFSET-based cursor.
  const { rows } = await orgPool.query(
    'SELECT cve_id FROM nvd WHERE cpe_synced_at IS NULL ORDER BY cve_id'
  );
  const cveIds = rows.map((r) => r.cve_id);
  const total = cveIds.length;

  if (total === 0) {
    console.log(`[NVD CPE][org=${orgSlug}] nothing to sync — all CVEs already have CPE data`);
    return { total: 0, fetched: 0, failed: 0 };
  }

  console.log(`[NVD CPE][org=${orgSlug}] 🚀 starting bulk CPE sync for ${total} CVE(s)`);

  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const cveId = cveIds[i];
    try {
      const data = await fetchCpeMatch(cveId, orgSlug);
      await orgPool.query(
        'UPDATE nvd SET cpe_match = $1, cpe_synced_at = NOW() WHERE cve_id = $2',
        [JSON.stringify(data), cveId]
      );
      fetched++;
      // Per-call console log so you can follow each API hit.
      console.log(
        `[NVD CPE][org=${orgSlug}] ✅ ${cveId} stored ` +
        `(${i + 1}/${total} — fetched=${fetched}, failed=${failed})`
      );
    } catch (err) {
      failed++;
      console.error(`[NVD CPE][org=${orgSlug}] ❌ ${cveId} failed: ${err.message}`);
      // Mark as attempted so a permanently-failing CVE doesn't loop forever.
      try {
        await orgPool.query('UPDATE nvd SET cpe_synced_at = NOW() WHERE cve_id = $1', [cveId]);
      } catch { /* ignore */ }
    }

    // Be polite to NVD between calls.
    await sleep(CPE_CALL_DELAY_MS);
  }

  console.log(
    `[NVD CPE][org=${orgSlug}] ✅ CPE sync complete — total=${total}, ` +
    `fetched=${fetched}, failed=${failed}`
  );
  return { total, fetched, failed };
}

// POST /api/nvd-cpe/sync-cpe — kicks off the bulk CPE sync in the background.
// Responds immediately ("started") because the job runs for a long time over
// a large dataset; watch the server console for per-CVE progress.
router.post('/sync-cpe', async (req, res) => {
  const orgSlug = req.orgSlug;
  const orgPool = req.orgPool;

  if (runningJobs.has(orgSlug)) {
    return res.status(409).json({ message: 'CPE sync already running for this org — watch the server console.' });
  }

  runningJobs.add(orgSlug);
  // Fire-and-forget: don't block the HTTP response on a multi-hour job.
  runBulkCpeSync(orgPool, orgSlug)
    .catch((err) => console.error(`[NVD CPE][org=${orgSlug}] background job error:`, err.message))
    .finally(() => runningJobs.delete(orgSlug));

  res.json({
    success: true,
    message: 'CPE bulk sync started in the background. Watch the server console for per-CVE progress.',
  });
});

// GET /api/nvd-cpe/stats — how many CVEs have CPE data vs still pending.
router.get('/stats', async (req, res) => {
  try {
    const r = await req.orgPool.query(
      `SELECT
         COUNT(*)::int                                          AS total,
         COUNT(cpe_synced_at)::int                              AS cpe_synced,
         COUNT(*)::int - COUNT(cpe_synced_at)::int              AS cpe_pending
       FROM nvd`
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nvd-cpe/:cve_id — CPE match data for a single stored CVE.
router.get('/:cve_id', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      'SELECT cve_id, cpe_match, cpe_synced_at FROM nvd WHERE cve_id = $1 LIMIT 1',
      [req.params.cve_id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'CVE not found' });
    res.json({ cve_id: rows[0].cve_id, cpe_match: rows[0].cpe_match, cpe_synced_at: rows[0].cpe_synced_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
