-- 022_add_client_self_service.sql
-- Up: creates client auth tables (signup, verify, reset, sessions, blocklist)
-- Down: drops them in safe dependency order

-- ─────────────────────────────────────────────────────────────────────────────
-- UP
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
    id              SERIAL PRIMARY KEY,
    company_name    VARCHAR(100) NOT NULL,
    email           CITEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_company_name_length CHECK (LENGTH(company_name) >= 1)
);

CREATE UNIQUE INDEX idx_clients_email ON clients(email);

CREATE TABLE IF NOT EXISTS client_email_verifications (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL,          -- SHA-256 hex
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_token_hash_length CHECK (LENGTH(token_hash) = 64)
);

CREATE INDEX idx_email_verifications_client_id ON client_email_verifications(client_id);
CREATE INDEX idx_email_verifications_token_hash ON client_email_verifications(token_hash);

CREATE TABLE IF NOT EXISTS client_password_resets (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_reset_token_hash_length CHECK (LENGTH(token_hash) = 64)
);

CREATE INDEX idx_password_resets_client_id ON client_password_resets(client_id);
CREATE INDEX idx_password_resets_token_hash ON client_password_resets(token_hash);

CREATE TABLE IF NOT EXISTS client_sessions (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    jti         UUID NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_client_sessions_jti UNIQUE (jti)
);

CREATE INDEX idx_client_sessions_client_id ON client_sessions(client_id);
CREATE INDEX idx_client_sessions_expires_at ON client_sessions(expires_at);

CREATE TABLE IF NOT EXISTS token_blocklist (
    id          SERIAL PRIMARY KEY,
    jti         UUID NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_token_blocklist_jti UNIQUE (jti)
);

CREATE INDEX idx_token_blocklist_expires_at ON token_blocklist(expires_at);

-- Optional: auto-cleanup old blocklist entries via cron or trigger.
-- If you use pg_cron, uncomment below; otherwise schedule a cron job in Node.
-- SELECT cron.schedule('purge-old-blocklist', '0 3 * * *',
--   $$ DELETE FROM token_blocklist WHERE expires_at < NOW() - INTERVAL '7 days' $$);

-- Optional: updated_at trigger for clients table
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
-- DROP FUNCTION IF EXISTS trigger_set_timestamp();

-- DROP TABLE IF EXISTS token_blocklist;
-- DROP TABLE IF EXISTS client_sessions;
-- DROP TABLE IF EXISTS client_password_resets;
-- DROP TABLE IF EXISTS client_email_verifications;
-- DROP TABLE IF EXISTS clients;
