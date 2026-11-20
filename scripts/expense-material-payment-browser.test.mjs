import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
import {materialVariantManagementText} from '../frontend/src/constants/materialVariantManagement.js';
import {expensePaymentChecksText} from '../frontend/src/constants/expensePaymentChecks.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
const file='frontend/expense-material-payment-test.html',port=43562;
assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Picker from'/src/components/MaterialItemPicker';import Entry from'/src/pages/App/BankLedgerEntry';import Line from'/src/components/ExpenseRequestLine';import{newExpenseLine}from'/src/utils/expenseRequest.mjs';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest';import{Table,TableBody}from'@mui/material';import{useLanguage}from'/src/context/LanguageContext';
window.testReact=React;
function Material(){const{languageCode}=useLanguage();const[selected,setSelected]=React.useState(null);const[revision,setRevision]=React.useState(0);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>{setSelected(null);setRevision(n=>n+1);}},'Reset picker'),React.createElement(Picker,{key:revision,orgId:1,baseId:8,languageCode,selectVariants:true,autoOpen:!selected,value:selected?.id,snapshot:selected?.data,onChange:setSelected}),React.createElement('output',null,selected?.data.variantId||''));}
const noop=()=>{};const codes=[{id:2,baseId:8,code:'CTNV',vatEnabled:true,isActive:true,taxTreatment:{suffix:'V'},base:{id:8,code:'CTN',nameEn:'Carton Box',entryMode:'GENERAL',requiredFields:[],attributeInputs:{},materialSettings:{enabled:true},orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'}}];
function Expense(){const{languageCode}=useLanguage();const[line,setLine]=React.useState(()=>({...newExpenseLine(),currency:'USD'}));const change=React.useCallback((key,patch)=>setLine(value=>({...value,...patch})),[]);return React.createElement(React.Fragment,null,React.createElement(Table,null,React.createElement(TableBody,null,React.createElement(Line,{line,index:0,codes,orders:[],units:[],settings:{defaultVatRate:8},orgId:1,labels:EXPENSE_REQUEST_TEXT[languageCode],languageCode,onChange:change,onStatus:noop,onRemove:noop,onAdd:noop}))),React.createElement('output',null,line.materialItemSnapshot?.variantId||''));}
const ledger=location.search.includes('ledger'),lineMode=location.search.includes('line');createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:[ledger?'/bank-ledger/edit/source':'/test']},ledger?React.createElement(Routes,null,React.createElement(Route,{path:'/bank-ledger/edit/:entryId',element:React.createElement(Entry)})):React.createElement(lineMode?Expense:Material))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
const names=name=>({nameEn:name,nameKo:name,nameVi:name});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-material-payment-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],t=materialItemText[lang],m=materialVariantManagementText[lang];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const p={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',employeeId:1};export const useAuth=()=>({isAuthenticated:true,activeOrgId:1,activeProfile:p,accessProfile:p});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/components/AppNotice.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export default function Notice({children,action}){return window.testReact.createElement('div',{role:'alert'},children,action);}"}));
  await page.route('**/src/components/PageDialogProvider.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>true});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},unit={id:1,...names('Each')};
  const option={id:'master',baseId:8,industryId:1,unitId:1,variantId:'variant-existing',variantRevision:1,data:{...names('Carton Box'),variantId:'variant-existing',variantRevision:1,itemOwnerOrgId:1,itemOwnerSnapshot:{id:1,name:'BARO'},itemAttributeSnapshot:{type:names('40x50x60')},unit}};
  let options=[option],fail=lang==='ko'&&width===1440;
  await page.route('**/material-items/**',r=>{const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});assert.equal(url.searchParams.get('orgId'),'1');
   if(url.pathname.endsWith('/variant-options'))return r.fulfill({headers,json:{master:{id:'master',data:{unit}},fields:{type:'HIDDEN',color:'HIDDEN'},colors:[]}});
   if(url.pathname.endsWith('/variants')&&req.method()==='POST'){const body=req.postDataJSON();writes.push(body);assert.equal(body.ownerId,1);assert.equal(body.baseId,8);const created={...option,variantId:body.clientKey,data:{...option.data,variantId:body.clientKey}};options=[created];return r.fulfill({headers,json:{id:body.clientKey,revision:1}});}
   assert.equal(url.searchParams.get('variants'),'1');return r.fulfill({headers,status:fail?503:200,json:fail?{error:'TEMPORARY'}:options});
  });
  await page.route('**/code-item-options?*',r=>r.fulfill({headers,json:{owners:[{id:1,code:'BARO',name:'BARO'}],types:[]}}));
  await page.goto(`http://127.0.0.1:${port}/expense-material-payment-test.html`);
  if(fail){await page.getByRole('alert').waitFor();fail=false;await page.getByRole('button',{name:t.retry,exact:true}).click();}
  await page.getByRole('dialog').getByRole('cell',{name:'40x50x60',exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('cell',{name:'40x50x60',exact:true}).dblclick();
  await page.locator('output').filter({hasText:'variant-existing'}).waitFor();
  options=[];await page.getByRole('button',{name:'Reset picker'}).click();
  await page.getByRole('dialog').getByRole('button',{name:t.add,exact:true}).click();
  const editor=page.getByRole('dialog');await editor.getByText(m.add,{exact:true}).waitFor();
  const owner=editor.getByRole('textbox',{name:new RegExp(t.owner)});await owner.fill('BARO');await owner.press('Enter');
  await editor.getByRole('button',{name:t.save,exact:true}).click();
  await page.waitForFunction(()=>Boolean(document.querySelector('output')?.textContent));assert.equal(writes.length,1);
  await page.goto(`http://127.0.0.1:${port}/expense-material-payment-test.html?line`);
  const codeField=page.locator('[data-testid="expense-line"]').getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:true});await codeField.fill('CTNV');await codeField.press('Enter');
  await page.locator('[data-lookup-dialog="true"]').getByRole('cell',{name:'40x50x60',exact:true}).waitFor();
  await page.locator('[data-lookup-dialog="true"]').getByRole('cell',{name:'40x50x60',exact:true}).dblclick();await page.waitForFunction(()=>Boolean(document.querySelector('output')?.textContent));
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  const code={id:2,code:'CTNV',taxTreatment:{suffix:'V'},base:{nameEn:'Cartons',entryMode:'GENERAL',cashDirection:'OUT'}};
  const source={id:'source',revision:'r',accountId:'account',transactionDate:'2026-11-20',direction:'OUT',amount:'100',purpose:'',accountingCodeId:2,evidenceType:'EXPENSE',evidenceNumber:'EXP-1',bankFees:[],expenseItems:[{itemId:'cost',amount:'100',subtotal:'92.59',vatRate:'8',vatAmount:'7.41',accountingCode:code}],settlementLines:[],document:{id:1,version:1,reference:'EXP-1',items:[{id:'cost',remaining:'108',amount:'108',vatRate:'8',accountingCode:code}]} };
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'account',currencyCode:'USD'}]});await reply('**/bank-ledger/entries/source?*',source);await reply('**/bank-ledger/counterparties?*',[]);await reply('**/transaction-codes?*',[code]);await reply('**/app-settings?*',{defaultVatRate:'8'});await reply('**/approval-action-settings?*',{grades:[],settings:{rules:[]},drafter:{id:1,name:'Admin'}});
  await page.goto(`http://127.0.0.1:${port}/expense-material-payment-test.html?ledger`);
  const check=expensePaymentChecksText[lang];await page.getByRole('alert').filter({hasText:check.vat}).waitFor();await page.getByRole('alert').filter({hasText:check.difference}).waitFor();
  const reason=page.getByRole('textbox',{name:new RegExp(check.reason.replace(/[()]/g,'\\$&'))});assert.equal(await reason.getAttribute('required'),'');
  await page.locator('form').evaluate(form=>form.requestSubmit());await page.getByRole('alert').filter({hasText:check.difference}).first().waitFor();
  await reason.fill('VAT difference pending supplier confirmation');assert.equal(await reason.inputValue(),'VAT difference pending supplier confirmation');
  const vat=page.getByRole('textbox',{name:ledgerEntryText[lang].vatRate,exact:true});assert.equal(await vat.getAttribute('readonly'),'');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS expense material registration and VAT/difference guidance',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
