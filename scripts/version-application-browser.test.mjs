import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture = path.resolve('frontend/version-application-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import Start from '/src/components/VersionApplicationStart.jsx';
function App(){const [month,setMonth]=React.useState('2026-10');return React.createElement('main',{},React.createElement(Start,{value:month,onChange:setMonth,defaultMonth:'2026-10',languageCode:'en'}),React.createElement(Start,{mode:'future',versionNumber:11,languageCode:'en'}));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43193;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/version-application-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/version-application-acceptance.html`);
  const input=page.locator('input[type="month"]');
  await input.waitFor();assert.equal(await input.inputValue(),'2026-10');
  await page.getByRole('button',{name:'Next month',exact:true}).click();assert.equal(await input.inputValue(),'2026-11');
  await input.fill('2027-03');await input.blur();assert.match(await page.locator('main').innerText(),/Applies from 2027-03 onward/);
  await page.getByRole('button',{name:'This month',exact:true}).click();assert.equal(await input.inputValue(),'2026-10');
  assert.match(await page.locator('main').innerText(),/without selecting existing work/);
  assert.deepEqual(errors,[]);
  console.log('Shared version UI passed: default, next month, custom future start, and future-work explanation.');
} finally {await browser?.close();vite.kill();unlinkSync(fixture);}
