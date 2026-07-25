'use strict';

/**
 * sessionManager.js — Catalyst Cache wrapper for chat-router (Phase 2 Multilingual)
 *
 * Stores conversation context (last N turns) & language preference per session in Cache.
 * Cache segment: 'pi-chat-sessions'
 * TTL: 1 hour
 */

const SEGMENT_NAME = 'pi-chat-sessions';
const MAX_TURNS    = 10;
const ANSWER_SUMMARY_LENGTH = 200;

async function getSession(catalystApp, sessionId) {
  if (!sessionId) return null;
  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    const raw     = await segment.getValue(sessionId);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.warn('[SessionManager] getSession error:', err.message);
    return null;
  }
}

async function updateSession(catalystApp, sessionId, opts) {
  const {
    userId, role, question, answer, intent, language = 'en',
    entities = {}, sources = [],
  } = opts;

  let ctx = await getSession(catalystApp, sessionId);

  if (!ctx) {
    ctx = {
      session_id:    sessionId,
      user_id:       userId,
      role,
      language:      language || 'en',
      turn_count:    0,
      last_entities: {},
      turns:         [],
    };
  }

  // Update language if supplied
  if (language) {
    ctx.language = language;
  }

  const newTurn = {
    question,
    answer_summary: String(answer).slice(0, ANSWER_SUMMARY_LENGTH),
    intent,
    language:       ctx.language,
    sources_count:  sources.length,
    timestamp:      new Date().toISOString(),
  };

  ctx.turn_count   += 1;
  ctx.last_entities = entities;
  ctx.turns         = [...ctx.turns, newTurn].slice(-MAX_TURNS);

  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    await segment.put(sessionId, JSON.stringify(ctx));
  } catch (err) {
    console.warn('[SessionManager] updateSession error:', err.message);
  }

  return ctx;
}

async function clearSession(catalystApp, sessionId) {
  if (!sessionId) return;
  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    await segment.delete(sessionId);
  } catch (err) {
    console.warn('[SessionManager] clearSession error:', err.message);
  }
}

module.exports = { getSession, updateSession, clearSession };
