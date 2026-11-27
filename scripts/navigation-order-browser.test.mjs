import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/navigation-order-acceptance.html'),port=43321;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><meta charset="UTF-8"><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Board from '/src/pages/App/system/AccessPolicyBoard';import {MenuBlueprintContext} from '/src/context/MenuBlueprintContext';import useOrder from '/src/hooks/useNavigationOrder';import {applyNavigationOrder} from '/src/utils/navigationOrder.mjs';
const e=React.createElement,tree=[{path:'/dashboard',label:'Dashboard'},{isParent:true,menuGroupKey:'ACCOUNTING',label:'Finance',children:[{path:'/invoices',label:'Invoice'},{path:'/payroll',label:'Payroll'},{path:'/bank-ledger',label:'Ledger'}]},{isParent:true,menuGroupKey:'ADMIN',label:'People',children:[{path:'/employee',label:'Employee'},{path:'/attendance',label:'Attendance'}]},{isParent:true,menuGroupKey:'SETTINGS',label:'Settings',children:[{path:'/business',label:'Business'}]}];
function Observer(){const order=useOrder(true,'observer');return e('output',{'data-observer':true},JSON.stringify(applyNavigationOrder(tree,order.loaded?.order).map(n=>[n.menuGroupKey||n.path,(n.children||[]).map(c=>c.path)])));}
createRoot(document.getElementById('root')).render(e(ThemeProvider,{theme},e(CssBaseline),e(MemoryRouter,null,e(MenuBlueprintContext.Provider,{value:tree},e(Observer),e(Board)))));
</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/navigation-order-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeProfile:{entryType:"SYSTEM",systemRole:"SYSTEM_ADMIN"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(language)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/utils/apiClient*',r=>r.fulfill({contentType:'application/javascript',body:`import {getDefaultRoleAccessPolicy,getPolicyFeatures} from '/src/utils/roleAccessPolicyCore.mjs';import {SERVICE_FEATURES} from '/src/utils/serviceCompany.mjs';export const activateRequestScope=()=>{};export const deactivateRequestScope=()=>{};
export async function requestJSON(url,options={}){window.calls??=[];window.calls.push([url,options.method||'GET']);window.order??={revision:0,order:{}};
if(url==='/navigation/menu-order'||url==='/system/navigation-order'&&!options.method)return structuredClone(window.order);
if(url==='/system/navigation-order'){if(window.fail){const e=Error('conflict');e.status=409;throw e;}window.order={...JSON.parse(options.body),revision:window.order.revision+1};return structuredClone(window.order);}
if(url.includes('industry-menu-policy'))return {revision:1,industries:{},fullScopeTypes:['MANUFACTURER','SERVICE'],features:getPolicyFeatures(),subscribers:{MANUFACTURER:getPolicyFeatures().filter(f=>f!=='FREIGHT'),SERVICE:SERVICE_FEATURES}};
return {policy:getDefaultRoleAccessPolicy()};}`}));
  await page.goto(`http://127.0.0.1:${port}/navigation-order-acceptance.html`);
  const group=key=>page.locator('[data-menu-group="'+key+'"]'),row=p=>page.locator('[data-menu-path="'+p+'"]');
  await group('ADMIN').locator('[data-menu-drag-handle]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-menu-group="ADMIN"] [data-menu-drag-handle]').disabled);
  const grants=()=>page.locator('[data-menu-path]').evaluateAll(nodes=>Object.fromEntries(nodes.map(row=>[row.dataset.menuPath,[...row.querySelectorAll('input')].map(n=>[n.checked,n.disabled])])));
  const policyBefore=await grants();
  const from=group('ADMIN').locator('[data-menu-drag-handle]'),to=group('ACCOUNTING').locator('[data-menu-drag-handle]');await from.scrollIntoViewIfNeeded();const a=await from.boundingBox(),b=await to.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2,a.y+a.height/2-10,{steps:3});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
  assert.deepEqual(await page.locator('[data-menu-group]').evaluateAll(nodes=>nodes.map(n=>n.dataset.menuGroup)),['ADMIN','ACCOUNTING','SETTINGS']);
  assert.ok((await page.locator('output').textContent()).indexOf('ACCOUNTING')<(await page.locator('output').textContent()).indexOf('ADMIN'),'Sidebar observer waits for save');
  await row('/payroll').locator('[data-menu-drag-handle]').press('ArrowUp');
  const save=page.locator('.app-page-header button').last();await save.click();
  await page.waitForFunction(()=>window.order.revision===1);
  const observed=JSON.parse(await page.locator('output').textContent());assert.equal(observed[1][0],'ADMIN');assert.equal(observed[2][1][0],'/payroll');
  assert.equal(await page.evaluate(()=>window.calls.some(([url,method])=>method==='PUT'&&url!=='/system/navigation-order')),false,'Order-only edit never writes permissions');
  // Check each path retains its grants after moving, rather than comparing row order.
  assert.deepEqual(await grants(),policyBefore,'Each menu retains its own availability and role grants');
  await page.evaluate(()=>window.fail=true);await row('/invoices').locator('[data-menu-drag-handle]').press('ArrowUp');await save.click();
  await page.waitForFunction(()=>document.querySelector('[data-app-notice]'));
  assert.equal(await page.locator('[data-menu-path]').first().getAttribute('data-menu-path'),'/dashboard');assert.deepEqual(await page.locator('[data-menu-path]').evaluateAll(nodes=>nodes.map(n=>n.dataset.menuPath).filter(p=>['/invoices','/payroll'].includes(p))),['/invoices','/payroll'],'Failed save keeps the draft order');
  assert.equal(await page.evaluate(()=>window.order.revision),1);
  await page.evaluate(()=>{window.order={revision:2,order:{}};window.dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('output').textContent)[1][0]==='ACCOUNTING');
  assert.deepEqual(await page.locator('[data-menu-path]').evaluateAll(nodes=>nodes.map(n=>n.dataset.menuPath).filter(p=>['/invoices','/payroll'].includes(p))),['/invoices','/payroll'],'Focus refresh preserves the draft');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS navigation order '+language+' '+width);
 }
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
