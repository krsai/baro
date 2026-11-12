import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {approvalWorkflowText} from '../frontend/src/constants/approvalWorkflow.js';
const file='frontend/dashboard-card-list-test.html',jsx='frontend/dashboard-card-list-test.jsx',port=43481;
assert.ok(!existsSync(file));
writeFileSync(file,"<html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><div id=\"root\"></div><script type=\"module\" src=\"/dashboard-card-list-test.jsx\"></script></html>");
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Card from'/src/components/ApprovalDashboardCard';createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><div style={{height:600}}><Card orgId={7} languageCode={new URLSearchParams(location.search).get('lang')}/></div></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/dashboard-card-list-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:800}}),queries=[],errors=[],t=approvalWorkflowText[lang];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.clock.install({time:new Date('2026-11-12T12:00:00+07:00')});
  await page.route('**/approval-reviews?*',r=>{queries.push(Object.fromEntries(new URL(r.request().url()).searchParams));return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{rows:[{id:1,kind:'EXPENSE_REQUEST',menu:'EXPENSE',operation:'CREATE',managementNumber:'EXP-001',drafter:'Author',requestDate:'2026-11-11'}],total:1}});});
  await page.goto('http://127.0.0.1:'+port+'/dashboard-card-list-test.html?lang='+lang);await page.getByText('Author',{exact:false}).waitFor();
  assert.equal(await page.locator('table,input[type="date"]').count(),0);assert.equal(queries[0].start,'2026-11-01');assert.equal(queries[0].end,'2026-11-12');
  const next=page.getByRole('button',{name:t.next,exact:true}).first(),previous=page.getByRole('button',{name:t.previous,exact:true}).first();assert.equal(await next.isDisabled(),true);
  await Promise.all([page.waitForResponse(r=>r.url().includes('start=2026-10-01')),previous.click()]);await page.getByText('2026-10',{exact:true}).waitFor();assert.equal(queries.at(-1).end,'2026-10-31');
  await next.click();await page.getByText('2026-11',{exact:true}).waitFor();assert.equal(await next.isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS dashboard cards: ko/en/vi desktop/mobile, shared card list, no date inputs/table, previous/next month with current-day cap.');
}finally{await browser?.close();server.kill();for(const path of [file,jsx])if(existsSync(path))unlinkSync(path);}
