-- =============================================================================
-- PI App — Phase 0 Lookup / Classification Tables
-- Run AFTER 01_core_tables.sql, BEFORE 02_link_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Case classification hierarchy
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CaseCategory (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    category_code   VARCHAR(20)    NOT NULL UNIQUE,
    category_name   VARCHAR(150)   NOT NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GravityOffence (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    gravity_code    VARCHAR(20)    NOT NULL UNIQUE,
    gravity_name    VARCHAR(100)   NOT NULL,           -- e.g. "Heinous", "Serious", "Minor"
    gravity_level   INT            NOT NULL DEFAULT 0, -- 1=highest severity
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CrimeHead (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    head_code       VARCHAR(20)    NOT NULL UNIQUE,
    head_name       VARCHAR(200)   NOT NULL,
    category_id     BIGINT         NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES CaseCategory(ROWID)
);

CREATE TABLE IF NOT EXISTS CrimeSubHead (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sub_head_code   VARCHAR(20)    NOT NULL UNIQUE,
    sub_head_name   VARCHAR(200)   NOT NULL,
    head_id         BIGINT         NOT NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (head_id) REFERENCES CrimeHead(ROWID)
);

-- -----------------------------------------------------------------------------
-- 2. Case status
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CaseStatusMaster (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    status_code     VARCHAR(20)    NOT NULL UNIQUE,
    status_name     VARCHAR(100)   NOT NULL,           -- e.g. "Under Investigation", "Chargesheeted", "Closed"
    is_terminal     TINYINT(1)     NOT NULL DEFAULT 0, -- 1 = final state, no further updates expected
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. Socio-demographic lookups (SENSITIVE — see architecture.md §4a)
--    Never join these at row-level for Analyst/Supervisor/Policymaker roles.
--    Only via pre-aggregated views.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CasteMaster (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    caste_code      VARCHAR(20)    NOT NULL UNIQUE,
    caste_name      VARCHAR(150)   NOT NULL,
    category        VARCHAR(50)    NULL,               -- e.g. "SC", "ST", "OBC", "General"
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ReligionMaster (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    religion_code   VARCHAR(20)    NOT NULL UNIQUE,
    religion_name   VARCHAR(100)   NOT NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS OccupationMaster (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    occupation_code VARCHAR(20)    NOT NULL UNIQUE,
    occupation_name VARCHAR(150)   NOT NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. Add FK constraints back on FIR now that lookup tables exist
-- -----------------------------------------------------------------------------

ALTER TABLE FIR
    ADD CONSTRAINT fk_fir_category
        FOREIGN KEY (category_id)      REFERENCES CaseCategory(ROWID),
    ADD CONSTRAINT fk_fir_gravity
        FOREIGN KEY (gravity_id)       REFERENCES GravityOffence(ROWID),
    ADD CONSTRAINT fk_fir_crime_head
        FOREIGN KEY (crime_head_id)    REFERENCES CrimeHead(ROWID),
    ADD CONSTRAINT fk_fir_crime_sub
        FOREIGN KEY (crime_sub_head_id) REFERENCES CrimeSubHead(ROWID),
    ADD CONSTRAINT fk_fir_status
        FOREIGN KEY (status_id)        REFERENCES CaseStatusMaster(ROWID);

ALTER TABLE Accused
    ADD CONSTRAINT fk_accused_occupation
        FOREIGN KEY (occupation_id)  REFERENCES OccupationMaster(ROWID),
    ADD CONSTRAINT fk_accused_caste
        FOREIGN KEY (caste_id)       REFERENCES CasteMaster(ROWID),
    ADD CONSTRAINT fk_accused_religion
        FOREIGN KEY (religion_id)    REFERENCES ReligionMaster(ROWID);

ALTER TABLE Victim
    ADD CONSTRAINT fk_victim_occupation
        FOREIGN KEY (occupation_id)  REFERENCES OccupationMaster(ROWID),
    ADD CONSTRAINT fk_victim_caste
        FOREIGN KEY (caste_id)       REFERENCES CasteMaster(ROWID),
    ADD CONSTRAINT fk_victim_religion
        FOREIGN KEY (religion_id)    REFERENCES ReligionMaster(ROWID);

ALTER TABLE ComplainantDetails
    ADD CONSTRAINT fk_complainant_occupation
        FOREIGN KEY (occupation_id)  REFERENCES OccupationMaster(ROWID),
    ADD CONSTRAINT fk_complainant_caste
        FOREIGN KEY (caste_id)       REFERENCES CasteMaster(ROWID),
    ADD CONSTRAINT fk_complainant_religion
        FOREIGN KEY (religion_id)    REFERENCES ReligionMaster(ROWID);

-- -----------------------------------------------------------------------------
-- 5. Seed data: Karnataka state + a sample district + statuses
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO State (state_code, state_name)
VALUES ('KA', 'Karnataka');

INSERT IGNORE INTO CaseStatusMaster (status_code, status_name, is_terminal) VALUES
    ('PEND',   'Pending Investigation',  0),
    ('UI',     'Under Investigation',    0),
    ('CS',     'Chargesheeted',          0),
    ('FR',     'Final Report Filed',     1),
    ('CLOSED', 'Closed',                 1),
    ('TRIAL',  'Under Trial',            0),
    ('CONV',   'Convicted',              1),
    ('ACQ',    'Acquitted',              1);

INSERT IGNORE INTO GravityOffence (gravity_code, gravity_name, gravity_level) VALUES
    ('HEINOUS',  'Heinous Offence',  1),
    ('SERIOUS',  'Serious Offence',  2),
    ('MINOR',    'Minor Offence',    3),
    ('PETTY',    'Petty Offence',    4);
