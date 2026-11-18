import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/inventory-layout-acceptance.html',port=43495;
assert.ok(!existsSync(html));
writeFileSync(html,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{LanguageProvider}from'/src/context/LanguageContext';import{AppProvider}from'/src/context/AppContext';import{PageNamingProvider}from'/src/context/PageNamingContext';import Page from'/src/pages/App/inventory/InventoryWorkspace';const view=new URLSearchParams(location.search).get('view'),path='/inventory/'+(view==='stock'?'stock':'materials');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(LanguageProvider,null,React.createElement(AppProvider,null,React.createElement(PageNamingProvider,{path},React.createElement(Page,{view})))))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/inventory-layout-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const view of ['stock','materials']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT','DELETE','PATCH'].includes(r.method()))writes.push(r.url());});
  await page.addInitScript(lang=>localStorage.setItem('baro_language_override',lang),lang);
  await page.goto(`http://127.0.0.1:${port}/inventory-layout-acceptance.html?view=${view}`);
  const expected=await page.evaluate(async({lang,view})=>{const {getUiMessage}=await import('/src/constants/uiMessages.js');return getUiMessage('menu.'+(view==='materials'?'materials':'inventoryStock'),'',lang);},{lang,view});
  await page.getByRole('heading',{name:expected,exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),3);
  if(view==='stock'){
   assert.equal(await page.locator('.MuiCard-root').count(),0,'stock is a quantity table, not fixed summary cards');
   assert.equal(await page.locator('[data-inventory-stock] thead tr').count(),2);
   assert.equal((await page.locator('[data-stock-available]').first().textContent()).replaceAll(',',''),'2200');
  }
  await page.locator('[data-search-input] input').fill('HANIL');assert.equal(await page.locator('tbody tr').count(),1);
  await page.locator('[data-search-reset]').click();assert.equal(await page.locator('tbody tr').count(),3);
  const names=await page.evaluate(async lang=>{const {getUiMessage}=await import('/src/constants/uiMessages.js');const {resolvePageNaming}=await import('/src/utils/pageNaming.mjs');return ['/inventory/materials','/inventory/movements','/inventory/settings'].map(path=>resolvePageNaming(path,lang,key=>getUiMessage(key,key,lang)));},lang);
  assert.ok(names.every(n=>n.title===n.menuLabel),'menu/tab/heading use one name without appending list twice');
  if(lang==='ko')assert.deepEqual(names.map(n=>n.title),['자재 목록','입출고','자재 기준정보']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'wide table scrolls inside the page');
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close();console.log('PASS inventory layout',lang,width,view);
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
