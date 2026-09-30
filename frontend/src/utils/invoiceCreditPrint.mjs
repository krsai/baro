const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function buildInvoiceCreditPrintHtml(credit) {
  const s = credit.snapshot;
  if (s?.version !== 1) throw new Error('INVOICE_CREDIT_TEMPLATE_UNSUPPORTED');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Credit note ${escape(credit.id)}</title>
    <style>body{font:14px Arial,sans-serif;margin:32px}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0;white-space:pre-wrap}@media print{button{display:none}}@page{size:A4;margin:18mm}</style></head><body>
    <button onclick="window.print()">Print / PDF</button><h1>Credit note / 채권 감액 / Giảm công nợ</h1>
    ${credit.voidedAt ? '<h2>VOID / 취소 / Đã hủy</h2>' : ''}
    ${credit.invoiceStatus === 'CANCELLED' ? '<h2>Original invoice cancelled / 원청구 취소 — 감액 효력 없음 / Hóa đơn gốc đã hủy</h2>' : ''}
    <dl><dt>Document</dt><dd>${escape(credit.id)}</dd><dt>Invoice / Order</dt><dd>${escape(s.invoiceNumber)} / ${escape(s.sourceOrderNumber)}</dd>
    <dt>Seller / Buyer</dt><dd>${escape(s.seller?.name)} / ${escape(s.buyer?.name)}</dd>
    <dt>Credit amount (debt reduction, not cash refund)</dt><dd>${escape(s.amount)} ${escape(s.currencyCode)}</dd>
    <dt>Reason</dt><dd>${escape(s.reason)}</dd><dt>Issued by / At</dt><dd>${escape(credit.createdBy)} / ${escape(credit.createdAt)}</dd>
    ${credit.voidedAt ? `<dt>Void reason / By / At</dt><dd>${escape(credit.voidReason)} / ${escape(credit.voidedBy)} / ${escape(credit.voidedAt)}</dd>` : ''}</dl></body></html>`;
}
