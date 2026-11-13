import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/change-approvals-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Request from '/src/components/ChangeApprovalDialog.jsx';import Party from '/src/components/LedgerCounterpartyField.jsx';
const lang=new URLSearchParams(location.search).get('lang');function App(){const [currentLanguage,setLanguage]=React.useState(lang);window.setTestLanguage=setLanguage;const dialog=React.useRef(),[party,setParty]=React.useState(null);return React.createElement(ThemeProvider,{theme},React.createElement('button',{onClick:()=>dialog.current.prepare({menu:'BANK_LEDGER',operation:new URLSearchParams(location.search).get('operation')||'DELETE',selectionOnly:new URLSearchParams(location.search).get('selectionOnly')==='true',sourceKind:'ledger',sourceId:'entry',payload:{}})},'Open request'),React.createElement(Party,{row:{entryKind:'BANK',evidenceType:'FILE',counterparty:party},options:[{kind:'PARTNER',id:3,name:'Vendor'}],onChange:setParty,languageCode:currentLanguage}),React.createElement(Request,{ref:dialog,orgId:7,languageCode:currentLanguage}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/change-approvals-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const operation of ['DELETE','UPDATE'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],posts=[];let failPreview=false,pendingPreview;page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/approval-action-settings?*',r=>r.fulfill({headers,json:{grades:[{id:2,name:'Senior'}]}}));
  await page.route('**/change-approval-preview?*',r=>{if(failPreview&&r.request().method()==='POST'){pendingPreview=r;return;}return r.fulfill({headers,json:{complete:true,policy:{totals:[{currency:'USD',amount:'100'}]},stages:[{key:'senior',role:'ACCOUNTANT',gradeId:2,employeeId:10,candidates:[{id:10,name:'Senior accountant',gradeId:2}]}]}});});
  await page.route('**/change-approval-requests**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='POST'){posts.push({url:r.request().url(),body:r.request().postDataJSON()});return r.fulfill({headers,json:{id:'saved'}});}return r.fulfill({headers,status:405,json:{error:'Unexpected method'}});});
  await page.goto(`http://127.0.0.1:${port}/change-approvals-acceptance.html?lang=${lang}&operation=${operation}`);const t=changeApprovalText[lang];
  await page.getByRole('textbox').focus();await page.keyboard.press('F2');await page.getByRole('dialog').getByRole('cell',{name:'Vendor',exact:true}).dblclick();
  await page.getByRole('button',{name:'Open request'}).click();const dialog=page.getByRole('dialog');
  const reason=dialog.getByRole('textbox',{name:t.reason,exact:false});await reason.waitFor();assert.equal(await reason.getAttribute('required'),'');
  await dialog.locator('[data-approval-flow-card="senior"]').waitFor();assert.equal(await dialog.getByRole('button',{name:t.request,exact:true}).isDisabled(),true);assert.equal(posts.length,0);
  await reason.fill(' \t ');assert.equal(await dialog.getByRole('button',{name:t.request,exact:true}).isDisabled(),true);assert.equal(posts.length,0);
  await reason.fill('  Duplicate receipt  ');await dialog.getByRole('button',{name:t.request,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(posts[0].body.selection.seniorEmployeeId,10);assert.equal(posts[0].body.reason,'Duplicate receipt');assert.equal(posts[0].body.operation,operation);
  failPreview=true;await page.getByRole('button',{name:'Open request'}).click();
  await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Keep this reason');
  for(let attempt=0;attempt<100&&!pendingPreview;attempt++)await page.waitForTimeout(20);assert.ok(pendingPreview);
  await page.evaluate(()=>window.setTestLanguage('en'));
  await pendingPreview.fulfill({headers,status:400,json:{error:lang==='en'?'CHANGE_ALREADY_PENDING':'TEST_PREVIEW_FAILED'}});
  await dialog.getByRole('alert').getByText(changeApprovalText.en.lineFailed,{exact:true}).waitFor();
  for(const next of ['vi','ko','en']){await page.evaluate(language=>window.setTestLanguage(language),next);await dialog.getByRole('alert').getByText(changeApprovalText[next].lineFailed,{exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:changeApprovalText[next].reason,exact:false}).inputValue(),'Keep this reason');assert.equal(await dialog.getByRole('button',{name:changeApprovalText[next].request,exact:true}).isDisabled(),true);}
  assert.equal(await dialog.getByTestId('approval-dialog-flow').count(),0,'failed preview must not show an empty drafter or invented approvers');
  if(lang==='en')await dialog.getByRole('alert').getByText(changeApprovalText.en.already,{exact:true}).waitFor();
  failPreview=false;await dialog.getByRole('button',{name:changeApprovalText.en.reloadLine,exact:true}).click();
  await dialog.locator('[data-approval-flow-card="senior"]').waitFor();assert.equal(await dialog.locator('[data-approval-flow-card]').count(),2);assert.equal(await dialog.getByRole('alert').count(),0);
  assert.equal(await dialog.getByRole('textbox',{name:changeApprovalText.en.reason,exact:false}).inputValue(),'Keep this reason');assert.equal(await dialog.getByRole('button',{name:changeApprovalText.en.request,exact:true}).isEnabled(),true);
  assert.equal(posts.length,1,'loading the approval line never submits the request');
  await page.goto(`http://127.0.0.1:${port}/change-approvals-acceptance.html?lang=${lang}&operation=${operation}&selectionOnly=true`);
  await page.getByRole('button',{name:'Open request'}).click();await dialog.locator('[data-approval-flow-card="senior"]').waitFor();assert.equal(await dialog.getByRole('textbox',{name:t.reason,exact:false}).count(),0);await dialog.getByRole('button',{name:t.request,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(posts.length,1,'choosing an approval line is not a submission');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
 }
 console.log('PASS: edit/deletion reasons required, whitespace blocked, trimmed submission and error/language preservation in ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
