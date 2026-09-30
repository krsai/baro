import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildIssuedInvoicePrintHtml } from '../frontend/src/utils/issuedInvoicePrint.mjs';
import { buildInvoiceCreditPrintHtml } from '../frontend/src/utils/invoiceCreditPrint.mjs';

const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(candidate => { try { return process.getBuiltinModule('fs').existsSync(candidate); } catch { return false; } });
if (!executablePath) throw new Error('Chrome or Chromium is required for invoice browser acceptance');
const port = 43179;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: path.resolve('frontend'), stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
vite.stdout.on('data', chunk => { serverOutput += chunk; }); vite.stderr.on('data', chunk => { serverOutput += chunk; });
const waitForServer = async () => { for (let attempt = 0; attempt < 80; attempt += 1) {
  try { const response = await fetch(`http://127.0.0.1:${port}/invoice-acceptance.html`); if (response.ok) return; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
} throw new Error(`Vite did not start: ${serverOutput}`); };
const temp = await mkdtemp(path.join(os.tmpdir(), 'baro-invoice-browser-'));
let browser;
try {
  await waitForServer(); browser = await chromium.launch({ executablePath, headless: true });
  for (const languageCode of ['ko', 'vi']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/invoice-acceptance.html?lang=${languageCode}`);
    await page.getByRole('dialog').waitFor();
    const dialogText = await page.getByRole('dialog').innerText();
    assert.match(dialogText, languageCode === 'ko' ? /품목별 최종 마감 검토/ : /Kiểm tra quyết toán theo từng mục/);
    assert.match(dialogText, /ORDER-한베-1/); assert.match(dialogText, /스타일 Áo 48/);
    const inputs = page.locator('input');
    // 48 recognized quantities + 48 item reasons + one order reason + checkbox.
    assert.ok(await inputs.count() >= 98);
    await page.getByLabel(languageCode === 'ko' ? '주문 마감 사유' : 'Lý do quyết toán').fill('최종 kiểm tra');
    const reasonInputs = page.getByLabel(languageCode === 'ko' ? '품목 사유' : 'Lý do từng mục');
    await reasonInputs.nth(0).fill('부족 thiếu'); await reasonInputs.nth(1).fill('초과 vượt');
    const approval = page.getByRole('checkbox'); await approval.check(); assert.equal(await approval.isChecked(), true);
    const quantities = page.getByLabel(languageCode === 'ko' ? '최종 인정' : 'SL cuối cùng');
    await quantities.nth(2).fill('9'); assert.equal(await approval.isChecked(), false);
    await reasonInputs.nth(2).fill('최종 sửa'); await approval.check();
    await page.getByRole('button', { name: languageCode === 'ko' ? '승인 및 잠금' : 'Xác nhận và khóa' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.saved === 'true');
    const payload = await page.evaluate(() => window.__invoiceAcceptancePayload);
    assert.equal(payload.reviewRevision, 'browser-review-revision'); assert.equal(payload.orders[0].lines.length, 48);
    await page.close();
  }
  const printPage = await browser.newPage();
  const invoice = { status: 'ISSUED', snapshot: { version: 3, templateVersion: 'BARO_INVOICE_V1',
    pricingBasis: 'FINISHED_GOODS_PRICE', currencyCode: 'USD', total: '4800', receivableAdded: '4800',
    fields: { number: 'INV-한베', date: '2026-09-29', seller: { name: '판매자 Công ty' }, buyer: { name: '구매자 Khách hàng' },
      shipTo: '서울 / Hồ Chí Minh', paymentTerms: '30일 / 30 ngày', bank: '은행 Ngân hàng', notes: '한국어와 Tiếng Việt 다페이지 검증' },
    orders: [{ sourceOrderId: 'o', sourceOrderNumber: 'ORDER-1', basisAmount: '4800', billingPercentage: '100', priorBilledAmount: '0', priorReceivedAmount: '0', appliedDeductionAmount: '0', priorOutstandingAmount: '0', netAmount: '4800', receivableAdded: '4800' }],
    lines: Array.from({ length: 80 }, (_, index) => ({ orderId: 'o', quantity: 1, styleCode: `STYLE-${index}`, description: `재킷 Áo khoác ${index}`, color: '파랑 Xanh', gender: 'U', size: 'L', hsCode: '6201', origin: 'Việt Nam', unitPrice: '60', amount: '60', remark: '비고 Ghi chú' })),
  } };
  await printPage.setContent(buildIssuedInvoicePrintHtml(invoice), { waitUntil: 'load' });
  assert.match(await printPage.locator('body').innerText(), /판매자 Công ty/); assert.match(await printPage.locator('body').innerText(), /STYLE-79/);
  const pdfPath = path.join(temp, 'invoice.pdf'); await printPage.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  const pdf = await readFile(pdfPath);
  // Byte length varies with OS fonts/subsetting/compression; it is not a correctness criterion.
  const pdfText = pdf.toString('latin1');
  assert.match(pdfText, /^%PDF-/); assert.match(pdfText, /%%EOF\s*$/);
  assert.ok((pdfText.match(/\/Type\s*\/Page\b/g) || []).length >= 2);
  await printPage.setContent(buildInvoiceCreditPrintHtml({ id: 'credit-test', createdBy: '검증', createdAt: '2026-09-30',
    snapshot: { version: 1, invoiceNumber: 'INV', sourceOrderNumber: 'ORDER', amount: '2000', currencyCode: 'USD',
      reason: '원단 부족 / Thiếu vải', seller: { name: '판매자' }, buyer: { name: 'Khách hàng' } } }));
  assert.match(await printPage.locator('body').innerText(), /Thiếu vải/);
  const creditPdf = await printPage.pdf({ format: 'A4' });
  assert.match(creditPdf.toString('latin1'), /^%PDF-/);
  console.log('Browser acceptance: Korean/Vietnamese 48-row final review and multi-page Chromium PDF passed.');
} finally {
  await browser?.close(); vite.kill(); await rm(temp, { recursive: true, force: true });
}
