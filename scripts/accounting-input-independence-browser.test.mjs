import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {EXPENSE_TEXT} from '../frontend/src/constants/expenseTypes.js';
const fixture='frontend/accounting-input-independence.html',port=43419;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Settings from'/src/components/AccountingInputSettings';
const params=new URLSearchParams(location.search);function App(){const[value,setValue]=React.useState({requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'});window.settings=value;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings,{value,onChange:setValue,languageCode:params.get('lang'),compact:true,systemDefaults:params.get('system')==='true'}))}createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/accounting-input-independence.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const system of [true,false]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+port+'/accounting-input-independence.html?lang='+lang+'&system='+system);
  const t=EXPENSE_TEXT[lang];
  const set=async(key,mode)=>{if(system){const name=t[key].replace(/ 입력$| input$|^Nhập /g,'');await page.getByRole('checkbox',{name,exact:true}).setChecked(mode==='REQUIRED');}else{await page.getByRole('combobox',{name:t[key],exact:true}).click();await page.getByRole('option',{name:t[mode],exact:true}).click();}};
  await set('style','REQUIRED');assert.deepEqual(await page.evaluate(()=>[settings.orderInput,settings.styleInput,settings.processInput]),['HIDDEN','REQUIRED','HIDDEN']);
  await set('process','REQUIRED');await set('style','HIDDEN');assert.deepEqual(await page.evaluate(()=>[settings.orderInput,settings.styleInput,settings.processInput]),['HIDDEN','HIDDEN','REQUIRED']);
  await set('order','REQUIRED');await set('process','HIDDEN');assert.deepEqual(await page.evaluate(()=>[settings.orderInput,settings.styleInput,settings.processInput]),['REQUIRED','HIDDEN','HIDDEN']);
  if(!system){await set('style','OPTIONAL');await set('order','HIDDEN');assert.deepEqual(await page.evaluate(()=>[settings.orderInput,settings.styleInput,settings.processInput]),['HIDDEN','OPTIONAL','HIDDEN']);}
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
 }
 console.log('PASS independent system checkboxes and company modes: ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
