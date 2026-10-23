import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/workspace-dialog-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,createTheme,Dialog,DialogTitle,DialogContent,DialogActions,Drawer,Button,TextField} from '@mui/material';import Scope from '/src/components/WorkspaceDialogScope.jsx';
window.dialogClosed=[];window.dialogExited=[];
function Page({name}){const[open,setOpen]=React.useState(false),[drawer,setDrawer]=React.useState(false);return React.createElement(React.Fragment,{},React.createElement(Button,{onClick:()=>setOpen(true)},'Open '+name),React.createElement(Button,{onClick:()=>setDrawer(true)},'Drawer '+name),React.createElement(Drawer,{anchor:'right',open:drawer,onClose:()=>setDrawer(false),PaperProps:{sx:{top:64,height:'calc(100% - 64px)',width:1400,p:2.5,overflow:'auto'}}},React.createElement('div',{style:{position:'sticky',top:0,background:'white',zIndex:2}},React.createElement(Button,{onClick:()=>setDrawer(false)},'Close drawer')),React.createElement('div',{style:{width:2000,minHeight:2600}},'Very wide and tall drawer body')),React.createElement(Dialog,{open,onClose:()=>{window.dialogClosed.push(name);setOpen(false)},slotProps:{transition:{onExited:()=>window.dialogExited.push(name)}}},React.createElement(DialogTitle,{},'Dialog '+name),React.createElement(DialogContent,{},React.createElement(TextField,{label:'Value '+name,defaultValue:''}),React.createElement('div',{style:{width:2000,height:2600}},'Very wide and tall dialog body')),React.createElement(DialogActions,{},React.createElement(Button,{onClick:()=>setOpen(false)},'Close dialog'))));}
function App(){const[tab,setTab]=React.useState('A');const viewport=React.useRef();return React.createElement(ThemeProvider,{theme:createTheme()},React.createElement('header',{style:{position:'fixed',top:0,height:80}},React.createElement(Button,{onClick:()=>setTab('A')},'Tab A'),React.createElement(Button,{onClick:()=>setTab('B')},'Tab B')),React.createElement('aside',{style:{position:'fixed',top:80,left:0,width:200}},React.createElement(Button,{onClick:()=>setTab(tab==='A'?'B':'A')},'Menu switch')),React.createElement('main',{ref:viewport,style:{position:'fixed',top:80,left:200,right:0,bottom:0,overflow:'auto'}},['A','B'].map(name=>React.createElement('section',{key:name,style:{display:tab===name?'block':'none',minHeight:1800}},React.createElement(Scope,{viewportRef:viewport,active:tab===name},React.createElement(Page,{name}))))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43195,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/workspace-dialog-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)});page.on('console',m=>{if(m.type()==='error')console.log(m.text())});
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.goto(`http://127.0.0.1:${port}/workspace-dialog-acceptance.html`);
  await page.getByRole('button',{name:'Open A',exact:true}).click();await page.getByLabel('Value A').fill('unsaved A');
  const dialog=page.getByRole('dialog'),content=dialog.locator('.MuiDialogContent-root');
  const dialogRect=await dialog.boundingBox();assert.ok(dialogRect.x>200&&dialogRect.y>80);assert.ok(dialogRect.x+dialogRect.width<1200&&dialogRect.y+dialogRect.height<800);
  assert.ok(await content.evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth>el.clientWidth));
  await dialog.getByRole('button',{name:'Close dialog'}).waitFor();
  const backdrop=page.locator('[data-workspace-dialog-host]:visible .MuiBackdrop-root');
  const rect=await backdrop.boundingBox();assert.equal(rect.x,200);assert.equal(rect.y,80);assert.equal(rect.width,1000);assert.equal(rect.height,720);
  await page.getByRole('button',{name:'Menu switch',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Open B',exact:true}).click();await page.getByLabel('Value B').fill('unsaved B');
  await page.getByRole('button',{name:'Tab A',exact:true}).click();assert.equal(await page.getByLabel('Value A').inputValue(),'unsaved A');
  assert.deepEqual(await page.evaluate(()=>window.dialogClosed),[]);assert.deepEqual(await page.evaluate(()=>window.dialogExited),[]);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.dialogClosed),['A']);
  await page.getByRole('button',{name:'Tab B',exact:true}).click();assert.equal(await page.getByLabel('Value B').inputValue(),'unsaved B');
  await page.setViewportSize({width:1000,height:700});await page.waitForTimeout(100);
  const resized=await backdrop.boundingBox();assert.equal(resized.width,800);assert.equal(resized.height,620);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.dialogClosed),['A','B']);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Drawer B',exact:true}).click();
  const drawer=page.locator('[data-workspace-dialog-host]:visible .MuiDrawer-paper');await drawer.waitFor();
  for(const [width,height] of [[1720,900],[1000,700],[390,740],[740,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    const host=await page.locator('[data-workspace-dialog-host]:visible').boundingBox(),paper=await drawer.boundingBox();
    assert.ok(paper.x>host.x&&paper.y>host.y,JSON.stringify({host,paper}));assert.ok(paper.x+paper.width<host.x+host.width&&paper.y+paper.height<host.y+host.height,JSON.stringify({host,paper}));
    assert.ok(await drawer.evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth>el.clientWidth));
    await drawer.getByRole('button',{name:'Close drawer'}).waitFor();
  }
  await drawer.getByRole('button',{name:'Close drawer'}).click();await drawer.waitFor({state:'hidden'});
  console.log('Workspace dialogs passed: body-only backdrop, menu/tab access, two preserved drafts, Escape isolation and resize.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
