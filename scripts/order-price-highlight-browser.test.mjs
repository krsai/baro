import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/order-price-highlight-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Board from'/src/pages/App/customer/CustomerPricingBoard.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/customer-pricing']},React.createElement(Board))));</script></body></html>`);
const port=43247,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/order-price-highlight-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];let changed=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/customers**',r=>{
   const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*'};
   if(url.pathname==='/customers')return r.fulfill({headers,json:[{id:1,name:'Customer'}]});
   if(url.pathname.endsWith('/quantity-buckets'))return r.fulfill({headers,json:{defaultVersion:{id:1,quantities:[1,50,100,200]},styles:[{id:1,name:'Partial',orderQuantities:changed?[250]:[60]},{id:2,name:'Complete',orderQuantities:[150]},{id:3,name:'No orders',orderQuantities:[]},{id:4,name:'Two orders',orderQuantities:[60,150]}].map(style=>({...style,source:'CUSTOMER_DEFAULT',version:{id:1,quantities:[1,50,100,200]}}))}});
   if(url.pathname.endsWith('/sales-currencies'))return r.fulfill({headers,json:{defaultCurrencyCode:'USD',styleOverrides:[{styleId:4,currencyCode:'KRW'}]}});
   if(url.pathname.endsWith('/sales-prices'))return r.fulfill({headers,json:{styles:url.searchParams.get('currencyCode')==='USD'?[{styleId:1,prices:[{bucketQuantity:1,unitPrice:'2'}]},{styleId:2,prices:[{bucketQuantity:100,unitPrice:'5'}]},{styleId:4,prices:[{bucketQuantity:50,unitPrice:'9'}]}]:[]}});
   throw Error('Unexpected request '+url.pathname);
  });
  await page.goto(`http://127.0.0.1:${port}/order-price-highlight-acceptance.html`);
  const row=name=>page.locator('tbody tr').filter({hasText:name});
  const cell=(name,quantity)=>row(name).locator('td').nth(2+[1,50,100,200].indexOf(quantity));
  await page.waitForFunction(()=>document.querySelectorAll('[data-required-price-missing]').length===3);
  assert.equal(await cell('Partial',50).getAttribute('data-required-price-missing'),'true');
  assert.equal(await cell('Partial',100).getAttribute('data-required-price-missing'),null);
  assert.equal(await cell('Complete',100).getAttribute('data-required-price-missing'),null);
  assert.equal(await row('No orders').locator('[data-required-price-missing]').count(),0);
  assert.equal(await row('Two orders').locator('[data-required-price-missing]').count(),2,'An unrelated USD price cannot satisfy the selected KRW row');
  assert.equal(await cell('Partial',50).evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 246, 219)');
  await cell('Partial',50).locator('input').fill('3');
  assert.equal(await cell('Partial',50).getAttribute('data-required-price-missing'),null);
  await cell('Partial',1).locator('input').click();
  await cell('Partial',1).locator('input').fill('4');
  changed=true;
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:['orders']}})));
  await page.waitForFunction(()=>document.querySelector('input[aria-label^="Partial 200 "]')?.closest('td')?.dataset.requiredPriceMissing==='true');
  assert.equal(await cell('Partial',200).getAttribute('data-required-price-missing'),'true');
  assert.equal(Number((await cell('Partial',50).locator('input').inputValue()).replace(',','.')),3);
  assert.equal(Number(await cell('Partial',1).locator('input').inputValue()),4,'Refreshing order evidence must preserve unsaved prices');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Ordered price highlight passed ko/en/vi: exact tiers, palette background, per-row currency, no-order exclusions, typing and order refresh preserve drafts.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
