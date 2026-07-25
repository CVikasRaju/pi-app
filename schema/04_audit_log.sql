-- =============================================================================
-- PI App — Phase 0 AuditLog Table
-- Run AFTER: 01_core_tables.sql (independent of other tables)
--
-- APPEND-ONLY CONTRACT:
--   • No UPDATE statement should ever target this table.
--   • No DELETE statement should ever target this table.
--   • The audit-logger Function exposes INSERT only; no update/delete routes exist.
--   • Any code review touching AuditLog must verify: no UPDATE, no DELETE, no TRUNCATE.
--   • This is enforced at the application layer (Function code) — Catalyst Data Store
--     does not support row-level write policies, so discipline is in the code.
-- =============================================================================

CREATE TABLE IF NOT EXISTS AuditLog (
    ROWID           BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,

    -- Who performed the action
    user_id         VARCHAR(100)    NOT NULL,           -- Catalyst Auth user ROWID
    user_email      VARCHAR(200)    NOT NULL,
    user_role       ENUM('investigator','analyst','supervisor','policymaker','system')
                                    NOT NULL DEFAULT 'system',

    -- What was done
    action          VARCHAR(100)    NOT NULL,
    -- e.g. READ_FIR, READ_ACCUSED, READ_VICTIM, READ_COMPLAINANT,
    --      READ_ACCUSED_SENSITIVE (caste/religion — flagged distinctly per §4a),
    --      AUTH_LOGIN, AUTH_LOGOUT, AUTH_FAIL,
    --      SYSTEM_WRITE (audit-logger self-writes not emitted to avoid recursion)

    -- What was accessed
    table_name      VARCHAR(100)    NULL,               -- e.g. "FIR", "Accused"
    record_id       VARCHAR(100)    NULL,               -- ROWID of the accessed record (or NULL for list ops)
    query_params    TEXT            NULL,               -- JSON: filters/search params used

    -- Sensitive flag (architecture.md §4a — caste/religion queries flagged distinctly)
    is_sensitive    TINYINT(1)      NOT NULL DEFAULT 0,

    -- Request metadata
    ip_address      VARCHAR(45)     NULL,               -- IPv4 or IPv6
    user_agent      VARCHAR(500)    NULL,
    request_id      VARCHAR(100)    NULL,               -- idempotency / trace ID

    -- Result
    status_code     INT             NOT NULL DEFAULT 200,  -- HTTP status returned
    error_message   TEXT            NULL,               -- populated on errors

    -- Timestamp (Catalyst auto-sets CREATEDTIME — but we also store explicitly
    --            so it's queryable and not dependent on system column behavior)
    logged_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CREATEDTIME     DATETIME        DEFAULT CURRENT_TIMESTAMP
    -- MODIFIEDTIME intentionally omitted — rows should never be modified
);

-- Index for common audit queries
CREATE INDEX IF NOT EXISTS idx_audit_user         ON AuditLog (user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON AuditLog (action, logged_at);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON AuditLog (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_sensitive    ON AuditLog (is_sensitive, logged_at);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at    ON AuditLog (logged_at);
