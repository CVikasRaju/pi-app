'use strict';

/**
 * handlers/ml.js — ML Risk Scoring Proxy
 * Phase 4 — Analytics & ML
 *
 * Proxies /api/ml/risk and /api/ml/risk/batch to the risk-scoring Function.
 * RBAC enforced: READ_RISK_SCORE (investigator, analyst, supervisor).
 * Policymaker is blocked — risk score exposes accused-level PII context.
 */

const https = require('https');
const { checkRole, PERMISSIONS, sendRBACError } = require('../lib/rbac');
const { writeAuditLog } = require('../lib/auditLogger');
const { sendJSON } = require('../lib/routeHelpers');

const RISK_SCORING_URL = process.env.RISK_SCORING_URL || null;

module.exports = {
  async handleMLRequest(catalystApp, req, res, pathSegments) {
    // pathSegments: ['api', 'ml', 'risk'] or ['api', 'ml', 'risk', 'batch']
    let authData;
    try {
      authData = await checkRole(catalystApp, req, PERMISSIONS.READ_RISK_SCORE);
    } catch (err) {
      return sendRBACError(res, err);
    }

    const { role, userId, userEmail } = authData;

    await writeAuditLog(catalystApp, {
      user_id:    userId,
      user_email: userEmail,
      role,
      action:     'ML_RISK_SCORE_REQUEST',
      resource:   req.url,
      details:    `method=${req.method}`,
    }).catch(() => {});

    // Forward to risk-scoring function
    if (RISK_SCORING_URL) {
      return proxyToFunction(req, res, RISK_SCORING_URL, role);
    }

    // Local dev: call the risk engine directly (inline mock)
    try {
      const { riskEngine } = require('../../risk-scoring/lib/riskEngine');
      const isBatch = pathSegments[3] === 'batch';

      if (req.method === 'POST' && !isBatch) {
        let body = '';
        await new Promise(resolve => { req.on('data', c => { body += c; }); req.on('end', resolve); });
        const payload = JSON.parse(body || '{}');
        const result = await riskEngine.scoreAccused(catalystApp, payload);
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      if (req.method === 'GET' && isBatch) {
        const url = new URL(req.url, 'http://localhost');
        const result = await riskEngine.batchScore(catalystApp, {
          caseId:    url.searchParams.get('caseId'),
          stationId: url.searchParams.get('stationId'),
        });
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      return sendJSON(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error('[ml handler] Error:', err);
      return sendJSON(res, 500, { error: err.message });
    }
  },
};

async function proxyToFunction(req, res, baseUrl, role) {
  return new Promise((resolve, reject) => {
    const url = new URL(req.url, baseUrl);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   req.method,
      headers:  { ...req.headers, 'x-pi-role': role },
    };
    const proxyReq = https.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });
    proxyReq.on('error', reject);
    req.pipe(proxyReq);
  });
}
