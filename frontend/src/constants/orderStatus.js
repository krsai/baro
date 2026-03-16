import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

const resolveLocalizedText = (localizedText, languageCode = getCurrentLanguageCode()) => {
  if (!localizedText || typeof localizedText !== 'object') return '';
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'en');
  return (
    localizedText[normalizedLanguageCode] ||
    localizedText.en ||
    localizedText.ko ||
    localizedText.vi ||
    ''
  );
};

const createLocalizedOption = ({ value, labelKey }) => ({
  value,
  labelKey,
  get label() {
    return getOrderStatusLabel(value, value);
  },
});

export const ORDER_STATUS_KEYS = {
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  PRODUCTION_DONE: 'PRODUCTION_DONE',
  SHIPPED: 'SHIPPED',
  SETTLED: 'SETTLED',
};

export const ORDER_STATUS_LABEL_KEYS = {
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: 'orderStatus.orderReceived',
  [ORDER_STATUS_KEYS.IN_PROGRESS]: 'orderStatus.inProgress',
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: 'orderStatus.productionDone',
  [ORDER_STATUS_KEYS.SHIPPED]: 'orderStatus.shipped',
  [ORDER_STATUS_KEYS.SETTLED]: 'orderStatus.settled',
};

export const ORDER_STATUS_DEFAULT_LABELS = {
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: {
    ko: '\uC811\uC218',
    en: 'Received',
    vi: 'Da nhan',
  },
  [ORDER_STATUS_KEYS.IN_PROGRESS]: {
    ko: '\uC81C\uC791',
    en: 'In Production',
    vi: 'Dang san xuat',
  },
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: {
    ko: '\uC0DD\uC0B0 \uC644\uB8CC',
    en: 'Production Done',
    vi: 'Hoan thanh san xuat',
  },
  [ORDER_STATUS_KEYS.SHIPPED]: {
    ko: '\uCD9C\uACE0',
    en: 'Shipped',
    vi: 'Da giao',
  },
  [ORDER_STATUS_KEYS.SETTLED]: {
    ko: '\uC815\uC0B0',
    en: 'Settled',
    vi: 'Quyet toan',
  },
};

const ORDER_STATUS_TEXT_DEFAULTS = {
  fieldLabel: {
    ko: '\uC9C4\uD589 \uB2E8\uACC4',
    en: 'Progress Stage',
    vi: 'Tien do',
  },
  filterAllLabel: {
    ko: '\uC804\uCCB4',
    en: 'All',
    vi: 'Tat ca',
  },
  noneLabel: {
    ko: '---',
    en: '---',
    vi: '---',
  },
  confirmedOnlyHelper: {
    ko: '\uD655\uC815\uB41C \uC8FC\uBB38\uB9CC \uC9C4\uD589 \uB2E8\uACC4\uAC00 \uC788\uC2B5\uB2C8\uB2E4.',
    en: 'Only confirmed orders have a progress stage.',
    vi: 'Chi don hang da xac nhan moi co tien do.',
  },
  autoUpdateHelper: {
    ko: '\uC811\uC218/\uC81C\uC791/\uCD9C\uACE0/\uC815\uC0B0 \uB2E8\uACC4\uB294 \uC8FC\uBB38 \uD655\uC815\uACFC \uC2E4\uC81C \uC791\uC5C5 \uC774\uBCA4\uD2B8\uC5D0 \uB530\uB77C \uC790\uB3D9 \uC5C5\uB370\uC774\uD2B8\uB429\uB2C8\uB2E4.',
    en: 'Received/In Production/Shipped/Settled stages update automatically from order confirmation and work events.',
    vi: 'Cac giai doan Received/In Production/Shipped/Settled duoc cap nhat tu dong theo xac nhan don hang va su kien san xuat.',
  },
  lockedEditHelper: {
    ko: '\uD655\uC815\uB41C \uC8FC\uBB38\uC740 \uAE30\uBCF8 \uC815\uBCF4\uB294 \uC7A0\uAE30\uACE0, \uC9C4\uD589 \uB2E8\uACC4\uB9CC \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
    en: 'Confirmed orders lock the base info, and only the progress stage can be changed.',
    vi: 'Don hang da xac nhan se khoa thong tin co ban, chi co the doi tien do.',
  },
};

export const ORDER_STATUS_TEXT = {
  get fieldLabel() {
    return getOrderStatusText('fieldLabel');
  },
  get filterAllLabel() {
    return getOrderStatusText('filterAllLabel');
  },
  get noneLabel() {
    return getOrderStatusText('noneLabel', '---');
  },
  get confirmedOnlyHelper() {
    return getOrderStatusText('confirmedOnlyHelper');
  },
  get autoUpdateHelper() {
    return getOrderStatusText('autoUpdateHelper');
  },
  get lockedEditHelper() {
    return getOrderStatusText('lockedEditHelper');
  },
};

export const ORDER_STATUS_OPTIONS = [
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.ORDER_RECEIVED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.ORDER_RECEIVED],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.IN_PROGRESS,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.IN_PROGRESS],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.SHIPPED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.SHIPPED],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.SETTLED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.SETTLED],
  }),
];

const normalizeOrderStatusToken = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const ORDER_STATUS_LEGACY_CODE_MAP = {
  '\uC8FC\uBB38\uC811\uC218': ORDER_STATUS_KEYS.ORDER_RECEIVED,
  '\uC811\uC218': ORDER_STATUS_KEYS.ORDER_RECEIVED,
  '\uC791\uC5C5\uC911': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC81C\uC791': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC0DD\uC0B0\uC644\uB8CC': ORDER_STATUS_KEYS.SHIPPED,
  '\uCD9C\uACE0\uC644\uB8CC': ORDER_STATUS_KEYS.SHIPPED,
  '\uCD9C\uACE0': ORDER_STATUS_KEYS.SHIPPED,
  '\uC815\uC0B0': ORDER_STATUS_KEYS.SETTLED,
};

export const getOrderStatusText = (
  key,
  fallback = '',
  languageCode = getCurrentLanguageCode()
) => resolveLocalizedText(ORDER_STATUS_TEXT_DEFAULTS[key], languageCode) || fallback;

export const normalizeOrderStatus = (value) => {
  const normalized = normalizeOrderStatusToken(value);
  if (!normalized) return '';

  const upper = normalized.toUpperCase();
  if (ORDER_STATUS_DEFAULT_LABELS[upper]) return upper;
  return ORDER_STATUS_LEGACY_CODE_MAP[normalized] || normalized;
};

export const getOrderStatusLabel = (
  value,
  fallback = '-',
  languageCode = getCurrentLanguageCode()
) => {
  const normalized = normalizeOrderStatus(value);
  return resolveLocalizedText(ORDER_STATUS_DEFAULT_LABELS[normalized], languageCode) || fallback;
};

export const isOrderDeletableStatus = (value) =>
  normalizeOrderStatus(value) === ORDER_STATUS_KEYS.ORDER_RECEIVED;
