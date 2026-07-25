'use strict';

/**
 * nl-to-query — Catalyst Function (advancedio, internal)
 * Karnataka SCRB PI App — Phase 2 Multilingual
 *
 * Accepts: POST / with JSON body { question, session_context, role, user_id, user_email, language }
 * Returns: { answer, sources, intent, sql_used, no_results, tier_used, language }
 *
 * Called internally by chat-router via x-internal-secret header.
 * NEVER exposed as a public endpoint — only chat-router talks to this.
 */

const catalyst          = require('zcatalyst-sdk-node');
const { parseIntent }   = require('./lib/intentParser');
const { buildQuery }    = require('./lib/sqlBuilder');
const { composeAnswer } = require('./lib/llmComposer');

const INTERNAL_SECRET = process.env.INTERNAL_NL_SECRET || '';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // ── Internal auth ─────────────────────────────────────────────────────────
  const secret = req.headers['x-internal-secret'] || '';
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    res.writeHead(403);
    return res.end(JSON.stringify({ error: 'Forbidden' }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body = '';
  try {
    body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => { d += c; });
      req.on('end',  () => resolve(d));
      req.on('error', reject);
    });
    body = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  const { question, session_context = null, role = 'investigator', language = 'en' } = body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'question is required' }));
  }

  const catalystApp = catalyst.initialize(req);

  try {
    // ── Step 1: Parse intent + entities ─────────────────────────────────────
    const intentResult = await parseIntent(catalystApp, question.trim(), session_context, role, language);
    console.log('[nl-to-query] Intent:', intentResult.intent, '| Lang:', intentResult.language, '| Tier:', intentResult.tier_used);

    // ── Step 2: Build RBAC-aware SQL ─────────────────────────────────────────
    const querySpec = buildQuery(intentResult, role);
    console.log('[nl-to-query] SQL:', querySpec.sql.replace(/\s+/g, ' ').trim());

    // ── Step 3: Execute SQL against Data Store ────────────────────────────────
    let rows = [];
    try {
      const datastore = catalystApp.datastore();
      rows = await datastore.executeQuery(querySpec.sql);
    } catch (sqlErr) {
      console.error('[nl-to-query] SQL execution error:', sqlErr.message);
      rows = [];
    }

    // ── Step 4: Compose grounded answer with citations ────────────────────────
    const composed = await composeAnswer(
      catalystApp, question, rows, querySpec, intentResult, role, intentResult.language || language
    );

    // ── Validation: ensure sources field is always present ────────────────────
    if (!Object.prototype.hasOwnProperty.call(composed, 'sources')) {
      console.error('[nl-to-query] CITATION CONTRACT VIOLATION: sources field missing');
      composed.sources    = [];
      composed.no_results = true;
    }

    // ── Response ──────────────────────────────────────────────────────────────
    res.writeHead(200);
    res.end(JSON.stringify({
      answer:       composed.answer,
      sources:      composed.sources,
      no_results:   composed.no_results || false,
      intent:       intentResult.intent,
      language:     intentResult.language || language,
      sql_used:     querySpec.sql,
      tables:       querySpec.tables,
      is_aggregate: querySpec.is_aggregate,
      tier_used:    composed.tier_used,
      row_count:    rows.length,
    }));

  } catch (err) {
    console.error('[nl-to-query] Unhandled error:', err);
    res.writeHead(500);
    res.end(JSON.stringify({
      error:      'Internal error in nl-to-query',
      message:    err.message,
      sources:    [],
      no_results: true,
    }));
  }
};
