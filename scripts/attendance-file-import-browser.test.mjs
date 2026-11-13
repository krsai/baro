import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';

const fixture = path.resolve('frontend/attendance-file-import-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from "react";import {createRoot} from "react-dom/client";import Page from "/src/pages/App/attendance/AttendanceList.jsx";createRoot(document.getElementById("root")).render(React.createElement(Page));</script></body></html>');
const port = 43227;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.resolve('frontend'), stdio: 'ignore' });
let browser;
function file(source) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ID Người', 'Tên', 'Thời gian', 'Nguồn dữ liệu'],
    ...Array.from({length:31},(_,i)=>['08:00:00','17:30:00'].map(time=>['01','BRVN0003','2026-10-'+String(i+1).padStart(2,'0')+' '+time,source])).flat(),
  ]), 'Sheet1');
  return { name: 'attendance.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/attendance-file-import-acceptance.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath);
  browser = await chromium.launch({ executablePath, headless: true });
  for (const [language, expected] of [['ko', '전체 등록'], ['en', 'Import all'], ['vi', 'Nhập tất cả']]) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const mock = (pattern, body) => page.route(pattern, route => route.fulfill({ contentType: 'application/javascript', body }));
    await mock('**/src/context/LanguageContext.jsx*', `export const useLanguage=()=>({languageCode:${JSON.stringify(language)}});`);
    await mock('**/src/context/AuthContext.jsx*', 'export const useAuth=()=>({activeOrgId:1,activeFactoryId:1});');
    await mock('**/src/context/AppContext.jsx*', 'const actions={navigateToPath:()=>{},showNotification:(...args)=>{window.notifications??=[];window.notifications.push(args)}};export const useAppActions=()=>actions;');
    await mock('**/src/components/AppPageContainer.jsx*', 'import React from "/node_modules/.vite/deps/react.js";export default ({children})=>React.createElement("main",{},children);');
    await mock('**/src/pages/App/payroll/PayrollSettingsDialog.jsx*', 'export default ()=>null;');
    await mock('**/src/hooks/useWorkspaceRefreshOnEvent*', 'export default ()=>{};');
    await mock('**/src/hooks/useHolidayCalendar*', 'const holidaySet=new Set();export default ()=>({holidaySet});');
    await mock('**/src/utils/apiClient.js*', `export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url,options={}){window.requests??=[];window.requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});if(options.method){if(!url.startsWith('/attendance-entries/import')||options.method!=='POST')throw Error('Unexpected write');window.attempts=(window.attempts||0)+1;if(window.attempts===1)throw Error('Simulated interruption');const body=JSON.parse(options.body);return {dayCount:body.dailyEntries.length,entryCount:body.dailyEntries.reduce((n,d)=>n+d.entries.length,0)};}if(url.startsWith('/factories'))return [{id:1,name:'Hanoi',managementStartDate:'2026-04-01'}];if(url.startsWith('/employees'))return [{id:3,employeeNo:'BRVN0003',name:'Test Employee',factoryId:1,status:'ACTIVE'},{id:4,employeeNo:'BRVN0004',name:'Attendance exempt',factoryId:1,status:'ACTIVE',alwaysFullAttendance:true},{id:5,employeeNo:'BRVN0005',name:'Payroll excluded',factoryId:1,status:'ACTIVE',payrollExcluded:true},{id:6,employeeNo:'BRVN0006',name:'Versioned exemption',factoryId:1,status:'ACTIVE',payrollManagementVersions:[{id:1,effectiveMonth:'2026-01',alwaysFullAttendance:true,payrollExcluded:false}]}];return [];}`);
    await page.goto(`http://127.0.0.1:${port}/attendance-file-import-acceptance.html`);
    await page.waitForFunction(() => (window.requests || []).some(row => row.url.startsWith('/employees')));
    const countHeading={ko:'\uAE30\uB85D \uC778\uC6D0 / \uAD00\uB9AC \uB300\uC0C1',en:'Recorded / attendance target',vi:'\u0110\u00E3 ghi / C\u1EA7n ch\u1EA5m c\u00F4ng'}[language];
    await page.getByRole('columnheader',{name:countHeading,exact:true}).waitFor();
    const firstCount=page.locator('tbody tr').first().locator('td').nth(2);await page.waitForFunction(()=>document.querySelector('tbody tr td:nth-child(3)')?.textContent==='0/1');assert.equal(await firstCount.textContent(),'0/1','only managed employees belong in the denominator, including versioned exemptions');
    await page.locator('input[type=file]').setInputFiles(file('Manual correction'));
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: expected, exact: true });
    await confirm.waitFor();
    assert.equal(await confirm.isDisabled(), false);
    assert.equal(await page.evaluate(() => window.requests.some(row => row.method !== 'GET')), false);
    await confirm.click();
    await page.getByText('Simulated interruption',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await confirm.waitFor();assert.equal(await confirm.isDisabled(),false);
    await confirm.click();
    await page.waitForFunction(()=>window.notifications?.some(row=>row[1]==='success'));
    const writes=await page.evaluate(()=>window.requests.filter(row=>row.method!=='GET'));assert.equal(writes.length,2);
    for(const write of writes){assert.equal(write.method,'POST');assert.equal(write.body.dailyEntries.length,31);assert.equal(write.body.dailyEntries[30].workDate,'2026-10-31');assert.equal(write.body.dailyEntries.reduce((n,d)=>n+d.entries.length,0),31);}
    assert.deepEqual(writes[0].body,writes[1].body);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Attendance file import browser passed: ko/en/vi edited-file review with whole-month atomic import, retained review after failure, and identical retry.');
} finally {
  await browser?.close(); vite.kill(); unlinkSync(fixture);
}
