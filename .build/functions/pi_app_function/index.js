'use strict';

/**
 * pi-api — Main advancedio Function handler
 * Karnataka SCRB PI App — Phase 1 (Conversational MVP)
 *
 * Route table:
 *   GET  /api/health            → health check (unauthenticated)
 *   GET  /api/auth/me           → current user + role
 *   POST /api/auth/logout       → audit logout
 *   GET  /api/fir               → list FIRs        [investigator, analyst, supervisor]
 *   GET  /api/fir/stats         → aggregate stats  [all roles]
 *   GET  /api/fir/:id           → single FIR       [investigator, supervisor]
 *   POST /api/chat              → send message     [all roles]
 *   GET  /api/chat/history      → conversation history [all roles]
 *   DELETE /api/chat/session    → clear context    [all roles]
 *   POST /api/chat/pdf          → export PDF       [investigator, analyst, supervisor]
 *
 * Every route (except /health) enforces RBAC and writes to AuditLog.
 */

const catalyst = require('zcatalyst-sdk-node');
const { parseRoute, send404, send405, sendJSON } = require('./lib/routeHelpers');
const { handleHealth }  = require('./handlers/health');
const { handleMe, handleLogout } = require('./handlers/auth');
const { handleFIRList, handleFIRDetail, handleFIRStats } = require('./handlers/fir');
const { handleChatSend, handleChatHistory, handleClearSession, handleChatPdf } = require('./handlers/chat');

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

module.exports = async (req, res) => {
  // Initialise Catalyst SDK for this invocation
  const catalystApp = catalyst.initialize(req);

  const { method, segments, query } = parseRoute(req);

  // --- FIXED CORS HEADERS ---
  // When credentials/cookies are included, Origin cannot be '*'
  const allowedOrigin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true'); // CRITICAL: Allows Catalyst session cookies
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Route: /api/health
    if (segments[0] === 'api' && segments[1] === 'health') {
      if (method !== 'GET') return send405(res);
      return await handleHealth(catalystApp, req, res);
    }

    // Route: /api/auth/*
    if (segments[0] === 'api' && segments[1] === 'auth') {
      const sub = segments[2];
      if (sub === 'me' && method === 'GET') return await handleMe(catalystApp, req, res);
      if (sub === 'logout' && method === 'POST') return await handleLogout(catalystApp, req, res);
      return send404(res);
    }

    // Route: /api/fir/*
    if (segments[0] === 'api' && segments[1] === 'fir') {
      const sub = segments[2]; // undefined = list, 'stats' = aggregate, else = :id

      if (!sub) {
        // /api/fir
        if (method !== 'GET') return send405(res);
        return await handleFIRList(catalystApp, req, res, query);
      }

      if (sub === 'stats') {
        // /api/fir/stats
        if (method !== 'GET') return send405(res);
        return await handleFIRStats(catalystApp, req, res, query);
      }

      // /api/fir/:id
      if (method !== 'GET') return send405(res);
      return await handleFIRDetail(catalystApp, req, res, sub);
    }

    // ── Phase 1: /api/chat/* ──────────────────────────────────────────────
    if (segments[0] === 'api' && segments[1] === 'chat') {
      const sub = segments[2]; // undefined=send, 'history', 'session', 'pdf'

      if (!sub) {
        // POST /api/chat
        if (method !== 'POST') return send405(res);
        return await handleChatSend(catalystApp, req, res);
      }

      if (sub === 'history') {
        // GET /api/chat/history
        if (method !== 'GET') return send405(res);
        return await handleChatHistory(catalystApp, req, res, query);
      }

      if (sub === 'session') {
        // DELETE /api/chat/session
        if (method !== 'DELETE') return send405(res);
        return await handleClearSession(catalystApp, req, res);
      }

      if (sub === 'pdf') {
        // POST /api/chat/pdf
        if (method !== 'POST') return send405(res);
        return await handleChatPdf(catalystApp, req, res);
      }

      return send404(res);
    }

    return send404(res);

  } catch (err) {
    console.error('[pi-api] Unhandled error:', err);
    sendJSON(res, 500, { error: 'Internal server error', message: err.message });
  }
};