import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const code = ts.transpileModule(readFileSync('backend/src/services/applicationSettings.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
new Function('require', 'exports', code)(name => name === '@prisma/client' ? require('../backend/node_modules/@prisma/client')
  : { createHttpError: (status, message) => Object.assign(new Error(message), { status }) }, api);
const fixture = () => {
  const records = new Map();
  const db = { systemSetting: {
    findUnique: async ({ where }) => records.get(where.key) || null,
    upsert: async ({ where, create, update }) => records.set(where.key, records.has(where.key) ? { ...records.get(where.key), ...update } : create),
  } };
  return { db, records };
};
test('lateness defaults to 30 and inherits SYSTEM, company override and reset', async () => {
  const { db } = fixture();
  assert.equal((await api.loadAppSettings(db, 1)).latenessGraceMinutes, 30);
  await api.saveAppSettings(db, undefined, { latenessGraceMinutes: 15 }, 1);
  assert.equal((await api.loadAppSettings(db, 1)).latenessGraceMinutes, 15);
  await api.saveAppSettings(db, 1, { latenessGraceMinutes: 0 }, 2);
  assert.equal((await api.loadAppSettings(db, 1)).latenessGraceMinutes, 0);
  assert.equal((await api.loadAppSettings(db, 2)).latenessGraceMinutes, 15);
  assert.equal((await api.saveAppSettings(db, 1, { reset: true }, 2)).latenessGraceMinutes, 15);
});
test('VAT-only clients preserve attendance settings, invalid updates do not persist', async () => {
  const { db, records } = fixture();
  await api.saveAppSettings(db, 1, { defaultVatRate: '10', latenessGraceMinutes: 30 }, 2);
  await api.saveAppSettings(db, 1, { defaultVatRate: '8' }, 2);
  assert.equal((await api.loadAppSettings(db, 1)).latenessGraceMinutes, 30);
  const before = JSON.stringify(records.get('APP_SETTINGS:1'));
  for (const value of [-1, 1441, 1.5, '', null, 'abc']) {
    await assert.rejects(api.saveAppSettings(db, 1, { defaultVatRate: '5', latenessGraceMinutes: value }, 2), /INVALID_LATENESS_GRACE/);
    assert.equal(JSON.stringify(records.get('APP_SETTINGS:1')), before);
  }
});
