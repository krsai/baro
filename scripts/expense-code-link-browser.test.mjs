import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/expense-code-link-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Settings from '/src/components/ExpenseCodeLinkSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings)));</script></body></html>`);
const port=43212,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-code-link-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const [lang,cost,save,defaultLabel] of [['ko','주문 + 스타일 + 공정 (필수)','저장','연결 없음'],['en','Order + style + process (required)','Save','No link'],['vi','Đơn hàng + mẫu + công đoạn (bắt buộc)','Lưu','Không liên kết']]){
  for(const [orgId,role] of [[1,'ADMIN'],[2,'OPERATOR']]){
   const page=await browser.newPage({viewport:{width:1024,height:850}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:${orgId},activeOrgRole:'${role}'});`}));
   await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
   await page.route('**/app-settings/expense-code-links?*',async r=>{
    assert.equal(new URL(r.request().url()).searchParams.get('orgId'),String(orgId));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Access-Control-Allow-Headers':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
    if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);return r.fulfill({headers,json:body});}
    return r.fulfill({headers,json:[{id:10,code:'BTH',nameKo:'단춧구멍',nameEn:'Buttonhole',nameVi:'Thùa khuyết',target:'NONE'},{id:20,code:'PRT',nameKo:'인쇄',nameEn:'Printing',nameVi:'In ấn',target:'NONE'}]});
   });
   await page.goto(`http://127.0.0.1:${port}/expense-code-link-acceptance.html`);
   const select=page.getByRole('combobox').first();await select.waitFor();assert.equal(await select.textContent(),defaultLabel);
   assert.equal(await page.locator('tbody tr').count(),2);assert.equal(await page.getByText('BTHV',{exact:true}).count(),0);
   if(role==='ADMIN'){
    await select.click();await page.getByRole('option',{name:cost,exact:true}).click();await page.getByRole('button',{name:save,exact:true}).first().click();
    await page.getByRole('alert').waitFor();assert.deepEqual(writes,[{baseId:10,target:'PROCESS'}]);
    assert.equal(await page.getByRole('button',{name:save,exact:true}).first().isDisabled(),true);
    assert.equal(await page.getByRole('combobox').nth(1).textContent(),defaultLabel);
    for(const [index,target] of [[1,'ORDER'],[2,'STYLE']]){
     await select.click();await page.getByRole('option').nth(index).click();await page.getByRole('button',{name:save,exact:true}).first().click();
     await page.waitForFunction(()=>document.querySelector('tbody button')?.disabled);assert.equal(writes.at(-1).target,target);
    }
   }else{assert.equal(await select.isDisabled(),true);assert.equal(await page.getByRole('button',{name:save,exact:true}).count(),0);assert.deepEqual(writes,[]);}
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);await page.close();
  }
 }
 console.log('Expense code links passed ko/en/vi: one row per base FK, independent targets, no inherited defaults, tenant scope, read-only roles and mobile layout.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
