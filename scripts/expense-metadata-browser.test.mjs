import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
const fixture=path.resolve('frontend/expense-metadata-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Table,TableBody}from'@mui/material';import theme from'/src/theme';import Line from'/src/components/ExpenseRequestLine.jsx';import Master from'/src/pages/App/ExpenseMasterSettings.jsx';import{newExpenseLine,expenseLinePayload}from'/src/utils/expenseRequest.mjs';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest.js';
function App(){const[line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,quantity:'2',unitPrice:'10'});const change=React.useCallback((_,patch)=>setLine(current=>({...current,...patch})),[]);const status=React.useCallback(()=>{},[]);window.expensePayload=expenseLinePayload(line);const lang=new URLSearchParams(location.search).get('lang');return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),new URLSearchParams(location.search).has('master')?React.createElement(Master,{units:true}):React.createElement(Table,null,React.createElement(TableBody,null,React.createElement(Line,{line,index:0,codes:[{id:7,code:'GENE',isActive:true,vatEnabled:false,base:{entryMode:'GENERAL',orderInput:'OPTIONAL',styleInput:'OPTIONAL',processInput:'HIDDEN'}}],orders:[{dbId:10,orderNumber:'PO-ALPHA'},{dbId:20,orderNumber:'PO-BETA'}],units:[{id:2,nameEn:'Square meter',nameKo:'제곱미터',nameVi:'Mét vuông',isActive:true}],partner:{serviceTypes:[]},settings:{defaultVatRate:'0'},orgId:1,labels:EXPENSE_REQUEST_TEXT[lang],languageCode:lang,onChange:change,onStatus:status,onRemove:()=>{}}))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43302,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-metadata-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));const labels=EXPENSE_REQUEST_TEXT[lang];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:null,activeProfile:{entryType:"SYSTEM",systemRole:"SYSTEM_ADMIN"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/transaction-request-options?*',r=>{const id=Number(new URL(r.request().url()).searchParams.get('workOrderId'));return r.fulfill({headers,json:{styles:[{id:id+100,name:id===10?'Style-Alpha':'Style-Beta',code:'ST'+id,styleProcesses:[]}],plans:[]}});});
  await page.goto(`http://127.0.0.1:${port}/expense-metadata-acceptance.html?lang=${lang}`);
  await page.getByRole('button',{name:labels.detail,exact:true}).click();
  assert.equal(await page.getByRole('checkbox').count(),0,'expanding shows order/style fields without enable checkboxes');
  const order=page.getByRole('combobox',{name:labels.order,exact:true}),style=page.getByRole('combobox',{name:labels.style,exact:true});
  for(const keyword of ['ALPHA','BETA']){await order.fill(keyword);await page.getByRole('option',{name:new RegExp('PO-'+keyword)}).click();}
  await order.press('Escape');
  for(const keyword of ['Style-Alpha','Style-Beta']){await style.fill(keyword);await page.getByRole('option',{name:new RegExp(keyword)}).click();}
  await style.press('Escape');
  await page.getByRole('combobox',{name:labels.unit,exact:true}).click();await page.getByRole('option').last().click();
  const value=await page.evaluate(()=>window.expensePayload);assert.deepEqual(value.linkedOrderIds,[10,20]);assert.equal(value.linkedStyles.length,2);assert.equal(value.unitId,2);assert.equal(value.quantity,'2');assert.equal(value.unitPrice,'10');
  let rows=[{id:1,code:'PCS',nameKo:'개',nameEn:'Piece',nameVi:'Cái',isActive:true,sortOrder:10}],write;
  await page.route('**/system-setting-defaults/expense-units**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='PUT'){write=r.request().postDataJSON();rows=[{...write,id:1}];return r.fulfill({headers,json:rows[0]});}return r.fulfill({headers,json:rows});});
  await page.goto(`http://127.0.0.1:${port}/expense-metadata-acceptance.html?lang=${lang}&master=1`);
  await page.locator('tbody tr').first().getByRole('button').click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox').nth(0).fill('PIECE_NEW');await dialog.getByRole('textbox').nth(1).fill('Renamed piece');await dialog.getByRole('button').last().click();await dialog.waitFor({state:'hidden'});
  assert.equal(write.id,1);assert.equal(write.code,'PIECE_NEW');await page.locator('tbody').getByText('PIECE_NEW',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Expense metadata passed ko/en/vi: direct searchable multiple order/style selection, one unchanged monetary line, units and SYSTEM unit editing.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
