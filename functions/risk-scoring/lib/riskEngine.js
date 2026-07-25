'use strict';

/**
 * riskEngine.js — Offender Recidivism Risk Scoring Engine
 *
 * Dual-mode:
 *   - LOCAL DEV: Deterministic mock score derived from feature hash.
 *   - CLOUD:     Calls Catalyst Zia AutoML classification model via
 *                catalystApp.zia().prediction(modelId, features).
 *
 * To switch from mock → real model:
 *   1. Train a classification model in Catalyst Zia AutoML console.
 *   2. Set env: ZIA_RISK_MODEL_ID=<your-model-id>
 *   3. The `callZiaModel()` branch below will activate automatically.
 *
 * Risk levels: HIGH (score >= 0.7), MEDIUM (0.4–0.7), LOW (< 0.4)
 *
 * Citation contract: every response includes `sources` array.
 */

const RISK_MODEL_ID = process.env.ZIA_RISK_MODEL_ID || null;

const riskEngine = {
  /**
   * Score a single accused by accusedId or accusedName.
   * Pulls feature vector from Data Store (FIR history, crime types, recency).
   */
  async scoreAccused(catalystApp, { accusedId, accusedName }) {
    // Step 1: Fetch accused FIR history from Data Store
    const { features, firIds, resolvedAccusedId } = await extractAccusedFeatures(
      catalystApp, { accusedId, accusedName }
    );

    // Step 2: Score
    let score, confidence, factors;
    if (RISK_MODEL_ID) {
      ({ score, confidence, factors } = await callZiaModel(catalystApp, RISK_MODEL_ID, features));
    } else {
      ({ score, confidence, factors } = mockScore(features));
    }

    const riskLevel = score >= 0.7 ? 'HIGH' : score >= 0.4 ? 'MEDIUM' : 'LOW';

    return {
      accusedId: resolvedAccusedId || accusedId,
      accusedName: features.name || accusedName,
      risk_level: riskLevel,
      score: Math.round(score * 100) / 100,
      confidence: Math.round(confidence * 100),
      factors,
      sources: [
        ...(resolvedAccusedId ? [`accused:${resolvedAccusedId}`] : []),
        ...firIds.map(id => `fir:${id}`),
      ],
      model: RISK_MODEL_ID ? 'zia-automl' : 'mock-deterministic',
    };
  },

  /**
   * Batch score all accused linked to a case or station.
   */
  async batchScore(catalystApp, { caseId, stationId }) {
    const accusedList = await fetchAccusedList(catalystApp, { caseId, stationId });

    const results = await Promise.all(
      accusedList.map(acc =>
        riskEngine.scoreAccused(catalystApp, { accusedId: acc.ROWID, accusedName: acc.accused_name })
          .catch(err => ({
            accusedId: acc.ROWID,
            accusedName: acc.accused_name,
            error: err.message,
            sources: [],
          }))
      )
    );

    return {
      total: results.length,
      high:   results.filter(r => r.risk_level === 'HIGH').length,
      medium: results.filter(r => r.risk_level === 'MEDIUM').length,
      low:    results.filter(r => r.risk_level === 'LOW').length,
      scores: results,
    };
  },
};

