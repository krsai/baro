import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {accountingDirectionText} from '../frontend/src/constants/accountingDirection.js';
const fixture=path.resolve('frontend/accounting-anomaly-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import Field from'/src/components/AccountingCodeField.jsx';import{validExpenseLine}from'/src/utils/expenseRequest.mjs';
const codes=[{id:1,code:'RECEIPT',nameEn:'Receipt',base:{cashDirection:'IN',orderInput:'HIDDEN'}},{id:2,code:'PAYMENT',nameEn:'Payment',base:{cashDirection:'OUT',orderInput:'HIDDEN'}}];
function App(){const[id,setId]=React.useState(1);return React.createElement('main',{style:{padding:16}},React.createElement(Field,{codes,value:id,onChange:setId,languageCode:new URLSearchParams(location.search).get('lang'),direction:'OUT'}),React.createElement(Button,{onClick:()=>window.saved=id,disabled:!validExpenseLine({transactionCodeId:id,unitPrice:'10',quantity:'1',vatRate:'0',currency:'USD',details:{reference:'R1',evidenceFile:'file.pdf'},enabled:{}},codes.find(c=>c.id===id),'USD')},'Save'));}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App)));
</script></body></html>`);
const port=43319,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/accounting-anomaly-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/accounting-anomaly-acceptance.html?lang=${lang}`);
  await page.getByRole('status').filter({hasText:accountingDirectionText[lang].mismatch}).waitFor();
  assert.equal(await page.locator('input[aria-invalid=true]').count(),0);await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved),1);
  await page.getByRole('textbox').focus();await page.keyboard.press('F2');const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('textbox').fill('');
  assert.equal(await dialog.getByRole('cell',{name:'RECEIPT',exact:true}).count(),1);await dialog.getByRole('cell',{name:'PAYMENT',exact:true}).dblclick();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('status').count(),0);await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved),2);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Accounting anomaly: ko/en/vi PC/mobile warnings, both choices and non-blocking expense validation passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
