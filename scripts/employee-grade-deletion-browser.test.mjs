import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {employeeGradeText} from '../frontend/src/constants/employeeGrade.js';
const file='frontend/employee-grade-deletion-test.html',port=43579;
assert.ok(!existsSync(file));
writeFileSync(file,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{createAppTheme}from'/src/theme';import Page from'/src/pages/App/EmployeeSystem';import Dialogs from'/src/components/PageDialogProvider';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme:createAppTheme(new URLSearchParams(location.search).get('theme'))},React.createElement(CssBaseline),React.createElement(Dialogs,null,React.createElement(Page)))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${file.split('/').at(-1)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const theme of ['standard','compact'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width===390}),errors=[],deletes=[],text=employeeGradeText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification(message){window.notices=[...(window.notices||[]),String(message)];},removeNotification(){}};export const useAppActions=()=>actions;'}));
  const grades=[['DEFAULT',0],['ACTIVE',2],['TERMINATED',1],['STALE',0],['FREE',0]].map(([code,count],index)=>({id:index+1,code,name:code,nameEn:code,nameKo:code,nameVi:code,sortOrder:index+1,isDefault:index===0,_count:{employees:count}}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/employee-grades**',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});if(req.method()==='GET')return r.fulfill({headers,json:[{id:1,name:'Grades',grades}]});const id=Number(new URL(req.url()).pathname.split('/').at(-1));deletes.push(id);if(id===4)return r.fulfill({headers,status:409,json:{error:'EMPLOYEE_GRADE_IN_USE'}});assert.equal(id,5);grades.splice(grades.findIndex(g=>g.id===id),1);return r.fulfill({headers,json:{ok:true}});});
  await page.goto(`http://127.0.0.1:${port}/${file.split('/').at(-1)}?theme=${theme}`);
  const button=id=>page.locator('[data-grade-delete="'+id+'"]'),activate=async target=>{if(width===390)await target.tap();else{await target.focus();await target.press('Enter');}};
  await button(5).waitFor().catch(e=>{console.log({errors});throw e;});for(const id of [1,2,3])assert.equal(await button(id).isDisabled(),true);assert.equal(deletes.length,0);
  const cancel={ko:'취소',en:'Cancel',vi:'Hủy'}[lang],ok={ko:'확인',en:'OK',vi:'Đồng ý'}[lang];
  await activate(button(5));let dialog=page.getByRole('dialog');await dialog.waitFor();assert.ok((await dialog.innerText()).includes('FREE'));assert.equal(deletes.length,0);await dialog.getByRole('button',{name:cancel,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(deletes.length,0);
  await activate(button(4));await page.getByRole('dialog').getByRole('button',{name:ok,exact:true}).click();await page.waitForFunction(message=>window.notices?.includes(message),text.inUse);assert.deepEqual(deletes,[4]);assert.equal(await button(4).count(),1);
  await activate(button(5));await page.getByRole('dialog').getByRole('button',{name:ok,exact:true}).click();await button(5).waitFor({state:'detached'});assert.deepEqual(deletes,[4,5]);for(const id of [1,2,3])assert.equal(await button(id).isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS grade deletion guards, confirmation and localized stale response',lang,theme,width);await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
