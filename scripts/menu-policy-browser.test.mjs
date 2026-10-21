import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';

const layout=readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
assert.match(layout,/<MenuBlueprintContext.Provider value=\{accessPolicyMenuBlueprint\}>/);
assert.match(layout,/menuStructureBlueprint[\s\S]*\.filter/);
assert.doesNotMatch(layout,/__BARO_MENU_BLUEPRINT__|baro:menu-blueprint-updated/);
const accounting=layout.slice(layout.indexOf("label: getUiMessage('menu.accounting'"),layout.indexOf("label: getUiMessage('menu.organization'"));
assert.ok(accounting.indexOf("path: '/invoices'")<accounting.indexOf("path: '/outsourcing-record'"));
assert.ok(accounting.includes("path: '/payroll'"));
const fixture=path.resolve('frontend/menu-policy-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {MenuBlueprintContext} from '/src/context/MenuBlueprintContext.jsx';import Board from '/src/pages/App/system/AccessPolicyBoard.jsx';
function App(){const[moved,setMoved]=React.useState(false);const invoice={path:'/invoices',label:moved?'Renamed invoice':'Invoice'};const cost={path:'/outsourcing-record',label:'Payment request'};const tree=moved?[{isParent:true,menuGroupKey:'ACCOUNTING',label:'Accounting',children:[cost,invoice]}]:[{isParent:true,menuGroupKey:'SALES',label:'Sales',children:[invoice]},{isParent:true,menuGroupKey:'PRODUCTION',label:'Production',children:[cost]}];return React.createElement(MemoryRouter,null,React.createElement('button',{onClick:()=>setMoved(true)},'Move menus'),React.createElement(MenuBlueprintContext.Provider,{value:tree},React.createElement(Board)));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43219,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/menu-policy-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeProfile:{entryType:"SYSTEM",systemRole:"SYSTEM_ADMIN"}});'}));
 await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
 await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
 let writes=0;
 await page.route('**/system/access-policy',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{policy:{}}});});
 await page.goto(`http://127.0.0.1:${port}/menu-policy-acceptance.html`);
 await page.getByText('Sales',{exact:true}).waitFor();
 const before=await page.locator('tbody input[type=checkbox]').evaluateAll(nodes=>nodes.map(n=>n.checked));
 const checkedByPath=async path=>page.locator('tbody tr').filter({hasText:path}).locator('input[type=checkbox]').evaluateAll(nodes=>nodes.map(n=>n.checked));
 const invoicePolicy=await checkedByPath('/invoices'),costPolicy=await checkedByPath('/outsourcing-record');
 await page.getByRole('button',{name:'Move menus'}).click();
 await page.getByText('Accounting',{exact:true}).waitFor();
 assert.equal(await page.getByText('Sales',{exact:true}).count(),0);
 assert.equal(await page.getByText('Production',{exact:true}).count(),0);
 const rows=await page.locator('tbody tr').allTextContents();
 assert.ok(rows.findIndex(s=>s.includes('Payment request'))<rows.findIndex(s=>s.includes('Renamed invoice')));
 const after=await page.locator('tbody input[type=checkbox]').evaluateAll(nodes=>nodes.map(n=>n.checked));
 assert.deepEqual(await checkedByPath('/invoices'),invoicePolicy);assert.deepEqual(await checkedByPath('/outsourcing-record'),costPolicy);
 assert.equal(after.length,before.length);assert.equal(writes,0,'Moving menus must not save or reset role policies');assert.deepEqual(errors,[]);
 console.log('Menu policy context passed: live group/order/label updates without window events, duplicate rows or policy writes.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
