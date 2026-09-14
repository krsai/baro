import test from 'node:test';
import assert from 'node:assert/strict';
import employeeNumber from '../backend/dist/employees/employeeNumber.js';

const { normalizeEmployeeNo, resolveNextEmployeeNo } = employeeNumber;

test('removes factory prefixes and pads employee numbers to four digits', () => {
  assert.equal(normalizeEmployeeNo('HN-1'), '0001');
  assert.equal(normalizeEmployeeNo('HN-0001'), '0001');
  assert.equal(normalizeEmployeeNo('1'), '0001');
  assert.equal(normalizeEmployeeNo('0012'), '0012');
});

test('preserves non-numeric custom employee numbers', () => {
  assert.equal(normalizeEmployeeNo('OFFICE-A'), 'OFFICE-A');
  assert.equal(normalizeEmployeeNo('OFFICE-12'), 'OFFICE-12');
  assert.equal(normalizeEmployeeNo('employee-abc'), 'employee-abc');
  assert.equal(normalizeEmployeeNo(''), null);
});

test('generates the next sequence across all factories in an organization', () => {
  assert.equal(
    resolveNextEmployeeNo(['HN-0001', 'TB-0007', '0010', null]),
    '0011'
  );
});

test('allows organization sequences to grow beyond four digits', () => {
  assert.equal(resolveNextEmployeeNo(['9999']), '10000');
});

test('prefixes generated numbers with the organization code when set', () => {
  assert.equal(resolveNextEmployeeNo(['0001', '0024'], 'BRVN'), 'BRVN0025');
});

test('finds the max sequence across pre- and post-migration formats', () => {
  assert.equal(resolveNextEmployeeNo(['0001', '0024', 'BRVN0025'], 'BRVN'), 'BRVN0026');
});

test('ignores blank/whitespace organization codes and falls back to plain numbers', () => {
  assert.equal(resolveNextEmployeeNo(['0010'], '   '), '0011');
  assert.equal(resolveNextEmployeeNo(['0010'], null), '0011');
});
