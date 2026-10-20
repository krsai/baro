import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture = path.resolve('frontend/business-partner-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Partners from '/src/pages/App/BusinessPartners.jsx';import Costs from '/src/pages/App/PartnerTransactionCosts.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement('div',{id:'partners'},React.createElement(Partners,{type:'PROCESS_OUTSOURCING'})),React.createElement('div',{id:'costs'},React.createElement(Costs))));</script></body></html>`);
const port = 43188, vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/business-partner-acceptance.html`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage(); const errors = []; let deletes = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-13T12:00:00+07:00') });
  await page.route('**/src/context/AuthContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN",accessProfile:{systemRole:"USER"}});' }));
  await page.route('**/src/context/LanguageContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useLanguage=()=>({languageCode:"ko"});' }));
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  let partners = [{ id: 11, name: 'Used Partner', type: 'PROCESS_OUTSOURCING', isActive: true, hasUsageHistory: true }, { id: 12, name: 'Unused Partner', type: 'PROCESS_OUTSOURCING', isActive: true, hasUsageHistory: false }, { id: 13, name: 'Concurrent Partner', type: 'PROCESS_OUTSOURCING', isActive: true, hasUsageHistory: false }];
  await page.route('**/business-partners**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    if (new URL(route.request().url()).pathname.endsWith('/history')) return route.fulfill({ headers, json: { records: [{ id: 1, workDate: '2026-10-10', styleCode: 'TEST', processName: 'Buttonhole', quantity: 10, unitPrice: 100, amount: 1000 }], costs: [] } });
    if (route.request().method() === 'PUT') { partners[0] = { ...partners[0], ...route.request().postDataJSON() }; return route.fulfill({ headers, json: partners[0] }); }
    if (route.request().method() === 'DELETE') {
      if (new URL(route.request().url()).pathname.endsWith('/13')) { partners.find(row => row.id === 13).hasUsageHistory = true; return route.fulfill({ headers, status: 409, json: { error: 'PARTNER_HAS_TRANSACTION_HISTORY' } }); }
      deletes++; partners = partners.filter(row => row.id !== 12); return route.fulfill({ headers, json: { ok: true } });
    }
    return route.fulfill({ headers, json: partners });
  });
  await page.route('**/outsourcing-service-types?*', route => route.fulfill({ headers, json: [] }));
  await page.route('**/expense-types', route => route.fulfill({ headers, json: [{ id: 1, nameKo: '제작 외주', entryMode: 'PROCESS', isActive: true }] }));
  await page.route('**/outsourcing-requests?*', route => route.fulfill({ headers, json: [{ id: 1, partner: { id: 11, name: partners[0].name }, transactionDate: '2026-10-10', description: 'Existing cost', amount: '100', currency: 'VND' }] }));
  await page.route('**/entities/*/bank-accounts?*',route=>route.fulfill({headers,json:{accounts:[],currencies:[{id:1,code:'VND'}]}}));
  await page.goto(`http://127.0.0.1:${port}/business-partner-acceptance.html`);
  const used = page.locator('#partners tbody tr').filter({ has: page.getByText('Used Partner', { exact: true }) });
  const unused = page.locator('#partners tbody tr').filter({ hasText: 'Unused Partner' });
  await used.waitFor();
  assert.deepEqual(await page.locator('#partners thead th').allTextContents(), ['거래처 구분', '세부 업종', '업체명', '담당자', '연락처', '상태', '내역보기', '수정', '삭제']);
  await used.getByText('Used Partner', { exact: true }).click();
  assert.equal(await page.getByText('외주 작업 내역', { exact: true }).count(), 0);
  await used.getByRole('button', { name: '내역보기', exact: true }).click();
  await page.getByText('Buttonhole', { exact: true }).waitFor();
  assert.equal(await page.getByText('거래 비용', { exact: true }).count(), 0);
  assert.equal(await page.getByText('비용 신청 내역', { exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await used.getByRole('button', { name: '삭제', exact: true }).isDisabled(), true);
  assert.equal(await used.getByRole('button', { name: '수정', exact: true }).isEnabled(), true);
  await unused.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
  await unused.waitFor({ state: 'detached' }); assert.equal(deletes, 1);
  const concurrent = page.locator('#partners tbody tr').filter({ hasText: 'Concurrent Partner' });
  await concurrent.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '사용 이력이 있는 거래처는 삭제할 수 없습니다.' }).waitFor();
  assert.equal(await concurrent.getByRole('button', { name: '삭제', exact: true }).isDisabled(), true);
  await used.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByRole('dialog').getByLabel('업체명', { exact: false }).fill('Renamed Partner');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('#costs').getByRole('button', { name: 'Renamed Partner', exact: true }).waitFor();
  assert.equal(partners[0].id, 11); assert.deepEqual(errors, []);
  console.log('Partner browser checks passed: used deletion disabled, unused deletion confirmed, used partner editable, existing costs refresh with current FK name.');
} finally { await browser?.close(); vite.kill(); unlinkSync(fixture); }
