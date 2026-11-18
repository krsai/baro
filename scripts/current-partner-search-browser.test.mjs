import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {companyPublicSearchText} from '../frontend/src/constants/companyPublicSearch.js';
const file='frontend/current-partner-acceptance.html',port=43493;assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Panel from'/src/components/CompanyPublicSearchPanel';const languageCode=new URLSearchParams(location.search).get('lang');createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Panel,{orgId:1,entityId:7,languageCode,initialQuery:'0108854060',active:true,currentEntity:{id:7,name:'JUNHUA LABEL',businessNumber:'010-8854060',code:'JHLB'},onClose:()=>{},onSelect:()=>{throw Error('self selected')},profileRows:row=>[['name',row.name],['number',row.businessNumber]],labels:{name:'Name',number:'Number',same:'Connect'}})));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${file.split('/')[1]}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),t=companyPublicSearchText[lang],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/company-connections/search?*',r=>r.fulfill({json:[{id:7,sourceEntityId:7,name:'JUNHUA LABEL'}]}));
 await page.goto(`http://127.0.0.1:${port}/${file.split('/')[1]}?lang=${lang}`);
 await page.getByText(t.current,{exact:true}).waitFor();await page.waitForTimeout(400);
 assert.equal(await page.getByText(t.empty,{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).count(),0);
 const input=page.getByRole('textbox',{name:t.query});await input.fill('JUNHUA');await page.getByText(t.current,{exact:true}).waitFor();
 await input.fill('UNRELATED');await page.getByText(t.empty,{exact:true}).waitFor();assert.equal(await page.getByText(t.current,{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.close();console.log('PASS current partner search',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
