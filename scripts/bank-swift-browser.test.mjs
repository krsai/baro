import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
const file=path.resolve('frontend/bank-swift-acceptance.html');assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Editor from '/src/components/BankAccountEditorDialog';
const lang=new URLSearchParams(location.search).get('lang');function App(){const [draft,setDraft]=React.useState({accountKind:'BANK',bankName:'Test Bank',accountNumber:'000123',accountHolder:'BARO',currencyId:1,swiftCode:''});return React.createElement(Editor,{open:true,showSwift:true,title:'Bank Account',value:draft,onChange:setDraft,onSave:value=>window.savedBank=value,onClose:()=>{},languageCode:lang,currencies:[{value:1,label:'USD'}]});}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App)));
</script>`);
const port=43387,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const actions={showNotification:()=>{},removeNotification:()=>{}};export const useAppActions=()=>actions;'}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}?lang=${lang}`);
  const swift=page.locator('input[name="swiftCode"]');await swift.waitFor({timeout:5000}).catch(async error=>{console.error({errors,body:(await page.locator('body').innerText()).slice(0,900)});throw error;});await swift.fill('ascbvnvx');assert.equal(await swift.inputValue(),'ASCBVNVX');
  await page.getByRole('button',{name:new RegExp('^'+RegExp.escape(ENTITY_TEXT[lang].save)+'$','i')}).click();await page.waitForFunction(()=>window.savedBank?.swiftCode==='ASCBVNVX');
  await swift.fill('invalid');await page.getByRole('button',{name:new RegExp('^'+RegExp.escape(ENTITY_TEXT[lang].save)+'$','i')}).click();assert.equal(await swift.getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>window.savedBank.swiftCode),'ASCBVNVX');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('SWIFT editor: ko/en/vi desktop/mobile uppercase, saved value, invalid format rejection and layout passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
