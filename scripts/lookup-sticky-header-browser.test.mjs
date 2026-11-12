import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve('frontend/lookup-sticky-header-acceptance.html'),entry=file.replace('.html','.jsx');assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(file,'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/lookup-sticky-header-acceptance.jsx"></script></html>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Lookup from'/src/components/LookupSearchDialog';const rows=Array.from({length:36},(_,i)=>({id:i+1,code:'BAR'+String(i+1).padStart(5,'0'),name:'Employee '+(i+1),kind:'Employee'}));function App(){const[q,setQ]=React.useState('');return <ThemeProvider theme={theme}><CssBaseline/><Lookup open title="Lookup" query={q} onQueryChange={setQ} options={rows} languageCode={new URLSearchParams(location.search).get('lang')} columns={[{key:'code',label:'Code',value:r=>r.code},{key:'name',label:'Name',value:r=>r.name},{key:'kind',label:'Type',value:r=>r.kind}]} onSelect={r=>window.selected=r.id} onClose={()=>{}}/></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
const port=43329,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/lookup-sticky-header-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/lookup-sticky-header-acceptance.html?lang=${lang}`);
  const container=page.locator('.MuiTableContainer-root'),head=page.locator('thead th');await head.first().waitFor();
  for(const scroll of [0,53,210,600]){
   await container.evaluate((el,value)=>{el.scrollTop=value;},scroll);await page.waitForTimeout(40);
   const cells=await head.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:el.textContent,top:r.top,position:style.position,inset:style.top,zIndex:style.zIndex,covered:!el.contains(hit)};}));
   assert.ok(cells.every(cell=>Math.abs(cell.top-cells[0].top)<1&&!cell.covered),`${lang} ${width} scroll ${scroll}: ${JSON.stringify(cells)}`);
  }
  const horizontal=await container.evaluate(el=>{el.querySelector('table').style.minWidth='1100px';el.scrollLeft=el.scrollWidth;return {left:el.scrollLeft};});
  assert.ok(horizontal.left>0);
  const corner=await head.last().evaluate(el=>{const r=el.getBoundingClientRect(),c=el.closest('.MuiTableContainer-root').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {right:r.right,containerRight:c.right,covered:!el.contains(hit)};});
  assert.ok(Math.abs(corner.right-corner.containerRight)<3&&!corner.covered,JSON.stringify(corner));
  await container.evaluate(el=>{el.scrollLeft=0;el.querySelector('table').style.minWidth='';});
  await page.locator('tbody tr').nth(14).getByRole('button').click();assert.equal(await page.evaluate(()=>window.selected),15);
  const input=page.getByRole('textbox');await input.fill('BAR00002');await input.press('Enter');assert.equal(await page.evaluate(()=>window.selected),2);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS ko/en/vi desktop/mobile: every lookup header stays visible above selection buttons while scrolling.');
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
