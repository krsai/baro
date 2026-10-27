import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
const fixture=path.resolve('frontend/ledger-workspace-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation,useNavigate}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedger.jsx';import Entry from'/src/pages/App/BankLedgerEntry.jsx';function App(){window.testNavigate=useNavigate();const location=useLocation();return location.pathname==='/bank-ledger/new'?React.createElement(Entry):React.createElement(Ledger);}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger']},React.createElement(App))));</script></body></html>`);
const port=43257,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-workspace-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[],queries=[],t=bankLedgerMessages[lang],w=ledgerWorkspaceText[lang],e=ledgerEvidenceText[lang];let failOnce=true,saved=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:1,activeProfile:{orgName:'Company'}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={navigateToPath:path=>window.testNavigate(path),setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const accounts=[{id:'a',displayName:'USD cash',currencyCode:'USD',currentBalance:'100.00',totalIn:'120.00',totalOut:'20.00',openingDate:'0001-01-01'},{id:'b',bankName:'Bank',accountNumber:'001',currencyCode:'VND',currentBalance:'500',totalIn:'700',totalOut:'200',openingDate:'0001-01-01'}];
  await page.route('**/bank-ledger/**',r=>{
   const url=new URL(r.request().url());if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   assert.equal(url.searchParams.get('orgId'),'1');
   if(url.pathname.endsWith('/accounts'))return r.fulfill({headers,json:{accounts}});
   if(url.pathname.endsWith('/evidence/expenses'))return r.fulfill({headers,json:{items:[{id:'cost1',line:1,description:'Approved item',remaining:'100'}]}});
   if(url.pathname.endsWith('/entries/batch')){posts.push(r.request().postDataJSON());if(failOnce){failOnce=false;return r.fulfill({headers,status:500,json:{error:'Unknown result'}});}saved=true;return r.fulfill({headers,status:201,json:{entryIds:['1','2','3','4']}});}
   if(url.pathname.endsWith('/entries')){queries.push(url.searchParams.get('accountId'));const rows=saved?[{id:'r1',accountId:'a',accountName:'USD cash',currencyCode:'USD',transactionDate:'2026-10-01',direction:'IN',amount:'100',balance:'100',purpose:'Receipt',evidenceNumber:'hidden-scan.pdf',createdBy:'actor'}]:[];return r.fulfill({headers,json:{accounts,currencyTotals:accounts.map(a=>({...a})),rows,page:0,hasMore:false}});}
   throw Error('Unexpected ledger request');
  });
  await page.goto(`http://127.0.0.1:${port}/ledger-workspace-acceptance.html`);
  await page.getByRole('button',{name:w.overview,exact:true}).click();assert.equal(queries[0],null);const overview=page.getByRole('dialog');await overview.getByRole('cell',{name:'USD cash',exact:true}).waitFor();assert.ok((await overview.innerText()).includes('VND 500'));assert.ok((await overview.innerText()).includes('USD 100.00'));await overview.getByRole('button',{name:t.close,exact:true}).click();await overview.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('columnheader',{name:t.evidenceNumber,exact:true}).count(),0);assert.ok((await page.getByLabel(t.account,{exact:true}).innerText()).includes(w.all));
  await page.getByRole('button',{name:t.addEntry,exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  const row=index=>page.locator(`[data-ledger-entry-row="${index}"]`);
  await row(0).getByLabel(t.account).click();await page.getByRole('option',{name:'USD cash / USD',exact:true}).click();await row(0).getByLabel(t.amount).fill('100');await row(0).getByLabel(t.purpose).fill('Receipt');await row(0).getByLabel(e.reference).fill('first.pdf');
  await page.getByRole('button',{name:w.add,exact:true}).click();await row(1).getByLabel(e.type).click();await page.getByRole('option',{name:e.ADJUSTMENT,exact:true}).click();await row(1).getByLabel(t.direction).first().click();await page.getByRole('option',{name:t.OUT,exact:true}).click();await row(1).getByLabel(t.amount).fill('20');await row(1).getByLabel(t.purpose).fill('Balance correction');assert.equal(await row(1).getByLabel(e.reference).count(),0);
  await page.getByRole('button',{name:w.add,exact:true}).click();await row(2).getByLabel(e.type).click();await page.getByRole('option',{name:e.INVOICE,exact:true}).click();await row(2).getByLabel(t.amount).fill('99');await row(2).getByLabel(t.purpose).fill('Invoice receipt');await row(2).getByLabel(e.invoice).fill('INV-1');await row(2).getByLabel(e.fee).fill('1');
  await page.getByRole('button',{name:w.add,exact:true}).click();await row(3).getByLabel(e.type).click();await page.getByRole('option',{name:e.EXPENSE,exact:true}).click();await row(3).getByLabel(t.amount).fill('51');await row(3).getByLabel(t.purpose).fill('Approved expense');await row(3).getByLabel(e.fee).fill('1');await page.getByLabel(e.request).fill('EXP-000001');await page.getByRole('button',{name:e.find,exact:true}).click();await page.getByRole('button',{name:new RegExp(e.add+': #1 Approved item')}).click();await page.getByLabel(e.allocated).fill('50');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('alert').filter({hasText:t.uncertain}).waitFor();assert.equal(await row(0).getByLabel(t.amount).isDisabled(),true);assert.equal(await page.getByRole('button',{name:w.add,exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:t.retry,exact:true}).click();await page.getByRole('button',{name:w.overview,exact:true}).waitFor();assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].rows.length,4);assert.equal(posts[0].rows[3].expenseItems[0].itemId,'cost1');assert.equal(posts[0].rows[1].evidenceNumber,'');assert.equal('uiId' in posts[0].rows[0],false);
  assert.equal(await page.getByText('hidden-scan.pdf',{exact:true}).count(),0);await page.getByRole('cell',{name:'Receipt',exact:true}).waitFor();
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByRole('button',{name:w.overview,exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByRole('dialog').getByRole('button',{name:t.close,exact:true}).click();}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Ledger workspace ko/en/vi: all accounts, currency-separated overview, four evidence rows, safe batch retry, hidden reference column and responsive overflow passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
