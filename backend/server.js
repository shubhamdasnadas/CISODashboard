require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { centralPool, ensureOrgDatabases, getOrgPool, shutdownAllPools } = require('./db');
const { runMigration } = require('./migrate');
const { runSeedData } = require('./seed-data');

const authRoutes = require('./routes/auth');
const auth2faRoutes = require('./routes/auth2fa');
const otpRoutes = require('./routes/otp');
const userRoutes = require('./routes/users');
const orgRoutes = require('./routes/organisations');
const tokenRoutes = require('./routes/apiTokens');
const { router: responseRoutes, fetchAndStore } = require('./routes/apiResponses');
const healthRoutes = require('./routes/health');
const osintRoutes = require('./routes/osint');
const osintWatchlistRoutes = require('./routes/osintWatchlist');
const mitreRoutes = require('./routes/mitre');

// Integration routes
const { authMiddleware } = require('./middleware/authMiddleware');
const { orgMiddleware } = require('./middleware/orgMiddleware');
const sentineloneRoutes = require('./routes/sentinelone');
const hexnodeRoutes = require('./routes/hexnode');
const firewallRoutes = require('./routes/firewall');
const harmonyRoutes = require('./routes/harmony');
const dashboardRoutes = require('./routes/dashboard');
const zohoRoutes = require('./routes/zoho');
const newsRoutes = require('./routes/news');
const projectsRoutes = require('./routes/projects');
const reportsRoutes = require('./routes/reportsRoute');
const notificationsRoutes = require('./routes/notificationsRoute');
const supportRoutes = require('./routes/support');
const billingRoutes = require('./routes/billing');
const analyticsRoutes = require('./routes/analyticsRoute');
const syncRoutes = require('./routes/syncRoute');
const adminOrgsRoutes = require('./routes/adminOrgs');
const memberRoutes = require('./routes/memberRoute');
const microsoftRoutes = require('./routes/microsoft');
const complianceHealthScoresRoutes = require('./routes/compliance_health_scores');
const nvdRoutes = require('./routes/nvd');
const nvdCpeRoutes = require('./routes/nvdCpe');
const updatedNvdRoutes = require('./routes/updatedNvd');
const updatedCpesRoutes = require('./routes/updatedCpes');
const cacheRoutes = require('./routes/cache');

// Sync services (for cron)
const { syncSentinelOne } = require('./services/sentinelone');
const { syncFirewall } = require('./services/firewall');
const { syncHarmony } = require('./services/harmony');

const app = express();

app.use(cors());
// Large JSON bodies: the report `data` object (Zoho/SentinelOne/Checkpoint/Palo
// Alto aggregates, especially raw Zoho ticket payloads) can be many MB, far past
// Express's 100KB default — so raise the cap well above any realistic report.
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.get('/', (req, res) => {
  res.json({ name: 'CISO Dashboard API', status: 'running' });
});

// ─── Legacy routes (unchanged) ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', auth2faRoutes);
app.use('/api/auth/otp', otpRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organisations', orgRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/osint', osintRoutes);
app.use('/api/osint-watchlist', osintWatchlistRoutes);
app.use('/api/mitre', mitreRoutes);

// ─── Integration routes (auth + org context required) ─────────────────────────
const withOrg = [authMiddleware, orgMiddleware];

