import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/missing-record-alert-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Dashboard from'/src/pages/App/WorkspaceDashboard.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(MemoryRouter,{initialEntries:['/dashboard']},React.createElement(Dashboard))));</script></body></html>`);
const port=43242,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/missing-record-alert-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({isAuthenticated:true,activeOrgId:1,activeProfile:{entryType:"SAAS"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:()=>{}};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
  await page.route('**/src/utils/accessControl.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const canAccessPath=(path)=>path!=="/assignment"||!window.blockAssignments;'}));
  const headers={'Access-Control-Allow-Origin':'*'};let missing=true,reviews=0;
  await page.route('**/orders?*',r=>r.fulfill({headers,json:[{id:'order-17',orderNumber:'L17-1',workflowStatus:'PRODUCTION',productionAssignments:[{id:'plan-17',style:'AM02058',factory:'HANOI',plannedQuantity:170,missingRecordProcesses:missing?[{styleProcessId:3,processCode:'C01',targetQuantity:170,recordedQuantity:0}]:[]}]}]}));
  await page.route('**/assignment-board-view?*',r=>r.fulfill({headers,json:{assignments:[]}}));
  await page.route('**/org-memberships?*',r=>r.fulfill({headers,json:[]}));await page.route('**/customers?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/assignment-plans/plan-17/quantity-review?*',r=>{reviews++;assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'1');return r.fulfill({headers,json:{plannedQuantity:170,processTotals:[{styleProcessId:3,processCode:'C01',processName:'Size label',applicableQuantity:170,quantity:0}],workRecords:[]}});});
  await page.goto(`http://127.0.0.1:${port}/missing-record-alert-acceptance.html`);
  const alert=page.getByRole('button').filter({hasText:'L17-1'});await alert.waitFor();assert.match(await alert.innerText(),/AM02058/);assert.match(await alert.innerText(),/C01: 0 \/ 170/);
  await alert.click();await page.getByText('C01 · Size label',{exact:true}).waitFor();assert.equal(reviews,1);
  await page.locator('.MuiDrawer-root').getByRole('button').first().click();
  missing=false;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:['payroll-sources']}})));
  await alert.waitFor({state:'hidden'});
  missing=true;await page.evaluate(()=>{window.blockAssignments=true;window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:['assignment-board']}}));});
  await page.waitForTimeout(200);assert.equal(await alert.count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Missing process record dashboard passed ko/en/vi: order/style/process detail, FK quantity-review link, source refresh clears alert and assignment access respected.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
