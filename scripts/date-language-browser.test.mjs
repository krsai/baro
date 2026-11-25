import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Chrome required');
const fixture=path.resolve('frontend/date-language-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Field from '/src/components/LocalizedDateField.jsx';import {LanguageProvider,useLanguage} from '/src/context/LanguageContext.jsx';
const h=React.createElement;function App(){const {setLanguageCode}=useLanguage(),[value,setValue]=React.useState('2026-10-15');return h(ThemeProvider,{theme},h('div',null,...['ko','en','vi'].map(code=>h('button',{onClick:()=>setLanguageCode(code)},code)),h(Field,{label:'Date',name:'date',value,onChange:e=>setValue(e.target.value),inputProps:{min:'2026-10-10',max:'2026-10-20'}}),h(Field,{label:'Empty',value:'',onChange:()=>{}}),h('output',null,value)));}createRoot(document.getElementById('root')).render(h(LanguageProvider,null,h(App)));
</script></body></html>`);
const port=43219,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/date-picker-theme-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({locale:'ko-KR'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/date-language-acceptance.html');
  for(const [lang,month] of [['en','October'],['vi','10'],['ko','10']]){
    await page.getByRole('button',{name:lang,exact:true}).click();
    assert.equal(await page.locator('output').textContent(),'2026-10-15');
    assert.equal(await page.locator('input[type="date"]').count(),0);
    await page.locator('.MuiIconButton-root').first().click();
    await page.getByRole('gridcell',{name:'16',exact:true}).waitFor();
    assert.ok((await page.locator('.MuiPickersCalendarHeader-label').textContent()).includes(month));
    assert.equal(await page.getByRole('gridcell',{name:'9',exact:true}).isDisabled(),true);
    await page.getByRole('gridcell',{name:'16',exact:true}).click();
    assert.equal(await page.locator('output').textContent(),'2026-10-16');
    // Restore the same selected day through the localized calendar.
    await page.locator('.MuiIconButton-root').first().click();await page.getByRole('gridcell',{name:'15',exact:true}).click();
  }
  assert.deepEqual(errors,[]);console.log('Date language switching, Korean browser, ISO value, empty field and bounds passed');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
