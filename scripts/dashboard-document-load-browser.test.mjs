import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

const html='frontend/dashboard-document-load-test.html',jsx='frontend/dashboard-document-load-test.jsx',port=43497;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-document-load-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import{AppProvider}from'/src/context/AppContext';import Dialog from'/src/components/DashboardDocumentDialog';import Panel from'/src/components/DashboardAlertsCard';function Demo(){window.dashboardRouterPath=useLocation().pathname;const[open,setOpen]=React.useState(false),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(false);window.setSummaryLoading=setLoading;window.setSummaryError=setError;return <ThemeProvider theme={theme}><CssBaseline/><AppProvider><h1>Dashboard</h1><input aria-label="Draft" defaultValue="Keep my draft"/><Button onClick={()=>setOpen(true)}>Open alert</Button><Panel title="Alerts" text={{empty:"Empty",failed:"Failed",retry:"Retry"}} items={[]} loading={loading} error={error}>{open&&<Dialog row={{path:new URLSearchParams(location.search).get('mode')==='expense'?'/outsourcing-record/edit/request/18':'/bank-ledger/edit/1'}} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>setOpen(false)} onNavigate={()=>{}}/>}</Panel></AppProvider></ThemeProvider>;}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="/dashboard" element={<Demo/>}/></Routes></MemoryRouter>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-document-load-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const mode of ['failure','expense'])for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let requests=0,navigations=0;
  page.on('dialog',dialog=>dialog.accept());
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:2};return {isAuthenticated:true,activeOrgId:2,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  if(mode==='failure')await page.route('**/pages/App/BankLedgerEntry*',r=>{requests++;return r.abort('failed');});
  else{
   const headers={'Access-Control-Allow-Origin':'*'},partner={id:11,name:'Source vendor',isActive:true,type:'MATERIAL_SUPPLIER',serviceTypes:[]};
   const mocks={
    'expense-payees':[partner],
    'transaction-codes':[{id:7,code:'EQPV',isActive:true,nameEn:'Equipment purchase',nameKo:'장비 구매',nameVi:'Mua thiết bị',vatEnabled:false,base:{isActive:true,entryMode:'GENERAL',requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'}}],
    'app-settings':{defaultVatRate:'0'},orders:[],'expense-units':[],
    'expense-request-editor/request/18':{managementNumber:'EXP-2026-000003',canonicalSource:{kind:'request',id:'18'},requestDate:'2026-11-12',partnerOrgId:11,partner,version:1,revision:'source-revision',remark:'Original source remark',approverEmployeeIds:[],items:[{itemId:'cost-18',transactionCodeId:7,currency:'VND',quantity:'1',unitPrice:'130000',vatRate:'0',details:{reference:'SUPPLIER-18',evidenceFile:'Source invoice'},enabled:{order:false,style:false,process:false}}]},
    'entities/11/bank-accounts':{accounts:[{id:'bank-11',currency:{id:1,code:'VND'},bankName:'Bank',accountNumber:'001',accountHolder:'Source vendor',isActive:true}],currencies:[{id:1,code:'VND'}]},
    'expense-requests/18/approval':{version:1,exempt:true,approved:true,steps:[]},
    'partner-classifications/options':{roles:[],industries:[]},'partner-classifications/11':{revision:0,roleIds:[],industryIds:[],industries:[]},'transaction-request-options':{styles:[],plans:[]},
   };
   for(const [endpoint,json] of Object.entries(mocks))await page.route(`**/${endpoint}?*`,r=>{if(endpoint==='expense-request-editor/request/18')requests++;return r.fulfill({headers,json});});
  }
  await page.goto(`http://127.0.0.1:${port}/dashboard-document-load-test.html?lang=${lang}&mode=${mode}`);
  await page.getByRole('button',{name:'Open alert',exact:true}).click();
  if(mode==='expense'){
   const dialog=page.getByRole('dialog'),remark=dialog.getByTestId('expense-summary').getByRole('textbox');
   await remark.waitFor();assert.equal(await remark.inputValue(),'Original source remark');assert.equal(await remark.isEnabled(),true);
   await remark.fill('Keep edited source');await page.evaluate(()=>window.setSummaryLoading(true));await page.waitForTimeout(100);assert.equal(await remark.inputValue(),'Keep edited source');
   await page.evaluate(()=>{window.setSummaryLoading(false);window.setSummaryError(true);});await page.waitForTimeout(100);assert.equal(await remark.inputValue(),'Keep edited source');assert.equal(requests,1);await page.evaluate(()=>window.setSummaryError(false));
   assert.equal(await dialog.getByTestId('dashboard-document-load-error').count(),0);assert.equal(requests,1);assert.equal(navigations,1);
   assert.equal(await page.getByRole('textbox',{name:'Draft',includeHidden:true}).inputValue(),'Keep my draft');
   assert.equal(await page.evaluate(()=>window.dashboardRouterPath),'/dashboard');
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await page.close();continue;
  }
  const dialog=page.getByRole('dialog');await dialog.getByTestId('dashboard-document-load-error').waitFor();
  assert.equal(requests,1);assert.equal(navigations,1);assert.equal(await page.getByText('Unexpected Application Error!',{exact:true}).count(),0);
  assert.equal(await dialog.getByTestId('dashboard-document-load-error').getByRole('button').count(),1);
  assert.equal(await page.getByRole('textbox',{name:'Draft',includeHidden:true}).inputValue(),'Keep my draft');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'Keep my draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'Open alert',exact:true}).click();await page.getByTestId('dashboard-document-load-error').waitFor();assert.equal(navigations,1);
  await page.close();
 }
 console.log('PASS dashboard document routes: ko/en/vi desktop/mobile, actual expense editor draft survives parent loading/error refresh without remount, source params preserved, module failure stays local and close/reopen preserves dashboard.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
