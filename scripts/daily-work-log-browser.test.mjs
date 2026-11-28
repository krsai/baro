import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright-core';
const html = 'frontend/daily-work-log-test.html', port = 43532;
assert.ok(!existsSync(html));
writeFileSync(html, `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme,{appThemes} from'/src/theme';import Work from'/src/pages/App/work/WorkDetail';
const legacy=new URLSearchParams(location.search).has('legacy');window.saved=[];
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme:appThemes[new URLSearchParams(location.search).get('theme')||'standard']},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Work,{initialLog:legacy?{id:42,factoryId:1,factoryName:'HANOI',workDate:'2026-11-26',coverageStartDate:'2026-11-01',coverageEndDate:'2026-11-26',records:[]}:null,onSave:async payload=>{window.saved.push(payload);return {};}}))));</script>`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: 'frontend', stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/daily-work-log-test.html`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const language of ['ko', 'en', 'vi']) for (const variant of ['standard', 'compact']) for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: 1000 }, hasTouch: mobile });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(language => localStorage.setItem('baro_language_override', language), language);
    const stub = (pattern, body) => page.route(pattern, route => route.fulfill({ contentType: 'application/javascript', body }));
    await stub('**/src/context/AuthContext.jsx*', 'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});');
    await stub('**/src/context/LanguageContext.jsx*', `export const useLanguage=()=>({languageCode:'${language}'});`);
    await stub('**/src/context/AppContext.jsx*', 'const actions={showNotification:()=>{},removeNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;');
    await stub('**/src/utils/attributeApi.js*', 'export const fetchProcessAttributes=async()=>[];');
    await stub('**/src/pages/App/work/workLogStorage.js*', 'export const loadWorkLogContext=async()=>({factory:{id:1,name:"HANOI"},workers:[{id:1,name:"Worker A",employeeNo:"001"},{id:2,name:"Worker B",employeeNo:"002"}],assignments:[]});');
    await page.route('**/factories?*', route => route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: [{ id: 1, name: 'HANOI', wagePerSecond: 1 }] }));
    await page.goto(`http://127.0.0.1:${port}/daily-work-log-test.html?theme=${variant}`);
    const roster = page.getByTestId('daily-worker-roster'); await roster.waitFor();
    assert.equal(await roster.getByRole('checkbox').count(), 2);
    const save = page.getByRole('button', { name: /^(저장|Luu|Lưu|Save)$/, exact: true });
    await save.click(); assert.equal(await page.evaluate(() => window.saved.length), 0);
    const checks = roster.getByRole('checkbox');
    if (mobile) { await checks.nth(0).tap(); await checks.nth(1).tap(); } else { await checks.nth(0).focus(); await page.keyboard.press('Space'); await checks.nth(1).check(); }
    await save.click(); await page.waitForFunction(() => window.saved.length === 1);
    const saved = await page.evaluate(() => window.saved[0]);
    assert.equal(saved.coverageStartDate, saved.coverageEndDate);
    assert.deepEqual(saved.workerReviews, [{ workerId: 1, noWork: true }, { workerId: 2, noWork: true }]);
    assert.deepEqual(saved.records, []);
    await page.goto(`http://127.0.0.1:${port}/daily-work-log-test.html?legacy&theme=${variant}`);
    await page.getByTestId('work-row-search').waitFor();
    assert.equal(await page.getByTestId('daily-worker-roster').count(), 0);
    assert.ok(await page.locator('.Mui-disabled').count() > 1);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS daily roster, explicit no work, legacy period', language, variant, mobile ? 'touch' : 'keyboard');
  }
} finally { await browser?.close(); server.kill(); if (existsSync(html)) unlinkSync(html); }
