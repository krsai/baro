import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {expenseDeletionText} from '../frontend/src/constants/expenseDeletion.js';
const fixture='frontend/approval-notifications-acceptance.html';assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Stack}from'@mui/material';import theme from'/src/theme';import usePendingApprovals from'/src/hooks/usePendingApprovals';import Indicator from'/src/components/NotificationIndicator';import{ExpenseDeletionInbox}from'/src/components/ExpenseDeletion';
function App(){const[org,setOrg]=React.useState(7);window.setOrg=setOrg;const count=usePendingApprovals(org,true),languageCode=new URLSearchParams(location.search).get('lang');return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Stack,{sx:{p:2}},React.createElement('button',null,'Dashboard',count>0?React.createElement(Indicator,{label:'Pending approvals: '+count}):null),React.createElement(ExpenseDeletionInbox,{orgId:org,languageCode,onNavigate:()=>{}})));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43373','--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43373/'+fixture.split('/').pop())).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],t=expenseDeletionText[lang];page.on('pageerror',e=>errors.push(e.message));let phase='SELF',empty=false,writes=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/expense-approval-overview?*',r=>{const u=new URL(r.request().url());assert.equal(u.searchParams.get('start'),'0001-01-01');return r.fulfill({headers,json:{total:empty||u.searchParams.get('orgId')!=='7'?0:3}});});
  await page.route('**/change-approval-requests?*',r=>r.fulfill({headers,json:empty||new URL(r.request().url()).searchParams.get('orgId')!=='7'?[]:[{id:'change'}]}));
  await page.route('**/expense-deletion-requests?*',r=>r.fulfill({headers,json:empty||new URL(r.request().url()).searchParams.get('orgId')!=='7'?[]:[{id:'delete',requestId:11,managementNumber:'EXP-11',drafter:'Requester',reason:'Duplicate',canDecide:phase==='APPROVER',blockedReason:'SELF_REQUEST',eligibleApprovers:phase==='NONE'?[]:[{id:4,name:'Senior admin'}]}]}));
  await page.route('**/expense-deletion-requests/delete/decision?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});writes++;assert.equal(r.request().postDataJSON().decision,'APPROVED');empty=true;return r.fulfill({headers,json:{status:'APPROVED'}});});
  await page.goto('http://127.0.0.1:43373/'+fixture.split('/').pop()+'?lang='+lang);
  await page.getByLabel('Pending approvals: 5',{exact:true}).waitFor();await page.getByText(t.selfRequest,{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:t.approve,exact:true}).isDisabled(),true);await page.getByText(t.eligible+': Senior admin',{exact:true}).waitFor();assert.equal(writes,0);
  phase='NONE';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText(t.noApprover,{exact:true}).waitFor();
  phase='APPROVER';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>!document.querySelector('[data-testid="expense-deletion-inbox"] button:nth-child(2)')?.disabled);
  const inbox=page.getByTestId('expense-deletion-inbox');await inbox.getByRole('button',{name:t.approve,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:t.approve,exact:true}).click();await page.getByLabel('Pending approvals: 5',{exact:true}).waitFor({state:'hidden'});assert.equal(writes,1);
  empty=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByLabel('Pending approvals: 5',{exact:true}).waitFor();await page.evaluate(()=>window.setOrg(8));await page.getByLabel('Pending approvals: 5',{exact:true}).waitFor({state:'hidden'});await inbox.getByText('Duplicate',{exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS approval notification and deletion authority',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
