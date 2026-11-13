import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {workTimeText} from '../frontend/src/constants/workTime.js';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
const html='frontend/work-time-settings-test.html',port=43386;assert.ok(!existsSync(html));
writeFileSync(html,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/ApprovalSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/approval-settings?menu=WORK_TIME']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/work-time-settings-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],bodies=[],t=workTimeText[lang],a=approvalSettingsText[lang];page.on('pageerror',e=>errors.push(e.message));
  const mock=(pattern,body)=>page.route(pattern,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
  await mock('**/src/context/AppContext.jsx*',`const noop=()=>{};export const useAppActions=()=>({showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,navigateToPath:()=>{throw Error('Unexpected settings redirect');}});`);
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let settings={revision:1,drafterRoles:['ADMIN','WORKER'],proxyRoles:['ADMIN'],approverIds:[3]};
  await page.route('**/approval-action-settings?*',r=>r.fulfill({headers,json:{canEdit:true,settings,managers:[{id:3,name:'Manager',employeeNo:'M001',orgRole:'ADMIN'}]}}));
  await page.route('**/approval-action-settings/batch?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   const body=r.request().postDataJSON();bodies.push(body);
   if(bodies.length===1)return r.fulfill({headers,status:409,json:{error:'WORK_TIME_POLICY_CHANGED'}});
   settings={...body.changes[0].settings,revision:2};return r.fulfill({headers,json:{saved:[{menu:'WORK_TIME',operation:'CREATE',settings}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/work-time-settings-test.html`);
  const editor=page.getByTestId('work-time-approval-settings');await editor.getByText(approvalBandText[lang].line,{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('button',{name:a.save,exact:true}).count(),1);
  const stages=editor.locator('[data-work-time-stage]');assert.equal(await stages.count(),1);
  await editor.getByRole('button',{name:t.add,exact:true}).click();assert.equal(await stages.count(),2);
  assert.equal(await page.getByRole('button',{name:a.save,exact:true}).isDisabled(),true);
  if(width===1440){await stages.first().locator('[data-work-time-stage-handle]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await page.waitForTimeout(350);assert.equal(await stages.nth(1).locator('input').inputValue(),'Manager');await stages.first().getByRole('button',{name:t.remove,exact:true}).click();}else await stages.nth(1).getByRole('button',{name:t.remove,exact:true}).click();assert.equal(await stages.count(),1);
  const card=await stages.first().boundingBox();assert.equal(Math.round(card.width),208);assert.equal(Math.round(card.height),70);
  if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/leave-approval-settings-preview.png'});
  await editor.locator('[data-work-time-permissions]').click();let permissionDialog=page.getByRole('dialog');await permissionDialog.getByLabel(t.WORKER,{exact:true}).uncheck();await permissionDialog.getByRole('button',{name:approvalBandText[lang].apply,exact:true}).click();await page.getByRole('button',{name:a.save,exact:true}).click();await page.getByRole('alert').waitFor();await editor.locator('[data-work-time-permissions]').click();permissionDialog=page.getByRole('dialog');assert.equal(await permissionDialog.getByLabel(t.WORKER,{exact:true}).isChecked(),false);await permissionDialog.getByRole('button',{name:approvalBandText[lang].apply,exact:true}).click();
  await page.getByRole('button',{name:a.save,exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.disabled&&button.textContent));
  assert.equal(bodies.length,2);assert.deepEqual(bodies[1].changes,[{menu:'WORK_TIME',operation:'CREATE',settings:{revision:1,drafterRoles:['ADMIN'],proxyRoles:['ADMIN'],approverIds:[3]}}]);
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Central leave approval settings passed: ko/en/vi desktop/mobile, shared condition/flow layout and cards, permission editor, existing policy, one top save and conflict draft retention.');
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
