import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/partner-party-kind-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Directory from'/src/components/PartnerDirectory.jsx';
const names=['Group person A','Group corporation A','Individual-looking legacy company','Group person B','Group corporation B'];const kinds=['INDIVIDUAL','CORPORATE',null,'INDIVIDUAL','CORPORATE'];const rows=names.map((name,i)=>({id:i+1,name,code:kinds[i]==='CORPORATE'?'C00'+i:null,source:{id:i+1,partyKind:kinds[i]}}));Object.freeze(rows);createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Directory,{embedded:true,title:'Partners',rows,languageCode:new URLSearchParams(location.search).get('lang'),onOpen:row=>window.openedPartner=row.id})));
</script></body></html>`);
const port=43361,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-party-kind-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.goto(`http://127.0.0.1:${port}/partner-party-kind-acceptance.html?lang=${lang}`);
  const rows=page.locator('tbody tr');await rows.nth(4).waitFor();
  assert.deepEqual(await rows.locator('td:nth-child(3)').allTextContents(),['Group corporation A','Group corporation B','Group person A','Group person B','Individual-looking legacy company']);
  const labels={ko:['법인','개인','미지정 (기존)'],en:['Corporation','Individual','Unspecified (existing)'],vi:['Pháp nhân','Cá nhân','Chưa xác định (cũ)']}[lang];
  assert.deepEqual(await rows.locator('td:first-child').allTextContents(),[labels[0],labels[0],labels[1],labels[1],labels[2]]);
  assert.equal(await rows.nth(2).locator('td:nth-child(2)').innerText(),'-');
  await rows.nth(2).dblclick();assert.equal(await page.evaluate(()=>window.openedPartner),1);
  await page.getByRole('textbox').fill('Group');assert.equal(await rows.count(),4);assert.deepEqual(await rows.locator('td:first-child').allTextContents(),[labels[0],labels[0],labels[1],labels[1]]);
  await page.getByRole('textbox').fill('');assert.equal(await rows.count(),5);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner party kinds ko/en/vi: explicit type column, corporate-first stable sorting, unspecified last, optional individual codes, search, original IDs and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