app.use('/api/sentinelone', withOrg, sentineloneRoutes);
app.use('/api/hexnode',     withOrg, hexnodeRoutes);
app.use('/api/firewall',    withOrg, firewallRoutes);
app.use('/api/harmony',     withOrg, harmonyRoutes);
app.use('/api/dashboard',   withOrg, dashboardRoutes);
app.use('/api/zoho',        withOrg, zohoRoutes);
app.use('/api/news',        withOrg, newsRoutes);
app.use('/api/projects',    withOrg, projectsRoutes);
app.use('/api/reports',     withOrg, reportsRoutes);
app.use('/api/notifications', withOrg, notificationsRoutes);
app.use('/api/support', withOrg, supportRoutes);
app.use('/api/billing', withOrg, billingRoutes);
app.use('/api/analytics', withOrg, analyticsRoutes);
app.use('/api/sync', withOrg, syncRoutes);
app.use('/api/member', [authMiddleware], memberRoutes);
app.use('/api/microsoft', withOrg, microsoftRoutes);
app.use('/api/compliance-health-scores', withOrg, complianceHealthScoresRoutes);
app.use('/api/nvd', withOrg, nvdRoutes);
app.use('/api/nvd-cpe', withOrg, nvdCpeRoutes);
app.use('/api/updated-nvd', withOrg, updatedNvdRoutes);
app.use('/api/updated-cpes', withOrg, updatedCpesRoutes);
app.use('/api/cache', withOrg, cacheRoutes);

// Admin routes (superAdmin only — orgMiddleware not needed, uses centralPool directly)
app.use('/api/admin', [authMiddleware], adminOrgsRoutes);

/**
 * Legacy background job — every 1 minute, refresh generic api_tokens responses
 */
async function runBackgroundJob() {
  try {
    const { rows: orgs } = await centralPool.query('SELECT id, slug FROM organisations ORDER BY id ASC');
    let total = 0;

    for (const { id: orgId, slug: orgSlug } of orgs) {
      if (!orgSlug) continue;
      let tokens;
      try {
        const pool = getOrgPool(orgSlug);
        const r = await pool.query('SELECT api_name FROM api_tokens ORDER BY id ASC');
        tokens = r.rows;
      } catch (e) {
        console.error(`[cron] Cannot read tokens for org=${orgSlug}:`, e.message);
        continue;
      }

      for (const { api_name } of tokens) {
        try {
          await fetchAndStore(orgSlug, api_name);
          total += 1;
        } catch (e) {
          console.error(`[cron] Failed org=${orgSlug} api=${api_name}:`, e.message);
        }
      }
    }
    console.log(`[cron] Refreshed ${total} API token(s) across ${orgs.length} org(s).`);
  } catch (err) {
    console.error('[cron] Job error:', err.message);
  }
}

/**
 * Integration sync — every 30 minutes, sync all integrations for all orgs
 */
async function runIntegrationSync() {
  try {
    const { rows: orgs } = await centralPool.query(
      'SELECT id, slug FROM organisations WHERE is_active = TRUE ORDER BY id'
    );
    for (const { id: orgId, slug: orgSlug } of orgs) {
      if (!orgSlug) continue;
      try {
        const pool = getOrgPool(orgSlug);
        const { rows: credsRows } = await pool.query(
          'SELECT integration, credentials FROM integration_credentials'
        );
        const creds = {};
        credsRows.forEach(r => { creds[r.integration] = r.credentials; });

        if (creds.sentinelone) {
          await syncSentinelOne(orgSlug, creds.sentinelone).catch(e =>
            console.error(`[int-cron][org=${orgSlug}] S1 error:`, e.message)
          );
        }
        if (creds.firewall) {
          await syncFirewall(orgSlug, creds.firewall).catch(e =>
            console.error(`[int-cron][org=${orgSlug}] FW error:`, e.message)
          );
        }
        if (creds.harmony) {
          await syncHarmony(orgSlug, creds.harmony).catch(e =>
            console.error(`[int-cron][org=${orgSlug}] CP error:`, e.message)
          );
        }
      } catch (e) {
        console.error(`[int-cron] org ${orgSlug} failed:`, e.message);
      }
    }
    console.log('[int-cron] Integration sync complete');
  } catch (err) {
    console.error('[int-cron] Error:', err.message);
  }
}

// Every 1 minute — legacy api_token refresh
cron.schedule('*/15 * * * *', runBackgroundJob);

// Every 30 minutes — integration sync (S1, Firewall, Harmony)
cron.schedule('*/30 * * * *', runIntegrationSync);

