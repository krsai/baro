import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {payrollManagementText} from '../frontend/src/constants/payrollManagement.js';
const file=path.resolve('frontend/payroll-payable-management-test.html'),entry=file.replace('.html','.jsx'),port=43446;
assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(file,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/payroll-payable-management-test.jsx"></script>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter,Routes,Route}from'react-router-dom';import theme from'/src/theme';import Page from'/src/pages/App/payroll/PayrollEntry';createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter initialEntries={['/payroll/2026-09?factoryId=1']}><Routes><Route path="/payroll/:payrollId" element={<Page/>}/></Routes></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-payable-management-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=payrollManagementText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const mock=(pattern,body)=>page.route(pattern,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:"ADMIN"}});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
  await mock('**/src/context/AppContext.jsx*','const actions={showNotification:()=>{}};export const useAppActions=()=>actions;');
  await mock('**/src/utils/attributeApi.js*','export const fetchAttributes=async()=>({roles:[]});');
  await mock('**/src/utils/apiClient.js*',`export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url,options={}){
    window.requests??=[];window.requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(options.method==='PUT'){const body=JSON.parse(options.body);window.writes??=[];window.writes.push(body);if(window.writes.length===1)throw Error('PAYROLL_MANAGEMENT_PAYMENT_LINKED');return {snapshotId:1,snapshotRevision:3,managementRevision:body.revision+1,payableManagementExcluded:body.excluded};}
    if(url.startsWith('/employees'))return [];
    if(url.startsWith('/payroll/calendar'))return {factories:[{id:1,name:'Hanoi'}]};
    return {snapshotId:window.unsaved?null:1,snapshotExists:true,snapshotRevision:3,managementRevision:0,payableManagementExcluded:false,canManagePayables:!window.readonly,isProvisional:false,month:'2026-09',employees:[{workerId:3,factoryId:1,workerName:'Test Worker',payType:'FIXED',baseSalary:1000000,netSalary:1000000,grossSalary:1000000,salaryItems:[]}]};
  }`);
  await page.goto(`http://127.0.0.1:${port}/payroll-payable-management-test.html`);
  await page.getByText('Test Worker',{exact:true}).waitFor();
  const toggle=page.getByRole('switch',{name:t.label});
  // MUI versions may expose a native checkbox rather than role=switch.
  const control=await toggle.count()?toggle:page.getByRole('checkbox',{name:t.label});
  assert.equal(await control.isChecked(),false);await control.click();
  await page.getByText(t.PAYROLL_MANAGEMENT_PAYMENT_LINKED,{exact:true}).waitFor();
  assert.equal(await control.isChecked(),false,'failed save does not change checked state');
  await page.getByText('Test Worker',{exact:true}).waitFor();
  await control.click();await page.getByText(t.help,{exact:true}).waitFor();assert.equal(await control.isChecked(),true);
  const writes=await page.evaluate(()=>window.writes);assert.equal(writes[0].clientKey,writes[1].clientKey,'retry uses same request identity');
  assert.equal((await page.evaluate(()=>window.requests.filter(r=>r.method==='GET'&&r.url.startsWith('/payroll?')).length)),1,'saving does not reload calculation');
  await control.click();await page.waitForFunction(()=>window.writes.length===3);await page.getByText(t.help,{exact:true}).waitFor({state:'hidden'});assert.equal(await control.isChecked(),false);
  assert.equal((await page.evaluate(()=>window.writes[2].revision)),1);
  await page.addInitScript(()=>{window.readonly=true;});await page.reload();await page.getByText('Test Worker',{exact:true}).waitFor();assert.equal(await control.isDisabled(),true,'read-only access cannot toggle');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Payroll management toggle: ko/en/vi, desktop/mobile, failure/retry, restore, read-only and calculation preservation passed.');
}finally{await browser?.close();server.kill();for(const p of [file,entry])if(existsSync(p))unlinkSync(p);}
