'use strict';

/**
 * sqlBuilder.js — Safe, RBAC-aware SQL query builder for nl-to-query
 *
 * Takes a parsed intent + entities + user role and returns:
 *   {
 *     sql:        string,              // ZCQL query to execute
 *     params:     object,              // values used (for audit logging)
 *     tables:     string[],            // tables accessed (for audit)
 *     is_aggregate: boolean,           // true = safe for all roles
 *     description: string,             // human-readable description of query
 *   }
 *
 * RBAC rules enforced here:
 *   - policymaker: ONLY aggregate/COUNT queries, never row-level
 *   - analyst:     FIR list columns only, no accused/victim PII
 *   - investigator/supervisor: full row access
 *
 * SQL safety: all user-provided values go through sanitizers.
 *             NEVER string-interpolate user input directly.
 */

const { INTENTS } = require('./intentParser');

// Max rows returned per query (pagination)
const MAX_ROWS = 20;

// ---------------------------------------------------------------------------
// Column sets by role (what columns are returned per role)
// ---------------------------------------------------------------------------

const FIR_COLUMNS = {
  full: [
    'f.ROWID', 'f.crime_number', 'f.year', 'f.fir_date',
    'f.occurrence_address', 'f.occurrence_lat', 'f.occurrence_lng',
    'f.brief_facts', 'f.chargesheet_filed', 'f.chargesheet_date',
    'f.status_id', 'f.category_id', 'f.gravity_id',
    'f.io_officer_id', 'f.station_id',
  ].join(', '),
  list: [
    'f.ROWID', 'f.crime_number', 'f.year', 'f.fir_date',
    'f.status_id', 'f.category_id', 'f.station_id',
  ].join(', '),
  aggregate: 'COUNT(f.ROWID) as total',
};

const ACCUSED_COLUMNS = {
  full: [
    'a.ROWID', 'a.full_name', 'a.alias', 'a.age', 'a.gender',
    'a.father_name', 'a.address', 'a.is_repeat_offender', 'a.prior_cases_count',
    'fa.person_label', 'fa.role_in_case', 'fa.is_arrested', 'fa.is_absconding',
  ].join(', '),
  list: ['a.ROWID', 'a.full_name', 'a.age', 'a.gender', 'fa.is_arrested'].join(', '),
};

const VICTIM_COLUMNS = {
  full: [
    'v.ROWID', 'v.full_name', 'v.age', 'v.gender',
    'v.injury_description', 'fv.person_label',
  ].join(', '),
};

// ---------------------------------------------------------------------------
// Main: buildQuery
// ---------------------------------------------------------------------------

/**
 * @param {object} intentResult  - from intentParser.parseIntent()
 * @param {string} role          - user role
 * @param {object} extraFilters  - optional additional filters from client
 * @returns {{ sql, params, tables, is_aggregate, description }}
 */