// ─── Redis cache-layer scheduler ─────────────────────────────────────────────
// Loops through all active orgs and runs syncAndCache for each resource on its
// own schedule. syncAndCache itself acquires a distributed Redis lock (SET NX
// EX) so duplicate runs are prevented if the backend runs on multiple instances.
const syncService = require('./services/syncService');

// Per-resource cron expressions (independent schedules, per requirement).
const CACHE_CRON = {
  'sentinelone-agents': '*/5 * * * *', // every 5 min
  'sentinelone-cves':   '*/5 * * * *', // every 5 min
  'sentinelone-threats': '*/5 * * * *', // every 5 min
  'harmony-events':     '*/5 * * * *', // every 5 min
  'firewall-reports':   '*/5 * * * *', // every 5 min
  'zoho-tickets':       '*/2 * * * *', // 15-min fallback poller (webhook is real-time)
  'dashboard-aggregate': '*/2 * * * *', // every 2 min (covers all dashboard widgets)
  'news':               '*/15 * * * *', // every 15 min
};

async function runCacheSyncForAllOrgs(resourceKey) {
  try {
    const { rows: orgs } = await centralPool.query(
      'SELECT slug FROM organisations WHERE is_active = TRUE ORDER BY id'
    );
    for (const { slug: orgSlug } of orgs) {
      if (!orgSlug) continue;
      try {
        await syncService.syncAndCache(orgSlug, resourceKey);
      } catch (e) {
        console.error(`[cache-cron][org=${orgSlug}] ${resourceKey} failed:`, e.message);
      }
    }
    console.log(`[cache-cron] ${resourceKey} pass complete (${orgs.length} org(s))`);
  } catch (err) {
    console.error('[cache-cron] job error:', err.message);
  }
}

// Register one cron job per resource using its schedule.
Object.entries(CACHE_CRON).forEach(([resourceKey, expr]) => {
  cron.schedule(expr, () => runCacheSyncForAllOrgs(resourceKey));
});

// ─── Updated NVD (date-windowed) cron ──────────────────────────────────────────
// Hits the NVD "modified" API for the last 24h (yesterday -> today, dynamic) and
// upserts into the per-org `nvd` table. The apiKey + base URL come from the stored
// `nvd_modified` credentials (set via the Updated NVD page) when present; otherwise
// from the legacy `nvd` credentials; otherwise from env / defaults.
const NVD_CRON_API_KEY = process.env.NVD_API_KEY || '68bfccb2-c5a2-4d4d-9cf7-29a5fa8b0af8';
const NVD_CRON_API_URL = process.env.NVD_API_URL || 'https://services.nvd.nist.gov/rest/json/cves/2.0';

