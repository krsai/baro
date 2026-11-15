import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEntityPhone, phoneForCountry } from '../frontend/src/utils/entityPhone.mjs';

test('international phone edits preserve subscriber digits and avoid duplicate prefixes', () => {
  assert.deepEqual(splitEntityPhone('+84 08555 00100', 'VN'), { prefix: '+84', local: '08555 00100' });
  assert.deepEqual(splitEntityPhone('+821012345678', 'KR'), { prefix: '+82', local: '1012345678' });
  assert.equal(phoneForCountry('+84 08555 00100', 'VN', 'KR'), '+82 08555 00100');
  assert.equal(phoneForCountry('08555 00100', 'VN', 'KR'), '+82 08555 00100');
  assert.equal(phoneForCountry('', 'VN', 'KR'), '');
  assert.deepEqual(splitEntityPhone('+82 12345', 'VN'), { prefix: '+82', local: '12345' });
});
