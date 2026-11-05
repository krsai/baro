import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {tenureRecognitionText} from '../frontend/src/constants/tenureRecognition.js';
const fixture=path.resolve('frontend/tenure-recognition-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Dialog from'/src/components/TenureRecognitionDialog.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Dialog,{open:true,onClose:()=>{},orgId:1,employeeId:7,languageCode:new URLSearchParams(location.search).get('lang')})));</script></body></html>`);
const port=43295,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/tenure-recognition-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const t=tenureRecognitionText[lang],page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(8000);
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:message=>window.toast=message});'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const buildQueryString=()=>'?orgId=1';export const requestJSON=async(path,options={})=>{window.paths=(window.paths||[]).concat(path);window.value??={employeeId:7,employeeName:'Employee A',actualYears:3,additionalYears:0,recognizedYears:3,currentMonth:'2026-11',revision:0,canEdit:!new URLSearchParams(location.search).has('readonly'),history:[]};if(options.method==='PUT'){const body=JSON.parse(options.body);window.writes=(window.writes||[]).concat(body);if(window.failSave){window.failSave=false;const error=Error('Temporary error');error.status=503;throw error;}const extra=body.effectiveMonth==='2026-11'?body.additionalYears:window.value.additionalYears;window.value={...window.value,additionalYears:extra,recognizedYears:3+extra,revision:window.value.revision+1,history:[{id:window.value.revision+1,...body},...window.value.history]};}return structuredClone(window.value);};`}));
  await page.goto(`http://127.0.0.1:${port}/tenure-recognition-acceptance.html?lang=${lang}`);
  const dialog=page.getByRole('dialog'),save=dialog.getByRole('button',{name:t.save,exact:true});await dialog.getByRole('textbox',{name:t.additional,exact:true}).waitFor();assert.equal(await save.isDisabled(),true);
  await dialog.getByRole('textbox',{name:t.additional,exact:true}).fill('-1');await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Performance award');assert.equal(await save.isDisabled(),true);
  await dialog.getByRole('textbox',{name:t.additional,exact:true}).fill('2');await page.evaluate(()=>window.failSave=true);await save.click();await dialog.getByText(t.failed,{exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:t.additional,exact:true}).inputValue(),'2');
  await save.click();await page.waitForFunction(()=>window.value.recognizedYears===5);await dialog.getByText('Performance award',{exact:true}).waitFor();
  const writes=await page.evaluate(()=>window.writes);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].additionalYears,2);assert.equal(writes[0].effectiveMonth,'2026-11');assert.equal(await save.isDisabled(),true);
  assert.ok((await page.evaluate(()=>window.paths)).every(value=>value==='/employees/7/tenure-recognition?orgId=1'));
  assert.ok(await dialog.evaluate(element=>element.getBoundingClientRect().width<=innerWidth));assert.deepEqual(errors,[]);
  await page.goto(`http://127.0.0.1:${port}/tenure-recognition-acceptance.html?lang=${lang}&readonly=1`);await page.getByText(t.empty,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:t.save,exact:true}).count(),0);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile actual/credited service, required reason, validation, scoped save, uncertain retry and read-only mode.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
