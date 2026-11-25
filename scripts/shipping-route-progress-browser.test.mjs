import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Chrome required');
const fixture=path.resolve('frontend/shipping-route-progress-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import {appThemes} from '/src/theme';import Operations from '/src/components/ShippingOperations.jsx';import {LanguageProvider} from '/src/context/LanguageContext.jsx';
const h=React.createElement,params=new URLSearchParams(location.search);function App(){const [job,setJob]=React.useState({id:'job-route',version:1,mode:'SEA',receiptStatus:'ACCEPTED',status:'DRAFT',bills:[],data:{origin:'Hanoi',destination:'Seoul',shipper:'Sender',consignee:'Buyer',cargo:'Garment',originPortCode:'VNHPH',destinationPortCode:'KRINC',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},routeLocationDetails:{ORIGIN_DOOR:{label:'BARO GARMENT'},DESTINATION_DOOR:{label:'THE SAN'}},plannedDate:'2026-11-24',routeDateORIGIN_TERMINAL:'2026-11-25',routeDateDESTINATION_TERMINAL:'2026-11-26'}});return h(ThemeProvider,{theme:appThemes[params.get('theme')||'standard']},h(CssBaseline),h('button',{type:'submit',form:'operations'},'Save'),h(Operations,{job,employees:[],languageCode:params.get('lang'),formId:'operations',onSave:async request=>{window.writes=[...(window.writes||[]),request];if(window.failSave){const e=new Error('failed');e.status=400;throw e;}const next={...job,version:job.version+1,data:{...job.data,workDetails:{...job.data.workDetails,...request.fields}}};setJob(next);return next;}}));}createRoot(document.getElementById('root')).render(h(LanguageProvider,null,h(App)));
</script></body></html>`);
const port=43220,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/date-picker-theme-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const theme of ['standard','compact']){
  const page=await browser.newPage({viewport:{width,height:1100},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.clock.install({time:new Date('2026-11-25T05:00:00Z')});
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default ()=>{};'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification(){}});'}));
  await page.goto('http://127.0.0.1:'+port+'/shipping-route-progress-acceptance.html?lang='+lang+'&theme='+theme);
  const stops=page.locator('[data-shipping-route-step]'),done=()=>stops.locator('[data-route-complete=true]').count();await stops.first().waitFor();
  assert.equal(await stops.count(),4);assert.equal(await done(),1);
  const origin=page.locator('[name=origin]');assert.equal(await origin.inputValue(),'BARO GARMENT (Hanoi)');await origin.focus();assert.equal(await origin.inputValue(),'Hanoi');await origin.fill('New Address');await page.getByRole('button',{name:'Save',exact:true}).focus();assert.equal(await origin.inputValue(),'BARO GARMENT (New Address)');
  const second=stops.nth(1);await second.locator('.MuiIconButton-root').click();await page.getByRole('gridcell',{name:'24',exact:true}).click();assert.equal(await done(),1,'unsaved date cannot mark completion');
  await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>window.writes?.length===1);assert.equal(await done(),1,'failed save cannot mark completion');
  await page.evaluate(()=>window.failSave=false);await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>window.writes?.length===2);await page.waitForFunction(()=>document.querySelectorAll('[data-route-complete=true]').length===2);
  const fields=await page.evaluate(()=>window.writes[1].fields);assert.deepEqual(fields,{origin:'New Address',routeDateORIGIN_TERMINAL:'2026-11-24'});
  assert.equal(await page.locator('input[type=file]').count(),0);
  const completedColor=await stops.first().locator('[data-route-complete] > div').evaluate(el=>getComputedStyle(el).backgroundColor),pendingColor=await stops.last().locator('[data-route-complete] > div').evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(completedColor,pendingColor);
  await page.clock.setSystemTime(new Date('2026-11-27T05:00:00Z'));await page.clock.runFor(30001);assert.equal(await done(),3,'date changes update open screens');assert.equal(await page.evaluate(()=>window.writes.length),2,'automatic progress is read-only');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();console.log('PASS route labels, saved dates, failure preservation and midnight refresh',lang,width,theme);
  }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}

