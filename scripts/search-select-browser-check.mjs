import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const source = fs.readFileSync('frontend/src/pages/App/work/WorkDetail.jsx', 'utf8');
assert.equal((source.match(/getOptionKey=\{resolveStyleOptionId\}/g) || []).length, 2,
  'Desktop and mobile style selects must identify options by assignment ID');
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error('Chrome or Chromium is required for style search browser regression');
const port = 43181;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/search-select-acceptance.html`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${port}/search-select-acceptance.html`);
    const input = page.getByRole('textbox', { name: 'Style', exact: true });
    await input.fill('URD');
    await input.press('F2');
    const dialog = page.getByRole('dialog');
    const cells = () => dialog.getByRole('cell').filter({ hasText: /TKD|AM0/ });
    await dialog.waitFor();
    const first = await cells().allTextContents();
    assert.equal(first.length, 2); assert.ok(first.every(s => s.includes('URD')));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await input.press('F2');
    await dialog.waitFor();
    assert.deepEqual(await cells().allTextContents(), first);
    const search = dialog.getByRole('textbox');
    await search.fill('AM');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] tbody tr')].length === 6);
    assert.equal(await cells().count(), 6);
    assert.equal(await dialog.getByRole('cell', { name: 'AM01622', exact: true }).count(), 4);
    await search.fill('URD');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] tbody tr')].length === 2);
    assert.deepEqual(await cells().allTextContents(), first);
    await search.press('ArrowDown');
    await search.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), first[0]);
    console.log(`Style lookup passed (${viewport.width}px): reopen, repeated search, duplicate labels, keyboard selection`);
    await page.close();
  }
} finally { await browser?.close(); server.kill(); }
