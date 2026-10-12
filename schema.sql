-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  last_login_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,        -- sessionId (uuid)
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- api_keys（用户专属）
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT,
  key_enc TEXT NOT NULL,
  key_mask TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active|disabled|cooldown
  in_use INTEGER NOT NULL DEFAULT 0,     -- 0|1
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  concurrent_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_used_at DATETIME,
  last_error_at DATETIME,
  last_error_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  deleted_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, status, in_use, deleted_at, last_used_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_inuse ON api_keys(in_use, status, deleted_at);

-- tasks（用户专属）
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  video_id TEXT,
  model TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|done|failed
  params_json TEXT,
  key_id INTEGER,
  r2_key TEXT,
  error_reason TEXT,
  poll_count INTEGER NOT NULL DEFAULT 0,
  claimed_at DATETIME,
  last_poll_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  finished_at DATETIME,
  deleted_at DATETIME,
  video_deleted_at DATETIME,
  deleted_by INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_poll ON tasks(status, claimed_at, last_poll_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_vid ON tasks(video_id);

-- audit_logs（可选审计）
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
