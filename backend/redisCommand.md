# Redis Setup After Cloning on a New Machine (no Docker / no Redis yet)

This guide is for when you **clone the repo on another device** that does NOT have
Docker or Redis installed. Follow it point by point.

> TL;DR: The app **runs fine without Redis**. Redis is an optional performance
> layer. If Redis is absent, all reads fall back to Postgres automatically — no
> errors, no crashes, no hangs. You only need the steps in Section 3 if you
> actually want caching enabled on that machine.

---

## 0. ALL COMMANDS AT A GLANCE (copy-paste)

### Machine that ALREADY has Redis working (the original dev machine)
```bash
# Verify Redis is running
docker ps --filter name=ciso-redis
































# (Re)start Redis if stopped
docker start ciso-redis

# Health check — expect "✅ Redis UP"
cd backend && node scripts/cache-health.js

# Run the app
cd backend && npm run dev
```

### Fresh machine after clone/pull (NO Redis, NO Docker)
```bash
# 1. Backend deps
cd backend
npm install

# 2. Make sure .env exists; then DISABLE redis for now
#    edit .env and set:  REDIS_ENABLED=false

# 3. Apply migration (creates api_cache_data table)
node -e "require('dotenv').config();const fs=require('fs');const{Pool}=require('pg');const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});p.query(fs.readFileSync('migrations/20260818_api_cache_data.sql','utf8')).then(()=>{console.log('migration applied');return p.end();}).catch(e=>{console.error(e.message);process.exit(1);});"

# 4. Run (works without Redis — falls back to Postgres)
npm run dev

# 5. (Optional) Confirm fallback
node scripts/cache-health.js    # expect "⚠️ Redis DOWN … fall back to Postgres"
```

### Docker commands (if you choose to enable Redis)
```bash
docker --version                       # check Docker installed
docker info                            # check Docker daemon running
docker run -d --name ciso-redis -p 6379:6379 redis:7   # start Redis
docker ps --filter name=ciso-redis     # confirm running
docker logs ciso-redis                 # view logs
docker stop ciso-redis                 # stop
docker start ciso-redis                # start again (keeps data)
docker rm -f ciso-redis                # remove container
```

### Native Redis (no Docker)
```bash
# macOS
brew install redis && brew services start redis

# Ubuntu / WSL2 / Debian
sudo apt update && sudo apt install redis-server -y && sudo service redis-server start

# Windows — install Memurai (https://www.memurai.com/) or use WSL2 above
```

### Verify / populate (any machine with Redis enabled)
```bash
# Health
node scripts/cache-health.js

# List cached keys for an org (needs superAdmin token)
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/api/cache/debug/redis-keys?org=techsec"

# Per-page source (redis | postgres | miss)
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/api/cache/dashboard-aggregate"

# Force a sync now
curl -X POST -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/api/cache/dashboard-aggregate/refresh"

# API health endpoint
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/api/cache/health"
```

---

## 1. After `git clone` / `git pull` — base setup (always required)

```bash
# 1. Install backend deps (the redis npm package is already in package.json)
cd backend
npm install

# 2. Make sure your .env exists and has the DB + JWT vars
#    (redis vars are optional — see Section 2)
cp .env.example .env      # if an example exists; otherwise keep your existing .env

# 3. Apply DB migrations (central DB) — includes the api_cache_data table
node -e "require('dotenv').config();const fs=require('fs');const{Pool}=require('pg');const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});p.query(fs.readFileSync('migrations/20260818_api_cache_data.sql','utf8')).then(()=>{console.log('migration applied');return p.end();}).catch(e=>{console.error(e.message);process.exit(1);});"

# 4. Start backend + frontend as usual
npm run dev              # backend (cron scheduler auto-starts)
# in another terminal:
cd ../frontend && npm run dev
```

At this point the app works. Data is served from Postgres (`source: "postgres"`).

---

## 2. Decide: do you want Redis on this machine? (optional)

Check your `.env`:

```env
# If you DON'T have Redis installed, set this to false (recommended for dev):
REDIS_ENABLED=false

# If you DO have Redis running somewhere, point at it and enable:
# REDIS_ENABLED=true
# REDIS_URL=redis://localhost:6379
```

