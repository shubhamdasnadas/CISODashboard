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
//
// We therefore update ONLY the CPE column (cpe_match) of CVEs that already exist
// in this org's `nvd` table and whose stored configurations reference the returned
// cpeName. CVEs with no match are left untouched, and no new CVE rows are created
// from CPE data.
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

// Maximum number of unmatched records returned in the response.
// This protects Node.js from storing an extremely large response in memory.
const MAX_UNMATCHED_DATA = 10000;


// ============================================================
// GET /api/updated-cpes/credentials
// ============================================================
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      `SELECT credentials, updated_at
       FROM integration_credentials
       WHERE integration = $1
       LIMIT 1`,
      [INTEGRATION]
    );

    if (!rows[0]) {
      return res.json({});
    }

    const c = rows[0].credentials || {};

    return res.json({
      apiKey: c.apiKey || null,
      apiUrl: c.apiUrl || CPE_URL,
      lastModStartDate: c.lastModStartDate || null,
      lastModEndDate: c.lastModEndDate || null,
      lastSyncedAt: rows[0].updated_at,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
});


// ============================================================
// PUT /api/updated-cpes/credentials
// ============================================================
router.put('/credentials', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        message: 'apiKey is required',
      });
    }

    const creds = {
      apiKey: apiKey,
      apiUrl: apiUrl || CPE_URL,
      lastModStartDate: FIRST_RUN_START_DATE,
      lastModEndDate: null,
    };

    await req.orgPool.query(
      `INSERT INTO integration_credentials
        (integration, credentials, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at = EXCLUDED.updated_at`,
      [
        INTEGRATION,
        JSON.stringify(creds),
      ]
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
});


// ============================================================
// Resolve sync window
// ============================================================
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

  const startDate =
    stored.lastModEndDate ||
    stored.lastModStartDate ||
    FIRST_RUN_START_DATE;

  return {
    lastModStartDate: new Date(startDate).toISOString(),
    lastModEndDate: new Date().toISOString(),
    fromFrontend: false,
  };
}


// ============================================================
// Extract CPE criteria from CVE configurations
// ============================================================
function extractCpeCriteria(configurations) {
  const out = [];

  if (!Array.isArray(configurations)) {
    return out;
  }

  for (const cfg of configurations) {
    const nodes = Array.isArray(cfg.nodes)
      ? cfg.nodes
      : [];

    for (const node of nodes) {
      const matches = Array.isArray(node.cpeMatch)
        ? node.cpeMatch
        : [];

      for (const match of matches) {
        if (match && match.criteria) {
          out.push(match.criteria);
        }
      }
    }
  }

  return out;
}


