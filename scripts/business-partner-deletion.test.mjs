import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/businessPartnerDeletion.js';

test('customer deletion checks every business source and keeps shared organization', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY); INSERT INTO "Organization" VALUES(1),(2);
      CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"manufacturerOrgId" INT REFERENCES "Organization","brandOrgId" INT REFERENCES "Organization");
      INSERT INTO "OrgRelationship" VALUES(7,1,2);`);
    const tx = {
      $queryRawUnsafe: async (sql,...args) => (await db.query(sql,args)).rows,
      orgRelationship: { delete: ({where}) => db.query('DELETE FROM "OrgRelationship" WHERE id=$1',[where.id]) },
    };
    const sources=['Style','WorkOrder','AssignmentCard','AssignmentPlan','Invoice','InvoiceDraft','CustomerSalesPriceList'];
    for(const source of sources) await db.exec('CREATE TABLE "'+source+'"("orgId" INT,"customerOrgId" INT,"sellerOrgId" INT,"buyerOrgId" INT,"orgRelationshipId" INT)');
    assert.deepEqual([...await service.getCustomerUsage(tx,[7])],[]);
    await assert.rejects(service.deleteUnusedCustomer(tx,3,7,true),/CUSTOMER_NOT_FOUND/);
    for(const source of sources){
      await db.exec('INSERT INTO "'+source+'" VALUES(1,2,1,2,7)');
      assert.deepEqual([...await service.getCustomerUsage(tx,[7])],[7]);
      await assert.rejects(service.deleteUnusedCustomer(tx,1,7,true),/PARTNER_HAS_TRANSACTION_HISTORY/);
      assert.equal((await db.query('SELECT * FROM "OrgRelationship"')).rows.length,1);
      await db.exec('DELETE FROM "'+source+'"');
    }
    await service.deleteUnusedCustomer(tx,1,7,true);
    assert.equal((await db.query('SELECT * FROM "OrgRelationship"')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM "Organization"')).rows.length,2);
  } finally { await db.close(); }
});

async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY, "ownerOrgId" INT, type TEXT, name TEXT, UNIQUE(id,"ownerOrgId"));
    INSERT INTO "Organization" VALUES(1,NULL,'MANUFACTURER','Owner'),(10,1,'PROCESS_OUTSOURCING','Old name'),(11,1,'MATERIAL_SUPPLIER','Unused');
    CREATE TABLE "OrganizationOutsourcingServiceType"("partnerOrgId" INT REFERENCES "Organization"(id) ON DELETE CASCADE);
    INSERT INTO "OrganizationOutsourcingServiceType" VALUES(11);
    CREATE TABLE "OrganizationBankAccount"(id INT PRIMARY KEY,"entityId" INT REFERENCES "Organization"(id) ON DELETE RESTRICT,"orgId" INT REFERENCES "Organization"(id));
    INSERT INTO "OrganizationBankAccount" VALUES(1,11,1);
    CREATE TABLE "Work"(id INT PRIMARY KEY,"partnerId" INT REFERENCES "Organization"(id) ON DELETE SET NULL, snapshot TEXT, quantity INT);
    CREATE TABLE "Cost"(id INT PRIMARY KEY,"partnerId" INT,"ownerOrgId" INT, FOREIGN KEY("partnerId","ownerOrgId") REFERENCES "Organization"(id,"ownerOrgId") ON DELETE CASCADE);`);
  const tx = {
    $queryRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).rows,
    organizationOutsourcingServiceType: { deleteMany: async ({ where }) => db.query('DELETE FROM "OrganizationOutsourcingServiceType" WHERE "partnerOrgId"=$1', [where.partnerOrgId]) },
    organizationBankAccount: { deleteMany: async ({ where }) => db.query('DELETE FROM "OrganizationBankAccount" WHERE "entityId"=$1 AND "orgId"=$2', [where.entityId,where.orgId]) },
    organization: { delete: async ({ where }) => db.query('DELETE FROM "Organization" WHERE id=$1', [where.id]) },
  };
  return { db, tx };
}

test('unused partner with only industry configuration can be deleted', async () => {
  const { db, tx } = await fixture();
  try {
    assert.deepEqual([...await service.getBusinessPartnerUsage(tx, [10, 11])], []);
    await service.deleteUnusedBusinessPartner(tx, 1, 11);
    assert.equal((await db.query('SELECT * FROM "Organization" WHERE id=11')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM "OrganizationOutsourcingServiceType"')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM "OrganizationBankAccount"')).rows.length, 0);
  } finally { await db.close(); }
});

test('zero quantity history and SetNull FK prevent deletion; rename follows FK and preserves audit snapshot', async () => {
  const { db, tx } = await fixture();
  try {
    await db.exec(`INSERT INTO "Work" VALUES(1,10,'Old name',0);`);
    assert.deepEqual([...await service.getBusinessPartnerUsage(tx, [10, 11])], [10]);
    await assert.rejects(service.deleteUnusedBusinessPartner(tx, 1, 10), /PARTNER_HAS_TRANSACTION_HISTORY/);
    await db.exec(`UPDATE "Organization" SET name='New name' WHERE id=10;`);
    const [row] = (await db.query('SELECT org.name, work.snapshot, work.quantity FROM "Work" work JOIN "Organization" org ON org.id=work."partnerId"')).rows;
    assert.deepEqual(row, { name: 'New name', snapshot: 'Old name', quantity: 0 });
  } finally { await db.close(); }
});

test('composite Cascade FK history prevents deletion', async () => {
  const { db, tx } = await fixture();
  try {
    await db.exec('INSERT INTO "Cost" VALUES(1,11,1);');
    await assert.rejects(service.deleteUnusedBusinessPartner(tx, 1, 11), /PARTNER_HAS_TRANSACTION_HISTORY/);
    assert.equal((await db.query('SELECT * FROM "Cost"')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM "OrganizationOutsourcingServiceType"')).rows.length, 1);
  } finally { await db.close(); }
});

test('tenant scope and partner type remain enforced; unused outsourcing partners can be deleted', async () => {
  const { db, tx } = await fixture();
  try {
    await assert.rejects(service.deleteUnusedBusinessPartner(tx, 2, 10), /BUSINESS_PARTNER_NOT_FOUND/);
    await db.exec('UPDATE "Organization" SET "ownerOrgId"=1 WHERE id=1;');
    await assert.rejects(service.deleteUnusedBusinessPartner(tx, 1, 1), /BUSINESS_PARTNER_NOT_FOUND/);
    await service.deleteUnusedBusinessPartner(tx, 1, 10);
    assert.equal((await db.query('SELECT * FROM "Organization" WHERE id=10')).rows.length, 0);
  } finally { await db.close(); }
});
