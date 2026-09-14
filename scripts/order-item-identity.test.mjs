import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { planOrderItemWrites } = require('../backend/dist/utils/orderItemIdentity.js');

test('quantity, attributes and sort changes retain IDs; only removed rows are deleted', () => {
  const plan = planOrderItemWrites([{ id: 1, itemId: 'a' }, { id: 2, itemId: 'b' }],
    [{ itemId: 'b', quantity: 40, styleId: 9 }, { itemId: 'new', quantity: 10 }]);
  assert.deepEqual(plan.deleteIds, [1]);
  assert.deepEqual(plan.writes.map(row => row.id), [2, null]);
  assert.equal(plan.writes[0].data.quantity, 40);
});

test('legacy fallback IDs survive and foreign IDs never match a different order', () => {
  assert.equal(planOrderItemWrites([{ id: 12, itemId: '' }], [{ itemId: '12' }]).writes[0].id, 12);
  assert.equal(planOrderItemWrites([{ id: 12, itemId: 'a' }], [{ itemId: 'foreign' }]).writes[0].id, null);
  assert.deepEqual(planOrderItemWrites([], [{ itemId: '' }, { itemId: '' }]).writes.map(row => row.id), [null, null]);
});

test('ambiguous legacy rows and duplicate submitted identifiers fail closed', () => {
  assert.throws(() => planOrderItemWrites([{ id: 1, itemId: 'a' }, { id: 2, itemId: 'a' }], []), /ORDER_ITEM_ID_CONFLICT/);
  assert.throws(() => planOrderItemWrites([], [{ itemId: 'a' }, { itemId: 'a' }]), /ORDER_ITEM_ID_CONFLICT/);
  assert.throws(() => planOrderItemWrites([{ id: 1, itemId: '' }, { id: 2, itemId: '1' }], []), /ORDER_ITEM_ID_CONFLICT/);
});

test('Postgres reference remains attached after repeated saves; FK failure rolls back entire edit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE item(id SERIAL PRIMARY KEY, "itemId" TEXT NOT NULL, quantity INT);
      CREATE TABLE reference(item_id INT REFERENCES item(id) ON DELETE RESTRICT);
      INSERT INTO item("itemId",quantity) VALUES ('a',100),('b',50);
      INSERT INTO reference VALUES (1);`);
    const save = async incoming => db.transaction(async tx => {
      const stored = (await tx.query('SELECT id,"itemId" FROM item')).rows;
      const plan = planOrderItemWrites(stored, incoming);
      for (const id of plan.deleteIds) await tx.query('DELETE FROM item WHERE id=$1', [id]);
      for (const row of plan.writes) {
        if (row.id !== null) await tx.query('UPDATE item SET quantity=$1 WHERE id=$2', [row.data.quantity, row.id]);
        else await tx.query('INSERT INTO item("itemId",quantity) VALUES ($1,$2)', [row.data.itemId,row.data.quantity]);
      }
    });
    for (let i=0;i<2;i++) await save([{ itemId:'a',quantity:150 },{ itemId:'b',quantity:60 }]);
    assert.deepEqual((await db.query('SELECT item.id,quantity FROM item JOIN reference ON item.id=reference.item_id')).rows, [{ id:1,quantity:150 }]);
    await assert.rejects(save([{ itemId:'b',quantity:999 }]));
    assert.deepEqual((await db.query('SELECT id,quantity FROM item ORDER BY id')).rows, [{ id:1,quantity:150 },{ id:2,quantity:60 }]);
  } finally { await db.close(); }
});

test('order update route uses scoped item diff inside the order transaction', () => {
  const source=readFileSync(new URL('../backend/src/index.ts',import.meta.url),'utf8');
  const route=source.split('app.put("/orders/:orderId"')[1].split('const requireInvoiceAccess')[0];
  assert.match(route,/planOrderItemWrites\(storedItems/);
  assert.match(route,/where: \{ workOrderId: existing.id, id: \{ in: itemWrites.deleteIds \} \}/);
  assert.doesNotMatch(route,/deleteMany\(\{ where: \{ workOrderId: existing.id \} \}\)/);
  assert.ok(route.indexOf('prisma.$transaction') < route.indexOf('planOrderItemWrites'));
});
