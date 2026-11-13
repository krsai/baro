import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/partner-refresh-acceptance.html'),port=43474;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/partner-refresh-acceptance.jsx"></script></html>');
const source=fixture.replace('.html','.jsx');
writeFileSync(source,`
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Partners from '/src/pages/App/BusinessPartners';import {RequestScopeBoundary} from '/src/context/RequestScopeContext';
function App(){const [active,setActive]=React.useState(true);window.setActive=setActive;return <ThemeProvider theme={theme}><RequestScopeBoundary active={active}><Partners unified embedded type="PROCESS_OUTSOURCING"/></RequestScopeBoundary></ThemeProvider>;}createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-refresh-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const auth={isAuthenticated:true,activeOrgId:7,activeOrgRole:"ADMIN",activeProfile:{orgRole:"ADMIN",orgType:"MANUFACTURER"},accessProfile:{orgRole:"ADMIN",orgType:"MANUFACTURER"}};export const useAuth=()=>auth;'}));
 await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
 await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{}});'}));
 await page.route('**/src/components/BusinessPartnerDialog.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export default function Dialog({open,onClose}){return open?React.createElement('div',null,React.createElement('input',{id:'draft',defaultValue:'draft'}),React.createElement('button',{onClick:onClose},'Close editor')):null;}`}));
 const headers={'Access-Control-Allow-Origin':'*'};let count=0,release;
 await page.route('**/partner-directory?*',async r=>{count++;if(release)await release.promise;await r.fulfill({headers,json:{roles:[],rows:[{kind:'BUSINESS',entity:{id:9,type:'PROCESS_OUTSOURCING',name:'Refresh partner',partyKind:'CORPORATE'},classification:{roleIds:[],industryIds:[],industries:[]},hasUsageHistory:true}]}});});
 await page.goto(`http://127.0.0.1:${port}/partner-refresh-acceptance.html`);await page.getByText('Refresh partner',{exact:true}).waitFor();assert.equal(count,1);
 const event=orgId=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:id,topics:['business-partners']}})),orgId);
 await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(150);assert.equal(count,1);
 await event(8);await page.waitForTimeout(100);assert.equal(count,1);
 await page.getByRole('button',{name:'Refresh partner',exact:true}).click();await page.locator('#draft').fill('keep my draft');await event(7);await page.waitForTimeout(100);assert.equal(count,1);assert.equal(await page.locator('#draft').inputValue(),'keep my draft');
 await page.getByRole('button',{name:'Close editor'}).click();await page.waitForFunction(()=>!document.querySelector('#draft'));await page.waitForTimeout(150);assert.equal(count,2);
 await page.evaluate(()=>window.setActive(false));await page.waitForTimeout(50);await event(7);await event(7);await page.waitForTimeout(100);assert.equal(count,2);
 await page.evaluate(()=>window.setActive(true));await page.waitForTimeout(150);assert.equal(count,3);
 let resolve;release={promise:new Promise(r=>resolve=r)};await event(7);await page.waitForTimeout(100);assert.equal(count,4);assert.equal(await page.getByText('Refresh partner',{exact:true}).isVisible(),true);
 await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(100);assert.equal(count,4);
 await event(7);await event(7);await page.waitForTimeout(50);assert.equal(count,4);release=null;resolve();await page.waitForTimeout(150);assert.equal(count,5);
 await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+31000;window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(150);assert.equal(count,6);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner refresh desktop/mobile passed: focus deduplication, company isolation, deferred editor/inactive updates, retained rows during refresh.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);unlinkSync(source);}
