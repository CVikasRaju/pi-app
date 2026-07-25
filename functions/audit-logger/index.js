'use strict';

/**
 * audit-logger — Dedicated Catalyst Function for cross-function audit writes
 * Karnataka SCRB PI App — Phase 0
 *
 * This function exposes a single internal endpoint:
 *   POST /internal/audit
 *
 * It is called by other PI App Functions (e.g. chat-router in Phase 1) that
 * need to write audit entries but don't have the AuditLog lib bundled.
 * In Phase 0, the pi-api function uses the shared lib/auditLogger.js directly,
 * so this endpoint is used for cross-function calls and future functions.
 *
 * SECURITY:
 *   - This function is NOT exposed via the public API Gateway.
 *   - Calls must include the INTERNAL_AUDIT_SECRET header that matches the
 *     INTERNAL_AUDIT_SECRET environment variable set in Catalyst Console.
 *   - Any caller without the secret receives 403.
 *
 * APPEND-ONLY CONTRACT:
 *   - This function only ever executes INSERT on AuditLog.
 *   - No UPDATE, DELETE, or TRUNCATE path exists anywhere in this file.
 */

const catalyst = require('zcatalyst-sdk-node');

const crypto = require('crypto');
const INTERNAL_SECRET = process.env.INTERNAL_AUDIT_SECRET || '';

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  const catalystApp = catalyst.initialize(req);

  // --------------------------------------------------------------------------
  // Secret-based internal auth check (timing-safe)
  // --------------------------------------------------------------------------
  const providedSecret = req.headers['x-internal-secret'] || '';
  if (!INTERNAL_SECRET || !safeCompare(providedSecret, INTERNAL_SECRET)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: invalid internal secret' }));
    return;
  }

  // Only POST to /internal/audit is accepted
  if (req.method !== 'POST' || !req.url.startsWith('/internal/audit')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // --------------------------------------------------------------------------
  // Parse body
  // --------------------------------------------------------------------------
  let body = '';
  try {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end',  () => resolve(data));
      req.on('error', reject);
    });
    body = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const {
    user_id,
    user_email,
    user_role     = 'system',
    action,
    table_name    = null,
    record_id     = null,
    query_params  = null,
    is_sensitive  = 0,
    ip_address    = null,
    user_agent    = null,
    request_id    = null,
    status_code   = 200,
    error_message = null,
  } = body;

  // Validate required fields
  if (!user_id || !user_email || !action) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required fields: user_id, user_email, action' }));
    return;
  }

  // --------------------------------------------------------------------------
  // INSERT into AuditLog — APPEND ONLY
  // No UPDATE. No DELETE. No TRUNCATE. Code review must verify this contract.
  // --------------------------------------------------------------------------
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const row = {
    user_id:       String(user_id),
    user_email:    String(user_email),
    user_role:     String(user_role),
    action:        String(action),
    table_name:    table_name    ? String(table_name)                 : null,
    record_id:     record_id     ? String(record_id)                  : null,
    query_params:  query_params  ? JSON.stringify(query_params)        : null,
    is_sensitive:  is_sensitive  ? 1 : 0,
    ip_address:    ip_address    ? String(ip_address)                  : null,
    user_agent:    user_agent    ? String(user_agent).slice(0, 500)    : null,
    request_id:    request_id    ? String(request_id)                  : null,
    status_code:   Number(status_code) || 200,
    error_message: error_message ? String(error_message)               : null,
    logged_at:     now,
  };

  try {
    const table = catalystApp.datastore().table('AuditLog');
    await table.insertRow(row);   // ← INSERT ONLY

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'logged', logged_at: now }));
  } catch (err) {
    console.error('[audit-logger] Failed to insert AuditLog row:', err.message, { action, user_id });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to write audit log', details: err.message }));
  }
};
