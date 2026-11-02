import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/partner-role-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/ExpenseMasterSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(Page)));</script></body></html>`);
const port=43359,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-role-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:null});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAppActions=()=>({setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});`}));
  let roles=[{id:1,code:'CUSTOMER',nameEn:'Customer',nameKo:'Customer',nameVi:'Customer'}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/system-setting-defaults/**',r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='POST'){assert.equal('code' in req.postDataJSON(),false);roles.push({id:2,code:'ROLE_internal',...req.postDataJSON()});return r.fulfill({headers,status:201,json:roles[1]});}
   if(req.method()==='PUT'){assert.equal('code' in req.postDataJSON(),false);Object.assign(roles[1],req.postDataJSON());return r.fulfill({headers,json:roles[1]});}
   if(req.method()==='DELETE'){roles=roles.filter(row=>row.id!==2);return r.fulfill({headers,json:{ok:true}});}
   return r.fulfill({headers,json:url.pathname.endsWith('partner-roles')?roles:[]});
  });
  await page.goto(`http://127.0.0.1:${port}/partner-role-acceptance.html`);
  await page.getByRole('navigation',{name:{ko:'거래 구분',en:'Transaction category',vi:'Nhóm giao dịch'}[lang]}).waitFor();
  await page.getByRole('button',{name:{ko:'거래 구분 등록',en:'Add transaction category',vi:'Thêm nhóm giao dịch'}[lang],exact:true}).click();
  let dialog=page.getByRole('dialog');const inputs=dialog.locator('input');
  assert.equal(await inputs.count(),3);
  await inputs.nth(0).fill('Custom');await inputs.nth(1).fill('Custom');await inputs.nth(2).fill('Custom');
  await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation').getByRole('button',{name:'Custom 0',exact:true}).click();
  await page.getByRole('button',{name:{ko:'거래 구분 수정',en:'Edit transaction category',vi:'Sửa nhóm giao dịch'}[lang],exact:true}).click();
  dialog=page.getByRole('dialog');assert.equal(await dialog.locator('input').count(),3);
  for(let i=0;i<3;i++)await dialog.locator('input').nth(i).fill('Renamed');
  await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation').getByRole('button',{name:'Renamed 0',exact:true}).waitFor();
  await page.getByRole('button',{name:{ko:'삭제',en:'Delete',vi:'Xóa'}[lang],exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:{ko:'삭제',en:'Delete',vi:'Xóa'}[lang],exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('navigation').getByRole('button',{name:'Customer 0',exact:true}).waitFor();assert.equal(roles.length,1);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner categories: create, edit, delete and mobile layout pass in ko/en/vi.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
