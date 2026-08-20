-- ============================================================
-- CISO Dashboard — per-organisation schema
-- Runs against each per-org database (e.g. ciso_org_techsec, ciso_org_pcpl).
-- No org_id columns — the database itself represents the org.
--
-- IMPORTANT: this schema is fully idempotent. It is applied to every
-- per-org database on EVERY server start (server.js -> ensureOrgDatabases).
-- Therefore it MUST NOT drop existing tables or fail on existing objects.
-- Use CREATE TABLE IF NOT EXISTS, never DROP.
-- ============================================================

-- API tokens configured for this organisation.00
-- Preserves tokens added via the UI across server restarts.
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  api_name VARCHAR(100) NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cached API responses for this organisation.
-- Preserves responses (and seeded dummy data) across server restarts.
CREATE TABLE IF NOT EXISTS api_responses (
  id SERIAL PRIMARY KEY,
  api_name VARCHAR(100) NOT NULL,
  response_data JSONB,
  fetched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_responses_api ON api_responses(api_name, fetched_at DESC);

-- Org-specific OSINT query targets (domains/IPs/keywords) used to
-- parameterize OSINT tool lookups instead of generic sample values.
CREATE TABLE IF NOT EXISTS osint_watchlist (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('domain','ip','keyword')),
  value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, value)
);

CREATE INDEX IF NOT EXISTS idx_osint_watchlist_type ON osint_watchlist(type);

