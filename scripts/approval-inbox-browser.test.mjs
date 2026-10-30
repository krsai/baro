import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalWorkflowText} from '../frontend/src/constants/approvalWorkflow.js';
const fixture=path.resolve('frontend/approval-inbox-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Inbox from'/src/pages/App/ApprovalInbox.jsx';import Card,{ApprovalMenuBadge}from'/src/components/ApprovalDashboardCard.jsx';
function App(){const[orgId,setOrg]=React.useState(7);window.setOrg=setOrg;window.currentOrg=orgId;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(ApprovalMenuBadge,{orgId}),React.createElement(Card,{orgId,languageCode:new URLSearchParams(location.search).get('lang'),onNavigate:p=>window.destination=p}),React.createElement(Inbox));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43265,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-inbox-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],t=approvalWorkflowText[lang];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:window.currentOrg,activeProfile:{orgRole:'ACCOUNTANT'}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAppActions=()=>({navigateToPath:p=>window.destination=p});"}));
  await page.route('**/expense-approval-inbox?*',async r=>{
   const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*'};
   if(url.searchParams.get('orgId')==='8'){await new Promise(resolve=>setTimeout(resolve,250));return r.fulfill({headers,json:[]});}
   const view=url.searchParams.get('view')||'pending',rows=Array.from({length:view==='pending'?6:1},(_,i)=>({id:i+1,kind:'EXPENSE_REQUEST',version:2,managementNumber:`EXP-2026-00000${i+1}`,requestDate:'2026-10-30',payee:'Vendor',drafter:'Author',status:view==='requested'?'REJECTED':view==='inProgress'?'IN_REVIEW':'REQUESTED',totals:[{currency:'USD',amount:'100.25'}],...(view==='completed'?{handledVersion:1,decision:'REJECTED',reason:'Incorrect invoice',handledAt:'2026-10-29T00:00:00Z'}:{})}));return r.fulfill({headers,json:rows});
  });
  await page.goto(`http://127.0.0.1:${port}/approval-inbox-acceptance.html?lang=${lang}`);
  const card=page.getByTestId('approval-dashboard'),main=page.locator('main');await card.getByText('EXP-2026-000001',{exact:true}).waitFor();assert.equal(await card.locator('tbody tr').count(),5);assert.equal(await card.locator('.MuiChip-label').filter({hasText:/^6$/}).count(),1);
  await card.getByRole('button',{name:t.viewAll}).click();assert.equal(await page.evaluate(()=>window.destination),'/approval-inbox');
  await main.getByRole('button',{name:'EXP-2026-000006',exact:true}).click();assert.equal(await page.evaluate(()=>window.destination),'/outsourcing-record/edit/request/6');
  await main.getByRole('tab',{name:t.progressTab,exact:true}).click();await main.locator('[data-approval-status="IN_REVIEW"]').waitFor();
  await main.getByRole('tab',{name:t.completedTab,exact:true}).click();await main.getByText('Incorrect invoice',{exact:true}).waitFor();assert.equal(await main.locator('[data-approval-status="REJECTED"]').count(),1);assert.equal(await main.locator('thead th').count(),9);
  await main.getByRole('textbox').fill('No matching request');await main.getByText(t.empty,{exact:true}).waitFor();await main.getByRole('textbox').fill('invoice');await main.getByText('Incorrect invoice',{exact:true}).waitFor();
  await main.getByRole('textbox').fill('');await main.getByRole('tab',{name:t.requestedTab,exact:true}).click();await main.locator('[data-approval-status="REJECTED"]').waitFor();
  await page.setViewportSize({width:390,height:844});assert.ok(await main.locator('.MuiTableContainer-root').evaluate(el=>el.scrollWidth>el.clientWidth));
  await page.evaluate(()=>window.setOrg(8));assert.equal(await page.getByRole('button',{name:'EXP-2026-000001',exact:true}).count(),0,'changing company clears all old rows immediately');await card.getByText(t.empty,{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: dashboard count/top five, review links, pending/progress/handled/own tabs, rejection reason/search, tenant clearing, ko/en/vi and mobile internal scroll.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
