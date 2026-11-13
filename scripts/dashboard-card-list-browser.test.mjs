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
  await page.route('**/approval-reviews?*',r=>{const query=Object.fromEntries(new URL(r.request().url()).searchParams);queries.push(query);const rows=['REQUESTED','IN_REVIEW','UNKNOWN','APPROVED','REJECTED'].map((status,i)=>({id:i+1,status,kind:'EXPENSE_REQUEST',menu:'EXPENSE',operation:'CREATE',managementNumber:'EXP-00'+(i+1),drafter:'Author',requestDate:'2026-11-11'})).filter(row=>query.status==='UNAPPROVED'?['REQUESTED','IN_REVIEW','UNKNOWN'].includes(row.status):row.status===query.status);return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{rows,total:rows.length}});});
  await page.goto('http://127.0.0.1:'+port+'/dashboard-card-list-test.html?lang='+lang);await page.getByText('Author',{exact:false}).first().waitFor();
  assert.equal(await page.locator('table,input[type="date"]').count(),0);assert.equal(queries[0].start,undefined);assert.equal(queries[0].end,undefined);
  assert.equal(await page.getByText('2026-11',{exact:true}).count(),0);
  const filter=page.locator('#approval-overview-status');assert.ok((await filter.boundingBox()).width<=162);const title=await page.getByText(t.overview,{exact:true}).boundingBox(),field=await filter.boundingBox();assert.ok(Math.abs(title.y+title.height/2-field.y-field.height/2)<2,'filter shares the title row');
  assert.equal(queries[0].status,'UNAPPROVED');assert.equal(await page.locator('[data-dashboard-card]').count(),3);
  assert.deepEqual(await page.locator('[data-dashboard-card-title] .MuiChip-label').allTextContents(),Array(3).fill(t.overviewStatuses.UNAPPROVED),'requested, in-review and unknown share one visible status');
  await filter.click();assert.equal(await page.getByRole('option').count(),3);assert.deepEqual(await page.getByRole('option').allTextContents(),[t.overviewStatuses.UNAPPROVED,t.overviewStatuses.APPROVED,t.overviewStatuses.REJECTED]);
  await Promise.all([page.waitForResponse(r=>r.url().includes('status=APPROVED')),page.getByRole('option',{name:t.overviewStatuses.APPROVED,exact:true}).click()]);
  assert.equal(queries.at(-1).start,undefined);assert.equal(queries.at(-1).end,undefined);assert.equal(queries.at(-1).status,'APPROVED');
  assert.equal(await page.locator('[data-dashboard-card]').count(),1);const card=await page.locator('[data-dashboard-card]').boundingBox(),action=await page.locator('[data-dashboard-card-actions]').boundingBox();assert.ok(card.height>=80&&card.height<128);assert.ok(Math.abs(action.y+action.height/2-card.y-card.height/2)<1);assert.ok(action.x>card.x+card.width/2);
  assert.deepEqual(await page.locator('[data-dashboard-card-title] .MuiChip-label').allTextContents(),[t.overviewStatuses.APPROVED]);
  await filter.click();await Promise.all([page.waitForResponse(r=>r.url().includes('status=REJECTED')),page.getByRole('option',{name:t.overviewStatuses.REJECTED,exact:true}).click()]);
  await page.getByText('Author',{exact:false}).first().waitFor();assert.equal(queries.at(-1).status,'REJECTED');assert.deepEqual(await page.locator('[data-dashboard-card-title] .MuiChip-label').allTextContents(),[t.overviewStatuses.REJECTED]);
  await filter.click();await Promise.all([page.waitForResponse(r=>r.url().includes('status=UNAPPROVED')),page.getByRole('option',{name:t.overviewStatuses.UNAPPROVED,exact:true}).click()]);await page.waitForFunction(()=>document.querySelectorAll('[data-dashboard-card]').length===3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS dashboard cards: ko/en/vi desktop/mobile, shared card list, no date inputs/table, status-only filtering across all months, compact filters and shared card size.');
}finally{await browser?.close();server.kill();for(const path of [file,jsx])if(existsSync(path))unlinkSync(path);}
