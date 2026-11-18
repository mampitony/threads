CREATE TABLE IF NOT EXISTS password_resets (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_limits (
  key_hash text PRIMARY KEY,
  count integer NOT NULL,
  expires_at bigint NOT NULL
);
