import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!executablePath) throw Error('Chrome is required');
const port = 43183;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i=0;i<80;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/prior-completion-acceptance.html`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath, headless: true });
  for (const lang of ['ko','en','vi']) {
    const page = await browser.newPage();
    let payload;
    await page.route('**/prior-completion-reasons*', route => route.fulfill({ json: [{ id: 17, nameKo: '관리 시작 전 작업 완료', nameEn: 'Completed before record keeping began', nameVi: 'Hoàn thành trước khi bắt đầu ghi nhận' }], headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.route('**/prior-production-completions*', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      payload = route.request().postDataJSON();
      return route.fulfill({ json: [], headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/prior-completion-acceptance.html?lang=${lang}`);
    await page.getByRole('dialog').waitFor();
    await page.getByRole('checkbox').first().check();
    assert.equal(await page.getByRole('checkbox', { name: 'AA2095', exact: true }).isChecked(), false);
    await page.locator('input[type="month"]').fill('2026-03');
    await page.getByRole('checkbox').last().check();
    await page.getByRole('button', { name: lang === 'ko' ? '등록' : lang === 'vi' ? 'Ghi nhận' : 'Register', exact: true }).click();
    await page.waitForFunction(()=>document.documentElement.dataset.saved === 'true');
    assert.deepEqual(payload.entries.map(entry=>entry.quantity), [440,200,105]);
    assert.ok(payload.entries.every(entry=>entry.reasonId===17 && entry.workOrderId===1 && entry.completedPeriod==='2026-03' && entry.acknowledgeSeparateRecords && !('createdByEmployeeId' in entry)));
    assert.equal(new Set(payload.entries.map(entry=>entry.clientKey)).size,3);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Prior completion browser acceptance passed (ko/en/vi, batch selection, month precision, FK payload).');
} finally { if(browser) await browser.close(); vite.kill(); }
