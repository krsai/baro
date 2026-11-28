import {recordDetailsText} from '../frontend/src/constants/rowActions.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, writeFileSync, unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';

const html = 'frontend/record-interaction-test.html', jsx = 'frontend/record-interaction-test.jsx', port = 43529;
assert.ok(!existsSync(html) && !existsSync(jsx));
writeFileSync(html, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/record-interaction-test.jsx"></script>');
writeFileSync(jsx, `import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Table,TableCell,Paper,Stack,TextField,Menu,MenuItem,Portal}from'@mui/material';import{createAppTheme}from'/src/theme';import{RecordInteractionScope,RecordRow,RecordOpenButton,RecordText,RecordMenuButton}from'/src/components/RecordInteraction';import{contextMenuKeyDown}from'/src/utils/keyboardPolicy.mjs';
import{TableActionsCell,TableActionsHeader}from'/src/components/TableActions';import DeleteActionButton from'/src/components/DeleteActionButton';const q=new URLSearchParams(location.search),lang=q.get('lang'),variant=q.get('theme');window.counts={open:0,menu:0,child:0,deleted:0,pdf:0};
function App(){const[draft,setDraft]=React.useState('Keep Draft'),[menu,setMenu]=React.useState(null);const open=()=>window.counts.open++;const menuOpen=e=>{e.preventDefault();window.counts.menu++;setMenu({top:e.clientY,left:e.clientX});};return <ThemeProvider theme={createAppTheme(variant)}><CssBaseline/><TextField label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><Table><RecordInteractionScope>{['one','two'].map(id=><RecordRow key={id} recordKey={id} data-testid={id} onOpen={open}><TableCell><RecordText>{id}</RecordText></TableCell><TableCell>select {id}{id==='one'&&<Portal><button data-testid="portal-child" onClick={()=>window.counts.child++}>Portal action</button></Portal>}</TableCell><TableCell><button onClick={()=>window.counts.child++}>Child {id}</button></TableCell><TableActionsCell languageCode={lang}><DeleteActionButton aria-label={'Delete '+id} disabled={id==='two'} onClick={()=>window.counts.deleted++}/><button onClick={()=>window.counts.pdf++}>PDF {id}</button></TableActionsCell></RecordRow>)}<RecordRow recordKey="disabled" data-testid="disabled" disabled onOpen={open}><TableCell>Disabled</TableCell><TableCell>disabled row</TableCell><TableActionsCell languageCode={lang}/></RecordRow></RecordInteractionScope></Table><RecordInteractionScope as={Stack}><RecordRow as={Paper} recordKey="card" data-testid="card" onOpen={open}><RecordOpenButton onOpen={open}>Card</RecordOpenButton><span>select card</span></RecordRow></RecordInteractionScope><Paper data-testid="context" tabIndex={0} data-keyboard-context-menu="true" onKeyDown={contextMenuKeyDown} onContextMenu={menuOpen}>Context <RecordMenuButton label={{ko:'작업 메뉴',en:'Actions',vi:'Thao Tác'}[lang]} /></Paper><Menu open={!!menu} anchorReference="anchorPosition" anchorPosition={menu||undefined} onClose={()=>setMenu(null)}><MenuItem onClick={()=>setMenu(null)}>Existing action</MenuItem></Menu></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const testConfig='frontend/record-interaction-vite.config.mjs';writeFileSync(testConfig,"import base from './vite.config.js';export default {...base,cacheDir:'node_modules/.vite-record-interaction',optimizeDeps:{entries:['record-interaction-test.html']}};");
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config',testConfig.split('/').at(-1),'--host', '127.0.0.1', '--port', String(port), '--strictPort'], {cwd: 'frontend', stdio: 'ignore', windowsHide: true});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/record-interaction-test.html`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Vite must start');
  browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
  for (const lang of ['ko', 'en', 'vi']) for (const theme of ['standard', 'compact']) for (const width of (process.argv.includes('--desktop-only')?[1440]:[1440,390])) {
    const page = await browser.newPage({viewport: {width, height: 950}, hasTouch: width === 390});
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:43529)/, route => route.abort());
    const pending=new Set();page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));await page.goto(`http://127.0.0.1:${port}/record-interaction-test.html?lang=${lang}&theme=${theme}`, {waitUntil: 'commit', timeout: 60000});await page.getByTestId('one').waitFor().catch(e=>{console.log('TABLE_LOAD_DIAGNOSTIC',JSON.stringify({pending:[...pending],errors}));throw e;});
    const one = page.getByTestId('one'), two = page.getByTestId('two');
    const count = () => page.evaluate(() => window.counts);assert.equal(await one.locator('td').first().getByRole('button').count(),0);assert.deepEqual(await one.locator('[data-row-actions] button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')||n.textContent)),[recordDetailsText[lang],'PDF one','Delete one']);assert.equal(await two.getByRole('button',{name:'Delete two'}).isDisabled(),true);
    const select = async locator => width === 390 ? locator.tap() : locator.click();
    await select(one.getByText('select one'));
    assert.equal(await one.getAttribute('data-record-selected'), 'true');
    assert.equal((await count()).open, 0);
    await select(two.getByText('select two'));
    assert.equal(await one.getAttribute('data-record-selected'), null);
    assert.equal(await two.getAttribute('data-record-selected'), 'true');
    await page.getByTestId('portal-child').dblclick();
    assert.equal((await count()).open, 0, 'portal actions never open their ancestor row');
    assert.equal(await two.getAttribute('data-record-selected'), 'true', 'portal actions do not select or focus their ancestor row');
    await one.getByText('select one').dblclick();
    assert.equal((await count()).open, 1);
    await one.locator('[data-record-action=open]').dblclick();
    assert.equal((await count()).open, 2, 'double-click on open button must execute once');
    await select(two.locator('[data-record-action=open]'));
    assert.equal((await count()).open, 3);
    await one.getByRole('button', {name: 'Child one'}).dblclick();
    assert.equal((await count()).open, 3, 'embedded actions never open the row');
    await one.locator('[data-record-action=open]').focus();await page.keyboard.press('Tab');assert.equal(await one.getByRole('button',{name:'PDF one'}).evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await one.getByRole('button',{name:'Delete one'}).evaluate(n=>n===document.activeElement),true);await one.getByRole('button',{name:'Delete one'}).click();assert.equal((await count()).open,3);assert.equal((await count()).deleted,1);await one.focus(); await one.press(' ');
    assert.equal((await count()).open, 3);
    await one.press('Enter'); assert.equal((await count()).open, 4);
    await one.dispatchEvent('keydown', {key: 'Enter', isComposing: true, keyCode: 229});
    await one.press('Shift+Enter'); assert.equal((await count()).open, 4);
    await page.getByTestId('disabled').dblclick({force: true}); assert.equal((await count()).open, 4);
    const card = page.getByTestId('card');
    await select(card.getByText('select card'));
    assert.equal(await card.getAttribute('data-record-selected'), 'true');
    assert.equal(await one.getAttribute('data-record-selected'), 'true', 'selection scopes are independent');
    await select(page.getByTestId('context').getByRole('button'));
    await page.getByRole('menuitem', {name: 'Existing action'}).click();
    assert.equal((await count()).menu, 1);
    await page.getByTestId('context').click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Existing action'}).click();
    await page.getByTestId('context').focus(); await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', {name: 'Existing action'}).click();
    assert.equal((await count()).menu, 3);
    assert.equal(await page.getByLabel('Draft').inputValue(), 'Keep Draft');
    assert.deepEqual(errors, []);
    console.log(`PASS record interaction ${lang}/${theme}/${width}`);
    await page.close();
  }
} finally {
  await browser?.close(); server.kill();if(existsSync(testConfig))unlinkSync(testConfig);
  for (const file of [html, jsx]) if (existsSync(file)) unlinkSync(file);
}
