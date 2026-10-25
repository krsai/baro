import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/localized-name-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Salary from'/src/pages/App/SalarySystem.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/salary-system']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Salary))));
</script></body></html>`);
const port=43239,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/localized-name-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const [lang,addItem,add,save,history] of [['ko','항목 추가','추가','저장','버전 관리'],['en','Add item','Add','Save','Version history'],['vi','Thêm khoản mục','Thêm','Lưu','Lịch sử phiên bản']]){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:"ADMIN",entryType:"ORG"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let items=[{id:'baseSalary',name:'Base salary',nameEn:'Base salary',nameKo:'기본급',nameVi:'Lương cơ bản',category:'BASE',payTypes:['GENERAL'],formula:['GRADE_RATE'],payCycle:'MONTHLY',paymentMonths:Array.from({length:12},(_,i)=>i+1),required:true}],payload;
  const versions=Array.from({length:22},(_,i)=>({id:i+1,versionNumber:i+1,confirmedAt:'2026-10-25',items:[],effectiveFromMonth:i===21?'2026-10':null}));
  await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Factory',managementStartDate:'2026-04-01'}]}));
  await page.route('**/employee-grades?*',r=>r.fulfill({headers,json:[{grades:[{id:1,code:'G1',nameEn:'Staff',nameKo:'',nameVi:'',isActive:true}]}]}));
  await page.route('**/salary-system/revision?*',r=>r.fulfill({headers,json:{editRevision:'test-revision'}}));
  await page.route('**/salary-system?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='PUT'){payload=r.request().postDataJSON();items=payload.items;}
   return r.fulfill({headers,json:{items,rates:[],versions,editRevision:'test-revision',currencyCode:'VND',defaultVersionStartMonth:'2026-10'}});
  });
  await page.goto(`http://127.0.0.1:${port}/localized-name-acceptance.html`);
  await page.getByRole('button',{name:addItem,exact:true}).waitFor();
  for(const [index,name] of [[0,'English only'],[1,'한국어만'],[2,'Chỉ tiếng Việt']]){
   await page.getByRole('button',{name:addItem,exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   const names=dialog.getByRole('textbox');assert.equal(await names.count(),4,'exactly three names plus the optional cap');
   assert.equal(await dialog.locator('input[required]').count(),0);
   assert.equal(await dialog.getByRole('button',{name:add,exact:true}).isDisabled(),true);
   await names.nth(index).fill(name);
   assert.equal(await dialog.getByRole('button',{name:add,exact:true}).isEnabled(),true);
   await dialog.getByRole('button',{name:add,exact:true}).click();
   await page.getByRole('button',{name:save,exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
   await page.waitForTimeout(200);
   const row=payload?.items.find(row=>row.nameEn===name);assert.ok(row,`${lang}: English fallback persisted`);
   assert.equal(row.name,name);assert.equal(row.nameKo,index===1?name:'');assert.equal(row.nameVi,index===2?name:'');
  }
  await page.getByRole('button',{name:history,exact:true}).click();
  const cards=page.getByRole('dialog').locator('[draggable=true]');assert.equal(await cards.count(),21);
  const bounds=await cards.evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,scroll:n.scrollHeight,client:n.clientHeight})));
  assert.ok(bounds.every(row=>row.height>90&&row.scroll<=row.client+1),'version cards retain their full content height');
  assert.ok(bounds.slice(1).every((row,i)=>row.top>=bounds[i].bottom),'version cards must not overlap');
  assert.deepEqual(errors,[]);console.log(`${lang}: single-language salary add/save, English fallback, three fields, version layout OK`);await page.close();
 }
}finally{if(browser)await browser.close();vite.kill();unlinkSync(fixture);}
