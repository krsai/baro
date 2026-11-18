import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
import {ledgerExpenseCorrectionText} from '../frontend/src/constants/ledgerExpenseCorrection.js';
import {ledgerFlowText} from '../frontend/src/constants/ledgerFlow.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
const file='frontend/ledger-expense-code-test.html',port=43531;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Entry from'/src/pages/App/BankLedgerEntry';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger/edit/source']},React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger/edit/:entryId',element:React.createElement(Entry)})))));</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-expense-code-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],t=changeApprovalText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:7,activeProfile:{orgRole:'ACCOUNTANT',orgId:7}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAppActions=()=>({navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});"}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  const codes=['OLDE','NEWE'].map((code,i)=>({id:i+1,code,isActive:true,base:{entryMode:'GENERAL',cashDirection:'OUT',nameEn:code}}));
  const source={id:'source',revision:'ledger-revision',accountId:'account',transactionDate:'2026-11-10',direction:'OUT',amount:'40',purpose:'Payment remark',accountingCodeId:1,evidenceType:'EXPENSE',evidenceNumber:'',counterparty:{kind:'PARTNER',id:2,name:'Vendor'},settlementLines:[],bankFee:'0',expenseItems:[{itemId:'item-1',amount:'40',accountingCode:codes[0],taxInclusiveAmount:true}],document:{id:'request-1',version:1,reference:'EXP-1',counterparty:{kind:'PARTNER',id:2,name:'Vendor'},items:[{id:'item-1',accountingCode:codes[0],amount:'100',remaining:'100',currency:'USD'}]}};
  const form={canonicalSource:{kind:'request',id:'request-1'},revision:'expense-revision',version:1,managementNumber:'EXP-1',remark:'Expense remark',requestDate:'2026-11-10',partnerOrgId:2,items:[{itemId:'item-1',transactionCodeId:1,transactionCode:codes[0],currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'Original'}}]};
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'account',entityAccountId:'master',displayName:'Cash',currencyCode:'USD'}]});
  await reply('**/transaction-codes?*',codes);await reply('**/bank-ledger/entries/source?*',source);
  await reply('**/bank-ledger/counterparties?*',[{kind:'PARTNER',id:2,name:'Vendor'}]);await reply('**/app-settings?*',{defaultVatRate:'8'});
  await reply('**/approval-action-settings?*',{grades:[],settings:{rules:[]},drafter:{id:4,name:'Editor'}});
  await reply('**/expense-request-editor/cost/item-1?*',form);
  await page.route('**/change-approval-preview?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});const body=r.request().postDataJSON();assert.equal(body.menu,'EXPENSE');assert.equal(body.payload.items[0].transactionCodeId,2);assert.deepEqual(body.payload.ledgerCodeOrigin,{entryId:'source',revision:'ledger-revision',itemId:'item-1'});return r.fulfill({headers,json:{complete:true,stages:[],policy:{totals:[{currency:'USD',amount:'100'}]}}});});
  await page.route('**/change-approval-requests?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});writes.push(r.request().postDataJSON());return r.fulfill({headers,json:{id:'correction',status:'PENDING'}});});
  await page.goto(`http://127.0.0.1:${port}/ledger-expense-code-test.html`);
  let field=page.locator('[data-ledger-entry-row="0"]').getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:true});await field.waitFor();assert.equal(await field.getAttribute('readonly'),null);
  const recipient=page.getByRole('textbox',{name:ledgerFlowText[lang].to,exact:true});
  await recipient.fill('Vendor');await recipient.press('Tab');
  assert.equal(await page.getByRole('button',{name:ledgerEntryText[lang].connected,exact:true}).count(),1);
  assert.equal(await field.inputValue(),'OLDE');
  await field.fill('NEWE');await field.press('Enter');const dialog=page.getByRole('dialog');await dialog.getByText(ledgerExpenseCorrectionText[lang].scope,{exact:false}).waitFor();assert.equal(writes.length,0);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});field=page.locator('[data-ledger-entry-row="0"]').getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:true});assert.equal(await field.inputValue(),'OLDE');
  await field.fill('NEWE');await field.press('Enter');await dialog.getByRole('textbox',{name:t.reason,exact:true}).fill('Correct shared code');await dialog.getByRole('button',{name:t.request,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,1);assert.equal(writes[0].menu,'EXPENSE');assert.equal(writes[0].sourceId,'request-1');assert.equal(writes[0].payload.items[0].unitPrice,'100');assert.equal(writes[0].payload.items[0].transactionCodeId,2);assert.equal(source.amount,'40');assert.equal(await field.inputValue(),'OLDE','pending approval keeps the original code live');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS ledger-origin shared expense correction',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
