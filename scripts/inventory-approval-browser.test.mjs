import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {inventoryApprovalText} from '../frontend/src/constants/inventoryApproval.js';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
import {workTimeText} from '../frontend/src/constants/workTime.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
import {approvalDefaultsText} from '../frontend/src/constants/approvalDefaults.js';

const fixture='frontend/inventory-approval-acceptance.html',port=43294;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import Workspace from '/src/pages/App/inventory/InventoryWorkspace.jsx';import ApprovalSettings from '/src/pages/App/ApprovalSettings.jsx';
import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';
const settings=new URLSearchParams(location.search).has('settings');
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:[settings?'/approval-settings?menu=INVENTORY':'/inventory/movements']},settings?React.createElement(ApprovalSettings,{systemDefaults:new URLSearchParams(location.search).has('system')}):React.createElement(Workspace,{view:'history'}))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});
let browser;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
try{
 for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(language)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const a={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop};export const useAppActions=()=>a;'}));
  let deleted=false,pending=false;
  const master={nameEn:'Fixture movement',nameKo:'Fixture movement',nameVi:'Fixture movement',baseSnapshot:{code:'CTN'},unit:{nameEn:'Each'}};
  const row={id:'movement',revision:2,status:'APPROVED',date:'2026-11-20',quantity:'10',remark:'',master,attributes:{owner:{name:'BARO'}}};
  await page.route('**/inventory-entry**',r=>{
   const req=r.request(),url=new URL(req.url()),path=url.pathname;
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(path.endsWith('/history'))return r.fulfill({headers,json:deleted?[]:[{...row,deletePending:pending}]});
   if(path.endsWith('/approvals'))return r.fulfill({headers,json:pending&&!deleted?[{...row,id:'approval',operation:'DELETE',revision:1,canDecide:true,drafter:{id:3,name:'Drafter'},stages:[{employeeId:4,name:'Manager'}]}]:[]});
   if(path.endsWith('/approval-preview')){assert.equal(url.searchParams.get('orgId'),'1');if(language==='en'&&url.searchParams.get('operation')==='DELETE'){const chosen=JSON.parse(url.searchParams.get('selection')||'{}').step1EmployeeId;return r.fulfill({headers,json:{policy:{revision:1},drafter:{id:3,name:'Drafter'},stages:[{key:'step1',role:'ACCOUNTANT',employeeId:chosen||null,candidates:[{id:4,name:'Manager'},{id:5,name:'Backup'}]}]}});}return r.fulfill({headers,json:{policy:{revision:1},drafter:{id:3,name:'Drafter'},stages:[{employeeId:4,name:'Manager',key:'step1'}]}});}
   if(path.endsWith('/masters'))return r.fulfill({headers,json:[]});
   writes.push({path,body:req.postDataJSON()});
   if(path.endsWith('/delete-request'))pending=true;
   if(path.endsWith('/decision'))deleted=true;
   return r.fulfill({headers,status:201,json:{id:'approval',status:'APPROVED'}});
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`);
  const t=inventoryApprovalText[language];
  await page.getByRole('button',{name:t.register,exact:true}).click();
  await page.getByRole('dialog').waitFor();assert.equal(new URL(page.url()).pathname,'/'+fixture.split('/')[1]);
  await page.getByRole('dialog').getByRole('button',{name:t.cancel,exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:t.delete,exact:true}).click();
  await page.getByRole('dialog').getByText(t.deleteConfirm).waitFor();
  if(language==='en'){assert.equal(await page.getByRole('dialog').getByRole('button',{name:t.submit,exact:true}).isDisabled(),true);await page.getByRole('dialog').getByRole('combobox',{name:/Name/}).click().catch(async e=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText(),cause:e.message}));});await page.getByRole('option',{name:'Manager',exact:true}).click();}
  await page.getByRole('dialog').getByRole('button',{name:t.submit,exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:t.approve,exact:true}).click();
  await page.getByRole('cell',{name:'Fixture movement',exact:true}).waitFor({state:'hidden'});
  assert.equal(writes.length,2);assert.equal(writes[0].body.approvalRevision,1);assert.equal(writes[0].body.approvalSelection.step1EmployeeId,4);assert.equal(writes[1].body.decision,'APPROVED');
  assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),writes=[];
 await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
 await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
 await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const a={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop};export const useAppActions=()=>a;'}));
 await page.route('**/approval-action-settings**',r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
  if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);return r.fulfill({headers,json:{saved:body.changes.map(change=>({...change,settings:{...change.settings,revision:change.settings.revision+1}}))}});}
  return r.fulfill({headers,json:{canEdit:true,grades:[{id:1,name:'Senior',nameEn:'Senior'}],settings:{version:2,revision:1,drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],stages:[{role:'ACCOUNTANT',gradeId:1,gradeMatch:'MINIMUM'}]}}});
 });
 await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}?settings`);
 const editor=page.getByTestId('work-time-approval-settings').first(),stages=editor.locator('[data-inventory-stage]');
 await stages.first().waitFor();assert.equal(await stages.count(),1);
 await editor.getByRole('button',{name:workTimeText.en.add,exact:true}).click();assert.equal(await stages.count(),2);
 await stages.nth(1).getByRole('combobox',{name:approvalBandText.en.role+' 2',exact:true}).click();
 const adminOption=page.getByRole('option',{name:approvalBandText.en.ADMIN,exact:true});
 await adminOption.hover();
 assert.equal(await adminOption.evaluate(node=>document.activeElement===node),true,'mouse candidate and keyboard focus agree');
 assert.equal(await adminOption.evaluate(node=>{const text=document.createRange();text.selectNodeContents(node);const r=text.getBoundingClientRect(),box=node.getBoundingClientRect(),style=getComputedStyle(node);return r.height>0&&r.top>=box.top&&r.bottom<=box.bottom&&style.color!==style.backgroundColor&&style.color!=='rgba(0, 0, 0, 0)';}),true,'third option text fits and remains visible');
 await page.getByRole('option',{name:approvalBandText.en.ADMIN,exact:true}).click();
 await editor.getByRole('button',{name:approvalBandText.en.addMiddle,exact:true}).first().click();assert.equal(await stages.count(),3);
 await stages.first().getByRole('button',{name:approvalBandText.en.remove,exact:true}).click();assert.equal(await stages.count(),2);
 await stages.first().getByRole('button',{name:approvalBandText.en.reorderStage+' 1',exact:true}).focus();
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await page.waitForTimeout(350);
 await page.getByRole('button',{name:approvalSettingsText.en.save,exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="approval-settings-page"]'));
 assert.equal(writes.length,1);assert.equal(writes[0].changes.length,1);assert.equal(writes[0].changes[0].menu,'INVENTORY');assert.equal(writes[0].changes[0].operation,'CREATE');assert.equal(writes[0].changes[0].settings.rules,undefined);assert.deepEqual(writes[0].changes[0].settings.drafterRoles,['ADMIN','OPERATOR','ACCOUNTANT']);assert.deepEqual(writes[0].changes[0].settings.stages.map(stage=>stage.role),['ADMIN','ACCOUNTANT']);assert.equal(writes[0].changes[0].settings.stages[1].gradeId,1);
 await page.getByRole('button',{name:approvalSettingsText.en.save,exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('button.MuiLoadingButton-loading'));
 while(await stages.count())await stages.first().getByRole('button',{name:approvalBandText.en.remove,exact:true}).click();
 await editor.getByText(approvalDefaultsText.en.noApproval,{exact:true}).waitFor();
 await editor.getByRole('button',{name:workTimeText.en.add,exact:true}).click();assert.equal(await stages.count(),1);
 await stages.first().getByRole('button',{name:approvalBandText.en.remove,exact:true}).click();
 await page.getByRole('button',{name:approvalSettingsText.en.save,exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="approval-settings-page"]'));
 assert.deepEqual(writes.at(-1).changes[0].settings.stages,[],'last final card can be removed and empty line saved');
 await page.close();
 const system=await browser.newPage({viewport:{width:1440,height:1000}}),systemWrites=[];
 await system.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:null});'}));
 await system.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
 await system.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});'}));
 await system.route('**/system-approval-action-settings**',r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
  if(r.request().method()==='PUT'){const body=r.request().postDataJSON();systemWrites.push(body);return r.fulfill({headers,json:{saved:body.changes.map(change=>({...change,settings:{...change.settings,revision:change.settings.revision+1}}))}});}
  return r.fulfill({headers,json:{canEdit:true,grades:[],settings:{revision:1,source:'SYSTEM',drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],stages:[]}}});
 });
 await system.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}?settings&system`);
 await system.getByRole('heading',{name:approvalDefaultsText.en.system,exact:true}).waitFor();
 assert.equal(await system.locator('[data-approval-source]').count(),0);
 const systemEditor=system.getByTestId('work-time-approval-settings').first();
 await systemEditor.getByText(approvalDefaultsText.en.noApproval,{exact:true}).waitFor();
 await systemEditor.getByRole('button',{name:workTimeText.en.add,exact:true}).click();
 const systemSaved=system.waitForResponse(response=>response.url().includes('/system-approval-action-settings/batch')&&response.request().method()==='PUT');
 await system.getByRole('button',{name:approvalSettingsText.en.save,exact:true}).click();
 await systemSaved;
 assert.equal(systemWrites.length,1);assert.equal(systemWrites[0].changes[0].menu,'INVENTORY');
 await system.close();
 console.log('PASS inventory registration modal, deletion approval and physical removal UI (ko/en/vi desktop/mobile); system/company settings; hover/focus and last-card removal');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
