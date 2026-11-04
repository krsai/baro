import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/change-approvals-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Request from '/src/components/ChangeApprovalDialog.jsx';import Inbox from '/src/components/ChangeApprovalInbox.jsx';import Party from '/src/components/LedgerCounterpartyField.jsx';
const lang=new URLSearchParams(location.search).get('lang');function App(){const dialog=React.useRef(),[party,setParty]=React.useState(null);return React.createElement(ThemeProvider,{theme},React.createElement('button',{onClick:()=>dialog.current.prepare({menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:'entry',payload:{}})},'Open request'),React.createElement(Party,{row:{entryKind:'BANK',evidenceType:'FILE',counterparty:party},options:[{kind:'PARTNER',id:3,name:'Vendor'}],onChange:setParty,languageCode:lang}),React.createElement(Request,{ref:dialog,orgId:7,languageCode:lang}),React.createElement(Inbox,{orgId:7,languageCode:lang}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/change-approvals-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:430,height:900}}),errors=[],posts=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const row={id:'request',menu:'BANK_LEDGER',operation:'DELETE',requesterName:'Requester',reason:'Duplicate',canDecide:true,payload:{},beforeSnapshot:{entry:{transactionDate:'2026-11-02',counterpartyName:'Vendor',direction:'IN',amount:'100',evidenceNumber:'Receipt'},account:{name:'Company bank',currencyCode:'USD'}}};
  await page.route('**/approval-action-settings?*',r=>r.fulfill({headers,json:{grades:[{id:2,name:'Senior'}]}}));
  await page.route('**/change-approval-preview?*',r=>r.fulfill({headers,json:{complete:true,policy:{totals:[{currency:'USD',amount:'100'}]},stages:[{key:'senior',role:'ACCOUNTANT',gradeId:2,employeeId:10,candidates:[{id:10,name:'Senior accountant',gradeId:2}]}]}}));
  await page.route('**/change-approval-requests**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='POST'){posts.push({url:r.request().url(),body:r.request().postDataJSON()});return r.fulfill({headers,json:{id:'saved'}});}return r.fulfill({headers,json:[row]});});
  await page.goto(`http://127.0.0.1:${port}/change-approvals-acceptance.html?lang=${lang}`);const t=changeApprovalText[lang];
  await page.getByRole('combobox',{name:t.party}).fill('Vendor');await page.getByRole('option',{name:'Vendor'}).click();
  await page.getByRole('button',{name:'Open request'}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Duplicate receipt');await dialog.getByRole('button',{name:t.request,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(posts[0].body.selection.seniorEmployeeId,10);assert.equal(posts[0].body.reason,'Duplicate receipt');
  await page.getByRole('button',{name:t.review}).click();await dialog.getByText('Vendor',{exact:false}).waitFor();assert.equal(await dialog.getByRole('button',{name:t.reject,exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:t.approve,exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:t.approve,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===0);
  assert.equal(posts.at(-1).body.decision,'APPROVED');assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
 }
 console.log('PASS: party selection, approval request, source review, rejection reason and approval in ko/en/vi mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
