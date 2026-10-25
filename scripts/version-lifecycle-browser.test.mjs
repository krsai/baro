import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/version-lifecycle-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import Page from'/src/pages/App/style/styleDetail/ProcessVersionManager.jsx';
window.notifications=[];const notify=(message,level)=>window.notifications.push({message,level});function App(){const[id,setId]=React.useState(1);window.changeStyle=setId;return React.createElement(Page,{open:true,styleId:id,orgId:1,onClose:()=>{},notify});}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43241,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/version-lifecycle-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const [lang,confirm,save] of [['ko','현재 공정 확정','저장'],['en','Confirm current processes','Save'],['vi','Xác nhận công đoạn hiện tại','Lưu']]){
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  let state={versions:[],assignments:[],hasUnconfirmedChanges:true},attempts=0,rangeWrites=0,releaseOld,oldSeen;
  const seen=new Promise(resolve=>oldSeen=resolve),gate=new Promise(resolve=>releaseOld=resolve);
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/styles/*/process-**',async r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   const id=Number(r.request().url().match(/styles\/(\d+)\//)?.[1]);
   if(id===3){oldSeen();await gate;return r.fulfill({headers,json:{versions:[{id:99,versionNumber:99,name:'STALE VERSION',processCount:1}],assignments:[],hasUnconfirmedChanges:false}});}
   if(id===2)return r.fulfill({headers,json:{versions:[],assignments:[],hasUnconfirmedChanges:false}});
   if(r.request().method()==='PUT'){rangeWrites++;return r.fulfill({headers,json:{ok:true}});}
   if(r.request().method()==='POST'){
    attempts++;if(attempts===1)return r.fulfill({headers,status:500,json:{error:'SIMULATED_CONFIRM_FAILURE'}});
    if(state.hasUnconfirmedChanges){const number=state.versions.length+1;state.versions.push({id:number,versionNumber:number,name:'Ver.'+number,confirmedDate:'2026-10-25',processCount:number});state.hasUnconfirmedChanges=false;}
    return r.fulfill({headers,json:state.versions.at(-1)});
   }
   return r.fulfill({headers,json:state});
  });
  await page.goto(`http://127.0.0.1:${port}/version-lifecycle-acceptance.html`);
  await page.getByRole('button',{name:confirm,exact:true}).waitFor();
  assert.equal(await page.locator('[data-version-target]').count(),0);assert.equal(await page.getByRole('button',{name:save,exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:confirm,exact:true}).click();await page.waitForFunction(()=>window.notifications.some(row=>row.level==='error'));
  await page.getByRole('button',{name:confirm,exact:true}).click();await page.locator('[data-version-id="1"]').waitFor();
  assert.equal(attempts,2);assert.equal(state.versions.length,1);assert.equal(state.assignments.length,0);assert.equal(rangeWrites,0);
  assert.equal(await page.getByRole('button',{name:save,exact:true}).isDisabled(),true,'a confirmed version does not require a target or a range save');
  state.assignments=[{assignmentPlanId:10,orderNo:'FIRST',versionId:1,assignmentQuantity:5,assignedAt:'2026-10-25'}];
  state.hasUnconfirmedChanges=true;await page.reload();await page.getByRole('button',{name:confirm,exact:true}).waitFor();
  await page.getByRole('button',{name:confirm,exact:true}).click();await page.locator('[data-version-id="2"]').waitFor();
  assert.equal(state.assignments[0].versionId,1,'confirmation leaves existing targets on their original version');
  assert.equal(await page.locator('[data-version-target="10"]').getByText('Ver.1',{exact:true}).count(),1);
  state.assignments[0].isVersionLocked=true;state.assignments.push({assignmentPlanId:11,orderNo:'LATER',versionId:2,assignmentQuantity:5,assignedAt:'2026-10-26'});
  await page.reload();await page.locator('[data-version-target="11"]').waitFor();
  assert.equal(await page.locator('[data-version-target="10"]').getByText('Ver.1',{exact:true}).count(),1);
  assert.equal(await page.locator('[data-version-target="11"]').getByText('Ver.2',{exact:true}).count(),1);assert.equal(rangeWrites,0);
  await page.evaluate(()=>window.changeStyle(3));await seen;await page.evaluate(()=>window.changeStyle(2));
  await page.waitForFunction(()=>!document.querySelector('[data-version-id]'));releaseOld();await page.waitForTimeout(150);
  assert.equal(await page.getByText('STALE VERSION',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:confirm,exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log(`${lang}: no-target confirmation, retry, future default, historical protection and stale-response guard passed`);await page.close();
 }
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
