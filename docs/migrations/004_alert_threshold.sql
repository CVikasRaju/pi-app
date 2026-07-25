-- Migration 004: Alert Threshold tables for Phase 4 Early-Warning
-- Run this in Catalyst Console > Data Store > SQL Editor

-- Table: AlertThreshold
-- Stores configurable thresholds that trigger early-warning notifications
CREATE TABLE IF NOT EXISTS AlertThreshold (
  ROWID             BIGINT AUTO_INCREMENT PRIMARY KEY,
  threshold_name    VARCHAR(255)  NOT NULL,
  district_id       BIGINT        DEFAULT NULL,   -- NULL = all districts
  crime_head_id     BIGINT        DEFAULT NULL,   -- NULL = all crime types
  window_days       INT           NOT NULL DEFAULT 30,
  threshold_count   INT           NOT NULL DEFAULT 10,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  notify_emails     TEXT          DEFAULT NULL,   -- comma-separated supervisor emails
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- Table: AlertFired
-- Append-only record of fired alerts (idempotency + audit trail)
-- No UPDATE or DELETE path ever exists for this table.
CREATE TABLE IF NOT EXISTS AlertFired (
  ROWID             BIGINT AUTO_INCREMENT PRIMARY KEY,
  threshold_id      VARCHAR(64)   NOT NULL,
  fired_date        DATE          NOT NULL,
  actual_count      INT           NOT NULL,
  notified_emails   TEXT          DEFAULT NULL,
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- Seed: Example thresholds for Bengaluru Urban district (id=1)
INSERT INTO AlertThreshold (threshold_name, district_id, crime_head_id, window_days, threshold_count, is_active, notify_emails)
VALUES
  ('Property Crime Surge - Bengaluru Urban', 1, NULL, 30, 50, TRUE, 'supervisor@karnataka.police.in'),
  ('Violent Crime Spike - All Districts',    NULL, 1, 14, 20, TRUE, 'supervisor@karnataka.police.in,analyst@karnataka.police.in'),
  ('Gang Activity Alert - Mysuru',           2, NULL, 7,  10, TRUE, 'supervisor@karnataka.police.in');
