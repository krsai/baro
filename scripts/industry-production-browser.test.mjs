import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/industry-production-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Settings from '/src/components/IndustryProductionSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings)));</script></body></html>`);
const port=43212,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/industry-production-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const [lang,cost,save,defaultLabel] of [['ko','연결 안 함 · 비용만 기록','저장','코드 기본값 유지'],['en','No link · cost only','Save','Keep code default'],['vi','Không liên kết · chỉ chi phí','Lưu','Giữ mặc định của mã']]){
  for(const [orgId,role] of [[1,'ADMIN'],[2,'OPERATOR']]){
   const page=await browser.newPage({viewport:{width:1024,height:850}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:${orgId},activeOrgRole:'${role}'});`}));
   await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
   await page.route('**/app-settings/industry-production?*',async r=>{
    assert.equal(new URL(r.request().url()).searchParams.get('orgId'),String(orgId));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Access-Control-Allow-Headers':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
    if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);return r.fulfill({headers,json:body});}
    return r.fulfill({headers,json:[{id:10,nameKo:'프린트',nameEn:'Printing',nameVi:'In ấn',productionLinkRequired:null}]});
   });
   await page.goto(`http://127.0.0.1:${port}/industry-production-acceptance.html`);
   const select=page.getByRole('combobox');await select.waitFor();assert.equal(await select.textContent(),defaultLabel);
   if(role==='ADMIN'){
    await select.click();await page.getByRole('option',{name:cost,exact:true}).click();await page.getByRole('button',{name:save,exact:true}).click();
    await page.getByRole('alert').waitFor();assert.deepEqual(writes,[{systemIndustryId:10,productionLinkRequired:false}]);
    assert.equal(await page.getByRole('button',{name:save,exact:true}).isDisabled(),true);
   }else{assert.equal(await select.isDisabled(),true);assert.equal(await page.getByRole('button',{name:save,exact:true}).count(),0);assert.deepEqual(writes,[]);}
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);await page.close();
  }
 }
 console.log('Industry settings UI passed ko/en/vi: industry FK save, inherited defaults, tenant scope, read-only roles and mobile layout.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
