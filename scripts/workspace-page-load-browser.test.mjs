import assert from 'node:assert/strict';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const html = 'frontend/workspace-page-load-test.html';
const jsx = 'frontend/workspace-page-load-test.jsx';
assert.ok(!existsSync(html) && !existsSync(jsx));
writeFileSync(html, '<html><meta charset="utf-8"><div id="root"></div><script type="module" src="/workspace-page-load-test.jsx"></script></html>');
writeFileSync(jsx, `import React,{Suspense,lazy} from 'react';import{createRoot}from'react-dom/client';import Boundary from '/src/components/WorkspacePageBoundary';
const missing='/missing-workspace-page.js';const Broken=lazy(()=>import(/* @vite-ignore */ missing));function RenderFailure(){if(!window.renderFixed)throw new ReferenceError('Typography is not defined');return <span>Recovered page</span>;}function Demo(){const[open,setOpen]=React.useState(false);return <><input aria-label="Draft" defaultValue="Keep my draft"/><button onClick={()=>setOpen(true)}>Open materials</button>{open&&<Boundary><Suspense fallback="Loading">{location.search.includes('render')?<RenderFailure/>:<Broken/>}</Suspense></Boundary>}</>;}createRoot(document.getElementById('root')).render(<Demo/>);`);
const port = 43501;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: 'frontend', stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/workspace-page-load-test.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const lang of ['ko', 'en', 'vi']) {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error.message));
    let navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.route('**/src/context/LanguageContext*', r => r.fulfill({ contentType: 'application/javascript', body: `export const useLanguage=()=>({languageCode:'${lang}'});` }));
    await page.route('**/src/context/AppContext*', r => r.fulfill({ contentType: 'application/javascript', body: `export const useAppActions=()=>({confirmDiscardUnsavedChanges:()=>window.confirm('Discard draft?'),showNotification:()=>{},removeNotification:()=>{}});` }));
    await page.route('**/missing-workspace-page.js', r => r.fulfill({ status: 404, body: 'Not found' }));
    await page.goto(`http://127.0.0.1:${port}/workspace-page-load-test.html`);
    await page.getByRole('button', { name: 'Open materials' }).click();
    const error = page.getByTestId('workspace-page-load-error');
    await error.waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.equal(navigations, 1, 'no automatic reload after failed dynamic import');
    page.once('dialog', dialog => dialog.dismiss());
    await error.getByRole('button').click();
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep my draft');
    assert.equal(navigations, 1, 'cancel preserves other drafts');
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([page.waitForEvent('framenavigated'), error.getByRole('button').click()]);
    assert.equal(navigations, 2, 'explicitly confirmed reload');
    await page.goto('http://127.0.0.1:'+port+'/workspace-page-load-test.html?render');
    await page.getByRole('button',{name:'Open materials'}).click();
    await error.waitFor();assert.equal(await error.getAttribute('data-error-kind'),'render');
    const beforeRetry=navigations;await page.evaluate(()=>{window.renderFixed=true;});await error.getByRole('button').click();
    await page.getByText('Recovered page',{exact:true}).waitFor();assert.equal(navigations,beforeRetry);
    assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'Keep my draft');
    await page.close();
  }
  console.log('Workspace page load failure: ko/en/vi, sibling draft preservation and confirmed reload passed.');
} finally {
  await browser?.close();
  server.kill();
  for (const file of [html, jsx]) if (existsSync(file)) unlinkSync(file);
}
