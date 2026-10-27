import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/customer-order-price-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import CustomerList from'/src/pages/App/customer/CustomerList.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(MemoryRouter,{initialEntries:['/business-partner']},React.createElement(CustomerList,{embedded:true}))));</script></body></html>`);
const port=43240,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/customer-order-price-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:()=>{}};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
  let missing=1,reads=0;
  await page.route('**/customers?*',r=>{reads++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[{id:1,name:'THE SAN',code:'TSKR',missingSalesPriceStyleCount:missing,hasUsageHistory:true}]});});
  await page.goto(`http://127.0.0.1:${port}/customer-order-price-acceptance.html`);
  const row=page.locator('tbody tr').filter({hasText:'THE SAN'});await row.waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('tbody [aria-label="attention"]').length===1);
  const emit=orgId=>page.evaluate(orgId=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId,topics:['orders']}})),orgId);
  missing=0;await emit(1);
  await page.waitForFunction(()=>document.querySelectorAll('tbody span[aria-label]').length===0);
  missing=1;await emit(1);
  await page.waitForFunction(()=>document.querySelectorAll('tbody [aria-label="attention"]').length===1);
  const before=reads;await emit(9);await page.waitForTimeout(100);assert.equal(reads,before);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Customer price warning passed ko/en/vi: order changes refresh both indicators, complete pricing clears them, foreign org events ignored.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
