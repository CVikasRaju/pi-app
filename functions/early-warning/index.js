'use strict';

/**
 * early-warning Function — Catalyst Event Function
 * Karnataka SCRB PI App — Phase 4 (Analytics & ML)
 *
 * Triggered by Catalyst Signals when a new FIR row is written to CaseMaster,
 * or invoked on schedule via Catalyst Cron (nightly threshold evaluation).
 *
 * Logic:
 *   1. Load active AlertThreshold rows from Data Store.
 *   2. For each threshold, query FIR count for (district, crimeHead, window_days).
 *   3. If count >= threshold_count, fire Push Notification + Mail to supervisors.
 *   4. Write AlertFired record to Data Store (idempotent — dedup by threshold_id + date).
 *
 * AlertThreshold table schema (created via docs/migrations/004_alert_threshold.sql):
 *   ROWID, threshold_name, district_id, crime_head_id, window_days,
 *   threshold_count, is_active, notify_emails, created_at
 */

const catalyst = require('zcatalyst-sdk-node');
const { alertEngine } = require('./lib/alertEngine');

module.exports = async (req, res) => {
  const catalystApp = catalyst.initialize(req);

  const allowedOrigin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Support GET for cron/manual trigger and POST for Signals event payload
    const result = await alertEngine.evaluateAllThresholds(catalystApp);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'success',
      data: {
        evaluated: result.evaluated,
        triggered: result.triggered,
        alerts: result.alerts,
      },
    }));
  } catch (err) {
    console.error('[early-warning] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
};
