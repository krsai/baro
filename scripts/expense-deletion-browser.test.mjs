import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseDeletionText} from '../frontend/src/constants/expenseDeletion.js';
const fixture=path.resolve('frontend/expense-deletion-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Stack}from'@mui/material';import theme from'/src/theme';import{ExpenseDeletionButton,ExpenseDeletionInbox}from'/src/components/ExpenseDeletion.jsx';
function App(){const[orgId,setOrg]=React.useState(7);window.setOrg=setOrg;const lang=new URLSearchParams(location.search).get('lang');return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Stack,{spacing:2,sx:{p:2}},React.createElement(ExpenseDeletionButton,{orgId,languageCode:lang,document:{id:11,version:1,managementNumber:'EXP-TEST',canRequestDeletion:true,approval:{approved:true}}}),React.createElement(ExpenseDeletionButton,{orgId,languageCode:lang,document:{id:12,version:1,canRequestDeletion:false,bankReconciled:true,approval:{approved:true}}}),React.createElement(ExpenseDeletionInbox,{orgId,languageCode:lang,onNavigate:p=>window.destination=p})));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43371,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-deletion-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],t=expenseDeletionText[lang],writes=[];let pending=[];
  page.on('pageerror',e=>errors.push(e.message));const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/expense-requests/11/deletion-requests?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});const body=r.request().postDataJSON();writes.push(body);pending=[{id:'d1',requestId:11,managementNumber:'EXP-TEST',drafter:'Requester',reason:body.reason,canDecide:true}];return r.fulfill({headers,json:{id:'d1'}});});
  await page.route('**/expense-deletion-requests?*',r=>r.fulfill({headers,json:new URL(r.request().url()).searchParams.get('orgId')==='7'?pending:[]}));
  await page.route('**/expense-deletion-requests/d1/decision?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});writes.push(r.request().postDataJSON());pending=[];return r.fulfill({headers,json:{status:'APPROVED'}});});
  await page.goto(`http://127.0.0.1:${port}/expense-deletion-acceptance.html?lang=${lang}`);
  assert.equal(await page.getByRole('button',{name:t.request,exact:true}).nth(1).isDisabled(),true);
  const start=async()=>{await page.getByRole('button',{name:t.request,exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByLabel(t.reason,{exact:true}).fill(' ');assert.equal(await dialog.getByRole('button',{name:t.send,exact:true}).isDisabled(),true);await dialog.getByLabel(t.reason,{exact:true}).fill('Duplicate expense');await dialog.getByRole('button',{name:t.send,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByTestId('expense-deletion-inbox').getByText('Duplicate expense',{exact:true}).waitFor();};
  await start();assert.equal(writes[0].version,1);assert.equal(writes[0].reason,'Duplicate expense');assert.match(writes[0].clientKey,/^[\w-]{8,64}$/);
  const inbox=page.getByTestId('expense-deletion-inbox');await inbox.getByRole('button',{name:t.open,exact:true}).click();assert.equal(await page.evaluate(()=>window.destination),'/outsourcing-record/edit/request/11');
  await inbox.getByRole('button',{name:t.approve,exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByText('Duplicate expense',{exact:true}).waitFor();await dialog.getByRole('button',{name:t.approve,exact:true}).click();await dialog.waitFor({state:'hidden'});await inbox.getByText('Duplicate expense',{exact:true}).waitFor({state:'hidden'});assert.deepEqual(writes[1],{decision:'APPROVED',reason:''});
  await start();await inbox.getByRole('button',{name:t.reject,exact:true}).click();dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('button',{name:t.reject,exact:true}).isDisabled(),true);await dialog.getByLabel(t.decisionReason,{exact:true}).fill('Keep this expense');await dialog.getByRole('button',{name:t.reject,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes[3],{decision:'REJECTED',reason:'Keep this expense'});
  await start();await page.evaluate(()=>window.setOrg(8));await inbox.getByText('Duplicate expense',{exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS deletion confirmation',lang,width);
 }
}finally{await browser?.close();vite.kill();if(existsSync(fixture))unlinkSync(fixture);}
