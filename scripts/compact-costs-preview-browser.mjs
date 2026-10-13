import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath, 'Chrome required');
const fixture = path.resolve('frontend/compact-costs-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material/styles';import theme from '/src/theme';import Preview from '/src/pages/App/CompactCostsPreview.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(Preview)));</script></body></html>`);
const port = 43187;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/compact-costs-acceptance.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/context/AppContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useAppActions=()=>({navigateToPath:()=>{}});' }));
  await page.goto(`http://127.0.0.1:${port}/compact-costs-acceptance.html`);
  await page.getByRole('heading', { name: '비용신청 UI 미리보기' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 32);
  await page.screenshot({ path: path.join(os.tmpdir(), 'baro-compact-costs-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: '업체별 요약' }).click();
  assert.equal(await page.locator('tbody tr').count(), 6);
  await page.getByRole('tab', { name: '업종별 요약' }).click();
  assert.equal(await page.locator('tbody tr').count(), 4);
  await page.getByRole('tab', { name: '상세 내역' }).click();
  await page.getByRole('textbox', { name: '비용 검색' }).fill('DEX');
  assert.equal(await page.locator('tbody tr').count(), 5);
  await page.getByRole('button', { name: 'DEX LOGIS', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '↺ 초기화' }).click();
  assert.equal(await page.locator('tbody tr').count(), 32);
  await page.getByRole('checkbox', { name: '조회 결과 전체 선택' }).check();
  await page.getByText('선택 32건', { exact: false }).waitFor();
  await page.getByRole('button', { name: '조건 접기 ▴' }).click();
  assert.equal(await page.locator('select').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(os.tmpdir(), 'baro-compact-costs-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(`Compact preview checks passed. Screenshots: ${path.join(os.tmpdir(), 'baro-compact-costs-desktop.png')} and ${path.join(os.tmpdir(), 'baro-compact-costs-mobile.png')}`);
} finally {
  await browser?.close(); vite.kill(); unlinkSync(fixture);
}
