import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSalaryFormula, validateSalaryFormula } from '../backend/dist/employees/salaryFormula.js';

test('validates and evaluates the restricted salary formula language', () => {
  const formula = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
  assert.equal(validateSalaryFormula(formula, 'BASE'), true);
  assert.equal(evaluateSalaryFormula(formula, { GRADE_RATE: 2_600_000, ACTUAL_WORKDAYS: 13, SCHEDULED_WORKDAYS: 26 }), 1_300_000);
  assert.equal(validateSalaryFormula(['ACTUAL_WORKDAYS'], 'ALLOWANCE'), false);
  assert.equal(validateSalaryFormula(['PRODUCTION_ALLOWANCE'], 'INCENTIVE'), true);
  assert.throws(() => evaluateSalaryFormula(['CONST:1', '÷', 'CONST:0'], {}), /division by zero/);
});
