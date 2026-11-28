import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {employeeFeedbackText} from '../frontend/src/constants/employeeFeedback.js';
import {feedbackAutomationText} from '../frontend/src/constants/feedbackAutomation.js';
import feedback from '../backend/dist/services/employeeFeedback.js';
const html='frontend/employee-feedback-test.html',port=43543;
const quick=process.argv.includes('--quick');
assert.ok(!existsSync(html));
writeFileSync(html,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import PageDialogProvider from'/src/components/PageDialogProvider';import Feedback from'/src/pages/App/EmployeeFeedback';import Inbox from'/src/pages/App/EmployeeFeedbackInbox';
const params=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme:appThemes[params.get('theme')]},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(PageDialogProvider,null,React.createElement(params.has('inbox')?Inbox:Feedback)))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/employee-feedback-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of quick?['ko']:['ko','en','vi'])for(const variant of quick?['standard']:['standard','compact'])for(const mobile of quick?[false]:[false,true]){
  const t={...employeeFeedbackText[language],...feedbackAutomationText[language]},page=await browser.newPage({viewport:{width:mobile?390:1440,height:1000},hasTouch:mobile}),errors=[],calls=[];
  let failSave=true,failLoad=true,failInbox=true,policy={enabled:false,version:0},reads=0;
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});await page.addInitScript(language=>localStorage.setItem('baro_language_override',language),language);
  const stub=(pattern,body)=>page.route(pattern,route=>route.fulfill({contentType:'application/javascript',body}));
  await stub('**/src/context/AuthContext.jsx*',`import React from '/node_modules/.vite/deps/react.js';const {useSyncExternalStore}=React;const subscribe=fn=>{addEventListener('feedback-actor',fn);return()=>removeEventListener('feedback-actor',fn);};const get=()=>window.feedbackActor||2;export const useAuth=()=>{const id=useSyncExternalStore(subscribe,get);return{activeOrgId:1,activeOrgRole:'ADMIN',activeProfile:{employeeId:id},user:{id:String(id)}};};`);
  await stub('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${language}'});`);
  await stub('**/src/utils/textAcronymLoader.mjs*','export const loadTextAcronyms=async()=>{};');
  await stub('**/src/context/AppContext.jsx*','const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;');
  const rule={id:'rule-test-001',version:1,employeeId:2,factoryId:1,definition:{name:'Daily Entry Rule',kind:'WARNING',task:'WORK_LOG_ENTRY',timeZone:'Asia/Ho_Chi_Minh',effectiveFrom:'2020-01-01',dueAfterDays:1,deadlineTime:'09:00',threshold:1,weekdays:[0,1,2,3,4,5,6],message:'Entry Reminder',automaticDelivery:false}};
  const draft={id:'draft-test-001',version:1,employeeId:2,ruleId:null,state:'DRAFT',content:{kind:'PRAISE',subject:'Good Work',message:'Thank You',basis:'Verified By Administrator'}};
  const received=[{id:'delivery-001',kind:'WARNING',subject:'Automatic Warning',message:'Warning Sent By Rule',periodStartDate:'2026-11-26',periodEndDate:'2026-11-26',createdAt:'2026-11-27T03:00:00Z',readAt:null,basis:{deadline:'2026-11-27T02:00:00Z',timeZone:'Asia/Ho_Chi_Minh'}},{id:'delivery-002',kind:'PRAISE',subject:'Automatic Praise',message:'Praise Sent By Rule',periodStartDate:'2026-11-25',periodEndDate:'2026-11-25',createdAt:'2026-11-26T03:00:00Z',readAt:null}];
  await page.route('**/employee-feedback?*',route=>{if(failLoad){failLoad=false;return route.fulfill({status:503,json:{error:'test load failure'},headers:{'Access-Control-Allow-Origin':'*'}});}return route.fulfill({json:{mode:'CONFIGURED_AUTOMATION',automation:policy,rules:[rule],drafts:[draft],employees:[{id:2,name:'Worker A',employeeNo:'W1'}],factories:[{id:1,name:'HANOI'}]},headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.route('**/employee-feedback/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS'}});
   const url=route.request().url(),body=route.request().postData()?route.request().postDataJSON():null;calls.push(url);
   const reply=json=>route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
   if(url.includes('/automation')){policy={...body,version:policy.version+1};return reply(policy);}
   if(url.includes('/read')){reads++;received[0].readAt='2026-11-28T01:00:00Z';return reply({id:received[0].id,readAt:received[0].readAt});}
   if(url.includes('/inbox')){if(failInbox){failInbox=false;return route.fulfill({status:503,json:{error:'retry'},headers:{'Access-Control-Allow-Origin':'*'}});}return reply({rows:await page.evaluate(()=>window.feedbackActor||2)===2?received:[],page:0,hasMore:false});}
   if(url.includes('/sent'))return reply({rows:received.map(row=>({...row,employeeName:'Worker A'})),page:0,hasMore:false});
   if(url.includes('/preview'))return route.fulfill({json:feedback.previewEmployeeFeedback(body.definition,body.sample),headers:{'Access-Control-Allow-Origin':'*'}});
   if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'test save failure'},headers:{'Access-Control-Allow-Origin':'*'}});}
   return route.fulfill({json:{...body,version:body.version+1},headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto(`http://127.0.0.1:${port}/employee-feedback-test.html?theme=${variant}`);
  assert.equal(await page.getByRole('button',{name:t.new,exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:language==='ko'?'다시 시도':language==='vi'?'Thử lại':'Try again',exact:true}).first().click();
  const open=page.getByRole('button',{name:'Daily Entry Rule',exact:true});await open.waitFor();if(mobile)await open.tap();else await open.click();
  const name=page.getByRole('textbox',{name:new RegExp(t.name)});await name.fill('Keep This Draft');
  await page.getByRole('tab',{name:t.drafts,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:language==='ko'?'취소':language==='vi'?'Hủy':'Cancel',exact:true}).click();
  assert.equal(await name.inputValue(),'Keep This Draft');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.waitForTimeout(120);assert.equal(await name.inputValue(),'Keep This Draft');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('button').length>0);await page.waitForTimeout(100);
  await page.getByRole('button',{name:t.preview,exact:true}).click();
  await page.getByRole('status').filter({hasText:t.HOLD}).waitFor();
  await page.getByRole('checkbox',{name:t.ruleSwitch,exact:true}).check();await page.getByRole('button',{name:t.save,exact:true}).click();
  const confirm=page.getByRole('dialog').getByRole('button',{name:language==='ko'?'확인':language==='vi'?'Đồng ý':'OK',exact:true});
  await page.getByRole('button',{name:t.companySwitch,exact:true}).click();await confirm.click();await page.getByText(t.on,{exact:true}).waitFor();assert.equal(policy.enabled,true);
  await page.getByRole('button',{name:t.companySwitch,exact:true}).click();await confirm.click();await page.getByText(t.off,{exact:true}).first().waitFor();assert.equal(policy.enabled,false);
  await page.getByRole('tab',{name:t.drafts,exact:true}).click();await page.getByRole('button',{name:'Good Work',exact:true}).click();
  const message=page.getByRole('textbox',{name:new RegExp(t.message)});assert.equal(await message.inputValue(),'Thank You');
  if(mobile)await page.getByRole('button',{name:t.review,exact:true}).tap();else{await page.getByRole('button',{name:t.review,exact:true}).focus();await page.keyboard.press('Enter');}
  await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(element=>element.disabled));assert.equal(await message.isDisabled(),true);
  await page.getByRole('tab',{name:t.sent,exact:true}).click();await page.getByRole('button',{name:'Automatic Warning',exact:true}).click();await page.getByText('Warning Sent By Rule',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:t.markRead,exact:true}).count(),0);
  await page.goto(`http://127.0.0.1:${port}/employee-feedback-test.html?inbox&theme=${variant}`);
  await page.getByRole('button',{name:language==='ko'?'다시 시도':language==='vi'?'Thử lại':'Try again',exact:true}).first().click();
  const warning=page.getByRole('button',{name:'Automatic Warning',exact:true});await warning.waitFor();if(mobile)await warning.tap();else await warning.click();
  assert.equal(reads,0,'preview does not mark a message read');
  const mark=page.getByRole('button',{name:t.markRead,exact:true});if(mobile)await mark.tap();else{await mark.focus();await page.keyboard.press('Enter');}
  await mark.waitFor({state:'hidden'});assert.equal(reads,1);
  await page.getByRole('button',{name:'Automatic Praise',exact:true}).click();await page.getByText('Praise Sent By Rule',{exact:true}).waitFor();
  await page.evaluate(()=>{window.feedbackActor=5;dispatchEvent(new Event('feedback-actor'));});
  await page.getByRole('button',{name:'Automatic Praise',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByText('Praise Sent By Rule',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:/^(Send|Gửi|발송)$/}).count(),0);assert.ok(!calls.some(url=>url.includes('/send')));assert.deepEqual(errors,[]);
  await page.close();console.log('PASS automatic feedback settings, employee inbox, explicit read and preserved drafts',language,variant,mobile?'touch':'keyboard');
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
