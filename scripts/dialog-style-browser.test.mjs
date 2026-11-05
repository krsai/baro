import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve('frontend/dialog-style-acceptance.html'),port=43423;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,Button,Dialog,DialogTitle,DialogContent,DialogActions,TextField,Stack} from '@mui/material';import theme from '/src/theme';
function App(){const [open,setOpen]=React.useState(false);const params=new URLSearchParams(location.search);return React.createElement(ThemeProvider,{theme},React.createElement(Button,{onClick:()=>setOpen(true)},'Open'),React.createElement(Dialog,{open,fullWidth:true,maxWidth:'sm'},React.createElement(DialogTitle,null,params.get('title')),React.createElement(DialogContent,{dividers:params.get('dividers')==='1'},React.createElement(Stack,{spacing:2},React.createElement(TextField,{label:'Name',defaultValue:'Example'}),React.createElement(TextField,{label:'Address'}))),React.createElement(DialogActions,null,React.createElement(Button,{onClick:()=>setOpen(false)},'Cancel'),React.createElement(Button,{variant:'contained'},'Save'))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dialog-style-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const title of ['업종 수정','Edit industry','Sửa loại hình'])for(const width of [1440,390])for(const dividers of [0,1]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/dialog-style-acceptance.html?title=${encodeURIComponent(title)}&dividers=${dividers}`);await page.getByRole('button',{name:'Open',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const styles=await dialog.evaluate(el=>{const get=s=>getComputedStyle(el.querySelector(s));const title=get('.MuiDialogTitle-root'),body=get('.MuiDialogContent-root'),actions=get('.MuiDialogActions-root');return {titleLine:title.borderBottomWidth,bodyTop:body.borderTopWidth,bodyBottom:body.borderBottomWidth,actionLine:actions.borderTopWidth,paddingTop:parseFloat(body.paddingTop),paddingLeft:body.paddingLeft,titleLeft:title.paddingLeft,actionLeft:actions.paddingLeft};});
  assert.equal(styles.titleLine,'0px');assert.equal(styles.bodyTop,'0px');assert.equal(styles.bodyBottom,'0px');assert.equal(styles.actionLine,'0px');assert.ok(styles.paddingTop>=16);assert.equal(styles.titleLeft,styles.paddingLeft);assert.equal(styles.actionLeft,styles.paddingLeft);
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Changed');assert.equal(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'Changed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: borderless title/content/actions, consistent spacing, dividers compatibility, ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
