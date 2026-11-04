import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseHistoryText} from '../frontend/src/constants/expenseHistory.js';
import {EXPENSE_REQUEST_TEXT} from '../frontend/src/constants/expenseRequest.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/expense-history-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import History from '/src/components/ExpenseEditHistory.jsx';
const lang=new URLSearchParams(location.search).get('lang');
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(History,{orgId:7,requestId:'18',version:2,languageCode:lang})));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-history-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[];
  const t=expenseHistoryText[lang],labels=EXPENSE_REQUEST_TEXT[lang];
  page.on('pageerror',error=>errors.push(error.message));
  const header={id:18,version:1,managementNumber:'EXP-2026-000018',requestDate:'2026-11-04',partner:{name:'Vendor'},createdByEmployee:{id:1,name:'Original drafter'},remark:'Original remark'};
  const item={id:'item-1',currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',subtotal:'100',vatAmount:'0',amount:'100',description:'Original expense',details:{reference:'REF-001'},transactionCode:{code:'TSTE'}};
  const before={document:header,costs:[item]},after={document:{...header,version:2,remark:'Changed remark'},costs:[{...item,unitPrice:'120',subtotal:'120',amount:'120',description:'Changed expense'}]};
  let fail=true;
  await page.route('**/expense-request-editor/request/18/history?*',route=>{
   requests.push(route.request());assert.equal(route.request().method(),'GET');assert.equal(new URL(route.request().url()).searchParams.get('orgId'),'7');
   const headers={'Access-Control-Allow-Origin':'*'};
   if(fail){fail=false;return route.fulfill({headers,status:500,json:{error:'TEMPORARY'}});}
   return route.fulfill({headers,json:[{id:2,version:2,action:'UPDATE',createdAt:'2026-11-04T02:00:00Z',actor:{id:2,name:'Different editor'},beforeSnapshot:before,afterSnapshot:after}]});
  });
  await page.goto(`http://127.0.0.1:${port}/expense-history-acceptance.html?lang=${lang}`);
  assert.equal(requests.length,0);
  await page.getByRole('button',{name:t.title,exact:true}).click();
  await page.getByText(t.error,{exact:true}).waitFor();
  await page.getByRole('button',{name:t.retry,exact:true}).click();
  await page.getByText(/Different editor/).waitFor();
  for(const [button,description,remark] of [[t.before,'Original expense','Original remark'],[t.after,'Changed expense','Changed remark']]){
   await page.getByRole('button',{name:button,exact:true}).click();
   const view=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:labels.document,exact:true})});
   await view.getByText('Original drafter',{exact:true}).waitFor();
   await view.getByText(description,{exact:true}).first().waitFor();
   await view.getByText('REMARK: '+remark,{exact:true}).waitFor();
   assert.equal(await view.getByText('Different editor',{exact:true}).count(),0);
   await view.getByRole('button',{name:labels.close,exact:true}).click();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: edit history preserves original drafter, identifies editor, shows saved before/after content, retries failed reads; ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
