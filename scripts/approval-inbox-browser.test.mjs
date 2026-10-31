import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalWorkflowText} from '../frontend/src/constants/approvalWorkflow.js';
const fixture=path.resolve('frontend/approval-inbox-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import Dashboard from'/src/pages/App/WorkspaceDashboard.jsx';
function App(){const[orgId,setOrg]=React.useState(7);window.setOrg=setOrg;window.currentOrg=orgId;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Dashboard)));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43265,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-inbox-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[],queries=[],t=approvalWorkflowText[lang];let orderReads=0;
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-30T12:00:00+07:00')});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:window.currentOrg};return {isAuthenticated:true,activeOrgId:window.currentOrg,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const actions={navigateToPath:p=>window.destination=p,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;export const useAppState=()=>({});"}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/orders?*',r=>{orderReads++;return r.fulfill({headers,json:[{orderNumber:'ORDER',workflowStatus:'RECEIVED',productionAssignments:Array.from({length:30},(_,i)=>({id:i+1,style:'Style '+i,factory:'Factory',plannedQuantity:100,missingRecordProcesses:[{processCode:'P',targetQuantity:100}]}))}]});});
  for(const endpoint of ['assignment-board-view','org-memberships','customers'])await page.route(`**/${endpoint}?*`,r=>r.fulfill({headers,json:endpoint==='assignment-board-view'?{assignments:[]}:[]}));
  await page.route('**/expense-approval-overview?*',async r=>{
   const url=new URL(r.request().url()),params=Object.fromEntries(url.searchParams);queries.push(params);const pageSize=Number(params.pageSize),offset=Number(params.page)*pageSize,total=params.orgId==='8'?0:55;
   const rows=Array.from({length:Math.min(pageSize,Math.max(0,total-offset))},(_,i)=>({id:offset+i+1,kind:'EXPENSE_REQUEST',managementNumber:'EXP-'+String(offset+i+1).padStart(6,'0'),requestDate:'2026-10-29',drafter:'Author',status:params.status==='ALL'?(i%2?'REJECTED':'APPROVED'):params.status==='APPROVED'?'APPROVED':'REQUESTED'}));return r.fulfill({headers,json:{rows,total}});
  });
  await page.goto(`http://127.0.0.1:${port}/approval-inbox-acceptance.html?lang=${lang}`);
  const card=page.getByTestId('approval-dashboard'),notifications=page.getByTestId('dashboard-notifications');await card.getByText('EXP-000001',{exact:true}).waitFor();await notifications.getByText('Style 29',{exact:false}).waitFor();
  assert.equal(queries[0].status,'UNAPPROVED');assert.equal(queries[0].start,'2026-10-01');assert.equal(queries[0].end,'2026-10-30');assert.equal(await card.getByRole('tab').count(),0);assert.equal(await card.locator('thead th').count(),5);assert.equal(await card.locator('tbody tr').count(),20);
  const left=await notifications.boundingBox(),right=await card.boundingBox();assert.ok(left.x<right.x);assert.ok(Math.abs(left.y-right.y)<2);assert.ok(Math.abs(left.height-540)<2&&Math.abs(right.height-540)<2);
  assert.ok(await notifications.locator(':scope > .MuiBox-root').evaluate(el=>el.scrollHeight>el.clientHeight));assert.equal(await page.getByText(({ko:'빠른 이동',en:'Quick Actions',vi:'Di chuyen nhanh'})[lang],{exact:true}).count(),0);
  await card.getByRole('button',{name:t.next,exact:true}).click();await card.getByRole('button',{name:'EXP-000021',exact:true}).click();assert.equal(await page.evaluate(()=>window.destination),'/outsourcing-record/edit/request/21');
  await card.locator('#approval-overview-status').click();await page.getByRole('option',{name:t.all,exact:true}).click();await card.locator('[data-approval-status="APPROVED"]').first().waitFor();assert.equal(queries.at(-1).status,'ALL');assert.equal(queries.at(-1).page,'0');
  const before=orderReads;await card.getByText('M-',{exact:true}).click();await page.waitForFunction(()=>true);await page.waitForTimeout(300);assert.ok(queries.at(-1).end<'2026-10-01');assert.equal(orderReads,before,'approval date changes do not reload production summaries');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const mobileLeft=await notifications.boundingBox(),mobileRight=await card.boundingBox();assert.ok(mobileLeft.y<mobileRight.y);
  await page.evaluate(()=>window.setOrg(8));assert.equal(await card.getByRole('button',{name:'EXP-000001',exact:true}).count(),0);await card.getByText(t.empty,{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: summary first, fixed-height notifications/approval columns, no quick links/tabs, global period control, server status/page filters, tenant clearing and ko/en/vi mobile.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
