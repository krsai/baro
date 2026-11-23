import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/human-text-case-acceptance.html'),port=43459;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {ThemeProvider,Stack,TextField,Button} from '@mui/material';import theme from '/src/theme';import CompanyNameField from '/src/components/CompanyNameField';import SearchInput from '/src/components/SearchInput';
function App(){const [values,setValues]=React.useState({}),[saved,setSaved]=React.useState(null);const field=(name,extra={})=>React.createElement(TextField,{key:name,label:name,name,value:values[name]||'',onChange:e=>setValues(v=>({...v,[name]:e.target.value})),...extra});return React.createElement(ThemeProvider,{theme},React.createElement(Stack,{spacing:2},field('contact name'),field('address',{multiline:true}),field('driver',{variant:'standard'}),field('vessel',{variant:'filled'}),field('code'),field('email',{type:'email'}),field('password',{type:'password'}),field('custom',{'data-text-case':'preserve'}),React.createElement(CompanyNameField,{label:'Company name',value:values.company||'',onChange:e=>setValues(v=>({...v,company:e.target.value}))}),React.createElement(SearchInput,{label:'Search',value:values.search||'',onChange:e=>setValues(v=>({...v,search:e.target.value}))}),React.createElement(Button,{onClick:()=>setSaved(values)},'Save'),React.createElement('output',{'data-testid':'values'},JSON.stringify(values)),React.createElement('output',{'data-testid':'saved'},JSON.stringify(saved))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/human-text-case-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/human-text-case-acceptance.html`);
  for(const [name,input,expected]of [['Contact Name','nguyen VAN an','Nguyen Van An'],['Address','12 MAIN STREET\nHANOI','12 Main Street\nHanoi'],['Driver','john smith','John Smith'],['Vessel','ocean queen','Ocean Queen'],['Code','EXACT_code','EXACT_code'],['Email','Test@EXAMPLE.com','Test@EXAMPLE.com'],['Password','ExactPassword','ExactPassword'],['Custom','leave EXACT','leave EXACT'],['Company Name','dex logis','DEX LOGIS'],['Search','exact QUERY','exact QUERY']]){
   const inputField=page.getByLabel(name,{exact:true});await inputField.fill(input);await inputField.press('Tab');assert.equal(await inputField.inputValue(),expected,name);
  }
  const contact=page.getByLabel('Contact Name',{exact:true});await contact.focus();await contact.dispatchEvent('compositionstart');await contact.fill('nguyen VAN');assert.equal(await contact.inputValue(),'nguyen VAN');await contact.dispatchEvent('compositionend');await contact.press('Tab');assert.equal(await contact.inputValue(),'Nguyen Van');
  await page.getByRole('button',{name:'Save',exact:true}).click();const saved=JSON.parse(await page.getByTestId('saved').textContent());assert.equal(saved['contact name'],'Nguyen Van');assert.equal(saved.code,'EXACT_code');assert.equal(saved.company,'DEX LOGIS');assert.deepEqual(errors,[]);console.log('PASS actual values, variants, multiline, IME and exceptions '+width);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
