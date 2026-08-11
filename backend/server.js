require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { centralPool, ensureOrgDatabases, getOrgPool, shutdownAllPools } = require('./db');
const { runMigration } = require('./migrate');
const { runSeedData } = require('./seed-data');

const authRoutes = require('./routes/auth');
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

// Sync services (for cron)
const { syncSentinelOne } = require('./services/sentinelone');
const { syncFirewall } = require('./services/firewall');
const { syncHarmony } = require('./services/harmony');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'CISO Dashboard API', status: 'running' });
});

// ─── Legacy routes (unchanged) ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
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
