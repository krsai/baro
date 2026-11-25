import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright-core';

const html = 'frontend/completion-filter-test.html', jsx = html.replace('.html', '.jsx'), port = 43519;
assert.ok(!existsSync(html) && !existsSync(jsx));
writeFileSync(html, '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/completion-filter-test.jsx"></script>');
writeFileSync(jsx, `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline,Box} from '@mui/material';import {appThemes} from '/src/theme';import {LanguageProvider} from '/src/context/LanguageContext';import Report from '/src/pages/App/CustomerProductionReport';import SearchPanel from '/src/components/SearchPanel';import CompletionFilter from '/src/components/CompletionFilter';
function App(){const [include,setInclude]=React.useState(false);return <><Report/><Box sx={{p:2}}><SearchPanel title="Other completion filters" filters={<><CompletionFilter kind="billed" include={include} onChange={setInclude}/><CompletionFilter kind="paid" include={!include} onChange={value=>setInclude(!value)}/></>} onReset={()=>setInclude(false)}/><output>{String(include)}</output></Box></>}
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider theme={appThemes[new URLSearchParams(location.search).get('theme')]}><CssBaseline/><LanguageProvider><App/></LanguageProvider></ThemeProvider></MemoryRouter>);`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: 'frontend', stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/completion-filter-test.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const lang of ['ko', 'en', 'vi']) for (const theme of ['standard', 'compact']) for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url()); });
    await page.addInitScript(lang => localStorage.setItem('baro_language_override', lang), lang);
    await page.route('**/src/context/AuthContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: "export const useAuth=()=>({activeOrgId:1,activeOrgRole:'ADMIN',activeOrgType:'MANUFACTURER'});" }));
    await page.route('**/src/context/AppContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: "export const useAppActions=()=>({showNotification:()=>{},setTabEditing:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}});export const useAppState=()=>({tabs:[]});" }));
    await page.route('**/customer-production-reports?*', route => route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: {
      generatedAt: '2026-11-25T01:00:00Z', customers: [{ id: 2, name: 'Customer A' }], rows: [
        { orderId: 1, orderNumber: 'OPEN-ORDER', styleId: 1, styleName: 'Open Style', customerId: 2, customerName: 'Customer A', orderedQuantity: 100, producedQuantity: 20, status: 'IN_PROGRESS' },
        { orderId: 2, orderNumber: 'DONE-ORDER', styleId: 2, styleName: 'Done Style', customerId: 2, customerName: 'Customer A', orderedQuantity: 100, producedQuantity: 100, status: 'COMPLETED' },
      ],
    } }));
    await page.goto(`http://127.0.0.1:${port}/completion-filter-test.html?theme=${theme}`);
    await page.getByRole('cell', { name: 'OPEN-ORDER', exact: true }).waitFor();
    const report = page.locator('main'), filter = report.getByRole('combobox').first();
    const words = { ko: ['제외', '포함'], en: ['Exclude', 'Include'], vi: ['Loại Trừ', 'Bao Gồm'] }[lang];
    assert.equal((await filter.textContent()).trim(), words[0]);
    assert.equal(await report.getByRole('cell', { name: 'DONE-ORDER', exact: true }).count(), 0);
    assert.equal(await report.getByRole('switch').count() + await report.getByRole('checkbox').count(), 0);
    assert.doesNotMatch(await report.innerText(), /기준 시각|As Of|As of|Thời điểm|2026.*11.*25/);
    await filter.click(); await page.getByRole('option', { name: words[1], exact: true }).click();
    await report.getByRole('cell', { name: 'DONE-ORDER', exact: true }).waitFor();
    const collapse = report.locator('button[aria-expanded]');
    await collapse.click(); assert.equal(await filter.isVisible(), false);
    await collapse.click(); assert.equal((await filter.textContent()).trim(), words[1]);
    await report.locator('[data-search-reset]').click();
    assert.equal(await report.getByRole('cell', { name: 'DONE-ORDER', exact: true }).count(), 0);
    // Billing and paid visibility share the same control, including reversed hidePaid state.
    const other = page.getByRole('region', { name: 'Other completion filters' });
    await other.getByRole('combobox').first().click();
    await page.getByRole('option', { name: words[1], exact: true }).click();
    assert.equal(await page.locator('output').textContent(), 'true');
    assert.equal((await other.getByRole('combobox').nth(1).textContent()).trim(), words[0]);
    await other.locator('[data-search-reset]').click();
    assert.equal(await page.locator('output').textContent(), 'false');
    const bounds = await filter.boundingBox(); assert.ok(bounds.width <= 144 && bounds.width > 100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await page.close(); console.log('PASS completion filters/report', lang, theme, width);
  }
} finally {
  await browser?.close(); server.kill();
  for (const file of [html, jsx]) if (existsSync(file)) unlinkSync(file);
}
