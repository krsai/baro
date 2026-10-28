import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync,writeFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const fixture=path.resolve('frontend/invoice-workflow-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{DndContext}from'@dnd-kit/core';import Board from '/src/pages/App/assign/components/FactoryMonthCapacityBoard.jsx';
const base={factoryId:'1',orderNo:'PO-1',quantity:100,isCompleted:true,queueStatus:'completed'};
const closed={...base,id:'closed',label:'ARCHIVED-STYLE',isManagementClosed:true};
const open={...base,id:'open',label:'UNBILLED-STYLE',isManagementClosed:false};
function App(){const[restored,setRestored]=React.useState(false);const row={factoryId:'1',factoryName:'FACTORY',headcount:1,months:[],queuedAssignments:[],reviewRequiredAssignments:[],zeroQuantityOverflowAssignments:[],completedAssignments:[{...closed,isManagementClosed:!restored},open]};return React.createElement(DndContext,null,React.createElement('button',{onClick:()=>setRestored(true)},'Cancel invoice'),React.createElement(Board,{rows:[row],monthKeys:['2026-10'],languageCode:window.testLang}));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43229,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/invoice-workflow-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.goto('http://127.0.0.1:'+port+'/invoice-workflow-acceptance.html');await page.getByText('FACTORY',{exact:true}).waitFor();
  await page.getByRole('button').filter({has:page.locator('svg[data-testid="KeyboardArrowRightIcon"]')}).click();
  await page.getByText('UNBILLED-STYLE',{exact:true}).waitFor();assert.equal(await page.getByText('ARCHIVED-STYLE',{exact:true}).count(),0);
  await page.getByRole('checkbox').check();await page.getByText('ARCHIVED-STYLE',{exact:true}).waitFor();
  assert.equal(await page.getByText({ko:'관리 종료',en:'Management closed',vi:'Đã kết thúc quản lý'}[lang],{exact:true}).count(),1);
  await page.getByRole('checkbox').uncheck();assert.equal(await page.getByText('ARCHIVED-STYLE',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Cancel invoice',exact:true}).click();await page.getByText('ARCHIVED-STYLE',{exact:true}).waitFor();
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Invoice workflow browser passed ko/en/vi: closed assignments hidden by default, history toggle, cancellation restores cards and responsive layouts.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
