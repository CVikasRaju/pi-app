'use strict';

/**
 * auditLogger.js — Append-only AuditLog writer for all PI App Functions
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APPEND-ONLY CONTRACT (enforced here, verified in code review):
 *   • This module exposes ONLY insertAuditLog() — no update, no delete.
 *   • No other module in this codebase may write directly to AuditLog.
 *   • Every read/write to any PII table MUST produce an AuditLog entry.
 *   • Sensitive field access (caste, religion — architecture.md §4a)
 *     must pass isSensitive: true so the entry is flagged distinctly.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   const { insertAuditLog, ACTIONS } = require('./auditLogger');
 *   await insertAuditLog(catalystApp, {
 *     userId, userEmail, role, action: ACTIONS.READ_FIR,
 *     tableName: 'FIR', recordId: String(firId),
 *     queryParams: { station_id: 5 },
 *     ip, userAgent, requestId,
 *     statusCode: 200,
 *   });
 */

// ---------------------------------------------------------------------------
// Action constants — all valid action strings for the `action` column
// ---------------------------------------------------------------------------

const ACTIONS = Object.freeze({
  // Authentication
  AUTH_LOGIN:         'AUTH_LOGIN',
  AUTH_LOGOUT:        'AUTH_LOGOUT',
  AUTH_FAIL:          'AUTH_FAIL',
  AUTH_ME:            'AUTH_ME',

  // FIR
  READ_FIR_LIST:      'READ_FIR_LIST',
  READ_FIR_DETAIL:    'READ_FIR_DETAIL',
  READ_FIR_AGGREGATE: 'READ_FIR_AGGREGATE',

  // Accused / Victim / Complainant (PII)
  READ_ACCUSED:       'READ_ACCUSED',
  READ_VICTIM:        'READ_VICTIM',
  READ_COMPLAINANT:   'READ_COMPLAINANT',

  // Sensitive fields (caste, religion — §4a flagged distinctly)
  READ_ACCUSED_SENSITIVE:     'READ_ACCUSED_SENSITIVE',
  READ_VICTIM_SENSITIVE:      'READ_VICTIM_SENSITIVE',
  READ_COMPLAINANT_SENSITIVE: 'READ_COMPLAINANT_SENSITIVE',

  // Officer / Station
  READ_OFFICER:       'READ_OFFICER',
  READ_STATION:       'READ_STATION',

  // Audit log itself
  READ_AUDIT_LOG:     'READ_AUDIT_LOG',

  // Aggregate / stats (policymaker-safe)
  READ_AGGREGATE:     'READ_AGGREGATE',

  // Phase 1 — Conversational chat
  CHAT_QUERY:         'CHAT_QUERY',
  CHAT_HISTORY:       'CHAT_HISTORY',
  CHAT_PDF_EXPORT:    'CHAT_PDF_EXPORT',

  // Internal / system
  SYSTEM_HEALTH:      'SYSTEM_HEALTH',
});

// Sensitive actions — any entry with these action codes automatically sets is_sensitive = 1
const SENSITIVE_ACTIONS = new Set([
  ACTIONS.READ_ACCUSED_SENSITIVE,
  ACTIONS.READ_VICTIM_SENSITIVE,
  ACTIONS.READ_COMPLAINANT_SENSITIVE,
]);

// ---------------------------------------------------------------------------
// Table name constants
// ---------------------------------------------------------------------------

const TABLES = Object.freeze({
  FIR:                'FIR',
  ACCUSED:            'Accused',
  VICTIM:             'Victim',
  COMPLAINANT:        'ComplainantDetails',
  OFFICER:            'Officer',
  STATION:            'Station',
  AUDIT_LOG:          'AuditLog',
  FIR_ACCUSED:        'FIR_Accused',
  FIR_VICTIM:         'FIR_Victim',
});

// ---------------------------------------------------------------------------
// insertAuditLog — the ONLY write path to AuditLog
// ---------------------------------------------------------------------------

/**
 * Appends one row to AuditLog. Never updates or deletes.
 *
 * @param {object} catalystApp - Catalyst SDK app instance
 * @param {object} entry
 * @param {string}  entry.userId       - Catalyst Auth user ROWID
 * @param {string}  entry.userEmail    - User's email
 * @param {string}  entry.role         - One of ROLES values (or 'system')
 * @param {string}  entry.action       - One of ACTIONS values
 * @param {string}  [entry.tableName]  - Table accessed
 * @param {string}  [entry.recordId]   - Row ROWID accessed (null for list ops)
 * @param {object}  [entry.queryParams]- Filters/search params (will be JSON.stringified)
 * @param {boolean} [entry.isSensitive]- True if caste/religion fields touched
 * @param {string}  [entry.ip]         - Request IP
 * @param {string}  [entry.userAgent]  - User-Agent header
 * @param {string}  [entry.requestId]  - Trace/request ID
 * @param {number}  [entry.statusCode] - HTTP status of the response
 * @param {string}  [entry.errorMessage] - Error message on failure
 * @returns {Promise<void>}
 */
