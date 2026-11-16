ALTER TABLE sessions ADD COLUMN IF NOT EXISTS presence_seen_at bigint;

CREATE TABLE IF NOT EXISTS agent_presence (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visible integer NOT NULL CHECK (visible IN (0, 1)),
  last_seen_at bigint
);
