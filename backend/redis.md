# Redis Caching Layer — CISO Dashboard

Multi-tenant (per-org) Redis cache-aside + write-through layer for the CISO Dashboard
backend. This file explains what it does, how to run it, and how to verify it.

---

## 1. What is this?

- A **cache-aside read** layer: reads check Redis first, fall back to Postgres on miss.
- A **write-through sync** layer: sync jobs fetch fresh data from external APIs →
  upsert into Postgres (`api_cache_data`) → mirror into Redis with a TTL.
- **Multi-tenant isolation**: every Redis key and every Postgres query is scoped by
  `orgSlug` (server-resolved from the JWT, never client input).
  - Redis key format: `cache:<orgSlug>:<resourceKey>`
  - Lock key format: `lock:<orgSlug>:<resourceKey>` (distributed lock via `SET NX EX`)
  - Postgres table: `api_cache_data` with `UNIQUE(org_slug, resource_key)`

---

## 2. Files involved

| File | Purpose |
|------|---------|
| `lib/redis.js` | Singleton Redis client, fail-fast connect, tenant key builders, `healthCheck()` |
| `services/syncService.js` | `syncAndCache()` (write-through) + `readCached()` (cache-aside) + per-resource fetchers/TTLs + distributed lock |
| `routes/cache.js` | `GET /api/cache/:resourceKey` (read), `POST /api/cache/:resourceKey/refresh` (manual), `/health`, superAdmin debug routes, Zoho webhook |
| `server.js` | Mounts `cacheRoutes` + registers **cron schedules** (one per resource) using `node-cron` |
| `migrations/20260818_api_cache_data.sql` | Creates `api_cache_data` table (central DB) |
| `scripts/cache-health.js` | CLI health check |
| `frontend/src/components/CacheCard.jsx` | Reusable card: shows `Live (cached)` / `Refreshed` / `DB (fallback)` + refresh button |
| `frontend/src/pages/Dashboard.jsx` | Reads `/cache/dashboard-aggregate`, shows a `Live (cached)` badge |

---

## 3. Registered cache resources (and schedules)

| resourceKey | TTL | Cron | Source |
|-------------|-----|------|--------|
| `dashboard-aggregate` | 120s | every 2 min | S1/Harmony/FW tables (whole dashboard) |
| `zoho-tickets` | 900s | every 15 min + webhook | Zoho Desk API |
| `sentinelone-agents` | 300s | every 5 min | SentinelOne API |
| `sentinelone-cves` | 300s | every 5 min | SentinelOne API |
| `sentinelone-threats` | 300s | every 5 min | SentinelOne API |
| `harmony-events` | 300s | every 5 min | Check Point Harmony |
| `firewall-reports` | 300s | every 5 min | Palo Alto Firewall |
| `sdwan-zabbix` | — | — | NMS poller — **NOT WIRED YET** (no `sdwan_poller.py` in repo) |
| `news` | 900s | every 15 min | NewsAPI |

---

## 4. Environment variables (`.env`)

```env
# Redis cache layer (optional — app works without it, falling back to Postgres)
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
REDIS_CONNECT_TIMEOUT_MS=5000

# Optional: path to SD-WAN/Zabbix poller JSON output (per org: <orgSlug>-sdwan.json)
# Only used once the sdwan-zabbix resource is wired (currently not registered).
# SDWAN_POLLER_OUTPUT=C:/path/to/nms
```

- `REDIS_ENABLED=false` OR unreachable `REDIS_URL` → cache layer is skipped, reads go
  straight to Postgres. **No crash, no hang** (client is fail-fast with a hard timeout).
- The distributed lock only engages when Redis is available; otherwise jobs run
  single-instance (safe).

---

## 5. How to run Redis (Docker — recommended)

```bash
# 1. Make sure Docker Desktop is running (start it if stopped):
#    Windows: launch "Docker Desktop" from the Start menu
#    Check daemon:
docker info

# 2. Start Redis (persists until you stop the container):
docker run -d --name ciso-redis -p 6379:6379 redis:7

# 3. Verify it is listening:
docker ps --filter name=ciso-redis
# or
docker logs ciso-redis
```

