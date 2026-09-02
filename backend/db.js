const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'root';
const CENTRAL_DB = process.env.DB_NAME || 'cisodashboard';

/**
 * CENTRAL POOL — connects to the central identity DB (`cisodashboard`).
 * Holds the organisations registry, users, super_admin. Nothing org-specific.
 */
const centralPool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: CENTRAL_DB,
  user: DB_USER,
  password: DB_PASSWORD,
});

// Log only once (on first connect), not on every new client checkout.
let _centralLogged = false;
centralPool.on('connect', () => {
  if (!_centralLogged) {
    console.log(`✅ Connected to central database: ${CENTRAL_DB}`);
    _centralLogged = true;
  }
});

centralPool.on('error', (err) => {
  // IMPORTANT: do NOT call process.exit() here.
  // 'error' is emitted on the IDLE pool when the underlying TCP connection
  // to Postgres drops (server restart, network blip, idle timeout).
  // The next query will automatically re-establish a fresh connection.
  // Killing the process here means every subsequent request returns 500
  // until you restart the Node server.
  console.error('⚠️  Central pool error (will reconnect on next query):', err.message);
});

/**
 * PER-ORG POOL CACHE — one Pool instance per org database.
 * Pool connections are expensive, so we reuse them.
 */
const orgPoolCache = new Map(); // orgSlug -> Pool

function getOrgPool(orgSlug) {
  if (!orgSlug || typeof orgSlug !== 'string') {
    throw new Error(`getOrgPool: invalid orgSlug "${orgSlug}"`);
  }

  if (orgPoolCache.has(orgSlug)) return orgPoolCache.get(orgSlug);

  const dbName = `ciso_org_${orgSlug}`;
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: dbName,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  pool.on('error', (err) => {
    console.error(`❌ Unexpected error on org pool ${dbName}:`, err);
  });

  orgPoolCache.set(orgSlug, pool);
  console.log(`✅ Connected to per-org database: ${dbName}`);
  return pool;
}

/**
 * Resolve an integer org ID to its slug (used in routes that receive integer IDs).
 * Returns null if not found.
 */
async function getOrgSlug(orgId) {
  const { rows } = await centralPool.query('SELECT slug FROM organisations WHERE id = $1', [orgId]);
  return rows[0]?.slug ?? null;
}

/**
 * Run a one-shot query against the postgres maintenance DB.
 * Used for CREATE DATABASE which can't run inside a transaction.
 */
async function withMaintenanceClient(fn) {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: 'postgres',
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Run a single .sql file against a given pool.
 */
async function applySchema(pool, sqlPath) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

/**
 * Convert an arbitrary string into a safe, lowercase slug.
 * "Acme Corp!" -> "acme-corp", "Techsec Global" -> "techsec-global".
 * Drops leading/trailing/duplicate separators.
 */
function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics -> single dash
    .replace(/^-+|-+$/g, '')     // trim leading/trailing dashes
    .replace(/-{2,}/g, '-');      // collapse repeats
}

/**
 * Build a slug from `org_name`, guaranteeing it is unique across the
 * organisations table. Falls back to a "org-N" suffix if the name yields
 * nothing usable. Retries up to 100 times before throwing.
 */
async function generateUniqueSlug(orgName, providedSlug) {
  let base = providedSlug ? slugify(providedSlug) : slugify(orgName);
  if (!base) base = 'org';

  let slug = base;
  for (let i = 1; i <= 100; i++) {
    const { rows } = await centralPool.query('SELECT 1 FROM organisations WHERE slug = $1', [slug]);
    if (rows.length === 0) return slug;
    slug = `${base}-${i}`;
  }
  throw new Error('Could not generate a unique slug (too many collisions)');
}

/**
 * Create the per-org database `ciso_org_<slug>` if it doesn't exist yet,
 * then apply the per-org schema. Returns true if the DB was newly created.
 * `slug` MUST already be sanitised/validated by the caller.
 */