function nvdCronIso(dateStr, endOfDay = false) {
  if (!dateStr) return null;
  const d = new Date(dateStr + (endOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function runUpdatedNvdCron() {
  try {
    const { rows: orgs } = await centralPool.query(
      'SELECT slug FROM organisations WHERE is_active = TRUE ORDER BY id'
    );
    for (const { slug: orgSlug } of orgs) {
      if (!orgSlug) continue;
      try {
        const pool = getOrgPool(orgSlug);

        // Per-org aware: only sync orgs that actually have NVD configured.
        // Resolve apiKey + apiUrl from the org's stored credentials:
        //   nvd_modified (date-windowed) -> nvd (legacy) -> env/constants default.
        // If an org has NO NVD credentials stored at all, skip it — we must NOT
        // push the global default key into orgs that don't use NVD (e.g. pcpl,
        // acme, northwind, blueshield), which would create empty `nvd` rows for
        // tenants that never set it up.
        let apiKey = null;
        let apiUrl = NVD_CRON_API_URL;
        for (const integration of ['nvd_modified', 'nvd']) {
          const { rows } = await pool.query(
            'SELECT credentials FROM integration_credentials WHERE integration = $1 LIMIT 1',
            [integration]
          );
          const c = rows[0]?.credentials;
          if (c?.apiKey) { apiKey = c.apiKey; apiUrl = c.apiUrl || apiUrl; break; }
        }
        if (!apiKey) {
          console.log(`[updated-nvd-cron][org=${orgSlug}] skipped — no NVD credentials configured`);
          continue;
        }

        // Dynamic window: yesterday 00:00Z -> today 23:59:59Z (updates each run).
        const now = new Date();
        const start = new Date(now); start.setDate(start.getDate() - 1);
        const end = new Date(now); end.setDate(end.getDate());
        const lastModStartDate = nvdCronIso(start.toISOString().slice(0, 10));
        const lastModEndDate = nvdCronIso(end.toISOString().slice(0, 10), true);

        const result = await updatedNvdRoutes.runUpdatedNvdSync({
          apiKey, apiUrl, lastModStartDate, lastModEndDate, pool, orgSlug,
        });
        console.log(`[updated-nvd-cron][org=${orgSlug}] ${result.message}`);
      } catch (e) {
        console.error(`[updated-nvd-cron][org=${orgSlug}] failed:`, e.message);
      }
    }
    console.log('[updated-nvd-cron] pass complete');
  } catch (err) {
    console.error('[updated-nvd-cron] job error:', err.message);
  }
}

// Every 2 minutes — pull the last 24h of modified CVEs.
cron.schedule('*/2 * * * *', runUpdatedNvdCron);

async function main() {
  try {
    await centralPool.query('SELECT 1');
    console.log(`🔌 Central DB connection OK (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'cisodashboard'})`);
  } catch (err) {
    console.error('\n❌ FATAL: Cannot connect to the central PostgreSQL database.\n');
    console.error('   Check these in backend/.env:');
    console.error('     DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
    console.error('   And make sure you ran setup.sql in pgAdmin to create the database.\n');
    console.error('   Underlying error:', err.message, '\n');
    process.exit(1);
  }

  await ensureOrgDatabases();
  await runMigration();
  await runSeedData();
  await ensureCentral2faSchema();

  // 4. Start the HTTP server.
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://10.134.243.128:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ FATAL: Port ${PORT} is already in use.`);
    } else {
      console.error('\n❌ FATAL: HTTP server error:', err.message, '\n');
    }
    process.exit(1);
  });

  setTimeout(runBackgroundJob, 3000);
}

/**
 * Idempotent central-schema patch for the 2FA login flow. Lets existing
 * databases pick up the new `email` column and `login_sessions` table
 * without re-running setup.sql (which would wipe data).
 */
async function ensureCentral2faSchema() {
  try {
    await centralPool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)"
    );
    await centralPool.query(`
      CREATE TABLE IF NOT EXISTS login_sessions (
        id              VARCHAR(36) PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        otp_hash        VARCHAR(255),
        otp_code        VARCHAR(6),
        otp_attempts    INTEGER NOT NULL DEFAULT 0,
        otp_expires_at  TIMESTAMPTZ,
        access_token    TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
      )
    `);
    await centralPool.query(
      "CREATE INDEX IF NOT EXISTS idx_login_sessions_expires ON login_sessions(expires_at)"
    );
    await centralPool.query(`
      CREATE TABLE IF NOT EXISTS user_otps (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await centralPool.query(
      "CREATE INDEX IF NOT EXISTS idx_user_otps_user_lookup ON user_otps(user_id, is_used, created_at DESC)"
    );
    // Seed emails for the demo users if missing so the 2FA flow is testable.
    await centralPool.query(`
      UPDATE users SET email = username || '@ciso.local'
      WHERE email IS NULL
    `);
    console.log('✔  2FA schema ensured (email column + login_sessions table)');
  } catch (err) {
    console.error('❌ 2FA schema patch failed:', err.message);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await shutdownAllPools();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await shutdownAllPools();
  process.exit(0);
});
