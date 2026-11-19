import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { managementTargetText } from '../frontend/src/constants/managementTargets.js';

const fixture = 'frontend/management-target-save-test.html', port = 43488;
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider,CssBaseline} from '@mui/material';
import {MemoryRouter} from 'react-router-dom';
import theme from '/src/theme';
import TargetButton from '/src/components/ManagementTargetSettingsButton.jsx';
import PayrollSettings from '/src/pages/App/payroll/PayrollTargetSettings.jsx';
const query = new URLSearchParams(location.search);
const props = { orgId: 1, languageCode: query.get('lang'), kind: query.get('kind') };
const settings = React.createElement(props.kind === 'EVIDENCE' ? PayrollSettings : TargetButton, props);
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},
  React.createElement(CssBaseline), React.createElement(MemoryRouter,null,settings)));
</script>`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'], {
  cwd: 'frontend', stdio: 'ignore', windowsHide: true,
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:' + port + '/management-target-save-test.html')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync),
    headless: true,
  });
  for (const kind of ['INVOICE', 'SHIPPING', 'EVIDENCE']) for (const lang of ['ko', 'en', 'vi']) for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    const module = (path, body) => page.route('**/src/' + path + '*', route => route.fulfill({ contentType: 'application/javascript', body }));
    await module('context/AppContext.jsx', 'const noop=()=>{};const actions={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;');
    await module('context/AuthContext.jsx', 'export const useAuth=()=>({activeOrgId:1});');
    await module('context/RequestScopeContext.jsx', "export const useRequestScopeContext=()=>({scopeId:'/order'});");
    await module('utils/apiClient.js', `
      export const buildQueryString=params=>'?' + new URLSearchParams(params);
      export async function requestJSON(url,options={}){
        if(options.method==='PUT'){
          window.writes=[...(window.writes||[]),{url,body:JSON.parse(options.body)}];
          return new Promise(resolve=>{window.finishSave=()=>resolve({ok:true});});
        }
        const params=new URL(url,location.origin).searchParams;
        if(params.get('blocked')==='true')return {rows:[{id:99,title:'PARTIAL-30',subtitle:'Hanoi',blocked:true,excluded:false}],hasMore:false};
        const excluded=params.get('excluded')==='true';
        return {rows:excluded?[]:[{id:1,title:'ORDER-001',subtitle:'Hanoi',revision:0,snapshotRevision:3,excluded:false}],hasMore:false};
      }`);
    await page.goto('http://127.0.0.1:' + port + '/management-target-save-test.html?kind=' + kind + '&lang=' + lang);
    const trigger = page.getByRole('button').first();
    await trigger.waitFor();
    assert.equal((await trigger.textContent()).trim(), '');
    assert.equal(await trigger.locator('svg').count(), 1);
    assert.ok(await trigger.getAttribute('aria-label'));
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    if(kind==='INVOICE'){
      const blocked=dialog.locator('[data-target-group="blocked"]');
      await blocked.getByText('PARTIAL-30',{exact:true}).waitFor();
      assert.equal(await blocked.locator('[data-rfd-draggable-id]').count(),0);
      assert.equal(await blocked.getByRole('button',{name:/PARTIAL-30/}).count(),0);
      await blocked.getByText(managementTargetText[lang].alreadyIssued,{exact:true}).waitFor();
    }
    assert.equal(await dialog.getByRole('tab').count(), 0);
    assert.equal(await dialog.locator('input[required]').count(), 0);
    const card = excluded => dialog.locator('[data-target-group="' + excluded + '"]').getByRole('button', { name: /ORDER-001/ });
    await card(false).waitFor();
    const handle = await card(false).locator('span[aria-hidden=true]').first().boundingBox();
    const dest = await dialog.locator('[data-target-group=true]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.move(dest.x + dest.width / 2, dest.y + 80, { steps: 20 });
    await page.mouse.up();
    await card(true).waitFor();

    const save = dialog.getByRole('button', { name: managementTargetText[lang].save, exact: true });
    assert.equal(await save.isEnabled(), true);
    await card(true).click();
    assert.equal(await save.isDisabled(), true, 'restoring the original side clears the draft');
    await card(false).click();

    const promptHandled = page.waitForEvent('dialog', { timeout: 5000 }).then(prompt => prompt.dismiss());
    await dialog.getByPlaceholder(managementTargetText[lang].search).focus();
    await page.keyboard.press('Escape');
    await promptHandled;
    await card(true).waitFor();

    await save.click();
    await page.waitForFunction(() => typeof window.finishSave === 'function');
    await page.mouse.click(2, 2);
    assert.equal(await dialog.isVisible(), true, 'pending save prevents closing');
    await page.evaluate(() => window.finishSave());
    await card(false).waitFor();
    await page.waitForFunction(() => !document.querySelector('[role=dialog] [aria-busy=true]'));
    const writes = await page.evaluate(() => window.writes);
    assert.equal(writes.length, 1);
    assert.ok(writes[0].url.startsWith('/management-targets/' + kind + '?'));
    assert.equal(writes[0].body.rows[0].excluded, true);
    assert.equal(Object.hasOwn(writes[0].body, 'reason'), false);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    await dialog.getByPlaceholder(managementTargetText[lang].search).focus();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS invoice, shipment and payroll targets: ko/en/vi desktop/mobile, drag, undo, discard protection, pending save lock and scoped requests.');
} finally {
  await browser?.close();
  server.kill();
  unlinkSync(fixture);
}