function buildQuery(intentResult, role, extraFilters = {}) {
  const { intent, entities } = intentResult;
  const isPolicymaker = role === 'policymaker';
  const isAnalyst     = role === 'analyst';
  const isFull        = role === 'investigator' || role === 'supervisor';

  // Policymaker always gets aggregate
  if (isPolicymaker && intent !== INTENTS.AGGREGATE_STATS) {
    return buildAggregateQuery(entities, role, 'policymaker-forced');
  }

  switch (intent) {
    case INTENTS.FIR_LOOKUP:
    case INTENTS.CASE_STATUS:
      return buildFIRQuery(entities, isFull, isAnalyst, role);

    case INTENTS.ACCUSED_LOOKUP:
      if (isAnalyst) {
        // Analyst can't see accused PII — redirect to FIR list
        return buildFIRQuery(entities, false, true, role);
      }
      return buildAccusedQuery(entities, isFull, role);

    case INTENTS.VICTIM_LOOKUP:
      if (isAnalyst) {
        return buildFIRQuery(entities, false, true, role);
      }
      return buildVictimQuery(entities, isFull, role);

    case INTENTS.AGGREGATE_STATS:
      return buildAggregateQuery(entities, role, 'user-requested');

    case INTENTS.OFFICER_LOOKUP:
      return buildOfficerQuery(entities, role);

    default:
      // Unknown intent: try a broad FIR list
      return buildFIRQuery({}, false, false, role);
  }
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

function buildFIRQuery(entities, full, listOnly, role) {
  const cols = full ? FIR_COLUMNS.full : FIR_COLUMNS.list;
  const conditions = [];
  const params     = {};

  if (entities.crime_numbers?.length) {
    const safe = entities.crime_numbers.map(sanitizeCrimeNumber).filter(Boolean);
    if (safe.length === 1) {
      conditions.push(`f.crime_number = '${safe[0]}'`);
      params.crime_number = safe[0];
    } else if (safe.length > 1) {
      conditions.push(`f.crime_number IN (${safe.map(s => `'${s}'`).join(', ')})`);
      params.crime_numbers = safe;
    }
  }

  if (entities.years?.length) {
    const yr = sanitizeYear(entities.years[0]);
    if (yr) { conditions.push(`f.year = ${yr}`); params.year = yr; }
  }

  if (entities.statuses?.length) {
    const s = sanitizeText(entities.statuses[0]);
    if (s) {
      conditions.push(
        `f.status_id IN (SELECT ROWID FROM CaseStatusMaster WHERE LOWER(status_name) LIKE '%${s}%')`
      );
      params.status = s;
    }
  }

  if (entities.crime_types?.length) {
    const ct = sanitizeText(entities.crime_types[0]);
    if (ct) {
      conditions.push(
        `f.crime_head_id IN (SELECT ROWID FROM CrimeHead WHERE LOWER(head_name) LIKE '%${ct}%')`
      );
      params.crime_type = ct;
    }
  }

  if (entities.stations?.length) {
    const st = sanitizeText(entities.stations[0]);
    if (st) {
      conditions.push(
        `f.station_id IN (SELECT ROWID FROM Station WHERE LOWER(unit_name) LIKE '%${st}%')`
      );
      params.station = st;
    }
  }

  if (entities.districts?.length) {
    const d = sanitizeText(entities.districts[0]);
    if (d) {
      conditions.push(
        `f.station_id IN (SELECT ROWID FROM Station WHERE district_id IN (SELECT ROWID FROM District WHERE LOWER(district_name) LIKE '%${d}%'))`
      );
      params.district = d;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql   = `SELECT ${cols} FROM FIR f ${where} ORDER BY f.fir_date DESC LIMIT ${MAX_ROWS}`;

  return {
    sql,
    params,
    tables:       ['FIR'],
    is_aggregate: false,
    description:  `FIR ${listOnly ? 'list' : 'detail'} query with filters: ${JSON.stringify(params)}`,
  };
}

function buildAccusedQuery(entities, full, role) {
  const cols = full ? ACCUSED_COLUMNS.full : ACCUSED_COLUMNS.list;
  const conditions = ['1=1'];
  const params     = {};

  if (entities.names?.length) {
    const n = sanitizeText(entities.names[0]);
    if (n) {
      conditions.push(`(LOWER(a.full_name) LIKE '%${n}%' OR LOWER(a.alias) LIKE '%${n}%')`);
      params.name = n;
    }
  }

  if (entities.crime_numbers?.length) {
    const cn = sanitizeCrimeNumber(entities.crime_numbers[0]);
    if (cn) {
      conditions.push(
        `fa.fir_id IN (SELECT ROWID FROM FIR WHERE crime_number = '${cn}')`
      );
      params.crime_number = cn;
    }
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT ${cols}
    FROM Accused a
    JOIN FIR_Accused fa ON fa.accused_id = a.ROWID
    ${where}
    ORDER BY a.full_name
    LIMIT ${MAX_ROWS}
  `.trim();

  return {
    sql,
    params,
    tables:       ['Accused', 'FIR_Accused'],
    is_aggregate: false,
    description:  `Accused lookup with filters: ${JSON.stringify(params)}`,
  };
}

function buildVictimQuery(entities, full, role) {
  const cols = VICTIM_COLUMNS.full;
  const conditions = ['1=1'];
  const params     = {};

  if (entities.names?.length) {
    const n = sanitizeText(entities.names[0]);
    if (n) {
      conditions.push(`LOWER(v.full_name) LIKE '%${n}%'`);
      params.name = n;
    }
  }

  if (entities.crime_numbers?.length) {
    const cn = sanitizeCrimeNumber(entities.crime_numbers[0]);
    if (cn) {
      conditions.push(
        `fv.fir_id IN (SELECT ROWID FROM FIR WHERE crime_number = '${cn}')`
      );
      params.crime_number = cn;
    }
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT ${cols}
    FROM Victim v
    JOIN FIR_Victim fv ON fv.victim_id = v.ROWID
    ${where}
    ORDER BY v.full_name
    LIMIT ${MAX_ROWS}
  `.trim();

  return {
    sql,
    params,
    tables:       ['Victim', 'FIR_Victim'],
    is_aggregate: false,
    description:  `Victim lookup with filters: ${JSON.stringify(params)}`,
  };
}

function buildAggregateQuery(entities, role, reason) {
  const conditions = [];
  const params     = {};

  if (entities.years?.length) {
    const yr = sanitizeYear(entities.years[0]);
    if (yr) { conditions.push(`year = ${yr}`); params.year = yr; }
  }

  if (entities.stations?.length) {
    const st = sanitizeText(entities.stations[0]);
    if (st) {
      conditions.push(
        `station_id IN (SELECT ROWID FROM Station WHERE LOWER(unit_name) LIKE '%${st}%')`
      );
      params.station = st;
    }
  }

  if (entities.crime_types?.length) {
    const ct = sanitizeText(entities.crime_types[0]);
    if (ct) {
      conditions.push(
        `crime_head_id IN (SELECT ROWID FROM CrimeHead WHERE LOWER(head_name) LIKE '%${ct}%')`
      );
      params.crime_type = ct;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Always return at least count + status breakdown
  const sql = `
    SELECT
      COUNT(*) AS total_firs,
      SUM(CASE WHEN chargesheet_filed = 1 THEN 1 ELSE 0 END) AS chargesheeted,
      SUM(CASE WHEN chargesheet_filed = 0 THEN 1 ELSE 0 END) AS under_investigation,
      year
    FROM FIR
    ${where}
    GROUP BY year
    ORDER BY year DESC
    LIMIT 10
  `.trim();

  return {
    sql,
    params,
    tables:       ['FIR'],
    is_aggregate: true,
    description:  `Aggregate stats (${reason}) with filters: ${JSON.stringify(params)}`,
  };
}

function buildOfficerQuery(entities, role) {
  const conditions = ['1=1'];
  const params     = {};

  if (entities.names?.length) {
    const n = sanitizeText(entities.names[0]);
    if (n) {
      conditions.push(`(LOWER(o.full_name) LIKE '%${n}%' OR o.badge_number LIKE '%${n}%')`);
      params.name = n;
    }
  }

  const sql = `
    SELECT o.ROWID, o.badge_number, o.full_name, o.station_id, o.is_active
    FROM Officer o
    WHERE ${conditions.join(' AND ')}
    LIMIT ${MAX_ROWS}
  `.trim();

  return {
    sql,
    params,
    tables:       ['Officer'],
    is_aggregate: false,
    description:  `Officer lookup: ${JSON.stringify(params)}`,
  };
}

// ---------------------------------------------------------------------------
// Sanitizers — prevent SQL injection
// ---------------------------------------------------------------------------

function sanitizeCrimeNumber(s) {
  if (!s) return null;
  // Allow only: letters, digits, dash, slash
  const clean = String(s).replace(/[^A-Z0-9\-\/]/gi, '').slice(0, 30);
  return clean || null;
}

function sanitizeYear(n) {
  const y = parseInt(n);
  return y >= 2000 && y <= 2100 ? y : null;
}

function sanitizeText(s) {
  if (!s) return null;
  // Allow letters, digits, space, dash — no quotes or SQL metacharacters
  return String(s).replace(/['";\\\-\-]/g, '').slice(0, 100).trim().toLowerCase() || null;
}

module.exports = { buildQuery };
