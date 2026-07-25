'use strict';

/**
 * handlers/chat.js — Phase 1 chat routes for pi-api gateway
 *
 * These handlers proxy to the chat-router function internally.
 * RBAC is checked HERE (in the gateway) before proxying.
 *
 * Routes handled:
 *   POST   /api/chat            → proxy to chat-router POST /api/chat
 *   GET    /api/chat/history    → proxy to chat-router GET /api/chat/history
 *   DELETE /api/chat/session    → proxy to chat-router DELETE /api/chat/session
 *   POST   /api/chat/pdf        → proxy to pdf-export POST /api/chat/pdf
 */

const { checkRole, ROLES, hasPermission } = require('../lib/rbac');
const { logRead, ACTIONS }               = require('../lib/auditLogger');
const { sendJSON, parseBody }            = require('../lib/routeHelpers');

const CHAT_ROUTER_URL = process.env.CHAT_ROUTER_URL  || 'http://localhost:9004';
const PDF_EXPORT_URL  = process.env.PDF_EXPORT_URL   || 'http://localhost:9003';

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

async function handleChatSend(catalystApp, req, res) {
  const { user, role } = await checkRole(catalystApp, req, Object.values(ROLES).filter(r => r !== 'system'));

  if (!hasPermission(role, 'CHAT_SEND')) {
    return sendJSON(res, 403, { error: 'Insufficient permissions for CHAT_SEND' });
  }

  await logRead(catalystApp, {
    userId:    user.userId, userEmail: user.userEmail, role,
    action:    ACTIONS.CHAT_QUERY,
    tableName: 'ConversationTurn', recordId: 'new',
    ip:        req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    requestId: req.headers['x-request-id'] || '',
    statusCode: 200, isSensitive: false,
  });

  return proxyRequest(req, res, CHAT_ROUTER_URL + '/api/chat', 'POST');
}

// ---------------------------------------------------------------------------
// GET /api/chat/history
// ---------------------------------------------------------------------------

async function handleChatHistory(catalystApp, req, res, query) {
  const { user, role } = await checkRole(catalystApp, req, Object.values(ROLES).filter(r => r !== 'system'));

  if (!hasPermission(role, 'READ_CHAT_HISTORY')) {
    return sendJSON(res, 403, { error: 'Insufficient permissions for READ_CHAT_HISTORY' });
  }

  await logRead(catalystApp, {
    userId:    user.userId, userEmail: user.userEmail, role,
    action:    ACTIONS.CHAT_HISTORY,
    tableName: 'ConversationTurn', recordId: query?.session_id || 'unknown',
    ip:        req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    requestId: req.headers['x-request-id'] || '',
    statusCode: 200, isSensitive: false,
  });

  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return proxyRequest(req, res, CHAT_ROUTER_URL + '/api/chat/history' + qs, 'GET');
}

// ---------------------------------------------------------------------------
// DELETE /api/chat/session
// ---------------------------------------------------------------------------

async function handleClearSession(catalystApp, req, res) {
  await checkRole(catalystApp, req, Object.values(ROLES).filter(r => r !== 'system'));
  return proxyRequest(req, res, CHAT_ROUTER_URL + '/api/chat/session', 'DELETE');
}

// ---------------------------------------------------------------------------
// POST /api/chat/pdf
// ---------------------------------------------------------------------------

async function handleChatPdf(catalystApp, req, res) {
  const { user, role } = await checkRole(catalystApp, req, [ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR]);

  if (!hasPermission(role, 'EXPORT_PDF')) {
    return sendJSON(res, 403, { error: 'PDF export is not available for this role.' });
  }

  await logRead(catalystApp, {
    userId:    user.userId, userEmail: user.userEmail, role,
    action:    ACTIONS.CHAT_PDF_EXPORT,
    tableName: 'ConversationTurn', recordId: 'pdf',
    ip:        req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    requestId: req.headers['x-request-id'] || '',
    statusCode: 200, isSensitive: false,
  });

  return proxyRequest(req, res, PDF_EXPORT_URL + '/api/chat/pdf', 'POST', true /* passthrough binary */);
}

// ---------------------------------------------------------------------------
// Internal proxy helper
// ---------------------------------------------------------------------------

async function proxyRequest(req, res, targetUrl, method, binaryPassthrough = false) {
  try {
    // Read body from incoming request
    let bodyBuffer = null;
    if (method === 'POST' || method === 'DELETE') {
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }

    const fetchOpts = {
      method,
      headers: {
        'Content-Type':  'application/json',
        // Forward Catalyst session cookie for auth downstream
        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
      },
    };

    if (bodyBuffer?.length) fetchOpts.body = bodyBuffer;

    const upstream = await fetch(targetUrl, fetchOpts);

    if (binaryPassthrough && upstream.headers.get('content-type')?.includes('pdf')) {
      // Stream PDF binary directly
      res.setHeader('Content-Type',        'application/pdf');
      res.setHeader('Content-Disposition', upstream.headers.get('content-disposition') || 'attachment');
      res.writeHead(upstream.status);
      const buf = await upstream.arrayBuffer();
      return res.end(Buffer.from(buf));
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return sendJSON(res, upstream.status, data);

  } catch (err) {
    console.error('[chat handler] proxy error:', err.message);
    return sendJSON(res, 502, { error: 'Upstream function unavailable', detail: err.message });
  }
}

module.exports = {
  handleChatSend,
  handleChatHistory,
  handleClearSession,
  handleChatPdf,
};
