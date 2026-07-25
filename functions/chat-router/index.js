'use strict';

/**
 * chat-router — Main public conversational Function
 * Karnataka SCRB PI App — Phase 1
 *
 * Route table:
 *   POST   /api/chat            → send a message, get AI response
 *   GET    /api/chat/history    → load conversation history for a session
 *   DELETE /api/chat/session    → clear Cache context (new conversation)
 *
 * Calls internally:
 *   nl-to-query       → intent + SQL + grounded answer + sources
 *   response-composer → citation validation + ChatMessage formatting
 *
 * Every call writes to AuditLog via the audit-logger function.
 */

const catalyst        = require('zcatalyst-sdk-node');
const { randomUUID }  = require('crypto');

const { getSession, updateSession, clearSession } = require('./lib/sessionManager');
const { saveTurn, getHistory }                    = require('./lib/historyStore');
const { callFunction }                            = require('./lib/internalClient');

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end',  () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

function getCatalystUser(catalystApp) {
  try {
    return catalystApp.authentication().getUser();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route: POST /api/chat
// ---------------------------------------------------------------------------

async function handleChat(req, res, catalystApp, user) {
  const body = await parseBody(req);

  const { question, session_id: incomingSessionId, language: reqLanguage } = body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return json(res, 400, { error: 'question is required and must be a non-empty string' });
  }

  const session_id = incomingSessionId || randomUUID();
  const role       = user?.role || 'investigator';

  // ── Load session context from Cache ──────────────────────────────────────
  const sessionCtx = await getSession(catalystApp, session_id);
  const turn_index = (sessionCtx?.turn_count || 0) + 1;
  const language   = reqLanguage || sessionCtx?.language || 'en';

  // ── Call nl-to-query ──────────────────────────────────────────────────────
  let nlResult;
  try {
    nlResult = await callFunction('nl-to-query', {
      question:        question.trim(),
      session_context: sessionCtx,
      role,
      user_id:         user?.userId,
      user_email:      user?.email,
      language,
    });
  } catch (err) {
    console.error('[chat-router] nl-to-query failed:', err.message);
    return json(res, 502, {
      error: 'The intelligence engine is temporarily unavailable. Please try again.',
      session_id,
    });
  }

  // ── Call response-composer ────────────────────────────────────────────────
  let chatMessage;
  try {
    chatMessage = await callFunction('response-composer', {
      answer:       nlResult.answer,
      sources:      nlResult.sources,
      no_results:   nlResult.no_results,
      tier_used:    nlResult.tier_used,
      intent:       nlResult.intent,
      is_aggregate: nlResult.is_aggregate,
      role,
      question:     question.trim(),
      session_id,
      turn_index,
      language:     nlResult.language || language,
    });
  } catch (err) {
    console.error('[chat-router] response-composer failed:', err.message);
    // Fallback: return nl result directly with minimal formatting
    chatMessage = {
      message_id:         randomUUID(),
      session_id,
      turn_index,
      role:               'assistant',
      timestamp:          new Date().toISOString(),
      answer:             nlResult.answer,
      sources:            nlResult.sources || [],
      no_results:         nlResult.no_results || false,
      confidence:         'low',
      intent:             nlResult.intent,
      language:           nlResult.language || language,
      show_sources_panel: (nlResult.sources || []).length > 0,
    };
  }

  // Inject session_id & language so client can use it
  chatMessage.session_id = session_id;
  chatMessage.language   = nlResult.language || language;

  // ── Persist turn to NoSQL ─────────────────────────────────────────────────
  const turn_id = await saveTurn(catalystApp, session_id, {
    user_id:      user?.userId,
    user_email:   user?.email,
    role,
    question:     question.trim(),
    answer:       chatMessage.answer,
    sources:      chatMessage.sources,
    no_results:   chatMessage.no_results,
    confidence:   chatMessage.confidence,
    intent:       nlResult.intent,
    is_aggregate: nlResult.is_aggregate,
    tier_used:    nlResult.tier_used,
    language:     chatMessage.language,
  });

  chatMessage.turn_id = turn_id;

  // ── Update Cache session context ──────────────────────────────────────────
  await updateSession(catalystApp, session_id, {
    userId:   user?.userId,
    role,
    question: question.trim(),
    answer:   chatMessage.answer,
    intent:   nlResult.intent,
    language: chatMessage.language,
    entities: nlResult.entities,
    sources:  chatMessage.sources,
  });

  // ── Write audit log ────────────────────────────────────────────────────────
  try {
    const auditSecret = process.env.INTERNAL_AUDIT_SECRET || '';
    const auditUrl    = process.env.AUDIT_LOGGER_URL || 'http://localhost:9005';
    await fetch(`${auditUrl}/internal/audit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-audit-secret': auditSecret },
      body: JSON.stringify({
        userId:      user?.userId,
        userEmail:   user?.email,
        role,
        action:      'CHAT_QUERY',
        tableName:   nlResult.tables?.join(',') || 'FIR',
        recordId:    session_id,
        queryParams: { intent: nlResult.intent, question: question.slice(0, 200) },
        ip:          req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        userAgent:   req.headers['user-agent'],
        requestId:   randomUUID(),
        statusCode:  200,
        isSensitive: false,
      }),
    });
  } catch { /* audit failure must not break chat */ }

  return json(res, 200, chatMessage);
}

// ---------------------------------------------------------------------------
// Route: GET /api/chat/history
// ---------------------------------------------------------------------------

async function handleHistory(req, res, catalystApp, user) {
  const url        = new URL(req.url, `http://localhost`);
  const session_id = url.searchParams.get('session_id');
  const limit      = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  if (!session_id) {
    return json(res, 400, { error: 'session_id query param is required' });
  }

  const turns = await getHistory(catalystApp, session_id, limit);

  // Audit
  try {
    const auditSecret = process.env.INTERNAL_AUDIT_SECRET || '';
    const auditUrl    = process.env.AUDIT_LOGGER_URL || 'http://localhost:9005';
    await fetch(`${auditUrl}/internal/audit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-audit-secret': auditSecret },
      body: JSON.stringify({
        userId:    user?.userId, userEmail: user?.email, role: user?.role,
        action:    'CHAT_HISTORY', tableName: 'ConversationTurn', recordId: session_id,
        statusCode: 200, isSensitive: false,
      }),
    });
  } catch { /* ignore */ }

  return json(res, 200, { session_id, turns, count: turns.length });
}

// ---------------------------------------------------------------------------
// Route: DELETE /api/chat/session
// ---------------------------------------------------------------------------

async function handleClearSession(req, res, catalystApp, user) {
  const body       = await parseBody(req);
  const session_id = body.session_id;

  if (!session_id) return json(res, 400, { error: 'session_id is required' });

  await clearSession(catalystApp, session_id);
  return json(res, 200, { cleared: true, session_id });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin || CLIENT_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const catalystApp = catalyst.initialize(req);

  // Auth — all chat endpoints require a valid Catalyst session
  let user;
  try {
    const catalystUser = await getCatalystUser(catalystApp);
    if (!catalystUser) throw new Error('No session');
    const groups = (await catalystUser.getGroupDetails?.()) || [];
    const role   = groups[0]?.group_name || 'investigator';
    user = {
      userId:    catalystUser.user_id  || catalystUser.userId,
      email:     catalystUser.email_id || catalystUser.email,
      firstName: catalystUser.first_name,
      role,
    };
  } catch {
    return json(res, 401, { error: 'Unauthorized — valid Catalyst session required' });
  }

  const url = req.url || '/';

  try {
    if (req.method === 'POST'   && url.startsWith('/api/chat') && !url.includes('/pdf') && !url.includes('/session')) {
      return await handleChat(req, res, catalystApp, user);
    }
    if (req.method === 'GET'    && url.startsWith('/api/chat/history')) {
      return await handleHistory(req, res, catalystApp, user);
    }
    if (req.method === 'DELETE' && url.startsWith('/api/chat/session')) {
      return await handleClearSession(req, res, catalystApp, user);
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[chat-router] Unhandled:', err);
    json(res, 500, { error: 'Internal server error' });
  }
};
