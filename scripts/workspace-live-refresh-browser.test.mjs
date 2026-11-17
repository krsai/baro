import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/workspace-live-test.html',jsx='frontend/workspace-live-test.jsx',port=43488;
const streams=new Set(),values=new Map([[1,0],[2,0],[3,0]]);let unstableConnections=0;
const api=createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');const url=new URL(req.url,'http://local'),orgId=Number(url.searchParams.get('orgId'));
 if(url.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: ready\ndata: {}\n\n');if(orgId===3){unstableConnections++;res.end();return;}const entry={orgId,res};streams.add(entry);req.on('close',()=>streams.delete(entry));return;}
 if(url.pathname==='/save'){values.set(orgId,values.get(orgId)+1);for(const stream of streams)if(stream.orgId===orgId)stream.res.write('data: '+JSON.stringify({orgId,topics:['orders']})+'\n\n');}
 res.end(JSON.stringify({revision:values.get(orgId)}));
});await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));const apiPort=api.address().port;
for(const path of [html,jsx])assert.ok(!existsSync(path));
writeFileSync(html,'<meta charset="utf-8"><div id="root"></div><script type="module" src="/workspace-live-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useNavigate}from'react-router-dom';import useLive from'/src/hooks/useWorkspaceLiveUpdates';import useRefresh from'/src/hooks/useWorkspaceRefreshOnEvent';const orgId=Number(new URLSearchParams(location.search).get('org'));function Demo(){const[value,setValue]=React.useState(-1),[draft,setDraft]=React.useState('');const navigate=useNavigate();useLive(orgId);const refresh=React.useCallback(async()=>{window.reads=(window.reads||0)+1;const result=await fetch('http://127.0.0.1:${apiPort}/rows?orgId='+orgId).then(r=>r.json());setValue(result.revision);},[]);React.useEffect(()=>{refresh();},[]);useRefresh({orgId,topics:['orders'],isBlocked:!!draft,onRefresh:refresh});return <><div data-revision>{value}</div><input aria-label='Draft' value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setDraft('')}>Clear draft</button><button onClick={()=>navigate('/other')}>Other tab</button><button onClick={()=>navigate('/rows')}>Back</button></>;}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/rows']}><Demo/></MemoryRouter>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/workspace-live-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const pages=[];
 for(const org of [1,1,2]){
  const context=await browser.newContext(),page=await context.newPage();pages.push(page);page.on('pageerror',e=>{throw e;});
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={markTabChanged:()=>{window.marked=true;},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const clearGetResponseCache=()=>{};export const fetchWorkspaceEvents=(orgId,signal)=>fetch('http://127.0.0.1:${apiPort}/events?orgId='+orgId,{signal});`}));
  await page.goto(`http://127.0.0.1:${port}/workspace-live-test.html?org=${org}`);await page.waitForFunction(()=>document.querySelector('[data-revision]')?.textContent==='0');
 }
 const [a,b,c]=pages;await b.waitForTimeout(400);const save=async()=>{await a.evaluate(apiPort=>fetch('http://127.0.0.1:'+apiPort+'/save?orgId=1'),apiPort);};
 await save();await b.waitForFunction(()=>document.querySelector('[data-revision]').textContent==='1');assert.equal(await c.locator('[data-revision]').textContent(),'0');
 await b.getByLabel('Draft').fill('Keep my unsaved work');const before=await b.evaluate(()=>window.reads);await save();await b.waitForTimeout(400);assert.equal(await b.evaluate(()=>window.reads),before);assert.equal(await b.getByLabel('Draft').inputValue(),'Keep my unsaved work');
 await b.getByRole('button',{name:'Clear draft'}).click();await b.waitForFunction(()=>document.querySelector('[data-revision]').textContent==='2');
 await b.getByRole('button',{name:'Other tab'}).click();const inactive=await b.evaluate(()=>window.reads);await save();await b.waitForTimeout(400);assert.equal(await b.evaluate(()=>window.reads),inactive);await b.getByRole('button',{name:'Back',exact:true}).click();await b.waitForFunction(()=>document.querySelector('[data-revision]').textContent==='3');
 for(const stream of [...streams])if(stream.orgId===1){streams.delete(stream);stream.res.end();}await save();await b.waitForFunction(()=>document.querySelector('[data-revision]').textContent==='4');
 await b.clock.install();const idle=await b.evaluate(()=>window.reads);await b.clock.runFor(120000);assert.equal(await b.evaluate(()=>window.reads),idle,'idle time does not poll business data');
 const unstable=await browser.newPage();await unstable.clock.install();
 await unstable.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
 await unstable.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const clearGetResponseCache=()=>{};export const fetchWorkspaceEvents=(orgId,signal)=>fetch('http://127.0.0.1:${apiPort}/events?orgId='+orgId,{signal});`}));
 await unstable.goto(`http://127.0.0.1:${port}/workspace-live-test.html?org=3`);await unstable.waitForFunction(()=>document.querySelector('[data-revision]')?.textContent==='0');
 for(let i=0;i<180;i++){await unstable.clock.runFor(1000);await unstable.waitForTimeout(15);}
 assert.equal(unstableConnections,7,'ready then immediate disconnect must stop after six retries');const stopped=await unstable.evaluate(()=>window.reads);await unstable.clock.runFor(120000);assert.equal(await unstable.evaluate(()=>window.reads),stopped,'broken live transport must not become endless business polling');await unstable.close();
 console.log('PASS live refresh: independent browser sessions, company isolation, save-driven refresh, protected draft, inactive tab queue, reconnect catch-up and zero idle polling.');
}finally{await browser?.close();vite.kill();for(const stream of streams)stream.res.end();api.closeAllConnections();await new Promise(resolve=>api.close(resolve));for(const path of [html,jsx])if(existsSync(path))unlinkSync(path);}
