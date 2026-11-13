import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
const fixture=path.resolve('frontend/ledger-drafter-acceptance.html'),port=43463;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Entry from'/src/pages/App/BankLedgerEntry.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/bank-ledger/edit/source']},React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger/edit/:entryId',element:React.createElement(Entry)})))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let attempt=0;attempt<100;attempt++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-drafter-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,activeProfile:{orgRole:'ACCOUNTANT',orgId:7}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;export const useAppState=()=>({});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'account',displayName:'Cash',currencyCode:'USD'}]});
  await reply('**/transaction-codes?*',[{id:1,code:'GENE',isActive:true,base:{nameEn:'General',entryMode:'GENERAL',cashDirection:'BOTH'}}]);
  await reply('**/bank-ledger/counterparties?*',[{kind:'PARTNER',id:2,name:'Vendor'}]);
  await page.route('**/approval-action-settings?*',r=>{assert.equal(new URL(r.request().url()).searchParams.get('operation'),'UPDATE');return r.fulfill({headers,json:{drafter:{id:2,name:'Current editor'},grades:[],settings:{rules:[]}}});});
  await reply('**/bank-ledger/entries/source?*',{id:'source',revision:'revision',accountId:'account',transactionDate:'2026-11-06',direction:'OUT',amount:'100',purpose:'Saved remark',accountingCodeId:1,evidenceType:'FILE',evidenceNumber:'receipt.pdf',counterparty:{kind:'PARTNER',id:2,name:'Vendor'},settlementLines:[],expenseItems:[],bankFee:'0',drafter:{id:1,name:'Saved author'}});
  await page.goto(`http://127.0.0.1:${port}/ledger-drafter-acceptance.html`);
  const summary=page.getByTestId('document-entry-approval');await summary.getByText('Saved author',{exact:true}).waitFor();
  const remark=page.getByRole('textbox',{name:ledgerEntryText[language].documentRemark,exact:true});await remark.fill('Edited remark');await summary.getByText('Current editor',{exact:true}).waitFor();
  await remark.fill('Saved remark');await summary.getByText('Saved author',{exact:true}).waitFor();
  assert.equal(await summary.getByText('Current editor',{exact:true}).count(),0);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.close();
 }
 console.log('PASS ledger drafter: saved author, modifying employee, reverted draft; ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
