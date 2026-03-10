export const ORDER_STATUS_KEYS = {
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  PRODUCTION_DONE: 'PRODUCTION_DONE',
  SHIPPED: 'SHIPPED',
};

export const ORDER_STATUS_LABEL_KEYS = {
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: 'orderStatus.orderReceived',
  [ORDER_STATUS_KEYS.IN_PROGRESS]: 'orderStatus.inProgress',
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: 'orderStatus.productionDone',
  [ORDER_STATUS_KEYS.SHIPPED]: 'orderStatus.shipped',
};

export const ORDER_STATUS_DEFAULT_LABELS = {
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: '\uC8FC\uBB38\uC811\uC218',
  [ORDER_STATUS_KEYS.IN_PROGRESS]: '\uC791\uC5C5\uC911',
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: '\uC0DD\uC0B0\uC644\uB8CC',
  [ORDER_STATUS_KEYS.SHIPPED]: '\uCD9C\uACE0\uC644\uB8CC',
};

export const ORDER_STATUS_OPTIONS = [
  {
    value: ORDER_STATUS_KEYS.ORDER_RECEIVED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.ORDER_RECEIVED],
    label: ORDER_STATUS_DEFAULT_LABELS[ORDER_STATUS_KEYS.ORDER_RECEIVED],
  },
  {
    value: ORDER_STATUS_KEYS.IN_PROGRESS,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.IN_PROGRESS],
    label: ORDER_STATUS_DEFAULT_LABELS[ORDER_STATUS_KEYS.IN_PROGRESS],
  },
  {
    value: ORDER_STATUS_KEYS.PRODUCTION_DONE,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.PRODUCTION_DONE],
    label: ORDER_STATUS_DEFAULT_LABELS[ORDER_STATUS_KEYS.PRODUCTION_DONE],
  },
  {
    value: ORDER_STATUS_KEYS.SHIPPED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.SHIPPED],
    label: ORDER_STATUS_DEFAULT_LABELS[ORDER_STATUS_KEYS.SHIPPED],
  },
];

const normalizeOrderStatusToken = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const ORDER_STATUS_LEGACY_CODE_MAP = {
  '\uC8FC\uBB38\uC811\uC218': ORDER_STATUS_KEYS.ORDER_RECEIVED,
  '\uC791\uC5C5\uC911': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC0DD\uC0B0\uC644\uB8CC': ORDER_STATUS_KEYS.PRODUCTION_DONE,
  '\uCD9C\uACE0\uC644\uB8CC': ORDER_STATUS_KEYS.SHIPPED,
};

export const normalizeOrderStatus = (value) => {
  const normalized = normalizeOrderStatusToken(value);
  if (!normalized) return '';

  const upper = normalized.toUpperCase();
  if (ORDER_STATUS_DEFAULT_LABELS[upper]) return upper;
  return ORDER_STATUS_LEGACY_CODE_MAP[normalized] || normalized;
};

export const getOrderStatusLabel = (value, fallback = '-') => {
  const normalized = normalizeOrderStatus(value);
  return ORDER_STATUS_DEFAULT_LABELS[normalized] || fallback;
};

export const isOrderDeletableStatus = (value) =>
  normalizeOrderStatus(value) === ORDER_STATUS_KEYS.ORDER_RECEIVED;
