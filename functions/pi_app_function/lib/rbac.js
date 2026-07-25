'use strict';

/**
 * rbac.js — Shared RBAC helper for all PI App Catalyst Functions
 *
 * Catalyst Authentication RBAC pattern:
 *   - Users are assigned to exactly ONE Catalyst User Group.
 *   - Group names map directly to roles: investigator | analyst | supervisor | policymaker
 *   - This file is the single source of truth for the role→permission matrix.
 *
 * Usage:
 *   const { checkRole, ROLES, PERMISSIONS } = require('./rbac');
 *   const { user, role } = await checkRole(catalystApp, req, [ROLES.INVESTIGATOR, ROLES.SUPERVISOR]);
 */

// ---------------------------------------------------------------------------
// Role constants
// ---------------------------------------------------------------------------

const ROLES = Object.freeze({
  INVESTIGATOR: 'investigator',
  ANALYST: 'analyst',
  SUPERVISOR: 'supervisor',
  POLICYMAKER: 'policymaker',
  SYSTEM: 'system',     // internal service calls
});

const ALL_HUMAN_ROLES = [
  ROLES.INVESTIGATOR,
  ROLES.ANALYST,
  ROLES.SUPERVISOR,
  ROLES.POLICYMAKER,
];

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

/**
 * Defines what each role is allowed to do.
 * Functions call hasPermission(role, permission) before any data access.
 */
const PERMISSIONS = Object.freeze({
  // FIR access
  READ_FIR_LIST: [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR],
  READ_FIR_DETAIL: [ROLES.INVESTIGATOR, ROLES.SUPERVISOR],
  READ_FIR_AGGREGATE: [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR, ROLES.POLICYMAKER],

  // Accused / Victim — PII, restricted
  READ_ACCUSED: [ROLES.INVESTIGATOR, ROLES.SUPERVISOR],
  READ_VICTIM: [ROLES.INVESTIGATOR, ROLES.SUPERVISOR],

  // Sensitive fields (caste / religion — architecture.md §4a)
  READ_SENSITIVE_FIELDS: [ROLES.INVESTIGATOR],  // investigator on their own case only

  // Complainant (PII)
  READ_COMPLAINANT: [ROLES.INVESTIGATOR, ROLES.SUPERVISOR],

  // Officer / Station data
  READ_OFFICER: [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR],
  READ_STATION: ALL_HUMAN_ROLES,

  // Audit log — read-only
  READ_AUDIT_LOG: [ROLES.SUPERVISOR],

  // Policymaker: only aggregate endpoints
  READ_AGGREGATE_STATS: ALL_HUMAN_ROLES,

  // Phase 1 — Conversational chat
  CHAT_SEND: ALL_HUMAN_ROLES,
  READ_CHAT_HISTORY: ALL_HUMAN_ROLES,
  EXPORT_PDF: [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR],

  // Phase 4 — Analytics & ML
  READ_RISK_SCORE:          [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR],
  READ_ANALYTICS:           ALL_HUMAN_ROLES,   // aggregate-only by design
  READ_SENSITIVE_AGGREGATE: [ROLES.SUPERVISOR, ROLES.POLICYMAKER],
  TRIGGER_EARLY_WARNING:    [ROLES.SUPERVISOR],

  // Phase 5 — XAI & Governance
  READ_AUDIT_REPORT: [ROLES.SUPERVISOR],
  READ_AUDIT_LOG:    [ROLES.SUPERVISOR],
});

// ---------------------------------------------------------------------------
// Helper: check if a role has a specific permission
// ---------------------------------------------------------------------------

/**
 * @param {string} role - One of ROLES values
 * @param {string} permission - One of PERMISSIONS keys
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) {
    console.warn(`[RBAC] Unknown permission key: ${permission}`);
    return false;
  }
  return allowed.includes(role);
}

// ---------------------------------------------------------------------------
// Core: extract authenticated user + role from Catalyst request
// ---------------------------------------------------------------------------

/**
 * Verifies the Catalyst session and returns the authenticated user + their role.
 *
 * @param {object} catalystApp   - Catalyst SDK app instance
 * @param {object} req           - IncomingMessage (advancedio function req)
 * @returns {Promise<{ user: object, role: string, userId: string, userEmail: string }>}
 * @throws {RBACError} if unauthenticated or user not in a recognized role group
 */
