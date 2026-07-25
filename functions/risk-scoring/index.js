'use strict';

/**
 * risk-scoring Function — Offender Recidivism Risk Scoring
 * Karnataka SCRB PI App — Phase 4 (Analytics & ML)
 *
 * Routes:
 *   POST /api/ml/risk        → score a single accused
 *   GET  /api/ml/risk/batch  → batch score all accused in a case/station
 *
 * Every response includes a `sources` array (accusedId + FIR IDs used) —
 * citation contract enforced per architecture §5.
 */

const catalyst = require('zcatalyst-sdk-node');
const { riskEngine } = require('./lib/riskEngine');

module.exports = async (req, res) => {
  const catalystApp = catalyst.initialize(req);

  // CORS
  const allowedOrigin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost`);
  const pathParts = url.pathname.replace(/^\/+/, '').split('/');
  // pathParts: ['api', 'ml', 'risk'] or ['api', 'ml', 'risk', 'batch']

  const isBatch = pathParts[3] === 'batch';

  try {
    if (req.method === 'POST' && !isBatch) {
      return await handleSingleRisk(catalystApp, req, res, url);
    }
    if (req.method === 'GET' && isBatch) {
      return await handleBatchRisk(catalystApp, req, res, url);
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error('[risk-scoring] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
};

// ---------------------------------------------------------------------------
// Single accused risk score
// ---------------------------------------------------------------------------
async function handleSingleRisk(catalystApp, req, res, _url) {
  let body = '';
  await new Promise(resolve => {
    req.on('data', chunk => { body += chunk; });
    req.on('end', resolve);
  });

  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  const { accusedId, accusedName } = payload;
  if (!accusedId && !accusedName) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'accusedId or accusedName is required' }));
  }

  const result = await riskEngine.scoreAccused(catalystApp, { accusedId, accusedName });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ status: 'success', data: result }));
}

// ---------------------------------------------------------------------------
// Batch risk score (case or station)
// ---------------------------------------------------------------------------
async function handleBatchRisk(catalystApp, req, res, url) {
  const caseId   = url.searchParams.get('caseId');
  const stationId = url.searchParams.get('stationId');

  const result = await riskEngine.batchScore(catalystApp, { caseId, stationId });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ status: 'success', data: result }));
}
