const express = require('express');
const router = express.Router();
const { requireSuperAdmin } = require('../middleware/authMiddleware');
const syncService = require('../services/syncService');
const redis = require('../lib/redis');

// GET /api/cache/health — quick liveness check for the Redis cache layer.
// Lets you confirm at a glance whether cache-aside reads are hitting Redis
// or falling back to Postgres. No auth requirements beyond the org middleware.
router.get('/health', async (req, res) => {
  const health = await redis.healthCheck();
  res.json({
    redis: health.up ? 'up' : 'down',
    ...health,
    fallback: health.up ? 'none (Redis is primary)' : 'postgres (Redis unavailable — reads fall back to DB)',
    orgSlug: req.orgSlug,
  });
});

// GET /api/cache/:resourceKey — cache-aside read for the CURRENT org (req.orgSlug).
// Redis first; on miss, Postgres (never an external API). Responds with a
// `source` field ("redis" | "postgres" | "miss") for debugging.
router.get('/:resourceKey', async (req, res) => {
  const { resourceKey } = req.params;
  const orgSlug = req.orgSlug; // server-resolved — never from client body
  try {
    const result = await syncService.readCached(orgSlug, resourceKey);
    if (result.source === 'miss') {
      return res.status(404).json({
        source: 'miss',
        message: 'No cached data yet — trigger a sync first.',
        resourceKey,
      });
    }
    res.json({
      source: result.source,
      orgSlug,
      resourceKey,
      data: result.payload,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cache/:resourceKey/refresh — manual sync trigger (refresh button).
router.post('/:resourceKey/refresh', async (req, res) => {
  const { resourceKey } = req.params;
  const orgSlug = req.orgSlug;
  try {
    const result = await syncService.syncAndCache(orgSlug, resourceKey);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Debug / ops (superAdmin only) ─────────────────────────────────────────────

// GET /api/cache/debug/redis-keys?org=acme — list Redis keys for an org.
router.get('/debug/redis-keys', requireSuperAdmin, async (req, res) => {
  const orgSlug = req.query.org;
  if (!orgSlug) return res.status(400).json({ message: 'org query param required' });
  try {
    const client = await redis.getRedisClient();
    if (!client) return res.json({ redis: 'unavailable', keys: [] });
    const keys = await client.keys(`cache:${orgSlug}:*`);
    const withTtl = await Promise.all(
      keys.map(async (k) => ({ key: k, ttl: await client.ttl(k) }))
    );
    res.json({ org: orgSlug, count: withTtl.length, keys: withTtl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cache/debug/sync — manually trigger sync for a given org + resource.
router.post('/debug/sync', requireSuperAdmin, async (req, res) => {
  const { org, resourceKey } = req.body;
  if (!org || !resourceKey) {
    return res.status(400).json({ message: 'org and resourceKey are required' });
  }
  try {
    const result = await syncService.syncAndCache(org, resourceKey);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cache/zoho/webhook — Zoho Desk ticket events.
// Real-time trigger: call syncAndCache for zoho-tickets immediately, then
// return 200 quickly so Zoho doesn't retry. Independent of the 15-min poller.
router.post('/zoho/webhook', async (req, res) => {
  // Always ack Zoho fast; do the heavy sync after responding.
  res.status(200).json({ received: true });
  const orgSlug = req.orgSlug;
  if (!orgSlug) return;
  syncService.syncAndCache(orgSlug, 'zoho-tickets')
    .then(() => console.log(`[webhook][org=${orgSlug}] zoho-tickets synced`))
    .catch((e) => console.error(`[webhook][org=${orgSlug}] zoho-tickets sync failed:`, e.message));
});

module.exports = router;
