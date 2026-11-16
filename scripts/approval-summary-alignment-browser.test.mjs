import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/approval-summary-alignment-test.html',jsx=html.replace('.html','.jsx'),port=43518;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/approval-summary-alignment-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Box,Stack,TextField,Dialog,DialogContent}from'@mui/material';import theme from'/src/theme';import Header from'/src/components/DocumentEntryHeader';import Summary from'/src/components/ApprovalLineSummary';import{approvalBandText}from'/src/constants/approvalBands';
const lang=new URLSearchParams(location.search).get('lang'),labels=approvalBandText[lang],cells=[{key:'drafter',label:labels.drafter,name:'Trương Yến Ly',status:'submitted'},{key:'middle',label:labels.middle,name:String.fromCharCode(8212),status:'unconfirmed'},{key:'final',label:labels.final,name:'Trương Yến Ly',status:'approved'}];
function App(){const form=<Header approval={<Stack spacing={1}><Summary cells={cells} languageCode={lang} readOnly/></Stack>}><Stack><Box data-entry-field="payee" sx={{display:'flex',gap:1}}><TextField label="Code" value="247E"/><TextField label="Payee" value="247 EXPRESS"/></Box><TextField data-entry-field="date" label="Request date" value="2026-11-16"/><TextField data-entry-field="date" label="Payment date" value="2026-11-16"/></Stack></Header>;return <ThemeProvider theme={theme}><CssBaseline/>{new URLSearchParams(location.search).has('modal')?<Dialog open fullWidth maxWidth="xl"><DialogContent>{form}</DialogContent></Dialog>:<Box sx={{maxWidth:1400,p:2}}>{form}</Box>}</ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-summary-alignment-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,1200,390])for(const modal of [false,true]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/approval-summary-alignment-test.html?lang=${lang}${modal?'&modal=1':''}`);
  const cells=page.locator('[data-approval-summary-cell]');await cells.first().waitFor();
  const boxes=await cells.evaluateAll(nodes=>nodes.map(node=>{const body=node.lastElementChild.getBoundingClientRect(),title=node.firstElementChild.getBoundingClientRect(),cell=node.getBoundingClientRect();return {x:cell.x,width:cell.width,bodyY:body.y,bodyHeight:body.height,titleY:title.y};}));
  assert.equal(boxes.length,3);if(width>=1200)assert.ok(boxes.every(box=>box.width>=130),JSON.stringify(boxes));assert.ok(Math.max(...boxes.map(b=>b.bodyY))-Math.min(...boxes.map(b=>b.bodyY))<1,JSON.stringify(boxes));assert.ok(Math.max(...boxes.map(b=>b.bodyHeight))-Math.min(...boxes.map(b=>b.bodyHeight))<1,JSON.stringify(boxes));
  assert.ok(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<1);assert.ok(boxes.every((b,i)=>!i||b.x>boxes[i-1].x));
  const fields=await page.getByTestId('document-entry-fields').boundingBox(),approval=await page.getByTestId('document-entry-approval').boundingBox(),header=await page.getByTestId('document-entry-header').boundingBox();
  if(width===1440)assert.ok(Math.abs(fields.y+fields.height/2-approval.y-approval.height/2)<1,'desktop fields and approval share the center');
  if(width===390)assert.ok(Math.abs(approval.x+approval.width/2-header.x-header.width/2)<2,'stacked approval is centered');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS approval alignment: equal stage widths, missing-review placeholder matches status height, desktop header centers, mobile centers, direct/modal ko/en/vi.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
