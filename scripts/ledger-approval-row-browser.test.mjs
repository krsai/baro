import {ledgerBalanceText} from '../frontend/src/constants/ledgerBalance.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {accountOverviewText} from '../frontend/src/constants/accountOverview.js';
import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
const fixture=path.resolve('frontend/ledger-approval-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useLocation,useNavigate}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedger.jsx';import Entry from'/src/pages/App/BankLedgerEntry.jsx';import Overview from'/src/pages/App/AccountOverview.jsx';function App(){window.testNavigate=useNavigate();const location=useLocation();return location.pathname==='/account-overview'?React.createElement(Overview):location.pathname.startsWith('/bank-ledger/edit/')?React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger/edit/:entryId',element:React.createElement(Entry)})):location.pathname==='/bank-ledger/new'?React.createElement(Entry):React.createElement(Ledger);}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger']},React.createElement(App))));</script></body></html>`);
const port=43259,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-approval-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[],balancePosts=[],queries=[],t=bankLedgerMessages[lang],w=ledgerWorkspaceText[lang],e=ledgerEvidenceText[lang],l=ledgerEntryText[lang],o=accountOverviewText[lang],b=ledgerBalanceText[lang];let blockOnce=true,failOnce=true,saved=false,edited=false,deleted=false;
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:1,activeOrgRole:window.testRole||'ACCOUNTANT',activeProfile:{orgName:'Company'}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={navigateToPath:path=>window.testNavigate(path),setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const accounts=[{id:'a',displayName:'USD cash',currencyCode:'USD',currentBalance:'100.00',totalIn:'120.00',totalOut:'20.00',openingDate:'0001-01-01'},{id:'b',bankName:'Bank',accountNumber:'001',currencyCode:'VND',currentBalance:'500',totalIn:'700',totalOut:'200',openingDate:'0001-01-01'}];
  await page.route('**/transaction-codes?**',r=>r.fulfill({headers,json:[{id:100,code:'GENE',nameEn:'General',isActive:true},{id:101,code:'FEEE',nameEn:'Fee',isActive:true}]}));
  await page.route('**/bank-ledger/**',r=>{
   const url=new URL(r.request().url());if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   assert.equal(url.searchParams.get('orgId'),'1');
   if(url.pathname.endsWith('/balance-adjustments')){const body=r.request().postDataJSON();balancePosts.push(body);assert.equal(body.accounts[0].targetBalance,'-5.25');assert.equal(body.accounts[0].expectedBalance,'100.00');assert.equal(body.accounts[1].targetBalance,'0');assert.equal(body.reason,'Reconcile balance');if(balancePosts.length===1)return r.fulfill({headers,status:409,json:{error:'LEDGER_BALANCE_CHANGED'}});if(balancePosts.length===2)return r.fulfill({headers,status:500,json:{error:'Unknown result'}});return r.fulfill({headers,json:{entryIds:['balance-adjustment']}});}
   if(url.pathname.endsWith('/exchange-rates'))return r.fulfill({headers,json:{source:'Frankfurter',date:'2026-10-30',rates:{USD:'1',VND:'25000',KRW:'1250'},stale:false}});
   if(url.pathname.endsWith('/overview'))return r.fulfill({headers,json:{orgId:1,asOf:'2026-10-30',yesterday:'2026-10-29',monthStart:'2026-10-01',historyStart:new Date(Date.parse('2026-10-30')-(Number(url.searchParams.get('days')||30)-1)*86400000).toISOString().slice(0,10),accounts:accounts.map(a=>({...a,name:a.displayName||a.bankName,beginningBalance:'0',change:a.currentBalance,yesterdayIn:a.totalIn,yesterdayOut:a.totalOut})),currencyTotals:accounts.map(a=>({...a,beginningBalance:'0',change:a.currentBalance,yesterdayIn:a.totalIn,yesterdayOut:a.totalOut})),history:Array.from({length:Number(url.searchParams.get('days')||30)},(_,i)=>({date:new Date(Date.parse('2026-10-30')-(Number(url.searchParams.get('days')||30)-1-i)*86400000).toISOString().slice(0,10),accounts:accounts.map(a=>({accountId:a.id,balance:a.currentBalance})),currencyTotals:accounts.map(a=>({currencyCode:a.currencyCode,balance:a.currentBalance}))})),transactions:[],receivables:[],payables:[],outstandingTotals:[]}});
   if(url.pathname.endsWith('/counterparties'))return r.fulfill({headers,json:[]});
   if(url.pathname.endsWith('/accounts'))return r.fulfill({headers,json:{accounts}});
   if(url.pathname.endsWith('/evidence/search'))return r.fulfill({headers,json:{documents:url.searchParams.get('type')==='INVOICE'?[{id:'invoice',reference:url.searchParams.get('search')==='INV-2'?'INV-2':'INV-1',payee:'Buyer',amount:'1000',remaining:'1000'}]:[{id:1,version:2,reference:'EXP-000001',payee:'Vendor',amount:'100',remaining:'100',items:[{id:'cost1',description:'Approved item',remaining:'100'}]}]}});
   if(url.pathname.endsWith('/evidence/expenses'))return r.fulfill({headers,json:{items:[{id:'cost1',line:1,description:'Approved item',remaining:'100'}]}});
   if(url.pathname.endsWith('/entries/r1')){const method=r.request().method();if(method==='GET')return r.fulfill({headers,json:{accountId:'a',transactionDate:'2026-10-01',direction:'IN',amount:'100.00',purpose:'Receipt',accountingCodeId:100,accountingCode:{id:100,code:'GENE',nameEn:'General',isActive:true},evidenceType:'FILE',evidenceNumber:'hidden-scan.pdf',expenseItems:[],document:null,settlementLines:[],bankFee:'0.00'}});if(method==='PUT'){const body=r.request().postDataJSON();assert.equal(body.schemaVersion,2);assert.equal(body.rows.length,1);assert.equal(body.rows[0].amount,'105');assert.equal(body.rows[0].accountingCodeId,100);assert.equal(body.rows[0].remark,'Updated remark');edited=true;return r.fulfill({headers,json:{entryIds:['replacement']}});}if(method==='DELETE'){assert.equal(r.request().postDataJSON().reason,'Duplicate');deleted=true;return r.fulfill({headers,json:{id:'r1'}});}}
   if(url.pathname.endsWith('/entries/batch')){if(blockOnce){blockOnce=false;return r.fulfill({headers,status:400,json:{error:'LEDGER_ROW:2:LEDGER_EXPENSE_NOT_APPROVED'}});}posts.push(r.request().postDataJSON());if(failOnce){failOnce=false;return r.fulfill({headers,status:500,json:{error:'Unknown result'}});}saved=true;return r.fulfill({headers,status:201,json:{entryIds:['1','2','3','4']}});}
   if(url.pathname.endsWith('/entries')){queries.push(url.searchParams.get('accountId'));const rows=saved&&(!deleted||url.searchParams.get('includeVoided')==='1')?[{id:'r1',accountingCode:{code:'GENE',base:{nameEn:'General',nameKo:'General',nameVi:'General'}},accountId:'a',accountName:'USD cash',currencyCode:'USD',transactionDate:'2026-10-01',direction:'IN',amount:'100',balance:'100',purpose:'Receipt',...(deleted?{voidedAt:'2026-10-30',voidReason:'Duplicate'}:{}),evidenceNumber:'hidden-scan.pdf',createdBy:'actor@example.com',createdByName:'Actor name',settlementLines:[{id:'saved-fee',kind:'FEE',amount:'10',purpose:'Withheld fee',createdBy:'actor'}]}]:[];return r.fulfill({headers,json:{accounts,currencyTotals:accounts.map(a=>({...a})),rows,page:0,hasMore:false}});}
   throw Error('Unexpected ledger request');
  });
  await page.goto('http://127.0.0.1:'+port+'/ledger-approval-acceptance.html');
  await page.getByRole('button',{name:t.addEntry,exact:true}).click();
  const row=index=>page.locator('[data-ledger-entry-row="'+index+'"]');
  await row(0).getByLabel(t.account,{exact:true}).click();await page.getByRole('option',{name:'USD cash / USD',exact:true}).click();
  for(const index of [0,1]){
   if(index)await page.getByRole('button',{name:w.add,exact:true}).click();
   await row(index).getByLabel(l.evidenceKind,{exact:true}).click();await page.getByRole('option',{name:l.EXPENSE,exact:true}).click();
   await row(index).getByRole('button',{name:l.link,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:l.search,exact:true}).fill('EXP');await dialog.getByRole('button',{name:l.select,exact:true}).click();
   await row(index).getByLabel(t.amount).fill('100');const input=row(index).getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:true});await input.fill('GENE');await input.press('Tab');await row(index).getByLabel(l.remark).fill('Expense payment');
  }
  await page.getByRole('button',{name:t.save,exact:true}).click();
  await page.getByRole('alert').filter({hasText:t.errors.LEDGER_EXPENSE_NOT_APPROVED}).waitFor();
  assert.equal(await row(1).getAttribute('data-row-error'),'true');assert.equal(await row(0).getAttribute('data-row-error'),null);
  assert.ok((await page.locator('[data-ledger-row-error="1"]').innerText()).includes(t.errors.LEDGER_EXPENSE_NOT_APPROVED));
  assert.ok((await page.getByRole('alert').innerText()).includes('2'));assert.equal(posts.length,0);assert.equal(await row(1).getByLabel(t.amount).isDisabled(),false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS approval row error',lang);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
