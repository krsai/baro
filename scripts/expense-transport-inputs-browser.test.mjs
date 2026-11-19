import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
const fixture=path.resolve('frontend/expense-transport-inputs-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Table,TableBody} from '@mui/material';import theme from '/src/theme';import Line from '/src/components/ExpenseRequestLine.jsx';import {newExpenseLine} from '/src/utils/expenseRequest.mjs';import {EXPENSE_REQUEST_TEXT} from '/src/constants/expenseRequest.js';
const requiredFields=window.mode==='required'?['transportDate','origin','destination']:[];
const code={id:7,code:'ARFE',isActive:true,vatEnabled:false,base:{entryMode:'GENERAL',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields}};
function App(){const[line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,quantity:'1',unitPrice:'10',...(window.mode==='saved'?{itemId:'old',workOrderId:30,styleId:40,styleProcessId:50,linkedOrderIds:[30],linkedStyles:[{workOrderId:30,styleId:40}],itemOwnerOrgId:21,itemOwnerSnapshot:{id:21,name:'OLD OWNER'},itemTypeId:31,itemAttributeSnapshot:{type:{id:31,nameEn:'OLD TYPE'}}}:{}),details:window.mode==='saved'?{transportDate:'2026-11-01',origin:'OLD ORIGIN',destination:'OLD DESTINATION',length:'10',width:'20',height:'5',evidenceFile:'receipt.pdf'}:{evidenceFile:'receipt.pdf'}});window.currentLine=line;const onChange=React.useCallback((key,patch)=>setLine(current=>({...current,...patch})),[]);const onStatus=React.useCallback((key,valid)=>{window.valid=valid;},[]);return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Table,null,React.createElement(TableBody,null,React.createElement(Line,{line,index:0,codes:[code],orders:[{dbId:30,orderNumber:'OLD ORDER'}],settings:{defaultVatRate:'0'},orgId:1,labels:EXPENSE_REQUEST_TEXT[window.lang],languageCode:window.lang,onChange,onStatus,onRemove:()=>{}}))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/expense-transport-inputs-acceptance.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1600,390])for(const mode of ['hidden','required','saved']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({lang,mode})=>{window.lang=lang;window.mode=mode;},{lang,mode});
  await page.route('**/transaction-request-options?*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{styles:[{id:40,name:'OLD STYLE',code:'OLD',styleProcesses:[{id:50,processName:'OLD PROCESS',processCode:'P'}]}],plans:[]}}));
  await page.goto('http://127.0.0.1:'+port+'/expense-transport-inputs-acceptance.html');
  const row=page.getByTestId('expense-line');await row.waitFor();
  assert.equal(await row.locator('[data-testid="MoreHorizIcon"]').count(),0,'hidden fields cannot be added outside settings');
  await row.getByRole('button',{name:({ko:'증빙',en:'Evidence',vi:'Chứng từ'})[lang],exact:true}).click();
  const dialog=page.getByRole('dialog'),date=dialog.locator('input[type="date"]');
  if(mode==='hidden')assert.equal(await date.count(),0);
  else if(mode==='required'){
   assert.equal(await date.isEnabled(),true);assert.equal(await date.getAttribute('required'),'');await date.fill('2026-11-19');
   for(const name of [({ko:'출발지',en:'Origin',vi:'Nơi đi'})[lang],({ko:'도착지',en:'Destination',vi:'Nơi đến'})[lang]]){
    const field=dialog.getByRole('textbox',{name,exact:false});assert.equal(await field.isEnabled(),true);await field.fill('NEW');
   }
   assert.deepEqual(await page.evaluate(()=>window.currentLine.details),{transportDate:'2026-11-19',origin:'NEW',destination:'NEW',evidenceFile:'receipt.pdf'});
  }else{
   assert.equal(await date.isDisabled(),true);assert.equal(await date.inputValue(),'2026-11-01');
   for(const value of ['OLD ORIGIN','OLD DESTINATION','10','20','5'])assert.equal(await dialog.locator('input').evaluateAll((inputs,value)=>inputs.some(input=>input.value===value&&input.disabled),value),true);
   assert.deepEqual(await page.evaluate(()=>window.currentLine.details),{transportDate:'2026-11-01',origin:'OLD ORIGIN',destination:'OLD DESTINATION',length:'10',width:'20',height:'5',evidenceFile:'receipt.pdf'});
  }
  await page.waitForFunction(()=>window.valid===true);assert.equal(await page.evaluate(()=>window.currentLine.details.reference),undefined,'removed reference is not secretly required');if(mode==='saved'){for(const key of ['order','style','process'])assert.equal(await dialog.getByRole('textbox',{name:EXPENSE_REQUEST_TEXT[lang][key],exact:true}).isDisabled(),true,'hidden historical references are read only');for(const value of ['OLD OWNER','OLD TYPE'])assert.equal(await dialog.locator('input').evaluateAll((inputs,value)=>inputs.some(input=>input.value===value&&input.readOnly),value),true);assert.equal(await page.evaluate(()=>window.currentLine.itemOwnerOrgId),21);assert.equal(await page.evaluate(()=>window.currentLine.itemTypeId),31);}assert.deepEqual(errors,[]);await page.close();console.log('PASS expense transport settings',lang,width,mode);
 }
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
