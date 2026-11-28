import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildIssuedInvoiceExcel,invoiceExcelNumber} from '../frontend/src/utils/issuedInvoiceExcel.mjs';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ExcelJS=require('exceljs');
export const invoiceExcelFixture=kind=>({invoiceNumber:'INV-2026-000005',status:'ISSUED',snapshot:{templateVersion:'BARO_INVOICE_V1',documentKind:kind,currencyCode:'USD',subtotal:'780',vatAmount:'0',total:'780',fields:{number:'INV-2026-000005',date:'2026-11-27',seller:{name:'BARO GARMENT',address:'Saved Hanoi Address',taxId:'0109423500'},buyer:{name:'Frozen Buyer',address:'Room 547, Geumgang Penterium Ix Tower Knowledge Industry Center, Republic Of Korea',taxId:'0012345678'},notes:'=HYPERLINK("https://example.test","unsafe")',bankAccounts:[1,2,3].map(n=>({snapshot:{bankName:'Mb',accountNumber:'001234567890123456789'+n,accountHolder:'Frozen Holder',currencyCode:'USD',swiftCode:'MSCBVNVX'}}))},orders:kind==='GENERAL'?[]:[{sourceOrderId:'o1',sourceOrderNumber:'26AW2',basisAmount:'780',priorReceivedAmount:'0',billingPercentage:'100',vatRate:'0',vatAmount:'0'}],lines:[{lineKey:'line1',orderId:'o1',description:'Frozen shirt',quantity:'600',unit:'Pcs',unitPrice:'1.3',amount:'780',vatRate:'0',vatAmount:'0',currencyCode:'USD'}]}});

for(const kind of ['ORDER','GENERAL'])test(`${kind} workbook roundtrip preserves issued values, alignment, literal text and A4 print layout`,async()=>{
 const invoice=invoiceExcelFixture(kind),before=structuredClone(invoice);
 const source=await buildIssuedInvoiceExcel(invoice),bytes=await source.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);
 const sheet=loaded.getWorksheet('Invoice'),values=[];
 sheet.eachRow(row=>row.eachCell(c=>{if(!c.isMerged||c.master.address===c.address)values.push(c.value);}));
 assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.fitToWidth,1);assert.equal(sheet.pageSetup.fitToHeight,0);assert.match(sheet.pageSetup.printArea,/A1:L\d+/);
 assert.equal(sheet.views[0].showGridLines,false);assert.equal(sheet.getCell('A10').alignment.wrapText,true);assert.ok(sheet.getRow(10).height>=28);
 for(const value of ['BARO GARMENT','Frozen Buyer',kind==='ORDER'?'26AW2\nFrozen shirt':'Frozen shirt','0012345678','0012345678901234567891','MB','Authorized signature / Company seal',before.snapshot.fields.notes])assert.ok(values.includes(value),value);
 assert.ok(values.includes(780));assert.ok(values.includes(1.3));
 sheet.eachRow(row=>row.eachCell(c=>assert.equal(c.formula,undefined)));
 assert.deepEqual(invoice,before);
 const signature=values.indexOf('Authorized signature / Company seal');assert.ok(signature>0);
 let captionRow;sheet.eachRow(row=>{if(row.getCell(7).value==='Authorized signature / Company seal')captionRow=row.number;});
 assert.ok(Array.from({length:7},(_,i)=>sheet.getRow(captionRow-1-i).height).reduce((a,b)=>a+b,0)>=105);
});

test('general multicurrency output keeps each frozen total separate and stores large decimals exactly',async()=>{
 const invoice=invoiceExcelFixture('GENERAL');invoice.snapshot.currencyTotals=[{currencyCode:'USD',subtotal:'780',vatAmount:'0',total:'780'},{currencyCode:'VND',subtotal:'12345678901234567',vatAmount:'0',total:'12345678901234567'}];
 const book=await buildIssuedInvoiceExcel(invoice),sheet=book.getWorksheet('Invoice'),found=[];
 sheet.eachRow(row=>{const c=row.getCell(11);if(c.numFmt?.includes('VND'))found.push(c.value);});
 assert.ok(found.includes('12345678901234567'));assert.equal(invoiceExcelNumber('12345678901234567'),'12345678901234567');assert.equal(invoiceExcelNumber('1.3000'),1.3);
});

test('captured logo is embedded, external URLs and current master logos are ignored',async()=>{
 const invoice=invoiceExcelFixture('GENERAL');invoice.logoDataUrl='https://example.test/live.png';
 assert.equal((await buildIssuedInvoiceExcel(invoice)).getWorksheet('Invoice').getImages().length,0);
 invoice.snapshot.fields.logoDataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=';
 const book=await buildIssuedInvoiceExcel(invoice),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());assert.equal(loaded.getWorksheet('Invoice').getImages().length,1);
 invoice.snapshot.fields.logoDataUrl='https://example.test/current.png';assert.equal((await buildIssuedInvoiceExcel(invoice)).getWorksheet('Invoice').getImages().length,0);
});

test('unsupported snapshots fail closed before writing an Excel file',async()=>{
 const invoice=invoiceExcelFixture('ORDER');invoice.snapshot.templateVersion='UNKNOWN';await assert.rejects(buildIssuedInvoiceExcel(invoice),/TEMPLATE_UNSUPPORTED/);
});
