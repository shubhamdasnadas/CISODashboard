-- Migration: 20261008_org_tokens.sql
-- Description: Create org_tokens, license_clock_state, and pending_notifications tables for online/offline license token management.

-- 1. Table: org_tokens (Central DB: cisodashboard)
CREATE TABLE IF NOT EXISTS org_tokens (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  license_id VARCHAR(100) UNIQUE NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  raw_token_preview VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, expired, revoked, upcoming
  issued_by VARCHAR(100),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_extended_by VARCHAR(100),
  last_extended_at TIMESTAMPTZ,
  expired_notified_at TIMESTAMPTZ,
  warn_30d_notified_at TIMESTAMPTZ,
  warn_15d_notified_at TIMESTAMPTZ,
  warn_7d_notified_at TIMESTAMPTZ,
  signed_license TEXT, -- offline signed cryptographic token / JWT
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_tokens_org_id ON org_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_org_tokens_status ON org_tokens(status);
CREATE INDEX IF NOT EXISTS idx_org_tokens_license_id ON org_tokens(license_id);
CREATE INDEX IF NOT EXISTS idx_org_tokens_dates ON org_tokens(start_date, end_date);

-- 2. Table: license_clock_state (for offline clock-tampering detection)
CREATE TABLE IF NOT EXISTS license_clock_state (
  id SERIAL PRIMARY KEY,
  last_seen_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  install_id VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Table: pending_notifications (offline email retry queue)
CREATE TABLE IF NOT EXISTS pending_notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- e.g. license_expired, license_warning
  recipient VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_notifications_status ON pending_notifications(status);
