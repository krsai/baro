import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import settings from '../backend/dist/services/applicationSettings.js';
import routes from '../backend/dist/services/transactionSettingRoutes.js';

test('VAT follows system defaults, preserves overrides and unrelated settings, and resets', async () => {
  const rows = new Map();
  const db = { systemSetting: {
    findUnique: async ({ where }) => rows.get(where.key),
    upsert: async ({ where, create, update }) => rows.set(where.key, rows.has(where.key) ? update : create),
  } };
  assert.equal((await settings.loadAppSettings(db, 1)).defaultVatRate, '10');
  await settings.saveAppSettings(db, undefined, { defaultVatRate: '8' }, 20);
  assert.equal((await settings.loadAppSettings(db, 1)).defaultVatRate, '8');
  rows.set(settings.appSettingsKey(1), { value: { unrelated: true } });
  await settings.saveAppSettings(db, 1, { defaultVatRate: '0' }, 20);
  await settings.saveAppSettings(db, undefined, { defaultVatRate: '9' }, 20);
  assert.equal((await settings.loadAppSettings(db, 1)).defaultVatRate, '0');
  assert.equal(rows.get(settings.appSettingsKey(1)).value.unrelated, true);
  await settings.saveAppSettings(db, 1, { reset: true }, 20);
  assert.equal((await settings.loadAppSettings(db, 1)).defaultVatRate, '9');
  assert.equal((await settings.loadAppSettings(db, 1)).isOverridden, false);
  for (const rate of ['101', '-1', '1e1', null, {}, '0.001']) {
    await assert.rejects(settings.saveAppSettings(db, 1, { defaultVatRate: rate }, 20));
  }
});

test('settings endpoints enforce system versus organization permissions before DB access', async () => {
  const handlers = new Map();
  const app = Object.fromEntries(['get', 'post', 'put'].map(method => [method, (path, fn) => handlers.set(`${method} ${path}`, fn)]));
  const calls = [];
  routes.registerTransactionSettingRoutes(app, {}, {
    requireSystemAdmin: async () => { calls.push('system'); return null; },
    requireOrgRole: async (_req, _res, options) => { calls.push(options.allowedRoles); return null; },
  });
  for (const path of ['/system-app-settings', '/system-setting-defaults/services', '/system-setting-defaults/codes']) {
    await handlers.get(`put ${path}${path.includes('defaults') ? '/:id' : ''}`)({ query: {} }, {});
    assert.equal(calls.pop(), 'system');
  }
  for (const path of ['/app-settings', '/outsourcing-service-types/:id', '/transaction-codes/:id']) {
    await handlers.get(`put ${path}`)({ query: {} }, {});
    assert.deepEqual(calls.pop(), ['ADMIN']);
  }
  await handlers.get('get /system-setting-defaults/codes')({ query: { catalogue: '1' } }, {});
  assert.deepEqual(calls.pop(), ['ADMIN']);
});

test('adoption refuses foreign tenant rows and incompatible source relationships', async () => {
  const db = {
    $queryRaw: async () => [],
    settingServiceDefault: { findUnique: async () => ({ id: 1, entryMode: 'PROCESS' }) },
    settingTransactionCodeDefault: { findUnique: async () => ({ id: 2, serviceTypeId: 1 }) },
    outsourcingServiceType: { findFirst: async ({ where }) => where.ownerOrgId === 1 ? null : assert.fail('missing tenant scope') },
    transactionCode: { findFirst: async () => ({ id: 3, systemDefaultId: 99 }) },
  };
  await assert.rejects(routes.adoptSetting(db, 1, 'services', { localId: 20, systemDefaultId: 1 }), /SETTING_NOT_FOUND/);
  await assert.rejects(routes.adoptSetting(db, 1, 'codes', { localId: 3, systemDefaultId: 2 }), /SETTING_SOURCE_IMMUTABLE/);
  await assert.rejects(routes.adoptSetting(db, 1, 'codes', { systemDefaultId: 2 }), /ADOPT_SERVICE_DEFAULT_FIRST/);
  await assert.rejects(routes.adoptSetting(db, 1, 'services', { systemDefaultId: '1' }), /INVALID_SETTING_REFERENCE/);
});

