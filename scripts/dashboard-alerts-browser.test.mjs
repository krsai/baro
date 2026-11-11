import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {dashboardAlertText} from '../frontend/src/constants/dashboardAlerts.js';
const file=path.resolve('frontend/dashboard-alerts-acceptance.html'),port=43383;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/WorkspaceDashboard.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],t=dashboardAlertText[lang];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const p={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',employeeId:1};const auth={activeOrgId:1,activeProfile:p,accessProfile:p,user:{id:'admin'},isAuthenticated:true};export const useAuth=()=>auth;"}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:p=>window.navigation=p,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/utils/accessControl*',r=>r.fulfill({contentType:'application/javascript',body:'export const canAccessPath=()=>true;'}));
  const json=(r,value)=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:value});
  await page.route('**/orders?*',r=>json(r,[{orderId:'new-order',orderNumber:'NEW',hasAssignments:false,workflowStatus:'RECEIVED',productionAssignments:[]},{orderId:'assigned',orderNumber:'ASSIGNED',hasAssignments:true,workflowStatus:'PRODUCTION',productionAssignments:[{id:'plan-1',style:'STYLE',factory:'Factory',missingRecordProcesses:[{processCode:'P1',targetQuantity:10}]}]}]));
  await page.route('**/assignment-board-view?*',r=>json(r,{assignments:[]}));
  await page.route('**/org-memberships?*',r=>json(r,[]));await page.route('**/customers?*',r=>json(r,[]));
  await page.route('**/work-logs/production-excess?*',r=>json(r,{rows:[],total:0,unverified:0}));
  await page.route('**/approval-reviews?*',r=>json(r,{rows:[],total:0}));
  await page.route('**/dashboard/work-requests?*',r=>json(r,{rows:[],actorId:1,canCreate:true,hasMore:false}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}`);
  const notifications=page.locator('[data-dashboard-widget="notifications"]'),suspected=page.locator('[data-dashboard-widget="suspected-errors"]');
  await notifications.getByText(t.unassigned,{exact:true}).waitFor();assert.equal(await notifications.getByText(/STYLE/).count(),0);await suspected.getByText(/STYLE/).waitFor();assert.equal(await suspected.getByTestId('production-excess-card').count(),1);
  if(lang==='ko'&&process.env.BARO_DASHBOARD_SCREENSHOT)await page.screenshot({path:process.env.BARO_DASHBOARD_SCREENSHOT,fullPage:true});
  await notifications.getByRole('button',{name:new RegExp(t.unassigned)}).click();assert.equal(await page.evaluate(()=>window.navigation),'/order');
  await page.getByRole('button',{name:lang==='ko'?'위젯 선택':lang==='vi'?'Chọn tiện ích':'Select widgets',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('checkbox',{name:t.unassigned,exact:true}).uncheck();await dialog.getByRole('checkbox',{name:t.missing,exact:true}).uncheck();
  await dialog.getByRole('button',{name:t.tasks+' ↑',exact:true}).click();
  await dialog.getByRole('button',{name:lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await notifications.getByText(t.unassigned,{exact:true}).count(),0);assert.equal(await suspected.getByText(/STYLE/).count(),0);
  await page.reload();await page.getByTestId('dashboard-work-requests').waitFor();assert.equal(await notifications.getByText(t.unassigned,{exact:true}).count(),0);assert.equal(await suspected.getByText(/STYLE/).count(),0);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Dashboard alerts ko/en/vi: unassigned orders, suspected records separation, per-item preferences, move buttons, persistence and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
