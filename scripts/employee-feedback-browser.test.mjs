import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {employeeFeedbackText} from '../frontend/src/constants/employeeFeedback.js';
import feedback from '../backend/dist/services/employeeFeedback.js';
const html='frontend/employee-feedback-test.html',port=43543;
const quick=process.argv.includes('--quick');
assert.ok(!existsSync(html));
writeFileSync(html,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import PageDialogProvider from'/src/components/PageDialogProvider';import Feedback from'/src/pages/App/EmployeeFeedback';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme:appThemes[new URLSearchParams(location.search).get('theme')]},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(PageDialogProvider,null,React.createElement(Feedback)))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/employee-feedback-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of quick?['ko']:['ko','en','vi'])for(const variant of quick?['standard']:['standard','compact'])for(const mobile of quick?[false]:[false,true]){
  const t=employeeFeedbackText[language],page=await browser.newPage({viewport:{width:mobile?390:1440,height:1000},hasTouch:mobile}),errors=[],calls=[];
  let failSave=true,failLoad=true;
  page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(language=>localStorage.setItem('baro_language_override',language),language);
  const stub=(pattern,body)=>page.route(pattern,route=>route.fulfill({contentType:'application/javascript',body}));
  await stub('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});');
  await stub('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${language}'});`);
  await stub('**/src/utils/textAcronymLoader.mjs*','export const loadTextAcronyms=async()=>{};');
  await stub('**/src/context/AppContext.jsx*','const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;');
  const rule={id:'rule-test-001',version:1,employeeId:2,factoryId:1,definition:{name:'Daily Entry Rule',kind:'WARNING',task:'WORK_LOG_ENTRY',timeZone:'Asia/Ho_Chi_Minh',effectiveFrom:'2020-01-01',dueAfterDays:1,deadlineTime:'09:00',threshold:1,weekdays:[0,1,2,3,4,5,6],message:'Entry Reminder',automaticDelivery:false}};
  const draft={id:'draft-test-001',version:1,employeeId:2,ruleId:null,state:'DRAFT',content:{kind:'PRAISE',subject:'Good Work',message:'Thank You',basis:'Verified By Administrator'}};
  await page.route('**/employee-feedback?*',route=>{if(failLoad){failLoad=false;return route.fulfill({status:503,json:{error:'test load failure'},headers:{'Access-Control-Allow-Origin':'*'}});}return route.fulfill({json:{mode:'PREPARATION_ONLY',rules:[rule],drafts:[draft],employees:[{id:2,name:'Worker A',employeeNo:'W1'}],factories:[{id:1,name:'HANOI'}]},headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.route('**/employee-feedback/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS'}});
   const url=route.request().url(),body=route.request().postDataJSON();calls.push(url);
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
  await page.getByRole('tab',{name:t.drafts,exact:true}).click();await page.getByRole('button',{name:'Good Work',exact:true}).click();
  const message=page.getByRole('textbox',{name:new RegExp(t.message)});assert.equal(await message.inputValue(),'Thank You');
  if(mobile)await page.getByRole('button',{name:t.review,exact:true}).tap();else{await page.getByRole('button',{name:t.review,exact:true}).focus();await page.keyboard.press('Enter');}
  await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(element=>element.disabled));assert.equal(await message.isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:/^(Send|Gửi|발송)$/}).count(),0);assert.ok(calls.every(url=>!/send|deliver|enable/i.test(url)));assert.deepEqual(errors,[]);
  await page.close();console.log('PASS feedback preparation, retries, hold, praise review',language,variant,mobile?'touch':'keyboard');
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
