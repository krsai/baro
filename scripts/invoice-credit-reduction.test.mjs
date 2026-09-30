import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildInvoiceCreditPrintHtml } from '../frontend/src/utils/invoiceCreditPrint.mjs';
import { formatQuantityReview } from '../frontend/src/utils/orderQuantityReview.mjs';
const require = createRequire(import.meta.url);
const { recordOrderQuantityReduction } = require('../backend/dist/services/orderQuantityChange.js');
const { invoiceSettlement, invoiceFamilyBalance } = require('../backend/dist/services/invoiceSettlement.js');

test('credits affect debt once without rewriting payments, and void restores debt', () => {
  const invoice = { id: 'i', status: 'ISSUED', receivableAdded: '100', credits: [{ invoiceOrderId: 1, amount: '20' }],
    orders: [{ id: 1 }], payments: [{ amount: '90', allocations: [] }] };
  assert.equal(invoiceFamilyBalance([invoice], 'i').balanceKind, 'CREDIT');
  assert.equal(invoiceFamilyBalance([invoice], 'i').balanceAmount, '10.0000');
  assert.equal(invoiceSettlement([{ id: 1, receivableAdded: '100', invoice }]).priorBilledAmount, '80.0000');
  invoice.credits[0].voidedAt = new Date();
  assert.equal(invoiceFamilyBalance([invoice], 'i').debtAmount, '100.0000');
});
test('credit output preserves escaping and explicitly distinguishes cash refunds', () => {
  const html = buildInvoiceCreditPrintHtml({ id: '<script>', createdAt: '2026-09-30', createdBy: '담당자', snapshot: {
    version: 1, amount: '20', reason: '<script>alert(1)</script>', currencyCode: 'USD', sourceOrderNumber: 'Áo', invoiceNumber: 'INV',
  } });
  assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/); assert.match(html, /not cash refund/);
});
test('every item reduction requires a reason even when style totals cancel out', async () => {
  let written = null;
  const db = { workOrderItem: { findMany: async () => [{ itemId: 'a', styleId: 1, totalQuantity: 10 }, { itemId: 'b', styleId: 1, totalQuantity: 10 }] },
    assignmentPlan: { findMany: async () => [] }, orderQuantityChange: { create: async ({ data }) => { written = data; return data; } } };
  const order = { id: 1, updatedAt: new Date() }, items = [{ id: 'a', styleId: 1, totalQuantity: 5 }, { id: 'b', styleId: 1, totalQuantity: 15 }];
  await assert.rejects(recordOrderQuantityReduction(db, order, items, '', 'actor', () => []), /REASON_REQUIRED/);
  assert.equal(written, null);
  await recordOrderQuantityReduction(db, order, items, 'fabric shortage; preserve excess', 'actor', () => [
    { orgId: 1, styleId: 1, assignedQuantity: 15, producedQuantity: 14 },
    { orgId: 1, styleId: 1, assignedQuantity: 15, producedQuantity: 12 },
    { orgId: 2, styleId: 1, assignedQuantity: 20, producedQuantity: null },
  ]);
  assert.equal(written.snapshot.production[0].excessQuantity, 6);
  assert.equal(written.snapshot.production[1].excessQuantity, null);
  assert.equal(written.actor, 'actor');
  assert.match(formatQuantityReview({ ...written, createdAt: new Date() }, 'ko'), /초과 6/);
  assert.match(formatQuantityReview({ ...written, createdAt: new Date() }, 'ko'), /확인 필요/);
});
