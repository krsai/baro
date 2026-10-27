import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/report-image-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,Chip}from'@mui/material';import theme from'/src/theme';import{captureReportImage}from'/src/utils/captureReportImage.mjs';
const labels={ko:['생산 중','생산 완료','생산 완료 상태를 확인해 주세요'],en:['In production','Completed','Production completion pending confirmation'],vi:['Đang sản xuất','Hoàn thành','Đang sản xuất và chờ xác nhận hoàn thành']}[window.testLang];
window.capture=async(original=false)=>{const element=document.getElementById('capture');const before=element.outerHTML;const rect=element.getBoundingClientRect();const cells=[...element.querySelectorAll('td')].map(cell=>{const r=cell.getBoundingClientRect();return{x:r.x-rect.x,y:r.y-rect.y,width:r.width,height:r.height}});const canvas=original?await (await import('html2canvas')).default(element,{backgroundColor:'#fff',scale:2,width:element.scrollWidth,height:element.scrollHeight,logging:false}):await captureReportImage(element);const ctx=canvas.getContext('2d');const colored=cells.map(({x,y,width,height})=>{const pixels=ctx.getImageData(Math.floor(x*2),Math.floor(y*2),Math.floor(width*2),Math.floor(height*2)).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<120&&pixels[i+1]<180&&pixels[i+2]>70)count++;return count;});window.image=canvas.toDataURL();return{colored,width:canvas.width,height:canvas.height,unchanged:before===element.outerHTML,labels:[...element.querySelectorAll('.MuiChip-label')].map(n=>n.textContent)};};
function App(){return React.createElement(ThemeProvider,{theme},React.createElement('div',{id:'scroll',style:{margin:'100px 20px',height:240,width:420,overflow:'auto',transform:'translateY(0)'}},React.createElement('div',{id:'capture',style:{width:600,background:'#fff',fontFamily:'Arial',fontSize:14}},React.createElement('div',{style:{height:130}},'L17-1'),React.createElement('table',{style:{borderCollapse:'collapse',width:600,tableLayout:'fixed'}},React.createElement('tbody',null,...Array.from({length:9},(_,i)=>React.createElement('tr',{key:i},React.createElement('td',{style:{height:90,width:180,padding:8,border:'1px solid #ddd'}},React.createElement(Chip,{'data-report-status-label':true,size:'small',label:labels[i%3],color:i%3===1?'success':'primary',variant:i%3===1?'filled':'outlined',style:{fontWeight:400,maxWidth:180}})))))))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43241,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/report-image-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(lang=>window.testLang=lang,lang);
  await page.goto(`http://127.0.0.1:${port}/report-image-acceptance.html`);await page.locator('.MuiChip-label').first().waitFor();
  for(const scrollTop of [0,400]){
   await page.evaluate(top=>{const s=document.getElementById('scroll');s.scrollTop=top;s.scrollLeft=100;},scrollTop);
   if(lang==='vi'&&scrollTop===400){const before=await page.evaluate(()=>window.capture(true));console.log('Original capture missing label regions:',before.colored.filter(count=>count<=30).length);}
   const result=await page.evaluate(()=>window.capture());
   assert.equal(result.unchanged,true);assert.equal(result.width,1200);assert.ok(result.height>1800);
   assert.ok(result.colored.every(count=>count>30),JSON.stringify({lang,scrollTop,...result}));
   assert.equal(result.labels.length,9);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Report image passed ko/en/vi: all nine label regions contain rendered text above/below scrolling viewport, horizontal scrolling and original DOM preserved.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
