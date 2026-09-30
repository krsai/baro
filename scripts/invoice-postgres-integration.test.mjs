import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PrismaClient } from '../backend/node_modules/@prisma/client/default.js';
const require = createRequire(import.meta.url);
const { saveInvoiceDraft } = require('../backend/dist/services/invoiceDraftStore.js');
const { issueInvoiceDraft, recordInvoicePayment, createInvoiceRevisionDraft, cancelIssuedInvoice, replaceInvoicePaymentAllocations, voidInvoicePayment } = require('../backend/dist/services/invoiceIssueStore.js');
const { approveInvoiceFinalLock, unlockInvoiceFinalLocksForInvoice } = require('../backend/dist/services/invoiceFinalLock.js');
const { invoiceFinalReview } = require('../backend/dist/services/invoiceFinalReview.js');
const { invoiceSettlement } = require('../backend/dist/services/invoiceSettlement.js');
const { buildInvoiceSource } = require('../backend/dist/services/invoiceSource.js');

const base = process.env.INVOICE_TEST_DATABASE_URL;
if (!base) throw new Error('INVOICE_TEST_DATABASE_URL is required (dedicated local PostgreSQL only)');
const url = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Refusing non-local database host');
const databaseName = `invoice_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(url); adminUrl.pathname = '/postgres'; adminUrl.search = '';
url.pathname = `/${databaseName}`; url.search = '';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const backend = path.resolve('backend');
const cli = path.join(backend, 'node_modules/prisma/build/index.js');
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
const key = () => randomUUID();
let count = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${++count}: ${name}`); };
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], { cwd: backend, env, stdio: 'pipe' });
  const migration = readFileSync('backend/migration_fix.sql', 'utf8');
  const invoiceSql = migration.slice(migration.indexOf('-- 2026-09-22: immutable issued-invoice ledger foundation.'), migration.indexOf('-- Factory-owned rows must not point across organization boundaries.'));
  const migrate = () => execFileSync(process.execPath, [cli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], { cwd: backend, env, input: invoiceSql, stdio: ['pipe', 'pipe', 'pipe'] });
  migrate(); migrate();
  const seller = await db.organization.create({ data: { name: 'Invoice test seller', type: 'MANUFACTURER' } });
  const buyer = await db.organization.create({ data: { name: 'Invoice test buyer', type: 'BRAND' } });
  const scope = { manufacturerOrgId: seller.id, brandOrgId: buyer.id };
  const bucketSet = await db.quantityBucketSet.create({ data: { orgId: seller.id, name: 'Invoice test' } });
  const version = await db.quantityBucketSetVersion.create({ data: { orgId: seller.id, quantityBucketSetId: bucketSet.id, versionNumber: 1 } });
  const entry = await db.quantityBucketEntry.create({ data: { orgId: seller.id, quantityBucketSetVersionId: version.id, bucketQuantity: 1 } });
  const relationship = await db.orgRelationship.create({ data: { ...scope, salesBucketSetVersionId: version.id } });
  const currency = await db.currency.create({ data: { code: 'USD', name: 'USD' } });
  const style = await db.style.create({ data: { orgId: buyer.id, code: 'TEST', name: '검증 Áo sơ mi' } });
  const priceList = await db.customerSalesPriceList.create({ data: { ...scope, orgRelationshipId: relationship.id, styleId: style.id,
    currencyId: currency.id, quantityBucketSetVersionId: version.id, pricingBasis: 'MANUFACTURING_SERVICE_PRICE' } });
  await db.customerSalesPrice.create({ data: { salesPriceListId: priceList.id, quantityBucketEntryId: entry.id, quantityBucketSetVersionId: version.id, unitPrice: '100' } });
  const order = async () => db.workOrder.create({ data: { orgId: seller.id, sellerOrgId: seller.id, buyerOrgId: buyer.id,
    orderId: key(), orderNumber: key(), totalQuantity: 100, workOrderItems: { create: [
      { styleId: style.id, gender: 'M', totalQuantity: 50, sizeQuantities: { S: 50 } },
      { styleId: style.id, gender: 'W', totalQuantity: 50, sizeQuantities: { L: 50 } },
    ] } } });
  const draft = async (orders, percentage = '100', changes = {}) => {
    const rows = await db.workOrder.findMany({ where: { id: { in: orders.map(row => row.id) } }, include: { workOrderItems: { include: { style: true, color: true } } } });
    return saveInvoiceDraft(db, seller.id, 'test', { clientKey: key(), buyerOrgId: buyer.id,
      orders: rows.map(row => ({ orderId: row.orderId, sourceUpdatedAt: row.updatedAt.toISOString() })),
      basis: 'MANUFACTURING_SERVICE_PRICE', currency: 'USD', percentages: Object.fromEntries(rows.map(row => [row.orderId, percentage])),
      fields: { number: key(), date: '2026-09-28', seller: { name: '판매자 Seller', address: 'Hồ Chí Minh' }, buyer: { name: 'Buyer' }, bank: 'TEST BANK', notes: '검증 ghi chú' },
      lines: rows.flatMap(row => buildInvoiceSource(row, [], [], null).lines.map(line => ({ ...line,
        key: JSON.stringify([row.orderId, line.key]), quantity: String(line.orderedQuantity) }))), ...changes });
  };
  const issue = draft => issueInvoiceDraft(db, seller.id, 'test', draft.id, draft.revision);
  const pay = (invoice, amount, clientKey = key()) => recordInvoicePayment(db, seller.id, 'test', invoice.id,
    { clientKey, amount, receivedAt: '2026-09-28T00:00:00Z', reference: '', note: '' });
  const refund = (invoice, amount, clientKey = key()) => recordInvoicePayment(db, seller.id, 'test', invoice.id,
    { clientKey, amount, kind: 'REFUND', receivedAt: '2026-09-29T00:00:00Z', reference: 'refund', note: '' });
  const context = async sourceOrderId => invoiceSettlement(await db.invoiceOrder.findMany({ where: { sourceOrderId },
    include: { invoice: { include: { orders: true, payments: { include: { allocations: true } } } } } }));
  const approval = async invoice => {
    const review = await invoiceFinalReview(db, seller.id, invoice.id);
    return { clientKey: key(), reviewRevision: review.revision, orders: review.orders.map(row => ({ sourceOrderId: row.sourceOrderId,
      recognizedQuantity: row.lines.reduce((sum, line) => sum + line.orderedQuantity, 0), reason: 'final checked',
      lines: row.lines.map(line => ({ key: line.key, recognizedQuantity: line.orderedQuantity, reason: 'reviewed each item' })) })) };
  };
  const o = await order(); let first, revised, second;
  await check('concurrent issue is atomic and retry returns exactly one invoice', async () => {
    const d = await draft([o], '50');
    const results = await Promise.allSettled([issue(d), issue(d)]);
    assert.ok(results.some(row => row.status === 'fulfilled'));
    first = await issue(d);
    assert.equal(await db.invoice.count({ where: { clientKey: `${d.id}:${d.revision}` } }), 1);
    assert.equal(String(first.receivableAdded), '5000');
  });
  await check('concurrent payment retry creates one receipt', async () => {
    const k = key(); await Promise.allSettled([pay(first, '3000', k), pay(first, '3000', k)]);
    await pay(first, '3000', k);
    assert.equal(await db.invoicePayment.count({ where: { invoiceId: first.id } }), 1);
  });
  await check('revision replaces the same debt without deducting its original receipt again', async () => {
    const d = await createInvoiceRevisionDraft(db, seller.id, 'test', first.id, { clientKey: key(), reason: 'address correction' });
    const results = await Promise.allSettled([issue(d), issue(d)]);
    assert.ok(results.some(row => row.status === 'fulfilled')); revised = await issue(d);
    assert.equal(String(revised.receivableAdded), '5000');
    assert.equal((await db.invoice.findUnique({ where: { id: first.id } })).status, 'SUPERSEDED');
    assert.equal((await context(o.orderId)).priorReceivedAmount, '3000.0000');
    assert.equal((await context(o.orderId)).priorBilledAmount, '5000.0000');
  });
  await check('subsequent installment adds only 5000 and earlier cancellation/revision is rejected', async () => {
    second = await issue(await draft([o]));
    assert.equal(String(second.total), '7000'); assert.equal(String(second.receivableAdded), '5000');
    assert.equal((await context(o.orderId)).priorBilledAmount, '10000.0000');
    await assert.rejects(cancelIssuedInvoice(db, seller.id, 'test', revised.id, 'wrong order'), /REVERSE_ORDER/);
    const d = await createInvoiceRevisionDraft(db, seller.id, 'test', revised.id, { clientKey: key(), reason: 'stale correction' });
    await assert.rejects(issue(d), /REVERSE_ORDER/);
  });
  await check('reverse cancellation preserves receipts as credit and never revives superseded debt', async () => {
    await cancelIssuedInvoice(db, seller.id, 'test', second.id, 'cancel later');
    await cancelIssuedInvoice(db, seller.id, 'test', revised.id, 'cancel installment');
    assert.equal((await context(o.orderId)).priorBilledAmount, '0.0000');
    assert.equal((await context(o.orderId)).priorReceivedAmount, '3000.0000');
    assert.equal((await db.invoice.findUnique({ where: { id: first.id } })).status, 'SUPERSEDED');
  });
  await check('unpaid previous debt is not subtracted twice and repeated SQL preserves zero new debt', async () => {
    const u = await order(); await issue(await draft([u], '50'));
    const full = await issue(await draft([u])); assert.equal(String(full.receivableAdded), '5000');
    const zero = await issue(await draft([u])); assert.equal(String(zero.receivableAdded), '0');
    migrate(); migrate(); assert.equal(String((await db.invoice.findUnique({ where: { id: zero.id } })).receivableAdded), '0');
  });
  await check('multi-order explicit allocations preserve partially unallocated warnings', async () => {
    const a = await order(), b = await order(); const i = await issue(await draft([a, b])); const p = await pay(i, '3000');
    await replaceInvoicePaymentAllocations(db, seller.id, 'test', p.id, { clientKey: key(), allocations: [
      { invoiceOrderId: (await db.invoiceOrder.findFirst({ where: { invoiceId: i.id, sourceOrderId: a.orderId } })).id, amount: '2000' },
    ] });
    assert.equal((await context(a.orderId)).priorReceivedAmount, '2000.0000');
    assert.equal((await context(b.orderId)).priorReceivedAmount, '0.0000');
    assert.equal((await context(a.orderId)).hasUnallocatedPayments, true);
    await replaceInvoicePaymentAllocations(db, seller.id, 'test', p.id, { clientKey: key(), reason: 'correct allocation', allocations: [
      { invoiceOrderId: (await db.invoiceOrder.findFirst({ where: { invoiceId: i.id, sourceOrderId: b.orderId } })).id, amount: '3000' },
    ] });
    assert.equal((await context(a.orderId)).priorReceivedAmount, '0.0000');
    assert.equal((await context(b.orderId)).priorReceivedAmount, '3000.0000');
    await voidInvoicePayment(db, seller.id, 'test', p.id, 'returned transfer');
    assert.equal((await context(b.orderId)).priorReceivedAmount, '0.0000');
  });
  await check('refund ledger reduces receipts, rejects over-refunds and void restores the balance', async () => {
    const source = await order(), invoice = await issue(await draft([source]));
    const receipt = await pay(invoice, '3000');
    const returned = await refund(invoice, '1000');
    assert.equal(returned.kind, 'REFUND');
    await assert.rejects(voidInvoicePayment(db, seller.id, 'test', receipt.id, 'invalid correction'), /BALANCE_CONFLICT/);
    assert.equal((await db.invoicePayment.findUnique({where:{id:receipt.id}})).voidedAt, null);
    assert.equal((await context(source.orderId)).priorReceivedAmount, '2000.0000');
    await assert.rejects(refund(invoice, '2001'), /INVOICE_REFUND_EXCEEDS_RECEIPTS/);
    await voidInvoicePayment(db, seller.id, 'test', returned.id, 'refund cancelled');
    assert.equal((await context(source.orderId)).priorReceivedAmount, '3000.0000');
  });
  await check('same-order -2/+2 item differences never cancel each other and missing reasons fail', async () => {
    const p = await order(), d = await draft([p]);
    const body = structuredClone(d.content); body.lines[0].quantity = '48'; body.lines[1].quantity = '52';
    body.lines.forEach(line => line.adjustmentReason = 'count adjustment');
    const saved = await saveInvoiceDraft(db, seller.id, 'test', { ...body, clientKey: d.clientKey, revision: d.revision }, d.id);
    const i = await issue(saved), review = await invoiceFinalReview(db, seller.id, i.id);
    assert.deepEqual(review.orders[0].lines.map(line => line.difference).sort((a,b) => a-b), [-2, 2]);
    const bodyApproval = await approval(i); bodyApproval.orders[0].lines.forEach(line => line.reason = '');
    await assert.rejects(approveInvoiceFinalLock(db, seller.id, 'test', i.id, bodyApproval), /LINE_REASON_REQUIRED/);
    assert.equal(await db.invoiceFinalLockEvent.count({ where: { invoiceId: i.id } }), 0);
    const stale = await approval(i); stale.reviewRevision = 'stale-review';
    await assert.rejects(approveInvoiceFinalLock(db, seller.id, 'test', i.id, stale), /REVIEW_CHANGED/);
    const good = await approval(i); const results = await Promise.allSettled([
      approveInvoiceFinalLock(db, seller.id, 'test', i.id, good), approveInvoiceFinalLock(db, seller.id, 'test', i.id, good),
    ]);
    assert.ok(results.some(row => row.status === 'fulfilled'));
    await approveInvoiceFinalLock(db, seller.id, 'test', i.id, good);
    assert.equal(await db.invoiceFinalLockEvent.count({ where: { invoiceId: i.id } }), 1);
    await assert.rejects(db.workOrderItem.updateMany({ where: { workOrderId: p.id }, data: { totalQuantity: 1 } }), /INVOICE_FINAL_LOCKED/);
    await assert.rejects(cancelIssuedInvoice(db, seller.id, 'test', i.id, 'locked'), /UNLOCK_REQUIRED/);
    const unlock = { clientKey: key(), reason: 'correction' };
    await Promise.allSettled([unlockInvoiceFinalLocksForInvoice(db, seller.id, 'test', i.id, unlock), unlockInvoiceFinalLocksForInvoice(db, seller.id, 'test', i.id, unlock)]);
    await unlockInvoiceFinalLocksForInvoice(db, seller.id, 'test', i.id, unlock);
    assert.equal(await db.invoiceFinalLockEvent.count({ where: { invoiceId: i.id } }), 2);
  });
  await check('mid-issue failure rolls back invoice, order lines and sequence allocation', async () => {
    const d = await draft([await order()]); const before = await db.invoice.count();
    const failing = { $transaction: (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(target, property) {
      if (property === 'invoiceLine') return { createMany: async () => { throw new Error('TEST_INJECTED_FAILURE'); } };
      return Reflect.get(target, property);
    } })), options) };
    await assert.rejects(issueInvoiceDraft(failing, seller.id, 'test', d.id, d.revision), /TEST_INJECTED_FAILURE/);
    assert.equal(await db.invoice.count(), before);
    assert.equal(await db.invoiceOrder.count({ where: { sourceOrderId: d.content.orders[0].orderId } }), 0);
    await issue(d);
  });
  await check('different-order sequence races retry and commit both invoices with distinct sequence numbers', async () => {
    const left = await draft([await order()]), right = await draft([await order()]);
    const results = await Promise.all([issue(left), issue(right)]);
    assert.equal(new Set(results.map(row => row.sequenceNumber)).size, 2);
    assert.equal(await db.invoice.count({ where: { id: { in: results.map(row => row.id) } } }), 2);
  });
  await check('revision issuance racing source cancellation leaves one coherent terminal state', async () => {
    const source = await issue(await draft([await order()]));
    const revisionDraft = await createInvoiceRevisionDraft(db, seller.id, 'test', source.id, { clientKey: key(), reason: 'race correction' });
    await Promise.allSettled([issue(revisionDraft), cancelIssuedInvoice(db, seller.id, 'test', source.id, 'race cancellation')]);
    const original = await db.invoice.findUnique({ where: { id: source.id }, include: { revision: true } });
    assert.ok(original.status === 'CANCELLED' || (original.status === 'SUPERSEDED' && original.revision?.status === 'ISSUED'));
    assert.ok(!(original.status === 'CANCELLED' && original.revision));
  });
  await check('order update racing issuance is serializable and snapshot source revision stays truthful', async () => {
    const source = await order(), d = await draft([source]);
    await Promise.allSettled([issue(d), db.workOrder.update({ where: { id: source.id }, data: { dueDate: '2026-12-31' } })]);
    const invoice = await db.invoice.findFirst({ where: { clientKey: `${d.id}:${d.revision}` }, include: { orders: true } });
    const current = await db.workOrder.findUnique({ where: { id: source.id } });
    if (invoice) assert.ok(invoice.orders[0].sourceUpdatedAt.getTime() <= current.updatedAt.getTime());
    else assert.equal(current.dueDate, '2026-12-31');
  });
  await check('final lock racing assignment mutation leaves the plan protected after lock commit', async () => {
    const source = await order(), invoice = await issue(await draft([source]));
    const factory = await db.factory.create({ data: { orgId: seller.id, name: `Factory ${key()}` } });
    const plan = await db.assignmentPlan.create({ data: { orgId: seller.id, factoryId: factory.id, externalId: key(),
      workOrderId: source.id, styleId: style.id, assignmentQuantity: 100, startIndex: 0, endIndex: 1 } });
    const body = await approval(invoice);
    await Promise.allSettled([
      approveInvoiceFinalLock(db, seller.id, 'test', invoice.id, body),
      db.assignmentPlan.update({ where: { id: plan.id }, data: { assignmentQuantity: 99 } }),
    ]);
    await approveInvoiceFinalLock(db, seller.id, 'test', invoice.id, body);
    await assert.rejects(db.assignmentPlan.update({ where: { id: plan.id }, data: { assignmentQuantity: 98 } }), /INVOICE_FINAL_LOCKED/);
  });
  console.log(`PostgreSQL integration: ${count} scenarios passed (real Prisma transactions, isolated database).`);
} finally {
  await db.$disconnect();
  // Only this random, local test database is disposable. Never accept a supplied name.
  if (!/^invoice_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Unsafe cleanup target');
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.$disconnect();
}
