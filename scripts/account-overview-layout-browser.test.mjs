import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {accountOverviewText} from '../frontend/src/constants/accountOverview.js';
import {balanceChartScale} from '../frontend/src/utils/balanceChartScale.mjs';
assert.deepEqual(balanceChartScale([16465275]).ticks,[0,5000000,10000000,15000000,20000000]);
for(const values of [[0],[-170,45],[.05,.4],[-20000000]]){
 const scale=balanceChartScale(values);assert.ok(scale.low<=Math.min(...values));assert.ok(scale.high>=Math.max(...values));assert.ok(scale.ticks.every(Number.isInteger));
}
const fixture=path.resolve('frontend/account-overview-layout-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Report from'/src/pages/App/AccountOverview.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Report)));</script></body></html>`);
const port=43289,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/account-overview-layout-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1920,1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},acceptDownloads:true}),errors=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));const t=accountOverviewText[lang];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const auth={activeOrgId:1};export const useAuth=()=>auth;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},showNotification:message=>{window.toast=message;}});'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const buildQueryString=q=>'?'+new URLSearchParams(q);export const requestJSON=async url=>{window.calls=(window.calls||0)+1;if(url.includes('exchange-rates'))return {date:'2026-11-05',rates:{VND:1},stale:false};const account={id:'a',name:'Main account',currencyCode:'VND',yesterdayIn:'16465275',yesterdayOut:'0',beginningBalance:'0',totalIn:'16465275',totalOut:'0',change:'16465275',currentBalance:'16465275'};return {asOf:'2026-11-05',yesterday:'2026-11-04',monthStart:'2026-11-01',historyStart:'2026-10-07',accounts:Array.from({length:6},(_,i)=>({...account,id:i?'a'+i:'a',name:i?'Bank '+i:account.name})),yesterdayAccounts:[{...account,beginningBalance:'123',totalIn:'40',totalOut:'10',change:'30',currentBalance:'153'}],yesterdayTotals:[],currencyTotals:[account],transactions:[{id:'tx',accountName:account.name,counterparty:'BARO',purpose:'Detail only',direction:'IN',currencyCode:'VND',amount:'16465275',settlementLines:[]}],cashflowGroups:[...Array.from({length:24},(_,i)=>({itemKey:'BASE:extra'+i,code:'X'+i,direction:i%2?'OUT':'IN',currencyCode:'VND',industries:[{id:100+i,nameEn:'Industry '+i,partnerRole:{id:100+i,nameEn:'Category '+i}}],entries:[{id:'extra'+i,direction:i%2?'OUT':'IN',accountId:'a',amount:'100',currencyCode:'VND'}]})),{itemKey:'BASE:1',code:'CUT',direction:'IN',currencyCode:'VND',industries:[{id:2,nameEn:'Cutting',partnerRole:{id:1,nameEn:'Outsourcing'}}],entries:[{id:'cash-1',direction:'IN',accountId:'a',amount:'16465275',accountName:account.name,currencyCode:'VND',date:'2026-11-04',code:'CUT',nameKo:'재단',nameEn:'Cutting cost',nameVi:'Chi phí cắt',purpose:'Original ledger remark'}]}],outstandingTotals:[],receivables:[],payables:[],history:[{date:'2026-11-04',accounts:[{accountId:'a',balance:'16465275'}]},{date:'2026-11-05',accounts:[{accountId:'a',balance:'16465275'}]}]};};`}));
  await page.goto(`http://127.0.0.1:${port}/account-overview-layout-acceptance.html`);
  await page.getByTestId('all-account-balance').waitFor();
  assert.equal(await page.locator('#overview-currency, #overview-account, [data-search-filters]').count(),0);
  const periodBox=await page.locator('#overview-period').boundingBox(),captureBox=await page.getByRole('button',{name:t.capture,exact:true}).boundingBox();assert.ok(periodBox.x+periodBox.width<=captureBox.x);assert.ok(Math.abs(periodBox.y-captureBox.y)<10);

  for(const months of [3,6,12,1]){const before=await page.evaluate(()=>window.calls);await page.locator('#overview-period').click();await page.getByRole('option',{name:months+' '+t.monthUnit,exact:true}).click();await page.waitForFunction(before=>window.calls>before,before);await page.waitForFunction(()=>document.querySelector('[aria-busy]')?.getAttribute('aria-busy')==='false');assert.ok((await page.locator('#overview-period').textContent()).includes(String(months)));}
  assert.equal(await page.getByRole('button',{name:t.reload,exact:true}).count(),0);
  assert.equal(await page.getByText('Detail only',{exact:true}).count(),0);
  const balancePanel=page.getByTestId('balance-chart-panel'),statusPanel=page.getByTestId('account-status-panel');
  if(width>=1440){const left=await balancePanel.boundingBox(),right=await statusPanel.boundingBox();assert.ok(Math.abs(left.y-right.y)<1);assert.ok(Math.abs(left.height-right.height)<2);const plot=await balancePanel.locator('svg').boundingBox();assert.ok(plot.height>350,'chart fills the table height');assert.ok(Math.abs(plot.y+plot.height-(left.y+left.height-17))<3);const headers=await Promise.all([balancePanel.locator('[data-section-header]').boundingBox(),statusPanel.locator('[data-section-header]').boundingBox()]);assert.ok(Math.abs(headers[0].height-headers[1].height)<1);}
  const rowHeights=await statusPanel.locator('tr').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));assert.ok(Math.max(...rowHeights)-Math.min(...rowHeights)<2,'account and AR/AP rows have uniform height '+JSON.stringify(rowHeights));assert.equal(await statusPanel.getByRole('link',{name:'Frankfurter'}).count(),0);
  await statusPanel.getByRole('button',{name:t.details,exact:true}).click();const yesterdayDialog=page.getByRole('dialog',{name:t.balances,exact:true});await yesterdayDialog.waitFor();await yesterdayDialog.getByText('2026-11-04',{exact:true}).waitFor();const amounts=await yesterdayDialog.locator('tbody tr').first().locator('td').allTextContents();assert.match(amounts[2],/123/);assert.match(amounts[5],/30/);assert.match(amounts[6],/153/);await yesterdayDialog.getByRole('button',{name:t.close,exact:true}).click();await yesterdayDialog.waitFor({state:'hidden'});
  const charts=page.getByTestId('cashflow-charts-panel'),items=page.getByTestId('cashflow-items-panel');
  await charts.getByTestId('cashflow-net').getByText(t.cashflowNet.replace('{period}','2026-10-07 ~ 2026-11-05'),{exact:true}).waitFor();
  assert.match(await charts.getByTestId('cashflow-net').textContent(),/\+₫16,465,275/);
  const netBox=await charts.getByTestId('cashflow-net').boundingBox(),donutBoxes=await charts.locator('[data-cashflow-chart] svg').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {bottom:box.bottom};}));
  assert.ok(donutBoxes.every(box=>box.bottom<=netBox.y),'net change is below both charts');
  const category=items.getByRole('button',{name:'Outsourcing',exact:true});
  await category.waitFor();
  if(width>=1440){const panels=await Promise.all([balancePanel,statusPanel,charts,items].map(panel=>panel.boundingBox()));assert.ok(Math.max(...panels.map(p=>p.height))-Math.min(...panels.map(p=>p.height))<2,'all four cards have matching heights');}
  const beforeHeight=(await items.boundingBox()).height;
  const callsBefore=await page.evaluate(()=>window.calls);
  await category.focus();
  assert.ok(Math.abs((await items.boundingBox()).height-beforeHeight)<2,'hover/focus must not resize the list');
  if(width===1920){
   const scroller=items.locator('[data-cashflow-list="IN"]').locator('..');
   await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const before=await scroller.evaluate(el=>({top:el.scrollTop,height:el.clientHeight}));
   assert.ok(before.top>0,'fixture must overflow');
   const bounds=await scroller.boundingBox();
   await page.mouse.move(bounds.x+bounds.width/4,bounds.y+30);
   await page.mouse.wheel(0,-60);
   await page.waitForTimeout(150);
   const afterWheel=await scroller.evaluate(el=>el.scrollTop);
   await page.mouse.move(bounds.x+bounds.width*3/4,bounds.y+30);
   await page.waitForTimeout(150);
   assert.equal(await scroller.evaluate(el=>el.scrollTop),afterWheel,'crossing directions must preserve wheel position');
   assert.equal(await scroller.evaluate(el=>el.clientHeight),before.height);
   await page.mouse.move(0,0);
   await category.evaluate(el=>el.blur());
   await category.focus();
  }
  assert.equal(await page.evaluate(()=>window.calls),callsBefore,'hover and wheel must not fetch data');
  await charts.getByTestId('cashflow-tooltip').getByText(/Cutting/).waitFor();
  if(lang==='en'&&width===1440){
   const preview=charts.getByTestId('cashflow-tooltip').getByLabel(t.byItem,{exact:true});
   await preview.evaluate(el=>{el.firstElementChild.style.minHeight='300px';});
   await preview.hover();
   await page.mouse.wheel(0,80);
   await page.waitForFunction(()=>document.querySelector('[data-testid="cashflow-tooltip"] [tabindex="0"]')?.scrollTop>0);
  }
  await category.click();
  const detail=page.getByRole('dialog');
  await detail.getByText('Cutting',{exact:true}).waitFor();
  await detail.getByText('CUT',{exact:true}).waitFor();
  await detail.getByText({ko:'재단',en:'Cutting cost',vi:'Chi phí cắt'}[lang],{exact:true}).waitFor();
  assert.equal(await detail.getByText('Original ledger remark',{exact:true}).count(),0);
  await detail.getByRole('button',{name:t.close,exact:true}).click();
  await detail.waitFor({state:'hidden'});
  if(lang==='ko'&&width===1440){const download=page.waitForEvent('download');await page.getByRole('button',{name:t.capture,exact:true}).click();const saved=await download;assert.equal(saved.suggestedFilename(),'account-overview-2026-11-05.png');assert.equal(await saved.failure(),null);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile overview, cashflow card height, category breakdown, details and image download.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
