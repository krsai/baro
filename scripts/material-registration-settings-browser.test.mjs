import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {materialRegistrationText} from '../frontend/src/constants/materialRegistration.js';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
const file='frontend/material-registration-settings-test.html',port=43567;assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Settings from'/src/pages/App/ApprovalSettings';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/approval-settings?menu=MATERIAL']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${file.split('/')[1]}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],t=materialRegistrationText[lang],a=approvalSettingsText[lang],b=approvalBandText[lang];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const n=()=>{};export const useAppActions=()=>({showNotification:n,setUnsavedChangesGuard:n,clearUnsavedChangesGuard:n});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let policy={version:2,revision:0,drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],stages:[{role:'ADMIN',gradeMatch:'ANY',gradeId:null}]};
  await page.route('**/approval-action-settings?*',r=>{const url=new URL(r.request().url());assert.equal(url.searchParams.get('menu'),'MATERIAL');assert.equal(url.searchParams.get('operation'),'CREATE');return r.fulfill({headers,json:{canEdit:true,settings:policy,grades:[],managers:[]}});});
  await page.route('**/approval-action-settings/batch?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});const body=r.request().postDataJSON();writes.push(body);policy={...body.changes[0].settings,revision:1};return r.fulfill({headers,json:{saved:[{menu:'MATERIAL',operation:'CREATE',settings:policy}]}});});
  await page.goto(`http://127.0.0.1:${port}/${file.split('/')[1]}`);await page.locator('[data-inventory-stage="0"]').waitFor();
  assert.ok((await page.locator('[data-testid="approval-settings-page"]').innerText()).includes(t.title));
  const save=page.getByRole('button',{name:a.save,exact:true});assert.equal(await save.isDisabled(),true);
  await page.getByRole('button',{name:b.addMiddle,exact:true}).click();await page.locator('[data-inventory-stage="1"]').waitFor();await save.click();
  await page.waitForResponse(r=>r.url().includes('/approval-action-settings?')&&r.status()===200);assert.equal(writes.length,1);assert.equal(writes[0].changes.length,1);assert.equal(writes[0].changes[0].menu,'MATERIAL');assert.equal(writes[0].changes[0].settings.stages.at(-1).role,'ADMIN');
  await page.locator('[data-inventory-stage="1"]').getByRole('button',{name:b.remove,exact:true}).click();assert.equal(await save.isDisabled(),true,'a non-admin final stage cannot be saved');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS central material approval settings/save/final-admin validation ko/en/vi desktop/mobile');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
