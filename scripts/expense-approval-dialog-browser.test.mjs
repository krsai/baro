import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
import {approvalLineText} from '../frontend/src/constants/approvalLine.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/expense-approval-dialog-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Button,Stack,TextField} from '@mui/material';import theme from '/src/theme';import Approval from '/src/components/ExpenseApprovalSettings.jsx';
function Screen(){const ref=React.useRef(),[value,setValue]=React.useState(null),[approvalStatus,setApprovalStatus]=React.useState(null);window.setApprovalStatus=setApprovalStatus;return React.createElement(Stack,{spacing:2,sx:{p:2,maxWidth:900}},React.createElement(TextField,{label:'Memo',defaultValue:'Preserved input'}),React.createElement(Approval,{ref,horizontalStages:true,orgId:7,languageCode:new URLSearchParams(location.search).get('lang'),value,approvalStatus,onChange:setValue,items:[{unitPrice:'5500',quantity:'1',vatRate:'0',currency:'USD'}]}),React.createElement(Button,{onClick:async()=>{const selection=await ref.current.prepare();if(selection)window.savedSelection=selection;}},'Save'));}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Screen)));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-approval-dialog-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const grades=[{id:2,name:'Senior'},{id:3,name:'Lead'}],drafter={id:1,name:'Current user',orgRole:'OPERATOR',gradeId:2,grade:grades[0]};let exempt=false;
  const pools=[[{id:2,name:'Operations lead',gradeId:3,grade:grades[1]}],[{id:3,name:'Accountant A',gradeId:2,grade:grades[0]},{id:5,name:'Accountant B',gradeId:2,grade:grades[0]}],[{id:4,name:'Administrator',gradeId:3,grade:grades[1]}]];
  await page.route('**/expense-approval-settings?*',r=>r.fulfill({headers,json:{drafter,grades,candidates:pools.flat()}}));
  await page.route('**/expense-approval-preview?*',r=>{
   const selection=r.request().postDataJSON()?.selection||{},stages=exempt?[]:pools.map((candidates,i)=>{const key='step'+(i+1),employeeId=selection[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null);return {key,role:['OPERATOR','ACCOUNTANT','ADMIN'][i],gradeId:i===1?2:3,candidates,employeeId,name:candidates.find(row=>row.id===employeeId)?.name};});
   return r.fulfill({headers,json:{drafter:exempt?{...drafter,orgRole:'ADMIN'}:drafter,stages,complete:stages.every(row=>row.employeeId),policy:{exempt,totals:[{currency:'USD',amount:'5500'}]}}});
  });
  await page.goto(`http://127.0.0.1:${port}/expense-approval-dialog-acceptance.html?lang=${lang}`);
  const t=expenseHeaderActions[lang],line=approvalLineText[lang],band=approvalBandText[lang];
  await page.getByTestId('expense-approval-button').getByText('Current user',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-step3').waitFor();
  assert.equal(await dialog.locator('#expense-stage-drafter').getAttribute('readonly'),'');assert.equal(await dialog.locator('#expense-stage-drafter').inputValue(),'Current user');
  assert.equal(await dialog.getByText(line.sameCompany,{exact:true}).count(),0);assert.equal(await dialog.getByText(line.self,{exact:true}).count(),0);
  assert.equal(await dialog.getByTestId('approval-modal-amount').textContent(),'USD 5,500');
  assert.equal(await dialog.getByLabel(band.role,{exact:true}).count(),3);assert.equal(await dialog.getByLabel(band.grade,{exact:true}).count(),3);
  assert.equal(await dialog.locator('#expense-stage-step1').inputValue(),'Operations lead');assert.equal(await dialog.locator('#expense-stage-step1').getAttribute('readonly'),'');
  assert.equal(await dialog.getByRole('combobox').count(),1);assert.equal(await dialog.getByRole('button',{name:t.confirmSave,exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:t.cancel,exact:true}).click();assert.equal(await page.evaluate(()=>window.savedSelection),undefined);assert.equal(await page.getByLabel('Memo').inputValue(),'Preserved input');
  await page.getByRole('button',{name:'Save',exact:true}).click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-step2').click();
  assert.equal(await page.getByRole('option',{name:/Accountant [AB]/}).count(),2);await page.getByRole('option',{name:'Accountant B',exact:true}).click();
  await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.savedSelection),{step1EmployeeId:2,step2EmployeeId:5,step3EmployeeId:4});
  await page.evaluate(()=>window.setApprovalStatus({steps:[{employeeId:2,approved:true},{employeeId:5,approved:false},{employeeId:4,approved:false}]}));
  const header=page.getByTestId('expense-approval-button');await header.locator('[data-approval-state="approved"]').getByText('Operations lead',{exact:true}).waitFor();await header.locator('[data-approval-state="pending"]').getByText('Accountant B',{exact:true}).waitFor();await header.locator('[data-approval-state="waiting"]').getByText('Administrator',{exact:true}).waitFor();assert.equal(await header.locator('[data-approval-state="pending"]').count(),1);
  exempt=true;await page.reload();await page.getByRole('button',{name:'Save',exact:true}).click();dialog=page.getByRole('dialog');await dialog.locator('#expense-stage-final-self').waitFor();
  assert.equal(await dialog.getByRole('combobox').count(),0);assert.equal(await dialog.getByText(line.self,{exact:true}).count(),0);assert.equal(await dialog.locator('#expense-stage-final-self').inputValue(),'Current user');
  await dialog.getByRole('button',{name:t.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();console.log('PASS',lang,width);
 }
 console.log('PASS: immutable drafter, role/grade/person, automatic sole candidates, explicit multiple choice, save/cancel, amount header and approval states in ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
