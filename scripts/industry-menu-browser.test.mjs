import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {subscriberAccessText} from '../frontend/src/constants/subscriberAccess.js';
import {accessPolicyLayoutText} from '../frontend/src/constants/accessPolicyLayout.js';
const canonicalPaths=[...new Set([...readFileSync('frontend/src/utils/companyMenuLayout.mjs','utf8').split('export function')[0].matchAll(/'(\/[^']+)'/g)].map(match=>match[1]))].filter(path=>!path.startsWith('/system-'));
const file='frontend/industry-menu-acceptance.html';assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/system/AccessPolicyBoard';import{MenuBlueprintContext}from'/src/context/MenuBlueprintContext';
const menu=[{isParent:true,menuGroupKey:'INVENTORY',label:'Inventory',children:[{path:'/inventory/materials',label:'/inventory/materials'},{path:'/inventory/settings',label:'/inventory/settings'}]},{label:'Dashboard',path:'/dashboard'},{label:'Business',path:'/business'},{isParent:true,menuGroupKey:'LOGISTICS',label:'Logistics',children:[{label:'Shipping',path:'/shipping'}]},{isParent:true,menuGroupKey:'ORDER',label:'Sales',children:[{label:'Styles',path:'/style'}]},{label:'Expense',path:'/outsourcing-record'},{label:'Approvals',path:'/approval-settings'},{label:'Bank',path:'/bank-ledger'},{label:'Personal',path:'/personal-settings'}];
const collect=nodes=>nodes.flatMap(n=>n.children?collect(n.children):[n.path]);for(const path of ${JSON.stringify(canonicalPaths)})if(!collect(menu).includes(path))menu.push({path,label:path,...(path==='/business-partner'?{accessChildren:['/customer','/outsourcing-partner','/material-supplier','/logistics-partner'].map(path=>({path,label:path}))}:{})});
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
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`import {getDefaultRoleAccessPolicy,getPolicyFeatures} from '/src/utils/roleAccessPolicyCore.mjs';import {SERVICE_FEATURES} from '/src/utils/serviceCompany.mjs';export const activateRequestScope=()=>{};export const deactivateRequestScope=()=>{};
export const requestJSON=async(url,options={})=>{
 (window.called??=[]).push(url);window.menus??=JSON.parse(localStorage.getItem('menus')||'null')||{revision:0,industries:{9:['DASHBOARD','BUSINESS','STYLE']},subscribers:{MANUFACTURER:['DASHBOARD','BUSINESS','STYLE','BANK_LEDGER','OUTSOURCING_RECORD','APPROVAL_SETTINGS'],SERVICE:['DASHBOARD','BUSINESS','FREIGHT','BANK_LEDGER','OUTSOURCING_RECORD','APPROVAL_SETTINGS']},features:['DASHBOARD','BUSINESS','FREIGHT','STYLE','BANK_LEDGER','OUTSOURCING_RECORD','APPROVAL_SETTINGS','CUSTOMER'],required:['DASHBOARD','BUSINESS']};window.menus.features=getPolicyFeatures();if(window.menus.revision===0){window.menus.subscribers.MANUFACTURER=getPolicyFeatures().filter(key=>key!=='FREIGHT');window.menus.subscribers.SERVICE=SERVICE_FEATURES;}window.roles??=JSON.parse(localStorage.getItem('roles')||'null')||getDefaultRoleAccessPolicy();
 if(url.includes('industry-menu-policy')){if(options.method==='PUT'){window.lastMenus=JSON.parse(options.body);if(window.failMenus){const e=Error('conflict');e.status=409;throw e;}window.menus={...window.menus,...window.lastMenus,revision:window.menus.revision+1};localStorage.setItem('menus',JSON.stringify(window.menus));}return structuredClone(window.menus);}
 if(options.method==='PUT'){window.roleSaves=(window.roleSaves||0)+1;window.lastRoles=JSON.parse(options.body);window.roles=window.lastRoles.policy;localStorage.setItem('roles',JSON.stringify(window.roles));}return {policy:structuredClone(window.roles)};
};`}));
  await page.goto('http://127.0.0.1:43292/industry-menu-acceptance.html');
  const row=path=>page.locator(`[data-menu-path="${path}"]`);
  const availability=path=>row(path).getByRole('button').first();
  await row('/style').waitFor();await page.waitForFunction(()=>window.called.includes('/system/access-policy'));
  assert.equal(await page.getByRole('tab').count(),2);
  const expected={ko:['관리자','운영자','회계','직원'],en:['Administrator','Operator','Accountant','Worker'],vi:['Quản trị','Điều hành','Kế toán','Nhân viên']}[language];
  assert.deepEqual((await page.getByRole('columnheader').allTextContents()).slice(2),expected);
  assert.equal(await row('/bank-ledger').getByRole('switch').count(),4);
  assert.equal(await availability('/personal-settings').getAttribute('aria-pressed'),'true');assert.equal(await availability('/personal-settings').isDisabled(),true);
  const buttonStyle=button=>button.evaluate(el=>{const s=getComputedStyle(el);return {height:s.height,color:s.color,background:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow};});
  await page.waitForTimeout(300);
  const enabledStyle=await buttonStyle(availability('/style'));
  assert.equal(enabledStyle.height,'28px');assert.equal(enabledStyle.shadow,'none');
  assert.deepEqual(await buttonStyle(availability('/personal-settings')),enabledStyle,'personal settings uses the same active appearance');
  for(const toggle of await row('/personal-settings').getByRole('switch').all()){assert.equal(await toggle.isChecked(),true);assert.equal(await toggle.isDisabled(),true);}
  await row('/outsourcing-record').getByRole('switch').nth(2).check();
  assert.equal(await row('/approval-settings').getByRole('switch').nth(2).isChecked(),false);
  await row('/approval-settings').getByRole('switch').nth(2).check();
  await row('/outsourcing-record').getByRole('switch').nth(2).uncheck();
  assert.equal(await row('/approval-settings').getByRole('switch').nth(2).isChecked(),true);
  await availability('/outsourcing-record').click();
  assert.equal(await availability('/approval-settings').getAttribute('aria-pressed'),'true');
  await availability('/outsourcing-record').click();
  if(language==='ko'&&width===1440){
   const snapshot=()=>page.locator('[data-menu-path]').evaluateAll(rows=>Object.fromEntries(rows.map(r=>[r.dataset.menuPath,{enabled:r.querySelector('button[aria-pressed]').getAttribute('aria-pressed'),roles:[...r.querySelectorAll('input[role="switch"]')].map(i=>i.checked)}])));
   for(const tab of [t.factory,t.logistics]){
    await page.getByRole('tab',{name:tab,exact:true}).click();
    for(const path of await page.locator('[data-menu-path]').evaluateAll(rows=>rows.map(r=>r.dataset.menuPath))){
     if(await availability(path).isDisabled())continue;
     let before=await snapshot();await availability(path).dispatchEvent('click');let after=await snapshot();for(const other of Object.keys(before))if(other!==path)assert.deepEqual(after[other],before[other],path+' availability changed '+other);await availability(path).dispatchEvent('click');
     for(let index=0;index<4;index++){const toggle=row(path).getByRole('switch').nth(index);if(await toggle.isDisabled())continue;before=await snapshot();await toggle.evaluate(el=>el.click());await page.waitForFunction(({path,index,value})=>[...document.querySelectorAll('[data-menu-path]')].find(r=>r.dataset.menuPath===path).querySelectorAll('input[role="switch"]')[index].checked===value,{path,index,value:!before[path].roles[index]});after=await snapshot();for(const other of Object.keys(before))if(other!==path)assert.deepEqual(after[other],before[other],path+' role changed '+other);await toggle.evaluate(el=>el.click());await page.waitForFunction(({path,index,value})=>[...document.querySelectorAll('[data-menu-path]')].find(r=>r.dataset.menuPath===path).querySelectorAll('input[role="switch"]')[index].checked===value,{path,index,value:before[path].roles[index]});}
    }
   }
   await page.getByRole('tab',{name:t.factory,exact:true}).click();console.log('PASS every menu and role independently for both industries');
  }
  const activeColor=await row('/style').evaluate(el=>getComputedStyle(el).backgroundColor);
  await availability('/style').click();assert.notEqual(await row('/style').evaluate(el=>getComputedStyle(el).backgroundColor),activeColor);assert.equal(await row('/style').getByRole('switch').nth(0).isDisabled(),true);
  await page.getByRole('tab',{name:t.logistics,exact:true}).click();
  assert.equal(await row('/style').count(),1);assert.equal(await availability('/style').isDisabled(),true);
  await row('/bank-ledger').getByRole('switch').nth(0).uncheck();
  await availability('/shipping').click();
  const save=page.getByRole('button',{name:l.save,exact:true});await save.click();await page.waitForFunction(()=>window.lastRoles);
  assert.equal(await page.evaluate(()=>window.lastMenus.subscribers.MANUFACTURER.includes('STYLE')),false);
  assert.equal(await page.evaluate(()=>window.lastMenus.subscribers.SERVICE.includes('SHIPPING_REQUEST')),false);
  assert.equal(await page.evaluate(()=>window.lastRoles.policy.SERVICE.ADMIN.includes('BANK_LEDGER')),false);
  assert.equal(await page.evaluate(()=>window.lastRoles.policy.MANUFACTURER.ADMIN.includes('BANK_LEDGER')),true);
  await page.reload();await row('/style').waitFor();assert.equal(await row('/approval-settings').getByRole('switch').nth(2).isChecked(),true);assert.equal(await row('/outsourcing-record').getByRole('switch').nth(2).isChecked(),false);assert.equal(await availability('/style').getAttribute('aria-pressed'),'false');
  await availability('/style').click();await page.evaluate(()=>window.failMenus=true);await save.click();await page.waitForTimeout(150);
  assert.equal(await availability('/style').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>window.failMenus=false);await save.click();await page.waitForFunction(()=>window.menus.subscribers.MANUFACTURER.includes('STYLE'));
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.close();
 }

 console.log('PASS industry tabs and role permissions: ko/en/vi PC/mobile, shared menu rows, availability and role toggles, draft preservation, save/reload and retry.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
