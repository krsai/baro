import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {EXPENSE_DRAFT_ACCESS_TEXT} from '../frontend/src/constants/expenseList.js';
const fixture='frontend/expense-draft-access-test.html',port=43561;
assert.ok(!existsSync(fixture));
// Vite HTML inline scripts do not transform JSX; keep this fixture native JS.
const source=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Costs from'/src/pages/App/PartnerTransactionCosts';
window.testReact=React;createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Costs,{onNewRequest:()=>window.opened=true}))));</script>`;
writeFileSync(fixture,source);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-draft-access-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:lang==='vi'?390:1440,height:1000}}),errors=[],headers={'Access-Control-Allow-Origin':'*'};page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export function useAuth(){const React=window.testReact;const [activeOrgId,setOrg]=React.useState(1);React.useEffect(()=>{window.switchOrg=setOrg;},[]);return {activeOrgId};}`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({loading:false,startDate:null});'}));
  await page.route('**/src/components/AppNotice.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export default ({children,action})=>window.testReact.createElement('div',{role:'alert'},children,action);`}));
  for(const api of ['outsourcing-requests','expense-requests'])await page.route(`**/${api}?*`,r=>r.fulfill({headers,json:[]}));
  let release,reads=0,mode='delayed';
  await page.route('**/expense-approval-settings?*',async r=>{reads++;if(mode==='delayed')await new Promise(resolve=>release=resolve);await r.fulfill({headers,status:mode==='failed'?503:200,json:mode==='failed'?{error:'UNAVAILABLE'}:mode==='invalid'?{}:{canDraft:mode==='allowed'}});});
  await page.goto(`http://127.0.0.1:${port}/expense-draft-access-test.html`);const button=page.locator('.cc-primary');await button.waitFor().catch(async e=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText(),cause:e.message}));});assert.equal(await button.isDisabled(),true);
  for(let i=0;!release&&i<250;i++)await new Promise(r=>setTimeout(r,20));assert.equal(typeof release,'function');mode='failed';release();await page.getByRole('alert').filter({hasText:EXPENSE_DRAFT_ACCESS_TEXT[lang].failed}).waitFor();assert.equal(await button.isDisabled(),true);
  mode='allowed';await page.getByRole('button',{name:EXPENSE_DRAFT_ACCESS_TEXT[lang].retry,exact:true}).click();await button.isEnabled();await page.waitForFunction(()=>!document.querySelector('.cc-primary').disabled);assert.equal(reads,2);await button.click();assert.equal(await page.evaluate(()=>window.opened),true);
  mode='delayed';release=null;await page.evaluate(()=>window.switchOrg(2));await page.waitForFunction(()=>document.querySelector('.cc-primary').disabled);for(let i=0;!release&&i<250;i++)await new Promise(r=>setTimeout(r,20));assert.equal(typeof release,'function');mode='denied';release();await page.waitForTimeout(150);assert.equal(await button.isDisabled(),true);
  mode='invalid';await page.evaluate(()=>window.switchOrg(3));await page.getByRole('alert').filter({hasText:EXPENSE_DRAFT_ACCESS_TEXT[lang].failed}).waitFor();assert.equal(await button.isDisabled(),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: draft access pending/failure/retry/allow/deny/malformed response and company isolation in ko/en/vi.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
