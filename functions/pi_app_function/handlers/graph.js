'use strict';

/**
 * handlers/graph.js — Phase 3 graph route proxy for pi-api gateway
 *
 * Proxies /api/graph/* requests to the graph-query Function.
 */

const { checkRole, ROLES }  = require('../lib/rbac');
const { sendJSON }          = require('../lib/routeHelpers');

const GRAPH_QUERY_URL = process.env.GRAPH_QUERY_URL || 'http://localhost:9007';

async function handleGraphRequest(catalystApp, req, res) {
  // Check auth & role permissions for graph intelligence
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

    const fetchOpts = {
      method:  req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
      },
    };

    if (bodyBuffer?.length) fetchOpts.body = bodyBuffer;

    const upstream = await fetch(`${GRAPH_QUERY_URL}/api/graph/query`, fetchOpts);
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return sendJSON(res, upstream.status, data);

  } catch (err) {
    console.error('[graph handler] proxy error:', err.message);
    return sendJSON(res, 502, { error: 'Graph query service unavailable', detail: err.message });
  }
}

module.exports = { handleGraphRequest };
