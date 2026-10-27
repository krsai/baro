import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceItemGrid,invoiceLineNote,formatInvoiceMoney,sumInvoiceAmounts} from '../frontend/src/utils/invoiceItemGrid.mjs';
import {calculateInvoiceDraft} from '../frontend/src/utils/invoiceDraft.mjs';
const row=(size,extra={})=>({key:`item1:${size}`,orderId:'o1',itemId:1,styleId:10,description:'AA1962',styleCode:'INTERNAL',color:'Black',gender:'M',size,orderedQuantity:10,quantity:'10',remark:'',adjustmentReason:'',...extra});
test('size matrix groups one original item and never combines orders/colors/genders/items',()=>{
 const lines=[row('M'),row('L'),row('M',{key:'other:M',itemId:2}),row('L',{orderId:'o2'}),row('L',{color:'White'}),row('L',{gender:'F'})];
 const before=JSON.stringify(lines),grid=invoiceItemGrid(lines);
 assert.deepEqual(grid.sizes,['M','L']);assert.equal(grid.rows.length,5);assert.deepEqual(grid.rows[0].lines.map(l=>l.key),['item1:M','item1:L']);assert.equal(JSON.stringify(lines),before);
});
test('legacy notes/reasons are both visible and typing retains spaces and a stable row key',()=>{
 const lines=[row('M',{remark:'memo',adjustmentReason:'shortage'}),row('L',{remark:'different'})];
 assert.equal(invoiceLineNote(lines[0]),'memo\nshortage');
 const first=invoiceItemGrid(lines).rows[0];assert.match(first.note,/M: memo\nshortage/);assert.match(first.note,/L: different/);
 const edited=invoiceItemGrid(lines.map(l=>({...l,remark:'reason with ',adjustmentReason:'reason with '}))).rows[0];
 assert.equal(edited.key,first.key);assert.equal(edited.note,'reason with ');
});

test('size columns use apparel and numeric order while rows keep order/style/color groups together',()=>{
 const lines=['L','M','FREE','S','XL','2XL','XS','3XL','4XL','120','100'].map(size=>row(size));
 assert.deepEqual(invoiceItemGrid(lines).sizes,['XS','S','M','L','XL','2XL','3XL','4XL','FREE','100','120']);
 const rows=[row('M',{itemId:2,gender:'W'}),row('M',{itemId:3,color:'White'}),row('M',{itemId:4,styleId:20}),row('M',{itemId:5,orderId:'o2'}),row('M',{itemId:1})];
 const before=JSON.stringify(rows);
 assert.deepEqual(invoiceItemGrid(rows).rows.map(group=>group.lines[0].itemId),[1,2,3,4,5]);
 assert.equal(JSON.stringify(rows),before);
});
test('one note satisfies adjustment verification without changing original size keys or hidden historical fields',()=>{
 const lines=[row('M',{quantity:'9',hsCode:'6203',origin:'VN'}),row('L')];
 const source={ready:true,styles:[{styleId:10,prices:[{pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',entries:[{quantity:1,unitPrice:'1.2345'}]}]}]};
 assert.ok(calculateInvoiceDraft(source,lines,'MANUFACTURING_SERVICE_PRICE','USD').issues.includes('REASON'));
 const edited=lines.map(l=>({...l,remark:'Missing one piece',adjustmentReason:'Missing one piece'}));
 const result=calculateInvoiceDraft(source,edited,'MANUFACTURING_SERVICE_PRICE','USD');
 assert.deepEqual(result.issues,[]);assert.equal(result.lines[0].key,'item1:M');assert.equal(result.lines[0].hsCode,'6203');assert.equal(result.lines[0].origin,'VN');assert.equal(result.total,'23.46');
});
test('manual prices work without master prices and agree with issued per-line rounding',()=>{
 const source={ready:true,styles:[]};
 const lines=[row('M',{unitPriceOverride:'2.3456'}),row('L',{unitPriceOverride:'2.3456'})];
 const result=calculateInvoiceDraft(source,lines,'MANUFACTURING_SERVICE_PRICE','USD');
 assert.deepEqual(result.issues,[]);assert.equal(result.total,'46.92');assert.equal(result.lines[0].priceId,null);
 for(const value of ['', '0', '-1', '1.23456'])assert.ok(calculateInvoiceDraft(source,[row('M',{unitPriceOverride:value})],'MANUFACTURING_SERVICE_PRICE','USD').issues.includes('PRICE'));
});

test('currency display preserves four-decimal prices and exact grouped totals',()=>{
 assert.equal(formatInvoiceMoney('1.8','USD'),'USD 1.80');assert.equal(formatInvoiceMoney('1.2345','USD'),'USD 1.2345');
 assert.equal(formatInvoiceMoney('20000','VND'),'VND 20,000');assert.equal(formatInvoiceMoney(null,'USD'),'—');
 assert.equal(sumInvoiceAmounts(['216.00','108.00']),'324.00');
 assert.equal(sumInvoiceAmounts(['9999999999999999.99','0.01']),'10000000000000000.00');
 assert.equal(formatInvoiceMoney('10000000000000000.00','USD'),'USD 10,000,000,000,000,000.00');
 assert.equal(sumInvoiceAmounts(['1.00',null]),null);
});
