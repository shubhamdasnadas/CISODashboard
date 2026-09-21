const express = require('express');
const router = express.Router();
const { syncScalefusion } = require('../services/scalefusion');

// GET /api/scalefusion/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials, updated_at FROM integration_credentials WHERE integration = 'scalefusion' LIMIT 1"
    );
    if (!rows[0]) return res.json({});
    return res.json({ ...rows[0].credentials, lastSyncedAt: rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/scalefusion/credentials
router.put('/credentials', async (req, res) => {
  try {
    const { baseUrl, apiToken } = req.body;
    if (!apiToken) {
      return res.status(400).json({ message: 'apiToken is required' });
    }
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, updated_at)
       VALUES ('scalefusion', $1, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         updated_at  = EXCLUDED.updated_at`,
      [JSON.stringify({ baseUrl: baseUrl || 'https://api-in.scalefusion.com/api/v1/devices.json', apiToken })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/scalefusion/sync — pull full response from the live Scale Fusion API into the per-org DB
router.post('/sync', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'scalefusion' LIMIT 1"
    );
    if (!rows[0]) return res.status(400).json({ message: 'Scale Fusion not configured — set apiToken in Settings first' });

    const result = await syncScalefusion(req.orgSlug, rows[0].credentials);
    res.json({
      success: true,
      message: 'Scale Fusion response synced',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scalefusion/response — full raw API response from DB
router.get('/response', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT data, synced_at FROM scalefusion_devices WHERE device_id = '__raw_response__' LIMIT 1"
    );
    if (!rows[0]) return res.json({ data: null, synced_at: null });
    res.json({ data: rows[0].data, synced_at: rows[0].synced_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;