async function insertAuditLog(catalystApp, entry) {
  const {
    userId,
    userEmail,
    role         = 'system',
    action,
    tableName    = null,
    recordId     = null,
    queryParams  = null,
    isSensitive  = false,
    ip           = null,
    userAgent    = null,
    requestId    = null,
    statusCode   = 200,
    errorMessage = null,
  } = entry;

  // Validate required fields
  if (!userId || !userEmail || !action) {
    console.error('[AuditLogger] insertAuditLog called with missing required fields', { userId, userEmail, action });
    // We still attempt the insert with whatever we have — audit failures should never silently swallow
  }

  // Auto-detect sensitive flag from action code
  const sensitiveFlag = isSensitive || SENSITIVE_ACTIONS.has(action) ? 1 : 0;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const row = {
    user_id:       String(userId   || 'unknown'),
    user_email:    String(userEmail || 'unknown'),
    user_role:     String(role     || 'system'),
    action:        String(action),
    table_name:    tableName    ? String(tableName)  : null,
    record_id:     recordId     ? String(recordId)   : null,
    query_params:  queryParams  ? JSON.stringify(queryParams) : null,
    is_sensitive:  sensitiveFlag,
    ip_address:    ip           ? String(ip)         : null,
    user_agent:    userAgent    ? String(userAgent).substring(0, 500) : null,
    request_id:    requestId    ? String(requestId)  : null,
    status_code:   Number(statusCode) || 200,
    error_message: errorMessage ? String(errorMessage) : null,
    logged_at:     now,
  };

  try {
    const datastore = catalystApp.datastore();
    const table = datastore.table('AuditLog');
    // INSERT ONLY — no update, no delete
    await table.insertRow(row);
  } catch (err) {
    // Audit log failures must be logged to console but MUST NOT break the main request
    // A failed audit write should surface as an alert, not a 500 to the caller
    console.error('[AuditLogger] CRITICAL: Failed to write AuditLog entry.', {
      error:  err.message,
      action,
      userId,
      userEmail,
    });
    // Re-throw only in test/strict mode
    if (process.env.AUDIT_STRICT_MODE === 'true') {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Shorthand: log a successful data read.
 */
async function logRead(catalystApp, { userId, userEmail, role, action, tableName, recordId, queryParams, isSensitive, req, statusCode = 200 }) {
  const ip        = extractIP(req);
  const userAgent = extractUserAgent(req);
  const requestId = extractRequestId(req);
  return insertAuditLog(catalystApp, {
    userId, userEmail, role, action, tableName, recordId, queryParams,
    isSensitive, ip, userAgent, requestId, statusCode,
  });
}

/**
 * Shorthand: log an auth event (login/logout/fail).
 */
async function logAuth(catalystApp, { userId, userEmail, role, action, req, statusCode = 200, errorMessage }) {
  const ip        = extractIP(req);
  const userAgent = extractUserAgent(req);
  const requestId = extractRequestId(req);
  return insertAuditLog(catalystApp, {
    userId, userEmail, role, action,
    ip, userAgent, requestId, statusCode, errorMessage,
  });
}

/**
 * Shorthand: log a failed access attempt.
 */
async function logError(catalystApp, { userId = 'unknown', userEmail = 'unknown', role = 'system', action, tableName, req, statusCode, errorMessage }) {
  const ip        = extractIP(req);
  const userAgent = extractUserAgent(req);
  const requestId = extractRequestId(req);
  return insertAuditLog(catalystApp, {
    userId, userEmail, role, action, tableName,
    ip, userAgent, requestId, statusCode, errorMessage,
  });
}

// ---------------------------------------------------------------------------
// Request metadata extractors
// ---------------------------------------------------------------------------

function extractIP(req) {
  if (!req) return null;
  const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.connection && req.connection.remoteAddress) || null;
}

function extractUserAgent(req) {
  return req && req.headers ? (req.headers['user-agent'] || null) : null;
}

function extractRequestId(req) {
  return req && req.headers ? (req.headers['x-request-id'] || req.headers['x-trace-id'] || null) : null;
}

module.exports = {
  ACTIONS,
  TABLES,
  SENSITIVE_ACTIONS,
  insertAuditLog,
  logRead,
  logAuth,
  logError,
};
