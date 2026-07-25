'use strict';

/**
 * traceCollector.js — XAI Reasoning Trace Collector
 * Phase 5 — XAI & Governance Hardening
 *
 * Collects step-by-step reasoning trace for each chat turn and stores it
 * in Catalyst NoSQL (`ReasoningTrace` collection).
 *
 * Each trace step:
 *   { step, type, label, detail, timestamp, meta: { ... } }
 *
 * Step types:
 *   intent_parse  — NL intent extraction (tier: llm | regex, intent, language)
 *   zcql_query    — Data Store ZCQL query (query snippet, rows_returned)
 *   graph_lookup  — Neo4j graph traversal (nodes, edges, hop_count)
 *   risk_score    — Zia AutoML risk inference (score, risk_level, model)
 *   llm_compose   — Response composition (language, sources_count, confidence)
 *   citation_check — Citation contract validation (sources_valid: bool)
 *
 * LOCAL DEV: falls back to an in-memory Map — traces are still returned
 * within the same request, no NoSQL connection required.
 */

const COLLECTION = 'ReasoningTrace';
const TTL_HOURS  = 72; // traces expire after 72h

// In-memory fallback for local dev
const localStore = new Map();

const traceCollector = {
  /**
   * Create a new trace session for a chat turn.
   * Returns a traceId (UUID-like string).
   */
  create(turnId) {
    const traceId = `trace_${turnId}_${Date.now()}`;
    localStore.set(traceId, {
      traceId,
      turnId,
      steps: [],
      startedAt: new Date().toISOString(),
      sources: [],
      language: 'en',
      confidence_overall: null,
    });
    return traceId;
  },

  /**
   * Append a reasoning step to an in-progress trace.
   * Call this from any function that participates in the pipeline.
   */
  addStep(traceId, { type, label, detail = '', meta = {} }) {
    if (!traceId) return;
    const trace = localStore.get(traceId);
    if (!trace) return;
    trace.steps.push({
      step:      trace.steps.length + 1,
      type,
      label,
      detail,
      timestamp: new Date().toISOString(),
      meta,
    });
  },

  /**
   * Finalize the trace (attach sources + confidence) and persist to NoSQL.
   * Returns the completed trace object.
   */
  async flush(catalystApp, traceId, { sources = [], language = 'en', confidence_overall = null } = {}) {
    if (!traceId) return null;
    const trace = localStore.get(traceId);
    if (!trace) return null;

    trace.sources = sources;
    trace.language = language;
    trace.confidence_overall = confidence_overall;
    trace.completedAt = new Date().toISOString();

    // Persist to Catalyst NoSQL (best-effort — don't fail the response if NoSQL is down)
    try {
      const nosql = catalystApp.nosql();
      const doc   = nosql.collection(COLLECTION).document();
      await doc.set({
        traceId,
        turnId:             trace.turnId,
        steps:              JSON.stringify(trace.steps),
        sources:            JSON.stringify(sources),
        language,
        confidence_overall,
        startedAt:          trace.startedAt,
        completedAt:        trace.completedAt,
        ttl_expires:        new Date(Date.now() + TTL_HOURS * 3600000).toISOString(),
      });
    } catch (err) {
      console.warn('[traceCollector] NoSQL persist failed (trace available in-memory):', err.message);
    }

    return trace;
  },

  /**
   * Retrieve a trace by traceId.
   * Checks in-memory first, then falls back to NoSQL.
   */
  async get(catalystApp, traceId) {
    // In-memory first
    if (localStore.has(traceId)) {
      return localStore.get(traceId);
    }

    // NoSQL lookup
    try {
      const nosql = catalystApp.nosql();
      const query = await nosql.collection(COLLECTION)
        .where('traceId', '==', traceId)
        .limit(1)
        .get();

      if (query.docs?.length) {
        const data = query.docs[0].data();
        return {
          traceId:            data.traceId,
          turnId:             data.turnId,
          steps:              JSON.parse(data.steps || '[]'),
          sources:            JSON.parse(data.sources || '[]'),
          language:           data.language || 'en',
          confidence_overall: data.confidence_overall,
          startedAt:          data.startedAt,
          completedAt:        data.completedAt,
        };
      }
    } catch (err) {
      console.warn('[traceCollector] NoSQL get failed:', err.message);
    }

    return null;
  },

  /**
   * Build a mock trace for local dev when traceId is not found.
   * Returns a realistic 5-step trace demonstrating the full pipeline.
   */
  buildMockTrace(turnId, { intent = 'accused_lookup', language = 'en', sources = [] } = {}) {
    return {
      traceId:  `mock_trace_${turnId}`,
      turnId,
      steps: [
        {
          step: 1, type: 'intent_parse', label: 'Intent detected',
          detail: `Intent: ${intent} · Language: ${language} · Tier: regex`,
          timestamp: new Date().toISOString(),
          meta: { intent, language, tier: 'regex' },
        },
        {
          step: 2, type: 'zcql_query', label: 'Data Store queried',
          detail: 'SELECT a.ROWID, a.accused_name, fa.fir_id FROM Accused a JOIN FIR_Accused fa ON ...',
          timestamp: new Date().toISOString(),
          meta: { rows_returned: sources.length || 3, table: 'Accused + FIR_Accused' },
        },
        {
          step: 3, type: 'graph_lookup', label: 'Graph traversal (Neo4j)',
          detail: '2-hop network from matched accused — 5 nodes, 7 edges discovered',
          timestamp: new Date().toISOString(),
          meta: { nodes: 5, edges: 7, hop_count: 2, engine: 'neo4j-driver (mock)' },
        },
        {
          step: 4, type: 'citation_check', label: 'Citation contract verified',
          detail: `${sources.length || 3} source FIR IDs attached — citation contract satisfied`,
          timestamp: new Date().toISOString(),
          meta: { sources_valid: true, sources_count: sources.length || 3 },
        },
        {
          step: 5, type: 'llm_compose', label: 'Answer composed',
          detail: `Response composed in ${language === 'kn' ? 'Kannada' : 'English'} with ${sources.length || 3} grounded citations`,
          timestamp: new Date().toISOString(),
          meta: { language, sources_count: sources.length || 3, confidence: 0.84 },
        },
      ],
      sources,
      language,
      confidence_overall: 0.84,
      startedAt:   new Date(Date.now() - 850).toISOString(),
      completedAt: new Date().toISOString(),
      mock: true,
    };
  },
};

module.exports = { traceCollector };