-- Migration guards. These are flag tables (just one row = "yes, done").
-- They MUST persist across restarts so we don't re-migrate / re-seed on
-- every startup and create duplicate rows.
CREATE TABLE IF NOT EXISTS _migration_done (
  id SERIAL PRIMARY KEY,
  done_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS _seed_done (
  id SERIAL PRIMARY KEY,
  done_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INTEGRATION TABLES (added for CISO Dashboard migration)
-- ============================================================

-- Integration credentials (SentinelOne, Firewall, Harmony)
CREATE TABLE IF NOT EXISTS integration_credentials (
  integration TEXT        PRIMARY KEY,
  credentials JSONB       NOT NULL,
  token       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SentinelOne
CREATE TABLE IF NOT EXISTS s1_threats (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_id TEXT        UNIQUE,
  data      JSONB       NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS s1_agents (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   TEXT        UNIQUE,
  data       JSONB       NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS s1_application_agent (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_agent_id TEXT        UNIQUE,
  data         JSONB       NOT NULL,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS s1_application_cve (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id    TEXT        UNIQUE,
  data      JSONB       NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS s1_device_control (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT        UNIQUE,
  data      JSONB       NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS s1_rss (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rss_id    TEXT        UNIQUE,
  data      JSONB       NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hexnode MDM
CREATE TABLE IF NOT EXISTS hexnode_devices (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  TEXT        UNIQUE,
  data       JSONB       NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hexnode_applications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     TEXT        UNIQUE,
  data       JSONB       NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hexnode_device_applications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  TEXT        NOT NULL,
  app_key    TEXT        NOT NULL,
  data       JSONB       NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_id, app_key)
);

-- Palo Alto Firewall
CREATE TABLE IF NOT EXISTS firewall_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT        NOT NULL UNIQUE,
  data        JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS firewall_widgets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT        NOT NULL,
  x_axis      TEXT[],
  y_axis      TEXT[],
  chart_type  TEXT        DEFAULT 'bar',
  x           INT         NOT NULL DEFAULT 0,
  y           INT         NOT NULL DEFAULT 0,
  w           INT         NOT NULL DEFAULT 5,
  h           INT         NOT NULL DEFAULT 6,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Check Point Harmony
CREATE TABLE IF NOT EXISTS checkpoint_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             TEXT        NOT NULL UNIQUE,
  customer_id          TEXT,
  type                 TEXT,
  state                TEXT,
  severity             TEXT,
  confidence_indicator TEXT,
  description          TEXT,
  sender_address       TEXT,
  saas                 TEXT,
  entity_id            TEXT,
  entity_link          TEXT,
  event_created        TIMESTAMPTZ,
  actions              JSONB,
  additional_data      JSONB,
  raw                  JSONB       NOT NULL,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dashboard layout (per user)
CREATE TABLE IF NOT EXISTS dashboard_layout (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER     NOT NULL,
  layout     JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Zoho
CREATE TABLE IF NOT EXISTS zohotable (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  data_name  TEXT        NOT NULL UNIQUE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- General per-org tables
CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  type        TEXT        NOT NULL DEFAULT 'custom',
  data        JSONB,
  status      TEXT        NOT NULL DEFAULT 'draft',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info',
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  target_user TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT        NOT NULL,
  description TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  priority    TEXT        NOT NULL DEFAULT 'medium',
  created_by  TEXT,
  assigned_to TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS billing (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan         TEXT        NOT NULL DEFAULT 'free',
  amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency     TEXT        NOT NULL DEFAULT 'USD',
  status       TEXT        NOT NULL DEFAULT 'active',
  billing_date TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event      TEXT        NOT NULL,
  page       TEXT,
  "user"     TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS news_articles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    TEXT,
  source_name  TEXT,
  author       TEXT,
  title        TEXT        NOT NULL,
  description  TEXT,
  url          TEXT        NOT NULL,
  url_to_image TEXT,
  published_at TIMESTAMPTZ,
  content      TEXT,
  query_term   TEXT        NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_term, url)
);

-- ============================================================
-- Microsoft Graph API tables (one per endpoint)
-- ============================================================
CREATE TABLE IF NOT EXISTS ms_organization (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_subscribed_skus (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_domains (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_users (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_audit_sign_ins (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_audit_directory (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_audit_provisioning (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_risky_users (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_risk_detections (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_risky_service_principals (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_security_incidents (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_security_alerts (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_secure_scores (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_secure_score_profiles (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_managed_devices (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_compliance_policies (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_device_configurations (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_applications (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_service_principals (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_service_health (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_service_issues (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_purview_trigger (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_purview_label (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_mgmt_activity_subscriptions (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Microsoft Defender for Endpoint tables
-- ============================================================
CREATE TABLE IF NOT EXISTS ms_defender_machines (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_alerts (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_vulnerabilities (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_recommendations (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_software (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_indicators (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_investigations (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ms_defender_library_files (
  id        SERIAL PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPLIANCE HEALTH SCORES
-- Stores EDR, Email Security, and Ticketing MTTR percentages
-- with an auto-computed Average and a timestamp.
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_health_scores (
  id                   SERIAL       PRIMARY KEY,
  edr_percentage       NUMERIC(5,2) NOT NULL DEFAULT 0,
  email_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0,
  ticketing_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  average_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- NVD (National Vulnerability Database) CVE feed.
-- One row per CVE, with key fields extracted into columns for fast
-- filtering plus the full raw JSON for deep inspection.
CREATE TABLE IF NOT EXISTS nvd (
  id                 SERIAL       PRIMARY KEY,
  cve_id             TEXT         NOT NULL UNIQUE,
  source_identifier TEXT,
  published          TIMESTAMPTZ,
  last_modified      TIMESTAMPTZ,
  vuln_status        TEXT,
  description_en     TEXT,
  description_es     TEXT,
  cvss_version       TEXT,
  cvss_base_score    NUMERIC(4,1),
  cvss_base_severity TEXT,
  cvss_vector_string TEXT,
  weaknesses         TEXT,
  configurations     JSONB,
  reference_list     JSONB,
  raw                JSONB        NOT NULL,
  source_index       INT,
  synced_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nvd_cve_id ON nvd(cve_id);
CREATE INDEX IF NOT EXISTS idx_nvd_severity ON nvd(cvss_base_severity);
CREATE INDEX IF NOT EXISTS idx_nvd_published ON nvd(published DESC);
CREATE INDEX IF NOT EXISTS idx_nvd_vuln_status ON nvd(vuln_status);

-- CPE match data fetched per CVE from NVD cpematch API.
ALTER TABLE nvd ADD COLUMN IF NOT EXISTS cpe_match JSONB;
ALTER TABLE nvd ADD COLUMN IF NOT EXISTS cpe_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_nvd_cpe_synced ON nvd(cpe_synced_at);