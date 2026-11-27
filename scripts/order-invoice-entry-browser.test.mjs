import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const filename = 'order-invoice-entry-test.html';
const fixture = 'frontend/' + filename;
const origin = 'http://127.0.0.1:43521';
const apiOrigin = 'http://127.0.0.1:43522';
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import theme from '/src/theme';
import OrderList from '/src/pages/App/order/OrderList.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, { theme },
  React.createElement(CssBaseline),
  React.createElement(MemoryRouter, { initialEntries: ['/order/order-1'] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/order/:orderId', element: React.createElement(OrderList) }))
  )
));
</script>`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '43521', '--strictPort'], {
  cwd: 'frontend', stdio: 'ignore', windowsHide: true, env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
});

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin + '/' + filename)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const stubContext = (name, body) => page.route(`**/src/context/${name}.jsx*`, route => route.fulfill({ contentType: 'application/javascript', body }));
  await stubContext('AuthContext', 'const profile={entryType:"ORG",orgType:"MANUFACTURER",orgRole:"ADMIN"};const auth={isAuthenticated:true,activeOrgId:1,activeProfile:profile,accessProfile:profile};export const useAuth=()=>auth;');
  await stubContext('LanguageContext', 'import React from "/node_modules/.vite/deps/react.js";export const LanguageContext=React.createContext({languageCode:"en"});export const useLanguage=()=>({languageCode:"en"});');
  await stubContext('AppContext', 'const noop=()=>{};const actions={navigateToPath:path=>window.invoicePath=path,showNotification:noop,markTabChanged:noop,clearTabChanged:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;export const useAppState=()=>({});');

  let otherSeller=false;
  const buyer={id:2,name:'Test buyer'},seller={id:1,name:'Test seller'};
  await page.route(url=>url.origin===apiOrigin,route=>{
    const {pathname}=new URL(route.request().url());let json=[];
    if(pathname==='/orders')json=[{id:'order-1',orderNumber:'PO-1',buyerOrgId:2,sellerOrgId:otherSeller?3:1,items:[]}];
    if(pathname==='/order-parties')json={buyerOrgOptions:[buyer],sellerOrgOptions:[seller],currentOrg:seller,roleHint:'MANUFACTURER',relationshipPairs:[{brandOrgId:2,manufacturerOrgId:1}]};
    return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json});
  });
  await page.goto(origin+'/'+filename);
  const create=page.getByRole('button',{name:'Create invoice',exact:true});try{await create.waitFor({timeout:10000});}catch(error){throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()}));}
  assert.equal(await create.isEnabled(),true);
  await create.click();assert.equal(await page.evaluate(()=>window.invoicePath),'/invoices/new/order/order-1');
  const number=page.locator('input[value="PO-1"]');await number.fill('Edited order');assert.equal(await create.isEnabled(),false,'Unsaved order changes must be saved first');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await create.isVisible(),true);}
  otherSeller=true;await page.goto(origin+'/'+filename);await page.locator('input[value="PO-1"]').waitFor();assert.equal(await create.count(),0,'Another seller cannot create our invoice');
  otherSeller=false;
  await stubContext('AuthContext','const profile={entryType:"ORG",orgType:"MANUFACTURER",orgRole:"ADMIN",industryMenuFeatures:["ORDER"]};export const useAuth=()=>({isAuthenticated:true,activeOrgId:1,activeProfile:profile,accessProfile:profile});');
  await page.goto(origin+'/'+filename);await page.locator('input[value="PO-1"]').waitFor();assert.equal(await create.count(),0,'Saved menu restrictions remain effective');
  assert.deepEqual(errors,[]);console.log('PASS order invoice action: actual seller, direct order route, dirty protection, desktop/mobile.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
