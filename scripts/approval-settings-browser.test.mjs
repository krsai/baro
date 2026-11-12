import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
const html='frontend/approval-settings-acceptance.html';assert.ok(!existsSync(html));
writeFileSync(html,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Scope from'/src/components/WorkspaceDialogScope.jsx';import Settings from'/src/pages/App/ApprovalSettings.jsx';function App(){const viewport=React.useRef();return React.createElement('div',{ref:viewport,style:{height:'100vh'}},React.createElement(Scope,{viewportRef:viewport},React.createElement(Settings)));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App))));</script>`);
const port=43219,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-settings-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],t=approvalSettingsText[lang],b=approvalBandText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const mock=(p,body)=>page.route(p,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:7});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
  await mock('**/src/context/AppContext.jsx*',`const noop=()=>{};export const useAppActions=()=>({showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});`);
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let settings={revision:0,drafterScope:{role:'OPERATOR',gradeId:null},limits:{USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'},VND:{senior:'20000000',lead:'100000000'}},rules:[],seniorGradeId:10,leadGradeId:20};
  const reply=()=>({canEdit:true,settings,grades:[{id:10,code:'CL2',name:'Senior'},{id:20,code:'CL3',name:'Lead'}]});
  await page.route('**/expense-approval-settings?*',r=>r.fulfill({headers,json:reply()}));await page.route('**/approval-action-settings?*',r=>r.fulfill({headers,json:reply()}));
  await page.route('**/approval-action-settings/batch?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});const body=r.request().postDataJSON();writes.push(body);settings={...body.changes[0].settings,revision:1};return r.fulfill({headers,json:{saved:[{menu:'EXPENSE',operation:'CREATE',settings}]}});});
  await page.goto(`http://127.0.0.1:${port}/approval-settings-acceptance.html`);
  const section=page.locator('[data-approval-operation="CREATE"]'),summary=section.locator('[data-condition-summary="0"]'),save=page.getByRole('button',{name:t.save,exact:true});await summary.waitFor();
  assert.equal(await section.locator('[data-cost-currency]').count(),0);assert.ok((await summary.boundingBox()).width<200);assert.match(await summary.innerText(),/USD/);assert.match(await summary.innerText(),/1,000/);assert.equal(await save.isDisabled(),true);
  await summary.click();let dialog=page.getByRole('dialog',{name:b.conditionDetails});await dialog.waitFor();const amount=()=>dialog.getByRole('textbox',{name:b.amount+' USD',exact:true});await amount().fill('1234');
  await page.keyboard.press('Escape');const discard=page.getByRole('dialog').filter({hasText:b.discardConditions});await discard.waitFor();await discard.getByRole('button').last().click();await dialog.waitFor({state:'hidden'});
  assert.match(await summary.innerText(),/1,000/);assert.equal(await save.isDisabled(),true);assert.equal(writes.length,0);
  await summary.click();await amount().fill('1234');await dialog.getByRole('button',{name:b.apply,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.match(await summary.innerText(),/1,234/);assert.match(await summary.innerText(),/1,000,000/);assert.equal(writes.length,0);assert.equal(await save.isEnabled(),true);
  await summary.click();await amount().fill('6000');assert.equal(await dialog.getByRole('button',{name:b.apply,exact:true}).isDisabled(),true);await amount().fill('1234');await dialog.getByRole('button',{name:b.apply,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await save.click();await page.waitForFunction(()=>document.querySelector('[data-condition-summary]')?.textContent.includes('1,234')&&!document.querySelector('[role="dialog"]'));assert.equal(writes.length,1);
  const rules=writes[0].changes[0].settings.rules;assert.equal(rules.find(row=>row.currency==='USD'&&row.min==='0').max,'1234');assert.equal(rules.filter(row=>row.currency==='USD')[1].min,'1234.01');assert.equal(rules.some(row=>row.currency==='KRW'),false,'untouched fallback currency is not materialized into a new policy');assert.equal(writes[0].changes[0].settings.limits.KRW.senior,'1000000');assert.equal(writes[0].changes.length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Approval conditions ko/en/vi desktop/mobile: compact summaries, scoped modal drafts/discard, boundary validation, independent currencies and one explicit page save passed.');
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
