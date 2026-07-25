'use strict';

/**
 * handlers/voice.js — Phase 2 voice route proxy for pi-api gateway
 *
 * Proxies /api/voice/* requests to the zia-voice Function.
 */

const { checkRole, ROLES }  = require('../lib/rbac');
const { sendJSON }          = require('../lib/routeHelpers');

const ZIA_VOICE_URL = process.env.ZIA_VOICE_URL || 'http://localhost:9006';

async function handleVoiceRequest(catalystApp, req, res, subPath) {
  // Check auth for voice endpoints
  await checkRole(catalystApp, req, Object.values(ROLES).filter(r => r !== 'system'));

  try {
    let bodyBuffer = null;
    if (req.method === 'POST') {
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }

    const targetUrl = `${ZIA_VOICE_URL}/api/voice/${subPath || ''}`;

    const fetchOpts = {
      method:  req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
      },
    };

    if (bodyBuffer?.length) fetchOpts.body = bodyBuffer;

    const upstream = await fetch(targetUrl, fetchOpts);

    if (upstream.headers.get('content-type')?.includes('audio')) {
      res.setHeader('Content-Type', upstream.headers.get('content-type'));
      res.writeHead(upstream.status);
      const buf = await upstream.arrayBuffer();
      return res.end(Buffer.from(buf));
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return sendJSON(res, upstream.status, data);

  } catch (err) {
    console.error('[voice handler] proxy error:', err.message);
    return sendJSON(res, 502, { error: 'Voice service unavailable', detail: err.message });
  }
}

module.exports = { handleVoiceRequest };