test('repeatable SQL preserves legacy IDs, propagates only inherited settings and protects source FKs', async () => {
  const db = new PGlite();
  const sql = fs.readFileSync('backend/prisma/migrations/20261011120000_setting_inheritance/migration.sql', 'utf8');
  try {
    await db.exec(`
      CREATE TABLE "OutsourcingServiceType" (id SERIAL PRIMARY KEY, "ownerOrgId" INT NOT NULL,
        code TEXT NOT NULL, "nameKo" TEXT, "nameEn" TEXT, "nameVi" TEXT, "entryMode" TEXT,
        "requiredFields" TEXT[] DEFAULT '{}', "orderInput" TEXT DEFAULT 'OPTIONAL',
        "styleInput" TEXT DEFAULT 'HIDDEN', "processInput" TEXT DEFAULT 'HIDDEN',
        "isActive" BOOLEAN DEFAULT true, "sortOrder" INT DEFAULT 0, "updatedAt" TIMESTAMP DEFAULT now(),
        UNIQUE("ownerOrgId",code), UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "TransactionCode" (id SERIAL PRIMARY KEY, "ownerOrgId" INT NOT NULL,
        "serviceTypeId" INT NOT NULL, code TEXT NOT NULL, "nameKo" TEXT, "nameEn" TEXT, "nameVi" TEXT,
        "vatEnabled" BOOLEAN DEFAULT false, "isActive" BOOLEAN DEFAULT true, UNIQUE("ownerOrgId",code),
        FOREIGN KEY("serviceTypeId","ownerOrgId") REFERENCES "OutsourcingServiceType"(id,"ownerOrgId"));
      INSERT INTO "OutsourcingServiceType" (id,"ownerOrgId",code,"entryMode","nameKo") VALUES (100,1,'LOGISTICS','LOGISTICS','기존 업체 설정');
      INSERT INTO "TransactionCode" (id,"ownerOrgId","serviceTypeId",code,"nameKo") VALUES (100,1,100,'TRKV','기존 코드');
      CREATE TABLE "SavedRequest" (id INT PRIMARY KEY,"codeId" INT REFERENCES "TransactionCode"(id),"savedVat" INT);
      INSERT INTO "SavedRequest" VALUES(1,100,10);
    `);
    await db.exec(sql); await db.exec(sql);
    const legacy = (await db.query('SELECT * FROM "TransactionCode" WHERE id=100')).rows[0];
    assert.equal(legacy.systemDefaultId, null);
    assert.equal(legacy.isOverridden, true);
    const source = (await db.query(`SELECT id FROM "SettingServiceDefault" WHERE code='LOGISTICS'`)).rows[0].id;
    const codeSource = (await db.query(`SELECT id FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`)).rows[0].id;
    await db.query(`UPDATE "OutsourcingServiceType" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`, [source]);
    await db.query(`UPDATE "TransactionCode" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`, [codeSource]);
    await db.exec(`UPDATE "SettingTransactionCodeDefault" SET "nameKo"='시스템 변경',"vatEnabled"=false WHERE code='TRKV'`);
    assert.equal((await db.query('SELECT "nameKo" FROM "TransactionCode" WHERE id=100')).rows[0].nameKo, '시스템 변경');
    await db.exec(`UPDATE "TransactionCode" SET "isOverridden"=true,code='MY_TRKV',"nameKo"='업체 변경' WHERE id=100;
      UPDATE "SettingTransactionCodeDefault" SET "nameKo"='시스템 재변경' WHERE code='TRKV';
      UPDATE "OutsourcingServiceType" SET "isOverridden"=true,"orderInput"='HIDDEN' WHERE id=100;
      UPDATE "SettingServiceDefault" SET "orderInput"='REQUIRED' WHERE code='LOGISTICS';`);
    // The legacy startup seeds must not recreate a renamed tenant code.
    const legacySql = fs.readFileSync('backend/prisma/migrations/20261011090000_transaction_request_codes/migration.sql', 'utf8');
    await db.exec(legacySql.slice(legacySql.indexOf('INSERT INTO "TransactionCode"'), legacySql.indexOf('ALTER TABLE "PartnerTransactionCost"')));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "TransactionCode"')).rows[0].n, 1);
    assert.equal((await db.query('SELECT code,"nameKo" FROM "TransactionCode" WHERE id=100')).rows[0].nameKo, '업체 변경');
    assert.equal((await db.query('SELECT "orderInput" FROM "OutsourcingServiceType" WHERE id=100')).rows[0].orderInput, 'HIDDEN');
    await db.exec('UPDATE "TransactionCode" SET "isOverridden"=false WHERE id=100; UPDATE "OutsourcingServiceType" SET "isOverridden"=false WHERE id=100');
    assert.equal((await db.query('SELECT code FROM "TransactionCode" WHERE id=100')).rows[0].code, 'TRKV');
    assert.equal((await db.query('SELECT "orderInput" FROM "OutsourcingServiceType" WHERE id=100')).rows[0].orderInput, 'REQUIRED');
    await assert.rejects(db.exec('UPDATE "TransactionCode" SET "systemDefaultId"=NULL WHERE id=100'));
    await assert.rejects(db.exec(`UPDATE "SettingServiceDefault" SET "entryMode"='PROCESS' WHERE code='LOGISTICS'`));
    await assert.rejects(db.exec(`DELETE FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`));
    await assert.rejects(db.query(`INSERT INTO "TransactionCode" ("ownerOrgId","serviceTypeId",code,"systemDefaultId","isOverridden") VALUES(2,100,'X',$1,false)`, [codeSource]));
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM "SavedRequest"')).rows, [{ id: 1, codeId: 100, savedVat: 10 }]);
  } finally { await db.close(); }
});
