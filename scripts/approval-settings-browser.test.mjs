import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/approval-settings-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Settings from '/src/pages/App/ApprovalSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings))));</script></body></html>`);
const port=43219,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-settings-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];let saved;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const settings={limits:{VND:{senior:'20000000',lead:'100000000'},USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'}},seniorGradeId:10,leadGradeId:20,seniorEmployeeId:2,leadEmployeeId:3,adminEmployeeId:4};
  const data={settings,drafter:{id:1,name:'Current user',orgRole:'ADMIN'},canEdit:true,grades:[{id:10,name:'Senior',nameEn:'Senior'},{id:20,name:'Lead',nameEn:'Lead'}],candidates:[{id:2,name:'Senior accountant',orgRole:'ACCOUNTANT',gradeId:10},{id:3,name:'Lead accountant',orgRole:'ACCOUNTANT',gradeId:20},{id:4,name:'Administrator',orgRole:'ADMIN'}]};
  await page.route('**/expense-approval-settings?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='PUT'){saved=r.request().postDataJSON();return r.fulfill({headers,json:{ok:true}});}return r.fulfill({headers,json:data});});
  await page.goto(`http://127.0.0.1:${port}/approval-settings-acceptance.html`);
  const t=approvalSettingsText[lang];
  await page.getByRole('heading',{name:t.title,exact:true}).waitFor();
  assert.equal(await page.getByLabel(t.drafter,{exact:true}).count(),0);assert.equal(await page.getByRole('combobox').count(),0);assert.equal(await page.getByRole('textbox').count(),6);
  const limit=page.getByLabel(`${t.senior} · ${t.limit} (VND)`,{exact:true});await limit.fill('25000000');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();
  assert.equal(saved.limits.VND.senior,'25000000');assert.equal(saved.limits.VND.lead,'100000000');assert.deepEqual(Object.keys(saved),['limits']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile approval settings, only editable currency limits, no person or grade controls, limits-only payload and explicit save.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
