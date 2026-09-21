const express = require('express');
const router = express.Router();
const { syncSentinelOne } = require('../services/sentinelone');
const { syncHexnode } = require('../services/hexnode');
const { syncFirewall } = require('../services/firewall');
const { syncHarmony } = require('../services/harmony');
const { syncScalefusion } = require('../services/scalefusion');

// POST /api/sync/all  — trigger all integrations for the current org
router.post('/all', async (req, res) => {
  const pool = req.orgPool;
  const orgId = req.currentOrgId;
  const results = {};

  try {
    const { rows: credsRows } = await pool.query(
      'SELECT integration, credentials FROM integration_credentials'
    );
    const creds = {};
    credsRows.forEach(r => { creds[r.integration] = r.credentials; });

    if (creds.sentinelone) {
      try {
        results.sentinelone = await syncSentinelOne(orgId, creds.sentinelone);
      } catch (e) {
        results.sentinelone = { error: e.message };
      }
    }
    if (creds.hexnode) {
      try {
        results.hexnode = await syncHexnode(orgId, creds.hexnode);
      } catch (e) {
        results.hexnode = { error: e.message };
      }
    }
    if (creds.firewall) {
      try {
        results.firewall = await syncFirewall(orgId, creds.firewall);
      } catch (e) {
        results.firewall = { error: e.message };
      }
    }
    if (creds.harmony) {
      try {
        results.harmony = await syncHarmony(orgId, creds.harmony);
      } catch (e) {
        results.harmony = { error: e.message };
      }
    }
    if (creds.scalefusion) {
      try {
        results.scalefusion = await syncScalefusion(req.orgSlug, creds.scalefusion);
      } catch (e) {
        results.scalefusion = { error: e.message };
      }
    }

    res.json({ success: true, orgId, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sync/cron  — called by external cron schedulers, verifies CRON_SECRET
router.post('/cron', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.body?.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Invalid cron secret' });
  }
  // Respond immediately so the cron caller doesn't timeout; run sync in background
  res.json({ accepted: true });

  // Background execution — sync will run after response is sent
  setImmediate(async () => {
    try {
      const { centralPool, getOrgPool } = require('../db');
      const { rows: orgs } = await centralPool.query(
        'SELECT id, slug FROM organisations WHERE is_active = TRUE ORDER BY id'
      );
      for (const { id: orgId, slug: orgSlug } of orgs) {
        if (!orgSlug) continue;
        try {
          const pool = getOrgPool(orgSlug);
          const { rows: credsRows } = await pool.query(
            'SELECT integration, credentials FROM integration_credentials'
          );
          const creds = {};
          credsRows.forEach(r => { creds[r.integration] = r.credentials; });

          if (creds.sentinelone) await syncSentinelOne(orgSlug, creds.sentinelone).catch(console.error);
          if (creds.hexnode) await syncHexnode(orgSlug, creds.hexnode).catch(console.error);
          if (creds.firewall) await syncFirewall(orgSlug, creds.firewall).catch(console.error);
          if (creds.harmony) await syncHarmony(orgSlug, creds.harmony).catch(console.error);
          if (creds.scalefusion) await syncScalefusion(orgSlug, creds.scalefusion).catch(console.error);
        } catch (e) {
          console.error(`[cron-sync] org ${orgSlug} failed:`, e.message);
        }
      }
    } catch (e) {
      console.error('[cron-sync] global error:', e.message);
    }
  });
});

module.exports = router;
