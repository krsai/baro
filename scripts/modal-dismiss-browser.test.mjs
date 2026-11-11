import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
const html='frontend/modal-dismiss-test.html',jsx='frontend/modal-dismiss-test.jsx',port=43473;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/modal-dismiss-test.jsx"></script></html>');
writeFileSync(jsx,`
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import Bank from'/src/components/BankAccountEditorDialog';import Provider,{usePageDialogs}from'/src/components/PageDialogProvider';
function Demo(){const dialogs=usePageDialogs(),[open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[value,setValue]=React.useState({currencyId:'USD',accountKind:'BANK',displayName:'Main',bankName:'Bank',accountNumber:'123',accountHolder:'Holder'});window.setBusy=setBusy;
return <><Button onClick={()=>setOpen(true)}>Open bank</Button><Button onClick={async()=>{window.result=await dialogs.confirm('Confirm action');}}>Ask confirm</Button><Button onClick={async()=>{window.result=await dialogs.prompt('Prompt value','Initial');}}>Ask prompt</Button><Bank open={open} title="Bank editor" value={value} onChange={setValue} busy={busy} currencies={[{value:'USD',label:'USD'}]} languageCode={new URLSearchParams(location.search).get('lang')} onSave={draft=>{window.saves=(window.saves||[]).concat(draft);setOpen(false);}} onClose={()=>{window.closes=(window.closes||0)+1;setOpen(false);}}/></>;}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Provider><Demo/></Provider></ThemeProvider>);
`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/modal-dismiss-test.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.goto('http://127.0.0.1:'+port+'/modal-dismiss-test.html?lang='+lang);
  const dialog=page.getByRole('dialog'),outside=()=>page.mouse.click(3,450);
  await page.getByRole('button',{name:'Open bank',exact:true}).click();await dialog.waitFor();assert.deepEqual(await dialog.locator('.MuiDialogActions-root button').allTextContents(),[ENTITY_TEXT[lang].save]);
  const input=dialog.getByRole('textbox').first();await input.fill('Edited draft');assert.equal(await dialog.count(),1);
  await outside();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.saves?.length||0),0);assert.equal(await page.evaluate(()=>window.closes),1);
  await page.getByRole('button',{name:'Open bank',exact:true}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('textbox').first().inputValue(),'Edited draft');
  await page.evaluate(()=>window.setBusy(true));await dialog.locator('button').last().waitFor();await page.waitForFunction(()=>document.querySelector('[role="dialog"] .MuiDialogActions-root button')?.disabled);
  await outside();await page.keyboard.press('Escape');assert.equal(await dialog.count(),1);assert.equal(await page.evaluate(()=>window.closes),1);
  await page.evaluate(()=>window.setBusy(false));await page.waitForFunction(()=>!document.querySelector('[role="dialog"] .MuiDialogActions-root button')?.disabled);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Open bank',exact:true}).click();await dialog.getByRole('button',{name:ENTITY_TEXT[lang].save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.saves.length),1);
  await page.getByRole('button',{name:'Ask confirm',exact:true}).click();await dialog.waitFor();assert.equal(await dialog.locator('.MuiDialogActions-root button').count(),1);await outside();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.result),false);
  await page.getByRole('button',{name:'Ask prompt',exact:true}).click();await dialog.getByRole('textbox',{name:'Prompt value'}).fill('Abandoned');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.result),null);
  await page.getByRole('button',{name:'Ask confirm',exact:true}).click();await dialog.locator('.MuiDialogActions-root button').click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.result),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS modal dismiss: ko/en/vi desktop/mobile, no cancel actions, outside/Escape cancellation, unchanged confirm/save and busy protection.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
