import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/ledger-code-display-test.html'),jsx=html.replace('.html','.jsx'),port=43512;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/ledger-code-display-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Box,Button,Dialog,DialogContent}from'@mui/material';import theme from'/src/theme';import Field from'/src/components/AccountingCodeField';
const codes=[{id:1,code:'LONE',base:{cashDirection:'BOTH'}},{id:2,code:'EXPV',base:{cashDirection:'BOTH'}}];
function App(){const[mode,setMode]=React.useState(false),[value,setValue]=React.useState(1);window.selectedCode=value;const field=<Box data-ledger-code sx={{width:92,display:'flex',alignItems:'center'}}><Field hideLabel showSearchIcon={false} languageCode={new URLSearchParams(location.search).get('lang')} direction="IN" codes={codes} value={value} onChange={setValue}/></Box>;return <ThemeProvider theme={theme}><CssBaseline/><Button onClick={()=>{setValue(1);setMode(true);}}>Dashboard</Button>{mode?<Dialog open fullWidth onClose={()=>setMode(false)}><DialogContent>{field}<Button onClick={()=>setMode(false)}>Close</Button></DialogContent></Dialog>:field}<Button>Next</Button></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-code-display-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/ledger-code-display-test.html?lang=${lang}`);
  for(const mode of ['direct','dashboard']){
   if(mode==='dashboard')await page.getByRole('button',{name:'Dashboard',exact:true}).click();
   const input=page.locator('[data-ledger-code] input');await input.waitFor();assert.equal(await input.inputValue(),'LONE');
   const bounds=await input.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));
   assert.ok(bounds.width>=48,JSON.stringify({lang,width,mode,...bounds}));assert.ok(bounds.scroll<=bounds.client+1,'whole saved code fits in the field');
   await input.fill('EXPV');await input.press('Tab');assert.equal(await input.inputValue(),'EXPV');assert.equal(await page.evaluate(()=>window.selectedCode),2);
   await input.fill('EXP');await input.press('Enter');const lookup=page.locator('[data-lookup-dialog=true]');await lookup.waitFor();await lookup.getByRole('row').filter({hasText:'EXPV'}).getByRole('button').click();await lookup.waitFor({state:'hidden'});assert.equal(await input.inputValue(),'EXPV');
   if(mode==='dashboard')await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  assert.deepEqual(errors,[]);await page.close();console.log('PASS visible ledger codes, direct/dashboard, exact Tab and partial lookup',lang,width);
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
