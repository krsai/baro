import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/query-feedback-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import Page from '/src/pages/App/attendance/AttendanceList.jsx';window.stage=0;createRoot(document.getElementById('root')).render(React.createElement(Page));</script></body></html>`);
const port=43194,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/query-feedback-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mock=(glob,body)=>page.route(glob,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/LanguageContext.jsx*','export const useLanguage=()=>({languageCode:"ko"});');
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1,activeFactoryId:1});');
  await mock('**/src/context/AppContext.jsx*','const actions={navigateToPath:()=>{},showNotification:()=>{}};export const useAppActions=()=>actions;');
  await mock('**/src/components/AppPageContainer.jsx*','import React from "/node_modules/.vite/deps/react.js";export default ({children})=>React.createElement("main",{},children);');
  await mock('**/src/components/PageToolbar.jsx*','export default ()=>null;');
  await mock('**/src/pages/App/payroll/PayrollSettingsDialog.jsx*','export default ()=>null;');
  await mock('**/src/hooks/useWorkspaceRefreshOnEvent*','export default ()=>{};');
  await mock('**/src/hooks/useHolidayCalendar*','const holidaySet=new Set();export default ()=>({holidaySet});');
  await mock('**/src/utils/apiClient.js*',`export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url){await new Promise(r=>setTimeout(r,150));if(url.startsWith('/factories')){if(window.stage===0)throw Error('offline');return [{id:1,name:'Hanoi'}];}if(url.includes('monthsOnly')){if(window.stage===1)throw Error('offline');return window.stage===3?[]:['2026-08'];}if(url.startsWith('/attendance-entries')&&window.stage===2)throw Error('offline');return [];}`);
  await page.goto(`http://127.0.0.1:${port}/query-feedback-acceptance.html`);

  const error=page.getByText('자료를 불러오지 못했습니다.',{exact:true});
  await error.waitFor();assert.equal(await page.getByText('조회 조건에 해당하는 자료가 없습니다.',{exact:true}).count(),0);
  for(const stage of [1,2]){await page.evaluate(s=>window.stage=s,stage);await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByText('자료를 불러오는 중입니다.',{exact:true}).waitFor();await error.waitFor();}
  await page.evaluate(()=>window.stage=3);await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByText('조회 조건에 해당하는 자료가 없습니다.',{exact:true}).waitFor();assert.equal(await error.count(),0);assert.deepEqual(errors,[]);
  console.log('Attendance query UI passed: factory/month/record errors, retry loading, and successful empty response.');
} catch(error) { console.log(await browser?.contexts()[0]?.pages()[0]?.locator("body").innerText()); throw error; } finally {await browser?.close();vite.kill();unlinkSync(fixture);}
