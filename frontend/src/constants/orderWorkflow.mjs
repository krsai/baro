export const ORDER_WORKFLOW_KEYS = ['RECEIVED', 'PRODUCTION', 'BILLING', 'COMPLETED'];
const LABELS = {
  ko: ['접수', '생산', '청구', '완료'],
  en: ['Received', 'Production', 'Billing', 'Completed'],
  vi: ['Tiếp nhận', 'Sản xuất', 'Lập hóa đơn', 'Hoàn tất'],
};
export const getOrderWorkflowLabel = (value, languageCode = 'en') =>
  (LABELS[languageCode] || LABELS.en)[ORDER_WORKFLOW_KEYS.indexOf(value)] || '—';
export const orderWorkflowOptions = languageCode => ORDER_WORKFLOW_KEYS.map(value => ({ value, label: getOrderWorkflowLabel(value, languageCode) }));
