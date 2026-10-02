CREATE TABLE ants (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  accessory TEXT NOT NULL,
  model TEXT NOT NULL,
  effort TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE colonies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  lead_ant_id TEXT REFERENCES ants,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE colony_members (
  colony_id TEXT NOT NULL REFERENCES colonies ON DELETE CASCADE,
  ant_id TEXT NOT NULL REFERENCES ants ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (colony_id, ant_id)
);
CREATE TABLE threads (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ant', 'colony')),
  ref_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  section TEXT,
  unread INTEGER NOT NULL DEFAULT 0,
  last_read_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX threads_updated_at ON threads(updated_at);
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads ON DELETE CASCADE,
  author TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  run_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX messages_thread_created_at ON messages(thread_id, created_at);
CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='rowid');
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  ant_id TEXT NOT NULL,
  thread_id TEXT,
  session_id TEXT,
  trigger TEXT NOT NULL CHECK (trigger IN ('user', 'ant', 'routine', 'webhook', 'channel')),
  parent_run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'stopped')),
  started_at INTEGER,
  ended_at INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX runs_ant_created_at ON runs(ant_id, created_at);
CREATE TABLE tool_events (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs ON DELETE CASCADE,
  tool_use_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'denied')),
  duration_ms INTEGER,
  output_summary TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT,
  ant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  input TEXT NOT NULL,
  behaviour TEXT NOT NULL CHECK (behaviour IN ('ask', 'handoff')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'once', 'always', 'deny', 'expired')),
  expires_at INTEGER,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX approvals_status ON approvals(status);
CREATE TABLE rules (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'ant')),
  ant_id TEXT,
  pattern TEXT NOT NULL,
  behaviour TEXT NOT NULL CHECK (behaviour IN ('allow', 'ask', 'handoff', 'deny')),
  source TEXT NOT NULL CHECK (source IN ('default', 'user', 'admin')),
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE routines (
  id TEXT PRIMARY KEY NOT NULL,
  ant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  schedule TEXT NOT NULL,
  tz TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'webhook', 'watch', 'event')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  next_run_at INTEGER,
  last_run_at INTEGER,
  webhook_key_hash TEXT,
  budget_usd REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE routine_runs (
  id TEXT PRIMARY KEY NOT NULL,
  routine_id TEXT NOT NULL REFERENCES routines ON DELETE CASCADE,
  run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped', 'expired')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  output TEXT
);
CREATE TABLE delegations (
  id TEXT PRIMARY KEY NOT NULL,
  from_ant TEXT NOT NULL,
  to_ant TEXT NOT NULL,
  origin_run_id TEXT,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done', 'failed', 'cancelled')),
  summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE connectors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  transport TEXT NOT NULL CHECK (transport IN ('http', 'stdio')),
  config TEXT NOT NULL,
  status TEXT NOT NULL,
  all_ants INTEGER NOT NULL DEFAULT 1 CHECK (all_ants IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE connector_scopes (
  connector_id TEXT NOT NULL REFERENCES connectors ON DELETE CASCADE,
  ant_id TEXT NOT NULL REFERENCES ants ON DELETE CASCADE,
  PRIMARY KEY (connector_id, ant_id)
);
CREATE TABLE secrets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  all_ants INTEGER NOT NULL DEFAULT 0 CHECK (all_ants IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE secret_scopes (
  secret_id TEXT NOT NULL REFERENCES secrets ON DELETE CASCADE,
  ant_id TEXT NOT NULL REFERENCES ants ON DELETE CASCADE,
  PRIMARY KEY (secret_id, ant_id)
);
CREATE TABLE usage_daily (
  date TEXT NOT NULL,
  ant_id TEXT NOT NULL,
  cost_usd REAL NOT NULL,
  tokens INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  PRIMARY KEY (date, ant_id)
);
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
