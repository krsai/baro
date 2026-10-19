import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync,writeFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Chrome required');
const fixture=path.resolve('frontend/page-layout-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Paper,Button,TextField,Table,TableBody,TableRow,TableCell} from '@mui/material';import theme from '/src/theme';import Container from '/src/components/AppPageContainer';import Sections from '/src/components/PageContentStack';import Toolbar from '/src/components/PageToolbar';
const e=React.createElement;createRoot(document.getElementById('root')).render(e(ThemeProvider,{theme},e(CssBaseline),e(Container,{title:'Payment Request',description:'Shared page layout',titleActions:e(Button,{variant:'contained'},'Save'),toolbar:e(Toolbar,{showLastUpdater:false,left:e(TextField,{label:'Search',size:'small'}),right:e(Button,null,'Reset')}),footer:e(Button,null,'Close')},e(Sections,null,e(Paper,{'data-testid':'panel-one',variant:'outlined'},e(Table,null,e(TableBody,null,e(TableRow,null,e(TableCell,null,'Existing record'))))),e(Paper,{'data-testid':'panel-two',variant:'outlined'},'Second section')))));
</script></body></html>`);
const port=43219,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/page-layout-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const width of [1440,768,390]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/page-layout-acceptance.html`);await page.getByRole('heading',{name:'Payment Request',level:1}).waitFor();
    const padding=width<600?16:24;
    const header=await page.locator('.app-page-header').boundingBox(),content=await page.locator('.app-page-content').boundingBox();
    assert.equal(header.x,padding);assert.equal(content.x,padding);assert.equal(content.width,width-2*padding);
    assert.equal(Math.round(content.y-header.y-header.height),20,'One shared title-to-content gap');
    assert.equal(await page.locator('.app-page-header').evaluate(el=>getComputedStyle(el).borderBottomWidth),'0px');
    assert.equal(await page.locator('.app-page-footer').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontWeight),'600');
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'20px');
    const first=await page.getByTestId('panel-one').boundingBox(),second=await page.getByTestId('panel-two').boundingBox();
    assert.equal(Math.round(second.y-first.y-first.height),20,'Sections use the shared spacing token');
    assert.equal(await page.locator('td').evaluate(el=>getComputedStyle(el).borderBottomWidth),'1px','Meaningful table row boundaries remain');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Shared page layout passed: 1440/768/390px, page insets, header/content/section gaps, heading hierarchy, border cleanup and table boundaries.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