| You have… | Set in `.env` | Result |
|-----------|---------------|--------|
| Nothing (fresh machine) | `REDIS_ENABLED=false` | App runs, **no caching**, pure Postgres. Safe. |
| Redis running locally | `REDIS_ENABLED=true` + `REDIS_URL` | Full caching enabled. |
| Redis on another host/VPC | `REDIS_ENABLED=true` + remote `REDIS_URL` | Full caching over network. |

> Note: The committed `.env` currently has `REDIS_ENABLED=true` (tuned for the
> machine where Redis was proven working). On a fresh machine **change it to
> `false`** unless you install Redis (Section 3). Leaving it `true` with no Redis
> server still works — it just shows `⚠️ Redis DOWN` in the health check and falls
> back to Postgres. No crash.

---

## 3. (Only if you want caching) Install & run Redis on the new machine

### Option A — Docker (easiest, if Docker is available)
```bash
# Ensure Docker Desktop is running first, then:
docker run -d --name ciso-redis -p 6379:6379 redis:7

# Verify
docker ps --filter name=ciso-redis
```
→ then set `REDIS_ENABLED=true` and `REDIS_URL=redis://localhost:6379` in `.env`.

### Option B — No Docker? Use a native Redis (Windows)
- **Windows**: install via [Memurai](https://www.memurai.com/) (Redis-compatible,
  native Windows) or via WSL2: `wsl sudo apt update && wsl sudo apt install redis-server -y && wsl sudo service redis-server start`.
- **macOS**: `brew install redis && brew services start redis`.
- **Linux**: `sudo apt install redis-server -y && sudo service redis-server start`.

After install, confirm it listens on `6379` and set `REDIS_ENABLED=true`.

### Option C — Skip Redis entirely
Just keep `REDIS_ENABLED=false`. Everything works; you simply don't get the cache.
This is perfectly fine for development and even production if your DB is fast enough.

---

## 4. Verify on the new machine

```bash
cd backend

# A. Health check (works with or without Redis)
node scripts/cache-health.js
# No Redis → "⚠️ Redis DOWN … Reads fall back to Postgres"
# With Redis → "✅ Redis UP (latency …ms)"

# B. If Redis is enabled, check what's cached (superAdmin token required)
curl -H "Authorization: Bearer <TOKEN>" \
     "http://localhost:3000/api/cache/debug/redis-keys?org=techsec"

# C. Per-page source at read time
curl -H "Authorization: Bearer <TOKEN>" \
     "http://localhost:3000/api/cache/dashboard-aggregate"
# → source: "redis" (cached) | "postgres" (fallback) | "miss" (not synced)
```

---

## 5. Populate the cache (only needed when Redis is enabled)

Cron jobs auto-populate every 2–15 min depending on resource. To force it now:

```bash
# Trigger a sync for a resource (superAdmin or own org context)
curl -X POST -H "Authorization: Bearer <TOKEN>" \
     "http://localhost:3000/api/cache/dashboard-aggregate/refresh"
```

Then re-run Section 4B/4C — the key will appear with `source: "redis"`.

---

## 6. Quick decision tree (fresh clone)

```
Did you git clone on a new machine?
│
├─ Don't care about caching right now?
│     → set REDIS_ENABLED=false in .env → run npm install + npm run dev → DONE
│
└─ Want Redis caching?
      ├─ Have Docker?  → docker run … redis:7 → REDIS_ENABLED=true → DONE
      ├─ No Docker?    → install native redis (Option B) → REDIS_ENABLED=true → DONE
      └─ Remote Redis? → set REDIS_URL to it → REDIS_ENABLED=true → DONE
```

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Health shows `Redis DOWN` | No Redis server running / wrong URL | Install Redis (§3) or set `REDIS_ENABLED=false` |
| App hangs on start | Old client bug (fixed) — should not happen now | Ensure `lib/redis.js` has `disableOfflineQueue` + hard timeout |
| `source: "miss"` | Resource never synced | Trigger refresh (§5) or wait for cron |
| `source: "postgres"` | Redis down, fallback active | Normal when Redis absent; data still served |
| Keys not appearing | Backend not running (cron silent) | Start `npm run dev`; check server console for `[sync][org=…]` logs |
