import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {industryMenuText} from '../frontend/src/constants/industryMenu.js';
const fixture=path.resolve('frontend/industry-menu-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Editor from'/src/pages/App/system/IndustryMenuSettings.jsx';import{MenuBlueprintContext}from'/src/context/MenuBlueprintContext.jsx';const menu=[{label:'Dashboard',path:'/dashboard'},{label:'Business',path:'/business'},{label:'Freight',path:'/freight'},{label:'Styles',path:'/style'}];createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(MenuBlueprintContext.Provider,{value:menu},React.createElement(Editor)))));</script></body></html>`);
const port=43292,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/industry-menu-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390]){
  const t=industryMenuText[language],page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:message=>{window.toast=message;},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const activateRequestScope=()=>{};export const deactivateRequestScope=()=>{};export const requestJSON=async(url,options={})=>{window.policy??={revision:0,industries:{},catalogue:[{id:1,nameEn:'Forwarder',nameKo:'Forwarder',nameVi:'Forwarder',partnerRole:{nameEn:'Logistics',nameKo:'Logistics',nameVi:'Logistics'}},{id:2,nameEn:'Garment',nameKo:'Garment',nameVi:'Garment',partnerRole:{nameEn:'Apparel',nameKo:'Apparel',nameVi:'Apparel'}}],features:['DASHBOARD','BUSINESS','FREIGHT','STYLE'],required:['DASHBOARD','BUSINESS']};if(options.method==='PUT'){window.lastBody=JSON.parse(options.body);if(window.failSave){const error=Error('conflict');error.status=409;throw error;}window.policy={...window.policy,...window.lastBody,revision:window.lastBody.revision+1};}return structuredClone(window.policy);};`}));
  await page.goto(`http://127.0.0.1:${port}/industry-menu-acceptance.html`);
  const save=page.getByRole('button',{name:t.save,exact:true});await page.getByRole('textbox',{name:t.industry}).waitFor();await page.waitForFunction(()=>window.policy);
  assert.equal(await save.isDisabled(),true);
  await page.getByRole('switch',{name:t.custom}).check();await page.getByRole('switch',{name:'Styles',exact:true}).uncheck();assert.equal(await save.isEnabled(),true);
  await page.getByRole('textbox',{name:t.industry}).fill('Apparel > Garment');await page.getByRole('textbox',{name:t.industry}).press('Enter');
  await page.getByRole('switch',{name:t.custom}).check();await page.getByRole('switch',{name:'Freight',exact:true}).uncheck();
  assert.equal(await page.getByRole('switch',{name:'Business',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.failSave=true);await save.click();await page.getByText(t.conflict,{exact:true}).waitFor();assert.equal(await save.isEnabled(),true);
  await page.evaluate(()=>window.failSave=false);await save.click();await page.waitForFunction(()=>window.toast);assert.equal(await save.isDisabled(),true);
  const sent=await page.evaluate(()=>window.lastBody);assert.deepEqual(sent.industries['1'],['DASHBOARD','BUSINESS','FREIGHT']);assert.deepEqual(sent.industries['2'],['DASHBOARD','BUSINESS','STYLE']);
  await page.getByRole('switch',{name:t.custom}).uncheck();assert.equal(await save.isEnabled(),true);await save.click();await page.waitForFunction(()=>!Object.hasOwn(window.policy.industries,'2'));assert.equal(await save.isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile industry menu selection, cross-industry drafts, revision conflict, retry, save and inheritance reset.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
