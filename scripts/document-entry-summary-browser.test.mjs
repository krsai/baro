import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
import {getDefaultRoleAccessPolicy} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
const fixture=path.resolve('frontend/document-entry-summary-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedgerEntry.jsx';import Expense from'/src/pages/App/TransactionRequestEntry.jsx';import Partners from'/src/pages/App/TradePartners.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger/new']},React.createElement(new URLSearchParams(location.search).has('partners')?Partners:new URLSearchParams(location.search).has('expense')?Expense:Ledger))));</script></body></html>`);
const port=43284,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/document-entry-summary-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  console.log('Checking document entry',lang,width);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[],direct=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const auth={isAuthenticated:true,activeOrgId:1,activeOrgRole:'ADMIN',activeProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN'},accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN',accessPolicy:${JSON.stringify(getDefaultRoleAccessPolicy())}}};export const useAuth=()=>auth;`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAppActions=()=>({navigateToPath:()=>{},showNotification:(message)=>{window.toasts=(window.toasts||[]).concat(message);},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useRequestScopeContext=()=>({active:true,scopeId:'/bank-ledger/new'});`}));
  await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useManagementPeriod=()=>({startDate:'2026-04-01',loading:false});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},stages=[{key:'step1',role:'ACCOUNTANT',employeeId:2,name:'Accountant',candidates:[{id:2,name:'Accountant'}]},{key:'step2',role:'ACCOUNTANT',employeeId:3,name:'Senior',candidates:[{id:3,name:'Senior'}]}];
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'a',entityAccountId:'ma',displayName:'Bank A',currencyCode:'USD'},{id:'b',entityAccountId:'mb',displayName:'Bank B',currencyCode:'USD'}]});
  await reply('**/bank-ledger/counterparties?*',[{kind:'PARTNER',id:11,name:'BARO',code:'BARO'}]);
  await reply('**/transaction-codes?*',[{id:7,code:'GENE',nameEn:'General',isActive:true,vatEnabled:false,base:{entryMode:'GENERAL',cashDirection:'BOTH'}}]);
  await reply('**/approval-action-settings?*',{drafter:{id:1,name:'Drafter'},grades:[],settings:{registrationStages:[{role:'ACCOUNTANT',gradeMatch:'ANY'},{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:2}]}});
  await page.route('**/change-approval-preview?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});return r.fulfill({headers,json:{complete:true,stages,policy:{totals:[{currency:'USD',amount:'30'}]}}});});
  await page.route('**/change-approval-requests?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});requests.push(r.request().postDataJSON());return r.fulfill({headers,json:{id:'pending'}});});
  await page.route('**/bank-ledger/entries/batch?*',r=>{direct.push(r.request().method());return r.fulfill({headers,status:409,json:{error:'CHANGE_APPROVAL_REQUIRED'}});});

  await page.goto(`http://127.0.0.1:${port}/document-entry-summary-acceptance.html`);
  const t=bankLedgerMessages[lang],e=ledgerEvidenceText[lang],w=ledgerWorkspaceText[lang],l=ledgerEntryText[lang],c=changeApprovalText[lang];
  const account=page.getByTestId('document-entry-header').getByRole('textbox',{name:t.account,exact:true});await account.fill('Bank B / USD');await account.press('Enter');
  await page.getByRole('button',{name:w.add,exact:true}).click();assert.equal(await page.locator('[data-ledger-entry-row]').count(),2);
  assert.equal(await page.locator('[data-ledger-entry-row]').getByRole('textbox',{name:l.remark,exact:true}).count(),0);
  const sharedRemark=width===1440?'Shared remark':'';
  assert.equal(await page.getByRole('textbox',{name:l.documentRemark,exact:false}).getAttribute('required'),null);
  await page.getByRole('textbox',{name:l.documentRemark,exact:false}).fill(sharedRemark);
  for(const [i,amount] of ['10','20'].entries()){
   const row=page.locator('[data-ledger-entry-row="'+i+'"]');await row.getByRole('textbox',{name:c.party}).fill('BARO');await page.keyboard.press('Enter');await row.getByRole('textbox',{name:t.amount,exact:true}).fill(amount);
   if(i===1){await row.getByRole('combobox').first().click();await page.getByRole('option',{name:w.OUT||t.OUT,exact:true}).click();}
   await row.getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:false}).fill('GENE');await page.keyboard.press('Enter');await row.getByRole('textbox',{name:e.reference,exact:true}).fill('Receipt '+i);
  }
  const totals=page.getByTestId('ledger-totals');assert.ok((await totals.innerText()).includes('-$10.00'));assert.equal(await totals.getByText(l.netChange,{exact:true}).count(),1);
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:c.request,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(requests.length,1);assert.deepEqual(requests[0].payload.rows.map(row=>row.remark),[sharedRemark,sharedRemark]);assert.deepEqual(requests[0].payload.rows.map(row=>row.accountId),['b','b']);assert.equal(direct.length,0);
  if(process.env.REMARK_ONLY==='1'){assert.deepEqual(errors,[]);await page.close();continue;}
  await page.goto(`http://127.0.0.1:${port}/document-entry-summary-acceptance.html`);await page.locator('[data-ledger-entry-row]').waitFor();assert.equal(await page.getByText(l.limit,{exact:true}).count(),0);
  if(lang==='ko'&&width===1440){for(let i=1;i<50;i++)await page.getByRole('button',{name:w.add,exact:true}).first().click();assert.equal(await page.locator('[data-ledger-entry-row]').count(),50);await page.getByRole('button',{name:w.add,exact:true}).first().click();assert.equal(await page.locator('[data-ledger-entry-row]').count(),50);assert.equal(await page.evaluate(()=>window.toasts.length),1);}
  await reply('**/expense-payees?*',[{id:11,name:'BARO',code:'BARO',isActive:true,type:'BRAND',serviceTypes:[]}]);await reply('**/app-settings?*',{});await reply('**/expense-units?*',[]);await reply('**/orders?*',[]);await reply('**/expense-approval-settings?*',{drafter:{id:1,name:'Drafter',orgRole:'ADMIN'},settings:{},candidates:[]});
  await page.goto(`http://127.0.0.1:${port}/document-entry-summary-acceptance.html?expense=1`);const labels=EXPENSE_REQUEST_TEXT[lang];await page.getByRole('button',{name:labels.add,exact:true}).waitFor();assert.equal(await page.getByText(labels.limit,{exact:true}).count(),0);
  assert.equal(await page.locator('tbody').getByRole('button',{name:labels.add,exact:true}).count(),1);await page.getByRole('button',{name:labels.add,exact:true}).click();assert.equal(await page.locator('tbody').getByRole('button',{name:labels.add,exact:true}).count(),2);
  if(lang==='ko'&&width===1440){for(let i=2;i<50;i++){await page.getByRole('button',{name:labels.add,exact:true}).first().evaluate(button=>button.click());await page.waitForFunction(expected=>document.querySelectorAll('tbody').length===expected,i+1);}await page.getByRole('button',{name:labels.add,exact:true}).first().evaluate(button=>button.click());assert.equal(await page.locator('tbody').getByRole('button',{name:labels.add,exact:true}).count(),50);assert.equal(await page.evaluate(()=>window.toasts.length),1);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(process.env.REMARK_ONLY==='1'?'Optional remark focused browser checks passed.':'Document entry summary passed ko/en/vi desktop/mobile: one shared remark saved through approval, signed totals, per-row add and 50-row toast limits for both editors.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
