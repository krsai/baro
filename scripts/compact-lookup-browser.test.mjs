import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/compact-lookup-acceptance.html');
assert.ok(!existsSync(fixture));
const markup=`<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Box} from '@mui/material';import theme from '/src/theme';import Picker from '/src/components/ExpensePayeePicker.jsx';import Field from '/src/components/ExpenseLookupField.jsx';
const options=[{id:1,code:'BARO',name:'BARO GARMENT',type:'MANUFACTURER',isActive:true},{id:2,code:'DUP',name:'First',isActive:true},{id:3,code:'DUP',name:'Second',isActive:true},{id:4,code:'OLD',name:'Inactive',isActive:false}];
function App(){const[value,setValue]=React.useState(null),[code,setCode]=React.useState(null);window.selected=value;window.code=code;return <ThemeProvider theme={theme}><CssBaseline/><Box sx={{p:2,maxWidth:500}}><Picker orgId={1} languageCode={new URLSearchParams(location.search).get('lang')} options={options} value={value} onChange={setValue} onSaved={()=>{}}/><Field label="Code" hideLabel directCode options={options} value={code} onChange={setCode} columns={[{key:'code',label:'Code',value:row=>row.code},{key:'name',label:'Name',value:row=>row.name}]}/><button>Next</button></Box></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);</script>`;
const source=fixture.replace('.html','.jsx');writeFileSync(source,markup.split('<script type="module">')[1].split('</script>')[0]);writeFileSync(fixture,markup.replace(/<script type="module">[\s\S]*<\/script>/,'<script type="module" src="/compact-lookup-acceptance.jsx"></script>'));
const port=43279,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/compact-lookup-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/entities/*/bank-accounts?*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{accounts:[]}}));
  await page.goto(`http://127.0.0.1:${port}/compact-lookup-acceptance.html?lang=${lang}`);
  const input=page.getByTestId('expense-payee-button').locator('input');await input.click();assert.equal(await page.getByRole('option').count(),0);
  await input.fill('BARO');await page.waitForFunction(()=>window.selected?.id===1);await input.press('Enter');await page.waitForTimeout(200);assert.equal(await page.getByRole('dialog').count(),0);
  await input.press('Tab');assert.equal(await page.getByRole('dialog').count(),0);
  await input.fill('BARO GARMENT');await input.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);
  await input.fill('DUP');await input.press('Tab');await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>window.selected),null);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await input.fill('missing');await input.press('Enter');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await input.fill('');await input.press('Tab');await page.getByRole('dialog').waitFor();await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await input.press('Shift+Tab');assert.equal(await page.getByRole('dialog').count(),0);
  const code=page.getByRole('textbox',{name:'Code',exact:true});await code.fill('BARO');await code.press('Enter');await page.waitForFunction(()=>window.code?.id===1);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await code.locator('..').locator('label').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Compact lookup: ko/en/vi, direct code/name, selected Enter/Tab, missing/ambiguous/empty modal, mobile and no-bank selection passed.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);if(existsSync(source))unlinkSync(source);}
