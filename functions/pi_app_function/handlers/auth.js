'use strict';

/**
 * handlers/auth.js — Authentication endpoints for pi-api
 *
 * Routes:
 *   POST /api/auth/me     → return current user profile + role
 *   POST /api/auth/logout → invalidate session (client-side clear)
 */

const { ROLES, checkRole, getAuthenticatedUser, RBACError, sendRBACError } = require('../lib/rbac');
const { ACTIONS, logAuth, logError } = require('../lib/auditLogger');
const { parseBody, sendJSON } = require('../lib/routeHelpers');

// ---------------------------------------------------------------------------
// GET /api/auth/me — returns current authenticated user profile + role
// ---------------------------------------------------------------------------

async function handleMe(catalystApp, req, res) {
  let authData;
  try {
    authData = await getAuthenticatedUser(catalystApp, req);
  } catch (err) {
    // Log the failed auth attempt (no userId available)
    await logError(catalystApp, {
      action:       ACTIONS.AUTH_FAIL,
      req,
      statusCode:   err.statusCode || 401,
      errorMessage: err.message,
    }).catch(() => {}); // don't let audit failure mask the auth error

    return sendRBACError(res, err);
  }

  const { user, role, userId, userEmail } = authData;

  // Audit the successful profile fetch
  await logAuth(catalystApp, {
    userId, userEmail, role,
    action:     ACTIONS.AUTH_ME,
    req,
    statusCode: 200,
  });

  const roleConfig = getRoleConfig(role);

  sendJSON(res, 200, {
    user: {
      id:        userId,
      email:     userEmail,
      firstName: user.first_name || user.firstName || '',
      lastName:  user.last_name  || user.lastName  || '',
    },
    role,
    permissions:   roleConfig.permissions,
    displayName:   roleConfig.displayName,
    accessLevel:   roleConfig.accessLevel,
    uiHints:       roleConfig.uiHints,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout — client-side session clear + audit
// ---------------------------------------------------------------------------

async function handleLogout(catalystApp, req, res) {
  let authData;
  try {
    authData = await getAuthenticatedUser(catalystApp, req);
  } catch {
    // Even on logout with a bad session, we just return 200
    return sendJSON(res, 200, { message: 'Logged out' });
  }

  const { userId, userEmail, role } = authData;

  await logAuth(catalystApp, {
    userId, userEmail, role,
    action:     ACTIONS.AUTH_LOGOUT,
    req,
    statusCode: 200,
  });

  sendJSON(res, 200, { message: 'Logged out successfully' });
}

// ---------------------------------------------------------------------------
// Role UI config — what the client receives to configure its view
// ---------------------------------------------------------------------------

function getRoleConfig(role) {
  const configs = {
    [ROLES.INVESTIGATOR]: {
      displayName: 'Investigator',
      accessLevel: 'case-scoped',
      permissions: ['READ_FIR_LIST', 'READ_FIR_DETAIL', 'READ_ACCUSED', 'READ_VICTIM', 'READ_COMPLAINANT'],
      uiHints: {
        canSeePII:          true,
        canSeeSensitive:    true,  // own cases only
        canSeeAggregate:    true,
        showNetworkGraph:   false, // Phase 3
        aggregateOnly:      false,
      },
    },
    [ROLES.ANALYST]: {
      displayName: 'Analyst',
      accessLevel: 'jurisdiction-read',
      permissions: ['READ_FIR_LIST', 'READ_FIR_AGGREGATE', 'READ_AGGREGATE_STATS'],
      uiHints: {
        canSeePII:          false,
        canSeeSensitive:    false,
        canSeeAggregate:    true,
        showNetworkGraph:   false,
        aggregateOnly:      false,
      },
    },
    [ROLES.SUPERVISOR]: {
      displayName: 'Supervisor',
      accessLevel: 'station-district-read',
      permissions: ['READ_FIR_LIST', 'READ_FIR_DETAIL', 'READ_ACCUSED', 'READ_VICTIM', 'READ_OFFICER', 'READ_AUDIT_LOG'],
      uiHints: {
        canSeePII:          true,
        canSeeSensitive:    false,
        canSeeAggregate:    true,
        showNetworkGraph:   false,
        aggregateOnly:      false,
      },
    },
    [ROLES.POLICYMAKER]: {
      displayName: 'Policymaker',
      accessLevel: 'aggregate-only',
      permissions: ['READ_FIR_AGGREGATE', 'READ_AGGREGATE_STATS'],
      uiHints: {
        canSeePII:          false,
        canSeeSensitive:    false,
        canSeeAggregate:    true,
        showNetworkGraph:   false,
        aggregateOnly:      true,
      },
    },
  };
  return configs[role] || { displayName: role, accessLevel: 'unknown', permissions: [], uiHints: {} };
}

module.exports = { handleMe, handleLogout };
