import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {inventoryBalanceText} from '../frontend/src/constants/inventoryBalanceAlerts.js';
const fixture='frontend/inventory-balance-acceptance.html',port=43546;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Alerts from'/src/components/InventoryBalanceAlerts';import{RequestScopeBoundary}from'/src/context/RequestScopeContext';
function Demo(){const[org,setOrg]=React.useState(1),[active,setActive]=React.useState(true),[history,setHistory]=React.useState(true);window.switchOrg=setOrg;window.activate=setActive;window.allowHistory=setHistory;const lang=new URLSearchParams(location.search).get('lang');return React.createElement(RequestScopeBoundary,{active},React.createElement(Alerts,{orgId:org,languageCode:lang,canOpenHistory:history,onNavigate:path=>{window.openedPath=path;}}));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Demo))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/inventory-balance-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],reads=[],writes=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));const t=inventoryBalanceText[lang];
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const actions={markTabChanged:noop,clearTabChanged:noop,showNotification:(message,severity,options)=>{window.notice=message;window.retryNotice=options.action.props.onClick;},removeNotification:()=>{window.notice=null;}};export const useAppActions=()=>actions;'}));
  const row={variantId:'variant-one',baseId:1,masterId:'master-one',balance:'-9007199254740993.0001',received:'0',issued:'9007199254740993.0001',lastDate:'2026-11-20',master:{nameEn:'Paper',nameKo:'Paper',nameVi:'Paper',baseSnapshot:{code:'MPP'},unit:{nameEn:'Each',nameKo:'Each',nameVi:'Each'}},attributes:{owner:{id:2,name:'THE SAN'},type:{nameEn:'10x10x10'},color:{code:'RED'},dimensions:{}}};
  let values=[row],fail=false;
  await page.route('**/inventory-entry/negative-stock?*',r=>{const request=r.request(),url=new URL(request.url());if(request.method()!=='GET')writes.push(request.method());reads.push(url.searchParams.get('orgId'));return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:fail?503:200,json:fail?{error:'UNAVAILABLE'}:{rows:url.searchParams.get('orgId')==='1'?values:[],total:url.searchParams.get('orgId')==='1'?values.length:0,page:0}});});
  await page.goto('http://127.0.0.1:'+port+'/inventory-balance-acceptance.html?lang='+lang);
  const card=page.locator('[data-dashboard-alert-kind="negative-stock"]');await card.waitFor();assert.match(await card.innerText(),/-9,007,199,254,740,993.0001/);assert.match(await card.innerText(),/THE SAN/);
  const emit=()=>page.evaluate(async()=>{const{emitWorkspaceDataChanged}=await import('/src/utils/workspaceDataEvents.js');emitWorkspaceDataChanged({orgId:1,topics:['inventory-stock','inventory-movements']});});
  await card.getByRole('button').first().click();const detail=page.getByRole('dialog',{name:t.title,exact:true});await detail.getByText(t.approvedOnly,{exact:true}).waitFor();const before=reads.length;await emit();await page.waitForTimeout(120);assert.equal(reads.length,before,'open review defers refresh');
  await page.evaluate(()=>window.allowHistory(false));assert.equal(await detail.getByRole('button',{name:t.history,exact:true}).count(),0,'stock-only users do not get a history link');await page.evaluate(()=>window.allowHistory(true));
  await detail.getByRole('button',{name:t.history,exact:true}).click();await detail.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.openedPath),'/inventory/movements?variantId=variant-one');
  await card.waitFor();values=[];await emit();await card.waitFor({state:'hidden'});
  values=[row];await emit();await card.waitFor();fail=true;await emit();await page.waitForFunction(message=>window.notice===message,t.failed);const failures=reads.length;await page.waitForTimeout(150);assert.equal(reads.length,failures,'a failed request does not loop');fail=false;await page.evaluate(()=>window.retryNotice());await page.waitForFunction(()=>!window.notice);
  await page.evaluate(()=>window.activate(false));const inactiveReads=reads.length;await emit();await page.waitForTimeout(120);assert.equal(reads.length,inactiveReads,'inactive workspace does not fetch');await page.evaluate(()=>window.activate(true));await page.waitForFunction(count=>window.performance.getEntriesByType('resource').filter(row=>row.name.includes('/inventory-entry/negative-stock')).length>count,inactiveReads);
  await card.getByRole('button').first().click();await detail.waitFor();const companyRead=page.waitForResponse(response=>response.url().includes('/inventory-entry/negative-stock')&&response.url().includes('orgId=2'));await page.evaluate(()=>window.switchOrg(2));await companyRead;await detail.waitFor({state:'hidden'});await card.waitFor({state:'hidden'});assert.equal(reads.at(-1),'2');assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
 }
 console.log('PASS negative stock ko/en/vi PC/mobile: exact quantity, review, history permission, resolution, retry, inactive workspace, detail deferral, company isolation and no writes.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
