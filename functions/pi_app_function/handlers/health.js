'use strict';

/**
 * handlers/health.js — Health-check endpoint (unauthenticated)
 *
 * GET /api/health → { status: 'ok', version, timestamp }
 * Used by Catalyst to verify the function is running.
 */

const { sendJSON } = require('../lib/routeHelpers');
const pkg = require('../package.json');

async function handleHealth(catalystApp, req, res) {
  sendJSON(res, 200, {
    status:    'ok',
    service:   'pi-api',
    version:   pkg.version,
    timestamp: new Date().toISOString(),
    phase:     'Phase 0 — Foundation',
  });
}

module.exports = { handleHealth };
