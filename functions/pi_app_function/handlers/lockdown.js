'use strict';

/**
 * handlers/lockdown.js — Policymaker Audit Lockdown Report
 * Phase 5 — XAI & Governance Hardening
 *
 * GET /api/audit/lockdown-report  [supervisor only]
 * GET /api/audit/log              [supervisor only]
 *
 * /lockdown-report returns a machine-readable compliance manifest derived
 * from rbacAudit.js (which reads PERMISSIONS directly from rbac.js).
 * This means the manifest can never drift out of sync with enforcement rules.
 *
 * The result is also persisted to Catalyst NoSQL (`AuditManifest` collection)
 * for historical governance tracking.
 */

const { checkRole, PERMISSIONS, sendRBACError } = require('../lib/rbac');
const { writeAuditLog }  = require('../lib/auditLogger');
const { runComplianceScan } = require('../lib/rbacAudit');
const { sendJSON }       = require('../lib/routeHelpers');

const MANIFEST_COLLECTION = 'AuditManifest';

module.exports = {
  async handleLockdownRequest(catalystApp, req, res, sub) {
    // RBAC — READ_AUDIT_REPORT: supervisor only
    let authData;
    try {
      authData = await checkRole(catalystApp, req, PERMISSIONS.READ_AUDIT_REPORT);
    } catch (err) {
      return sendRBACError(res, err);
    }

    const { role, userId, userEmail } = authData;

    // ── GET /api/audit/lockdown-report ──────────────────────────────────────
    if (sub === 'lockdown-report') {
      const report = runComplianceScan();

      // Persist snapshot to NoSQL (best-effort)
      try {
        const doc = catalystApp.nosql().collection(MANIFEST_COLLECTION).document();
        await doc.set({
          scanned_at:  report.scanned_at,
          compliant:   report.compliant,
          violations:  JSON.stringify(report.violations),
          summary:     JSON.stringify(report.summary),
          scanned_by:  userEmail,
        });
      } catch (err) {
        console.warn('[lockdown] NoSQL persist failed:', err.message);
      }

      await writeAuditLog(catalystApp, {
        user_id:    userId,
        user_email: userEmail,
        role,
        action:     'LOCKDOWN_REPORT_ACCESSED',
        resource:   '/api/audit/lockdown-report',
        details:    `compliant=${report.compliant} violations=${report.violations.length}`,
      }).catch(() => {});

      return sendJSON(res, 200, {
        status: 'success',
        data:   report,
      });
    }

    // ── GET /api/audit/log ─────────────────────────────────────────────────
    if (sub === 'log') {
      await writeAuditLog(catalystApp, {
        user_id:    userId,
        user_email: userEmail,
        role,
        action:     'AUDIT_LOG_READ',
        resource:   '/api/audit/log',
        details:    '',
      }).catch(() => {});

      try {
        const url    = new URL(req.url, 'http://localhost');
        const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
        const action = url.searchParams.get('action') || null;

        const zcql = catalystApp.zcql();
        const whereClause = action ? `WHERE action = '${action}'` : '';
        const rows = await zcql.executeZCQLQuery(
          `SELECT ROWID, user_email, role, action, resource, details, created_time
           FROM AuditLog
           ${whereClause}
           ORDER BY created_time DESC LIMIT ${limit}`
        );

        return sendJSON(res, 200, {
          status: 'success',
          data: {
            entries: (rows || []).map(r => ({
              id:           r.ROWID,
              user_email:   r.user_email,
              role:         r.role,
              action:       r.action,
              resource:     r.resource,
              details:      r.details,
              created_time: r.created_time,
            })),
          },
        });
      } catch (err) {
        // Mock for local dev
        return sendJSON(res, 200, {
          status: 'success',
          data: {
            entries: [
              { id: 1, user_email: 'supervisor@karnataka.police.in', role: 'supervisor', action: 'LOCKDOWN_REPORT_ACCESSED', resource: '/api/audit/lockdown-report', details: 'compliant=true violations=0', created_time: new Date().toISOString() },
              { id: 2, user_email: 'analyst@karnataka.police.in',    role: 'analyst',    action: 'XAI_TRACE_ACCESS',          resource: '/api/chat/trace?turnId=t1',  details: 'XAI reasoning trace viewed', created_time: new Date(Date.now() - 60000).toISOString() },
              { id: 3, user_email: 'investigator@karnataka.police.in', role: 'investigator', action: 'FIR_DETAIL_READ',     resource: '/api/fir/42',               details: 'FIR 42 accessed',           created_time: new Date(Date.now() - 120000).toISOString() },
            ],
            mock: true,
          },
        });
      }
    }

    return sendJSON(res, 404, { error: 'Audit endpoint not found' });
  },
};
