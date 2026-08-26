import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateSalaryFormula, validateSalaryFormula } from '../backend/dist/employees/salaryFormula.js';

test('validates and evaluates the restricted salary formula language', () => {
  const formula = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
  assert.equal(validateSalaryFormula(formula, 'BASE'), true);
  assert.equal(evaluateSalaryFormula(formula, { GRADE_RATE: 2_600_000, ACTUAL_WORKDAYS: 13, SCHEDULED_WORKDAYS: 26 }), 1_300_000);
  assert.equal(validateSalaryFormula(['ACTUAL_WORKDAYS'], 'ALLOWANCE'), false);
  assert.equal(validateSalaryFormula(['PRODUCTION_ALLOWANCE'], 'INCENTIVE'), true);
  assert.throws(() => evaluateSalaryFormula(['CONST:1', '÷', 'CONST:0'], {}), /division by zero/);
});

test('startup drift detection repairs the nullable salary version boundary column', async () => {
  const [server, migration] = await Promise.all([
    readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(server, /STARTUP_REQUIRED_NULLABLE_RUNTIME_COLUMNS[\s\S]*SalarySystemVersion[\s\S]*effectiveMonth/);
  assert.match(server, /information_schema\.columns[\s\S]*is_nullable/);
  assert.match(server, /findNonNullableRuntimeSchemaColumns\(\)/);
  assert.match(migration, /ALTER TABLE "SalarySystemVersion" ALTER COLUMN "effectiveMonth" DROP NOT NULL/);
});
