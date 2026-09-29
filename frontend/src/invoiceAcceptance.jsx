import React from 'react';
import { createRoot } from 'react-dom/client';
import InvoiceFinalReviewDialog from './pages/App/invoice/InvoiceFinalReviewDialog';

const languageCode = new URLSearchParams(location.search).get('lang') || 'ko';
const lines = Array.from({ length: 48 }, (_, index) => ({ key: `line-${index}`, style: `스타일 Áo ${index + 1}`,
  color: index % 2 ? 'Đỏ' : '파랑', gender: index % 3 ? 'M' : 'W', size: index % 2 ? 'L' : 'S',
  orderedQuantity: 10, invoicedQuantity: index === 0 ? 8 : index === 1 ? 12 : 10,
  currentInvoiceQuantity: 10, difference: index === 0 ? -2 : index === 1 ? 2 : 0 }));
const review = { revision: 'browser-review-revision', orders: [{ sourceOrderId: 'order-1', orderNumber: 'ORDER-한베-1', lines }] };
const request = async (url, options = {}) => {
  if (!options.method) return review;
  window.__invoiceAcceptancePayload = JSON.parse(options.body);
  document.documentElement.dataset.saved = 'true';
  return { rows: [] };
};
createRoot(document.getElementById('root')).render(<InvoiceFinalReviewDialog invoiceId="invoice-1" orgId={1}
  languageCode={languageCode} request={request} onClose={() => {}} onSaved={() => {}} />);
