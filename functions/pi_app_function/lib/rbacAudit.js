'use strict';

/**
 * rbacAudit.js — Policymaker Compliance Scanner
 * Phase 5 — XAI & Governance Hardening
 *
 * Produces a machine-readable RBAC compliance manifest by reading the
 * PERMISSIONS object from rbac.js directly. This means the manifest
 * can never drift out of sync with the actual enforcement rules.
 *
 * PII exposure levels:
 *   NONE       — aggregate/count only (safe for all roles incl. policymaker)
 *   AGGREGATE  — rounded statistics (caste/religion sensitive aggregates)
 *   LIST       — row-level list without PII fields (FIR list, analyst-level)
 *   ROW        — full row-level PII (FIR detail, accused, victim)
 */

const { ROLES, PERMISSIONS } = require('./rbac');

// Route registry — maps every gateway route to its permission key + PII level.
// This is the authoritative source for the compliance manifest.
const ROUTE_REGISTRY = [
  // Health / Auth
  { method: 'GET',    path: '/api/health',              permission: null,                    pii_level: 'NONE',      description: 'Health check — unauthenticated' },
  { method: 'GET',    path: '/api/auth/me',             permission: null,                    pii_level: 'NONE',      description: 'Current user session' },
  { method: 'POST',   path: '/api/auth/logout',         permission: null,                    pii_level: 'NONE',      description: 'Session logout' },

  // FIR routes
  { method: 'GET',    path: '/api/fir',                 permission: 'READ_FIR_LIST',         pii_level: 'LIST',      description: 'List FIRs (no full row PII)' },
  { method: 'GET',    path: '/api/fir/stats',           permission: 'READ_FIR_AGGREGATE',    pii_level: 'AGGREGATE', description: 'FIR aggregate statistics' },
  { method: 'GET',    path: '/api/fir/:id',             permission: 'READ_FIR_DETAIL',       pii_level: 'ROW',       description: 'Single FIR full detail (PII)' },

  // Chat
  { method: 'POST',   path: '/api/chat',                permission: 'CHAT_SEND',             pii_level: 'NONE',      description: 'Send chat message (Policymaker aggregate-enforced)' },
  { method: 'GET',    path: '/api/chat/history',        permission: 'READ_CHAT_HISTORY',     pii_level: 'NONE',      description: 'Conversation history' },
  { method: 'DELETE', path: '/api/chat/session',        permission: 'CHAT_SEND',             pii_level: 'NONE',      description: 'Clear session context' },
  { method: 'POST',   path: '/api/chat/pdf',            permission: 'EXPORT_PDF',            pii_level: 'LIST',      description: 'Export PDF transcript' },
  { method: 'GET',    path: '/api/chat/trace',          permission: 'READ_CHAT_HISTORY',     pii_level: 'NONE',      description: 'XAI reasoning trace (non-PII)' },

  // Voice
  { method: 'POST',   path: '/api/voice/stt',           permission: 'CHAT_SEND',             pii_level: 'NONE',      description: 'Speech-to-text' },
  { method: 'POST',   path: '/api/voice/tts',           permission: 'CHAT_SEND',             pii_level: 'NONE',      description: 'Text-to-speech' },

  // Graph
  { method: 'POST',   path: '/api/graph/query',         permission: 'READ_FIR_LIST',         pii_level: 'LIST',      description: 'Graph network query' },
  { method: 'POST',   path: '/api/graph/sync',          permission: 'READ_FIR_LIST',         pii_level: 'LIST',      description: 'Trigger graph ETL sync' },

  // ML
  { method: 'POST',   path: '/api/ml/risk',             permission: 'READ_RISK_SCORE',       pii_level: 'LIST',      description: 'Risk score (accused context)' },
  { method: 'GET',    path: '/api/ml/risk/batch',       permission: 'READ_RISK_SCORE',       pii_level: 'LIST',      description: 'Batch risk scores' },

  // Analytics
  { method: 'GET',    path: '/api/analytics/hotspots',  permission: 'READ_ANALYTICS',        pii_level: 'AGGREGATE', description: 'Crime hotspot clusters' },
  { method: 'GET',    path: '/api/analytics/trends',    permission: 'READ_ANALYTICS',        pii_level: 'AGGREGATE', description: 'FIR volume time-series' },
  { method: 'GET',    path: '/api/analytics/demographics', permission: 'READ_ANALYTICS',     pii_level: 'AGGREGATE', description: 'Occupation/gender breakdown' },
  { method: 'GET',    path: '/api/analytics/sensitive', permission: 'READ_SENSITIVE_AGGREGATE', pii_level: 'AGGREGATE', description: 'Caste/religion aggregates (rounded)' },
  { method: 'GET',    path: '/api/analytics/alerts',    permission: 'TRIGGER_EARLY_WARNING', pii_level: 'AGGREGATE', description: 'Early warning alerts feed' },

  // Audit
  { method: 'GET',    path: '/api/audit/lockdown-report', permission: 'READ_AUDIT_REPORT',   pii_level: 'NONE',      description: 'RBAC compliance manifest' },
  { method: 'GET',    path: '/api/audit/log',            permission: 'READ_AUDIT_LOG',        pii_level: 'AGGREGATE', description: 'AuditLog entries' },
];

