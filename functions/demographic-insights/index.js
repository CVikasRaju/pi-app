'use strict';

/**
 * demographic-insights Function — Sociological Cross-Referencing
 * Karnataka SCRB PI App — Phase 4 (Analytics & ML)
 *
 * Routes:
 *   GET /api/analytics/demographics  → occupation/gender breakdown (all roles)
 *   GET /api/analytics/sensitive     → caste/religion aggregate percentages
 *                                      (SUPERVISOR + POLICYMAKER only)
 *                                      Distinctly flagged in AuditLog as
 *                                      SENSITIVE_AGGREGATE_ACCESS per architecture §4a
 *
 * IMPORTANT: Never returns named individual caste/religion data — only
 * statistically-rounded aggregate percentages per category.
 */

const catalyst = require('zcatalyst-sdk-node');
const { demographicQuery } = require('./lib/demographicQuery');

module.exports = async (req, res) => {
  const catalystApp = catalyst.initialize(req);

  const allowedOrigin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const pathParts = url.pathname.replace(/^\/+/, '').split('/');
  const endpoint = pathParts[2]; // 'demographics' or 'sensitive'

  try {
    if (endpoint === 'demographics') {
      const districtId = url.searchParams.get('districtId') || null;
      const crimeHead  = url.searchParams.get('crimeHead') || null;

      const result = await demographicQuery.getGeneralDemographics(catalystApp, { districtId, crimeHead });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success', data: result }));
    }

    if (endpoint === 'sensitive') {
      // Role check is enforced at gateway handler — if it reaches here the caller is authorised.
      // Re-verify role header forwarded by gateway as defence-in-depth.
      const callerRole = req.headers['x-pi-role'] || '';
      if (!['supervisor', 'policymaker'].includes(callerRole)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Insufficient role for sensitive aggregate access' }));
      }

      const districtId = url.searchParams.get('districtId') || null;
      const crimeHead  = url.searchParams.get('crimeHead') || null;

      const result = await demographicQuery.getSensitiveAggregates(catalystApp, { districtId, crimeHead });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success', data: result }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));

  } catch (err) {
    console.error('[demographic-insights] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
};
