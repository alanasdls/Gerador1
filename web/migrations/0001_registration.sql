CREATE TABLE customers (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
 phone TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 privacy_version TEXT NOT NULL
);
-- A simple registration is not proof of phone ownership. A new browser never
-- receives another registration's name, history or private information.
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 display_name TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE registration_limits (
 bucket TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
