import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {EXPENSE_TEXT} from '../frontend/src/constants/expenseTypes.js';
const fixture=path.resolve('frontend/accounting-hierarchy-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Codes from'/src/pages/App/CodeBaseSettings.jsx';import Masters from'/src/pages/App/ExpenseMasterSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),location.search.includes('industries')?React.createElement(Masters,{industries:true}):React.createElement(Codes)));
</script></body></html>`);
const port=43318,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const names=(id,code)=>({id,code,nameKo:code,nameEn:code,nameVi:code,isActive:true,entryMode:'GENERAL'});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/accounting-hierarchy-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const industries of [false,true]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[],text=EXPENSE_TEXT[lang];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:null});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  let types=[names(1,'TYPE_A'),names(2,'TYPE_B'),names(3,'TYPE_C')],roles=[names(11,'CUSTOMER'),names(12,'SUPPLIER'),names(13,'LOGISTICS')],rejectOrder=false;
  const services=[{...names(21,'INDUSTRY_A'),partnerRoleId:11}],bases=[{...names(31,'AAA'),expenseTypeId:1,serviceType:services[0],serviceTypeId:21,variants:[]},{...names(32,'BBB'),expenseTypeId:2,serviceType:services[0],serviceTypeId:21,variants:[]}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route(/\/(system-setting-defaults|expense-types)(\/|\?|$)/,async r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='PUT'){
    const body=req.postDataJSON();writes.push({path:url.pathname,body});
    if(url.pathname.endsWith('/order')){
     if(rejectOrder){rejectOrder=false;return r.fulfill({headers,status:409,json:{error:'CATALOGUE_ORDER_CHANGED'}});}
     if(url.pathname.includes('partner-roles'))roles=body.ids.map(id=>roles.find(row=>row.id===id));else types=body.ids.map(id=>types.find(row=>row.id===id));
    }else types=types.map(row=>row.id===body.id?{...row,...body}:row);
    return r.fulfill({headers,json:{ok:true}});
   }
   return r.fulfill({headers,json:url.pathname.endsWith('/expense-types')?types:url.pathname.endsWith('/partner-roles')?roles:url.pathname.endsWith('/code-bases')?bases:services});
  });
  await page.goto(`http://127.0.0.1:${port}/accounting-hierarchy-acceptance.html${industries?'?industries':''}`);
  const nav=page.getByRole('navigation');await nav.waitFor();await nav.locator('[data-rfd-drag-handle-draggable-id]').first().waitFor();
  assert.equal(await nav.locator('[data-testid="ArrowUpwardIcon"],[data-testid="ArrowDownwardIcon"]').count(),0);
  assert.equal(await nav.locator('[data-rfd-drag-handle-draggable-id]').count(),3);
  const selected=industries?'CUSTOMER':'TYPE_A';await nav.getByRole('button',{name:selected+' 1',exact:true}).click();
  if(!industries){
   await page.getByRole('cell',{name:'AAA',exact:true}).first().waitFor();assert.equal(await page.getByRole('cell',{name:'BBB',exact:true}).count(),0);
   await nav.getByRole('button',{name:'TYPE_B 1',exact:true}).click();await page.getByRole('cell',{name:'BBB',exact:true}).first().waitFor();assert.equal(await page.getByRole('cell',{name:'AAA',exact:true}).count(),0);
   await page.getByRole('button',{name:lang==='ko'?'기본 코드 등록':lang==='vi'?'Thêm mã gốc':'Add base code',exact:true}).click();
   assert.equal(await page.getByRole('dialog').getByRole('combobox').first().inputValue(),'TYPE_B');await page.getByRole('dialog').getByRole('button',{name:lang==='ko'?'취소':lang==='vi'?'Hủy':'Cancel',exact:true}).click();
  }
  // Pointer drag preserves selected category and submits the full previous/new ID lists.
  const first=nav.locator('[data-rfd-drag-handle-draggable-id]').first(),last=nav.locator('[data-rfd-drag-handle-draggable-id]').last();
  const start=await first.boundingBox(),end=await last.boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+start.width/2,start.y+start.height/2+8,{steps:3});await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:20});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-rfd-drag-handle-draggable-id]')?.getAttribute('data-rfd-drag-handle-draggable-id')===String(location.search.includes('industries')?12:2));
  assert.deepEqual(writes.at(-1).body,{previousIds:industries?[11,12,13]:[1,2,3],ids:industries?[12,13,11]:[2,3,1]});
  assert.ok(writes.at(-1).path.endsWith(industries?'/partner-roles/order':'/expense-types/order'));
  assert.equal(await nav.locator('[aria-current="true"]').count(),1);
  // A rejected keyboard reorder reloads the authoritative order.
  rejectOrder=true;const handle=nav.locator('[data-rfd-drag-handle-draggable-id]').first();await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');
  await page.getByRole('alert').first().waitFor();assert.equal(writes.length,2);assert.equal(await nav.locator('[data-rfd-drag-handle-draggable-id]').first().getAttribute('data-rfd-drag-handle-draggable-id'),industries?'12':'2');
  if(!industries){
   await nav.getByRole('button',{name:(lang==='ko'?'수정':lang==='vi'?'Sửa':'Edit')+' TYPE_B',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').first().fill('TYPE_B_NEW');await dialog.getByRole('button',{name:lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(writes.at(-1).path,'/expense-types/2');assert.equal(writes.at(-1).body.id,2);assert.equal(writes.at(-1).body.entryMode,'GENERAL');assert.equal(writes.at(-1).body.code,'TYPE_B_NEW');await page.getByRole('cell',{name:'BBB',exact:true}).first().waitFor();
   await page.getByRole('heading',{name:text.codes,exact:true}).waitFor();
  }
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await page.reload();await nav.locator('[data-rfd-drag-handle-draggable-id]').first().waitFor();assert.equal(await nav.locator('[data-rfd-drag-handle-draggable-id]').first().getAttribute('data-rfd-drag-handle-draggable-id'),industries?'12':'2');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Accounting hierarchy ko/en/vi: type/code filtering, preselected creation, type editing, partner/accounting pointer and keyboard drag, persisted order, conflict recovery and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
