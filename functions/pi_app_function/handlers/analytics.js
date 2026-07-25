'use strict';

/**
 * handlers/analytics.js — Analytics & Demographic Proxy
 * Phase 4 — Analytics & ML
 *
 * Routes:
 *   GET /api/analytics/hotspots    → hotspot-detection function [all roles]
 *   GET /api/analytics/trends      → hotspot-detection function [all roles]
 *   GET /api/analytics/demographics → demographic-insights function [all roles]
 *   GET /api/analytics/sensitive   → demographic-insights function [supervisor, policymaker]
 *   GET /api/analytics/alerts      → AlertFired list [supervisor only]
 *
 * Per architecture §4a: sensitive aggregates (caste/religion) are distinctly
 * flagged in AuditLog as SENSITIVE_AGGREGATE_ACCESS.
 */

const { checkRole, PERMISSIONS, sendRBACError } = require('../lib/rbac');
const { writeAuditLog } = require('../lib/auditLogger');
const { sendJSON } = require('../lib/routeHelpers');

module.exports = {
  async handleAnalyticsRequest(catalystApp, req, res, pathSegments) {
    // pathSegments: ['api', 'analytics', endpoint]
    const endpoint = pathSegments[2]; // hotspots | trends | demographics | sensitive | alerts

    // Determine required permission
    let requiredPermission = 'READ_ANALYTICS';
    if (endpoint === 'sensitive') requiredPermission = 'READ_SENSITIVE_AGGREGATE';
    if (endpoint === 'alerts')    requiredPermission = 'TRIGGER_EARLY_WARNING'; // supervisor only

    let authData;
    try {
      authData = await checkRole(catalystApp, req, PERMISSIONS[requiredPermission]);
    } catch (err) {
      return sendRBACError(res, err);
    }

    const { role, userId, userEmail } = authData;

    const auditAction = endpoint === 'sensitive'
      ? 'SENSITIVE_AGGREGATE_ACCESS'
      : `ANALYTICS_${endpoint.toUpperCase()}_ACCESS`;

    await writeAuditLog(catalystApp, {
      user_id:    userId,
      user_email: userEmail,
      role,
      action:     auditAction,
      resource:   req.url,
      details:    endpoint === 'sensitive' ? 'caste/religion aggregate requested' : '',
    }).catch(() => {});

    try {
      const url = new URL(req.url, 'http://localhost');

      if (endpoint === 'hotspots') {
        const { geoCluster } = require('../../hotspot-detection/lib/geoCluster');
        const result = await geoCluster.getHotspots(catalystApp, {
          topN:       parseInt(url.searchParams.get('topN') || '10', 10),
          crimeHead:  url.searchParams.get('crimeHead') || null,
          days:       parseInt(url.searchParams.get('days') || '90', 10),
        });
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      if (endpoint === 'trends') {
        const { geoCluster } = require('../../hotspot-detection/lib/geoCluster');
        const result = await geoCluster.getTrends(catalystApp, {
          groupBy:    url.searchParams.get('groupBy') || 'week',
          crimeHead:  url.searchParams.get('crimeHead') || null,
          districtId: url.searchParams.get('districtId') || null,
          months:     parseInt(url.searchParams.get('months') || '12', 10),
        });
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      if (endpoint === 'demographics') {
        const { demographicQuery } = require('../../demographic-insights/lib/demographicQuery');
        const result = await demographicQuery.getGeneralDemographics(catalystApp, {
          districtId: url.searchParams.get('districtId') || null,
          crimeHead:  url.searchParams.get('crimeHead') || null,
        });
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      if (endpoint === 'sensitive') {
        const { demographicQuery } = require('../../demographic-insights/lib/demographicQuery');
        const result = await demographicQuery.getSensitiveAggregates(catalystApp, {
          districtId: url.searchParams.get('districtId') || null,
          crimeHead:  url.searchParams.get('crimeHead') || null,
        });
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      if (endpoint === 'alerts') {
        const result = await getRecentAlerts(catalystApp);
        return sendJSON(res, 200, { status: 'success', data: result });
      }

      return sendJSON(res, 404, { error: 'Analytics endpoint not found' });

    } catch (err) {
      console.error('[analytics handler] Error:', err);
      return sendJSON(res, 500, { error: err.message });
    }
  },
};

// ---------------------------------------------------------------------------
// Fetch recent fired alerts (supervisor only)
// ---------------------------------------------------------------------------
async function getRecentAlerts(catalystApp) {
  try {
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT af.ROWID, af.threshold_id, af.fired_date, af.actual_count,
              at.threshold_name, at.district_id, at.crime_head_id, at.threshold_count
       FROM AlertFired af
       LEFT JOIN AlertThreshold at ON at.ROWID = af.threshold_id
       ORDER BY af.created_at DESC LIMIT 50`
    );
    return {
      alerts: (rows || []).map(r => ({
        id:               r.ROWID || r['af.ROWID'],
        threshold_name:   r.threshold_name || r['at.threshold_name'] || 'Unknown',
        fired_date:       r.fired_date || r['af.fired_date'],
        actual_count:     parseInt(r.actual_count || r['af.actual_count'] || 0, 10),
        threshold_count:  parseInt(r.threshold_count || r['at.threshold_count'] || 0, 10),
        district_id:      r.district_id || r['at.district_id'],
        crime_head_id:    r.crime_head_id || r['at.crime_head_id'],
      })),
    };
  } catch {
    // Return mock alerts for local dev
    return {
      alerts: [
        { id: 1, threshold_name: 'Property Crime Surge - Bengaluru Urban', fired_date: new Date().toISOString().split('T')[0], actual_count: 62, threshold_count: 50, district_id: 1, crime_head_id: null, mock: true },
        { id: 2, threshold_name: 'Gang Activity Alert - Mysuru',          fired_date: new Date(Date.now() - 86400000).toISOString().split('T')[0], actual_count: 13, threshold_count: 10, district_id: 2, crime_head_id: null, mock: true },
      ],
    };
  }
}
