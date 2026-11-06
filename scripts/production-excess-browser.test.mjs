import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {productionExcessText} from '../frontend/src/constants/productionExcess.js';
const dashboard=readFileSync('frontend/src/pages/App/WorkspaceDashboard.jsx','utf8');assert.ok(dashboard.includes("activeProfile?.orgType==='MANUFACTURER'&&canAccessPath('/work-history',authState)?[{id:'production-excess'"));
const fixture=path.resolve('frontend/production-excess-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Card from '/src/components/ProductionExcessCard.jsx';const lang=new URLSearchParams(location.search).get('lang');createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Card,{orgId:7,languageCode:lang,canOpenExpense:true,onNavigate:path=>{window.opened=path;}}))));</script></html>`);
const port=43302,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/production-excess-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=productionExcessText[lang];page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const actions={markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  const group={workOrderId:1,orderNumber:'L16-1',styleId:10,styleCode:'AM01622',styleName:'Shirt',styleProcessId:100,processCode:'TS05',processName:'Sew collar',target:440,recorded:790,excess:350,excessPercent:350/440*100,lastDate:'2026-11-03',recordCount:3};
  let resolved=false,failed=false;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
  await page.route('**/work-logs/production-excess**',route=>{
   if(failed)return route.fulfill({headers,status:503,json:{error:'TEMPORARY_FAILURE'}});
   if(new URL(route.request().url()).pathname.endsWith('/production-excess'))return route.fulfill({headers,json:{rows:resolved?[]:[group],total:resolved?0:1,unverified:0,page:0,pageSize:5}});
   return route.fulfill({headers,json:{group,records:[{recordId:3,workLogId:3,workDate:'2026-11-03',name:'Vendor A',kind:'OUTSOURCING',factoryName:'HANOI',quantity:50},{recordId:2,workLogId:2,workDate:'2026-11-02',name:'Worker B',kind:'EMPLOYEE',factoryName:'HANOI',quantity:300},{recordId:1,workLogId:1,workDate:'2026-05-31',name:'Worker A',kind:'EMPLOYEE',factoryName:'HANOI',quantity:440}],total:3,page:0,pageSize:20}});
  });
  console.log('Checking production excess',lang,width);await page.goto(`http://127.0.0.1:${port}/production-excess-acceptance.html?lang=${lang}`);const card=page.getByTestId('production-excess-card');await card.getByText('L16-1',{exact:true}).waitFor();assert.equal(await card.getByText('+79.55%',{exact:true}).count(),1);
  assert.ok(await card.locator('tbody tr').first().locator('td').nth(5).evaluate(element=>getComputedStyle(element).textAlign==='right'));
  await card.getByRole('button',{name:t.review,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText('2026-05-31',{exact:true}).waitFor();assert.equal(await dialog.getByText('Vendor A',{exact:true}).count(),1);
  await dialog.getByRole('row').filter({hasText:'Worker B'}).getByRole('button',{name:t.open,exact:true}).click();await page.waitForFunction(()=>window.opened?.startsWith('/work-history/2?'));await dialog.waitFor({state:'hidden'});
  await card.getByRole('button',{name:t.review,exact:true}).click();await dialog.getByText('Vendor A',{exact:true}).waitFor();await dialog.getByRole('row').filter({hasText:'Vendor A'}).getByRole('button',{name:t.open,exact:true}).click();await page.waitForFunction(()=>window.opened==='/outsourcing-record/edit/legacy/3');
  resolved=true;const refresh=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:7,topics:['payroll-sources'],source:'test'}})));await refresh();await card.getByText(t.empty,{exact:true}).waitFor();
  failed=true;await refresh();await card.getByText(t.failed,{exact:true}).waitFor();assert.equal(await card.getByText(t.empty,{exact:true}).count(),0);failed=false;await card.getByRole('button',{name:t.retry,exact:true}).click();await card.getByText(t.empty,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Production excess UI passed ko/en/vi desktop/mobile: visible cumulative excess, employee/vendor source links, correction refresh, error/retry and viewport fit.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
