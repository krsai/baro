import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath, 'Chrome required');
const fixture = path.resolve('frontend/date-range-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
import Range from '/src/components/DateRangeSelector.jsx'; import Costs from '/src/pages/App/PartnerTransactionCosts.jsx';
function App(){const [start,setStart]=React.useState('2026-10-10'),[end,setEnd]=React.useState('2026-10-11');
return React.createElement(MemoryRouter,null,location.search==='?costs' ? React.createElement(Costs) : React.createElement(React.Fragment,null,
React.createElement(Range,{maxDate:location.search==='?limit'?'2026-08-31':undefined,monthOnly:false,startValue:start,endValue:end,onStartChange:v=>setStart(v.format('YYYY-MM-DD')),onEndChange:v=>setEnd(v.format('YYYY-MM-DD'))}),React.createElement('output',null,start+' / '+end)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port = 43186;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/date-range-acceptance.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth=()=>({activeOrgId:1});' }));
  await page.route('**/src/context/LanguageContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useLanguage=()=>({languageCode:"ko"});' }));
  await page.goto(`http://127.0.0.1:${port}/date-range-acceptance.html`);
  await page.getByRole('button', { name: '시작일을 이전 달 1일로', exact: true }).click();
  assert.equal(await page.locator('output').textContent(), '2026-09-01 / 2026-10-11');
  await page.getByRole('button', { name: '종료일을 다음 달 말일로', exact: true }).click();
  assert.equal(await page.locator('output').textContent(), '2026-09-01 / 2026-11-30');
  await page.getByRole('button', { name: '종료일을 다음 달 말일로', exact: true }).click();
  await page.getByRole('button', { name: '종료일을 다음 달 말일로', exact: true }).click();
  assert.equal(await page.locator('output').textContent(), '2026-09-01 / 2027-01-31');
  for(const width of [390,740]){await page.setViewportSize({width,height:600});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await page.goto('http://127.0.0.1:'+port+'/date-range-acceptance.html?limit');
  await page.waitForFunction(()=>document.querySelector('output')?.textContent==='2026-08-01 / 2026-08-31');
  assert.equal(await page.getByRole('button',{name:'종료일을 다음 달 말일로',exact:true}).isDisabled(),true);
  await page.setViewportSize({width:1280,height:800});
  await page.clock.install({ time: new Date('2026-10-13T12:00:00+07:00') });
  const headers = { 'Access-Control-Allow-Origin': '*' };
  await page.route('**/expense-requests?*',route=>route.fulfill({headers,json:[]}));
  await page.route('**/outsourcing-requests?*', route => route.fulfill({ headers, json: ['2026-09-01', '2026-10-01', '2026-10-31', '2026-11-30', '2026-12-01'].map((date, id) => ({ id, transactionDate: date, partner: { name: `Partner${id}` }, expenseRequest:{remark:`Cost${id}`}, description: `Legacy title${id}`, currency: 'VND', amount: '100' })) }));
  await page.goto(`http://127.0.0.1:${port}/date-range-acceptance.html?costs`);
  await page.getByText('Cost1', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByRole('button', { name: '시작일을 이전 달 1일로', exact: true }).click();
  await page.getByText('Cost0', { exact: true }).waitFor();
  await page.getByRole('button', { name: '종료일을 다음 달 말일로', exact: true }).click();
  await page.getByText('Cost3', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 4);
  await page.getByPlaceholder(/신청번호/).fill('Partner3');
  assert.equal(await page.locator('tbody tr').count(), 1);
  assert.deepEqual(errors, []);
  console.log('Date range browser checks passed: independent month expansion, year rollover, inclusive cost date filtering and combined search.');
} finally {
  await browser?.close();
  vite.kill();
  unlinkSync(fixture);
}
