import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const fixture='frontend/expense-unit-registration-acceptance.html',port=43338;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Master from '/src/pages/App/ExpenseMasterSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Master,{units:true})));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const mock=(path,body)=>page.route(path,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:null});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:${JSON.stringify(language)}});`);
  await mock('**/src/context/AppContext.jsx*','const noop=()=>{};export const useAppActions=()=>({showNotification:message=>{window.unitNotices??=[];window.unitNotices.push(message);},removeNotification:noop});');
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};let rows=[];
  await page.route('**/system-setting-defaults/expense-units**',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);rows=[{...body,id:42}];return r.fulfill({headers,json:rows[0]});}
   if(r.request().method()==='POST'){
    const body=r.request().postDataJSON();writes.push(body);
    if(writes.length===1)return r.fulfill({headers,status:500,json:{error:'INTERNAL_ERROR'}});
    if(writes.length===2)return r.fulfill({headers,status:409,json:{error:'EXPENSE_UNIT_DUPLICATE'}});
    rows=[{...body,id:42}];return r.fulfill({headers,status:201,json:rows[0]});
   }return r.fulfill({headers,json:rows});
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`);
  await page.getByRole('button',{name:{ko:'단위 등록',en:'Add unit',vi:'Thêm đơn vị'}[language],exact:true}).click();
  const dialog=page.getByRole('dialog'),inputs=dialog.getByRole('textbox');
  for(const [i,value] of ['PKG','Package','패키지','Kiện'].entries())await inputs.nth(i).fill(value);
  await dialog.getByRole('button').last().click();
  await page.waitForFunction(()=>window.unitNotices?.length>=1);
  assert.equal(await inputs.nth(0).inputValue(),'PKG');assert.equal(await inputs.nth(3).inputValue(),'Kiện');
  await dialog.getByRole('button').last().click();
  await page.waitForFunction(()=>window.unitNotices?.length>=2);
  assert.equal(await page.evaluate(()=>window.unitNotices.at(-1)),{ko:'이미 등록된 단위 코드입니다.',en:'This unit code is already registered.',vi:'Mã đơn vị này đã được đăng ký.'}[language]);
  assert.equal(await inputs.nth(1).inputValue(),'Package');
  await dialog.getByRole('button').last().click();await dialog.waitFor({state:'hidden'});
  await page.locator('tbody').getByText('PKG',{exact:true}).waitFor();
  assert.equal(writes.length,3);assert.deepEqual(writes[0],writes[2]);assert.equal(writes[2].nameVi,'Kiện');assert.equal(writes[2].name,undefined);
  for(const code of ['R.TON','R/TON']){
   await page.locator('tbody tr').first().getByRole('button').click();
   await dialog.getByRole('textbox').first().fill(code);
   const save=dialog.getByRole('button',{name:{ko:'저장',en:'Save',vi:'Luu'}[language],exact:true});
   assert.equal(await save.isEnabled(),true,'punctuated unit codes can be edited');
   await save.click();await dialog.waitFor({state:'hidden'});
   await page.locator('tbody').getByText(code,{exact:true}).waitFor();
   assert.equal(writes.at(-1).id,42);assert.equal(writes.at(-1).code,code);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS SYSTEM PKG registration ko/en/vi desktop/mobile: saved list, failed-input retention, retry and localized duplicate errors');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