To stop / start later:
```bash
docker stop ciso-redis
docker start ciso-redis
```

---

## 6. Running steps (full setup)

```bash
# A. Start Redis (see section 5)
docker run -d --name ciso-redis -p 6379:6379 redis:7

# B. Configure backend/.env
#    set REDIS_ENABLED=true and REDIS_URL=redis://localhost:6379

# C. (One-time) Apply the cache migration to the central DB
node -e "require('dotenv').config();const fs=require('fs');const{Pool}=require('pg');const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});p.query(fs.readFileSync('migrations/20260818_api_cache_data.sql','utf8')).then(()=>{console.log('migration applied');return p.end();}).catch(e=>{console.error(e.message);process.exit(1);});"

# D. Start the backend (cron scheduler starts automatically)
cd backend
npm run dev        # or: node server.js

# E. Start the frontend
cd ../frontend
npm run dev
```

---

## 7. How to verify Redis is working (the proof)

### 7.1 CLI health check (no server needed)
```bash
cd backend
node scripts/cache-health.js
```
Expected (when up):
```
REDIS_ENABLED = true
REDIS_URL     = redis://localhost:6379
✅ Redis UP  (latency 39ms) — cache-aside reads hit Redis
```
Expected (when down):
```
⚠️  Redis DOWN (…)
   → Reads fall back to Postgres (api_cache_data). Caching disabled.
```

### 7.2 API health endpoint (while server runs)
```
GET /api/cache/health
→ { "redis": "up"|"down", "latencyMs": 39, "fallback": "…", "orgSlug": "techsec" }
```

### 7.3 List actual Redis keys for an org (superAdmin)
```
GET /api/cache/debug/redis-keys?org=techsec
→ { "org": "techsec", "count": 2,
     "keys": [
       { "key": "cache:techsec:zoho-tickets", "ttl": 842 },
       { "key": "cache:techsec:dashboard-aggregate", "ttl": 119 }
     ] }
```
**If a key is listed → that page's data is in Redis.**

### 7.4 Per-page source at read time
```
GET /api/cache/dashboard-aggregate
→ { "source": "redis" | "postgres" | "miss", "data": { … }, "updatedAt": "…" }
```
- `source: "redis"`     → ✅ served from Redis cache
- `source: "postgres"`  → ⚠️ Redis down, fell back to DB
- `source: "miss"`      → nothing synced yet for that resource

### 7.5 Trigger a manual sync / populate a key
```
POST /api/cache/dashboard-aggregate/refresh
POST /api/cache/zoho-tickets/refresh
```
Then re-check 7.3 / 7.4 — the key will appear with `source: "redis"`.

### 7.6 Frontend indicators
- Dashboard header shows a **`Live (cached)`** (indigo) or **`DB (fallback)`** (amber) badge.
- The Zoho cache card shows `Live (cached)` / `Refreshed just now` / `DB (fallback)`
  plus a refresh button.

---

## 8. Data flow summary

**Write (sync job / cron / webhook / manual refresh):**
```
external API ─► syncAndCache(orgSlug, resourceKey)
                 ├─ fetch fresh payload (fetcher, per resource)
                 ├─ BEGIN; upsert api_cache_data; COMMIT   (Postgres = source of truth)
                 └─ SET cache:<org>:<key> EX <ttl>          (Redis = mirror)
```

**Read (GET /api/cache/:resourceKey):**
```
Redis GET cache:<org>:<key>
  ├─ HIT  → return { source: "redis" }
  └─ MISS → SELECT from api_cache_data (NEVER calls external API here)
            → repopulate Redis → return { source: "postgres" }
```

---

## 9. Notes / known gaps

- `sdwan-zabbix` is **not registered** — there is no `sdwan_poller.py` in this repo.
  The cron will not try to sync it, so no error noise. When the poller exists,
  re-add the resource + fetcher in `services/syncService.js` (template in that file).
- The per-user `dashboard_layout` is intentionally **not** cached org-wide; it is
  fetched live from `/dashboard/layout` on the client.
- Distributed lock uses `SET NX EX`; a job that already holds the lock is skipped
  (`source: "skip-locked"`), preventing duplicate syncs across multiple instances.
