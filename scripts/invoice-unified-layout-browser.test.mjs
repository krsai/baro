import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {generalInvoiceText} from '../frontend/src/constants/generalInvoice.js';
import {invoiceUi} from '../frontend/src/constants/invoiceUi.js';
import {invoiceDocumentText} from '../frontend/src/constants/invoiceDocument.js';
const file=path.resolve('frontend/invoice-unified-layout-test.html');assert.ok(!existsSync(file));
writeFileSync(file,`<div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import List from '/src/pages/App/invoice/InvoiceList';import Editor from '/src/pages/App/invoice/GeneralInvoiceEditor';import Document from '/src/components/GeneralInvoiceDocument';
const {mode,lang}=Object.fromEntries(new URLSearchParams(location.search));const body=mode==='create'?React.createElement(Editor,{orgId:1,buyerOrgId:2,languageCode:lang}):mode==='readonly'?React.createElement(Document,{invoice:window.fixture,languageCode:lang}):React.createElement(List,{orgId:1,invoiceId:'original',languageCode:lang});createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),body)));
</script>`);
const fields={number:'INV-001',date:'2026-11-25',seller:{name:'BARO GARMENT',address:'115 Ngoc Truc, Hanoi, Vietnam',contactName:'Jeong Dongwon',phone:'+84 0855500100',email:'seller@example.test'},buyer:{name:'THE SAN',taxId:'3498800301',address:'Seoul, Republic Of Korea'},notes:'Saved Remark',bank:'Saved Bank Instructions'};
const invoice={id:'original',status:'ISSUED',documentKind:'GENERAL',buyerOrgId:2,invoiceNumber:'INV-001',revisionNumber:1,currencyCode:'USD',orders:[],snapshot:{templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',fields,currencyCode:'USD',subtotal:'20',vatAmount:'0',total:'20',orders:[],lines:[{lineKey:'line-original',transactionCodeId:1,code:'PBGE',description:'Poly Bag',unit:'Piece',quantity:'10',currencyCode:'USD',unitPrice:'2',vatRate:'0',subtotal:'20',vatAmount:'0',amount:'20'}]}};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43523','--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const name=text=>new RegExp('^'+RegExp.escape(text)+'$','i');
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43523/'+path.basename(file))).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1100}}),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(invoice=>window.fixture=invoice,invoice);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={navigateToPath:()=>window.issued=true,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;`}));
  await page.route('**/src/components/PageDialogProvider.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const usePageDialogs=()=>({confirm:async()=>true,prompt:async()=>{window.reasonAsked=true;return 'Correct Price';}});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/text-acronyms',r=>r.fulfill({headers,json:{revision:1,entries:[]}}));
  await page.route('**/invoices/**',r=>{const request=r.request(),url=new URL(request.url());if(request.method()==='OPTIONS')return r.fulfill({headers,status:204});if(request.method()!=='GET')writes.push({path:url.pathname,body:request.postDataJSON()});
   if(url.pathname.endsWith('/general-source'))return r.fulfill({headers,json:{buyerOrgId:2,sellerOrgId:1,seller:fields.seller,buyer:fields.buyer,sellerBankAccounts:[],codes:[{id:1,code:'PBGE',nameEn:'Poly Bag',nameKo:'Poly Bag',nameVi:'Poly Bag',cashDirection:'IN',vatEnabled:false}],units:[],defaultCurrencyCode:'VND'}});
   if(url.pathname.endsWith('/revision-draft'))return r.fulfill({headers,json:{id:'revision',revision:1,clientKey:'revision-client-key'}});
   if(url.pathname.endsWith('/drafts/revision'))return r.fulfill({headers,json:{id:'revision',revision:2,clientKey:'revision-client-key'}});
   if(url.pathname.endsWith('/issue'))return r.fulfill({headers,json:{id:'revised'}});
   if(url.pathname.endsWith('/issued/original'))return r.fulfill({headers,json:invoice});throw Error('Unexpected '+url.pathname);
  });
  const base='http://127.0.0.1:43523/'+path.basename(file)+'?lang='+lang;
  let headings;
  for(const mode of ['readonly','create','detail']){
   await page.goto(base+'&mode='+mode);await page.locator('.invoice-lines').waitFor();const current=await page.locator('.invoice-lines th').allTextContents();if(!headings)headings=current;else assert.deepEqual(current.filter(Boolean),headings.filter(Boolean));
   assert.equal(await page.locator('.invoice-document-identifiers .invoice-cell').count(),2);assert.equal(await page.locator('.invoice-summary').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(mode==='detail'){
    const t=generalInvoiceText[lang],ui=invoiceUi[lang],row=page.getByTestId('general-invoice-line');assert.equal(await row.getByRole('textbox',{name:name(t.price)}).isEditable(),true);assert.equal(writes.length,0);assert.equal(await page.getByRole('textbox',{name:name(invoiceDocumentText[lang].number)}).inputValue(),'INV-001');
    const table=page.locator('.invoice-lines');await table.evaluate(el=>el.dataset.identity='same-document');await row.getByRole('textbox',{name:name(t.price)}).fill('3');assert.equal(await table.getAttribute('data-identity'),'same-document');assert.equal(await page.getByRole('textbox',{name:name(invoiceDocumentText[lang].number)}).inputValue(),'INV-001-R2');assert.equal(writes.length,0);assert.match(await page.locator('.invoice-summary').innerText(),/30\.00/);
    await page.evaluate(async()=>{const m=await import('/src/utils/workspaceDataEvents.js');m.emitWorkspaceDataChanged({orgId:1,topics:[m.WORKSPACE_DATA_TOPICS.ISSUED_INVOICES]});});await page.waitForTimeout(350);assert.equal(await row.getByRole('textbox',{name:name(t.price)}).inputValue(),'3');assert.equal(await table.getAttribute('data-identity'),'same-document');
    if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/invoice-unified-layout-preview.png',fullPage:true});
    await page.getByRole('checkbox',{name:name(t.review)}).check();await page.getByRole('button',{name:name(ui.issue)}).click();await page.waitForFunction(()=>window.issued);assert.equal(await page.evaluate(()=>window.reasonAsked),true);assert.deepEqual(writes.map(w=>w.path),['/invoices/issued/original/revision-draft','/invoices/drafts/revision','/invoices/drafts/revision/issue']);assert.equal(writes[1].body.fields.number,'INV-001-R2');assert.equal(writes[1].body.lines[0].unitPrice,'3');assert.equal(invoice.snapshot.lines[0].unitPrice,'2');
   }
  }
  assert.deepEqual(errors,[]);await page.close();console.log('Unified detail/create/revision',lang,width,'passed');
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
