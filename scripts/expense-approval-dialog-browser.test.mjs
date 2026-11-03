import {approvalLineText} from '../frontend/src/constants/approvalLine.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
import {approvalStepLabels} from '../frontend/src/utils/approvalStepState.mjs';
import {expenseApprovalActionsText} from '../frontend/src/constants/expenseApprovalActions.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/expense-approval-dialog-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Button,Stack,TextField} from '@mui/material';import theme from '/src/theme';import Approval from '/src/components/ExpenseApprovalSettings.jsx';
function Screen(){const ref=React.useRef(),[value,setValue]=React.useState(null),[memo,setMemo]=React.useState('Preserved input'),[approvalStatus,setApprovalStatus]=React.useState(null);window.setApprovalStatus=setApprovalStatus;return React.createElement(Stack,{spacing:2,sx:{p:2,maxWidth:900}},React.createElement(TextField,{label:'Memo',value:memo,onChange:e=>setMemo(e.target.value)}),React.createElement(Approval,{ref,horizontalStages:true,orgId:7,languageCode:new URLSearchParams(location.search).get('lang'),value,approvalStatus,onChange:setValue,items:[{unitPrice:'100000001',quantity:'1',vatRate:'0',currency:'VND'}]}),React.createElement(Button,{onClick:async()=>{const selection=await ref.current.prepare();if(selection)document.documentElement.dataset.saved='true';}},'Save'));}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Screen)));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-approval-dialog-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},keys=['senior','lead','admin'],names=['Senior approver','Lead approver','Admin approver'];let adminPreview=false,dynamicPreview=false;
  await page.route('**/expense-approval-settings?*',r=>r.fulfill({headers,json:{drafter:{id:1,name:'Current user'},candidates:names.map((name,i)=>({id:i+2,name}))}}));
  await page.route('**/expense-approval-preview?*',r=>{if(dynamicPreview){const selection=r.request().postDataJSON()?.selection||{},stages=['step1','step2','step3'].map((key,i)=>({key,role:['OPERATOR','ACCOUNTANT','ADMIN'][i],gradeId:i===0?3:i===1?2:null,employeeId:selection[key+'EmployeeId']||null,name:['Operations lead','Senior accountant','Administrator'][i],candidates:[{id:i+2,name:['Operations lead','Senior accountant','Administrator'][i]}]}));return r.fulfill({headers,json:{complete:stages.every(stage=>stage.employeeId),ids:stages.map(stage=>stage.employeeId).filter(Boolean),stages,drafter:{id:1,name:'Current user'},policy:{config:{version:2,kind:'EXPENSE'},totals:[{currency:'USD',amount:'5500'}]}}});}if(adminPreview)return r.fulfill({headers,json:{complete:true,ids:[],stages:[],drafter:{id:1,name:'Current user'},policy:{drafterId:1,exempt:true,exemptionReason:'ADMIN_DRAFTER'}}});const selection=r.request().postDataJSON()?.selection||{},stages=keys.map((key,i)=>({key,employeeId:selection[`${key}EmployeeId`]||null,name:names[i],candidates:[{id:i+2,name:names[i]}]}));return r.fulfill({headers,json:{complete:stages.every(stage=>stage.employeeId),ids:stages.map(stage=>stage.employeeId).filter(Boolean),stages,drafter:{id:1,name:'Current user'},policy:{totals:[{currency:'VND',amount:'100000001'}]}}});});
  await page.goto(`http://127.0.0.1:${port}/expense-approval-dialog-acceptance.html?lang=${lang}`);const t=expenseHeaderActions[lang];
  assert.equal(await page.getByTestId('expense-approval-button').isDisabled(),false);
  await page.getByTestId('expense-approval-button').getByText('Current user',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-admin').waitFor();
  const drafter=dialog.locator('#expense-stage-drafter');await drafter.click();assert.equal(await page.getByRole('option').filter({hasNot:page.locator('[aria-disabled=true]')}).count()>=1,true);assert.equal(await page.getByRole('option',{name:'Current user',exact:true}).count(),1);await page.getByRole('option',{name:'Current user',exact:true}).click();
  const boxes=await Promise.all(keys.map((key,i)=>dialog.locator('#expense-stage-'+key).boundingBox()));assert.ok(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[2].y);
  await dialog.getByRole('button',{name:t.cancel,exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.saved),undefined);assert.equal(await page.getByLabel('Memo').inputValue(),'Preserved input');
  await page.getByRole('button',{name:'Save',exact:true}).click();dialog=page.getByRole('dialog');
  for(const [i,key] of keys.entries()){await dialog.locator('#expense-stage-'+key).click();await page.getByRole('option',{name:names[i],exact:true}).click();}
  await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.dataset.saved),'true');
  for(const name of names)await page.getByTestId('expense-approval-button').getByText(name,{exact:true}).waitFor();
  const verticalBoxes=await Promise.all(names.map(name=>page.getByTestId('expense-approval-button').getByText(name,{exact:true}).boundingBox()));assert.ok(Math.abs(verticalBoxes[0].y-verticalBoxes[1].y)<2&&Math.abs(verticalBoxes[1].y-verticalBoxes[2].y)<2&&verticalBoxes[0].x<verticalBoxes[1].x&&verticalBoxes[1].x<verticalBoxes[2].x);assert.equal(await page.getByTestId('expense-approval-button').getByText('Current user',{exact:true}).count(),1);

  await page.evaluate(()=>window.setApprovalStatus({steps:[{employeeId:2,approved:true},{employeeId:3,approved:false},{employeeId:4,approved:false}]}));
  const progress=expenseApprovalActionsText[lang],approvalButton=page.getByTestId('expense-approval-button');
  const approved=approvalButton.locator('[data-approval-state="approved"]'),waiting=approvalButton.locator('[data-approval-state="pending"]');
  await approved.getByText(names[0],{exact:true}).waitFor();await waiting.getByText(names[1],{exact:true}).waitFor();await approvalButton.locator('[data-approval-state="waiting"]').getByText(names[2],{exact:true}).waitFor();assert.equal(await waiting.count(),1);await waiting.getByText(approvalStepLabels[lang].pending,{exact:true}).waitFor();
  assert.equal(await approved.getAttribute('aria-label'),names[0]+' · '+progress.approved);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-approval-state="approved"]')).backgroundColor==='rgb(232, 247, 239)');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-approval-state="pending"]')].every(el=>getComputedStyle(el).backgroundColor==='rgb(255, 246, 219)'));
  await page.evaluate(()=>window.setApprovalStatus({steps:[{employeeId:2,approved:true},{employeeId:3,rejected:true},{employeeId:4,blocked:true}]}));
  await approvalButton.locator('[data-approval-state="rejected"]').waitFor();await approvalButton.locator('[data-approval-state="stopped"]').waitFor();
  assert.notEqual(await approvalButton.locator('[data-approval-state="rejected"]').evaluate(el=>getComputedStyle(el).backgroundColor),await approved.evaluate(el=>getComputedStyle(el).backgroundColor));
  await page.getByTestId('expense-approval-button').click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-admin').waitFor();assert.equal(await dialog.getByRole('combobox').count(),4);assert.equal(await dialog.getByRole('button',{name:t.confirmSave,exact:true}).count(),1);assert.equal(await page.getByLabel('Memo').inputValue(),'Preserved input');
  adminPreview=true;await page.reload();await page.getByRole('button',{name:'Save',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByTestId('expense-approval-button').locator('[data-approval-state="approved"]').getByText('Current user',{exact:true}).first().waitFor();
  await page.getByTestId('expense-approval-button').click();dialog=page.getByRole('dialog');assert.equal(await dialog.locator('.MuiAlert-standardInfo').count(),0);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.setApprovalStatus({exempt:true,exemptionReason:'SAVED_POLICY',steps:[]}));
  assert.equal(await page.getByTestId('expense-approval-button').getByText('Current user',{exact:true}).count(),2);
  await page.getByTestId('expense-approval-button').click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-final-self').waitFor();assert.equal(await dialog.getByRole('combobox').count(),2);assert.equal(await dialog.locator('#expense-stage-middle-disabled').isDisabled(),true);
  await page.keyboard.press('Escape');dynamicPreview=true;adminPreview=false;await page.reload();await page.getByTestId('expense-approval-button').click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-step3').waitFor();
  for(const [i,name] of ['Operations lead','Senior accountant','Administrator'].entries()){await dialog.locator('#expense-stage-step'+(i+1)).click();await page.getByRole('option',{name,exact:true}).click();}
  await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.dataset.saved),undefined);
  await page.getByRole('button',{name:'Save',exact:true}).click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-step3').waitFor();await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.dataset.saved),'true');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: save opens sequential vertical approvals, cancellation preserves inputs, confirmation saves, header edits eligible staff, fixed self drafter, policy-driven intermediate/final stages and configurable operations/accounting/admin chain, ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
