'use strict';

/**
 * alertEngine.js — Early Warning Threshold Evaluator
 *
 * Loads active AlertThreshold rows, evaluates each against recent FIR counts,
 * fires Catalyst Push Notification + Mail to supervisors when threshold crossed.
 * Writes AlertFired record to prevent duplicate notifications (idempotent by date).
 *
 * AlertThreshold table (see docs/migrations/004_alert_threshold.sql):
 *   ROWID, threshold_name, district_id, crime_head_id, window_days,
 *   threshold_count, is_active, notify_emails, created_at
 *
 * AlertFired table (see docs/migrations/004_alert_threshold.sql):
 *   ROWID, threshold_id, fired_date, actual_count, notified_emails, created_at
 */

const alertEngine = {
  async evaluateAllThresholds(catalystApp) {
    const thresholds = await loadActiveThresholds(catalystApp);

    const results = { evaluated: thresholds.length, triggered: 0, alerts: [] };

    for (const threshold of thresholds) {
      try {
        const actualCount = await countRecentFIRs(catalystApp, threshold);

        if (actualCount >= threshold.threshold_count) {
          const alreadyFired = await checkAlreadyFired(catalystApp, threshold.ROWID);
          if (!alreadyFired) {
            await fireAlert(catalystApp, threshold, actualCount);
            await recordAlertFired(catalystApp, threshold, actualCount);
            results.triggered++;
            results.alerts.push({
              threshold_id: threshold.ROWID,
              threshold_name: threshold.threshold_name,
              district_id: threshold.district_id,
              crime_head_id: threshold.crime_head_id,
              actual_count: actualCount,
              threshold_count: threshold.threshold_count,
              window_days: threshold.window_days,
              notified: threshold.notify_emails,
            });
          }
        }
      } catch (err) {
        console.error(`[alertEngine] Error evaluating threshold ${threshold.ROWID}:`, err.message);
      }
    }

    return results;
  },
};

// ---------------------------------------------------------------------------
// Load active thresholds
// ---------------------------------------------------------------------------
async function loadActiveThresholds(catalystApp) {
  try {
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT ROWID, threshold_name, district_id, crime_head_id,
              window_days, threshold_count, notify_emails
       FROM AlertThreshold WHERE is_active = true LIMIT 100`
    );
    return (rows || []).map(r => ({
      ROWID:           r.ROWID,
      threshold_name:  r.threshold_name  || `Threshold ${r.ROWID}`,
      district_id:     r.district_id     || null,
      crime_head_id:   r.crime_head_id   || null,
      window_days:     parseInt(r.window_days     || 30,  10),
      threshold_count: parseInt(r.threshold_count || 10,  10),
      notify_emails:   r.notify_emails   || '',
    }));
  } catch (err) {
    console.warn('[alertEngine] Could not load thresholds (table may not exist yet):', err.message);
    // Return mock threshold for local dev demonstration
    return [{
      ROWID: 'mock-1',
      threshold_name: 'Mock: High Property Crime Alert',
      district_id: '1',
      crime_head_id: null,
      window_days: 30,
      threshold_count: 999, // will never actually fire in local dev
      notify_emails: 'supervisor@karnataka.police.in',
    }];
  }
}

// ---------------------------------------------------------------------------
// Count recent FIRs matching threshold conditions
// ---------------------------------------------------------------------------
async function countRecentFIRs(catalystApp, threshold) {
  try {
    const zcql = catalystApp.zcql();
    const sinceDate = new Date(Date.now() - threshold.window_days * 86400000)
      .toISOString().split('T')[0];

    let query = `SELECT COUNT(*) AS cnt FROM CaseMaster WHERE fir_date >= '${sinceDate}'`;
    if (threshold.district_id)   query += ` AND district_id = ${Number(threshold.district_id)}`;
    if (threshold.crime_head_id) query += ` AND crime_head_id = ${Number(threshold.crime_head_id)}`;

    const rows = await zcql.executeZCQLQuery(query);
    return parseInt((rows?.[0]?.cnt || rows?.[0]?.['cnt(*)'] || 0), 10);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Idempotency check — already fired today?
// ---------------------------------------------------------------------------
async function checkAlreadyFired(catalystApp, thresholdId) {
  try {
    const zcql = catalystApp.zcql();
    const today = new Date().toISOString().split('T')[0];
    const rows  = await zcql.executeZCQLQuery(
      `SELECT ROWID FROM AlertFired
       WHERE threshold_id = '${thresholdId}' AND fired_date = '${today}'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false; // assume not fired on error
  }
}

// ---------------------------------------------------------------------------
// Fire Catalyst Push Notification + Mail
// ---------------------------------------------------------------------------
async function fireAlert(catalystApp, threshold, actualCount) {
  const message =
    `⚠️ EARLY WARNING: "${threshold.threshold_name}" threshold breached. ` +
    `${actualCount} FIRs registered in the last ${threshold.window_days} days ` +
    `(threshold: ${threshold.threshold_count}). Immediate review recommended.`;

  const emails = String(threshold.notify_emails || '').split(',').map(e => e.trim()).filter(Boolean);

  // Catalyst Push Notification
  try {
    await catalystApp.push().send({
      message,
      title: '🚨 PI App Early Warning',
    });
  } catch (err) {
    console.warn('[alertEngine] Push notification failed (may not be configured):', err.message);
  }

  // Catalyst Mail
  for (const email of emails) {
    try {
      await catalystApp.mail().sendMail({
        from_email: process.env.ALERT_FROM_EMAIL || 'alerts@pi-app.karnataka.police.in',
        to_email:   [email],
        subject:    `[PI App] Early Warning Alert: ${threshold.threshold_name}`,
        content:    message,
      });
    } catch (err) {
      console.warn(`[alertEngine] Mail to ${email} failed:`, err.message);
    }
  }

  console.log(`[alertEngine] Alert fired: ${threshold.threshold_name} (${actualCount} FIRs)`);
}

// ---------------------------------------------------------------------------
// Record alert fired (idempotency)
// ---------------------------------------------------------------------------
async function recordAlertFired(catalystApp, threshold, actualCount) {
  try {
    const datastore = catalystApp.datastore();
    const table     = datastore.table('AlertFired');
    const today     = new Date().toISOString().split('T')[0];
    await table.insertRow({
      threshold_id:    String(threshold.ROWID),
      fired_date:      today,
      actual_count:    actualCount,
      notified_emails: threshold.notify_emails,
      created_at:      new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[alertEngine] Could not record alert fired:', err.message);
  }
}

module.exports = { alertEngine };
