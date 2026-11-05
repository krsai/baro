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
const fixture=path.resolve('frontend/ledger-registration-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedgerEntry.jsx';import Expense from'/src/pages/App/TransactionRequestEntry.jsx';import Partners from'/src/pages/App/TradePartners.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger/new']},React.createElement(new URLSearchParams(location.search).has('partners')?Partners:new URLSearchParams(location.search).has('expense')?Expense:Ledger))));</script></body></html>`);
const port=43283,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-registration-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[],direct=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const auth={isAuthenticated:true,activeOrgId:1,activeOrgRole:'ADMIN',activeProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN'},accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN',accessPolicy:${JSON.stringify(getDefaultRoleAccessPolicy())}}};export const useAuth=()=>auth;`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAppActions=()=>({navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});`}));
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
  if(!process.argv.includes('--partners-only')){
  await page.goto(`http://127.0.0.1:${port}/ledger-registration-acceptance.html`);const t=bankLedgerMessages[lang],e=ledgerEvidenceText[lang],w=ledgerWorkspaceText[lang],l=ledgerEntryText[lang],c=changeApprovalText[lang];
  const header=page.getByTestId('document-entry-header');await header.getByRole('combobox').click();await page.getByRole('option',{name:'Bank B / USD',exact:true}).click();
  if(width>=1000)assert.ok(await header.getByTestId('document-entry-approval').evaluate(element=>Math.abs(element.getBoundingClientRect().right-element.parentElement.getBoundingClientRect().right+16)<=2),'Ledger approval stays at the right edge');assert.ok(await header.getByTestId('document-entry-fields').evaluate(element=>{const fields=[...element.firstElementChild.children].filter(field=>field.getBoundingClientRect().width>0);return fields[0].getBoundingClientRect().width<=157&&fields[1].getBoundingClientRect().width<=261;}));assert.ok(await header.locator('[data-approval-summary-title]').evaluateAll(elements=>elements.length===3&&elements.every(element=>getComputedStyle(element).textAlign==='center')));await page.getByRole('button',{name:w.add,exact:true}).click();assert.equal(await page.locator('[data-ledger-entry-row]').count(),2);
  assert.equal(await page.locator('[data-ledger-entry-row]').getByRole('combobox',{name:t.account,exact:true}).count(),0);
  for(const [i,amount] of ['10','20'].entries()){
   const row=page.locator('[data-ledger-entry-row="'+i+'"]');await row.getByRole('combobox',{name:c.party}).fill('BARO');await page.getByRole('option',{name:'BARO',exact:true}).click();await row.getByRole('textbox',{name:t.amount,exact:true}).fill(amount);
   await row.getByRole('combobox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:false}).fill('GENE');await page.keyboard.press('Enter');await row.getByRole('textbox',{name:l.remark,exact:true}).fill('Received');await row.getByRole('textbox',{name:e.reference,exact:true}).fill('Receipt '+i);
  }
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:c.request,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(requests.length,1);assert.equal(requests[0].operation,'CREATE');assert.deepEqual(requests[0].payload.rows.map(r=>r.accountId),['b','b']);assert.equal(new Set(requests[0].payload.rows.map(r=>r.transactionDate)).size,1);assert.equal(direct.length,0);
  await reply('**/expense-payees?*',[{id:11,name:'BARO',code:'BARO',isActive:true,type:'BRAND',serviceTypes:[]}]);await reply('**/app-settings?*',{});await reply('**/expense-units?*',[]);await reply('**/orders?*',[]);await reply('**/expense-approval-settings?*',{drafter:{id:1,name:'Drafter',orgRole:'ADMIN'},settings:{},candidates:[]});
  await page.goto(`http://127.0.0.1:${port}/ledger-registration-acceptance.html?expense=1`);
  if(width>=1000)assert.ok(await page.getByTestId('document-entry-approval').evaluate(element=>Math.abs(element.getBoundingClientRect().right-element.parentElement.getBoundingClientRect().right+16)<=2),'Expense approval stays at the right edge');
  const date=page.getByTestId('document-entry-header').getByLabel(EXPENSE_REQUEST_TEXT[lang].date,{exact:true});await date.waitFor();assert.equal(await date.getAttribute('readonly'),'');assert.equal(await date.inputValue(),new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}));
  }
  const official={id:12,nameKo:'Garment',nameEn:'Garment',nameVi:'Garment',partnerRoleId:2,partnerRole:{id:2,nameKo:'Manufacturing',nameEn:'Manufacturing',nameVi:'Manufacturing'}};
  await reply('**/partner-directory?*',{roles:[],rows:[{kind:'BUSINESS',entity:{id:11,name:'BARO',code:'OLD',type:'LOGISTICS_PROVIDER',isActive:true,country:'VN',createdAt:'2026-11-04'},linkedCompany:{code:'BARO'},classification:{revision:1,roleIds:[1],industryIds:[13],industries:[{id:13,nameEn:'Legacy transport'}]},officialClassification:{revision:2,roleIds:[2],industryIds:[12],industries:[official]}}]});
  await page.goto(`http://127.0.0.1:${port}/ledger-registration-acceptance.html?partners=1`);await page.getByText('Manufacturing > Garment',{exact:false}).waitFor();assert.equal(await page.getByText('Legacy transport',{exact:false}).count(),0);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
 }
 console.log('PASS: single-account header, shared date, pending registration with two stages, expense read-only date; ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
