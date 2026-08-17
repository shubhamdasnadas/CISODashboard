const express = require('express');
const router = express.Router();

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Extract first English / Spanish description from the descriptions array.
function extractDescriptions(descriptions = []) {
  let en = '';
  let es = '';
  for (const d of descriptions) {
    if (!d || !d.lang) continue;
    if (d.lang === 'en' && !en) en = d.value || '';
    if (d.lang === 'es' && !es) es = d.value || '';
  }
  return { en, es };
}

// Pull the "best" CVSS metric. Prefer v3.1 -> v3.0 -> v2.0.
function extractCvss(metrics = {}) {
  const v31 = metrics.cvssMetricV31 && metrics.cvssMetricV31[0];
  const v30 = metrics.cvssMetricV30 && metrics.cvssMetricV30[0];
  const v2 = metrics.cvssMetricV2 && metrics.cvssMetricV2[0];

  const chosen = v31 || v30 || v2;
  if (!chosen) return { version: null, baseScore: null, baseSeverity: null, vectorString: null };

  const cvssData = chosen.cvssData || {};
  return {
    version: cvssData.version || null,
    baseScore: cvssData.baseScore != null ? Number(cvssData.baseScore) : null,
    baseSeverity: chosen.baseSeverity || null,
    vectorString: cvssData.vectorString || null,
  };
}

// First weakness value (CWE id), if present.
function extractWeakness(weaknesses = []) {
  for (const w of weaknesses) {
    const desc = Array.isArray(w.description) ? w.description[0] : null;
    if (desc && desc.value) return desc.value;
  }
  return null;
}

// Flatten a single CVE object into the row columns + raw payload.
function mapVulnerability(vuln, sourceIndex) {
  const cve = vuln && vuln.cve ? vuln.cve : {};
  const { en, es } = extractDescriptions(cve.descriptions);
  const { version, baseScore, baseSeverity, vectorString } = extractCvss(cve.metrics);

  return {
    cve_id: cve.id || null,
    source_identifier: cve.sourceIdentifier || null,
    published: parseDate(cve.published),
    last_modified: parseDate(cve.lastModified),
    vuln_status: cve.vulnStatus || null,
    description_en: en,
    description_es: es,
    cvss_version: version,
    cvss_base_score: baseScore,
    cvss_base_severity: baseSeverity,
    cvss_vector_string: vectorString,
    weaknesses: extractWeakness(cve.weaknesses),
    configurations: cve.configurations || null,
    reference_list: cve.references || null,
    raw: cve,
    source_index: sourceIndex != null ? Number(sourceIndex) : null,
  };
}