async function createOrgDatabase(orgSlug) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(orgSlug)) {
    throw new Error(`Refusing to CREATE DATABASE with unsafe slug: ${orgSlug}`);
  }
  const dbName = `ciso_org_${orgSlug}`;

  const created = await withMaintenanceClient(async (client) => {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (r.rows.length > 0) return false;
    // CREATE DATABASE cannot use a parameterised name — sanitise manually.
    await client.query(`CREATE DATABASE "${dbName}"`);
    return true;
  });

  if (created) {
    console.log(`🆕 Created database: ${dbName}`);
  }

  // Always apply the per-org schema (idempotent via CREATE TABLE IF NOT EXISTS).
  const pool = getOrgPool(orgSlug);
  const schemaPath = path.join(__dirname, 'schema_per_org.sql');
  await applySchema(pool, schemaPath);
  return created;
}

/**
 * Drop a per-org database. Postgres requires connecting to a different DB to
 * drop one, and no other sessions may be using it — so the cached pool is
 * closed first. Returns true if a DB was actually dropped.
 */
async function dropOrgDatabase(orgSlug) {
  const dbName = `ciso_org_${orgSlug}`;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(orgSlug)) {
    throw new Error(`Refusing to DROP DATABASE with unsafe slug: ${orgSlug}`);
  }
  closeOrgPool(orgSlug);

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: 'postgres',
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    return true;
  } finally {
    await client.end();
  }
}

/**
 * On startup:
 *  1. Ensure central DB exists (it must — schema.sql creates it).
 *  2. Read all orgs from central registry.
 *  3. For each org, ensure `ciso_org_<id>` exists with the per-org schema.
 *
 * Safe to call repeatedly — skips DBs that already exist.
 */
async function ensureOrgDatabases() {
  // 1. Make sure central DB exists (best-effort — usually it does).
  await withMaintenanceClient(async (client) => {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [CENTRAL_DB]);
    if (exists.rows.length === 0) {
      console.log(`⚠️  Central database ${CENTRAL_DB} does not exist. Run schema.sql first.`);
    }
  });

  // 2. Read orgs from central registry.
  const { rows: orgs } = await centralPool.query(
    'SELECT id, slug, org_name FROM organisations ORDER BY id ASC'
  );

  if (orgs.length === 0) {
    console.log('ℹ️  No organisations registered — skipping per-org DB setup.');
    return [];
  }

  // 3. Ensure each per-org DB exists with the schema.
  // Per-org errors are caught and logged so a single bad org can't
  // kill the whole server startup. Each org is processed independently.
  const succeeded = [];
  const failed = [];

  for (const org of orgs) {
    const orgSlug = org.slug;
    if (!orgSlug) {
      console.warn(`⚠️  Skipped org ${org.id} (${org.org_name}): no slug set`);
      failed.push({ id: org.id, name: org.org_name, error: 'missing slug' });
      continue;
    }
    try {
      const created = await createOrgDatabase(orgSlug);
      if (!created) console.log(`✔  Database exists: ciso_org_${orgSlug}`);
      succeeded.push(orgSlug);
    } catch (e) {
      console.error(`⚠️  Skipped org ${org.id} (${org.org_name}):`, e.message);
      failed.push({ id: org.id, name: org.org_name, error: e.message });
    }
  }

  if (failed.length) {
    console.warn(`⚠️  ${failed.length} organisation(s) had setup issues: ${failed.map((f) => f.name).join(', ')}`);
    console.warn(`    Server is starting anyway. Fix the listed issues and restart.`);
  }

  return succeeded;
}

/**
 * Drop the cached pool for a given org (used after deleting an org).
 */
function closeOrgPool(orgSlug) {
  const pool = orgPoolCache.get(orgSlug);
  if (pool) {
    pool.end().catch(() => {});
    orgPoolCache.delete(orgSlug);
    console.log(`🛑 Closed pool for ciso_org_${orgSlug}`);
  }
}

/**
 * Best-effort shutdown of all pools.
 */
async function shutdownAllPools() {
  for (const pool of orgPoolCache.values()) {
    try { await pool.end(); } catch { /* ignore */ }
  }
  try { await centralPool.end(); } catch { /* ignore */ }
}

module.exports = {
  centralPool,
  getOrgPool,
  getOrgSlug,
  ensureOrgDatabases,
  createOrgDatabase,
  dropOrgDatabase,
  generateUniqueSlug,
  slugify,
  closeOrgPool,
  shutdownAllPools,
};