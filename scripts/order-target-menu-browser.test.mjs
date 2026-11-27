import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { managementTargetText } from '../frontend/src/constants/managementTargets.js';
import { invoiceMessages } from '../frontend/src/constants/invoiceMessages.js';
import { getOrderWorkflowLabel } from '../frontend/src/constants/orderWorkflow.mjs';

const filename = 'order-target-menu-test.html';
const fixture = 'frontend/' + filename;
const port = 43487;
const origin = 'http://127.0.0.1:' + port;
const apiOrigin = 'http://127.0.0.1:43489';
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import theme from '/src/theme';
import OrderList from '/src/pages/App/order/OrderList.jsx';
import InvoiceWorkspace from '/src/pages/App/invoice/InvoiceWorkspace.jsx';
import OrderShipments from '/src/pages/App/OrderShipments.jsx';
function Menus() {
  window.testNavigate = useNavigate();
  const { pathname } = useLocation();
  return React.createElement(React.Fragment, null,
    React.createElement('div', { hidden: pathname !== '/order' }, React.createElement(OrderList)),
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/order', element: null }),
      React.createElement(Route, { path: '/order-shipments', element: React.createElement(OrderShipments) }),
      React.createElement(Route, { path: '/invoices', element: React.createElement(InvoiceWorkspace) })
    )
  );
}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, { theme },
  React.createElement(CssBaseline),
  React.createElement(MemoryRouter, { initialEntries: ['/order'] }, React.createElement(Menus))
));
</script>`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: 'frontend', stdio: 'ignore', windowsHide: true, env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
});

async function configurePage(page, language, orgType, orgRole) {
  const reads = [], writes = [], shipmentReads = [], orderReads = [];
  const saved = { INVOICE: { excluded: false, revision: 0 }, SHIPPING: { excluded: false, revision: 0 } };
  const stub = (name, body) => page.route('**/src/context/' + name + '.jsx*', route => route.fulfill({ contentType: 'application/javascript', body }));
  await stub('AuthContext', 'const auth=' + JSON.stringify({ activeOrgId: 1, activeOrgType: orgType, activeProfile: { entryType: 'ORG', orgType, orgRole } }) + ';export const useAuth=()=>auth;');
  await stub('LanguageContext', "import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:"+JSON.stringify(language)+"});export const useLanguage=()=>({languageCode:" + JSON.stringify(language) + '});');
  await stub('AppContext', 'const noop=()=>{};const actions={navigateToPath:path=>window.testNavigate(path),showNotification:noop,markTabChanged:noop,clearTabChanged:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;export const useAppState=()=>({});');
  await page.route(url => url.origin === apiOrigin, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] || '*',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const kind = url.pathname.match(/^\/management-targets\/(INVOICE|SHIPPING)$/)?.[1];
    if (kind) {
      assert.equal(url.searchParams.get('orgId'), '1');
      if (request.method() === 'PUT') {
        const input = request.postDataJSON();
        writes.push({ kind, input });
        saved[kind] = { excluded: input.rows[0].excluded, revision: saved[kind].revision + 1 };
        return route.fulfill({ headers, json: { ok: true } });
      }
      reads.push(kind);
      const side = url.searchParams.get('excluded') === 'true';
      return route.fulfill({ headers, json: {
        rows: side === saved[kind].excluded ? [{ id: 17, title: 'ORDER-001', subtitle: 'Partner', ...saved[kind] }] : [],
        hasMore: false,
      } });
    }
    if (url.pathname === '/text-acronyms') return route.fulfill({headers,json:{revision:1,entries:[]}});
    if (url.pathname === '/orders') {
      const workflowStatus = (saved.INVOICE.excluded || saved.receiptClosed) ? 'COMPLETED' : 'RECEIVED';
      orderReads.push(workflowStatus);
      return route.fulfill({ headers, json: [{ id: 'order-001', dbId: 17, orderNumber: 'ORDER-001', items: [], workflowStatus }] });
    }
    if (url.pathname === '/invoices/issued') return route.fulfill({ headers, json: { rows: [], hasMore: false } });
    if (url.pathname === '/orders/shipments') {
      const mode = url.searchParams.get('mode');
      const { excluded } = saved.SHIPPING;
      shipmentReads.push(mode);
      const rows = mode === 'ALL' || (mode === 'EXCLUDED') === excluded
        ? [{ id: 17, orderNumber: 'SHIP-LIST-ORDER', customer: 'Partner', ordered: 20, shipped: 5, excluded }]
        : [];
      return route.fulfill({ headers, json: { rows, page: 0, total: rows.length } });
    }
    return route.fulfill({ headers, json: [] });
  });
  return { reads, writes, saved, shipmentReads, orderReads };
}

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
  for (const language of ['ko', 'en', 'vi']) for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => {errors.push(error.message);console.error(error.message);});
    const { reads, writes, saved, shipmentReads, orderReads } = await configurePage(page, language, 'MANUFACTURER', 'ADMIN');
    const labels = managementTargetText[language];
    const button = kind => page.getByRole('button', { name: labels[kind], exact: true });
    const orderStatus = status => page.getByRole('row', { name: /ORDER-001/ })
      .getByText(getOrderWorkflowLabel(status, language), { exact: true });
    await page.goto(origin + '/' + filename);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await button('SHIPPING').count(), 0);
    assert.equal(await button('INVOICE').count(), 1);
    await orderStatus('RECEIVED').waitFor();
    await page.evaluate(() => window.testNavigate('/order-shipments'));
    await button('SHIPPING').waitFor();
    const shipment = page.locator('main table').getByText('SHIP-LIST-ORDER', { exact: true });
    await shipment.waitFor();
    assert.equal(await button('INVOICE').count(), 0);
    assert.deepEqual(reads, []);

    async function changeTarget(kind, excluded = true) {
      const gear = button(kind);
      assert.equal((await gear.textContent()).trim(), '', 'settings trigger displays only the gear');
      assert.equal(await gear.locator('svg').count(), 1);
      assert.equal(await gear.getAttribute('aria-haspopup'), 'dialog');
      if (width === 1440) {
        await gear.hover();
        await page.getByRole('tooltip', { name: labels[kind], exact: true }).waitFor();
      }
      await gear.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: labels[kind], exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('tab').count(), 0);
      const row = group => dialog.locator('[data-target-group="' + group + '"]').getByRole('button', { name: /ORDER-001/ });
      await row(!excluded).click();
      const save = dialog.getByRole('button', { name: labels.save, exact: true });
      const savedResponse = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/management-targets/' + kind);
      await save.click();
      assert.equal((await savedResponse).status(), 200);
      await row(excluded).waitFor();
      await page.waitForFunction(target => {
        const card = document.querySelector('[role=dialog] [data-target-group="' + target + '"] [data-rfd-draggable-id="17"]');
        return card && card.getAttribute('aria-disabled') !== 'true' && !card.classList.contains('Mui-disabled') &&
          !document.querySelector('[role=dialog] [aria-busy=true]');
      }, excluded);
      await dialog.getByPlaceholder(labels.search).focus();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }

    await changeTarget('SHIPPING');
    await shipment.waitFor({ state: 'hidden' });
    assert.ok(shipmentReads.filter(mode => mode === 'TRACKED').length >= 2, 'shipment list reloads after saving target inclusion');
    assert.equal(saved.INVOICE.excluded, false);
    assert.ok(reads.length > 0 && reads.every(kind => kind === 'SHIPPING'));
    const previousReadCount = reads.length;

    await page.evaluate(() => window.testNavigate('/invoices'));
    await page.getByRole('button', { name: invoiceMessages[language].newInvoice, exact: true }).waitFor();
    assert.equal(await button('INVOICE').count(), 0);
    assert.equal(await button('SHIPPING').count(), 0);
    assert.equal(await page.getByRole('button', { name: invoiceMessages[language].newInvoice, exact: true }).count(), 1);
    assert.equal(reads.length, previousReadCount);
    await page.evaluate(() => window.testNavigate('/order'));
    await button('INVOICE').waitFor();
    const initialOrderReads = orderReads.length;
    await changeTarget('INVOICE');
    await orderStatus('COMPLETED').waitFor();
    assert.ok(orderReads.length > initialOrderReads, 'the active order list reloads after saving invoice targets');
    assert.equal(orderReads.at(-1), 'COMPLETED');
    await changeTarget('INVOICE', false);
    await orderStatus('RECEIVED').waitFor();
    assert.equal(orderReads.at(-1), 'RECEIVED');
    saved.receiptClosed=true;
    await page.evaluate(async()=>{const {emitWorkspaceDataChanged}=await import('/src/utils/workspaceDataEvents.js');emitWorkspaceDataChanged({orgId:1,topics:['bank-ledger'],source:'posted-receipt'});});
    await orderStatus('COMPLETED').waitFor();
    saved.receiptClosed=false;
    await page.evaluate(async()=>{const {emitWorkspaceDataChanged}=await import('/src/utils/workspaceDataEvents.js');emitWorkspaceDataChanged({orgId:1,topics:['bank-ledger'],source:'voided-receipt'});});
    await orderStatus('RECEIVED').waitFor();
    assert.ok(reads.slice(previousReadCount).length > 0 && reads.slice(previousReadCount).every(kind => kind === 'INVOICE'));
    assert.deepEqual(writes.map(({ kind, input }) => ({ kind, id: input.rows[0].id, excluded: input.rows[0].excluded, revision: input.rows[0].revision, reason: Object.hasOwn(input, 'reason') })), [
      { kind: 'SHIPPING', id: 17, excluded: true, revision: 0, reason: false },
      { kind: 'INVOICE', id: 17, excluded: true, revision: 0, reason: false },
      { kind: 'INVOICE', id: 17, excluded: false, revision: 1, reason: false },
    ]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await page.close();
  }

  for (const [orgType, orgRole] of [['MANUFACTURER', 'OPERATOR'], ['SERVICE', 'ADMIN']]) {
    const page = await browser.newPage();
    const { reads, writes } = await configurePage(page, 'en', orgType, orgRole);
    await page.goto(origin + '/' + filename);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await page.getByRole('button', { name: managementTargetText.en.SHIPPING, exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: managementTargetText.en.INVOICE, exact: true }).count(), 0);
    await page.evaluate(() => window.testNavigate('/order-shipments'));
    await page.locator('main table').getByText('SHIP-LIST-ORDER', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: managementTargetText.en.SHIPPING, exact: true }).count(), 0);
    await page.evaluate(() => window.testNavigate('/invoices'));
    await page.getByRole('button', { name: invoiceMessages.en.newInvoice, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: managementTargetText.en.INVOICE, exact: true }).count(), 0);
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
    await page.close();
  }
  console.log('PASS order target settings and shipment/invoice menus: ko/en/vi desktop/mobile, scoped saves, refreshed order status and manufacturer admin access.');
} finally {
  await browser?.close();
  server.kill();
  unlinkSync(fixture);
}
