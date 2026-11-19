import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/work-context-loading-test.html',port=43519;
assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Work from'/src/pages/App/work/WorkDetail';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Work,{initialLog:{id:'saved',factoryId:1,factoryName:'HANOI',workDate:'2026-11-17',coverageStartDate:'2026-11-17',note:'Saved note',records:[]},onSave:()=>{}}))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/work-context-loading-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1722,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1,activeOrgRole:'ADMIN',accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN'}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification:()=>{},removeNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/factories?*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  await page.route('**/src/utils/attributeApi.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const fetchProcessAttributes=async()=>[];'}));
  await page.route('**/src/pages/App/work/workLogStorage*',r=>r.fulfill({contentType:'application/javascript',body:'export const loadWorkLogContext=()=>new Promise((resolve,reject)=>{window.finishContext=resolve;window.failContext=()=>reject(Error("Network failure"));});'}));
  await page.route('**/src/components/AppNotice*',r=>r.fulfill({contentType:'application/javascript',body:"import React from '/node_modules/.vite/deps/react.js';export default function Notice({children,action}){return React.createElement('div',{role:'alert'},children,action);}"}));
  await page.goto('http://127.0.0.1:'+port+'/work-context-loading-test.html');
  await page.waitForFunction(()=>typeof window.finishContext==='function');
  await page.waitForTimeout(250);
  const warning=JSON.parse("{\"ko\":\"선택한 공장/작업일 기준으로 작업자가 없습니다.\",\"en\":\"No workers are available for the selected factory and work date.\",\"vi\":\"Không có nhân viên theo nhà máy và ngày làm việc đã chọn.\"}")[language];
  assert.equal(await page.getByText(warning,{exact:true}).count(),0,'pending context must not warn about absent workers');
  await page.evaluate(()=>window.failContext());
  const retry=page.getByRole('alert').getByRole('button',{name: /./,exact:false});
  await retry.waitFor();
  assert.equal(await page.getByText(warning,{exact:true}).count(),0,'failed context must not be reported as empty');
  await page.evaluate(()=>{delete window.finishContext;});await retry.click();
  await page.waitForFunction(()=>typeof window.finishContext==='function');
  await page.evaluate(()=>window.finishContext({workers:[],assignments:[]}));
  await page.getByText(warning,{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS work context loading/failure/retry/empty '+language+' '+width);
  await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}

