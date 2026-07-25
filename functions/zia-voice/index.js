'use strict';

/**
 * zia-voice — Catalyst Function (advancedio)
 * Karnataka SCRB PI App — Phase 2 Voice & Speech Engine
 *
 * Provides:
 *   POST /api/voice/stt → Speech-to-Text via Catalyst Zia Services
 *   POST /api/voice/tts → Text-to-Speech via Catalyst Zia Services
 */

const catalyst = require('zcatalyst-sdk-node');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => {
      const raw = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try { resolve(JSON.parse(raw.toString('utf8'))); } catch { resolve({}); }
      } else {
        resolve({ rawBuffer: raw });
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

  const catalystApp = catalyst.initialize(req);
  const url = req.url || '/';

  try {
    const body = await parseBody(req);

    // ── Speech-to-Text (STT) ────────────────────────────────────────────────
    if (url.includes('/stt')) {
      const language = body.language || 'en-IN'; // 'en-IN' or 'kn-IN'

      // Call Catalyst Zia STT service
      try {
        const zia = catalystApp.zia();
        if (typeof zia.extractSTT === 'function') {
          const sttResult = await zia.extractSTT(body.rawBuffer || body.audio, { language });
          return sendJSON(res, 200, {
            text: sttResult.text || sttResult.transcript || '',
            confidence: sttResult.confidence || 0.9,
            language,
          });
        }
      } catch (ziaErr) {
        console.warn('[zia-voice] Zia STT SDK call fallback:', ziaErr.message);
      }

      // If body passed text (e.g. from client Web Speech API recognition), echo back
      if (body.text) {
        return sendJSON(res, 200, { text: body.text, confidence: 1.0, language });
      }

      return sendJSON(res, 200, {
        text: body.transcript || '',
        confidence: 0.95,
        language,
      });
    }

    // ── Text-to-Speech (TTS) ────────────────────────────────────────────────
    if (url.includes('/tts')) {
      const { text, language = 'en' } = body;
      if (!text) return sendJSON(res, 400, { error: 'text is required for TTS' });

      const targetLang = language === 'kn' ? 'kn-IN' : 'en-IN';

      try {
        const zia = catalystApp.zia();
        if (typeof zia.generateTTS === 'function') {
          const audioStream = await zia.generateTTS(text, { language: targetLang, voice: 'female' });
          res.setHeader('Content-Type', 'audio/mpeg');
          res.writeHead(200);
          if (Buffer.isBuffer(audioStream)) return res.end(audioStream);
          if (audioStream?.pipe) return audioStream.pipe(res);
        }
      } catch (ziaErr) {
        console.warn('[zia-voice] Zia TTS SDK call fallback:', ziaErr.message);
      }

      // Fallback response with text & language configuration for client synthesis
      return sendJSON(res, 200, {
        audio_url: null,
        text,
        language: targetLang,
        client_fallback: true,
      });
    }

    sendJSON(res, 404, { error: 'Voice endpoint not found' });

  } catch (err) {
    console.error('[zia-voice] Error:', err);
    sendJSON(res, 500, { error: 'Internal server error', message: err.message });
  }
};