async function getAuthenticatedUser(catalystApp, _req) {
  // FIX: Use userManagement() instead of authentication()
  const auth = catalystApp.userManagement();

  let currentUser;
  try {
    // FIX: Catalyst uses getCurrentProjectUser() 
    currentUser = await auth.getCurrentProjectUser();
  } catch (err) {
    throw new RBACError(401, 'Unauthenticated: no valid Catalyst session');
  }

  if (!currentUser) {
    throw new RBACError(401, 'Unauthenticated: no valid Catalyst session');
  }

  // Fetch the user's group membership to determine their role
  const userId = String(currentUser.user_id || currentUser.id);
  const userEmail = currentUser.user_email || currentUser.email || '';

  let role;
  try {
    // FIX: Catalyst uses getUserDetails(userId)
    const userDetails = await auth.getUserDetails(userId);
    const groups = userDetails.user_type_id
      ? [userDetails.user_type_id]
      : (userDetails.groups || []);

    // Map group name → role
    role = resolveRoleFromGroups(groups);
  } catch (err) {
    console.error('[RBAC] Error fetching user groups:', err.message);
    throw new RBACError(403, 'Unable to determine user role');
  }

  if (!role) {
    throw new RBACError(403, `User ${userEmail} is not assigned to a recognized role group`);
  }

  return {
    user: currentUser,
    role,
    userId,
    userEmail,
  };
}

/**
 * Maps Catalyst User Group names to PI App roles.
 * Group names in Catalyst Console must exactly match the ROLES constants.
 *
 * @param {Array<string|object>} groups - User group names or group objects
 * @returns {string|null}
 */
function resolveRoleFromGroups(groups) {
  if (!groups || !groups.length) return null;

  for (const g of groups) {
    const groupName = (typeof g === 'string' ? g : (g.name || g.group_name || '')).toLowerCase();
    if (Object.values(ROLES).includes(groupName)) {
      return groupName;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// checkRole: authenticate + assert the user has one of the allowed roles
// ---------------------------------------------------------------------------

/**
 * Middleware-style check. Throws RBACError if the user's role is not in allowedRoles.
 *
 * @param {object} catalystApp   - Catalyst SDK app instance
 * @param {object} req           - IncomingMessage
 * @param {string[]} allowedRoles - List of ROLES values that may proceed
 * @returns {Promise<{ user, role, userId, userEmail }>}
 */
async function checkRole(catalystApp, req, allowedRoles) {
  const authData = await getAuthenticatedUser(catalystApp, req);

  if (!allowedRoles.includes(authData.role)) {
    throw new RBACError(
      403,
      `Role '${authData.role}' is not permitted to access this resource. ` +
      `Required: [${allowedRoles.join(', ')}]`
    );
  }

  return authData;
}

// ---------------------------------------------------------------------------
// RBACError: structured error for role/auth failures
// ---------------------------------------------------------------------------

class RBACError extends Error {
  /**
   * @param {number} statusCode - HTTP status (401 or 403)
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message);
    this.name = 'RBACError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// sendRBACError: write RBACError to HTTP response
// ---------------------------------------------------------------------------

/**
 * @param {ServerResponse} res
 * @param {RBACError|Error} err
 */
function sendRBACError(res, err) {
  const status = err instanceof RBACError ? err.statusCode : 500;
  const body = JSON.stringify({ error: err.message, code: err.name || 'InternalError' });
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

module.exports = {
  ROLES,
  ALL_HUMAN_ROLES,
  PERMISSIONS,
  hasPermission,
  getAuthenticatedUser,
  checkRole,
  resolveRoleFromGroups,
  RBACError,
  sendRBACError,
};