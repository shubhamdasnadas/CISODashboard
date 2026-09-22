const express = require('express');
const router = express.Router();
const { syncScalefusion, extractDevices, extractApplications } = require('../services/scalefusion');

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
      message: `Synced ${result.devices ?? 0} devices, ${result.applications ?? 0} applications`,
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

// GET /api/scalefusion/db/devices — enrolled devices
router.get('/db/devices', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT data FROM scalefusion_devices WHERE device_id != '__raw_response__' ORDER BY synced_at DESC"
    );
    if (rows.length > 0) {
      return res.json({ data: rows.map((r) => r.data) });
    }

    // Fallback: extract from __raw_response__ if individual records not yet inserted
    const raw = await req.orgPool.query(
      "SELECT data FROM scalefusion_devices WHERE device_id = '__raw_response__' LIMIT 1"
    );
    if (raw.rows[0]?.data) {
      const extracted = extractDevices(raw.rows[0].data);
      return res.json({ data: extracted });
    }

    res.json({ data: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scalefusion/db/applications — tracked applications
router.get('/db/applications', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      'SELECT data FROM scalefusion_applications ORDER BY synced_at DESC'
    );
    if (rows.length > 0) {
      return res.json({ data: rows.map((r) => r.data) });
    }

    // Fallback: extract from __raw_response__
    const raw = await req.orgPool.query(
      "SELECT data FROM scalefusion_devices WHERE device_id = '__raw_response__' LIMIT 1"
    );
    if (raw.rows[0]?.data) {
      const devs = extractDevices(raw.rows[0].data);
      const apps = extractApplications(raw.rows[0].data, devs);
      return res.json({ data: apps });
    }

    res.json({ data: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scalefusion/db/device-applications/flagged — flagged/blacklisted/mandatory device applications
router.get('/db/device-applications/flagged', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      `SELECT device_id, data FROM scalefusion_device_applications
       WHERE (data->>'black_listed')::boolean = true OR (data->>'mandatory_app')::boolean = true
       ORDER BY synced_at DESC`
    );
    res.json({ data: rows.map((r) => ({ deviceId: r.device_id, ...r.data })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
