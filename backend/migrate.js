/**
 * One-shot migration: copy existing api_tokens + api_responses rows from the
 * central DB into each per-org database (ciso_org_<id>).
 *
 * Idempotent — each per-org DB has a `_migration_done` flag table.
 * If the flag row exists, that org is skipped.
 *
 * Auto-runs at startup. Can also be invoked manually: `node migrate.js`.
 */

const { centralPool, getOrgPool } = require('./db');

async function isMigrated(orgPool) {
  const r = await orgPool.query('SELECT 1 FROM _migration_done LIMIT 1');
  return r.rows.length > 0;
}

async function markMigrated(orgPool) {
  await orgPool.query('INSERT INTO _migration_done DEFAULT VALUES');
}

async function applySchemaPatches(orgPool, slug) {
  await orgPool.query(
    'ALTER TABLE s1_agents ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ'
  );

  // Reports: add columns so generated PDFs are stored/referenced in the DB
  // alongside the on-disk file under backend/reportList/<orgSlug>/.
  // ADD COLUMN IF NOT EXISTS keeps this idempotent across restarts.
  await orgPool.query(
    'ALTER TABLE reports ADD COLUMN IF NOT EXISTS file_path TEXT'
  );
  await orgPool.query(
    'ALTER TABLE reports ADD COLUMN IF NOT EXISTS org_slug TEXT'
  );
  await orgPool.query(
    'ALTER TABLE reports ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ'
  );
  // Ensure all Microsoft tables exist (idempotent)
  const msTables = [
    'ms_organization','ms_subscribed_skus','ms_domains','ms_users',
    'ms_audit_sign_ins','ms_audit_directory','ms_audit_provisioning',
    'ms_risky_users','ms_risk_detections','ms_risky_service_principals',
    'ms_security_incidents','ms_security_alerts','ms_secure_scores',
    'ms_secure_score_profiles','ms_managed_devices','ms_compliance_policies',
    'ms_device_configurations','ms_applications','ms_service_principals',
    'ms_service_health','ms_service_issues',
    'ms_purview_trigger','ms_purview_label',
    'ms_mgmt_activity_subscriptions',
    'ms_defender_machines','ms_defender_alerts','ms_defender_vulnerabilities',
    'ms_defender_recommendations','ms_defender_software','ms_defender_indicators',
    'ms_defender_investigations','ms_defender_library_files',
  ];
  for (const t of msTables) {
    await orgPool.query(`CREATE TABLE IF NOT EXISTS ${t} (id SERIAL PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }
  console.log(`✔  ciso_org_${slug}: schema patches applied`);
}

async function migrateOrg(org) {
  const orgPool = getOrgPool(org.slug);

  await applySchemaPatches(orgPool, org.slug);

  if (await isMigrated(orgPool)) {
    console.log(`✔  ciso_org_${org.slug}: already migrated`);
    return { tokens: 0, responses: 0 };
  }

  // Copy tokens
  const { rows: tokens } = await centralPool.query(
    'SELECT api_name, token, created_at FROM api_tokens WHERE org_id = $1 ORDER BY id ASC',
    [org.id]
  );
  for (const t of tokens) {
    await orgPool.query(
      'INSERT INTO api_tokens (api_name, token, created_at) VALUES ($1, $2, $3)',
      [t.api_name, t.token, t.created_at || new Date()]
    );
  }

  // Copy responses
  const { rows: responses } = await centralPool.query(
    'SELECT api_name, response_data, fetched_at FROM api_responses WHERE org_id = $1 ORDER BY id ASC',
    [org.id]
  );
  for (const r of responses) {
    await orgPool.query(
      'INSERT INTO api_responses (api_name, response_data, fetched_at) VALUES ($1, $2::jsonb, $3)',
      [r.api_name, JSON.stringify(r.response_data), r.fetched_at || new Date()]
    );
  }

  await markMigrated(orgPool);
  console.log(`✔  ciso_org_${org.slug}: migrated ${tokens.length} token(s), ${responses.length} response(s)`);

  return { tokens: tokens.length, responses: responses.length };
}

async function runMigration() {
  console.log('🚚 Starting data migration to per-org databases...');
  const { rows: orgs } = await centralPool.query(
    'SELECT id, slug, org_name FROM organisations ORDER BY id ASC'
  );

  if (orgs.length === 0) {
    console.log('ℹ️  No organisations to migrate.');
    return;
  }

  let totals = { tokens: 0, responses: 0 };
  for (const org of orgs) {
    try {
      const r = await migrateOrg(org);
      totals.tokens += r.tokens;
      totals.responses += r.responses;
    } catch (e) {
      console.error(`❌ Migration failed for org ${org.id} (${org.org_name}):`, e.message);
    }
  }
  console.log(`🚚 Migration complete. Totals: ${totals.tokens} tokens, ${totals.responses} responses.`);
}

// Allow running standalone: `node migrate.js`
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runMigration };