'use strict';

/**
 * rbac.test.js — Unit tests for RBAC Permission Matrix & Policymaker Lockdown
 * Run with: node --test tests/rbac.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { ROLES, hasPermission } = require('../functions/pi_app_function/lib/rbac');

test('RBAC - Investigator Permissions', () => {
  assert.strictEqual(hasPermission(ROLES.INVESTIGATOR, 'READ_FIR_LIST'), true);
  assert.strictEqual(hasPermission(ROLES.INVESTIGATOR, 'READ_FIR_DETAIL'), true);
  assert.strictEqual(hasPermission(ROLES.INVESTIGATOR, 'READ_ACCUSED'), true);
  assert.strictEqual(hasPermission(ROLES.INVESTIGATOR, 'READ_VICTIM'), true);
  assert.strictEqual(hasPermission(ROLES.INVESTIGATOR, 'READ_AUDIT_LOG'), false);
});

test('RBAC - Analyst Permissions', () => {
  assert.strictEqual(hasPermission(ROLES.ANALYST, 'READ_FIR_LIST'), true);
  assert.strictEqual(hasPermission(ROLES.ANALYST, 'READ_FIR_AGGREGATE'), true);
  assert.strictEqual(hasPermission(ROLES.ANALYST, 'READ_ANALYTICS'), true);
  assert.strictEqual(hasPermission(ROLES.ANALYST, 'READ_SENSITIVE_AGGREGATE'), false);
  assert.strictEqual(hasPermission(ROLES.ANALYST, 'READ_AUDIT_LOG'), false);
});

test('RBAC - Supervisor Permissions', () => {
  assert.strictEqual(hasPermission(ROLES.SUPERVISOR, 'READ_FIR_DETAIL'), true);
  assert.strictEqual(hasPermission(ROLES.SUPERVISOR, 'READ_AUDIT_LOG'), true);
  assert.strictEqual(hasPermission(ROLES.SUPERVISOR, 'READ_AUDIT_REPORT'), true);
  assert.strictEqual(hasPermission(ROLES.SUPERVISOR, 'TRIGGER_EARLY_WARNING'), true);
});

test('RBAC - Policymaker Lockdown (Strict Aggregate-Only & Zero PII)', () => {
  // Must have aggregate access
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_FIR_AGGREGATE'), true);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_AGGREGATE_STATS'), true);

  // MUST NOT have any row-level / individual PII access
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_FIR_DETAIL'), false);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_ACCUSED'), false);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_VICTIM'), false);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_OFFICER'), false);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_RISK_SCORE'), false);
  assert.strictEqual(hasPermission(ROLES.POLICYMAKER, 'READ_AUDIT_LOG'), false);
});
