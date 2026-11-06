import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalLineText} from '../frontend/src/constants/approvalLine.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
const fixture=path.resolve('frontend/approval-candidate-shortage-acceptance.html'),port=43463;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Dialog from'/src/components/ChangeApprovalDialog';function App(){const ref=React.useRef();return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement('button',{onClick:()=>ref.current.prepare({menu:'BANK_LEDGER',operation:'CREATE',selectionOnly:true,selection:{step1EmployeeId:3},payload:{}})},'Open'),React.createElement(Dialog,{ref,orgId:7,languageCode:new URLSearchParams(location.search).get('lang')}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-candidate-shortage-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],line=approvalLineText[lang],band=approvalBandText[lang],text=changeApprovalText[lang];let reason='ALREADY_SELECTED';page.on('pageerror',error=>errors.push(error.message));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const grade={id:11,name:'Senior',nameKo:'선임',nameEn:'Senior',nameVi:'Cấp cao'},principal={id:12,name:'Principal',nameKo:'책임',nameEn:'Principal',nameVi:'Trưởng'},people=[{id:2,name:'Junior',gradeId:10,grade:{id:10,name:'Junior'}},{id:3,name:'Principal',gradeId:12,grade:principal}];
  await page.route('**/approval-action-settings?*',r=>r.fulfill({headers,json:{grades:[grade,principal]}}));
  await page.route('**/change-approval-preview?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   const selected=r.request().postDataJSON().selection.step1EmployeeId,complete=selected===2&&reason==='ALREADY_SELECTED';
   return r.fulfill({headers,json:{drafter:{id:1,name:'Drafter',orgRole:'ACCOUNTANT',gradeId:11,grade},complete,policy:{totals:[]},stages:[{key:'step1',role:'ACCOUNTANT',employeeId:selected,candidates:people},{key:'step2',role:'ACCOUNTANT',minimumGradeId:11,gradeMatch:'MINIMUM',requiredGrade:grade,employeeId:complete?3:null,candidates:complete?[people[1]]:[],unavailableReason:complete?null:reason}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/approval-candidate-shortage-acceptance.html?lang=${lang}`);await page.getByRole('button',{name:'Open',exact:true}).click();
  const dialog=page.getByRole('dialog'),final=dialog.locator('[data-approval-person-stage="step2"]');
  await final.getByText(line.alreadySelected,{exact:true}).waitFor();assert.equal(await final.getByRole('textbox',{name:band.grade,exact:true}).inputValue(),grade[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[lang]]+line.orAbove);assert.equal(await final.getByRole('combobox').isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:text.request,exact:true}).isDisabled(),true);
  await dialog.locator('#expense-stage-step1').click();await page.getByRole('option',{name:'Junior',exact:true}).click();await final.getByRole('textbox',{name:line.name,exact:true}).waitFor();assert.equal(await final.getByRole('textbox',{name:line.name,exact:true}).inputValue(),'Principal');assert.equal(await dialog.getByRole('button',{name:text.request,exact:true}).isDisabled(),false);
  await dialog.getByRole('button',{name:text.cancel,exact:true}).click();reason='DRAFTER_ONLY';await page.getByRole('button',{name:'Open',exact:true}).click();await final.getByText(line.drafterOnly,{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:text.request,exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:text.cancel,exact:true}).click();reason='GRADE_NOT_CONFIGURED';await page.getByRole('button',{name:'Open',exact:true}).click();await final.getByText(line.gradeNotConfigured,{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:text.request,exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS candidate shortage / minimum grade / corrected selection '+lang+' '+width);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
