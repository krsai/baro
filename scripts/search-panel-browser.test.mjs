import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/search-panel-acceptance.html');assert.ok(!existsSync(fixture));
const modulePath=path.resolve('frontend/search-panel-fixture.jsx');assert.ok(!existsSync(modulePath));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/search-panel-fixture.jsx"></script></body></html>`);
writeFileSync(modulePath,`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Box,TextField,MenuItem} from '@mui/material';import theme from '/src/theme';import {LanguageProvider} from '/src/context/LanguageContext.jsx';import SearchPanel from '/src/components/SearchPanel.jsx';import SearchInput from '/src/components/SearchInput.jsx';
function Screen(){const [query,setQuery]=useState(''),[status,setStatus]=useState('all');return <Box sx={{p:2}}><SearchPanel title="Orders" search={<SearchInput placeholder="Find order" value={query} onChange={e=>setQuery(e.target.value)}/>} filters={<TextField select label="Status" value={status} onChange={e=>setStatus(e.target.value)} sx={{minWidth:180}}><MenuItem value="all">All</MenuItem><MenuItem value="open">Open</MenuItem></TextField>} onReset={()=>{setQuery('');setStatus('all');}}/><output>{query+':'+status}</output><SearchPanel title="Styles" search={<SearchInput placeholder="Find style" value="" onChange={()=>{}}/>}/></Box>}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><LanguageProvider><Screen/></LanguageProvider></ThemeProvider>);`);
const port=43208,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/search-panel-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const [lang,collapse,expand,reset,clear]of [['ko','조건 접기','조건 펼치기','초기화','검색어 지우기'],['en','Hide filters','Show filters','Reset','Clear search'],['vi','Ẩn bộ lọc','Hiện bộ lọc','Đặt lại','Xóa từ khóa']]){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>localStorage.setItem('baro_language_override',lang),lang);
  await page.goto(`http://127.0.0.1:${port}/search-panel-acceptance.html`);
  const panel=page.getByRole('region',{name:'Orders'});
  await page.getByPlaceholder('Find order').fill('PO-7');
  await page.getByRole('combobox',{name:'Status'}).click();await page.getByRole('option',{name:'Open',exact:true}).click();
  assert.equal(await page.locator('output').textContent(),'PO-7:open');
  await panel.getByRole('button',{name:collapse}).click();assert.equal(await panel.locator('[data-search-filters]').isVisible(),false);
  assert.equal(await page.locator('output').textContent(),'PO-7:open');
  await panel.getByRole('button',{name:expand}).click();assert.equal(await page.getByRole('combobox',{name:'Status'}).textContent(),'Open');
  await panel.getByRole('button',{name:clear}).click();assert.equal(await page.locator('output').textContent(),':open');
  await panel.getByRole('button',{name:reset,exact:true}).click();assert.equal(await page.locator('output').textContent(),':all');
  assert.equal(await page.getByRole('region',{name:'Styles'}).getByRole('button',{name:collapse}).count(),0);
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Shared search panel: ko/en/vi, query/filter/reset, collapse preserves state, accessible labels and mobile layout passed.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);unlinkSync(modulePath);}
