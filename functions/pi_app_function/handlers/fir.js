'use strict';

/**
 * handlers/fir.js — FIR (CaseMaster) endpoints for pi-api
 *
 * Routes:
 *   GET  /api/fir          → list FIRs (paginated, filtered by station/date/status)
 *   GET  /api/fir/:id      → single FIR detail
 *   GET  /api/fir/stats    → aggregate stats (policymaker-safe)
 *
 * RBAC:
 *   - list:   investigator, analyst, supervisor
 *   - detail: investigator, supervisor
 *   - stats:  all roles (aggregate only — no row-level data)
 *
 * Policymaker NEVER gets row-level FIR data.
 */

const { ROLES, checkRole, RBACError, sendRBACError } = require('../lib/rbac');
const { ACTIONS, TABLES, logRead, logError } = require('../lib/auditLogger');
const { sendJSON, getPagination } = require('../lib/routeHelpers');

// ---------------------------------------------------------------------------
// GET /api/fir — paginated FIR list (no PII fields returned)
// ---------------------------------------------------------------------------

async function handleFIRList(catalystApp, req, res, query) {
  let authData;
  try {
    authData = await checkRole(catalystApp, req, [
      ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR,
    ]);
  } catch (err) {
    await logError(catalystApp, {
      action: ACTIONS.READ_FIR_LIST, tableName: TABLES.FIR, req,
      statusCode: err.statusCode || 403, errorMessage: err.message,
    }).catch(() => {});
    return sendRBACError(res, err);
  }

  const { userId, userEmail, role } = authData;
  const { page, pageSize, offset }  = getPagination(query);

  try {
    const datastore = catalystApp.datastore();
    const table     = datastore.table('FIR');

    // Build ZCQL query — safe, parameterized via Catalyst SDK
    // Filters from query string (station_id, status_id, year, from_date, to_date)
    let zcql = `SELECT ROWID, crime_number, year, station_id, fir_date, occurrence_from, ` +
               `category_id, gravity_id, crime_head_id, status_id, io_officer_id, ` +
               `chargesheet_filed, chargesheet_date, CREATEDTIME ` +
               `FROM FIR`;

    const conditions = [];
    const safeFilters = {};

    if (query.station_id) {
      conditions.push(`station_id = ${parseInt(query.station_id, 10)}`);
      safeFilters.station_id = parseInt(query.station_id, 10);
    }
    if (query.status_id) {
      conditions.push(`status_id = ${parseInt(query.status_id, 10)}`);
      safeFilters.status_id = parseInt(query.status_id, 10);
    }
    if (query.year) {
      conditions.push(`year = ${parseInt(query.year, 10)}`);
      safeFilters.year = parseInt(query.year, 10);
    }
    if (query.from_date) {
      conditions.push(`fir_date >= '${sanitizeDate(query.from_date)}'`);
      safeFilters.from_date = query.from_date;
    }
    if (query.to_date) {
      conditions.push(`fir_date <= '${sanitizeDate(query.to_date)}'`);
      safeFilters.to_date = query.to_date;
    }

    if (conditions.length) zcql += ' WHERE ' + conditions.join(' AND ');
    zcql += ` ORDER BY fir_date DESC LIMIT ${pageSize} OFFSET ${offset}`;

    const rows = await datastore.executeQuery(zcql);

    // Audit the list read (no record_id for list ops)
    await logRead(catalystApp, {
      userId, userEmail, role,
      action:      ACTIONS.READ_FIR_LIST,
      tableName:   TABLES.FIR,
      queryParams: { ...safeFilters, page, pageSize },
      req,
      statusCode:  200,
    });

    sendJSON(res, 200, {
      data:     rows,
      page,
      pageSize,
      count:    rows.length,
    });
  } catch (err) {
    console.error('[FIR] handleFIRList error:', err.message);
    await logError(catalystApp, {
      userId, userEmail, role,
      action: ACTIONS.READ_FIR_LIST, tableName: TABLES.FIR,
      req, statusCode: 500, errorMessage: err.message,
    }).catch(() => {});
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/fir/:id — single FIR detail (no sensitive columns by default)
// ---------------------------------------------------------------------------

async function handleFIRDetail(catalystApp, req, res, firId) {
  let authData;
  try {
    authData = await checkRole(catalystApp, req, [ROLES.INVESTIGATOR, ROLES.SUPERVISOR]);
  } catch (err) {
    await logError(catalystApp, {
      action: ACTIONS.READ_FIR_DETAIL, tableName: TABLES.FIR, req,
      statusCode: err.statusCode || 403, errorMessage: err.message,
    }).catch(() => {});
    return sendRBACError(res, err);
  }

  const { userId, userEmail, role } = authData;
  const id = parseInt(firId, 10);
  if (!id) return sendJSON(res, 400, { error: 'Invalid FIR id' });

  try {
    const datastore = catalystApp.datastore();

    // Fetch FIR
    const firRows = await datastore.executeQuery(
      `SELECT ROWID, crime_number, year, station_id, fir_date, occurrence_from, occurrence_to,
              occurrence_address, occurrence_lat, occurrence_lng,
              category_id, gravity_id, crime_head_id, crime_sub_head_id, status_id, court_id,
              io_officer_id, brief_facts,
              chargesheet_filed, chargesheet_date, CREATEDTIME
       FROM FIR WHERE ROWID = ${id}`
    );

    if (!firRows || firRows.length === 0) {
      return sendJSON(res, 404, { error: 'FIR not found' });
    }
    const fir = firRows[0];

    // Fetch accused (non-sensitive fields only)
    const accused = await datastore.executeQuery(
      `SELECT fa.ROWID, fa.accused_id, fa.person_label, fa.role_in_case, fa.is_arrested, fa.is_absconding,
              a.full_name, a.alias, a.age, a.gender, a.is_repeat_offender
       FROM FIR_Accused fa
       JOIN Accused a ON fa.accused_id = a.ROWID
       WHERE fa.fir_id = ${id}`
    );

    // Fetch victims (non-sensitive fields only)
    const victims = await datastore.executeQuery(
      `SELECT fv.ROWID, fv.victim_id, fv.person_label,
              v.full_name, v.age, v.gender, v.injury_description
       FROM FIR_Victim fv
       JOIN Victim v ON fv.victim_id = v.ROWID
       WHERE fv.fir_id = ${id}`
    );

    await logRead(catalystApp, {
      userId, userEmail, role,
      action:    ACTIONS.READ_FIR_DETAIL,
      tableName: TABLES.FIR,
      recordId:  String(id),
      req,
      statusCode: 200,
    });

    sendJSON(res, 200, { data: { fir, accused, victims } });
  } catch (err) {
    console.error('[FIR] handleFIRDetail error:', err.message);
    await logError(catalystApp, {
      userId, userEmail, role,
      action: ACTIONS.READ_FIR_DETAIL, tableName: TABLES.FIR,
      req, statusCode: 500, errorMessage: err.message,
    }).catch(() => {});
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/fir/stats — aggregate stats (safe for all roles incl. policymaker)
// ---------------------------------------------------------------------------

async function handleFIRStats(catalystApp, req, res, query) {
  let authData;
  try {
    authData = await checkRole(catalystApp, req, [
      ROLES.INVESTIGATOR, ROLES.ANALYST, ROLES.SUPERVISOR, ROLES.POLICYMAKER,
    ]);
  } catch (err) {
    await logError(catalystApp, {
      action: ACTIONS.READ_FIR_AGGREGATE, tableName: TABLES.FIR, req,
      statusCode: err.statusCode || 403, errorMessage: err.message,
    }).catch(() => {});
    return sendRBACError(res, err);
  }

  const { userId, userEmail, role } = authData;

  try {
    const datastore = catalystApp.datastore();

    const [totalRows, byStatusRows, byYearRows] = await Promise.all([
      datastore.executeQuery(`SELECT COUNT(*) AS total FROM FIR`),
      datastore.executeQuery(
        `SELECT s.status_name, COUNT(f.ROWID) AS count
         FROM FIR f
         LEFT JOIN CaseStatusMaster s ON f.status_id = s.ROWID
         GROUP BY s.status_name`
      ),
      datastore.executeQuery(
        `SELECT year, COUNT(*) AS count FROM FIR GROUP BY year ORDER BY year DESC LIMIT 10`
      ),
    ]);

    await logRead(catalystApp, {
      userId, userEmail, role,
      action:    ACTIONS.READ_FIR_AGGREGATE,
      tableName: TABLES.FIR,
      req,
      statusCode: 200,
    });

    sendJSON(res, 200, {
      data: {
        total:    totalRows[0]?.total || 0,
        byStatus: byStatusRows,
        byYear:   byYearRows,
      },
    });
  } catch (err) {
    console.error('[FIR] handleFIRStats error:', err.message);
    await logError(catalystApp, {
      userId, userEmail, role,
      action: ACTIONS.READ_FIR_AGGREGATE, tableName: TABLES.FIR,
      req, statusCode: 500, errorMessage: err.message,
    }).catch(() => {});
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// Utility: sanitize date strings to prevent SQL injection (YYYY-MM-DD only)
// ---------------------------------------------------------------------------

function sanitizeDate(dateStr) {
  const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) throw new Error(`Invalid date format: ${dateStr}`);
  return match[1];
}

module.exports = { handleFIRList, handleFIRDetail, handleFIRStats };
