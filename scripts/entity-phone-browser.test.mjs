import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/entity-phone-test.html',jsx='frontend/entity-phone-test.jsx',port=43459;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/entity-phone-test.jsx"></script></html>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Box,TextField,MenuItem}from'@mui/material';import theme from'/src/theme';import Group from'/src/components/EntityCountryPhoneFields';import Phone from'/src/components/EntityPhoneField';import{displayEntityPhone}from'/src/utils/entityPhone.mjs';
const lang=new URLSearchParams(location.search).get('lang');function App(){const[country,setCountry]=React.useState('KR'),[value,setValue]=React.useState('+821012345678'),[local,setLocal]=React.useState('');window.values={country,value,local};window.changes??=0;return <ThemeProvider theme={theme}><CssBaseline/><Box sx={{p:2,display:'grid',gap:2,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'repeat(3,minmax(0,1fr))'}}} data-row><TextField label="Name"/><Group countryField={<TextField select label="Country" value={country} onChange={e=>setCountry(e.target.value)}>{['KR','VN'].map(c=><MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>} phoneField={<Phone label="Phone" country={country} languageCode={lang} value={value} onChange={e=>{window.changes++;setValue(e.target.value);}}/>}/><TextField label="Address"/></Box><Phone label="Shipping phone" country="KR" localValue value={local} onChange={e=>setLocal(e.target.value)} languageCode={lang}/><output data-display>{displayEntityPhone(value,country)}</output></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:['ignore','ignore','pipe'],windowsHide:true});let browser;server.stderr.on('data',chunk=>process.stderr.write(chunk));
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/entity-phone-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await page.goto(`http://127.0.0.1:${port}/entity-phone-test.html?lang=${lang}`);
  const phone=page.getByRole('textbox',{name:'Phone',exact:true}),local=page.getByRole('textbox',{name:'Shipping phone',exact:true});await phone.waitFor();
  assert.equal(await phone.inputValue(),'010-1234-5678');assert.equal(await page.evaluate(()=>window.changes),0);assert.equal(await page.locator('[data-display]').innerText(),'+82 010-1234-5678');
  assert.equal(await phone.getAttribute('placeholder'),'010-1234-5678');assert.equal(await phone.getAttribute('inputmode'),'numeric');assert.ok((await phone.getAttribute('title')).includes({ko:'숫자만 입력',en:'Enter digits only',vi:'Chỉ nhập số'}[lang]));
  const group=page.locator('[data-entity-country-phone]'),countryBox=await group.getByRole('combobox').boundingBox(),phoneBox=await phone.boundingBox();assert.ok(phoneBox.width>countryBox.width);assert.ok(Math.abs(countryBox.y-phoneBox.y)<2);
  if(width===1440){const widths=await page.locator('[data-row]').evaluate(n=>[...n.children].map(c=>c.getBoundingClientRect().width));assert.ok(Math.max(...widths)-Math.min(...widths)<2);}
  await phone.fill('');await phone.pressSequentially('01012345678');assert.equal(await phone.inputValue(),'010-1234-5678');assert.equal(await page.evaluate(()=>window.values.value),'+82 1012345678');
  await local.fill('+82 10-1234-5678');assert.equal(await local.inputValue(),'010-1234-5678');assert.equal(await page.evaluate(()=>window.values.local),'01012345678');
  await local.evaluate(n=>n.setSelectionRange(4,4));await local.press('Backspace');assert.equal(await page.evaluate(()=>window.values.local),'0112345678');
  await local.fill('010-1234-5678abc');assert.equal(await page.evaluate(()=>window.values.local),'01012345678');
  await phone.fill('');await phone.pressSequentially('021234567');assert.equal(await phone.inputValue(),'02-123-4567');
  await group.getByRole('combobox').click();await page.getByRole('option',{name:'VN',exact:true}).click();await phone.fill('0912345678');assert.equal(await phone.inputValue(),'0912 345 678');assert.equal(await page.evaluate(()=>window.values.value),'+84 912345678');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS numeric phone / domestic formatting / compact group',lang,width);
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
