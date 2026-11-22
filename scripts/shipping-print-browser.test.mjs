import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildIssuedInvoicePrintHtml} from '../frontend/src/utils/issuedInvoicePrint.mjs';
import {transportFormHtml} from '../frontend/src/utils/transportForms.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const width=Math.floor((210-28)*96/25.4),page=await browser.newPage({viewport:{width,height:1050}});await page.emulateMedia({media:'print'});
 const party={name:'BARO GARMENT / CUSTOMER COMPANY',address:'115 NGOC TRUC ROAD, HANOI, VIETNAM '.repeat(4),contactName:'SAVED CONTACT',phone:'+84 0855500100',email:'long-address-for-testing-print-width@company.example.test',taxId:'123456789012345'};
 for(const kind of ['ORDER','GENERAL'])for(const lang of ['ko','en','vi']){
  const invoice={status:'ISSUED',snapshot:{version:3,templateVersion:'BARO_INVOICE_V1',documentKind:kind,pricingBasis:'FINISHED_GOODS_PRICE',currencyCode:'USD',subtotal:'123456789012.34',vatAmount:'0',total:'123456789012.34',receivableAdded:'123456789012.34',fields:{number:'INV-PRINT-WIDTH',date:'2026-11-23',seller:party,buyer:party,bank:'BENEFICIARY: BARO GARMENT COMPANY / BANK ADDRESS: '+ 'LONG BANK ADDRESS WITHOUT HIDDEN CONTENT '.repeat(18)+'\nSWIFT: BAROVNVN / ACCOUNT: 12345678901234567890',notes:'Saved notes '.repeat(20)},orders:[{sourceOrderId:'o1',sourceOrderNumber:'ORDER-1',basisAmount:'123456789012.34',billingPercentage:'100',netAmount:'123456789012.34',receivableAdded:'123456789012.34'}],lines:Array.from({length:35},(_,index)=>({orderId:'o1',description:'Long garment description '.repeat(3)+index,styleCode:'STYLE-'+index,quantity:1,unit:'PCS',unitPrice:'123456789012.34',vatRate:0,vatAmount:'0',amount:'123456789012.34'}))}};
  const before=structuredClone(invoice),html=buildIssuedInvoicePrintHtml(invoice,lang);await page.setContent(html,{waitUntil:'load'});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.invoice-sheet,.invoice-sheet *')].filter(node=>{const r=node.getBoundingClientRect();return r.width&&r.height&&(r.left<-.5||r.right>document.documentElement.clientWidth+.5);}).map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width})).slice(0,8));
  assert.deepEqual(overflow,[],`${kind}/${lang} must fit A4 printable width`);assert.equal(await page.locator('body').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);assert.ok((await page.locator('body').innerText()).includes('12345678901234567890'));
  const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,...(kind==='ORDER'&&lang==='ko'?{path:path.join(tmpdir(),'baro-invoice-width.pdf')}:{})});assert.ok(pdf.byteLength>1000);assert.deepEqual(invoice,before);console.log('PASS A4 invoice bounds, long bank/address, preserved values and PDF',kind,lang);
 }
 for(const type of ['BILL_OF_LADING','SEA_WAYBILL','AIR_WAYBILL','WAYBILL','AN','DO','POD','MANIFEST']){
  const kind=['AN','DO','POD','MANIFEST'].includes(type)?type:'HOUSE_DRAFT';
  const document={kind,number:'COPY-001',sourceVersion:2,snapshot:{issuer:party,source:{number:'JOB-001',documentType:type,mode:type==='AIR_WAYBILL'?'AIR':'SEA',data:{origin:'HANOI',destination:'SEOUL',shipper:'BARO GARMENT\n115 NGOC TRUC, HANOI',consignee:'THE SAN\nSEOUL, KOREA',cargo:'GARMENTS / JACKETS',quantity:10,unit:'CTNS',weightKg:'120.50',cbm:'1.25',marks:'BARO',vessel:'VESSEL',voyage:'V001',etd:'2026-11-23',eta:'2026-11-26'}}}};
  await page.setContent(transportFormHtml(document));assert.equal(await page.locator('body').evaluate(node=>node.scrollWidth>node.clientWidth+1),false,type);if(type==='BILL_OF_LADING')await page.screenshot({path:path.join(tmpdir(),'baro-bill-of-lading-draft.png'),fullPage:true});const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,...(type==='BILL_OF_LADING'?{path:path.join(tmpdir(),'baro-bill-of-lading-draft.pdf')}:{})});assert.ok(pdf.byteLength>1000);console.log('PASS document form PDF',type);
 }
}finally{await browser.close();}
