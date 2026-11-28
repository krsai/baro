import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {workRequestText} from '../frontend/src/constants/dashboardWorkRequests.js';
import {taskReportText} from '../frontend/src/constants/taskReports.js';
const file=path.resolve('frontend/task-report-acceptance.html'),port=43384;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import {appThemes} from'/src/theme';import Card from'/src/components/WorkRequestsCard.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme:appThemes[new URLSearchParams(location.search).get('density')]},React.createElement(CssBaseline),React.createElement(Card,{orgId:1,languageCode:new URLSearchParams(location.search).get('lang')}))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const compact of [false,true])for(const touch of [false,true]){
  const t={...workRequestText[lang],...taskReportText[lang]},context=await browser.newContext({hasTouch:touch,viewport:{width:touch?390:1100,height:850}}),errors=[];let row=null,reports=[],attempts=[];
  const setup=async actor=>{const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
   await page.route('**/src/utils/textAcronymLoader*',r=>r.fulfill({contentType:'application/javascript',body:'export const ensureTextAcronyms=async()=>[];export const loadTextAcronyms=async()=>[];'}));
   await page.route('**/dashboard/work-requests**',async r=>{const req=r.request(),url=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
    if(url.pathname.endsWith('/recipients'))return r.fulfill({headers,json:[{id:2,employeeNo:'B002',name:'Receiver'}]});
    if(url.pathname.endsWith('/reports'))return r.fulfill({headers,json:{task:row,reports}});
    if(url.pathname.endsWith('/report')){assert.equal(actor,2);const body=req.postDataJSON();attempts.push(body);if(attempts.length===1)return r.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});assert.deepEqual(body,attempts[0]);reports=[{id:'report-1',body:body.body,files:[],submittedAt:new Date().toISOString(),taskSnapshot:row}];row={...row,status:'DONE',version:2};return r.fulfill({headers,json:reports[0]});}
    if(req.method()==='POST'){const body=req.postDataJSON();assert.equal(actor,1);assert.equal(body.reportRequired,true);assert.equal(body.automaticWarning,true);assert.ok(body.dueAt);row={...body,id:'task-1',senderId:1,recipientId:2,senderName:'Admin',recipientName:'Receiver',status:'OPEN',version:1,requirementVersion:1,createdAt:new Date().toISOString()};return r.fulfill({headers,json:row});}
    return r.fulfill({headers,json:{actorId:actor,canCreate:actor===1,rows:row?[row]:[],hasMore:false,automaticFeedbackEnabled:false}});
   });await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}?lang=${lang}&density=${compact?'compact':'standard'}`);await page.evaluate(value=>document.documentElement.dataset.uiDensity=value?'compact':'default',compact);return page;};
  const click=async locator=>{if(touch)await locator.tap();else{await locator.focus();await locator.press('Enter');}};

  const name=key=>new RegExp('^'+t[key]+'$','i');
  const a=await setup(1);await click(a.getByRole('button',{name:name('assignTask')}));let dialog=a.getByRole('dialog');await dialog.getByRole('textbox',{name:name('recipient')}).fill('B002');await dialog.getByRole('textbox',{name:name('recipient')}).press('Enter');await dialog.getByRole('textbox',{name:name('subject')}).fill('Monthly Closing Task');await dialog.getByRole('textbox',{name:name('message')}).fill('Submit the closing report.');await dialog.getByText(t.automationOff,{exact:true}).waitFor();await click(dialog.getByRole('button',{name:name('send')}));await dialog.waitFor({state:'hidden'});
  const b=await setup(2);await b.getByText('Monthly Closing Task',{exact:true}).waitFor();assert.equal(await b.getByRole('button',{name:name('complete')}).count(),0);await click(b.getByRole('button',{name:name('submitReport')}));dialog=b.getByRole('dialog');const body=dialog.getByRole('textbox',{name:name('reportBody')});await body.fill('Closing completed. Original report text.');await click(dialog.getByRole('button',{name:name('submit')}));await dialog.getByRole('button',{name:name('retry')}).first().waitFor();assert.equal(await body.inputValue(),'Closing completed. Original report text.');assert.equal(await body.isDisabled(),true);await click(dialog.getByRole('button',{name:name('retry')}).last());await dialog.waitFor({state:'hidden'});await b.getByText(t.DONE,{exact:true}).waitFor();assert.equal(attempts.length,2);
  await a.reload();await a.getByText(t.DONE,{exact:true}).waitFor();await click(a.getByRole('button',{name:/Monthly Closing Task/}).first());await a.getByRole('dialog').getByText('Closing completed. Original report text.',{exact:true}).waitFor();assert.equal(await a.getByRole('dialog').getByRole('button',{name:name('submit')}).count(),0);assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Task reports: admin assignment, recipient report, immutable uncertain retry, admin review, ko/en/vi, two densities, keyboard and touch passed (12 combinations).');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
