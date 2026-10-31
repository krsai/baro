import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/accounting-code-industries-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/AccountingCodeSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page)));</script></body></html>`);
const port=43353,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const named=(id,code)=>({id,code,nameKo:code,nameEn:code,nameVi:code,isActive:true});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/accounting-code-industries-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const roles=[named(1,'SUPPLIER'),named(2,'LOGISTICS')],sources=[{...named(10,'ZIPPER'),partnerRoleId:1,partnerRole:roles[0],entryMode:'GENERAL'},{...named(20,'BUTTON'),partnerRoleId:1,partnerRole:roles[0],entryMode:'GENERAL'},{...named(30,'SHIPPING'),partnerRoleId:2,partnerRole:roles[1],entryMode:'LOGISTICS'},{...named(99,'GENERAL'),partnerRoleId:1,partnerRole:roles[0]}];
  let bases=[{...named(7,'ZIP'),nameKo:'Zipper cost',nameVi:'Zipper cost',nameEn:'Zipper cost',serviceTypeId:10,industryRevision:1,industryIds:[10],industries:[sources[0]],entryMode:'GENERAL',orderInput:'OPTIONAL',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:[],hasUsageHistory:true,variants:[]}],reject=false;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/system-setting-defaults/**',r=>{
   const req=r.request(),url=new URL(req.url());assert.ok(!url.pathname.includes('expense-types'));
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(['PUT','POST'].includes(req.method())){
    const body=req.postDataJSON();writes.push(body);assert.ok(!('expenseTypeId'in body));assert.ok(!('expenseType'in body));assert.deepEqual(body.taxTreatmentIds,[1,2,3]);
    if(reject){reject=false;return r.fulfill({headers,status:409,json:{error:'ACCOUNTING_INDUSTRY_CHANGED'}});}
    if(req.method()==='PUT'){assert.equal(body.serviceTypeId,10);assert.equal(body.entryMode,'GENERAL');bases=bases.map(row=>row.id===body.id?{...row,...body,industryRevision:row.industryRevision+1,industries:sources.filter(source=>body.industryIds.includes(source.id))}:row);}
    else bases.push({...body,id:8,industryRevision:1,industryIds:body.industryIds,industries:sources.filter(source=>body.industryIds.includes(source.id)),hasUsageHistory:false,variants:[]});
    return r.fulfill({headers,json:{ok:true}});
   }
   return r.fulfill({headers,json:url.pathname.endsWith('/code-bases')?bases:url.pathname.endsWith('/partner-roles')?roles:sources});
  });
  await page.goto(`http://127.0.0.1:${port}/accounting-code-industries-acceptance.html`);await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  const nav=page.getByRole('navigation');await nav.getByRole('button',{name:'ZIPPER 1',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1);
  const edit=lang==='ko'?'수정':lang==='vi'?'Sửa':'Edit',save=lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',cancel=lang==='ko'?'취소':lang==='vi'?'Hủy':'Cancel',industry=lang==='ko'?'세부 업종':lang==='vi'?'Ngành chi tiết':'Industry';
  await page.getByRole('button',{name:edit,exact:true}).click();const dialog=page.getByRole('dialog'),selector=dialog.getByRole('combobox',{name:industry,exact:true});
  const mode=lang==='ko'?'입력 방식':lang==='vi'?'Cách nhập':'Input method';await dialog.getByText(mode,{exact:true}).first().waitFor();assert.equal(await dialog.locator('input[value="GENERAL"]').isDisabled(),true);
  await selector.fill('BUTTON');await page.getByRole('option',{name:'BUTTON',exact:true}).click();await page.keyboard.press('Escape');await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(writes[0].industryIds,[10,20]);assert.equal(writes[0].industryRevision,1);
  await nav.getByRole('button',{name:'SUPPLIER 1',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1,'a shared code is counted once in its parent category');await nav.getByRole('button',{name:'BUTTON 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  const add=lang==='ko'?'기본 코드 등록':lang==='vi'?'Thêm mã gốc':'Add base code';await page.getByRole('button',{name:add,exact:true}).click();assert.equal(await dialog.getByText('BUTTON',{exact:true}).count(),1);
  await dialog.getByRole('textbox',{name:lang==='ko'?'기본 코드':lang==='vi'?'Mã gốc':'Base code',exact:true}).fill('BNC');await dialog.getByRole('textbox',{name:lang==='ko'?'이름 (영어 · 대표)':lang==='vi'?'Tên (tiếng Anh · chính)':'Name (English · primary)',exact:true}).fill('Button cost');
  await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes.at(-1).industryIds,[20]);assert.equal(writes.at(-1).entryMode,'GENERAL');
  await page.locator('tbody tr').filter({has:page.getByRole('cell',{name:'ZIP',exact:true})}).getByRole('button',{name:edit,exact:true}).click();
  await selector.fill('SHIPPING');await page.getByRole('option',{name:'SHIPPING',exact:true}).click();await page.keyboard.press('Escape');await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await nav.getByRole('button',{name:'SHIPPING 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  reject=true;await page.getByRole('button',{name:edit,exact:true}).click();await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await selector.isEnabled(),true);await dialog.getByRole('button',{name:cancel,exact:true}).click();
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await page.reload();await nav.getByRole('button',{name:'SHIPPING 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  bases.push({...bases[0],id:9,code:'OLD',nameKo:'Old cost',nameEn:'Old cost',nameVi:'Old cost',isAvailable:false,legacyUsageDisabled:true,entryMode:'PURCHASE',industryIds:[10],industries:[sources[0]]});await page.reload();
  const old=page.locator('tbody tr').filter({has:page.getByRole('cell',{name:'OLD',exact:true})});await old.waitFor();assert.equal(await old.locator('td').nth(3).innerText(),'—');await old.getByRole('button',{name:edit,exact:true}).click();assert.equal(await dialog.locator('input[type="checkbox"]').isDisabled(),true);assert.equal(await dialog.locator('input[type="checkbox"]').isChecked(),false);assert.equal(await dialog.locator('input[value="PURCHASE"]').isDisabled(),true);await dialog.getByRole('button',{name:cancel,exact:true}).click();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Accounting code industries ko/en/vi: N:M edit, unique category counts, source-prefilled creation, fixed used input mode/FKs, stale edit recovery, persistence and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
