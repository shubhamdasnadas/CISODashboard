-- migration: add user_otps table

CREATE TABLE IF NOT EXISTS user_otps (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- index for quick look‑up of the latest unsent OTP
CREATE INDEX IF NOT EXISTS idx_user_otps_user_id_unexpired
  ON user_otps (user_id)
  WHERE is_used = FALSE AND expires_at > NOW();

INSERT INTO migrations (name, applied_at)
VALUES ('20260817_user_otps', NOW());