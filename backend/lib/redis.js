const { createClient } = require('redis');

/**
 * Singleton Redis client (cache layer for the multi-tenant dashboard).
 *
 * - Connection string comes from process.env.REDIS_URL.
 * - Connection errors are logged but never crash the process (cache is a
 *   performance layer — the app must keep working if Redis is down; reads
 *   fall back to Postgres, see services/syncService.js).
 * - Exposes an async getRedisClient() so callers can lazily await a ready client.
 */

let _client = null;
let _connecting = null;

function buildClient() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createClient({
    url,
    // Don't queue commands while offline and don't retry — the cache is
    // optional, so a dead Redis must degrade to Postgres immediately.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
      // NO auto-reconnect: if the socket can't be established we want
      // connect() to reject so getRedisClient() falls back to Postgres.
      reconnectStrategy: () => false,
    },
  });

  client.on('error', (err) => {
    console.error('[redis] client error:', err.message);
  });

  client.on('reconnecting', () => {
    console.warn('[redis] reconnecting…');
  });

  client.on('ready', () => {
    console.log('[redis] connected and ready');
  });

  return client;
}

/**
 * Returns a ready-to-use Redis client (singleton).
 * Creates + connects on first call; subsequent calls reuse the same instance.
 * Resolves to null if Redis is explicitly disabled (REDIS_ENABLED=false) so
 * callers can gracefully skip caching.
 */
async function getRedisClient() {
  if (process.env.REDIS_ENABLED === 'false') return null;
  if (_client && _client.isReady) return _client;

  if (!_connecting) {
    _client = buildClient();
    const connectPromise = _client.connect().catch((err) => {
      console.error('[redis] connection failed (continuing without cache):', err.message);
      _client = null;
      return null;
    });
    // Hard ceiling: never let a dead/unreachable Redis block a request or the
    // scheduler. If connect() hasn't settled within the timeout, treat Redis as
    // unavailable and fall back to Postgres.
    _connecting = Promise.race([
      connectPromise,
      new Promise((resolve) =>
        setTimeout(resolve, parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10) + 500)
      ).then(() => null),
    ]);
  }

  try {
    await _connecting;
  } finally {
    _connecting = null;
  }
  return _client && _client.isReady ? _client : null;
}

/** True if a usable Redis client is available right now. */
async function isRedisAvailable() {
  const c = await getRedisClient();
  return !!c;
}

/**
 * Fast liveness probe: PING Redis with a short timeout. Returns
 * { up: boolean, latencyMs?, error? }. Never throws. Safe to call from a
 * status endpoint or a CLI health check. Works even if no connection yet.
 */
async function healthCheck() {
  const start = Date.now();
  let client = null;
  try {
    client = await getRedisClient();
    if (!client) return { up: false, error: 'disabled (REDIS_ENABLED=false or connection down)' };
    const pong = await Promise.race([
      client.ping(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), 2000)),
    ]);
    return { up: pong === 'PONG', latencyMs: Date.now() - start };
  } catch (err) {
    return { up: false, error: err.message, latencyMs: Date.now() - start };
  }
}

/** Best-effort shutdown (used on server teardown). */
async function closeRedis() {
  if (_client) {
    try { await _client.quit(); } catch { /* ignore */ }
    _client = null;
  }
}

// ─── Multi-tenant key helpers ─────────────────────────────────────────────────
// Every cache key is ALWAYS scoped by orgSlug. The key is built ONLY from the
// server-resolved org slug (req.orgSlug), never from any client-supplied value.
// These helpers throw if an orgSlug is missing, which is the loud safeguard
// against cross-tenant key collisions / data leakage.

function buildCacheKey(orgSlug, resourceKey) {
  if (!orgSlug || typeof orgSlug !== 'string' || orgSlug.length === 0) {
    throw new Error('buildCacheKey: orgSlug is required and must be non-empty (tenant isolation)');
  }
  if (!resourceKey || typeof resourceKey !== 'string' || resourceKey.length === 0) {
    throw new Error('buildCacheKey: resourceKey is required and must be non-empty');
  }
  return `cache:${orgSlug}:${resourceKey}`;
}

function buildLockKey(orgSlug, resourceKey) {
  if (!orgSlug) throw new Error('buildLockKey: orgSlug is required (tenant isolation)');
  return `lock:${orgSlug}:${resourceKey}`;
}

module.exports = {
  getRedisClient,
  isRedisAvailable,
  healthCheck,
  closeRedis,
  buildCacheKey,
  buildLockKey,
};
