import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/account-chart-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div style="height:700px"></div><div id="root" style="margin:0 24px;transform:scale(.95);transform-origin:left top"></div><div style="height:700px"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import Chart from '/src/components/AccountBalanceChart.jsx';
const points=Array.from({length:30},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),balance:String(100+i)}));
createRoot(document.getElementById('root')).render(React.createElement(Chart,{points,currencyCode:'USD',label:'Balance'}));</script></body></html>`);
const port=43239,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/account-chart-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const width of [2560,1920,1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/account-chart-acceptance.html`);
  const chart=page.getByTestId('account-balance-chart'),svg=chart.locator('svg');await svg.waitFor();
  for(const scroll of [500,620]){
   await page.evaluate(y=>scrollTo(0,y),scroll);
   for(const index of [0,3,7,14,22,26,29]){
    // Pointer coordinates come from the actual rendered line, including SVG
    // aspect-ratio padding, CSS scaling and the current scroll position.
    const cursor=await svg.evaluate((element,index)=>{const point=element.createSVGPoint();const coordinates=element.querySelector('[data-balance-line]').points.getItem(index);point.x=coordinates.x;point.y=coordinates.y;const screen=point.matrixTransform(element.getScreenCTM());return {x:screen.x,y:screen.y};},index);
    await page.mouse.move(cursor.x,cursor.y);
    await chart.getByText('2026-10-'+String(index+1).padStart(2,'0'),{exact:true}).waitFor();
    const tip=await chart.getByTestId('balance-chart-tooltip').boundingBox();assert.ok(cursor.x>=tip.x-24&&cursor.x<=tip.x+tip.width+190);assert.ok(Math.abs(cursor.y-tip.y)<100);
   }
  }
  const lineRight=await svg.evaluate(element=>{const line=element.querySelector('[data-balance-line]');const p=element.createSVGPoint();p.x=line.points.getItem(29).x;p.y=0;return p.matrixTransform(element.getScreenCTM()).x;});
  const bounds=await svg.boundingBox();assert.ok(bounds.x+bounds.width-lineRight<25);const parent=await chart.boundingBox();assert.ok(Math.abs(bounds.width-parent.width)<2);
  const ticks=await svg.locator('[data-axis-tick]').allTextContents();assert.ok(ticks.every(text=>Number.isInteger(Number(text.replaceAll(',','')))));
  await svg.focus();await page.keyboard.press('ArrowLeft');await chart.getByText('2026-10-29',{exact:true}).waitFor();
  await page.keyboard.press('ArrowRight');await chart.getByText('2026-10-30',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: chart pointer selection follows the rendered line at 2560/1920/1440/768/390px, with scroll and CSS scaling; keyboard navigation preserved.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
