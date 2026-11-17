import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/lookup-pointer-test.html',jsx='frontend/lookup-pointer-test.jsx',port=43489;
for(const path of [html,jsx])assert.ok(!existsSync(path));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/lookup-pointer-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Lookup from'/src/components/LookupSearchDialog';const rows=[{id:1,code:'DEXL',name:'DEX LOGIS'},{id:2,code:'THES',name:'THE SAN'},{id:3,code:'BARO',name:'BARO'},{id:4,code:'BLOCK',name:'Unavailable'}];function Demo(){const[q,setQ]=React.useState('');window.selected=[];return <ThemeProvider theme={theme}><CssBaseline/><Lookup open title='Forwarder' query={q} onQueryChange={setQ} options={rows} getOptionDisabled={row=>row.id===4} languageCode={new URLSearchParams(location.search).get('lang')} columns={[{key:'code',label:'Code',value:r=>r.code},{key:'name',label:'Name',value:r=>r.name}]} onSelect={row=>window.selected.push(row.id)} onClose={()=>{}}/></ThemeProvider>;}createRoot(document.getElementById('root')).render(<Demo/>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/lookup-pointer-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/lookup-pointer-test.html?lang=${lang}`);const rows=page.locator('tbody tr'),first=rows.nth(0);await first.waitFor();
  await first.locator('td').nth(1).click();assert.deepEqual(await page.evaluate(()=>window.selected),[]);await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.selected),[1],'mouse-highlighted option confirms with Enter');
  await rows.nth(1).locator('td').first().click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal((await page.evaluate(()=>window.selected)).at(-1),3);
  await first.locator('td').first().click();await first.getByRole('button').hover();await page.getByRole('heading').hover();
  const colors=await first.evaluate(row=>{const background=getComputedStyle(row).backgroundColor;return [...row.cells].map(cell=>{const color=getComputedStyle(cell).backgroundColor;return color==='rgba(0, 0, 0, 0)'?background:color;});});assert.ok(colors.every(color=>color===colors[0]),'selected action cell keeps the selected row background without hover');
  const before=(await page.evaluate(()=>window.selected)).length;await rows.nth(1).getByRole('button').click();assert.equal((await page.evaluate(()=>window.selected)).length,before+1,'select button confirms exactly once');await page.keyboard.press('Enter');assert.equal((await page.evaluate(()=>window.selected)).length,before+2,'focused button owns Enter without duplicate row activation');
  await rows.nth(3).locator('td').first().click();await page.keyboard.press('Enter');assert.equal((await page.evaluate(()=>window.selected)).length,before+2,'disabled options cannot confirm');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS lookup pointer/keyboard: ko/en/vi desktop/mobile, row click then Enter, arrow handoff, stable selected action background, single button activation and disabled choices.');
}finally{await browser?.close();vite.kill();for(const path of [html,jsx])if(existsSync(path))unlinkSync(path);}
