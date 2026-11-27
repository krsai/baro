import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuedInvoicePrintHtml } from '../frontend/src/utils/issuedInvoicePrint.mjs';

const fixture = () => ({ status: 'ISSUED', buyer: { name: 'CURRENT MASTER' }, snapshot: {
  version: 3, templateVersion: 'BARO_INVOICE_V1', pricingBasis: 'FINISHED_GOODS_PRICE', currencyCode: 'USD', total: '80', receivableAdded: '0',
  fields: { number: 'INV-1', date: '2026-09-28', seller: { name: 'Frozen seller', address: 'Frozen address' },
    buyer: { name: 'Frozen buyer', country: 'VN', taxId: 'TAX123', email: 'frozen@example.com', phone: 'PHONE123' },
    shipTo:'Warehouse',shipmentDate:'2026-09-29',dueDate: '2026-10-28', incoterm: 'FOB', paymentTerms: '30 days', bank: 'Frozen bank', notes: '<script>alert(1)</script>' },
  orders: [{ sourceOrderId: 'internal-order-id', sourceOrderNumber: 'ORDER-1', basisAmount: '100', billingPercentage: '80', netAmount: '80', receivableAdded: '0' }],
  lines: [{ orderId: 'internal-order-id', quantity: 1, styleCode:'STYLE123',description: 'Jacket', color: 'Blue', gender: 'U', size: 'XL', hsCode:'HS123',origin:'Vietnam',unitPrice: '100', amount: '100', remark:'Customer remark',adjustmentReason: 'INTERNAL REASON' }],
} });

test('order print omits duplicate settlement table and preserves totals while general items retain VAT',()=>{
 const order=fixture(),before=structuredClone(order),html=buildIssuedInvoicePrintHtml(order);
 assert.doesNotMatch(html,/<table class="invoice-billing">/);
 assert.match(html,/<div class="invoice-total">/);
 assert.deepEqual(order,before);
 const general=fixture();general.snapshot.documentKind='GENERAL';
 general.snapshot.lines=[{description:'Office items',unit:'Pcs',quantity:'2',unitPrice:'10',vatRate:'10',vatAmount:'2',amount:'22'}];
 const output=buildIssuedInvoicePrintHtml(general),table=output.match(/<table class="invoice-lines">[\s\S]*?<\/table>/)[0];
 assert.match(table,/>Item<\/th>/);assert.ok(table.indexOf('>Quantity</th>')<table.indexOf('>Unit</th>'));
 assert.match(table,/>VAT \(%\)<\/th>/);assert.doesNotMatch(table,/Order number|Order qty|Style|Billing %/);
});

test('all invoice kinds share three company rows, hide internal codes, and preserve stored address case',()=>{
 for(const documentKind of ['ORDER','GENERAL'])for(const language of ['ko','en','vi']){
  const invoice=fixture();invoice.snapshot.documentKind=documentKind;
  invoice.snapshot.fields.seller.code='INTERNAL-SaaS-CODE';invoice.snapshot.fields.seller.contactName='Saved Contact';
  const before=structuredClone(invoice),html=buildIssuedInvoicePrintHtml(invoice,language);
  assert.ok(html.includes('invoice-party-main'));assert.ok(html.includes('invoice-party-address-row'));assert.ok(html.includes('invoice-party-contacts'));
  assert.ok(html.includes('Saved Contact'));assert.ok(html.includes('Frozen address'));assert.equal(html.includes('INTERNAL-SaaS-CODE'),false);assert.deepEqual(invoice,before);
 }
});

test('print explains the final billing percentage and deduction using frozen amounts and separate bank lines',()=>{
 const invoice=fixture();
 invoice.snapshot.orders[0]={...invoice.snapshot.orders[0],basisAmount:'200',billingPercentage:'50',billedAmount:'100',appliedDeductionAmount:'20',netAmount:'80'};
 invoice.snapshot.fields.bank='Bank A / 123 / Holder / USD\nBank B / 456 / Holder / VND';
 const before=structuredClone(invoice),html=buildIssuedInvoicePrintHtml(invoice);
 assert.ok(html.includes('Full amount: $200.00'));assert.ok(html.includes('Billing: 50%'));
 assert.ok(html.includes('Deduction: $20.00'));assert.ok(html.includes('Previously received: $0.00'));
 assert.equal((html.match(/<p class="invoice-bank-line">/g)||[]).length,2);
 assert.deepEqual(invoice,before);
});

test('issued HTML renders frozen document fields, public order numbers and settlement, not live masters or internal reasons', () => {
  const invoice = fixture(), before = structuredClone(invoice), html = buildIssuedInvoicePrintHtml(invoice);
  for (const text of ['COMMERCIAL INVOICE', 'Frozen seller', 'Frozen address', 'Frozen buyer', 'TAX123', 'frozen@example.com', 'PHONE123', 'Frozen bank', 'ORDER-1', '80%', 'Jacket', '$80.00']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html,/2026-10-28|FOB|30 days/);
  assert.doesNotMatch(html, /CURRENT MASTER|internal-order-id|INTERNAL REASON|DRAFT|<script>/);
  assert.doesNotMatch(html,/STYLE123|Warehouse|Customer remark|HS123|Vietnam|Color \/ Gender \/ Size/);
  assert.match(html,/Authorized signature \/ Company seal/);
  assert.doesNotMatch(html,/<footer[^>]*>2026/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /thead\{display:table-header-group\}/);
  assert.match(html, /@media print\{\.screen\{display:none\}\}/);
  assert.deepEqual(invoice, before);
});

test('issued template rejects unknown versions and explicitly supports legacy snapshots', () => {
  const invoice = fixture(); invoice.snapshot.templateVersion = 'FUTURE';
  assert.throws(() => buildIssuedInvoicePrintHtml(invoice), /TEMPLATE_UNSUPPORTED/);
  delete invoice.snapshot.templateVersion; invoice.snapshot.version = 2;
  assert.match(buildIssuedInvoicePrintHtml(invoice), /INV-1/);
  invoice.snapshot.version = 999;
  assert.throws(() => buildIssuedInvoicePrintHtml(invoice), /TEMPLATE_UNSUPPORTED/);
});

test('print uses English for every UI language and keeps cancelled status visible',()=>{
  const invoice=fixture();invoice.status='CANCELLED';
  for(const [lang,title,status] of [['ko','청 구 서','취소'],['en','INVOICE','Cancelled'],['vi','HÓA ĐƠN','Đã hủy']]){
    const html=buildIssuedInvoicePrintHtml(invoice,lang);
    assert.ok(html.includes(`<h1 class="invoice-heading">INVOICE</h1>`));
    assert.ok(html.includes(`<p class="invoice-status">Cancelled</p>`));
    assert.match(html,/class="invoice-parties invoice-paired-parties"/);assert.match(html,/class="invoice-total"/);
    assert.equal((html.match(/aria-hidden="true"/g)||[]).length,0);
  }
});
