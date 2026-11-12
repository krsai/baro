import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {workRequestText} from '../frontend/src/constants/dashboardWorkRequests.js';
const file=path.resolve('frontend/dashboard-work-acceptance.html'),port=43382;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Card from'/src/components/WorkRequestsCard.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Card,{orgId:1,languageCode:new URLSearchParams(location.search).get('lang')}))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const t=workRequestText[lang],context=await browser.newContext({viewport:{width:1100,height:800}});let row=null,reads=0,saves=[];const errors=[];
  const setup=async actor=>{const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
   await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
   await page.route('**/dashboard/work-requests**',async r=>{const req=r.request(),url=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
    if(url.pathname.endsWith('/recipients'))return r.fulfill({headers,json:[{id:2,employeeNo:'B002',name:'Receiver'}]});
    if(req.method()==='POST'){
     const body=req.postDataJSON();if(body.action){if(body.action==='UPDATE'){assert.equal(actor,1);assert.equal(body.version,row.version);row={...row,title:body.title,message:body.message,version:row.version+1};}else if(body.action==='COMPLETE'){assert.equal(actor,2);row={...row,status:'DONE',completedAt:new Date().toISOString(),version:row.version+1};}else row={...row,[actor===1?'senderHiddenAt':'recipientHiddenAt']:new Date().toISOString(),version:row.version+1};return r.fulfill({headers,json:row});}
     assert.equal(actor,1);saves.push(body);if(!row)row={id:'task-1',senderId:1,recipientId:2,senderName:'Admin',recipientName:'Receiver',title:body.title,message:body.message,status:'OPEN',version:1,createdAt:new Date().toISOString()};
     if(saves.length===1)return r.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});
     assert.deepEqual(saves[0],body,'uncertain retry must preserve the original request');return r.fulfill({headers,json:row});
    }
    reads++;const hidden=row?.[actor===1?'senderHiddenAt':'recipientHiddenAt'];return r.fulfill({headers,json:{actorId:actor,canCreate:actor===1,rows:row&&!hidden?[row]:[],hasMore:false}});
   });await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}?lang=${lang}`);await page.getByText(t.empty,{exact:true}).waitFor();return page;};
  const a=await setup(1),b=await setup(2);
  for(const filter of await a.getByRole('combobox').all())assert.ok((await filter.boundingBox()).width<=162);
assert.equal(await b.getByRole('button',{name:t.create,exact:true}).count(),0);
  await a.getByRole('button',{name:t.create,exact:true}).click();const dialog=a.getByRole('dialog');await dialog.getByRole('textbox',{name:t.recipient,exact:true}).fill('B002');await dialog.getByRole('textbox',{name:t.recipient,exact:true}).press('Enter');
  await dialog.getByRole('textbox',{name:t.subject,exact:true}).fill('Review order');await dialog.getByRole('textbox',{name:t.message,exact:true}).fill('Confirm assignment before production.');await dialog.getByRole('button',{name:t.send,exact:true}).click();await dialog.getByText(t.uncertain,{exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:t.subject,exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:t.send,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await b.clock.fastForward(11000);await b.getByText('Review order',{exact:true}).waitFor();assert.equal(Math.round((await b.locator('[data-dashboard-card]').boundingBox()).height),128);assert.equal(await a.getByRole('button',{name:t.complete,exact:true}).count(),0);
  await a.getByRole('button',{name:t.edit,exact:true}).click();await a.getByRole('dialog').getByRole('textbox',{name:t.message,exact:true}).fill('Updated instructions.');await a.getByRole('dialog').getByRole('button',{name:t.save,exact:true}).click();await a.getByRole('dialog').waitFor({state:'hidden'});await b.clock.fastForward(11000);await b.getByRole('button',{name:/Review order/}).first().click();await b.getByRole('dialog').getByText('Updated instructions.',{exact:true}).waitFor();await b.keyboard.press('Escape');await b.getByRole('dialog').waitFor({state:'hidden'});
  await b.getByRole('button',{name:t.complete,exact:true}).click();await b.getByText(t.DONE,{exact:true}).waitFor();await a.clock.fastForward(11000);await a.getByText(t.DONE,{exact:true}).waitFor();
  await a.getByRole('button',{name:t.hide,exact:true}).click();await a.getByText(t.empty,{exact:true}).waitFor();assert.equal(await b.getByText('Review order',{exact:true}).count(),1);
  await b.clock.fastForward(11000);await b.getByRole('button',{name:t.hide,exact:true}).click();await b.getByText(t.empty,{exact:true}).waitFor();
  await a.setViewportSize({width:390,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(reads>4);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Work requests ko/en/vi: two sessions, recipient refresh, admin send, completion, independent hide, uncertain retry and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