// ---------------------------------------------------------------------------
// Feature Extraction
// ---------------------------------------------------------------------------
async function extractAccusedFeatures(catalystApp, { accusedId, accusedName }) {
  try {
    const zcql = catalystApp.zcql();

    // Query accused FIR linkages
    let accusedRows = [];
    if (accusedId) {
      const res = await zcql.executeZCQLQuery(
        `SELECT a.ROWID, a.accused_name, fa.fir_id
         FROM Accused a JOIN FIR_Accused fa ON fa.accused_id = a.ROWID
         WHERE a.ROWID = ${Number(accusedId)}
         LIMIT 50`
      );
      accusedRows = res || [];
    } else if (accusedName) {
      const safeName = String(accusedName).replace(/'/g, "''");
      const res = await zcql.executeZCQLQuery(
        `SELECT a.ROWID, a.accused_name, fa.fir_id
         FROM Accused a JOIN FIR_Accused fa ON fa.accused_id = a.ROWID
         WHERE a.accused_name LIKE '%${safeName}%'
         LIMIT 50`
      );
      accusedRows = res || [];
    }

    const firIds = [...new Set(accusedRows.map(r => String(r.fir_id || r['fa.fir_id'] || '')).filter(Boolean))];
    const resolvedAccusedId = accusedRows[0]
      ? String(accusedRows[0].ROWID || accusedRows[0]['a.ROWID'] || '')
      : null;
    const name = accusedRows[0]
      ? String(accusedRows[0].accused_name || accusedRows[0]['a.accused_name'] || accusedName || '')
      : String(accusedName || '');

    // Query FIR details for time-based features
    const firDetails = firIds.length > 0
      ? await zcql.executeZCQLQuery(
          `SELECT fir_date, crime_head_id, gravity_id, district_id
           FROM CaseMaster
           WHERE ROWID IN (${firIds.slice(0, 20).map(Number).join(',') || 'NULL'})
           LIMIT 20`
        ).catch(() => [])
      : [];

    const priorCount = firIds.length;
    const now = Date.now();
    const dates = (firDetails || []).map(r => new Date(r.fir_date || r['CaseMaster.fir_date'] || 0).getTime()).filter(Boolean);
    const mostRecent = dates.length ? Math.max(...dates) : 0;
    const daysSinceLast = mostRecent ? Math.round((now - mostRecent) / 86400000) : 9999;

    // Crime type severity encoding: violent crimes weight higher
    const crimeHeads = new Set((firDetails || []).map(r => String(r.crime_head_id || r['CaseMaster.crime_head_id'] || '')));
    const gravities  = (firDetails || []).map(r => parseInt(r.gravity_id || r['CaseMaster.gravity_id'] || 1, 10));
    const avgGravity = gravities.length ? gravities.reduce((a, b) => a + b, 0) / gravities.length : 1;

    return {
      features: {
        name,
        priorCount,
        daysSinceLast,
        avgGravity,
        uniqueCrimeHeads: crimeHeads.size,
        recentActivity: daysSinceLast < 365 ? 1 : 0,
        repeatOffender: priorCount > 1 ? 1 : 0,
      },
      firIds,
      resolvedAccusedId,
    };
  } catch (err) {
    console.warn('[riskEngine] Feature extraction failed, using defaults:', err.message);
    return {
      features: { priorCount: 0, daysSinceLast: 9999, avgGravity: 1, uniqueCrimeHeads: 0, recentActivity: 0, repeatOffender: 0, name: accusedName || '' },
      firIds: [],
      resolvedAccusedId: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Zia AutoML Model Call (live cloud)
// ---------------------------------------------------------------------------
async function callZiaModel(catalystApp, modelId, features) {
  try {
    const zia = catalystApp.zia();
    const featureVector = [
      features.priorCount,
      features.daysSinceLast,
      features.avgGravity,
      features.uniqueCrimeHeads,
      features.recentActivity,
      features.repeatOffender,
    ];
    const prediction = await zia.prediction(modelId, featureVector);
    const score = parseFloat(prediction?.prediction || prediction?.score || 0.5);
    return {
      score,
      confidence: parseFloat(prediction?.confidence || 0.75),
      factors: prediction?.contributing_features || buildFactors(features),
    };
  } catch (err) {
    console.warn('[riskEngine] Zia AutoML call failed, falling back to mock:', err.message);
    return mockScore(features);
  }
}

// ---------------------------------------------------------------------------
// Deterministic Mock Score (local dev / fallback)
// ---------------------------------------------------------------------------
function mockScore(features) {
  const { priorCount, daysSinceLast, avgGravity, recentActivity } = features;

  // Weighted scoring formula
  const priorWeight   = Math.min(priorCount * 0.15, 0.45);   // max 0.45
  const gravityWeight = Math.min((avgGravity - 1) * 0.08, 0.20); // max 0.20
  const recencyWeight = recentActivity ? 0.20 : 0;
  const decayFactor   = daysSinceLast < 180 ? 1.0 : daysSinceLast < 730 ? 0.7 : 0.3;

  const score = Math.min((priorWeight + gravityWeight + recencyWeight) * decayFactor + 0.05, 1.0);

  return {
    score: Math.round(score * 100) / 100,
    confidence: 72, // fixed mock confidence
    factors: buildFactors(features),
  };
}

function buildFactors(features) {
  const f = [];
  if (features.priorCount > 3) f.push(`${features.priorCount} prior FIRs — high repeat rate`);
  if (features.priorCount > 0 && features.priorCount <= 3) f.push(`${features.priorCount} prior FIR(s) on record`);
  if (features.recentActivity) f.push('Recent criminal activity within 12 months');
  if (features.avgGravity > 2)  f.push(`High-gravity offences (avg. gravity ${features.avgGravity.toFixed(1)})`);
  if (features.uniqueCrimeHeads > 2) f.push(`Diverse crime typology (${features.uniqueCrimeHeads} categories)`);
  if (features.daysSinceLast < 90) f.push('Active within last 90 days — elevated concern');
  if (f.length === 0) f.push('No significant risk indicators found');
  return f;
}

// ---------------------------------------------------------------------------
// Fetch accused list for batch scoring
// ---------------------------------------------------------------------------
async function fetchAccusedList(catalystApp, { caseId, stationId }) {
  try {
    const zcql = catalystApp.zcql();
    if (caseId) {
      const rows = await zcql.executeZCQLQuery(
        `SELECT a.ROWID, a.accused_name
         FROM Accused a JOIN FIR_Accused fa ON fa.accused_id = a.ROWID
         WHERE fa.fir_id = ${Number(caseId)}
         LIMIT 100`
      );
      return (rows || []).map(r => ({ ROWID: r.ROWID || r['a.ROWID'], accused_name: r.accused_name || r['a.accused_name'] }));
    }
    const rows = await zcql.executeZCQLQuery(
      `SELECT ROWID, accused_name FROM Accused LIMIT 200`
    );
    return (rows || []).map(r => ({ ROWID: r.ROWID, accused_name: r.accused_name }));
  } catch {
    return [];
  }
}

module.exports = { riskEngine };
