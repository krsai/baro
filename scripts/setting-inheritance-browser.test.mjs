import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executablePath) throw Error('Chrome required');
const fixture = path.resolve('frontend/setting-inheritance-acceptance.html');
if (existsSync(fixture)) throw Error('Fixture already exists');
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import Settings from '/src/pages/App/ApplicationSettings.jsx';import Codes from '/src/pages/App/TransactionCodeSettings.jsx';
const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(q.has('codes')?Codes:Settings,{systemDefaults:q.has('system')})));
</script></body></html>`);
const port = 43186;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/setting-inheritance-acceptance.html`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath, headless: true });
  for (const lang of ['ko','en','vi']) {
    const page = await browser.newPage(), errors = [], writes = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('**/src/context/AuthContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});' }));
    await page.route('**/src/context/LanguageContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: `export const useLanguage=()=>({languageCode:'${lang}'});` }));
    const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*' };
    const service = { id: 4, code:'LOGISTICS', nameKo:'물류', nameEn:'Logistics', nameVi:'Vận chuyển', entryMode:'LOGISTICS', requiredFields:[], orderInput:'OPTIONAL', styleInput:'HIDDEN', processInput:'HIDDEN', isActive:true };
    const code = { id:7, code:'TRKV', nameKo:'운송', nameEn:'Trucking', nameVi:'Vận chuyển', serviceTypeId:4, serviceType:service, vatEnabled:true, isActive:true, systemDefaultId:2, isOverridden:true };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!/^\/(system-app-settings|app-settings|transaction-codes|outsourcing-service-types|system-setting-defaults)(\/|$)/.test(url.pathname)) return route.fallback();
      if (route.request().method()==='OPTIONS') return route.fulfill({ headers, status:204 });
      if (route.request().method()!=='GET') writes.push({ path:url.pathname, body:route.request().postDataJSON() });
      let json;
      if (url.pathname.endsWith('app-settings')) {
        const body = route.request().postDataJSON();
        json = { defaultVatRate:body?.reset?'8':body?.defaultVatRate || '10', systemDefaultVatRate:'8', isOverridden:!body?.reset };
      } else if (url.pathname.includes('reset-default')) json = { ...code,isOverridden:false };
      else if (url.pathname.endsWith('codes') || url.pathname==='/transaction-codes') json = [code];
      else json = [service];
      return route.fulfill({ headers, json });
    });
    const labels = lang==='ko'?{vat:'기본 VAT (%)',save:'저장',reset:'기본값으로 복원',edit:'수정'}:lang==='en'?{vat:'Default VAT (%)',save:'Save',reset:'Restore default',edit:'Edit'}:{vat:'VAT mặc định (%)',save:'Lưu',reset:'Khôi phục mặc định',edit:'Sửa'};
    const url = `http://127.0.0.1:${port}/setting-inheritance-acceptance.html`;
    await page.goto(url);
    await page.getByLabel(labels.vat,{exact:true}).fill('7');
    await page.getByRole('button',{name:labels.save,exact:true}).click();
    await page.getByRole('button',{name:labels.reset,exact:true}).click();
    await page.waitForFunction(() => document.querySelector('input')?.value==='8');
    assert.deepEqual(writes.map(w=>w.body),[{defaultVatRate:'7'},{reset:true}]);
    await page.goto(`${url}?system=1`);
    await page.getByLabel(labels.vat,{exact:true}).fill('6');
    await page.getByRole('button',{name:labels.save,exact:true}).click();
    await page.waitForFunction(() => !!document.querySelector('.MuiAlert-standardSuccess'));
    assert.equal(writes.at(-1).path,'/system-app-settings');
    assert.equal(await page.getByRole('button',{name:labels.reset,exact:true}).count(),0);
    await page.goto(`${url}?codes=1`);
    await page.getByRole('button',{name:labels.edit,exact:true}).click();
    await page.getByRole('button',{name:labels.reset,exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(writes.at(-1).path,'/transaction-codes/7/reset-default');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Settings Chrome acceptance passed: ko/en/vi VAT overrides/reset, system endpoint and code default restoration.');
} finally { if (browser) await browser.close(); vite.kill(); unlinkSync(fixture); }
