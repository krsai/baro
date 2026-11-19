import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const filename = 'order-style-lookup-test.html';
const fixture = 'frontend/' + filename;
const origin = 'http://127.0.0.1:43511';
const apiOrigin = 'http://127.0.0.1:43512';
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import theme from '/src/theme';
import OrderList from '/src/pages/App/order/OrderList.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, { theme },
  React.createElement(CssBaseline),
  React.createElement(MemoryRouter, { initialEntries: ['/order/new'] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/order/:orderId', element: React.createElement(OrderList) }))
  )
));
</script>`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '43511', '--strictPort'], {
  cwd: 'frontend', stdio: 'ignore', windowsHide: true, env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
});

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin + '/' + filename)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const stubContext = (name, body) => page.route(`**/src/context/${name}.jsx*`, route => route.fulfill({ contentType: 'application/javascript', body }));
  await stubContext('AuthContext', 'const auth={activeOrgId:1,activeProfile:{entryType:"ORG",orgRole:"ADMIN"}};export const useAuth=()=>auth;');
  await stubContext('LanguageContext', 'export const useLanguage=()=>({languageCode:"en"});');
  await stubContext('AppContext', 'const noop=()=>{};const actions={navigateToPath:noop,showNotification:noop,markTabChanged:noop,clearTabChanged:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;export const useAppState=()=>({});');
  const styles = [
    { id: 201, name: 'AP2039', styleCode: 'AP2039', customerOrgId: 2 },
    { id: 202, name: 'Work jacket', styleCode: 'WJ-705', customerOrgId: 2 },
    { id: 203, name: 'AP2039', styleCode: 'OTHER-CUSTOMER', customerOrgId: 3 },
  ];
  const buyer = { id: 2, name: 'Test buyer' };
  const seller = { id: 1, name: 'Test seller' };
  await page.route(url => url.origin === apiOrigin, route => {
    const { pathname } = new URL(route.request().url());
    let json = [];
    if (pathname === '/styles') json = styles;
    if (pathname === '/order-parties') json = {
      buyerOrgOptions: [buyer], sellerOrgOptions: [seller], currentOrg: seller,
      roleHint: 'MANUFACTURER', relationshipPairs: [{ brandOrgId: buyer.id, manufacturerOrgId: seller.id }],
    };
    return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json });
  });

  for (const layout of ['Horizontal', 'Vertical']) {
    await page.goto(origin + '/' + filename);
    await page.getByRole('button', { name: layout, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const search = dialog.getByRole('textbox');
    const field = page.locator('.MuiAutocomplete-root').filter({ has: page.getByPlaceholder('Search style name') });
    const input = field.getByRole('textbox');
    const results = dialog.locator('tbody tr');
    const assertSingleResult = async (code, name) => {
      await results.first().getByRole('cell', { name, exact: true }).first().waitFor();
      assert.equal(await results.count(), 1, 'the lookup shows the matching style for the selected buyer');
      assert.deepEqual((await results.first().getByRole('cell').allTextContents()).slice(0, 2), [code, name]);
    };
    await input.fill('AP2039');
    await field.getByRole('button').click();
    await assertSingleResult('AP2039', 'AP2039');
    await results.first().getByRole('button').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), 'AP2039');

    await input.fill('WJ-7');
    await input.press('Enter');
    await assertSingleResult('WJ-705', 'Work jacket');
    await search.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await input.fill('WJ-705');
    await input.press('Enter');
    assert.equal(await input.inputValue(), 'Work jacket');
    assert.equal(await dialog.count(), 0);
    console.log('PASS order style lookup', layout);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill();
  unlinkSync(fixture);
}