// GET /api/nvd/credentials — read stored NVD apiKey/apiUrl
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials, updated_at FROM integration_credentials WHERE integration = 'nvd' LIMIT 1"
    );
    if (!rows[0]) return res.json({});
    return res.json({ ...rows[0].credentials, lastSyncedAt: rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/nvd/credentials — store NVD apiKey + apiUrl
router.put('/credentials', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body;
    if (!apiKey) {
      return res.status(400).json({ message: 'apiKey is required' });
    }
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ('nvd', $1, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [JSON.stringify({ apiKey, apiUrl: apiUrl || NVD_URL })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nvd/sync — page through ALL CVEs from NVD and store each batch.
//
// Loop contract:
//   - startIndex begins at 0, resultsPerPage is fixed at 2000 (NVD max).
//   - For every page: fetch (with retry/backoff), upsert every CVE into the
//     org's nvd table, then advance startIndex by the number actually returned.
//   - EMPTY page handling: if a page returns zero vulnerabilities we do NOT
//     stop — we increment startIndex and fetch the next page, exactly as
//     requested. We only break out of the loop when we've gone past
//     totalResults (so we don't loop forever) or hit the hard page cap.
//
// startIndex / resultsPerPage are NOT exposed to the UI.
router.post('/sync', async (req, res) => {
  try {
    const { rows: credRows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'nvd' LIMIT 1"
    );
    if (!credRows[0]) {
      return res.status(400).json({ message: 'NVD not configured — set apiKey first' });
    }

    const creds = credRows[0].credentials || {};
    const apiKey = creds.apiKey;
    const baseUrl = creds.apiUrl || NVD_URL;
    if (!apiKey) {
      return res.status(400).json({ message: 'NVD apiKey missing in credentials' });
    }

    const RESULTS_PER_PAGE = 2000;
    const MAX_PAGES = 1000;          // safety cap so a broken NVD response can't loop forever
    // Inter-page delay (NVD rate limits). Default 0: the per-page 429/503
    // backoff above already handles throttling, so flat delays just waste time.
    // Set NVD_PAGE_DELAY_MS in .env to re-enable a polite pause between pages.
    const PAGE_DELAY_MS = parseInt(process.env.NVD_PAGE_DELAY_MS || '0', 10);
    const EMPTY_PAGE_TOLERANCE = 3;   // consecutive empty pages before we give up
    const MAX_ROW_BATCH = 500;        // chunk very large pages before the DB write

    let startIndex = 0;
    let totalResults = 0;
    let totalPages = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let lastStartIndex = 0;
    let consecutiveEmpty = 0;

    // Fetch a single page from NVD, retrying on 429 / 503 with backoff.
    async function fetchPage(start) {
      const url = new URL(baseUrl);
      url.searchParams.set('startIndex', String(start));
      url.searchParams.set('resultsPerPage', String(RESULTS_PER_PAGE));

      let attempt = 0;
      let response;
      while (true) {
        response = await fetch(url.toString(), {
          headers: { apiKey, Accept: 'application/json' },
        });
        if (response.status !== 429 && response.status !== 503) break;
        const wait = (Number(response.headers.get('retry-after')) || Math.pow(2, attempt) * 2) * 1000;
        console.warn(`[NVD sync][org=${req.orgSlug}] ${response.status} — waiting ${wait}ms`);
        await sleep(wait);
        if (++attempt > 5) break;
      }

      if (!response || !response.ok) {
        const body = await response?.text();
        throw Object.assign(new Error(`NVD API ${response?.status}: ${(body || '').slice(0, 200)}`), {
          statusCode: response?.status || 500,
        });
      }
      return response.json();
    }

    // Upsert an array of NVD vulnerability objects using ONE batched
    // multi-row INSERT ... ON CONFLICT via UNNEST. This collapses thousands
    // of round-trips (one per CVE) into a single query per chunk — the main
    // speedup for large syncs. Returns { inserted, updated } using the
    // xmax=0 trick to distinguish true inserts from updates on conflict.
    async function storeBatch(vulnerabilities, batchStart) {
      const rows = vulnerabilities
        .map((v) => mapVulnerability(v, batchStart))
        .filter((r) => r.cve_id);
      if (rows.length === 0) return { inserted: 0, updated: 0 };

      let inserted = 0;
      let updated = 0;

      for (let i = 0; i < rows.length; i += MAX_ROW_BATCH) {
        const slice = rows.slice(i, i + MAX_ROW_BATCH);

        const r = await req.orgPool.query(
          `WITH s AS (
             SELECT * FROM UNNEST(
               $1::text[], $2::text[], $3::timestamptz[], $4::timestamptz[],
               $5::text[],  $6::text[],  $7::text[],  $8::text[],
               $9::float8[], $10::text[], $11::text[], $12::text[],
               $13::jsonb[], $14::jsonb[], $15::jsonb[], $16::integer[]
             ) AS t(
               cve_id, source_identifier, published, last_modified, vuln_status,
               description_en, description_es, cvss_version, cvss_base_score,
               cvss_base_severity, cvss_vector_string, weaknesses,
               configurations, reference_list, raw, source_index
             )
           )
           INSERT INTO nvd (
             cve_id, source_identifier, published, last_modified, vuln_status,
             description_en, description_es, cvss_version, cvss_base_score,
             cvss_base_severity, cvss_vector_string, weaknesses,
             configurations, reference_list, raw, source_index, synced_at
           )
           SELECT cve_id, source_identifier, published, last_modified, vuln_status,
                  description_en, description_es, cvss_version, cvss_base_score,
                  cvss_base_severity, cvss_vector_string, weaknesses,
                  configurations, reference_list, raw, source_index, NOW()
             FROM s
           ON CONFLICT (cve_id) DO UPDATE SET
             source_identifier  = EXCLUDED.source_identifier,
             published          = EXCLUDED.published,
             last_modified      = EXCLUDED.last_modified,
             vuln_status        = EXCLUDED.vuln_status,
             description_en     = EXCLUDED.description_en,
             description_es     = EXCLUDED.description_es,
             cvss_version       = EXCLUDED.cvss_version,
             cvss_base_score    = EXCLUDED.cvss_base_score,
             cvss_base_severity = EXCLUDED.cvss_base_severity,
             cvss_vector_string = EXCLUDED.cvss_vector_string,
             weaknesses         = EXCLUDED.weaknesses,
             configurations     = EXCLUDED.configurations,
             reference_list      = EXCLUDED.reference_list,
             raw                = EXCLUDED.raw,
             source_index       = EXCLUDED.source_index,
             synced_at          = NOW()
           RETURNING (xmax = 0) AS was_inserted`,
          [
            slice.map((x) => x.cve_id),
            slice.map((x) => x.source_identifier),
            slice.map((x) => x.published),
            slice.map((x) => x.last_modified),
            slice.map((x) => x.vuln_status),
            slice.map((x) => x.description_en),
            slice.map((x) => x.description_es),
            slice.map((x) => x.cvss_version),
            slice.map((x) => x.cvss_base_score),
            slice.map((x) => x.cvss_base_severity),
            slice.map((x) => x.cvss_vector_string),
            slice.map((x) => x.weaknesses),
            slice.map((x) => JSON.stringify(x.configurations)),
            slice.map((x) => JSON.stringify(x.reference_list)),
            slice.map((x) => JSON.stringify(x.raw)),
            slice.map((x) => x.source_index),
          ]
        );

        for (const row of r.rows) {
          if (row.was_inserted) inserted++; else updated++;
        }
      }
      return { inserted, updated };
    }

    // ── Paging loop ───────────────────────────────────────────────────────
    while (totalPages < MAX_PAGES) {
      const json = await fetchPage(startIndex);
      totalResults = json.totalResults != null ? json.totalResults : totalResults;
      const vulnerabilities = Array.isArray(json.vulnerabilities) ? json.vulnerabilities : [];
      totalPages++;
      lastStartIndex = startIndex;

      console.log(
        `[NVD sync][org=${req.orgSlug}] page=${totalPages} startIndex=${startIndex} ` +
        `got=${vulnerabilities.length} total=${totalResults}`
      );

      if (vulnerabilities.length === 0) {
        // Empty response: per requirement, bump startIndex and keep looping —
        // but stop once we're past the total (or after too many empties).
        consecutiveEmpty++;
        console.log(
          `[NVD sync][org=${req.orgSlug}] page=${totalPages} startIndex=${startIndex} → ` +
          `loaded=0 stored=0 (empty, ${consecutiveEmpty}/${EMPTY_PAGE_TOLERANCE}) ` +
          `runningTotals: inserted=${totalInserted} updated=${totalUpdated}`
        );
        if (totalResults && startIndex >= totalResults) break;
        if (consecutiveEmpty >= EMPTY_PAGE_TOLERANCE) {
          console.warn(`[NVD sync][org=${req.orgSlug}] ${EMPTY_PAGE_TOLERANCE} consecutive empty pages — stopping.`);
          break;
        }
        startIndex += RESULTS_PER_PAGE;
        continue;
      }

      consecutiveEmpty = 0;
      const { inserted, updated } = await storeBatch(vulnerabilities, startIndex);
      totalInserted += inserted;
      totalUpdated += updated;
      const stored = inserted + updated;

      console.log(
        `[NVD sync][org=${req.orgSlug}] page=${totalPages} startIndex=${startIndex} → ` +
        `loaded=${vulnerabilities.length} stored=${stored} (new=${inserted} updated=${updated}) ` +
        `runningTotals: inserted=${totalInserted} updated=${totalUpdated} ` +
        `progress=${startIndex}/${totalResults}`
      );

      // Advance by how many NVD actually returned (robust vs. trailing short pages).
      startIndex += json.resultsPerPage || vulnerabilities.length;

      if (totalResults && startIndex >= totalResults) break;
      await sleep(PAGE_DELAY_MS);
    }

    console.log(
      `[NVD sync][org=${req.orgSlug}] ✅ DONE — pages=${totalPages} ` +
      `loaded=${totalInserted + totalUpdated} stored=${totalInserted + totalUpdated} ` +
      `(new=${totalInserted} updated=${totalUpdated}) totalAvailable=${totalResults} ` +
      `lastStartIndex=${lastStartIndex}`
    );

    res.json({
      success: true,
      message: `Stored ${totalInserted} new / ${totalUpdated} updated CVEs across ${totalPages} page(s) (total=${totalResults})`,
      inserted: totalInserted,
      updated: totalUpdated,
      totalResults,
      resultsPerPage: RESULTS_PER_PAGE,
      pages: totalPages,
      lastStartIndex,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

// GET /api/nvd/db — list stored CVEs with optional filters + pagination.
// Query: severity, status, search, page, limit, sort (published|score)
router.get('/db', async (req, res) => {
  try {
    const { severity, status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;
    const sort = req.query.sort === 'score' ? 'cvss_base_score' : 'published';
    const sortDir = req.query.sort === 'score' ? 'DESC NULLS LAST' : 'DESC NULLS LAST';

    const conditions = [];
    const params = [];
    if (severity) {
      params.push(severity);
      conditions.push(`cvss_base_severity = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`vuln_status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(description_en ILIKE $${params.length} OR cve_id ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await req.orgPool.query(
      `SELECT COUNT(*)::int AS total FROM nvd ${where}`,
      params
    );
    const total = countRes.rows[0].total;

    const dataRes = await req.orgPool.query(
      `SELECT cve_id, source_identifier, published, last_modified, vuln_status,
              description_en, cvss_version, cvss_base_score, cvss_base_severity,
              cvss_vector_string, weaknesses, configurations, reference_list, raw, synced_at
         FROM nvd ${where}
         ORDER BY ${sort} ${sortDir}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      vulnerabilities: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nvd/db/:cve_id — single CVE detail
router.get('/db/:cve_id', async (req, res) => {
  try {
    const { cve_id } = req.params;
    const { rows } = await req.orgPool.query(
      'SELECT * FROM nvd WHERE cve_id = $1 LIMIT 1',
      [cve_id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'CVE not found' });
    res.json({ vulnerability: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nvd/stats — summary counts for dashboard header
router.get('/stats', async (req, res) => {
  try {
    const sev = await req.orgPool.query(
      `SELECT cvss_base_severity AS severity, COUNT(*)::int AS count
         FROM nvd GROUP BY cvss_base_severity`
    );
    const statusRes = await req.orgPool.query(
      `SELECT vuln_status AS status, COUNT(*)::int AS count
         FROM nvd GROUP BY vuln_status`
    );
    const totalRes = await req.orgPool.query(`SELECT COUNT(*)::int AS count FROM nvd`);
    const latestRes = await req.orgPool.query(
      `SELECT MAX(synced_at) AS last_synced FROM nvd`
    );
    res.json({
      total: totalRes.rows[0].count,
      lastSynced: latestRes.rows[0].last_synced,
      severityCounts: sev.rows,
      statusCounts: statusRes.rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
