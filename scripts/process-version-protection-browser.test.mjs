import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/process-protection-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import Page from '/src/pages/App/style/styleDetail/ProcessVersionManager.jsx';const noop=()=>{};createRoot(document.getElementById('root')).render(React.createElement(Page,{open:true,styleId:1,orgId:1,onClose:noop,notify:noop}));</script></body></html>`);
const port=43192,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/process-protection-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/styles/1/process-*',route=>{
    const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({headers,status:204});
    if(request.method()==='PUT'){writes.push(request.postDataJSON());return route.fulfill({headers,json:{ok:true}});}
    return route.fulfill({headers,json:{versions:[{id:10,name:'Ver.10',versionNumber:10,confirmedDate:'2026-08-01',processCount:2},{id:11,name:'Ver.11',versionNumber:11,confirmedDate:'2026-10-14',processCount:3}],assignments:[
      {assignmentPlanId:1,externalId:'A',orderNo:'O-A',assignmentQuantity:100,versionId:10,assignedAt:'2026-08-01'},
      {assignmentPlanId:2,externalId:'B',orderNo:'O-B',assignmentQuantity:100,versionId:10,isVersionLocked:true,versionLockReason:'PRODUCTION_COMPLETED',assignedAt:'2026-08-02'},
      {assignmentPlanId:3,externalId:'C',orderNo:'O-C',assignmentQuantity:100,versionId:10,assignedAt:'2026-08-03'},
    ]}});
  });
  await page.goto(`http://127.0.0.1:${port}/process-protection-acceptance.html`);
  const row=name=>page.getByText(name,{exact:true}).locator('xpath=ancestor::*[@data-version-target][1]');
  await page.getByText('O-B',{exact:true}).waitFor();
  assert.equal(await row('O-B').getByText('Ver.10',{exact:true}).count(),1);
  assert.equal(await row('O-B').getByTestId('LockOutlinedIcon').count(),1);
  const drag=async target=>{const source=await page.locator('[data-version-id="11"]').boundingBox(),dest=await target.boundingBox();await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(source.x+source.width/2+8,source.y+source.height/2);await page.mouse.move(dest.x+dest.width/2,dest.y+dest.height/2,{steps:12});await page.mouse.up();};
  await drag(row('O-B'));
  assert.equal(await row('O-B').getByText('Ver.10',{exact:true}).count(),1);
  await drag(row('O-A'));
  assert.equal(await row('O-A').getByText('Ver.11',{exact:true}).count(),1);
  assert.equal(await row('O-C').getByText('Ver.11',{exact:true}).count(),1);
  assert.equal(await row('O-B').getByText('Ver.10',{exact:true}).count(),1);
  await page.getByRole('button',{name:'저장',exact:true}).click();await page.waitForTimeout(200);
  assert.equal(writes.length,1);assert.deepEqual(writes[0].boundaries,[{versionId:11,startAssignmentPlanId:1}]);assert.deepEqual(errors,[]);
  console.log('Existing process-version UI passed: drag ranges retained, completed assignment keeps Ver.10 while editable assignments preview Ver.11, locked direct drop rejected.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
