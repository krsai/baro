import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/time-locale-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html lang="ko"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Picker from'/src/components/CustomTimePicker.jsx';
function App(){const[lang,setLang]=React.useState('vi'),[a,setA]=React.useState('07:40'),[b,setB]=React.useState('18:44');window.setLanguage=setLang;window.values=()=>[a,b];return React.createElement(ThemeProvider,{theme},React.createElement(Picker,{label:'Clock in',languageCode:lang,value:a,onChange:e=>setA(e.target.value),InputProps:{startAdornment:React.createElement('span',{'data-testid':'start-icon'},'→')}}),React.createElement(Picker,{label:'Clock out',languageCode:lang,value:b,onChange:e=>setB(e.target.value)}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43244,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/time-locale-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 const context=await browser.newContext({locale:'ko-KR'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/time-locale-acceptance.html`);
 const input=page.getByRole('textbox',{name:'Clock in'}),output=page.getByRole('textbox',{name:'Clock out'});await input.waitFor();
 for(const lang of ['vi','en','ko']){
  await page.evaluate(lang=>window.setLanguage(lang),lang);
  assert.equal(await input.inputValue(),'07:40');assert.equal(await output.inputValue(),'18:44');
  assert.equal(await input.getAttribute('type'),'text');assert.equal(await page.getByTestId('start-icon').count(),1);
  await page.getByRole('button').first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.doesNotMatch(await dialog.innerText(),/오전|오후|\bAM\b|\bPM\b/);
  if(lang!=='ko')assert.doesNotMatch(await dialog.innerText(),/[가-힣]/);
  await page.keyboard.press('Escape');
 }
 for(const value of ['19:05','00:00','12:00']){
  await output.fill(value);await output.press('Tab');
  await page.waitForFunction(value=>window.values()[1]===value,value);
  assert.equal(await output.inputValue(),value);
 }
 await output.fill('');await output.press('Tab');await page.waitForFunction(()=>window.values()[1]==='');
 assert.deepEqual(errors,[]);await browser.close();browser=null;
 console.log('Time locale passed with Korean browser/OS language: ko/en/vi switch keeps 24h values and localized popup, minute edits, midnight/noon and clearing preserve HH:mm payloads.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
