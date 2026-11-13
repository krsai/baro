import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

const html='frontend/dashboard-document-load-test.html',jsx='frontend/dashboard-document-load-test.jsx',port=43497;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-document-load-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import{MemoryRouter}from'react-router-dom';import{AppProvider}from'/src/context/AppContext';import Dialog from'/src/components/DashboardDocumentDialog';function Demo(){const[open,setOpen]=React.useState(false);return <ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><AppProvider><h1>Dashboard</h1><input aria-label="Draft" defaultValue="Keep my draft"/><Button onClick={()=>setOpen(true)}>Open alert</Button>{open&&<Dialog row={{path:'/bank-ledger/edit/1'}} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>setOpen(false)} onNavigate={()=>{}}/>}</AppProvider></MemoryRouter></ThemeProvider>;}createRoot(document.getElementById('root')).render(<Demo/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-document-load-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let requests=0,navigations=0;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:2};return {isAuthenticated:true,activeOrgId:2,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/pages/App/BankLedgerEntry*',r=>{requests++;return r.abort('failed');});
  await page.goto(`http://127.0.0.1:${port}/dashboard-document-load-test.html?lang=${lang}`);
  await page.getByRole('button',{name:'Open alert',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByTestId('dashboard-document-load-error').waitFor();
  assert.equal(requests,1);assert.equal(navigations,1);assert.equal(await page.getByText('Unexpected Application Error!',{exact:true}).count(),0);
  assert.equal(await dialog.getByTestId('dashboard-document-load-error').getByRole('button').count(),1);
  assert.equal(await page.getByRole('textbox',{name:'Draft',includeHidden:true}).inputValue(),'Keep my draft');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'Keep my draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'Open alert',exact:true}).click();await page.getByTestId('dashboard-document-load-error').waitFor();assert.equal(navigations,1);
  await page.close();
 }
 console.log('PASS document module failure: ko/en/vi desktop/mobile, local error, explicit reload, no automatic reload, preserved dashboard draft and close/reopen.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
