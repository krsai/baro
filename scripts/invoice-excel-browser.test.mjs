import {createRequire} from 'node:module';
const excelRequire=createRequire(new URL('../frontend/package.json',import.meta.url)),ExcelJS=excelRequire('exceljs');
import {invoiceListDescription,invoiceListPresentationText} from '../frontend/src/utils/invoiceListPresentation.mjs';
import {getRowActionsLabel} from '../frontend/src/constants/rowActions.js';
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
const fixture=path.resolve('frontend/invoice-excel-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate,useLocation}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import Ledger from'/src/pages/App/BankLedger.jsx';import Workspace from'/src/pages/App/invoice/InvoiceWorkspace.jsx';function App(){window.testNavigate=useNavigate();window.currentPath=useLocation().pathname;return React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger',element:React.createElement(Ledger)}),React.createElement(Route,{path:'/invoices',element:React.createElement(Workspace)}),React.createElement(Route,{path:'/invoices/:invoiceId',element:React.createElement(Workspace,{view:'detail'})}));}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme:appThemes[new URLSearchParams(location.search).get('theme')||'standard']},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/invoices']},React.createElement(App))));</script></body></html>`);
const port=43291,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/invoice-excel-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const themeName of ['standard','compact']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),errors=[],reads=[],t=invoiceMessages[lang],l=invoiceListUi[lang],u=invoiceUi[lang],d=invoiceDetailText[lang];page.setDefaultTimeout(30000);page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='application/pdf')blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);window.pdfCheck={type:blob.type,size:blob.size,header:String.fromCharCode(...bytes.slice(0,5)),pages:(new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g)||[]).length};});return original(blob);};});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:message=>{window.notices=[...(window.notices||[]),message]},navigateToPath:p=>window.testNavigate(p),markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/components/PageDialogProvider.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>false,prompt:async()=>null,alert:async()=>{}});'}));
  const row={id:'i1',invoiceNumber:'INV-001',status:'CANCELLED',buyerName:'Customer',currencyCode:'USD',total:'120',receivableAdded:'120',receivedAmount:'20',familyBalanceAmount:'100',familyBalanceKind:'DUE',isCurrentRevision:true,issuedAt:'2026-10-27T00:00:00Z',orders:[{id:1,sourceOrderId:'o1',sourceOrderNumber:'PO-1',installmentNumber:1}],payments:[],credits:[],finalLockEvents:[]};
  row.descriptions=['Saved Style'];row.accountingCodes=['CMTE'];row.itemSummary={firstDescription:'Saved Style',additionalCount:0,quantities:[{unit:'GARMENT',quantity:'60.0000'}]};
  const general={...row,id:'g1',documentKind:'GENERAL',invoiceNumber:'GEN-001',orders:[],descriptions:['Polybag'],itemSummary:{firstDescription:'Polybag',additionalCount:0,quantities:[{unit:'Pcs',quantity:'100.0000'}]}};
  const orderLabel=invoiceListDescription(row,lang),generalLabel=invoiceListDescription(general,lang);
  const invoice={...row,status:'CANCELLED',snapshot:{version:3,templateVersion:'BARO_INVOICE_V1',fields:{number:'INV-001',date:'2026-10-27',seller:{name:'BARO GARMENT'},buyer:{name:'Customer'},notes:'Saved document'},pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',total:'120',receivableAdded:'120',orders:[{sourceOrderId:'o1',sourceOrderNumber:'PO-1',basisAmount:'120',billingPercentage:'100',netAmount:'120',receivableAdded:'120'}],lines:Array.from({length:60},(_,index)=>({lineKey:'line'+index,orderId:'o1',styleName:'Saved style',description:'Saved item '+index,styleCode:'ST-1',color:'Blue',size:'M',quantity:1,unitPrice:'2',amount:'2',remark:'Existing snapshot'}))}};
  let submitted=null;
  await page.route('**/approval-action-settings**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{grades:[]}}));
  await page.route('**/change-approval-preview**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},json:{complete:true,stages:[],policy:{totals:[{currency:'USD',amount:'100'}]}}}));
  await page.route('**/change-approval-requests**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});submitted=r.request().postDataJSON();return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{id:'cancel1',status:'PENDING'}});});
  await page.route('**/invoices/issued**',r=>{assert.equal(r.request().method(),'GET');const url=new URL(r.request().url());assert.equal(url.searchParams.get('orgId'),'1');reads.push(url.pathname);return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:url.pathname.endsWith('/i1')?invoice:{rows:url.searchParams.get('search')==='BARO'?[general]:[row,general],hasMore:false}});});
  await page.goto(`http://127.0.0.1:${port}/invoice-excel-acceptance.html?theme=${themeName}`,{waitUntil:'domcontentloaded',timeout:60000});await page.getByText(orderLabel,{exact:true}).waitFor({timeout:60000});

  console.log('Checking',themeName,lang);
  const excel=page.locator('tbody tr').first().getByRole('button',{name:d.excel,exact:true});
  invoice.snapshot.fields.logoDataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#182b3d';ctx.fillRect(0,0,240,80);return c.toDataURL('image/png');});
  const downloadReady=page.waitForEvent('download',{timeout:60000});await excel.click();const download=await downloadReady;
  assert.equal(download.suggestedFilename(),'INV-001.xlsx');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(await download.path());
  const sheet=workbook.getWorksheet('Invoice');assert.equal(sheet.pageSetup.paperSize,9);assert.ok(sheet.rowCount>70);assert.equal(sheet.getImages().length,1);assert.equal(sheet.getCell('G8').value,'BARO GARMENT');assert.ok(sheet.getRow(14).values.includes('Description'));assert.equal(await page.evaluate(()=>window.currentPath),'/invoices');
  await excel.focus();const keyboardDownload=page.waitForEvent('download',{timeout:60000});await page.keyboard.press('Enter');assert.equal((await keyboardDownload).suggestedFilename(),'INV-001.xlsx');assert.equal(await page.evaluate(()=>window.currentPath),'/invoices');
  const touchDownload=page.waitForEvent('download',{timeout:60000});await excel.tap();assert.equal((await touchDownload).suggestedFilename(),'INV-001.xlsx');assert.equal(await page.evaluate(()=>window.currentPath),'/invoices');
  assert.ok(reads.filter(path=>path==='/invoices/issued/i1').length===3);
  await page.route('**/invoices/issued/i1?*',r=>r.fulfill({status:403,headers:{'Access-Control-Allow-Origin':'*'},json:{error:'FORBIDDEN'}}));
  await excel.click();await page.waitForFunction(message=>window.notices?.includes(message),u.failed);assert.equal(await excel.isEnabled(),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Invoice Excel: standard/compact x ko/en/vi, actual XLSX downloads, keyboard, no row navigation, frozen fields and denied-request retry passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
