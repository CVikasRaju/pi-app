'use strict';

/**
 * historyStore.js — Catalyst NoSQL wrapper for conversation persistence
 *
 * Table: ConversationTurn
 *   Primary key: session_id (string)
 *   Sort key:    turn_id    (string — timestamp-based, sortable)
 *
 * Create in Catalyst Console:
 *   NoSQL → New Table → ConversationTurn
 *   Partition key: session_id
 *   Sort key: turn_id
 */

const { randomUUID } = require('crypto');

const TABLE_NAME = 'ConversationTurn';

// ---------------------------------------------------------------------------
// saveTurn
// ---------------------------------------------------------------------------

/**
 * Persist a completed conversation turn to NoSQL.
 * @param {object} catalystApp
 * @param {string} sessionId
 * @param {object} turn
 * @returns {Promise<string>}  turn_id of the saved turn
 */
async function saveTurn(catalystApp, sessionId, turn) {
  const turn_id   = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const timestamp = new Date().toISOString();

  const item = {
    session_id:    sessionId,
    turn_id,
    user_id:       turn.user_id      || 'unknown',
    user_email:    turn.user_email   || '',
    role:          turn.role         || 'investigator',
    question:      String(turn.question || '').slice(0, 2000),
    answer:        String(turn.answer   || '').slice(0, 5000),
    sources:       JSON.stringify(turn.sources || []),
    no_results:    turn.no_results   ? 1 : 0,
    confidence:    turn.confidence   || 'low',
    intent:        turn.intent       || 'unknown',
    is_aggregate:  turn.is_aggregate ? 1 : 0,
    tier_used:     turn.tier_used    || 'template',
    timestamp,
  };

  try {
    const nosql = catalystApp.nosql();
    const table = await nosql.getTable(TABLE_NAME);
    await table.upsertItem(item);
    return turn_id;
  } catch (err) {
    console.error('[HistoryStore] saveTurn error:', err.message);
    // Don't throw — history persistence failure must not break the chat response
    return turn_id;
  }
}

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

/**
 * Fetch conversation history for a session (most recent turns first).
 * @param {object} catalystApp
 * @param {string} sessionId
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
async function getHistory(catalystApp, sessionId, limit = 50) {
  try {
    const nosql = catalystApp.nosql();
    const table = await nosql.getTable(TABLE_NAME);

    // Query by partition key = session_id
    const result = await table.queryTable({
      key: { session_id: sessionId },
      limit,
    });

    const items = result?.items || result || [];

    // Parse sources back from JSON string
    return items.map(item => ({
      ...item,
      sources:    tryParseJSON(item.sources, []),
      no_results: item.no_results === 1,
      is_aggregate: item.is_aggregate === 1,
    })).sort((a, b) => String(a.turn_id).localeCompare(String(b.turn_id)));

  } catch (err) {
    console.error('[HistoryStore] getHistory error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function tryParseJSON(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

module.exports = { saveTurn, getHistory };
