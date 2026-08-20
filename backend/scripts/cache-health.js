// CLI: check the Redis cache layer health.
//   node scripts/cache-health.js
// Prints whether Redis is up/down and what the fallback behavior is.
require('dotenv').config();
const redis = require('../lib/redis');

(async () => {
  console.log(`REDIS_ENABLED = ${process.env.REDIS_ENABLED}`);
  console.log(`REDIS_URL     = ${process.env.REDIS_URL || '(default redis://localhost:6379)'}`);
  const h = await redis.healthCheck();
  if (h.up) {
    console.log(`✅ Redis UP  (latency ${h.latencyMs}ms) — cache-aside reads hit Redis`);
  } else {
    console.log(`⚠️  Redis DOWN (${h.error || 'no connection'})`);
    console.log('   → Reads fall back to Postgres (api_cache_data). Caching disabled.');
  }
  await redis.closeRedis();
  process.exit(0);
})();
