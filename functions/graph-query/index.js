'use strict';

/**
 * graph-query — Catalyst Function (advancedio)
 * Karnataka SCRB PI App — Phase 3 Graph Intelligence Engine
 *
 * Accepts: POST / with JSON body { queryType, searchQuery, role }
 * Returns: { nodes, edges, sources, node_count, edge_count }
 */

const catalyst        = require('zcatalyst-sdk-node');
const { queryGraph }  = require('./lib/graphEngine');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end',  () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
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

  try {
    const body = await parseBody(req);
    const { queryType = 'network', searchQuery = '', role = 'investigator' } = body;

    const result = await queryGraph({ queryType, searchQuery, role });

    return sendJSON(res, 200, result);

  } catch (err) {
    console.error('[graph-query] Error:', err);
    return sendJSON(res, 500, { error: 'Internal server error', message: err.message });
  }
};
