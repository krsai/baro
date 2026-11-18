import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
const html='frontend/ledger-picker-test.html',jsx='frontend/ledger-picker-test.jsx',port=43493;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/ledger-picker-test.jsx"></script></html>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Picker from'/src/components/LedgerDocumentPicker';function App(){const[value,setValue]=React.useState(null);return <ThemeProvider theme={theme}><CssBaseline/><Picker orgId={7} currencyCode="USD" type="EXPENSE" languageCode={new URLSearchParams(location.search).get('lang')} value={value} onChange={setValue}/><output>{value?.id}</output></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/ledger-picker-test.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],queries=[],t=ledgerEntryText[lang];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/utils/apiClient.js*',route=>route.fulfill({contentType:'application/javascript',body:"export const buildQueryString=q=>'?'+new URLSearchParams(q);export const requestJSON=async url=>(await fetch('/test-api'+url)).json();"}));
  await page.route('**/test-api/bank-ledger/evidence/search?**',route=>{
   const query=new URL(route.request().url()).searchParams;assert.equal(query.get('orgId'),'7');assert.equal(query.get('currencyCode'),'USD');queries.push(query.get('search'));
   return route.fulfill({json:{documents:query.get('search')==='none'?[]:[{id:12,reference:'EXP-2026-000012',payee:'Vendor',amount:'100',remaining:'75'}]}});
  });
  await page.goto('http://127.0.0.1:'+port+'/ledger-picker-test.html?lang='+lang);
  await page.getByRole('button',{name:t.link,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText('EXP-2026-000012',{exact:true}).waitFor();assert.equal(queries[0],'');
  await dialog.getByRole('textbox',{name:t.search,exact:true}).fill('none');await dialog.getByText('EXP-2026-000012',{exact:true}).waitFor({state:'hidden'});
  await dialog.getByRole('textbox',{name:t.search,exact:true}).fill('');await dialog.getByText('EXP-2026-000012',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:t.select,exact:true}).click();assert.equal(await page.locator('output').textContent(),'12');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS ledger picker initial list, search, clear and selection in ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(jsx);}
