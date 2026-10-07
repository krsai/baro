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
    const input = page.getByRole('combobox');
    await input.click();
    await input.pressSequentially('URD', { delay: 100 });
    const first = await page.getByRole('option').allTextContents();
    await input.blur();
    await input.click();
    const reopened = await page.getByRole('option').allTextContents();
    assert.equal(first.length, 2); assert.ok(first.every(s => s.includes('URD'))); assert.deepEqual(reopened, first);
    await input.fill('AM');
    assert.equal(await page.getByRole('option').count(), 6);
    await input.fill('URD');
    assert.deepEqual(await page.getByRole('option').allTextContents(), first);
    console.log(`Style search browser regression passed (${viewport.width}px): first input, reopen, and repeated search`);
    await page.close();
  }
} finally { await browser?.close(); server.kill(); }
