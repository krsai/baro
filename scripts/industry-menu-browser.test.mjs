import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {subscriberAccessText} from '../frontend/src/constants/subscriberAccess.js';
import {accessPolicyLayoutText} from '../frontend/src/constants/accessPolicyLayout.js';
const file='frontend/industry-menu-acceptance.html';assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/system/AccessPolicyBoard';import{MenuBlueprintContext}from'/src/context/MenuBlueprintContext';
const menu=[{label:'Dashboard',path:'/dashboard'},{label:'Business',path:'/business'},{label:'Shipping',path:'/shipping'},{isParent:true,menuGroupKey:'ORDER',label:'Sales',children:[{label:'Styles',path:'/style'}]},{label:'Bank',path:'/bank-ledger'}];
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(MenuBlueprintContext.Provider,{value:menu},React.createElement(Page)))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43292','--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43292/industry-menu-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390]){
  const t=subscriberAccessText[language],l=accessPolicyLayoutText[language],page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeProfile:{entryType:'SYSTEM',systemRole:'SYSTEM_ADMIN'}});"}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:(message)=>{window.notice=message;},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`import {getDefaultRoleAccessPolicy} from '/src/utils/roleAccessPolicyCore.mjs';export const activateRequestScope=()=>{};export const deactivateRequestScope=()=>{};
export const requestJSON=async(url,options={})=>{
 (window.called??=[]).push(url);window.menus??=JSON.parse(localStorage.getItem('menus')||'null')||{revision:0,industries:{9:['DASHBOARD','BUSINESS','STYLE']},subscribers:{MANUFACTURER:['DASHBOARD','BUSINESS','STYLE','BANK_LEDGER'],SERVICE:['DASHBOARD','BUSINESS','FREIGHT','BANK_LEDGER']},features:['DASHBOARD','BUSINESS','FREIGHT','STYLE','BANK_LEDGER','CUSTOMER'],required:['DASHBOARD','BUSINESS']};window.roles??=JSON.parse(localStorage.getItem('roles')||'null')||getDefaultRoleAccessPolicy();
 if(url.includes('industry-menu-policy')){if(options.method==='PUT'){window.lastMenus=JSON.parse(options.body);if(window.failMenus){const e=Error('conflict');e.status=409;throw e;}window.menus={...window.menus,...window.lastMenus,revision:window.menus.revision+1};localStorage.setItem('menus',JSON.stringify(window.menus));}return structuredClone(window.menus);}
 if(options.method==='PUT'){window.roleSaves=(window.roleSaves||0)+1;window.lastRoles=JSON.parse(options.body);window.roles=window.lastRoles.policy;localStorage.setItem('roles',JSON.stringify(window.roles));}return {policy:structuredClone(window.roles)};
};`}));
  await page.goto('http://127.0.0.1:43292/industry-menu-acceptance.html');
  const row=path=>page.locator(`[data-menu-path="${path}"]`),available=label=>page.getByRole('switch',{name:label+' '+l.provided,exact:true});
  await row('/bank-ledger').waitFor();assert.equal(await row('/style').count(),0);assert.equal(await row('/shipping').count(),1);assert.equal(await available('Bank').count(),0);
  await page.getByRole('tab',{name:l.industry,exact:true}).click();await available('Styles').waitFor();assert.equal(await row('/bank-ledger').count(),0);assert.equal(await row('/shipping').count(),0);
  await available('Styles').uncheck();assert.equal(await row('/style').getByRole('switch').nth(1).isDisabled(),true);await available('Styles').check();await row('/style').getByRole('switch').nth(1).uncheck();await available('Styles').uncheck();
  await page.getByRole('tab',{name:t.logistics,exact:true}).click();assert.equal(await row('/style').count(),0);await row('/shipping').getByRole('switch').first().uncheck();
  await page.getByRole('tab',{name:l.common,exact:true}).click();await row('/bank-ledger').getByRole('switch').first().uncheck();assert.equal(await available('Shipping').count(),0);
  await page.evaluate(()=>window.failMenus=true);await page.getByRole('button',{name:l.save,exact:true}).click();await page.getByText(t.conflict,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.roles.SERVICE.ADMIN.includes('BANK_LEDGER')),false);assert.equal(await page.evaluate(()=>window.roles.MANUFACTURER.ADMIN.includes('STYLE')),false);
  await page.getByRole('tab',{name:l.industry,exact:true}).click();assert.equal(await row('/shipping').getByRole('switch').first().isChecked(),false);await page.getByRole('tab',{name:t.factory,exact:true}).click();assert.equal(await available('Styles').isChecked(),false);
  await page.evaluate(()=>window.failMenus=false);await page.getByRole('button',{name:l.save,exact:true}).click();await page.waitForFunction(()=>window.menus.revision===1);
  const saved=await page.evaluate(()=>window.menus);assert.ok(!saved.subscribers.MANUFACTURER.includes('STYLE'));assert.ok(!saved.subscribers.SERVICE.includes('FREIGHT'));assert.deepEqual(saved.industries,{9:['DASHBOARD','BUSINESS','STYLE']});assert.ok(saved.subscribers.MANUFACTURER.includes('BANK_LEDGER'));assert.ok(saved.subscribers.SERVICE.includes('BANK_LEDGER'));assert.equal(await page.evaluate(()=>window.roleSaves),1);
  assert.equal(await page.getByRole('button',{name:l.save,exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.reload();await page.getByRole('tab',{name:l.industry,exact:true}).click();await available('Styles').waitFor();assert.equal(await available('Styles').isChecked(),false);assert.equal(await row('/style').getByRole('switch').nth(1).isChecked(),false);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS unified access policy, scope separation, retained drafts, partial save/retry, persistence and mobile',language,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);}
