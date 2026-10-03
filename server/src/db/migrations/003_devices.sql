CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY NOT NULL,
  device_id TEXT REFERENCES devices ON DELETE CASCADE,
  keys TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
