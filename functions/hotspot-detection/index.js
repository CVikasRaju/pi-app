'use strict';

/**
 * hotspot-detection Function — Geospatial Clustering & Trend Analysis
 * Karnataka SCRB PI App — Phase 4 (Analytics & ML)
 *
 * Routes:
 *   GET /api/analytics/hotspots  → top-N crime clusters with trend direction
 *   GET /api/analytics/trends    → time-series FIR volume by crime_type / district / week
 *
 * Policymaker-safe: all responses are aggregate-only, no PII, no row-level FIR.
 */

const catalyst = require('zcatalyst-sdk-node');
const { geoCluster } = require('./lib/geoCluster');

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
  // pathParts: ['api', 'analytics', 'hotspots'] or ['api', 'analytics', 'trends']
  const endpoint = pathParts[2];

  try {
    if (endpoint === 'hotspots') {
      const topN        = parseInt(url.searchParams.get('topN') || '10', 10);
      const crimeHead   = url.searchParams.get('crimeHead') || null;
      const days        = parseInt(url.searchParams.get('days') || '90', 10);

      const result = await geoCluster.getHotspots(catalystApp, { topN, crimeHead, days });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success', data: result }));
    }

    if (endpoint === 'trends') {
      const groupBy     = url.searchParams.get('groupBy') || 'week';   // week | month
      const crimeHead   = url.searchParams.get('crimeHead') || null;
      const districtId  = url.searchParams.get('districtId') || null;
      const months      = parseInt(url.searchParams.get('months') || '12', 10);

      const result = await geoCluster.getTrends(catalystApp, { groupBy, crimeHead, districtId, months });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success', data: result }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));

  } catch (err) {
    console.error('[hotspot-detection] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
};
