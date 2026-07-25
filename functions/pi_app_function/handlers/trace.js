'use strict';

/**
 * handlers/trace.js — XAI Reasoning Trace endpoint
 * Phase 5 — XAI & Governance Hardening
 *
 * GET /api/chat/trace?turnId=<id>
 *
 * Returns the full reasoning trace for a given chat turn.
 * Permission: READ_CHAT_HISTORY (all human roles incl. policymaker — trace is non-PII).
 * The policymaker sees trace steps but step detail never contains row-level PII.
 */

const { checkRole, PERMISSIONS, sendRBACError } = require('../lib/rbac');
const { writeAuditLog }  = require('../lib/auditLogger');
const { traceCollector } = require('../lib/traceCollector');
const { sendJSON }       = require('../lib/routeHelpers');

module.exports = {
  async handleTraceRequest(catalystApp, req, res) {
    // RBAC — READ_CHAT_HISTORY: all human roles
    let authData;
    try {
      authData = await checkRole(catalystApp, req, PERMISSIONS.READ_CHAT_HISTORY);
    } catch (err) {
      return sendRBACError(res, err);
    }

    const { role, userId, userEmail } = authData;

    const url    = new URL(req.url, 'http://localhost');
    const turnId = url.searchParams.get('turnId') || url.searchParams.get('traceId');

    if (!turnId) {
      return sendJSON(res, 400, { error: 'Missing required query param: turnId' });
    }

    await writeAuditLog(catalystApp, {
      user_id:    userId,
      user_email: userEmail,
      role,
      action:     'XAI_TRACE_ACCESS',
      resource:   `/api/chat/trace?turnId=${turnId}`,
      details:    'XAI reasoning trace viewed',
    }).catch(() => {});

    // Fetch trace — in-memory (same process) → NoSQL → mock fallback
    let trace = await traceCollector.get(catalystApp, turnId).catch(() => null);

    if (!trace) {
      // Graceful mock for local dev or when NoSQL is unreachable
      trace = traceCollector.buildMockTrace(turnId, {
        intent:   'accused_lookup',
        language: 'en',
        sources:  [],
      });
    }

    return sendJSON(res, 200, {
      status: 'success',
      data:   trace,
    });
  },
};
