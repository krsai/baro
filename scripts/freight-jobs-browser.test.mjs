import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {jobText} from '../frontend/src/constants/freightJobs.js';
const file=path.resolve('frontend/freight-jobs-acceptance.html'),port=43422;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/FreightWorkspace.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/freight-jobs-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  console.log('Checking job and BL management',lang);
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],t=jobText[lang];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  let job=null,bills=[];
  await page.route('**/freight/**',async route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});
   const p=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(p==='options')json=[{id:11,name:'BARO',nameKo:'BARO'}];
   else if(p==='transport-jobs/options')json={employees:[{id:9,name:'Owner'}]};
   else if(p==='transport-jobs'&&req.method()==='POST'){const v=req.postDataJSON();assert.equal(v.customerId,11);assert.equal(v.masterId,undefined);assert.equal(v.houseNumber,undefined);job={...v,id:'job1',number:'SHP-001',version:1,data:{...v.data,customer:{name:'BARO'}}};json=job;}
   else if(p==='transport-jobs')json={rows:job?[job]:[],total:job?1:0};
   else if(p==='transport-jobs/job1'&&req.method()==='GET')json={...job,bills};
   else if(p==='transport-jobs/job1'&&req.method()==='PUT'){job={...job,...req.postDataJSON(),version:job.version+1};json=job;}
   else if(p==='transport-jobs/job1/bills'&&req.method()==='POST'){json={...req.postDataJSON(),version:1};bills.push(json);}
   else if(p.startsWith('transport-jobs/job1/bills/')){const id=p.split('/').at(-1);if(req.method()==='DELETE'){bills=bills.filter(b=>b.id!==id);json={};}else{const v=req.postDataJSON();json={...v,version:v.version+1};bills=bills.map(b=>b.id===id?json:b);}}
   else throw Error('Unexpected request '+p);
   await route.fulfill({headers,json});
  });
  await page.goto(`http://127.0.0.1:${port}/freight-jobs-acceptance.html`);
  await page.getByRole('button',{name:t.new,exact:true}).click();let dialog=page.getByRole('dialog');
  const customer=dialog.getByRole('textbox',{name:t.customer,exact:true});await customer.fill('BARO');await customer.press('Enter');
  await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText('SHP-001',{exact:true}).waitFor();assert.equal(bills.length,0);
  const add=async(kind,number)=>{await page.getByRole('button',{name:kind==='MASTER'?t.addMaster:t.addHouse,exact:true}).click();await dialog.getByRole('textbox',{name:t.billNumber,exact:true}).fill(number);await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText(number,{exact:true}).waitFor();};
  await add('HOUSE','H-001');await add('MASTER','M-001');await add('MASTER','M-002');await add('HOUSE','H-002');
  const house=bills.find(b=>b.number==='H-001');await page.locator(`[data-bill-id="${house.id}"]`).getByRole('button',{name:t.edit,exact:true}).click();
  await dialog.locator('#job-bill-master').click();await page.getByRole('option',{name:'M-001',exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(bills.find(b=>b.id===house.id).masterId,bills.find(b=>b.number==='M-001').id);
  await page.locator(`[data-bill-id="${house.id}"]`).getByRole('button',{name:t.edit,exact:true}).click();await dialog.locator('#job-bill-master').click();await page.getByRole('option',{name:t.unlink,exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(bills.find(b=>b.id===house.id).masterId,null);
  await page.getByRole('button',{name:t.edit,exact:true}).first().click();await dialog.getByRole('textbox',{name:t.origin,exact:true}).fill('Hanoi');await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(job.data.origin,'Hanoi');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: minimal job creation, multiple BLs, delayed Master linkage, unlinking, job edit; ko/en/vi.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
