import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/work-entry-layout-test.html',port=43498;
assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Work from'/src/pages/App/work/WorkDetail';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Work,{initialLog:{id:'saved',workDate:'2026-11-17',coverageStartDate:'2026-11-17',note:'Saved note',records:[]},onSave:()=>{}}))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/work-entry-layout-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1722,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1,activeOrgRole:'ADMIN',accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN'}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification:()=>{},removeNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/factories?*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  await page.route('**/src/utils/attributeApi.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const fetchProcessAttributes=async()=>[];'}));
  await page.goto('http://127.0.0.1:'+port+'/work-entry-layout-test.html');
  const search=page.getByTestId('work-row-search'),note=page.getByTestId('work-note').locator('textarea').first();await search.waitFor();await note.waitFor();
  assert.equal(await page.getByText('SEARCH',{exact:true}).count(),0);
  assert.ok((await search.boundingBox()).y<(await note.boundingBox()).y);
  assert.equal(await search.locator('xpath=..').locator('table').count(),0,'empty factory still keeps the row filter in its table panel');
  await note.fill('Keep this note');await search.getByRole('textbox').fill('NONMATCH');assert.equal(await note.inputValue(),'Keep this note');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS entry form layout',language,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
