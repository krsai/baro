import {invoiceListDescription,invoiceListPresentationText} from '../frontend/src/utils/invoiceListPresentation.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { managementTargetText } from '../frontend/src/constants/managementTargets.js';
import { invoiceMessages } from '../frontend/src/constants/invoiceMessages.js';
import { getOrderWorkflowLabel,ORDER_WORKFLOW_KEYS } from '../frontend/src/constants/orderWorkflow.mjs';
import {orderWorkflowInformation} from '../frontend/src/constants/orderWorkflowInformation.mjs';
import {rowActionsText,orderInvoiceNavigationText} from '../frontend/src/constants/rowActions.js';

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
      React.createElement(Route, { path: '/order/:orderId', element: React.createElement(OrderList) }),
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
  const reads = [], writes = [], shipmentReads = [], orderReads = [],invoiceReads=[],orderQueries=[],editorReads=[];
  const saved = { INVOICE: { excluded: false, revision: 0 }, SHIPPING: { excluded: false, revision: 0 } };
  const stub = (name, body) => page.route('**/src/context/' + name + '.jsx*', route => route.fulfill({ contentType: 'application/javascript', body }));
  await stub('AuthContext', 'const auth=' + JSON.stringify({ isAuthenticated:true,activeOrgId: 1, activeOrgType: orgType, activeProfile: { entryType: 'ORG', orgType, orgRole },accessProfile:{entryType:'ORG',orgType,orgRole} }) + ';export const useAuth=()=>auth;');
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
    if(['/styles','/attributes','/order-parties'].includes(url.pathname))editorReads.push(url.pathname);
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
      orderReads.push(workflowStatus);orderQueries.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ headers, json: [{ id: 'order-001', dbId: 17, orderNumber: 'ORDER-001', sellerOrgId:1,issuedInvoiceCount:1,items: [], workflowStatus },{id:'empty-order',dbId:18,orderNumber:'EMPTY-ORDER',sellerOrgId:1,issuedInvoiceCount:0,items:[],workflowStatus:'RECEIVED'}].filter(row=>url.searchParams.get('excludeClosed')!=='true'||row.workflowStatus!=='COMPLETED') });
    }
    if (url.pathname === '/invoices/issued') {invoiceReads.push(Object.fromEntries(url.searchParams));return route.fulfill({ headers, json: { rows: [{id:'scope-invoice',invoiceNumber:'INV-SCOPED',status:'ISSUED',buyerName:'Buyer',currencyCode:'USD',total:'30',receivedAmount:'0',familyBalanceAmount:'30',familyBalanceKind:'DUE',issuedAt:'2020-01-02',orders:[{sourceOrderNumber:'26AW2'}],accountingCodes:['CMTE','PBGE'],descriptions:['TKD Crew Tee','Other'],itemSummary:{firstDescription:'TKD Crew Tee',additionalCount:2,quantities:[{unit:'GARMENT',quantity:'600.0000'}]}}], hasMore: false,orderScope:url.searchParams.has('orderId')?{orderId:url.searchParams.get('orderId'),orderNumber:'ORDER-001'}:null } });}
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
  return { reads, writes, saved, shipmentReads, orderReads,invoiceReads,orderQueries,editorReads };
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
    const { reads, writes, saved, shipmentReads, orderReads,invoiceReads,orderQueries,editorReads } = await configurePage(page, language, 'MANUFACTURER', 'ADMIN');
    const labels = managementTargetText[language];
    const button = kind => page.getByRole('button', { name: labels[kind], exact: true });
    const orderStatus = status => page.getByRole('row', { name: /ORDER-001/ })
      .getByText(getOrderWorkflowLabel(status, language), { exact: true });
    await page.goto(origin + '/' + filename);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await button('SHIPPING').count(), 0);
    assert.equal(await button('INVOICE').count(), 1);
    await orderStatus('RECEIVED').waitFor();
    assert.equal(orderQueries[0].excludeClosed,'true');assert.deepEqual(editorReads,[],'list does not preload editor catalogs');
    async function filter(value){await page.getByRole('combobox').click();await page.locator('[role=option][data-value="'+value+'"]').click();}
    await filter('ALL');
    assert.equal(await page.getByRole('columnheader',{name:rowActionsText[language],exact:true}).count(),1);
    assert.equal(await page.getByRole('row',{name:/EMPTY-ORDER/}).getByRole('button',{name:orderInvoiceNavigationText[language].view,exact:true}).isDisabled(),true);
    const tableTone=await orderStatus('RECEIVED').evaluate(el=>getComputedStyle(el.closest('.MuiChip-root')).backgroundColor);
    const information=page.getByRole('button',{name:new RegExp('^'+orderWorkflowInformation[language].title+' ·')});
    await information.focus();await page.keyboard.press('Enter');
    const explanation=page.getByRole('dialog',{name:orderWorkflowInformation[language].title,exact:true});await explanation.waitFor();
    assert.equal(await explanation.locator('[data-order-workflow-explanation]').count(),ORDER_WORKFLOW_KEYS.length);
    for(const status of ORDER_WORKFLOW_KEYS){
      const row=explanation.locator('[data-order-workflow-explanation="'+status+'"]');
      assert.equal(await row.locator('.MuiChip-root').innerText(),getOrderWorkflowLabel(status,language));
      assert.equal((await row.locator('p').innerText()).startsWith(getOrderWorkflowLabel(status,language)+':'),false);
    }
    const explanationTone=await explanation.locator('[data-order-workflow-explanation="RECEIVED"] .MuiChip-root').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(explanationTone,tableTone);
    if(language==='ko'&&width===1440){await page.waitForTimeout(300);await page.screenshot({path:'logs/order-status-label-explanation-preview.png'});}
    await page.keyboard.press('Escape');await explanation.waitFor({state:'hidden'});assert.equal(await information.evaluate(el=>document.activeElement===el),true);
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

    const previousReadCount = reads.length;

    await page.evaluate(() => window.testNavigate('/invoices'));
    await page.getByRole('button', { name: invoiceMessages[language].newInvoice, exact: true }).waitFor();
    assert.equal(await button('INVOICE').count(), 0);
    assert.equal(await button('SHIPPING').count(), 0);
    assert.equal(await page.getByRole('button', { name: invoiceMessages[language].newInvoice, exact: true }).count(), 1);
    assert.equal(reads.length, previousReadCount);
    await page.evaluate(() => window.testNavigate('/order'));
    await button('INVOICE').waitFor();
    await filter('ALL');
    const initialOrderReads = orderReads.length;
    await changeTarget('INVOICE');
    await orderStatus('COMPLETED').waitFor();
    await filter('EXCLUDE_CLOSED');await page.getByRole('row',{name:/ORDER-001/}).waitFor({state:'hidden'});assert.equal(orderQueries.at(-1).excludeClosed,'true');
    await filter('ALL');await orderStatus('COMPLETED').waitFor();
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
      { kind: 'INVOICE', id: 17, excluded: true, revision: 0, reason: false },
      { kind: 'INVOICE', id: 17, excluded: false, revision: 1, reason: false },
    ]);
    await page.getByRole('row',{name:/ORDER-001/}).getByRole('button',{name:orderInvoiceNavigationText[language].view,exact:true}).click();
    await page.getByText(orderInvoiceNavigationText[language].order+': ORDER-001',{exact:true}).waitFor();
    const summary=invoiceListDescription({orders:[{sourceOrderNumber:'26AW2'}],itemSummary:{firstDescription:'TKD Crew Tee',additionalCount:2,quantities:[{unit:'GARMENT',quantity:'600.0000'}]}},language);
    await page.getByRole('button',{name:summary,exact:true}).waitFor();
    const invoiceHeaders=await page.getByRole('columnheader').allTextContents();assert.equal(invoiceHeaders.length,11);assert.equal(invoiceHeaders[1],invoiceListPresentationText[language].billTo);assert.equal(invoiceHeaders.at(-1),rowActionsText[language]);assert.equal(invoiceHeaders.includes('PDF'),false);
    const invoiceCells=page.getByRole('row',{name:new RegExp('26AW2')}).getByRole('cell');assert.equal(await invoiceCells.nth(2).innerText(),summary);assert.equal(await invoiceCells.last().getByRole('button').count(),2);
    assert.equal(invoiceReads.at(-1).orderId,'order-001');assert.equal(invoiceReads.at(-1).start,undefined);assert.equal(invoiceReads.at(-1).end,undefined);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    saved.receiptClosed=true;
    await page.evaluate(()=>window.testNavigate('/order/order-001'));
    await page.locator('input[value="ORDER-001"]').waitFor();
    assert.equal(orderQueries.at(-1).excludeClosed,undefined,'detail loads closed orders');
    assert.ok(editorReads.includes('/styles')&&editorReads.includes('/attributes')&&editorReads.includes('/order-parties'),'editor catalogs load on entering detail');
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
