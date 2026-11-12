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
  assert.equal(await page.locator('table,input[type="date"]').count(),0);assert.equal(queries[0].start,undefined);assert.equal(queries[0].end,undefined);
  assert.equal(await page.getByText('2026-11',{exact:true}).count(),0);
  const filter=page.locator('#approval-overview-status');assert.ok((await filter.boundingBox()).width<=162);
  await filter.click();await Promise.all([page.waitForResponse(r=>r.url().includes('status=APPROVED')),page.getByRole('option',{name:t.statuses.APPROVED,exact:true}).click()]);
  assert.equal(queries.at(-1).start,undefined);assert.equal(queries.at(-1).end,undefined);assert.equal(queries.at(-1).status,'APPROVED');
  assert.equal(await page.locator('[data-dashboard-card]').count(),1);assert.equal(Math.round((await page.locator('[data-dashboard-card]').boundingBox()).height),128);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS dashboard cards: ko/en/vi desktop/mobile, shared card list, no date inputs/table, status-only filtering across all months, compact filters and shared card size.');
}finally{await browser?.close();server.kill();for(const path of [file,jsx])if(existsSync(path))unlinkSync(path);}
