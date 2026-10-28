CREATE TABLE admin_credentials (
 phone TEXT PRIMARY KEY,
 password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY,
 phone TEXT NOT NULL REFERENCES admin_credentials(phone) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
