import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/date-range-month-shift-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import Range from'/src/components/DateRangeSelector.jsx';
const params=new URLSearchParams(location.search);function App(){const[start,setStart]=React.useState(params.get('start')),[end,setEnd]=React.useState(params.get('end'));return React.createElement(React.Fragment,null,React.createElement(Range,{independentDateBounds:true,languageCode:params.get('lang'),startValue:start,endValue:end,maxDate:params.get('today'),onStartChange:v=>setStart(v.format('YYYY-MM-DD')),onEndChange:v=>setEnd(v.format('YYYY-MM-DD'))}),React.createElement('output',null,start+' / '+end));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43364,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/date-range-month-shift-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 const cases=[['2026-11-01','2026-11-01','2026-10-01 / 2026-10-31'],['2027-01-01','2027-01-01','2026-12-01 / 2026-12-31'],['2027-03-01','2027-03-01','2027-02-01 / 2027-02-28'],['2028-03-01','2028-03-01','2028-02-01 / 2028-02-29'],['2026-11-10','2026-11-15','2026-10-01 / 2026-10-31']];
 for(const lang of ['ko','en','vi'])for(const [start,end,expected] of cases){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(end+'T12:00:00+07:00')});
  await page.goto(`http://127.0.0.1:${port}/date-range-month-shift-acceptance.html?`+new URLSearchParams({start,end,today:end,lang}));
  await page.getByRole('button',{name:'M-',exact:true}).click();assert.equal(await page.locator('output').textContent(),expected);
  // The current partial month remains reachable; only dates after its ceiling
  // are excluded, rather than disabling the whole month.
  assert.equal(await page.getByRole('button',{name:'M+',exact:true}).isDisabled(),false);
  await page.getByRole('button',{name:'M+',exact:true}).click();assert.equal(await page.locator('output').textContent(),end.slice(0,7)+'-01 / '+end);
  assert.equal(await page.getByRole('button',{name:'M+',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'M-',exact:true}).click();assert.equal(await page.locator('output').textContent(),expected);
  await page.getByRole('button',{name:'M-',exact:true}).click();await page.getByRole('button',{name:'M+',exact:true}).click();assert.equal(await page.locator('output').textContent(),expected);
  await page.setViewportSize({width:390,height:700});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'M+',exact:true}).click();assert.equal(await page.locator('output').textContent(),end.slice(0,7)+'-01 / '+end);
  assert.equal(await page.getByRole('button',{name:'M+',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'M-',exact:true}).click();assert.equal(await page.locator('output').textContent(),expected);
  assert.deepEqual(errors,[]);await page.close();
 }
 const emptyPage=await browser.newPage();
 await emptyPage.goto(`http://127.0.0.1:${port}/date-range-month-shift-acceptance.html?`+new URLSearchParams({start:'',end:'',today:'2026-11-01',lang:'ko'}));
 for(const name of ['M-','M+'])assert.equal(await emptyPage.getByRole('button',{name,exact:true}).isDisabled(),true);
 await emptyPage.close();
 console.log('Global month shifting ko/en/vi: November first, year boundary, February/leap year, partial dates, full-month M+ round trip, future ceiling, empty dates and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
