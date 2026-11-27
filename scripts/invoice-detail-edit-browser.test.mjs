import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {invoiceEditText} from '../frontend/src/constants/invoiceEdit.js';
import {invoiceUi} from '../frontend/src/constants/invoiceUi.js';
import {generalInvoiceText} from '../frontend/src/constants/generalInvoice.js';
import {combineInvoiceSources} from '../frontend/src/utils/invoiceDraft.mjs';
const file=path.resolve('frontend/invoice-detail-edit-test.html');assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import List from'/src/pages/App/invoice/InvoiceList.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(List,{orgId:1,invoiceId:'i1',languageCode:new URLSearchParams(location.search).get('lang')}))));</script>`);
const port=43537,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const party=name=>({name,address:'Saved Address',taxId:'123',phone:'',email:'',country:'VN'});
const orderSource={orderId:'o1',orderNumber:'PO-1',sourceUpdatedAt:'2026-11-27T00:00:00.000Z',sellerOrgId:1,buyerOrgId:2,seller:party('Seller'),buyer:party('Buyer'),currencies:['USD'],styles:[{styleId:10,orderedQuantity:10,producedQuantity:10,ready:true,prices:[{pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',entries:[{quantity:1,unitPrice:'2'}]}]}],lines:[{key:'item1:S',itemId:1,styleId:10,description:'Shirt',orderedQuantity:10,quantity:'10'}],sellerBankAccounts:[]};
try{
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const kind of ['ORDER','GENERAL'])for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];let paid=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},navigateToPath:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from'/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const combined=combineInvoiceSources([orderSource]),fields={number:'INV-001',date:'2026-11-27',seller:party('Seller'),buyer:party('Buyer'),bankAccounts:[],bank:'',notes:'Original'};
  const orders=kind==='ORDER'?[{sourceOrderId:'o1',sourceOrderNumber:'PO-1',sourceUpdatedAt:orderSource.sourceUpdatedAt,billingPercentage:'100',basisAmount:'20',billedAmount:'20',netAmount:'20',priorReceivedAmount:'0',appliedDeductionAmount:'0',vatRate:'0',vatAmount:'0'}]:[];
  const lines=kind==='ORDER'?combined.lines.map(row=>({...row,lineKey:row.key,quantity:10,unitPrice:'2',amount:'20'})):[{lineKey:'general-line-1',transactionCodeId:3,description:'Service',unit:'Pcs',quantity:'1',unitPrice:'20',vatRate:'0',vatAmount:'0',subtotal:'20',amount:'20',currencyCode:'USD'}];
  const invoice={id:'i1',documentKind:kind,status:'ISSUED',invoiceNumber:'INV-001',buyerOrgId:2,currencyCode:'USD',pricingBasis:'MANUFACTURING_SERVICE_PRICE',orders,payments:[],editRevision:'revision-1',snapshot:{version:5,templateVersion:'BARO_INVOICE_V1',documentKind:kind,fields,orders,lines,currencyCode:'USD',subtotal:'20',total:'20',currencyTotals:kind==='GENERAL'?[{currencyCode:'USD',subtotal:'20',vatAmount:'0',total:'20'}]:undefined}};
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:1,entries:[]},headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.route('**/invoices/**',r=>{const u=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   if(u.pathname==='/invoices/issued/i1'){
    if(r.request().method()==='PUT'){writes.push(r.request().postDataJSON());invoice.snapshot.fields=writes.at(-1).fields;invoice.editRevision='revision-2';return r.fulfill({headers,json:{id:'i1',editRevision:'revision-2'}});}
    return r.fulfill({headers,json:{...invoice,editLockedReason:paid?'INVOICE_DELETE_PAYMENT_LINKED':null}});
   }
   if(u.pathname==='/invoices/order-source/o1')return r.fulfill({headers,json:orderSource});
   if(u.pathname==='/invoices/general-source')return r.fulfill({headers,json:{buyerOrgId:2,seller:fields.seller,buyer:fields.buyer,sellerBankAccounts:[],codes:[{id:3,code:'TSTE',nameEn:'Service',cashDirection:'IN',vatEnabled:false}],units:[]}});
   throw Error('Unexpected request '+r.request().method()+' '+u.pathname);
  });
  await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}?lang=${lang}`);
  const save=page.getByRole('button',{name:invoiceEditText[lang].save,exact:true});await save.waitFor();assert.equal(await save.isDisabled(),true);
  const remark=page.locator('.invoice-remark textarea').first();await remark.fill('Corrected');
  if(kind==='GENERAL')await page.getByRole('checkbox').check();
  await save.click();await page.waitForFunction(()=>!!document.querySelector('.invoice-summary'));
  for(let n=0;n<100&&!writes.length;n++)await page.waitForTimeout(30);
  assert.equal(writes.length,1);assert.equal(writes[0].fields.number,'INV-001');assert.equal(writes[0].editRevision,'revision-1');
  await page.locator('.invoice-summary').waitFor();
  assert.equal(await page.locator('table [data-invoice-order-controls]').count(),0);
  const geometry=await page.locator('.invoice-summary').evaluate(el=>{const r=el.querySelector('.invoice-remark').getBoundingClientRect(),a=el.querySelector('.invoice-summary-details').getBoundingClientRect(),b=el.querySelector('.invoice-bank-section').getBoundingClientRect();return {above:r.bottom<=a.top+1,same:Math.abs(a.height-b.height)<2,side:a.right<=b.left+1};});
  assert.equal(geometry.above,true);if(width>600){assert.equal(geometry.same,true);assert.equal(geometry.side,true);}assert.equal(await page.locator('[data-invoice-bank-card]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(lang==='ko'&&kind==='ORDER'&&width===1440)await page.screenshot({path:'logs/invoice-detail-layout-preview.png',fullPage:true});
  paid=true;await page.reload();await page.getByText(invoiceEditText[lang].locked,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:invoiceEditText[lang].save,exact:true}).count(),0);assert.deepEqual(errors,[]);
  await page.close();console.log('PASS invoice detail',kind,lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
