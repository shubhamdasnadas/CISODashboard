const express = require('express');
const router = express.Router();
const { syncHarmony, getHarmonyToken } = require('../services/harmony');
const redis = require('../lib/redis');

// GET /api/harmony/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials, token FROM integration_credentials WHERE integration = 'harmony' LIMIT 1"
    );
    if (!rows[0]) return res.json({});
    return res.json({ ...rows[0].credentials, token: rows[0].token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/harmony/credentials
router.put('/credentials', async (req, res) => {
  try {
    const { clientId, accessKey, token } = req.body;
    if (!clientId || !accessKey) {
      return res.status(400).json({ message: 'clientId and accessKey are required' });
    }
    await req.orgPool.query(
      `INSERT INTO integration_credentials (integration, credentials, token, updated_at)
       VALUES ('harmony', $1, $2, NOW())
       ON CONFLICT (integration) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         token       = EXCLUDED.token,
         updated_at  = EXCLUDED.updated_at`,
      [JSON.stringify({ clientId, accessKey }), token ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/harmony/auth  — fetch a fresh bearer token for the stored credentials
router.get('/auth', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'harmony' LIMIT 1"
    );
    if (!rows[0]) return res.status(400).json({ message: 'Harmony not configured' });

    const { clientId, accessKey } = rows[0].credentials;
    const token = await getHarmonyToken(clientId, accessKey);

    // Cache token in DB
    await req.orgPool.query(
      "UPDATE integration_credentials SET token = $1, updated_at = NOW() WHERE integration = 'harmony'",
      [token]
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/harmony/sync
router.post('/sync', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      "SELECT credentials FROM integration_credentials WHERE integration = 'harmony' LIMIT 1"
    );
    if (!rows[0]) return res.status(400).json({ message: 'Harmony not configured' });

    const { eventTypes } = req.body;
    const result = await syncHarmony(req.orgSlug, rows[0].credentials, eventTypes);

    // Invalidate Redis cache on fresh sync
    if (req.orgSlug) {
      try {
        const client = await redis.getRedisClient();
        if (client) {
          const cacheKey = redis.buildCacheKey(req.orgSlug, 'harmony-events');
          await client.del(cacheKey);
        }
      } catch (_) {}
    }

    res.json({ success: true, message: `Synced ${result.upserted} events`, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/harmony/events  — read from DB with optional filters
router.get('/events', async (req, res) => {
  try {
    const { type, state, severity, limit = 20000, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;

    if (type) { conditions.push(`type = $${i++}`); params.push(type); }
    if (state) { conditions.push(`state = $${i++}`); params.push(state); }
    if (severity) { conditions.push(`severity = $${i++}`); params.push(severity); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));

    const { rows } = await req.orgPool.query(
      `SELECT * FROM checkpoint_events ${where} ORDER BY synced_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      params
    );
    const total = await req.orgPool.query(`SELECT COUNT(*) FROM checkpoint_events ${where}`, params.slice(0, -2));
    res.json({ events: rows, total: parseInt(total.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/harmony/events-db  — full event list from DB (accelerated by Redis)
router.get('/events-db', async (req, res) => {
  try {
    const orgSlug = req.orgSlug;
    const forceRefresh = req.query.refresh === 'true' || req.query.fresh === '1';

    // Check Redis cache first
    if (orgSlug && !forceRefresh) {
      try {
        const client = await redis.getRedisClient();
        if (client) {
          const cacheKey = redis.buildCacheKey(orgSlug, 'harmony-events');
          const hit = await client.get(cacheKey);
          if (hit) {
            const parsed = JSON.parse(hit);
            const events = Array.isArray(parsed)
              ? parsed
              : (Array.isArray(parsed?.events) ? parsed.events : null);
            // If cached data was from the old 350-limit build, bypass and refresh with full DB rows
            if (events && Array.isArray(events) && events.length !== 350) {
              return res.json({
                source: 'redis',
                events,
                lastSyncedAt: parsed.lastSyncedAt || null,
              });
            }
          }
        }
      } catch (redisErr) {
        console.warn('[harmony/events-db] Redis read fallback:', redisErr.message);
      }
    }

    const { rows } = await req.orgPool.query(
      'SELECT * FROM checkpoint_events ORDER BY event_created DESC NULLS LAST, synced_at DESC'
    );
    const lastSyncedAt = rows.length > 0 ? rows.reduce((latest, r) => {
      const t = r.synced_at ? new Date(r.synced_at) : null;
      return t && (!latest || t > latest) ? t : latest;
    }, null) : null;

    // Write all events to Redis cache with 300s TTL
    if (orgSlug) {
      try {
        const client = await redis.getRedisClient();
        if (client) {
          const cacheKey = redis.buildCacheKey(orgSlug, 'harmony-events');
          await client.set(
            cacheKey,
            JSON.stringify({ events: rows, lastSyncedAt: lastSyncedAt?.toISOString() ?? null }),
            { EX: 300 }
          );
        }
      } catch (_) {}
    }

    res.json({ source: 'postgres', events: rows, lastSyncedAt: lastSyncedAt?.toISOString() ?? null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
