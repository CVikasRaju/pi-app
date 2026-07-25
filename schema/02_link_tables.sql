-- =============================================================================
-- PI App — Phase 0 Link / Junction Tables
-- Run AFTER: 01_core_tables.sql, 03_lookup_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FIR ↔ Accused (many-to-many — one accused can appear in multiple FIRs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS FIR_Accused (
    ROWID           BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fir_id          BIGINT          NOT NULL,
    accused_id      BIGINT          NOT NULL,
    person_label    VARCHAR(10)     NULL,           -- role label in this specific FIR (A1, A2…)
    role_in_case    VARCHAR(200)    NULL,           -- e.g. "Principal offender", "Accomplice"
    is_arrested     TINYINT(1)      NOT NULL DEFAULT 0,
    is_absconding   TINYINT(1)      NOT NULL DEFAULT 0,
    UNIQUE KEY uq_fir_accused (fir_id, accused_id),
    CREATEDTIME     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fir_id)     REFERENCES FIR(ROWID),
    FOREIGN KEY (accused_id) REFERENCES Accused(ROWID)
);

-- -----------------------------------------------------------------------------
-- 2. FIR ↔ Victim (many-to-many)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS FIR_Victim (
    ROWID           BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fir_id          BIGINT          NOT NULL,
    victim_id       BIGINT          NOT NULL,
    person_label    VARCHAR(10)     NULL,           -- V1, V2 ... in this FIR
    UNIQUE KEY uq_fir_victim (fir_id, victim_id),
    CREATEDTIME     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fir_id)    REFERENCES FIR(ROWID),
    FOREIGN KEY (victim_id) REFERENCES Victim(ROWID)
);

-- -----------------------------------------------------------------------------
-- 3. Act & Section lookup (used in ActSectionAssociation)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Act (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    act_code        VARCHAR(30)    NOT NULL UNIQUE,
    act_name        VARCHAR(300)   NOT NULL,
    short_name      VARCHAR(100)   NULL,
    year_enacted    YEAR           NULL,
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Section (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    act_id          BIGINT         NOT NULL,
    section_number  VARCHAR(30)    NOT NULL,
    description     TEXT           NULL,
    UNIQUE KEY uq_act_section (act_id, section_number),
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (act_id) REFERENCES Act(ROWID)
);

-- FIR ↔ Act/Section (many-to-many: one FIR may be charged under multiple sections)
CREATE TABLE IF NOT EXISTS ActSectionAssociation (
    ROWID           BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fir_id          BIGINT         NOT NULL,
    section_id      BIGINT         NOT NULL,
    UNIQUE KEY uq_fir_section (fir_id, section_id),
    CREATEDTIME     DATETIME       DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fir_id)     REFERENCES FIR(ROWID),
    FOREIGN KEY (section_id) REFERENCES Section(ROWID)
);

-- -----------------------------------------------------------------------------
-- 4. ArrestSurrender (with junction to Accused)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ArrestSurrender (
    ROWID               BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fir_id              BIGINT          NOT NULL,
    arrest_type         ENUM('ARREST','SURRENDER') NOT NULL DEFAULT 'ARREST',
    arrest_date         DATETIME        NULL,
    arresting_officer_id BIGINT         NULL,
    custody_type        VARCHAR(100)    NULL,           -- e.g. "Police custody", "Judicial custody"
    bail_granted        TINYINT(1)      NOT NULL DEFAULT 0,
    bail_date           DATETIME        NULL,
    remarks             TEXT            NULL,
    CREATEDTIME         DATETIME        DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fir_id)                REFERENCES FIR(ROWID),
    FOREIGN KEY (arresting_officer_id)  REFERENCES Officer(ROWID)
);

-- Junction: ArrestSurrender ↔ Accused (one arrest event may involve multiple accused)
CREATE TABLE IF NOT EXISTS ArrestSurrender_Accused (
    ROWID                   BIGINT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    arrest_surrender_id     BIGINT  NOT NULL,
    accused_id              BIGINT  NOT NULL,
    UNIQUE KEY uq_arrest_accused (arrest_surrender_id, accused_id),
    CREATEDTIME     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    MODIFIEDTIME    DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (arrest_surrender_id) REFERENCES ArrestSurrender(ROWID),
    FOREIGN KEY (accused_id)          REFERENCES Accused(ROWID)
);
