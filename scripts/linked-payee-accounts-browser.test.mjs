import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
const html=path.resolve('frontend/linked-payee-accounts-acceptance.html'),port=43431;
assert.ok(!existsSync(html));writeFileSync(html,`<html><meta charset="UTF-8"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Picker from'/src/components/ExpensePayeePicker';import Accounts from'/src/components/BusinessAccounts';const lang=new URLSearchParams(location.search).get('lang');const options=[{id:11,code:'BARO',name:'BARO GARMENT',businessNumber:'0109423500'},{id:12,code:'NONE',name:'Without bank'}];function App(){const[value,setValue]=React.useState(null);window.selectedPayee=value;return React.createElement(React.Fragment,null,React.createElement(Picker,{orgId:1,languageCode:lang,options,value,onChange:setValue}),React.createElement(Accounts,{entityId:11,orgId:1,languageCode:lang}));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App))));</script>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/linked-payee-accounts-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],labels=ENTITY_TEXT[lang],t=expenseHeaderActions[lang];page.setDefaultTimeout(9000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:1,activeOrgRole:'ADMIN'});`}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useRequestScopeContext=()=>({active:true,scopeId:'/test'});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const a={setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;`}));
  let number='001234';await page.route('**/entities/*/bank-accounts*',r=>{assert.equal(r.request().method(),'GET');return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{accounts:r.request().url().includes('/entities/12/')?[]:[{id:'source-bank',accountKind:'BANK',displayName:'Receiving',bankName:'MB',accountNumber:number,accountHolder:'BARO GARMENT',currencyId:1,currency:{id:1,code:'USD'},ledgerAccounts:[]}],canEditAccounts:false,canLedger:false,currencies:[{id:1,code:'USD'}]}});});
  await page.goto(`http://127.0.0.1:${port}/linked-payee-accounts-acceptance.html?lang=${lang}`);
  await page.getByText('001234',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:labels.add,exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:labels.edit,exact:true}).isDisabled());
  const input=page.getByRole('textbox',{name:t.payee,exact:true});await input.fill('BARO');await input.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByTestId('expense-payee-button').getByRole('button').click();const dialog=page.getByRole('dialog');await dialog.getByText('001234',{exact:true}).waitFor();assert.equal(await dialog.getByText(t.noAccount,{exact:true}).count(),0);
  await page.keyboard.press('Escape');
  await input.fill('NONE');await input.press('Enter');await page.getByRole('dialog').getByText(t.noAccount,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.selectedPayee?.id),11);
  const missing=page.getByRole('dialog').getByRole('row').filter({has:page.getByRole('cell',{name:'NONE',exact:true})});assert.ok(await missing.getByRole('button').isDisabled());
  const search=page.getByRole('dialog').getByRole('textbox').first();await search.press('Enter');assert.equal(await page.evaluate(()=>window.selectedPayee?.id),11);await search.fill('');await search.press('ArrowUp');await page.getByRole('dialog').getByText('001234',{exact:true}).waitFor();await search.press('Enter');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.selectedPayee?.id),11);
  number='009876';await page.reload();await page.getByText('009876',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: linked bank details in payee picker, read-only source bank management and updated instructions; ko/en/vi.');
}finally{await browser?.close();vite.kill();unlinkSync(html);}
