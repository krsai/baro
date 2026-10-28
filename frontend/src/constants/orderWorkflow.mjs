export const ORDER_WORKFLOW_KEYS = ['RECEIVED', 'PRODUCTION', 'BILLING', 'COLLECTION', 'COMPLETED'];
export const ORDER_WORKFLOW_TONES = {
  RECEIVED: 'gray', PRODUCTION: 'blue', BILLING: 'purple', COLLECTION: 'orange', COMPLETED: 'green',
};
const LABELS = {
  ko: ['접수', '생산', '청구', '수금', '마감'],
  en: ['Received', 'Production', 'Billing', 'Collection', 'Closed'],
  vi: ['Tiếp nhận', 'Sản xuất', 'Lập hóa đơn', 'Thu tiền', 'Đã chốt'],
};
export const getOrderWorkflowLabel = (value, languageCode = 'en') =>
  (LABELS[languageCode] || LABELS.en)[ORDER_WORKFLOW_KEYS.indexOf(value)] || '—';
export const orderWorkflowOptions = languageCode => ORDER_WORKFLOW_KEYS.map(value => ({ value, label: getOrderWorkflowLabel(value, languageCode) }));
