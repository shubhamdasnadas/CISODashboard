-- migration: add allowed_pages to users (system users) for page access control
-- NULL = all pages allowed; array = only these page keys.

ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_pages TEXT[];

INSERT INTO migrations (name, applied_at)
VALUES ('20260824_user_allowed_pages', NOW())
ON CONFLICT (name) DO NOTHING;
