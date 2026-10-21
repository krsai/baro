import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/loading-language-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {LanguageProvider,useLanguage} from '/src/context/LanguageContext.jsx';import {getCurrentLanguageCode} from '/src/utils/appLanguage.js';import Overlay from '/src/components/GlobalLoadingOverlay.jsx';window.beforeProvider=getCurrentLanguageCode();function Screen(){const {setLanguageCode}=useLanguage();return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setLanguageCode('vi')},'switch'),React.createElement(Overlay,{open:true,fullscreen:true,startedAt:Date.now(),activeRequestCount:1}));}createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider,null,React.createElement(Screen)));</script></body></html>`);
const port=43194,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/loading-language-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  // Exercise the real entry document with React deliberately blocked. The HTML
  // language must already match the loading UI, even on a slow first login.
  for (const {stored,legacy,expected} of [{stored:'ko',expected:'ko'},{stored:'vi',expected:'vi'},{stored:'en',expected:'en'},{legacy:'ko',expected:'ko'},{stored:'invalid',expected:'en'},{expected:'en'}]) {
    const page=await browser.newPage();
    await page.addInitScript(({stored,legacy})=>{
      localStorage.clear();sessionStorage.clear();
      if(stored)localStorage.setItem('baro_language_override',stored);
      if(legacy)sessionStorage.setItem('baro_language_override',legacy);
    },{stored,legacy});
    await page.route('**/src/index.jsx',route=>route.abort());
    await page.goto(`http://127.0.0.1:${port}/login`,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('html').getAttribute('lang'),expected);
    assert.equal(await page.locator('#root').textContent(),'');
    await page.close();
  }
  for(const {stored,legacy,expected} of [{stored:'ko',expected:'ko'},{stored:'vi',expected:'vi'},{stored:'en',expected:'en'},{legacy:'ko',expected:'ko'},{stored:'invalid',expected:'en'},{expected:'en'}]) {
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({stored,legacy})=>{
      localStorage.clear();sessionStorage.clear();
      if(stored)localStorage.setItem('baro_language_override',stored);
      if(legacy)sessionStorage.setItem('baro_language_override',legacy);
      window.loadingFrames=[];
      new MutationObserver(()=>{const paper=document.querySelector('.MuiPaper-root');if(paper?.textContent)window.loadingFrames.push(paper.textContent);}).observe(document,{childList:true,subtree:true,characterData:true});
    },{stored,legacy});
    await page.goto(`http://127.0.0.1:${port}/loading-language-acceptance.html`);
    const title={ko:'작업 화면을 불러오는 중',en:'Loading workspace',vi:'Đang tải man hinh lam viec'}[expected];
    await page.getByText(title,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.beforeProvider),expected);
    assert.ok((await page.evaluate(()=>window.loadingFrames)).every(text=>text.includes(title)));
    assert.equal(await page.locator('html').getAttribute('lang'),expected);
    // Change language while the overlay is open, without waiting for a timer tick.
    await page.getByRole('button',{name:'switch'}).evaluate(button=>button.click());
    await page.getByText('Đang tải man hinh lam viec',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('baro_language_override')),'vi');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Loading language passed: saved ko/en/vi from the first frame, session migration, default fallback, pre-provider messages and live language changes.');
} finally {await browser?.close();vite.kill();unlinkSync(fixture);}
