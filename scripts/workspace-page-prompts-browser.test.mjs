import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/workspace-prompts-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,createTheme,Drawer,Button,TextField} from '@mui/material';import Scope from '/src/components/WorkspaceDialogScope.jsx';import {usePageDialogs} from '/src/components/PageDialogProvider.jsx';window.promptResults=[];
function Page({name}){const dialogs=usePageDialogs();const[drawer,setDrawer]=React.useState(false),[busy,setBusy]=React.useState(false);const ask=async()=>{setBusy(true);try{const value=await dialogs.prompt('Amount '+name,'7');window.promptResults.push([name,value]);if(value===null)return;const ok=await dialogs.confirm('Confirm '+name);window.promptResults.push([name,ok]);if(ok)await dialogs.alert('Saved '+name);}finally{setBusy(false)}};return React.createElement(React.Fragment,{},React.createElement(Button,{onClick:()=>setDrawer(true)},'Drawer '+name),React.createElement(Button,{onClick:ask,disabled:busy},'Ask '+name),React.createElement(Drawer,{open:drawer,onClose:()=>setDrawer(false),anchor:'right',PaperProps:{sx:{width:240,p:2}}},React.createElement(TextField,{label:'Draft '+name,defaultValue:''})));}
function App(){const[tab,setTab]=React.useState('A');const viewport=React.useRef();return React.createElement(ThemeProvider,{theme:createTheme()},React.createElement('nav',{style:{position:'fixed',top:0,height:80}},React.createElement(Button,{onClick:()=>setTab('A')},'Tab A'),React.createElement(Button,{onClick:()=>setTab('B')},'Tab B')),React.createElement('main',{ref:viewport,style:{position:'fixed',top:80,left:200,right:0,bottom:0,overflow:'auto'}},['A','B'].map(name=>React.createElement('section',{key:name,style:{display:tab===name?'block':'none'}},React.createElement(Scope,{viewportRef:viewport,active:tab===name},React.createElement(Page,{name}))))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43196,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/workspace-prompts-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],native=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{native.push(d.type());await d.dismiss()});
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.goto(`http://127.0.0.1:${port}/workspace-prompts-acceptance.html`);
  await page.getByRole('button',{name:'Drawer A',exact:true}).click();await page.getByLabel('Draft A').fill('drawer draft');
  const paper=page.locator('[data-workspace-dialog-host]:visible .MuiDrawer-paper');await page.waitForTimeout(300);const rect=await paper.boundingBox();assert.equal(rect.y,80);assert.equal(rect.height,720);assert.ok(rect.x>=200);
  await page.getByRole('button',{name:'Tab B',exact:true}).click();await page.getByRole('button',{name:'Tab A',exact:true}).click();assert.equal(await page.getByLabel('Draft A').inputValue(),'drawer draft');await page.keyboard.press('Escape');await page.getByLabel('Draft A').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Ask A',exact:true}).click();await page.getByLabel('Amount A').fill('99');
  await page.getByRole('button',{name:'Tab B',exact:true}).click();await page.getByRole('button',{name:'Ask B',exact:true}).click();await page.getByLabel('Amount B').fill('55');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Tab A',exact:true}).click();assert.equal(await page.getByLabel('Amount A').inputValue(),'99');await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByText('Confirm A',{exact:true}).waitFor();await page.getByRole('button',{name:'OK',exact:true}).click();await page.getByText('Saved A',{exact:true}).waitFor();await page.getByRole('button',{name:'OK',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.promptResults),[['B',null],['A','99'],['A',true]]);assert.deepEqual(native,[]);assert.deepEqual(errors,[]);
  console.log('Page prompts and drawers passed: scoped bounds, drafts retained, independent tab prompts, cancel/confirm/alert results, no native dialogs.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
