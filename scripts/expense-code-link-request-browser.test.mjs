import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
const require=createRequire(import.meta.url),{applyExpenseCodeLinkPolicy}=require('../backend/dist/services/expenseCodeLinkPolicy.js');
const fixture=path.resolve('frontend/expense-code-link-lines-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Table,TableBody} from '@mui/material';import theme from '/src/theme';import Line from '/src/components/ExpenseRequestLine.jsx';import {newExpenseLine} from '/src/utils/expenseRequest.mjs';import {EXPENSE_REQUEST_TEXT} from '/src/constants/expenseRequest.js';
function App(){const[line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,quantity:'2',unitPrice:'10',vatRate:'0',expandLinks:true,...(window.saved?{itemId:'old',linkTarget:'NONE'}:{})});const onChange=React.useCallback((key,patch)=>setLine(current=>({...current,...patch})),[]),onStatus=React.useCallback((key,valid)=>{document.documentElement.dataset.valid=String(valid)},[]);window.currentLine=line;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Table,null,React.createElement(TableBody,null,React.createElement(Line,{line,index:0,codes:window.codes,orders:[{dbId:30,orderNumber:'Order X'},{dbId:31,orderNumber:'Order Y'}],partner:{id:11,serviceTypes:[]},settings:{defaultVatRate:'0'},orgId:1,labels:EXPENSE_REQUEST_TEXT[window.lang],languageCode:window.lang,onChange,onStatus,onRemove:()=>{}}))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43228,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-code-link-lines-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const mode of ['required','production','saved','order','style']){
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));const labels=EXPENSE_REQUEST_TEXT[lang];
  const base={entryMode:['production','style','order'].includes(mode)?'PROCESS':'GENERAL',requiredFields:mode==='order'?['transportDate']:[],isActive:true,expenseType:{nameEn:'Expense'},serviceTypeId:1};
  const codes=['BTHV','BTHE','BTHZ','PRTV'].map((code,index)=>applyExpenseCodeLinkPolicy({id:7+index,code,baseId:index===3?20:10,isActive:true,nameEn:code,vatEnabled:false,base},index===3?'NONE':mode==='style'?'STYLE':mode==='order'?'ORDER':'PROCESS'));
  await page.addInitScript(({lang,codes,saved})=>{window.lang=lang;window.codes=codes;window.saved=saved;},{lang,codes,saved:mode==='saved'});
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/transaction-request-options?*',route=>route.fulfill({headers,json:{styles:[{id:40,name:'Dress',code:'ST',styleProcesses:[{id:50,processName:'Sew',processCode:'P1'},{id:51,processName:'Cut',processCode:'P2'}]}],plans:[{id:60,styleId:40,processIds:[50],factoryName:'Factory A'},{id:61,styleId:40,processIds:[50],factoryName:'Factory B'}]}}));
  await page.goto(`http://127.0.0.1:${port}/expense-code-link-lines-acceptance.html`);
  if(mode==='order'||mode==='style'){
   await page.getByRole('combobox',{name:labels.order,exact:true}).click();await page.getByRole('option',{name:'Order X',exact:true}).click();
   if(mode==='order'){
    const requiredDate=page.locator('input[type="date"][required]');await requiredDate.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.valid),'false');await requiredDate.fill('2026-10-29');
    await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');assert.equal(await page.getByRole('combobox',{name:labels.style,exact:true}).count(),0);
   }else{
    await page.getByRole('combobox',{name:labels.style,exact:true}).click();await page.getByRole('option',{name:/Dress \(ST\)/}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');assert.deepEqual(await page.evaluate(()=>window.currentLine.styleProcessIds),[]);
    await page.getByRole('combobox',{name:labels.process,exact:false}).click();
    await page.getByRole('option',{name:'Sew (P1)',exact:true}).click();await page.getByRole('option',{name:'Cut (P2)',exact:true}).click();await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');assert.deepEqual(await page.evaluate(()=>window.currentLine.styleProcessIds),[50,51]);
    assert.equal(await page.getByRole('combobox',{name:labels.assignment,exact:false}).count(),0);
    await page.getByRole('combobox',{name:labels.order,exact:true}).click();await page.getByRole('option',{name:'Order Y',exact:true}).click();
    await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.currentLine.linkedOrderIds),[30,31]);assert.deepEqual(await page.evaluate(()=>window.currentLine.styleProcessIds),[50,51]);
    await page.getByRole('button',{name:'Order X',exact:true}).locator('.MuiChip-deleteIcon').click();
    await page.waitForFunction(()=>document.documentElement.dataset.valid==='false');assert.deepEqual(await page.evaluate(()=>window.currentLine.styleProcessIds),[]);assert.equal(await page.evaluate(()=>window.currentLine.unitPrice),'10');
   }
   assert.deepEqual(errors,[]);await page.close();continue;
  }
  if(mode==='saved'){
   await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');
   assert.equal(await page.getByRole('combobox',{name:labels.process,exact:false}).count(),0);
  }else{
   await page.waitForFunction(()=>document.documentElement.dataset.valid==='false');
   for(const [field,option] of [['order','Order X'],['style','Dress (ST)'],['process','Sew (P1)']]){
    await page.getByRole('combobox',{name:labels[field],exact:true}).click();await page.getByRole('option',{name:new RegExp(RegExp.escape(option))}).click();
   }
   if(mode==='required')await page.keyboard.press('Escape');
   if(mode==='production'){
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.valid),'false');
    await page.getByRole('combobox',{name:labels.assignment,exact:false}).click();await page.getByRole('option',{name:'Factory B · #61',exact:true}).click();
   }
   await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');
   for(const variant of ['BTHE','BTHZ']){
    await page.getByTestId('expense-line').locator('input').first().fill(variant);await page.getByTestId('expense-line').locator('input').first().press('Tab');
    await page.waitForFunction(()=>document.documentElement.dataset.valid==='false');
    assert.equal(await page.getByRole('combobox',{name:labels.process,exact:false}).count(),1);
   }
   await page.getByTestId('expense-line').locator('input').first().fill('PRTV');await page.getByTestId('expense-line').locator('input').first().press('Tab');
   await page.waitForFunction(()=>document.documentElement.dataset.valid==='true');
   assert.equal(await page.getByRole('combobox',{name:labels.process,exact:false}).count(),0);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Expense line links passed ko/en/vi: shared BTH E/V/Z rule, no-link PRT, explicit assignment choice, general process-reference without production, preserved saved row.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
