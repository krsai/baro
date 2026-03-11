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

export const isOrderConfirmationPlanned = (value) =>
  normalizeOrderConfirmationStatus(value) === ORDER_CONFIRMATION_STATUS_KEYS.PLANNED;
