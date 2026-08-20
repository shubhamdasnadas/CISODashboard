-- migration: add api_cache_data table (durable source of truth for the Redis cache layer)
-- Stored in the CENTRAL database and logically partitioned by org_slug so a
-- single table serves every tenant while keeping strict per-tenant isolation
-- in both Postgres (WHERE org_slug = $1) and Redis (cache:<orgSlug>:<key>).

CREATE TABLE IF NOT EXISTS migrations (
  name      TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_cache_data (
  org_slug     TEXT        NOT NULL,
  resource_key TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_slug, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_api_cache_data_updated
  ON api_cache_data (org_slug, updated_at DESC);

INSERT INTO migrations (name, applied_at)
VALUES ('20260818_api_cache_data', NOW())
ON CONFLICT (name) DO NOTHING;
