#!/usr/bin/env node
/**
 * start-dev.js
 * ─────────────
 * Replaces `nodemon server.js` as the `dev` script.
 * On startup it:
 *   1. Checks if Docker is installed & running
 *   2. Ensures a Redis container ("ciso-redis") exists and is running on port 6379
 *   3. Waits for Redis to respond to PING
 *   4. Then launches `npx nodemon server.js`
 *
 * If Docker is unavailable the script prints a warning and still starts the
 * backend — Redis is optional (cache layer, degrades to Postgres).
 */

const { execSync, spawn } = require('child_process');

const CONTAINER = 'ciso-redis';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_IMAGE = 'redis:7-alpine';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 30000, ...opts }).toString().trim();
  } catch {
    return null;
  }
}

function log(msg) {
  console.log(`\x1b[36m[start-dev]\x1b[0m ${msg}`);
}

function warn(msg) {
  console.log(`\x1b[33m[start-dev]\x1b[0m ${msg}`);
}

function fail(msg) {
  console.log(`\x1b[31m[start-dev]\x1b[0m ${msg}`);
}

// ── 1. Check Docker ──────────────────────────────────────────────────────────

function ensureDocker() {
  const dockerPath = run('where docker');
  if (!dockerPath) {
    warn('Docker not found on PATH — skipping Redis auto-start.');
    warn('Start Redis manually or install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/');
    return false;
  }

  // Verify the Docker daemon is reachable
  const info = run('docker info --format "{{.ServerVersion}}"');
  if (!info) {
    warn('Docker daemon not running — skipping Redis auto-start.');
    warn('Start Docker Desktop and re-run, or start Redis manually.');
    return false;
  }

  log(`Docker ${info} detected`);
  return true;
}

// ── 2. Ensure Redis container ────────────────────────────────────────────────

function ensureRedis() {
  // Check if container already exists (running or stopped)
  const existing = run(`docker inspect --format="{{.State.Running}}" ${CONTAINER}`);

  if (existing === 'true') {
    log('Redis container already running');
    return true;
  }

  if (existing === 'false') {
    log('Starting existing Redis container…');
    run(`docker start ${CONTAINER}`);
    return true;
  }

  // Container doesn't exist — create it
  log(`Creating Redis container (${REDIS_IMAGE}, port ${REDIS_PORT})…`);
  const created = run(
    `docker run -d --name ${CONTAINER} -p ${REDIS_PORT}:6379 ${REDIS_IMAGE}`
  );

  if (!created) {
    warn('Failed to create Redis container — continuing without cache.');
    return false;
  }

  log(`Redis container created: ${created.substring(0, 12)}`);
  return true;
}

// ── 3. Wait for Redis PING ──────────────────────────────────────────────────

function waitForRedis(maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const pong = run(`docker exec ${CONTAINER} redis-cli PING`);
    if (pong === 'PONG') {
      log('Redis is ready (PING → PONG)');
      return true;
    }
  }
  warn('Redis did not respond to PING within 10s — continuing anyway.');
  return false;
}

// ── 4. Launch backend ───────────────────────────────────────────────────────

function startBackend() {
  log('Starting backend (nodemon)…\n');
  const child = spawn('npx', ['nodemon', 'server.js'], {
    stdio: 'inherit',
    shell: true,
  });

  // Forward signals so Ctrl+C kills both nodemon and Redis cleanup
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code) => {
    log(`Backend exited (code ${code})`);
    process.exit(code ?? 1);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  log('═══════════════════════════════════════════');
  log('  CISO Dashboard — Development Startup');
  log('═══════════════════════════════════════════\n');

  const dockerOk = ensureDocker();
  if (dockerOk) {
    const redisOk = ensureRedis();
    if (redisOk) {
      waitForRedis();
    }
  }

  startBackend();
})();
