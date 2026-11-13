import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
const file='frontend/ledger-fee-submit.html',entry='frontend/acceptance/ledgerFeeSubmit.jsx',port=43427;
assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(file,'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/acceptance/ledgerFeeSubmit.jsx"></script></body></html>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedgerEntry.jsx';window.React=React;createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter initialEntries={['/bank-ledger/source']}><Routes><Route path="/bank-ledger/:entryId" element={<Ledger/>}/></Routes></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-fee-submit.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),requests=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const module=(name,body)=>page.route(`**/src/context/${name}.jsx*`,r=>r.fulfill({contentType:'application/javascript',body}));
  await module('AuthContext','export const useAuth=()=>({activeOrgId:1});');
  await module('AppContext','export const useAppActions=()=>({navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});');
  await module('LanguageContext',`export function useLanguage(){const React=window.React;const [languageCode,set]=React.useState('${lang}');window.switchLanguage=set;return {languageCode};}`);
  await module('RequestScopeContext',"export const useRequestScopeContext=()=>({active:true,scopeId:'/bank-ledger/source'});");
  await module('ManagementPeriodContext',"export const useManagementPeriod=()=>({startDate:'2026-04-01',loading:false});");
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'bank',entityAccountId:'master',displayName:'MB (USD)',currencyCode:'USD'}]});
  await reply('**/bank-ledger/counterparties?*',[{kind:'PARTNER',id:11,name:'THE SAN',code:'THES'},{kind:'ACCOUNT',id:'master',name:'MB (USD)',currencyCode:'USD'}]);
  await reply('**/transaction-codes?*',[{id:7,code:'CMTE',nameEn:'Garment Processing Fee',isActive:true},{id:9,code:'BNFE',nameEn:'Bank fee',isActive:true}]);
  await reply('**/app-settings?*',{defaultVatRate:8});
  await reply('**/bank-ledger/entries/source?*',{id:'source',revision:'r1',accountId:'bank',transactionDate:'2026-11-10',direction:'IN',amount:'16100.75',purpose:'Garment Processing Fee',accountingCodeId:7,evidenceType:'FILE',evidenceNumber:'receipt.pdf',expenseItems:[],settlementLines:[],bankFees:[],counterparty:{kind:'PARTNER',id:11,name:'THE SAN'},drafter:{name:'Original'}});
  await reply('**/approval-action-settings?*',{drafter:{id:1,name:'Editor'},grades:[],settings:{registrationStages:[]}});
  await reply('**/change-approval-preview?*',{complete:true,stages:[],drafter:{id:1,name:'Editor'},policy:{totals:[{currency:'USD',amount:'16109.61'}]}});
  await page.route('**/change-approval-requests?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});requests.push(r.request().postDataJSON());return r.fulfill({headers,json:{id:'pending'}});});
  await page.goto(`http://127.0.0.1:${port}/ledger-fee-submit.html`);
  const l=ledgerEntryText[lang],c=changeApprovalText[lang];
  await page.getByRole('button',{name:l.bankFeeLabel,exact:true}).click().catch(async error=>{throw Error(error.message+' PAGE '+errors.join(';')+' TEXT '+(await page.locator('body').innerText()));});
  assert.equal(await page.locator('[data-ledger-entry-row]').count(),1);
  await page.getByRole('button',{name:c.requestUpdate,exact:true}).click();
  const alert=page.getByRole('alert').first();assert.ok((await alert.textContent()).includes(ledgerWorkspaceText[lang].inputIssues.amount));
  assert.equal(await page.getByRole('dialog').count(),0);
  const other=lang==='en'?'ko':'en';await page.evaluate(code=>window.switchLanguage(code),other);await page.waitForFunction(text=>document.querySelector('[role="alert"]')?.textContent.includes(text),ledgerWorkspaceText[other].inputIssues.amount);
  await page.evaluate(code=>window.switchLanguage(code),lang);
  await page.locator('[data-ledger-inline-fee]').getByRole('textbox').fill('8.86');
  await page.getByRole('button',{name:c.requestUpdate,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('textbox',{name:c.reason,exact:false}).fill('Add missing bank fee');
  await dialog.getByRole('button',{name:c.request,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(requests.length,1);assert.equal(requests[0].operation,'UPDATE');assert.equal(requests[0].sourceId,'source');
  const [main,fee]=requests[0].payload.rows;assert.equal(main.amount,'16100.75');assert.equal(main.direction,'IN');assert.equal(fee.amount,'8.86');assert.equal(fee.accountingCodeId,9);assert.equal(fee.evidenceType,'BANK_FEE');assert.equal(fee.direction,'OUT');assert.equal(fee.accountId,main.accountId);assert.equal(fee.transactionDate,main.transactionDate);assert.equal(fee.feeForClientKey,main.clientKey);assert.equal(fee.counterparty,undefined);assert.equal(fee.evidenceNumber,'');assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS actual ledger edit: incoming USD 16,100.75 + inline BNFE USD 8.86, request reason and payload; missing fee amount stays editable, errors follow language; ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
