import {TRANSACTION_CLASSIFICATION_FLOW} from '../frontend/src/constants/industryHierarchy.js';
import {accountingDirectionText} from '../frontend/src/constants/accountingDirection.js';
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
  sources.push(...Array.from({length:80},(_,i)=>({...named(100+i,'Extra subtype '+String(i).padStart(2,'0')),partnerRoleId:i%2?2:1,partnerRole:roles[i%2?1:0]})));
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
  await page.getByText(TRANSACTION_CLASSIFICATION_FLOW[lang],{exact:true}).waitFor();
  const nav=page.getByRole('navigation');await nav.getByRole('button',{name:'ZIPPER 1',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1);
  const edit=lang==='ko'?'수정':lang==='vi'?'Sửa':'Edit',save=lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',cancel=lang==='ko'?'취소':lang==='vi'?'Hủy':'Cancel',industry=lang==='ko'?'세부 업종':lang==='vi'?'Ngành nghề':'Industry';
  await page.getByRole('button',{name:edit,exact:true}).click();const dialog=page.getByRole('dialog'),picker={ko:{open:'세부 업종 선택',search:'세부 업종 검색',selected:'선택 항목',close:'선택창 닫기'},en:{open:'Select industries',search:'Search industries',selected:'Selected',close:'Close industry selection'},vi:{open:'Chọn ngành nghề',search:'Tìm ngành nghề',selected:'Đã chọn',close:'Đóng chọn ngành nghề'}}[lang],openPicker=dialog.getByRole('button',{name:picker.open,exact:true}),panel=dialog.locator('#accounting-subtype-panel'),selector=panel.getByRole('textbox',{name:picker.search,exact:true});
  for(const kind of ['subtypes','inputs']){const row=dialog.locator('[data-accounting-summary="'+kind+'"]'),heading=await row.locator('h2').boundingBox(),items=await row.locator('[data-selection-items]').boundingBox(),button=await row.getByRole('button').last().boundingBox();assert.ok(items.x>heading.x);assert.ok(button.x>items.x);assert.ok(Math.abs(heading.y+heading.height/2-button.y-button.height/2)<2);assert.ok((await row.boundingBox()).height<85);}
  const dir=accountingDirectionText[lang];await dialog.locator('#accounting-cash-direction').click();await page.getByRole('option',{name:dir.IN,exact:true}).click();
  const mode=lang==='ko'?'입력 방식':lang==='vi'?'Cách nhập':'Input method';assert.equal(await dialog.getByText(mode,{exact:true}).count(),0);
  await openPicker.click();await selector.waitFor();assert.equal(await page.getByRole('listbox').count(),0);const right=await panel.boundingBox(),left=await dialog.locator('[data-accounting-summary="subtypes"]').boundingBox();assert.ok(right.x>=left.x+left.width);assert.ok(await panel.locator('input[type=checkbox]').count()>80);
  await panel.getByRole('button',{name:'LOGISTICS',exact:true}).click();assert.equal(await panel.getByRole('checkbox',{name:'ZIPPER',exact:true}).count(),0);await panel.getByRole('checkbox',{name:'SHIPPING',exact:true}).waitFor();await panel.getByRole('button',{name:{ko:'전체',en:'All',vi:'Tất cả'}[lang],exact:true}).click();
  await selector.fill('no-matching-subtype');await page.getByText({ko:'일치하는 세부 업종이 없습니다.',en:'No matching industries.',vi:'Không có ngành nghề phù hợp.'}[lang],{exact:true}).waitFor();
  await selector.fill('BUTTON');assert.equal(await panel.getByRole('checkbox',{name:'BUTTON',exact:true}).count(),1);
  await panel.getByRole('checkbox',{name:'BUTTON',exact:true}).focus();await page.keyboard.press('Space');await panel.getByRole('checkbox',{name:picker.selected,exact:true}).check();assert.equal(await panel.getByRole('checkbox',{name:'BUTTON',exact:true}).isChecked(),true);await selector.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await openPicker.getAttribute('aria-expanded'),'false');await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(writes[0].industryIds,[10,20]);assert.equal(writes[0].cashDirection,'IN');assert.equal(writes[0].industryRevision,1);
  await nav.getByRole('button',{name:'SUPPLIER 1',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1,'a shared code is counted once in its parent category');await nav.getByRole('button',{name:'BUTTON 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  const add=lang==='ko'?'기본 코드 등록':lang==='vi'?'Thêm mã gốc':'Add base code';await page.getByRole('button',{name:add,exact:true}).click();assert.equal(await dialog.getByText('BUTTON',{exact:true}).count(),1);
  assert.equal(await dialog.getByRole('table').count(),0);await dialog.locator('#accounting-input-toggle').click();await dialog.locator('#accounting-input-panel').waitFor();
  assert.equal(await dialog.locator('input[value="HIDDEN"]').count(),6,'only configurable fields appear; evidence number is always required');
  assert.equal(await dialog.getByRole('table').locator('.MuiInputLabel-root').count(),0,'field names already appear in the left column');
  await dialog.getByRole('table').getByRole('combobox').first().click();await page.getByRole('option',{name:{ko:'필수',en:'Required',vi:'Bắt buộc'}[lang],exact:true}).click();
  await dialog.getByRole('textbox',{name:lang==='ko'?'기본 코드':lang==='vi'?'Mã gốc':'Base code',exact:true}).fill('BNC');await dialog.getByRole('textbox',{name:lang==='ko'?'이름 (영어 · 대표)':lang==='vi'?'Tên (tiếng Anh · chính)':'Name (English · primary)',exact:true}).fill('Button cost');
  await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes.at(-1).industryIds,[20]);assert.equal(writes.at(-1).entryMode,'GENERAL');assert.equal(writes.at(-1).orderInput,'REQUIRED');
  await page.locator('tbody tr').filter({has:page.getByRole('cell',{name:'ZIP',exact:true})}).getByRole('button',{name:edit,exact:true}).click();
  await openPicker.click();await selector.fill('SHIPPING');await panel.getByRole('checkbox',{name:'SHIPPING',exact:true}).check();await selector.press('Escape');await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await nav.getByRole('button',{name:'SHIPPING 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  reject=true;await page.getByRole('button',{name:edit,exact:true}).click();await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await openPicker.isEnabled(),true);await dialog.getByRole('button',{name:cancel,exact:true}).click();
  for(const width of [768,390]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:edit,exact:true}).click();await openPicker.click();await selector.fill('Extra subtype 79');await panel.getByRole('checkbox',{name:'Extra subtype 79',exact:true}).check();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const bounds=await panel.boundingBox();assert.ok(bounds.width<=width);await panel.getByRole('button',{name:picker.close,exact:true}).click();await panel.waitFor({state:'hidden'});assert.equal(await dialog.getByText('Extra subtype 79',{exact:true}).count(),1);await dialog.locator('#accounting-input-toggle').click();const inputPanel=dialog.locator('#accounting-input-panel');await inputPanel.waitFor();assert.equal(await inputPanel.getByRole('combobox').count(),6);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await inputPanel.press('Escape');await inputPanel.waitFor({state:'hidden'});await dialog.getByRole('button',{name:cancel,exact:true}).click();}await page.setViewportSize({width:1440,height:1000});
  await page.reload();await nav.getByRole('button',{name:'SHIPPING 1',exact:true}).click();await page.getByRole('cell',{name:'ZIP',exact:true}).waitFor();
  bases.push({...bases[0],id:9,code:'OLD',nameKo:'Old cost',nameEn:'Old cost',nameVi:'Old cost',isAvailable:false,legacyUsageDisabled:true,entryMode:'PURCHASE',industryIds:[10],industries:[sources[0]]});await page.reload();
  const old=page.locator('tbody tr').filter({has:page.getByRole('cell',{name:'OLD',exact:true})});await old.waitFor();assert.equal(await old.locator('td').nth(4).innerText(),'—');await old.getByRole('button',{name:edit,exact:true}).click();assert.equal(await dialog.locator('input[type="checkbox"]').isDisabled(),true);assert.equal(await dialog.locator('input[type="checkbox"]').isChecked(),false);assert.equal(await dialog.locator('input[value="PURCHASE"]').count(),0);await dialog.getByRole('button',{name:cancel,exact:true}).click();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Accounting code industries ko/en/vi: N:M edit, unique category counts, source-prefilled creation, fixed used input mode/FKs, stale edit recovery, persistence and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
