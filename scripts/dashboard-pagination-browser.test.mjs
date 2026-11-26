import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {approvalWorkflowText} from '../frontend/src/constants/approvalWorkflow.js';

const file='frontend/dashboard-pagination-test.html',jsx='frontend/dashboard-pagination-test.jsx',port=43489;
assert.ok(!existsSync(file));
writeFileSync(file,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-pagination-test.jsx"></script></html>');
writeFileSync(jsx,`import React,{useState} from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Card from'/src/components/DashboardAlertsCard';import Pagination from'/src/components/DashboardPagination';function App(){const [page,setPage]=useState(0);return <ThemeProvider theme={theme}><CssBaseline/><div style={{height:400}}><Card title="Alerts" text={{empty:'Empty'}} languageCode={new URLSearchParams(location.search).get('lang')} items={Array.from({length:8},(_,i)=>({key:i,text:'Item '+i}))} onSelect={()=>{}}><div data-page={page}>Server page {page}</div><Pagination label="Server" previousDisabled={page===0} nextDisabled={page===2} onPrevious={()=>setPage(page-1)} onNext={()=>setPage(page+1)}/></Card></div></ThemeProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/dashboard-pagination-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:800}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await page.goto('http://127.0.0.1:'+port+'/dashboard-pagination-test.html?lang='+lang);
 const footer=page.locator('[data-dashboard-pagination-footer]');await footer.getByRole('combobox').waitFor();assert.equal(await page.locator('[data-list-pagination]').count(),1);
 await footer.getByRole('combobox').click();await page.getByRole('option',{name:'Server',exact:true}).click();await footer.getByRole('button').last().click();await page.waitForFunction(()=>document.querySelector('[data-page="1"]'));await footer.getByRole('button').first().click();await page.waitForFunction(()=>document.querySelector('[data-page="0"]'));
 await footer.getByRole('combobox').click();await page.getByRole('option',{name:'Alerts',exact:true}).click();await footer.getByRole('button').last().click();assert.equal(await page.locator('[data-dashboard-card]').count(),3);assert.ok(await page.getByText('Item 5',{exact:true}).isVisible());const bounds=await footer.boundingBox();assert.ok(bounds.y+bounds.height<=401);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS shared dashboard footer: one previous/next pair, independent server/local pages, ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();for(const path of [file,jsx])if(existsSync(path))unlinkSync(path);}

