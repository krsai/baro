import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceStyleRows,invoiceNumber,distributeInvoiceQuantity} from '../frontend/src/utils/invoiceStyleRows.mjs';
import {buildIssuedInvoicePrintHtml} from '../frontend/src/utils/issuedInvoicePrint.mjs';
import {formatInvoiceMoney} from '../frontend/src/utils/invoiceItemGrid.mjs';
import {invoiceBankInfo} from '../frontend/src/utils/invoiceBankInfo.mjs';

const lines=[{key:'a:S',orderId:'o',styleId:1,description:'Shirt',color:'Blue',size:'S',orderedQuantity:1000,quantity:1000,unitPrice:'1.2345',amount:'1234.50'},
  {key:'b:M',orderId:'o',styleId:1,description:'Shirt',color:'Red',size:'M',orderedQuantity:500,quantity:500,unitPrice:'1.23450',amount:'617.25'}];
test('style rows collapse colors and sizes but preserve separate orders, actual prices and exact rounded totals',()=>{
  const before=structuredClone(lines),rows=invoiceStyleRows(lines);
  assert.equal(rows.length,1);assert.equal(rows[0].quantity,1500);assert.equal(rows[0].amount,'1851.75');
  assert.equal(invoiceStyleRows([...lines,{...lines[0],orderId:'other'}]).length,2);
  assert.equal(invoiceStyleRows([...lines,{...lines[0],unitPrice:'2'}]).length,2);
  assert.equal(invoiceNumber('1234567890123456789.1234'),'1,234,567,890,123,456,789.1234');
  assert.equal(formatInvoiceMoney('-12345.6789','USD'),'USD -12,345.6789');
  assert.deepEqual(distributeInvoiceQuantity(rows[0],'1400'),[{key:'a:S',quantity:'933'},{key:'b:M',quantity:'467'}]);
  assert.equal(distributeInvoiceQuantity(rows[0],'1.5'),null);
  assert.deepEqual(lines,before);
});
test('issued document and PDF use grouped snapshots with comma formatting without exposing size rows',()=>{
  const invoice={snapshot:{version:3,templateVersion:'BARO_INVOICE_V1',currencyCode:'USD',fields:{number:'I-1'},orders:[{sourceOrderId:'o',sourceOrderNumber:'PO-1'}],lines,total:'1851.75'}};
  const html=buildIssuedInvoicePrintHtml(invoice);
  assert.match(html,/1,500/);assert.match(html,/USD 1,851.75/);assert.match(html,/USD 1.2345/);
  assert.doesNotMatch(html,/Color \/ Gender \/ Size|Blue|Red/);
});

test('invoice bank instructions use only matching currency company bank accounts',()=>{
  const account={bankName:'Bank',accountNumber:'001',accountHolder:'Company',currency:{code:'USD'}};
  assert.equal(invoiceBankInfo([account,{...account,accountNumber:'002',currency:{code:'VND'}}],'USD'),'Bank / 001 / Company / USD');
  assert.equal(invoiceBankInfo([account],'KRW'),'');
  assert.equal(invoiceBankInfo([], 'USD'),'');
});
