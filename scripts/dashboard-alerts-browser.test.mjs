import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {dashboardAlertText} from '../frontend/src/constants/dashboardAlerts.js';
import {productionExcessText} from '../frontend/src/constants/productionExcess.js';
const file=path.resolve('frontend/dashboard-alerts-acceptance.html'),port=43383;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div data-workspace-viewport style="position:fixed;top:100px;bottom:40px;left:0;right:0;overflow:auto"><div id="root"></div></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/WorkspaceDashboard.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],t=dashboardAlertText[lang];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const p={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',employeeId:1};const auth={activeOrgId:1,activeProfile:p,accessProfile:p,user:{id:'admin'},isAuthenticated:true};export const useAuth=()=>auth;"}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={confirmDiscardUnsavedChanges:()=>true,navigateToPath:p=>window.navigation=p,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;export const AppActionsScope=({children})=>children;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/utils/accessControl*',r=>r.fulfill({contentType:'application/javascript',body:'export const canAccessPath=()=>true;'}));
  await page.route('**/src/pages/App/Order*',r=>r.fulfill({contentType:'application/javascript',body:'export default function Order(){return null;}'}));
  const json=(r,value)=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:value});
  await page.route('**/dashboard/accounting-alerts?*',r=>json(r,{rows:[],total:0,page:0}));
  await page.route('**/orders?*',r=>json(r,[{orderId:'new-order',orderNumber:'NEW',hasAssignments:false,workflowStatus:'RECEIVED',productionAssignments:[]},{orderId:'assigned',orderNumber:'ASSIGNED',hasAssignments:true,workflowStatus:'PRODUCTION',productionAssignments:[{id:'plan-1',style:'STYLE',factory:'Factory',missingRecordProcesses:[{processCode:'P1',targetQuantity:10}]}]}]));
  await page.route('**/assignment-board-view?*',r=>json(r,{assignments:[]}));
  await page.route('**/org-memberships?*',r=>json(r,[]));await page.route('**/customers?*',r=>json(r,[]));
  const excess={workOrderId:1,orderNumber:'EXCESS-ORDER',styleId:10,styleCode:'EXCESS-STYLE',styleProcessId:100,processCode:'P2',processName:'Sew',target:100,recorded:130,excess:30,excessPercent:30,lastDate:'2026-11-03',recordCount:3};
  await page.route('**/work-logs/production-excess?*',r=>json(r,{rows:[excess],total:1,unverified:0}));
  await page.route('**/work-logs/production-excess/*',r=>json(r,{group:excess,records:[],total:0,page:0,pageSize:20}));
  await page.route('**/approval-reviews?*',r=>json(r,{rows:[],total:0}));
  await page.route('**/dashboard/work-requests?*',r=>json(r,{rows:[],actorId:1,canCreate:true,hasMore:false}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}`);
  const notifications=page.locator('[data-dashboard-widget="notifications"]'),suspected=page.locator('[data-dashboard-widget="suspected-errors"]');
  await notifications.getByText(t.unassigned,{exact:true}).waitFor();assert.equal(await notifications.getByText(/STYLE/).count(),0);await suspected.locator('[data-dashboard-alert-kind="missing-record"]').waitFor();assert.equal(await suspected.getByTestId('production-excess-card').count(),1);
  assert.equal(await page.getByText(t.notificationDescription,{exact:true}).count(),0);assert.equal(await page.getByText(t.suspectedDescription,{exact:true}).count(),0);
  const missingItem=suspected.locator('[data-dashboard-alert-kind="missing-record"]'),excessItem=suspected.locator('[data-dashboard-alert-kind="production-excess"]');await excessItem.waitFor();assert.match(await excessItem.innerText(),/130/);assert.match(await excessItem.innerText(),/100/);assert.match(await excessItem.innerText(),/\+30/);assert.equal(await suspected.locator('table').count(),0,'both error types use one list UI instead of an embedded table');
  const cardHeights=await page.locator('[data-dashboard-card]').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));assert.ok(cardHeights.length>=3);assert.ok(cardHeights.every(height=>height>=80&&height<128));const centers=await page.locator('[data-dashboard-card-actions]').evaluateAll(nodes=>nodes.map(node=>{const a=node.getBoundingClientRect(),c=node.closest('[data-dashboard-card]').getBoundingClientRect();return Math.abs(a.y+a.height/2-c.y-c.height/2);}));assert.ok(centers.every(delta=>delta<1));
  assert.equal(await missingItem.getByRole('button',{name:({ko:'확인',en:'Review',vi:'Xem'})[lang],exact:true}).count(),1);
  const itemStyle=locator=>locator.evaluate(node=>{const s=getComputedStyle(node);return [s.padding,s.borderColor,s.borderRadius,s.fontSize];});assert.deepEqual(await itemStyle(missingItem),await itemStyle(excessItem));
  await excessItem.click();await page.getByRole('dialog').getByText(productionExcessText[lang].details,{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:productionExcessText[lang].close,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const widgetBounds=await page.locator('[data-dashboard-widget]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));assert.equal(widgetBounds.length,4);assert.equal(new Set(widgetBounds.map(box=>Math.round(box.y))).size,2);assert.ok(Math.max(...widgetBounds.map(box=>box.height))-Math.min(...widgetBounds.map(box=>box.height))<2);assert.ok(Math.max(...widgetBounds.map(box=>box.bottom))<=1000);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'four widgets fill two rows without page scrolling');assert.equal(await page.locator('[data-workspace-viewport]').evaluate(node=>node.scrollHeight>node.clientHeight+1),false,'dashboard also fits the bounded application viewport');
  if(lang==='ko'&&process.env.BARO_DASHBOARD_SCREENSHOT)await page.screenshot({path:process.env.BARO_DASHBOARD_SCREENSHOT,fullPage:true});
  await notifications.getByRole('button',{name:new RegExp(t.unassigned)}).click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:({ko:'원래 화면으로 이동',en:'Open full page',vi:'Mở trang đầy đủ'})[lang],exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.navigation),'/order');
  await page.getByRole('button',{name:lang==='ko'?'위젯 선택':lang==='vi'?'Chọn tiện ích':'Select widgets',exact:true}).click();const dialog=page.getByRole('dialog');
  const settings={ko:'설정',en:'Settings',vi:'Cài đặt'}[lang],back={ko:'배치로 돌아가기',en:'Back to layout',vi:'Trở về bố cục'}[lang];
  assert.equal(await dialog.getByRole('checkbox',{name:t.unassigned,exact:true}).count(),0);
  await dialog.getByRole('button',{name:t.notifications+' '+settings,exact:true}).click();await dialog.getByRole('checkbox',{name:t.unassigned,exact:true}).uncheck();await dialog.getByRole('button',{name:back,exact:true}).click();
  await dialog.getByRole('button',{name:t.suspected+' '+settings,exact:true}).click();await dialog.getByRole('checkbox',{name:t.missing,exact:true}).uncheck();await dialog.getByRole('button',{name:back,exact:true}).click();
  await dialog.locator('[data-widget-preview="work-requests"]').getByRole('button',{name:t.tasks,exact:true}).press('ArrowUp');
  await dialog.getByRole('button',{name:lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await notifications.getByText(t.unassigned,{exact:true}).count(),0);assert.equal(await suspected.locator('[data-dashboard-alert-kind="missing-record"]').count(),0);assert.equal(await suspected.locator('[data-dashboard-alert-kind="production-excess"]').count(),1);
  await page.reload();await page.getByTestId('dashboard-work-requests').waitFor();assert.equal(await notifications.getByText(t.unassigned,{exact:true}).count(),0);assert.equal(await suspected.locator('[data-dashboard-alert-kind="missing-record"]').count(),0);await suspected.locator('[data-dashboard-alert-kind="production-excess"]').waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Dashboard alerts ko/en/vi: unassigned orders, suspected records separation, two-page settings, drag order, equal viewport rows, persistence and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
