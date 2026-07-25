'use strict';

/**
 * rbacAudit.test.js — Unit test for Automated Compliance Scanner
 * Run with: node --test tests/rbacAudit.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { runComplianceScan } = require('../functions/pi_app_function/lib/rbacAudit');

test('Compliance Scanner - Zero Policy Violations', () => {
  const audit = runComplianceScan();

  assert.strictEqual(audit.compliant, true, 'System RBAC matrix must be fully compliant');
  assert.strictEqual(audit.violations.length, 0, 'There should be 0 route policy violations');
  assert.ok(audit.manifest.length > 0, 'Route manifest must not be empty');
  assert.ok(audit.scanned_at, 'Audit timestamp must be present');
});