// ============================================================
// POST /api/updated-cpes/sync
// ============================================================
//
// Body:
//
// {
//   apiKey,
//   apiUrl,
//   lastModStartDate,
//   lastModEndDate
// }
//
// Response contains:
//
// matched
// unmatched
// unmatchedCount
// unmatchedDataCount
// unmatchedDataTruncated
// unmatchedData
// ============================================================
router.post('/sync', async (req, res) => {
  try {
    const bodyApiKey =
      req.body && req.body.apiKey;

    const bodyApiUrl =
      req.body && req.body.apiUrl;

    // ----------------------------------------------------------
    // Get saved credentials
    // ----------------------------------------------------------
    const { rows: credRows } = await req.orgPool.query(
      `SELECT credentials
       FROM integration_credentials
       WHERE integration = $1
       LIMIT 1`,
      [INTEGRATION]
    );

    const creds =
      credRows[0]?.credentials || {};

    // Prefer API key supplied from frontend.
    // Otherwise use saved API key.
    const apiKey =
      bodyApiKey || creds.apiKey;

    // Always use CPE endpoint.
    // Do not use apiUrl from frontend because this route must
    // always call /cpes/2.0.
    const baseUrl = CPE_URL;

    if (!apiKey) {
      return res.status(400).json({
        message:
          'NVD apiKey missing — enter and save your API key first',
      });
    }

    console.log(
      '[updatedCPE sync][org=' +
      req.orgSlug +
      '] using user ' +
      (bodyApiKey ? 'supplied' : 'saved') +
      ' apiKey (len ' +
      apiKey.length +
      ') against ' +
      baseUrl
    );

    // ----------------------------------------------------------
    // Resolve date window
    // ----------------------------------------------------------
    const {
      lastModStartDate,
      lastModEndDate,
      fromFrontend,
    } = resolveWindow(
      req.body,
      creds
    );

    // ----------------------------------------------------------
    // Pagination configuration
    // ----------------------------------------------------------
    const resultsPerPage = 2000;
    const maxPages = 1000;

    // ----------------------------------------------------------
    // Counters
    // ----------------------------------------------------------
    let matched = 0;
    let cpeReturned = 0;
    let unmatched = 0;
    let totalResults = 0;
    let pages = 0;
    let startIndex = 0;

    // ----------------------------------------------------------
    // Store only a limited number of raw NVD responses.
    // Prevents OOM.
    // ----------------------------------------------------------
    const MAX_STORED_RESPONSES = 5;

    const apiResponses = [];

    // ----------------------------------------------------------
    // NEW:
    // Store actual unmatched CPE records.
    //
    // Example:
    //
    // {
    //   page: 1,
    //   startIndex: 0,
    //   cpeName: "...",
    //   cpeNameId: "...",
    //   cpe: {...}
    // }
    // ----------------------------------------------------------
    const unmatchedData = [];

    // ----------------------------------------------------------
    // Maps
    // ----------------------------------------------------------
    let cpeNameIdToCve = new Map();
    let cpeNameToCve = new Map();


    // ==========================================================
    // Rebuild existing CVE -> CPE maps
    // ==========================================================
    const rebuildMap = async () => {
      cpeNameIdToCve = new Map();
      cpeNameToCve = new Map();

      const CHUNK = 5000;
      let offset = 0;

      while (true) {
        const { rows: cveRows } =
          await req.orgPool.query(
            `SELECT cve_id, configurations, cpe_match
             FROM nvd
             WHERE configurations IS NOT NULL
                OR cpe_match IS NOT NULL
             LIMIT $1 OFFSET $2`,
            [
              CHUNK,
              offset,
            ]
          );

        if (cveRows.length === 0) {
          break;
        }

        for (const row of cveRows) {

          // ----------------------------------------------------
          // Build CPE name -> CVE map
          // ----------------------------------------------------
          const criteriaList =
            extractCpeCriteria(
              row.configurations
            );

          for (const criteria of criteriaList) {
            if (!cpeNameToCve.has(criteria)) {
              cpeNameToCve.set(
                criteria,
                []
              );
            }

            cpeNameToCve
              .get(criteria)
              .push(row.cve_id);
          }


          // ----------------------------------------------------
          // Build CPE name ID -> CVE map
          // ----------------------------------------------------
          let stored =
            row.cpe_match;

          if (typeof stored === 'string') {
            try {
              stored = JSON.parse(stored);
            } catch (parseError) {
              stored = null;
            }
          }

          const storedCpeNameId =
            stored &&
            (
              stored.cpeNameId ||
              (
                stored.cpe &&
                stored.cpe.cpeNameId
              )
            );

          if (storedCpeNameId) {
            if (!cpeNameIdToCve.has(
              storedCpeNameId
            )) {
              cpeNameIdToCve.set(
                storedCpeNameId,
                []
              );
            }

            cpeNameIdToCve
              .get(storedCpeNameId)
              .push(row.cve_id);
          }
        }

        offset += CHUNK;

        if (cveRows.length < CHUNK) {
          break;
        }
      }
    };


    // Build maps before processing NVD data.
    await rebuildMap();


    // ==========================================================
    // Process NVD CPE pages
    // ==========================================================
    while (true) {

      // --------------------------------------------------------
      // Maximum page protection
      // --------------------------------------------------------
      if (pages >= maxPages) {
        console.warn(
          '[updatedCPE sync][org=' +
          req.orgSlug +
          '] reached maxPages=' +
          maxPages +
          ' — stopping'
        );

        break;
      }


      // --------------------------------------------------------
      // Build NVD URL
      // --------------------------------------------------------
      const url =
        new URL(baseUrl);

      url.searchParams.set(
        'lastModStartDate',
        lastModStartDate
      );

      url.searchParams.set(
        'lastModEndDate',
        lastModEndDate
      );

      url.searchParams.set(
        'startIndex',
        String(startIndex)
      );

      url.searchParams.set(
        'resultsPerPage',
        String(resultsPerPage)
      );


      // --------------------------------------------------------
      // Call NVD
      // --------------------------------------------------------
      const json =
        await fetchNvdPage(
          url.toString(),
          apiKey,
          startIndex,
          resultsPerPage,
          req.orgSlug
        );


      // --------------------------------------------------------
      // Store limited raw API response
      // --------------------------------------------------------
      if (
        apiResponses.length <
        MAX_STORED_RESPONSES
      ) {
        apiResponses.push(json);
      }


      // --------------------------------------------------------
      // Read products
      // --------------------------------------------------------
      const products =
        Array.isArray(json.products)
          ? json.products
          : [];


      if (
        typeof json.totalResults ===
        'number'
      ) {
        totalResults =
          json.totalResults;
      }


      // No products means finished.
      if (products.length === 0) {
        break;
      }


      // --------------------------------------------------------
      // Collect DB updates for this page
      // --------------------------------------------------------
      const updates = [];


      // ========================================================
      // Process every CPE product
      // ========================================================
      for (const product of products) {

        const cpe =
          product &&
          product.cpe
            ? product.cpe
            : null;

        const cpeName =
          cpe &&
          cpe.cpeName;

        const cpeNameId =
          cpe &&
          cpe.cpeNameId;


        // Ignore invalid CPE records.
        if (!cpeName) {
          continue;
        }


        // Count every valid CPE returned by NVD.
        cpeReturned++;


        // ------------------------------------------------------
        // Find matching CVEs
        //
        // First:
        //   cpeNameId
        //
        // Fallback:
        //   cpeName
        // ------------------------------------------------------
        let cveIds = [];

        if (cpeNameId) {
          cveIds =
            cpeNameIdToCve.get(
              cpeNameId
            ) || [];
        }


        if (cveIds.length === 0) {
          cveIds =
            cpeNameToCve.get(
              cpeName
            ) || [];
        }


        // ======================================================
        // UNMATCHED
        // ======================================================
        if (cveIds.length === 0) {

          unmatched++;


          // ----------------------------------------------------
          // Store actual unmatched data.
          //
          // Limit it to MAX_UNMATCHED_DATA.
          // ----------------------------------------------------
          if (
            unmatchedData.length <
            MAX_UNMATCHED_DATA
          ) {
            unmatchedData.push({
              page: pages + 1,

              startIndex: startIndex,

              cpeName: cpeName,

              cpeNameId:
                cpeNameId || null,

              cpe: cpe,
            });
          }


          // Do NOT create/update a CVE.
          continue;
        }


        // ======================================================
        // MATCHED
        // ======================================================

        const cpeJson =
          JSON.stringify(cpe);


        for (const cveId of cveIds) {

          updates.push([
            cpeJson,
            cveId,
          ]);

          matched++;
        }


        // ------------------------------------------------------
        // Keep maps fresh for later pages.
        // ------------------------------------------------------
        if (cpeNameId) {

          if (
            !cpeNameIdToCve.has(
              cpeNameId
            )
          ) {
            cpeNameIdToCve.set(
              cpeNameId,
              []
            );
          }

          cpeNameIdToCve
            .get(cpeNameId)
            .push(...cveIds);
        }


        if (
          !cpeNameToCve.has(
            cpeName
          )
        ) {
          cpeNameToCve.set(
            cpeName,
            []
          );
        }

        cpeNameToCve
          .get(cpeName)
          .push(...cveIds);
      }


      // ========================================================
      // Update matched CVEs
      // ========================================================
      if (updates.length > 0) {

        const client =
          await req.orgPool.connect();

        try {

          await client.query(
            'BEGIN'
          );


          for (
            const [cpeJson, cveId]
            of updates
          ) {

            await client.query(
              `UPDATE nvd
               SET cpe_match = $1,
                   cpe_synced_at = NOW()
               WHERE cve_id = $2`,
              [
                cpeJson,
                cveId,
              ]
            );
          }


          await client.query(
            'COMMIT'
          );

        } catch (txErr) {

          await client.query(
            'ROLLBACK'
          );

          throw txErr;

        } finally {

          client.release();
        }
      }


      // --------------------------------------------------------
      // Increment page
      // --------------------------------------------------------
      pages++;


      console.log(
        '[updatedCPE sync][org=' +
        req.orgSlug +
        '] page ' +
        pages +
        ' — window ' +
        lastModStartDate +
        ' -> ' +
        lastModEndDate +
        ', products=' +
        products.length +
        ', matched=' +
        matched +
        ', unmatched=' +
        unmatched
      );


      // --------------------------------------------------------
      // Next page
      // --------------------------------------------------------
      startIndex +=
        resultsPerPage;


      if (
        products.length <
          resultsPerPage ||
        startIndex >= totalResults
      ) {
        break;
      }


      // NVD rate-limit protection.
      await sleep(6000);
    }


    // ============================================================
    // Save sync window
    // ============================================================
    await req.orgPool.query(
      `INSERT INTO integration_credentials
        (integration, credentials, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at = EXCLUDED.updated_at`,
      [
        INTEGRATION,
        JSON.stringify({
          ...creds,

          apiKey: apiKey,

          apiUrl: baseUrl,

          lastModStartDate:
            lastModStartDate,

          lastModEndDate:
            lastModEndDate,
        }),
      ]
    );


    // ============================================================
    // Calculate unmatched data information
    // ============================================================

    // TRUE when the number of unmatched records is greater than
    // the number actually returned in unmatchedData.
    //
    // Example:
    //
    // unmatched = 15000
    // unmatchedData.length = 10000
    //
    // unmatchedDataTruncated = true
    //
    const unmatchedDataTruncated =
      unmatched >
      unmatchedData.length;


    // ============================================================
    // Final logging
    // ============================================================
    console.log(
      '[updatedCPE sync][org=' +
      req.orgSlug +
      '] complete — matched=' +
      matched +
      ', unmatched=' +
      unmatched +
      ', unmatchedDataReturned=' +
      unmatchedData.length +
      ', cpeReturned=' +
      cpeReturned +
      ', pages=' +
      pages
    );


    // ============================================================
    // FINAL RESPONSE
    // ============================================================
    return res.json({

      // ----------------------------------------------------------
      // Status
      // ----------------------------------------------------------
      success: true,


      // ----------------------------------------------------------
      // Message
      // ----------------------------------------------------------
      message:
        'CPE sync complete: ' +
        matched +
        ' CVE CPE column(s) updated, ' +
        unmatched +
        ' CPEs unmatched (no existing CVE) ' +
        'across ' +
        pages +
        ' page(s).',


      // ----------------------------------------------------------
      // Sync window
      // ----------------------------------------------------------
      lastModStartDate:
        lastModStartDate,

      lastModEndDate:
        lastModEndDate,

      fromFrontend:
        fromFrontend,


      // ----------------------------------------------------------
      // Existing counts
      // ----------------------------------------------------------
      matched:
        matched,

      unmatched:
        unmatched,

      cpeReturned:
        cpeReturned,

      pages:
        pages,

      totalResults:
        totalResults,


      // ----------------------------------------------------------
      // Raw NVD responses
      //
      // Limited to MAX_STORED_RESPONSES.
      // ----------------------------------------------------------
      apiResponses:
        apiResponses,


      // ==========================================================
      // NEW UNMATCHED INFORMATION
      // ==========================================================

      // Total unmatched count.
      unmatchedCount:
        unmatched,


      // Actual unmatched CPE data.
      unmatchedData:
        unmatchedData,


      // Number of records included in unmatchedData.
      unmatchedDataCount:
        unmatchedData.length,


      // Indicates whether some unmatched records were omitted
      // because MAX_UNMATCHED_DATA was reached.
      unmatchedDataTruncated:
        unmatchedDataTruncated,


      // Maximum number of unmatched records returned.
      unmatchedDataLimit:
        MAX_UNMATCHED_DATA,
    });

  } catch (err) {

    console.error(
      '[updatedCPE sync][org=' +
      req.orgSlug +
      '] failed:',
      err
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


module.exports = router;