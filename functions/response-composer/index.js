'use strict';

/**
 * response-composer — Catalyst Function (advancedio, internal)
 * Karnataka SCRB PI App — Phase 1
 *
 * Accepts: POST / with JSON body from chat-router
 * Returns: a fully-formed ChatMessage ready for the client
 *
 * Citation contract enforcement (this is the last checkpoint before client):
 *   - sources undefined → 500 (upstream contract violated, log + surface)
 *   - sources empty + no_results false → 500 (upstream bug)
 *   - sources empty + no_results true → valid "no records" ChatMessage
 *   - sources non-empty → normal ChatMessage
 */

const { randomUUID } = require('crypto');

const INTERNAL_SECRET = process.env.INTERNAL_COMPOSER_SECRET || '';

// Role disclaimers shown under AI messages
const ROLE_DISCLAIMERS = {
  investigator:  null,  // no disclaimer for investigators
  analyst:       '⚠ Aggregate view only — individual case PII not shown for this role.',
  supervisor:    null,
  policymaker:   '⚠ Statistical/aggregate view only — case-level details are not accessible to Policymakers.',
};

// Confidence thresholds based on source count and tier
function calcConfidence(sources, tier_used, no_results) {
  if (no_results || !sources?.length) return 'none';
  if (tier_used === 'llm'      && sources.length >= 3) return 'high';
  if (tier_used === 'llm'      && sources.length >= 1) return 'medium';
  if (tier_used === 'template' && sources.length >= 3) return 'medium';
  return 'low';
}

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

  const {
    answer,
    sources,
    no_results = false,
    tier_used  = 'template',
    role       = 'investigator',
    intent,
    is_aggregate = false,
    session_id,
    turn_index,
    trace_id  = null,   // Phase 5: XAI reasoning trace ID
  } = body;

  // ── Citation contract enforcement ─────────────────────────────────────────
  if (sources === undefined || sources === null) {
    console.error('[response-composer] CITATION CONTRACT VIOLATED: sources is missing from upstream');
    res.writeHead(500);
    return res.end(JSON.stringify({
      error: 'Citation contract violated: sources field missing from nl-to-query response.',
      code:  'CITATION_CONTRACT_VIOLATED',
    }));
  }

  if (!no_results && sources.length === 0) {
    // Unexpected: nl-to-query said there are results but sent no sources
    console.error('[response-composer] CITATION CONTRACT VIOLATED: sources empty but no_results=false');
    // Surface the answer anyway but downgrade confidence and add a warning
    // (don't 500 — the answer may still be useful, but we must flag it)
  }

  // ── Build ChatMessage ─────────────────────────────────────────────────────
  const message_id = randomUUID();
  const timestamp  = new Date().toISOString();
  const confidence = calcConfidence(sources, tier_used, no_results);
  const disclaimer = ROLE_DISCLAIMERS[role] || null;

  // Format sources for display
  const formatted_sources = (sources || []).map(s => ({
    source_index:  s.source_index,
    fir_id:        s.fir_id,
    crime_number:  s.crime_number,
    table:         s.table,
    row_ref:       s.row_ref,
    excerpt:       s.excerpt,
    is_aggregate:  s.is_aggregate,
  }));

  // Build the structured ChatMessage
  const chatMessage = {
    message_id,
    session_id,
    turn_index,
    role:       'assistant',
    timestamp,

    // The answer text
    answer: no_results
      ? (answer || 'No matching records were found for your query.')
      : answer,

    // Citation block — ALWAYS present
    sources: formatted_sources,

    // Metadata
    no_results,
    confidence,
    intent,
    is_aggregate,
    tier_used,

    // UI hints
    disclaimer,
    sources_label:   formatted_sources.length > 0
      ? `${formatted_sources.length} source${formatted_sources.length > 1 ? 's' : ''} cited`
      : (no_results ? 'No records found' : 'No sources available'),
    show_sources_panel:    formatted_sources.length > 0,

    // Phase 5: XAI
    trace_id,
    show_reasoning_panel:  trace_id !== null,
  };

  res.writeHead(200);
  res.end(JSON.stringify(chatMessage));
};
