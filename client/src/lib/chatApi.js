/**
 * chatApi.js — Typed chat API client for the PI App (Phase 5: XAI + Reasoning Trace)
 */

const PI_API_BASE = process.env.NEXT_PUBLIC_PI_API_URL || 'http://localhost:9000';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${PI_API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  // PDF or Audio binary passthrough
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('pdf') || contentType.includes('audio')) {
    if (!res.ok) throw new Error(`Binary stream failed: ${res.status}`);
    return res.blob();
  }

  const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }
  return data;
}

/**
 * Send a chat message with language option.
 * @param {string} question
 * @param {string|null} sessionId
 * @param {string} [language='en']  - 'en' | 'kn'
 * @returns {Promise<ChatMessage>}
 */
export async function sendMessage(question, sessionId = null, language = 'en') {
  return apiFetch('/api/chat', {
    method: 'POST',
    body:   JSON.stringify({ question, session_id: sessionId, language }),
  });
}

/**
 * Load conversation history for a session.
 */
export async function getHistory(sessionId, limit = 50) {
  return apiFetch(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`);
}

/**
 * Clear session context from Cache.
 */
export async function clearSession(sessionId) {
  return apiFetch('/api/chat/session', {
    method: 'DELETE',
    body:   JSON.stringify({ session_id: sessionId }),
  });
}

/**
 * Export conversation as PDF.
 */
export async function exportPdf(sessionId, title) {
  return apiFetch('/api/chat/pdf', {
    method: 'POST',
    body:   JSON.stringify({ session_id: sessionId, title }),
  });
}

/**
 * Synthesize Text-to-Speech via Zia Voice API
 */
export async function synthesizeSpeech(text, language = 'en') {
  return apiFetch('/api/voice/tts', {
    method: 'POST',
    body:   JSON.stringify({ text, language }),
  });
}

/**
 * Transcribe Audio to Text via Zia Speech-to-Text API
 */
export async function transcribeAudio(audioBlob, language = 'en-IN') {
  return apiFetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: audioBlob,
  });
}

/**
 * Fetch Knowledge Graph topology & financial links
 */
export async function getGraphData(queryType = 'network', searchQuery = '') {
  return apiFetch('/api/graph/query', {
    method: 'POST',
    body:   JSON.stringify({ queryType, searchQuery }),
  });
}

/**
 * Trigger Graph Sync ETL re-synchronization
 */
export async function triggerGraphSync() {
  return apiFetch('/api/graph/sync', {
    method: 'POST',
    body:   JSON.stringify({ action: 'sync' }),
  });
}

/**
 * Phase 5 — Fetch XAI reasoning trace for a specific turn.
 * @param {string} traceId  - The trace_id returned in the chat message
 * @returns {Promise<{ data: TraceObject }>}
 */
export async function getTrace(traceId) {
  return apiFetch(`/api/chat/trace?turnId=${encodeURIComponent(traceId)}`);
}

// Named namespace export (for components that import as `chatApi.xxx`)
export const chatApi = {
  sendMessage,
  getHistory,
  clearSession,
  exportPdf,
  synthesizeSpeech,
  transcribeAudio,
  getGraphData,
  triggerGraphSync,
  getTrace,
};
