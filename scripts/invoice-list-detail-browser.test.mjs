import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
import {ledgerFlowText} from '../frontend/src/constants/ledgerFlow.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
import {generalInvoiceText} from '../frontend/src/constants/generalInvoice.js';
import {invoiceDocumentText} from '../frontend/src/constants/invoiceDocument.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {invoiceMessages} from '../frontend/src/constants/invoiceMessages.js';
import {invoiceUi,invoiceListUi} from '../frontend/src/constants/invoiceUi.js';
import {invoiceDetailText} from '../frontend/src/constants/invoiceDetail.js';
const fixture=path.resolve('frontend/invoice-list-detail-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate,useLocation}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedger.jsx';import Workspace from'/src/pages/App/invoice/InvoiceWorkspace.jsx';function App(){window.testNavigate=useNavigate();window.currentPath=useLocation().pathname;return React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger',element:React.createElement(Ledger)}),React.createElement(Route,{path:'/invoices',element:React.createElement(Workspace)}),React.createElement(Route,{path:'/invoices/:invoiceId',element:React.createElement(Workspace,{view:'detail'})}));}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/invoices']},React.createElement(App))));</script></body></html>`);
const port=43273,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/invoice-list-detail-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],reads=[],t=invoiceMessages[lang],l=invoiceListUi[lang],u=invoiceUi[lang],d=invoiceDetailText[lang];page.setDefaultTimeout(30000);page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='application/pdf')blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);window.pdfCheck={type:blob.type,size:blob.size,header:String.fromCharCode(...bytes.slice(0,5)),pages:(new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g)||[]).length};});return original(blob);};});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},navigateToPath:p=>window.testNavigate(p),markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/components/PageDialogProvider.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>false,prompt:async()=>null,alert:async()=>{}});'}));
  const row={id:'i1',invoiceNumber:'INV-001',status:'ISSUED',buyerName:'Customer',currencyCode:'USD',total:'120',receivableAdded:'120',receivedAmount:'20',familyBalanceAmount:'100',familyBalanceKind:'DUE',isCurrentRevision:true,issuedAt:'2026-10-27T00:00:00Z',orders:[{id:1,sourceOrderId:'o1',sourceOrderNumber:'PO-1',installmentNumber:1}],payments:[],credits:[],finalLockEvents:[]};
  const general={...row,id:'g1',documentKind:'GENERAL',invoiceNumber:'GEN-001',orders:[]};
  const invoice={...row,status:'CANCELLED',snapshot:{version:3,templateVersion:'BARO_INVOICE_V1',fields:{number:'INV-001',date:'2026-10-27',seller:{name:'BARO GARMENT'},buyer:{name:'Customer'},notes:'Saved document'},pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',total:'120',receivableAdded:'120',orders:[{sourceOrderId:'o1',sourceOrderNumber:'PO-1',basisAmount:'120',billingPercentage:'100',netAmount:'120',receivableAdded:'120'}],lines:Array.from({length:60},(_,index)=>({lineKey:'line'+index,orderId:'o1',styleName:'Saved style',description:'Saved item '+index,styleCode:'ST-1',color:'Blue',size:'M',quantity:1,unitPrice:'2',amount:'2',remark:'Existing snapshot'}))}};
  let submitted=null;
  await page.route('**/approval-action-settings**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{grades:[]}}));
  await page.route('**/change-approval-preview**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},json:{complete:true,stages:[],policy:{totals:[{currency:'USD',amount:'100'}]}}}));
  await page.route('**/change-approval-requests**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});submitted=r.request().postDataJSON();return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{id:'cancel1',status:'PENDING'}});});
  await page.route('**/invoices/issued**',r=>{assert.equal(r.request().method(),'GET');const url=new URL(r.request().url());assert.equal(url.searchParams.get('orgId'),'1');reads.push(url.pathname);return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:url.pathname.endsWith('/i1')?invoice:{rows:url.searchParams.get('search')==='BARO'?[general]:[row,general],hasMore:false}});});
  await page.goto(`http://127.0.0.1:${port}/invoice-list-detail-acceptance.html`,{waitUntil:'domcontentloaded',timeout:60000});await page.getByText('INV-001',{exact:true}).waitFor({timeout:60000});
  assert.deepEqual(await page.locator('thead th').allTextContents(),[t.issuedDate,ledgerFlowText[lang].from,ledgerFlowText[lang].to,ACCOUNTING_CODE_TEXT[lang].code,ledgerEntryText[lang].codeDescription,ledgerWorkspaceText[lang].currency,l.statement,l.received,l.balance,bankLedgerMessages[lang].createdBy,t.invoiceStatus,'PDF',changeApprovalText[lang].DELETE]);assert.equal(await page.locator('tbody button').count(),4);assert.equal(await page.getByRole('button',{name:u.actions,exact:true}).count(),0);
  assert.equal(await page.locator('thead th').nth(6).evaluate(el=>getComputedStyle(el).textAlign),'right');
  assert.equal(await page.locator('[data-search-filters]').count(),0);assert.equal(await page.getByText('SEARCH',{exact:true}).count(),0);
  const input=page.getByPlaceholder(u.search),searched=page.waitForResponse(response=>new URL(response.url()).searchParams.get('search')==='BARO');await input.fill('BARO');await searched;await page.getByText('INV-001',{exact:true}).waitFor({state:'hidden'});await page.getByText('GEN-001',{exact:true}).waitFor();await input.fill('');await page.getByText('INV-001',{exact:true}).waitFor();
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  if(lang==='ko'){
   const popupReady=page.waitForEvent('popup');await page.locator('tbody tr').first().getByRole('button',{name:d.pdf,exact:true}).click();const pdfPopup=await popupReady;await pdfPopup.waitForURL(/^blob:/,{timeout:60000});await page.waitForFunction(()=>window.pdfCheck?.header==='%PDF-',{timeout:60000});const check=await page.evaluate(()=>window.pdfCheck);assert.equal(check.type,'application/pdf');assert.ok(check.size>10000);assert.ok(check.pages>1);assert.equal(await page.evaluate(()=>window.currentPath),'/invoices');for(const popup of page.context().pages())if(popup!==page)await popup.close();
  }
  const approvalText=changeApprovalText[lang];await page.getByRole('button',{name:approvalText.requestCancel,exact:true}).first().click();const approvalDialog=page.getByRole('dialog');await approvalDialog.getByRole('textbox',{name:approvalText.reason}).fill('Incorrect invoice');await approvalDialog.getByRole('button',{name:approvalText.request,exact:true}).click();await approvalDialog.waitFor({state:'hidden'});assert.equal(submitted.menu,'INVOICE');assert.equal(submitted.operation,'DELETE');assert.equal(submitted.sourceId,'i1');assert.equal(submitted.reason,'Incorrect invoice');
  await page.locator('tbody tr').first().dblclick();await page.getByRole('cell',{name:/Saved item 0$/}).waitFor();assert.equal(await page.locator('iframe').count(),0);assert.equal(reads.at(-1),'/invoices/issued/i1');assert.ok(await page.locator('input,textarea').evaluateAll(inputs=>inputs.every(input=>input.readOnly)));assert.equal(await page.getByRole('button',{name:u.edit,exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:d.back,exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:d.pdf,exact:true}).count(),0);
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  invoice.status='ISSUED';
  await page.evaluate(()=>window.testNavigate('/invoices'));await page.locator('[data-search-results]').getByText('INV-001',{exact:true}).waitFor();await page.locator('tbody tr').first().focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:d.title,exact:true}).waitFor();
  await page.getByRole('button',{name:l.revise,exact:true}).waitFor();
  assert.equal(await page.getByLabel(invoiceDocumentText[lang].number,{exact:true}).inputValue(),'INV-001');
  assert.ok(await page.locator('input,textarea').evaluateAll(inputs=>inputs.every(input=>input.readOnly)));
  assert.equal(reads.filter(path=>path.includes('order-source')).length,0);
  const ledgerReads=[];await page.route('**/bank-ledger/entries?*',r=>{const url=new URL(r.request().url());ledgerReads.push(Object.fromEntries(url.searchParams));return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{accounts:[{id:'a',currencyCode:'USD'}],rows:[{id:'cash',transactionDate:'2026-11-11',direction:'IN',accountName:'Bank',counterpartyName:'Customer',accountingCode:{code:'GENE',nameEn:'General'},currencyCode:'USD',amount:'120.00',createdByName:'Actor'}],hasMore:false}});});
  await page.evaluate(()=>window.testNavigate('/bank-ledger'));await page.getByTestId('ledger-activity-table').waitFor();
  assert.deepEqual(await page.locator('thead th').allTextContents(),[bankLedgerMessages[lang].transactionDate,ledgerFlowText[lang].from,ledgerFlowText[lang].to,ACCOUNTING_CODE_TEXT[lang].code,ledgerEntryText[lang].codeDescription,ledgerWorkspaceText[lang].currency,bankLedgerMessages[lang].IN,bankLedgerMessages[lang].OUT,bankLedgerMessages[lang].createdBy,'']);
  assert.equal(await page.locator('[data-search-filters]').count(),0);assert.equal(await page.getByText('SEARCH',{exact:true}).count(),0);
  const ledgerSearch=page.locator('[data-search-panel] input').first();await ledgerSearch.fill('Customer');await page.waitForResponse(response=>new URL(response.url()).searchParams.get('search')==='Customer');assert.equal(ledgerReads.at(-1).includeVoided,'0');assert.equal(ledgerReads.at(-1).orgId,'1');
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Invoice list/detail ko/en/vi: column order, approval cancellation, PDF action, real multi-page PDF blob, double-click/Enter, read-only snapshot and responsive detail passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
