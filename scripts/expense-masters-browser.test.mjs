import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/expense-masters-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import Page from '/src/pages/App/ExpenseMasterSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('section',{id:'types'},React.createElement(Page)),React.createElement('section',{id:'industries'},React.createElement(Page,{industries:true}))));</script></body></html>`);
const port=43193,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-masters-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const industry={id:4,code:'BUTTONHOLE',nameKo:'단춧구멍',nameEn:'Buttonhole',nameVi:'Khuy',entryMode:'PROCESS',requiredFields:[],orderInput:'REQUIRED',styleInput:'REQUIRED',processInput:'REQUIRED',isActive:true};
  const type={id:1,code:'PRODUCTION',nameKo:'제작 외주',nameEn:'Production outsourcing',nameVi:'Gia công',entryMode:'PROCESS',isActive:true};
  for(const pattern of ['**/expense-types**','**/system-setting-defaults/services**']) await page.route(pattern,route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});
    if(route.request().method()==='PUT'){writes.push({url:route.request().url(),data:route.request().postDataJSON()});return route.fulfill({headers,json:{ok:true}});}
    return route.fulfill({headers,json:route.request().url().includes('expense-types')?[type]:[industry]});
  });
  await page.goto(`http://127.0.0.1:${port}/expense-masters-acceptance.html`);
  await page.locator('#types').getByRole('button',{name:'수정',exact:true}).click();
  await page.getByRole('dialog').getByLabel('한국어 이름').fill('생산 외주');
  await page.getByRole('dialog').getByRole('button',{name:'등록',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(writes[0].data.nameKo,'생산 외주');assert.ok(writes[0].url.endsWith('/expense-types/1'));
  await page.locator('#industries').getByRole('button',{name:'수정',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('한국어 이름').waitFor();
  assert.equal(await dialog.getByLabel('한국어 이름').inputValue(),'단춧구멍');
  assert.equal(await dialog.getByText('입력 방식',{exact:true}).count(),0);
  await dialog.getByLabel('영어 이름').fill('Buttonhole service');
  await dialog.getByRole('button',{name:'등록',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(writes[1].data.nameEn,'Buttonhole service');assert.equal(writes[1].data.entryMode,'PROCESS');
  assert.deepEqual(errors,[]);console.log('Expense masters passed: independent expense type and industry editing, preserved industry identity and no cost input controls in partner industries.');
} finally {await browser?.close();vite.kill();unlinkSync(fixture);}
