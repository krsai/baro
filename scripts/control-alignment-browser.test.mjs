import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/control-alignment-acceptance.html';
writeFileSync(file,`<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Stack,TextField,ToggleButtonGroup,ToggleButton,FormControlLabel,Switch}from'@mui/material';import{appThemes}from'/src/theme';import'/src/styles/form.css';
const h=React.createElement;createRoot(document.getElementById('root')).render(h(ThemeProvider,{theme:appThemes[new URLSearchParams(location.search).get('theme')]},h(CssBaseline),h(Stack,{direction:'row',alignItems:'center',spacing:2},h(TextField,{label:'Empty'}),h(TextField,{label:'Value',value:'Abc'}),h(ToggleButtonGroup,{value:'a'},h(ToggleButton,{value:'a'},'Shipper'),h(ToggleButton,{value:'b'},'Consignee')),h(FormControlLabel,{control:h(Switch),label:'Enabled'})),h(TextField,{multiline:true,minRows:3,label:'Notes'})));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43229'],{cwd:'frontend',stdio:'ignore'});let browser;
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43229/control-alignment-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
for(const theme of ['standard','compact'])for(const mobile of [false,true]){const page=await browser.newPage({viewport:{width:1200,height:600},hasTouch:mobile});await page.goto('http://127.0.0.1:43229/control-alignment-acceptance.html?theme='+theme);await page.locator('.MuiToggleButton-root').first().waitFor();const result=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),input=rect('.MuiOutlinedInput-root'),label=rect('.MuiInputLabel-root'),toggle=rect('.MuiToggleButtonGroup-root');return{input:input.height,toggle:toggle.height,labelOffset:label.y+label.height/2-input.y-input.height/2,multiline:rect('.MuiInputBase-multiline').height};});assert.equal(result.input,result.toggle,JSON.stringify({theme,mobile,result}));assert.ok(Math.abs(result.labelOffset)<1,JSON.stringify(result));assert.ok(result.multiline>result.input);console.log(theme,mobile?'touch':'desktop',result);await page.close();}}
finally{await browser?.close();server.kill();unlinkSync(file);}