// PII levels that policymaker must NEVER reach
const POLICYMAKER_BLOCKED_LEVELS = new Set(['ROW', 'LIST']);

/**
 * Runs the compliance scan.
 * @returns {{ compliant: boolean, violations: Array, manifest: Array, summary: object }}
 */
function runComplianceScan() {
  const violations = [];
  const manifest   = [];

  for (const route of ROUTE_REGISTRY) {
    const { permission, pii_level } = route;

    // Resolve allowed roles for this route
    let allowedRoles = [];
    if (permission && PERMISSIONS[permission]) {
      allowedRoles = [...PERMISSIONS[permission]];
    } else if (!permission) {
      // Unauthenticated routes — available to all (by design for health/auth)
      allowedRoles = ['unauthenticated'];
    }

    const policymakerAllowed = allowedRoles.includes(ROLES.POLICYMAKER) || allowedRoles.includes('unauthenticated');
    const policymakerViolation =
      policymakerAllowed && POLICYMAKER_BLOCKED_LEVELS.has(pii_level);

    if (policymakerViolation) {
      violations.push({
        route:   `${route.method} ${route.path}`,
        pii_level,
        permission,
        issue:   `Policymaker can reach ${pii_level}-level data via this route`,
      });
    }

    manifest.push({
      method:               route.method,
      path:                 route.path,
      permission:           permission || 'none (public)',
      allowed_roles:        allowedRoles,
      pii_level,
      policymaker_allowed:  policymakerAllowed,
      policymaker_blocked:  !policymakerAllowed || !POLICYMAKER_BLOCKED_LEVELS.has(pii_level),
      description:          route.description,
    });
  }

  const summary = {
    total_routes:             ROUTE_REGISTRY.length,
    policymaker_accessible:   manifest.filter(r => r.policymaker_allowed).length,
    policymaker_blocked:      manifest.filter(r => !r.policymaker_allowed).length,
    row_level_routes:         manifest.filter(r => r.pii_level === 'ROW').length,
    list_level_routes:        manifest.filter(r => r.pii_level === 'LIST').length,
    aggregate_routes:         manifest.filter(r => r.pii_level === 'AGGREGATE').length,
    none_pii_routes:          manifest.filter(r => r.pii_level === 'NONE').length,
  };

  return {
    compliant:   violations.length === 0,
    violations,
    manifest,
    summary,
    scanned_at:  new Date().toISOString(),
  };
}

module.exports = { runComplianceScan, ROUTE_REGISTRY };
