import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/accounting-dimensions-acceptance.html',entry='frontend/acceptance/accountingDimensionsFixture.jsx';
assert.ok(!existsSync(file));assert.ok(!existsSync(entry));
writeFileSync(entry,`
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,Table,TableBody}from'@mui/material';import theme from'/src/theme';import Line from'/src/components/ExpenseRequestLine';import Settings from'/src/components/AccountingInputSettings';import{newExpenseLine,validExpenseLine}from'/src/utils/expenseRequest.mjs';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest';import{EXPENSE_TEXT}from'/src/constants/expenseTypes';import{TRANSACTION_TEXT}from'/src/components/OutsourcingServiceDialog';import{accountingCompactText}from'/src/constants/accountingCompact';
const lang=new URLSearchParams(location.search).get('lang');window.text={...TRANSACTION_TEXT[lang],...EXPENSE_TEXT[lang],...accountingCompactText[lang]};
function App(){const [line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,quantity:'1',unitPrice:'10',details:{reference:'DOC',evidenceFile:'receipt.pdf'}}),[settings,setSettings]=React.useState({requiredFields:[]});const onChange=React.useCallback((key,patch)=>setLine(row=>({...row,...patch})),[]),onStatus=React.useCallback(()=>{},[]);const code={id:7,vatEnabled:false,base:{entryMode:'GENERAL',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',...settings}};window.line=line;window.settings=settings;window.valid=validExpenseLine(line,code,'VND');return <ThemeProvider theme={theme}><Settings value={settings} onChange={setSettings} languageCode={lang}/><Table><TableBody><Line line={line} index={0} codes={[code]} orders={[]} settings={{}} labels={EXPENSE_REQUEST_TEXT[lang]} languageCode={lang} onChange={onChange} onStatus={onStatus} validationAttempt={1}/></TableBody></Table></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);
`);
writeFileSync(file,'<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/acceptance/accountingDimensionsFixture.jsx"></script></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43409','--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43409/accounting-dimensions-acceptance.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:43409/accounting-dimensions-acceptance.html?lang='+lang);await page.waitForFunction(()=>window.text);const t=await page.evaluate(()=>window.text);
  await page.getByRole('combobox',{name:t.dimensions,exact:true}).click();await page.getByRole('option',{name:t.REQUIRED,exact:true}).click();
  await page.getByRole('button',{name:t.link,exact:true}).click();
  const length=page.getByRole('textbox',{name:t.length,exact:false}),w=page.getByRole('textbox',{name:t.width,exact:false}),height=page.getByRole('textbox',{name:t.height,exact:false});
  await length.waitFor();assert.equal(await length.getAttribute('required'),'');assert.equal(await w.getAttribute('required'),'');assert.equal(await height.getAttribute('required'),null);
  await length.fill('210.5');await w.fill('297');await page.waitForFunction(()=>window.valid);assert.equal(await page.evaluate(()=>window.line.details.height),undefined);
  await height.fill('0');await page.waitForFunction(()=>!window.valid);assert.equal(await height.getAttribute('aria-invalid'),'true');
  await height.fill('12.5');await page.waitForFunction(()=>window.valid);
  await page.getByRole('button',{name:t.close,exact:true}).click();
  await page.getByRole('combobox',{name:t.dimensions,exact:true}).click();await page.getByRole('option',{name:t.HIDDEN,exact:true}).click();
  await page.getByRole('button',{name:t.link,exact:true}).click();
  assert.equal(await height.inputValue(),'12.5');assert.equal(await length.inputValue(),'210.5');assert.deepEqual(await page.evaluate(()=>window.settings.requiredFields),[]);assert.deepEqual(errors,[]);
  await page.close();console.log('PASS dimensions settings, required L/W, optional H, retained values',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
