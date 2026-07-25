'use strict';

/**
 * demographicQuery.js — Sociological Cross-Referencing
 *
 * CRITICAL (per architecture §4a):
 *   - Never returns named individual caste/religion data.
 *   - Sensitive aggregates (caste/religion) are only returned as
 *     rounded percentages per category, accessible to SUPERVISOR/POLICYMAKER.
 *   - Every call to getSensitiveAggregates() must be distinctly logged as
 *     SENSITIVE_AGGREGATE_ACCESS in AuditLog.
 */

const demographicQuery = {
  /**
   * General demographics — occupation/gender breakdown.
   * Safe for all roles (no PII).
   */
  async getGeneralDemographics(catalystApp, { districtId = null, crimeHead = null }) {
    try {
      const zcql = catalystApp.zcql();

      // Gender breakdown of victims
      let genderQuery = `SELECT gender, COUNT(*) AS cnt FROM Victim`;
      const genderWhere = [];
      if (districtId) genderWhere.push(`district_id = ${Number(districtId)}`);
      if (genderWhere.length) genderQuery += ` WHERE ${genderWhere.join(' AND ')}`;
      genderQuery += ` GROUP BY gender LIMIT 20`;

      // Occupation breakdown of complainants
      let occupationQuery = `SELECT o.occupation_name, COUNT(*) AS cnt
                              FROM ComplainantDetails cd
                              JOIN OccupationMaster o ON o.ROWID = cd.occupation_id`;
      const occWhere = [];
      if (crimeHead) occWhere.push(`cd.fir_id IN (SELECT ROWID FROM CaseMaster WHERE crime_head_id = ${Number(crimeHead)})`);
      if (occWhere.length) occupationQuery += ` WHERE ${occWhere.join(' AND ')}`;
      occupationQuery += ` GROUP BY o.occupation_name ORDER BY cnt DESC LIMIT 15`;

      const [genderRows, occupationRows] = await Promise.all([
        zcql.executeZCQLQuery(genderQuery).catch(() => []),
        zcql.executeZCQLQuery(occupationQuery).catch(() => []),
      ]);

      return {
        gender: normaliseRows(genderRows, 'gender', 'cnt'),
        occupation: normaliseRows(occupationRows, 'occupation_name', 'cnt'),
        sources: ['ComplainantDetails', 'Victim', 'OccupationMaster'],
      };
    } catch (err) {
      console.warn('[demographicQuery] General demographics failed, returning mock:', err.message);
      return buildMockGeneralDemographics();
    }
  },

  /**
   * Sensitive aggregates — caste/religion percentage breakdown.
   * SUPERVISOR / POLICYMAKER only (enforced at gateway + double-checked in index.js).
   * Per architecture §4a — rounded to nearest 5% to prevent re-identification.
   */
  async getSensitiveAggregates(catalystApp, { districtId = null, crimeHead = null }) {
    try {
      const zcql = catalystApp.zcql();

      // Caste distribution
      let casteQuery = `SELECT c.caste_name, COUNT(*) AS cnt
                        FROM ComplainantDetails cd
                        JOIN CasteMaster c ON c.ROWID = cd.caste_id`;
      const where = [];
      if (districtId) where.push(`cd.fir_id IN (SELECT ROWID FROM CaseMaster WHERE district_id = ${Number(districtId)})`);
      if (crimeHead)  where.push(`cd.fir_id IN (SELECT ROWID FROM CaseMaster WHERE crime_head_id = ${Number(crimeHead)})`);
      if (where.length) casteQuery += ` WHERE ${where.join(' AND ')}`;
      casteQuery += ` GROUP BY c.caste_name ORDER BY cnt DESC LIMIT 20`;

      // Religion distribution
      let religionQuery = `SELECT r.religion_name, COUNT(*) AS cnt
                           FROM ComplainantDetails cd
                           JOIN ReligionMaster r ON r.ROWID = cd.religion_id`;
      if (where.length) religionQuery += ` WHERE ${where.join(' AND ')}`;
      religionQuery += ` GROUP BY r.religion_name ORDER BY cnt DESC LIMIT 20`;

      const [casteRows, religionRows] = await Promise.all([
        zcql.executeZCQLQuery(casteQuery).catch(() => []),
        zcql.executeZCQLQuery(religionQuery).catch(() => []),
      ]);

      // Round to nearest 5% for de-identification
      const casteTotal = casteRows.reduce((s, r) => s + parseInt(r.cnt || r['cnt(*)'] || 0, 10), 0) || 1;
      const religionTotal = religionRows.reduce((s, r) => s + parseInt(r.cnt || r['cnt(*)'] || 0, 10), 0) || 1;

      const casteBreakdown = casteRows.map(r => ({
        category: r.caste_name || r['c.caste_name'] || 'Unknown',
        pct: roundToNearest5(parseInt(r.cnt || r['cnt(*)'] || 0, 10) / casteTotal * 100),
      }));

      const religionBreakdown = religionRows.map(r => ({
        category: r.religion_name || r['r.religion_name'] || 'Unknown',
        pct: roundToNearest5(parseInt(r.cnt || r['cnt(*)'] || 0, 10) / religionTotal * 100),
      }));

      return {
        caste:    casteBreakdown,
        religion: religionBreakdown,
        note: 'Percentages rounded to nearest 5% for aggregate privacy.',
        sources: ['ComplainantDetails', 'CasteMaster', 'ReligionMaster'],
        audit_flag: 'SENSITIVE_AGGREGATE_ACCESS',
      };
    } catch (err) {
      console.warn('[demographicQuery] Sensitive aggregates failed, returning mock:', err.message);
      return buildMockSensitiveAggregates();
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normaliseRows(rows, nameKey, cntKey) {
  return (rows || []).map(r => ({
    category: r[nameKey] || r[`o.${nameKey}`] || r[`c.${nameKey}`] || r[`r.${nameKey}`] || 'Unknown',
    count: parseInt(r[cntKey] || r[`cnt(*)`] || 0, 10),
  }));
}

function roundToNearest5(n) {
  return Math.round(n / 5) * 5;
}

// ---------------------------------------------------------------------------
// Mock data for local dev
// ---------------------------------------------------------------------------
function buildMockGeneralDemographics() {
  return {
    gender: [
      { category: 'Male',   count: 423 },
      { category: 'Female', count: 198 },
      { category: 'Other',  count: 12  },
    ],
    occupation: [
      { category: 'Agriculture',     count: 180 },
      { category: 'Daily Wage',      count: 145 },
      { category: 'Business',        count: 98  },
      { category: 'Government',      count: 72  },
      { category: 'Student',         count: 58  },
      { category: 'Unemployed',      count: 44  },
    ],
    sources: ['ComplainantDetails', 'Victim', 'OccupationMaster'],
    mock: true,
  };
}

function buildMockSensitiveAggregates() {
  return {
    caste: [
      { category: 'OBC', pct: 35 },
      { category: 'SC',  pct: 25 },
      { category: 'General', pct: 20 },
      { category: 'ST',  pct: 15 },
      { category: 'Other', pct: 5 },
    ],
    religion: [
      { category: 'Hindu',   pct: 70 },
      { category: 'Muslim',  pct: 15 },
      { category: 'Christian', pct: 10 },
      { category: 'Other',   pct: 5  },
    ],
    note: 'Percentages rounded to nearest 5% for aggregate privacy.',
    sources: ['ComplainantDetails', 'CasteMaster', 'ReligionMaster'],
    audit_flag: 'SENSITIVE_AGGREGATE_ACCESS',
    mock: true,
  };
}

module.exports = { demographicQuery };
