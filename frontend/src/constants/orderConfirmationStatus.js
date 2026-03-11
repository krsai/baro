export const ORDER_CONFIRMATION_STATUS_KEYS = {
  PLANNED: 'PLANNED',
  CONFIRMED: 'CONFIRMED',
};

export const ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS = {
  [ORDER_CONFIRMATION_STATUS_KEYS.PLANNED]: '계획',
  [ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED]: '확정',
};

export const ORDER_CONFIRMATION_STATUS_OPTIONS = [
  {
    value: ORDER_CONFIRMATION_STATUS_KEYS.PLANNED,
    label: ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[ORDER_CONFIRMATION_STATUS_KEYS.PLANNED],
  },
  {
    value: ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED,
    label: ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED],
  },
];

export const ORDER_CONFIRMATION_TEXT = {
  fieldLabel: '확정 여부',
  filterAllLabel: '전체',
};

const normalizeOrderConfirmationStatusToken = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const ORDER_CONFIRMATION_STATUS_LEGACY_CODE_MAP = {
  계획: ORDER_CONFIRMATION_STATUS_KEYS.PLANNED,
  확정: ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED,
};

export const normalizeOrderConfirmationStatus = (value) => {
  const normalized = normalizeOrderConfirmationStatusToken(value);
  if (!normalized) return '';

  const upper = normalized.toUpperCase();
  if (ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[upper]) return upper;
  return ORDER_CONFIRMATION_STATUS_LEGACY_CODE_MAP[normalized] || normalized;
};

export const getOrderConfirmationStatusLabel = (value, fallback = '-') => {
  const normalized = normalizeOrderConfirmationStatus(value);
  return ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[normalized] || fallback;
};

export const getOrderConfirmationDeleteTooltip = (value) =>
  `${getOrderConfirmationStatusLabel(value, value || '-')}일 때만 삭제 가능합니다.`;

export const getOrderConfirmationDeleteOnlyMessage = (value) =>
  `${getOrderConfirmationStatusLabel(value, value || '-')}일 때만 주문을 삭제할 수 있습니다.`;

export const hasOrderProgressStage = (value) =>
  normalizeOrderConfirmationStatus(value) === ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED;

export const isOrderConfirmationPlanned = (value) =>
  normalizeOrderConfirmationStatus(value) === ORDER_CONFIRMATION_STATUS_KEYS.PLANNED;
