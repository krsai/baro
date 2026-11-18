import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
import {accountingCompactText} from '../frontend/src/constants/accountingCompact.js';

const html='frontend/dashboard-document-load-test.html',jsx='frontend/dashboard-document-load-test.jsx',port=43497;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-document-load-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import{AppProvider}from'/src/context/AppContext';import Dialog from'/src/components/DashboardDocumentDialog';import Panel from'/src/components/DashboardAlertsCard';function Demo(){window.dashboardRouterPath=useLocation().pathname;const[open,setOpen]=React.useState(false),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(false);window.setSummaryLoading=setLoading;window.setSummaryError=setError;return <ThemeProvider theme={theme}><CssBaseline/><AppProvider><h1>Dashboard</h1><input aria-label="Draft" defaultValue="Keep my draft"/><Button onClick={()=>setOpen(true)}>Open alert</Button><Panel title="Alerts" text={{empty:"Empty",failed:"Failed",retry:"Retry"}} items={[]} loading={loading} error={error}>{open&&<Dialog row={{path:['expense','paid'].includes(new URLSearchParams(location.search).get('mode'))?'/outsourcing-record/edit/request/18':'/bank-ledger/edit/1'}} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>setOpen(false)} onNavigate={()=>{}}/>}</Panel></AppProvider></ThemeProvider>;}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="/dashboard" element={<Demo/>}/></Routes></MemoryRouter>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-document-load-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const mode of (process.argv.includes('--paid-only')?['paid']:process.argv.includes('--expense-only')?['expense']:['failure','expense']))for(const lang of ['ko','en','vi'])for(const width of mode==='expense'?[3440,1920,1440,390]:[1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let requests=0,navigations=0;
  page.on('dialog',dialog=>dialog.accept());
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:2};return {isAuthenticated:true,activeOrgId:2,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  if(mode==='failure')await page.route('**/pages/App/BankLedgerEntry*',r=>{requests++;return r.fulfill({contentType:'application/javascript',body:"export default function Detail(){if(!window.detailCanRender)throw new Error('Injected detail render failure');return 'Recovered detail';}"});});
  else{
   const headers={'Access-Control-Allow-Origin':'*'},partner={id:11,name:'Source vendor',isActive:true,type:'MATERIAL_SUPPLIER',serviceTypes:[]};
   const mocks={
    'expense-payees':[partner],
    'transaction-codes':[{id:7,code:'EQPV',isActive:true,nameEn:'International Express Courier Fee',nameKo:'국제 특송 운송 서비스 요금',nameVi:'Phí dịch vụ chuyển phát nhanh quốc tế',vatEnabled:false,base:{isActive:true,entryMode:'GENERAL',requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'}}],
    'app-settings':{defaultVatRate:'0'},orders:[],'expense-units':[{id:1,nameEn:'Shipment',nameKo:'회',nameVi:'Lần',isActive:true}],
    'expense-request-editor/request/18':{managementNumber:'EXP-2026-000003',canonicalSource:{kind:'request',id:'18'},requestDate:'2026-11-12',partnerOrgId:11,partner,version:1,revision:'source-revision',remark:'Original source remark',approverEmployeeIds:[],items:[{itemId:'cost-18',transactionCodeId:7,currency:'VND',unitId:1,quantity:'1',unitPrice:'1399185',vatRate:'0',details:{reference:'SUPPLIER-18',evidenceFile:'Source invoice'},enabled:{order:false,style:false,process:false}}]},
    'entities/11/bank-accounts':{accounts:[{id:'bank-11',currency:{id:1,code:'VND'},bankName:'Bank',accountNumber:'001',accountHolder:'Source vendor',isActive:true}],currencies:[{id:1,code:'VND'}]},
    'expense-requests/18/approval':{version:1,exempt:true,approved:true,steps:[]},
    'partner-classifications/options':{roles:[],industries:[]},'partner-classifications/11':{revision:0,roleIds:[],industryIds:[],industries:[]},'transaction-request-options':{styles:[],plans:[]},
   };
   if(mode==='paid'){
    const source=mocks['expense-request-editor/request/18'];Object.assign(source,{paidCorrectionOnly:true,bankReconciled:true,readOnly:false});source.items[0].vatRate='8';
    mocks['transaction-codes'][0].vatEnabled=true;
    mocks['transaction-codes'].push({...mocks['transaction-codes'][0],id:8,code:'DPDV'});
   }
   for(const [endpoint,json] of Object.entries(mocks))await page.route(`**/${endpoint}?*`,r=>{if(endpoint==='expense-request-editor/request/18')requests++;return r.fulfill({headers,json});});
  }
  await page.goto(`http://127.0.0.1:${port}/dashboard-document-load-test.html?lang=${lang}&mode=${mode}`);
  if(mode==='failure')assert.equal(requests,1,'the source module is loaded before opening the alert');
  await page.getByRole('button',{name:'Open alert',exact:true}).click();
  if(mode==='expense'||mode==='paid'){
   const dialog=page.getByRole('dialog'),remark=dialog.getByTestId('expense-summary').getByRole('textbox');
   await remark.waitFor();
   const table=dialog.getByTestId('expense-entry-table'),row=dialog.getByTestId('expense-line').first();await row.waitFor();
   if(mode==='paid'){
    const text=EXPENSE_REQUEST_TEXT[lang],evidence=ledgerEvidenceText[lang],compact=accountingCompactText[lang],cells=row.locator('td');
    for(const index of [3,4,5,6,7])assert.equal(await cells.nth(index).locator('input').first().isDisabled(),true,'financial input stays locked');
    assert.equal(await cells.nth(11).getByRole('button').isDisabled(),true);assert.equal(await cells.last().locator('[data-table-action=add]').isDisabled(),true);
    assert.equal(await remark.isDisabled(),true);assert.equal(await dialog.getByTestId('expense-payee-button').locator('input').isDisabled(),true);
    const code=cells.nth(1).locator('input');assert.equal(await code.isEnabled(),true);await code.fill('DPDV');await code.press('Tab');assert.equal(await code.inputValue(),'DPDV');assert.equal(await cells.nth(7).locator('input').inputValue(),'8');
    await cells.nth(12).getByRole('button').click();const links=page.getByTestId('expense-line-links');await links.waitFor();const proof=links.getByRole('textbox',{name:evidence.reference,exact:true});assert.equal(await proof.isEnabled(),true);await proof.fill('Corrected evidence.pdf');
    await page.getByRole('dialog').last().getByRole('button',{name:compact.close,exact:true}).click();assert.equal(await code.inputValue(),'DPDV');assert.equal(await cells.nth(7).locator('input').inputValue(),'8');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.close();continue;
   }
   const fits=async element=>element.evaluate(el=>{const style=getComputedStyle(el),canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=style.font;return context.measureText(el.textContent.trim()).width<=el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)+1;});
   const cells=row.locator('td'),currency=cells.nth(3).getByRole('combobox');assert.equal(await currency.innerText(),'VND');assert.ok(await fits(currency),'full currency code fits');
   for(const index of [11,12])assert.ok(await fits(cells.nth(index).getByRole('button')),'full payment/evidence button text fits '+lang+' '+width+' column '+index+' '+await cells.nth(index).getByRole('button').evaluate(el=>JSON.stringify({text:el.textContent,width:el.clientWidth,padding:getComputedStyle(el).padding,font:getComputedStyle(el).font})));
   for(const index of [8,9,10])assert.ok(await cells.nth(index).evaluate(el=>el.scrollWidth<=el.clientWidth+1),'full monetary amount fits');
   const description=cells.nth(2).locator('textarea').first();assert.ok(await description.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'long description wraps without hidden lines');
   const scroll=table.locator('..');if(width>=1920)assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'desktop document uses available width');
   assert.equal(await cells.last().evaluate(el=>getComputedStyle(el).position),'sticky');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.equal(await remark.inputValue(),'Original source remark');assert.equal(await remark.isEnabled(),true);
   await remark.fill('Keep edited source');await page.evaluate(()=>window.setSummaryLoading(true));await page.waitForTimeout(100);assert.equal(await remark.inputValue(),'Keep edited source');
   await page.evaluate(()=>{window.setSummaryLoading(false);window.setSummaryError(true);});await page.waitForTimeout(100);assert.equal(await remark.inputValue(),'Keep edited source');assert.equal(requests,1);await page.evaluate(()=>window.setSummaryError(false));
   assert.equal(await dialog.getByTestId('dashboard-document-load-error').count(),0);assert.equal(requests,1);assert.equal(navigations,1);
   assert.equal(await page.getByRole('textbox',{name:'Draft',includeHidden:true}).inputValue(),'Keep my draft');
   assert.equal(await page.evaluate(()=>window.dashboardRouterPath),'/dashboard');
   await page.keyboard.press('Escape');
   const discard={ko:['저장하지 않은 변경 사항','변경 사항 버리기'],en:['Unsaved changes','Discard changes'],vi:['Thay đổi chưa lưu','Bỏ thay đổi']}[lang];
   await page.getByRole('dialog',{name:discard[0],exact:true}).getByRole('button',{name:discard[1],exact:true}).click();await dialog.waitFor({state:'hidden'});
   await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await page.close();continue;
  }
  const dialog=page.getByRole('dialog');await dialog.getByTestId('dashboard-document-load-error').waitFor();
  assert.equal(requests,1);assert.equal(navigations,1);assert.equal(await page.getByText('Unexpected Application Error!',{exact:true}).count(),0);
  assert.equal(await dialog.getByTestId('dashboard-document-load-error').getAttribute('data-error-kind'),'render');
  assert.equal(await dialog.getByTestId('dashboard-document-load-error').getByRole('button').count(),2);
  await page.evaluate(()=>window.detailCanRender=true);await dialog.getByTestId('dashboard-document-load-error').getByRole('button').first().click();await dialog.getByText('Recovered detail',{exact:true}).waitFor();assert.equal(navigations,1);assert.equal(requests,1);
  assert.equal(await page.getByRole('textbox',{name:'Draft',includeHidden:true}).inputValue(),'Keep my draft');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'Keep my draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'Open alert',exact:true}).click();await dialog.getByText('Recovered detail',{exact:true}).waitFor();assert.equal(navigations,1);assert.equal(requests,1);
  await page.close();
 }
 console.log('PASS dashboard document routes: ko/en/vi desktop/mobile, actual expense editor draft survives parent loading/error refresh without remount, source params preserved, editors preload before the alert opens, render failures recover locally and close/reopen preserves dashboard.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
