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

// POST /api/nvd/sync — fetch startIndex=0, resultsPerPage=2000 and store.
// startIndex and resultsPerPage are fixed (0 .. 2000) and NOT exposed to the UI.
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

    const startIndex = 0;
    const resultsPerPage = 2000;

    const url = new URL(baseUrl);
    url.searchParams.set('startIndex', String(startIndex));
    url.searchParams.set('resultsPerPage', String(resultsPerPage));

    let attempt = 0;
    let response;
    // NVD is rate-limited; retry with backoff on 429 / 503.
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
      return res.status(response?.status || 500).json({
        message: `NVD API ${response?.status}: ${(body || '').slice(0, 200)}`,
      });
    }

    const json = await response.json();
    const vulnerabilities = Array.isArray(json.vulnerabilities) ? json.vulnerabilities : [];

    let inserted = 0;
    let updated = 0;
    for (const vuln of vulnerabilities) {
      const row = mapVulnerability(vuln, startIndex);
      if (!row.cve_id) continue;
      const r = await req.orgPool.query(
        `INSERT INTO nvd (
           cve_id, source_identifier, published, last_modified, vuln_status,
           description_en, description_es, cvss_version, cvss_base_score,
           cvss_base_severity, cvss_vector_string, weaknesses,
           configurations, reference_list, raw, source_index, synced_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
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
           synced_at          = NOW()`,
        [
          row.cve_id, row.source_identifier, row.published, row.last_modified,
          row.vuln_status, row.description_en, row.description_es, row.cvss_version,
          row.cvss_base_score, row.cvss_base_severity, row.cvss_vector_string,
          row.weaknesses,
          JSON.stringify(row.configurations),
          JSON.stringify(row.reference_list),
          JSON.stringify(row.raw),
          row.source_index,
        ]
      );
      if (r.rowCount === 1) inserted++; else updated++;
    }

    res.json({
      success: true,
      message: `Stored ${inserted} new / ${updated} updated CVEs (startIndex=${startIndex}, resultsPerPage=${resultsPerPage}, total=${json.totalResults})`,
      inserted,
      updated,
      totalResults: json.totalResults,
      startIndex,
      resultsPerPage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
