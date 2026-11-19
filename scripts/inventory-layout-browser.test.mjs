import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/inventory-layout-acceptance.html',port=43495;
async function mockMaterials(page){await page.route('**/material-items**',r=>{const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};return r.fulfill({headers,json:url.pathname.endsWith('/catalogue')?{codes:[],units:[],colors:[]}:[1,2,3].map(n=>({id:'m'+n,baseId:n,data:{nameEn:n===3?'HANIL':'Material '+n,baseSnapshot:{code:'MAT-00000'+n},unit:{nameEn:'Each'}}}))});});}

assert.ok(!existsSync(html));
writeFileSync(html,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{LanguageProvider}from'/src/context/LanguageContext';import{AppProvider}from'/src/context/AppContext';import{PageNamingProvider}from'/src/context/PageNamingContext';import Page from'/src/pages/App/inventory/InventoryWorkspace';const view=new URLSearchParams(location.search).get('view'),path='/inventory/'+(view==='stock'?'stock':view==='settings'?'settings':'materials');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(LanguageProvider,null,React.createElement(AppProvider,null,React.createElement(PageNamingProvider,{path},React.createElement(Page,{view})))))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/inventory-layout-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const view of ['stock','materials']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT','DELETE','PATCH'].includes(r.method()))writes.push(r.url());});
  await page.addInitScript(lang=>localStorage.setItem('baro_language_override',lang),lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import{getDefaultRoleAccessPolicy}from'/src/utils/roleAccessPolicyCore.mjs';const policy=getDefaultRoleAccessPolicy(),rights=new URLSearchParams(location.search).get('rights');policy.__schemaVersion=19;if(rights)policy.MANUFACTURER.ADMIN=policy.MANUFACTURER.ADMIN.filter(key=>key!==(rights==='list'?'INVENTORY_SETTINGS':'INVENTORY_MATERIALS'));const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:1,accessPolicy:policy};export const useAuth=()=>({isAuthenticated:true,user:{id:'admin'},activeProfile:profile,accessProfile:profile,activeOrgId:1,activeOrgRole:'ADMIN',activeOrgType:'MANUFACTURER'});`}));
  await mockMaterials(page);await page.goto(`http://127.0.0.1:${port}/inventory-layout-acceptance.html?view=${view}`);
  const expected=await page.evaluate(async({lang,view})=>{const {getUiMessage}=await import('/src/constants/uiMessages.js');return getUiMessage('menu.'+(view==='materials'?'materials':'inventoryStock'),'',lang);},{lang,view});
  await page.getByRole('heading',{name:expected,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===3);assert.equal(await page.locator('tbody tr').count(),3);
  if(view==='stock'){
   assert.equal(await page.locator('.MuiCard-root').count(),0,'stock is a quantity table, not fixed summary cards');
   assert.equal(await page.locator('[data-inventory-stock] thead tr').count(),2);
   assert.equal((await page.locator('[data-stock-available]').first().textContent()).replaceAll(',',''),'2200');
  }
  await page.locator('[data-search-input] input').fill('HANIL');assert.equal(await page.locator('tbody tr').count(),1);
  await page.locator('[data-search-reset]').click();assert.equal(await page.locator('tbody tr').count(),3);
  const names=await page.evaluate(async lang=>{const {getUiMessage}=await import('/src/constants/uiMessages.js');const {resolvePageNaming}=await import('/src/utils/pageNaming.mjs');return ['/inventory/materials','/inventory/movements','/inventory/settings'].map(path=>resolvePageNaming(path,lang,key=>getUiMessage(key,key,lang)));},lang);
  assert.ok(names.slice(0,2).every(n=>n.title===n.menuLabel),'menu/tab/heading use one name without appending list twice');
  assert.equal(names[2].title,names[0].title,'legacy reference URL opens the merged material screen');
  if(lang==='ko')assert.deepEqual(names.map(n=>n.title),['자재 목록','입출고','자재 목록']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'wide table scrolls inside the page');
  if(view==='materials'){assert.equal(await page.getByRole('tab').count(),0);assert.equal(await page.locator('[data-material-master-tabs]').count(),0);assert.equal(await page.getByRole('cell',{name:'MAT-000001',exact:true}).count(),1);}
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close();console.log('PASS inventory layout',lang,width,view);
 }
 for(const rights of ['list','reference']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.addInitScript(()=>localStorage.setItem('baro_language_override','en'));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import{getDefaultRoleAccessPolicy}from'/src/utils/roleAccessPolicyCore.mjs';const policy=getDefaultRoleAccessPolicy(),rights=new URLSearchParams(location.search).get('rights');policy.__schemaVersion=19;policy.MANUFACTURER.ADMIN=policy.MANUFACTURER.ADMIN.filter(key=>key!==(rights==='list'?'INVENTORY_SETTINGS':'INVENTORY_MATERIALS'));const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:1,accessPolicy:policy};export const useAuth=()=>({isAuthenticated:true,user:{id:'admin'},activeProfile:profile,accessProfile:profile,activeOrgId:1,activeOrgRole:'ADMIN',activeOrgType:'MANUFACTURER'});`}));
  await mockMaterials(page);await page.goto(`http://127.0.0.1:${port}/inventory-layout-acceptance.html?view=${rights==='list'?'materials':'settings'}&rights=${rights}`);
  assert.equal(await page.locator('[data-material-master-tabs]').count(),0);await page.getByRole('cell',{name:rights==='list'?'MAT-000001':'FABRIC',exact:true}).waitFor();assert.equal(await page.getByRole('cell',{name:rights==='list'?'FABRIC':'MAT-000001',exact:true}).count(),0);await page.close();console.log('PASS independent material permissions',rights);
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
