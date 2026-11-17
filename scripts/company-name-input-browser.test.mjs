import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';

const fixture='frontend/company-name-input-test.html',port=43492;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import Fields from '/src/components/PartnerProfileFields.jsx';
function App(){const[value,setValue]=React.useState({name:'',nameKo:'',nameVi:'',contactName:'',partyKind:'INDIVIDUAL'});window.draft=value;return React.createElement(Fields,{value,languageCode:new URLSearchParams(location.search).get('lang'),onChange:(key,v)=>setValue(s=>({...s,[key]:v}))});}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/company-name-input-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/company-name-input-test.html?lang=${lang}`);
  const name=page.locator('input[name=name]');await name.pressSequentially('acme Co.');assert.equal(await name.inputValue(),'ACME CO.');
  await page.locator('input[name=nameVi]').fill('Nước uống Bình Minh');assert.equal(await page.locator('input[name=nameVi]').inputValue(),'NƯỚC UỐNG BÌNH MINH');
  const ko=page.locator('input[name=nameKo]');await ko.dispatchEvent('compositionstart');await ko.fill('회사 acme');assert.equal(await ko.inputValue(),'회사 acme');await ko.dispatchEvent('compositionend');assert.equal(await ko.inputValue(),'회사 ACME');
  await page.locator('input[name=contactName]').fill('Ms. Nguyệt');assert.equal(await page.locator('input[name=contactName]').inputValue(),'Ms. Nguyệt');
  assert.deepEqual(await page.evaluate(()=>[window.draft.name,window.draft.nameKo,window.draft.nameVi]),['ACME CO.','회사 ACME','NƯỚC UỐNG BÌNH MINH']);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Company name input passed: ko/en/vi desktop/mobile, typing, pasted accents, IME composition, actual draft values and contact preservation.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
