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
    ko: '\uC0DD\uC0B0',
    en: 'Production',
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
    ko: '\uC8FC\uBB38 \uC0C1\uD0DC',
    en: 'Order Status',
    vi: 'Trang thai don hang',
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
    ko: '\uD604\uC7AC \uC8FC\uBB38 \uC0C1\uD0DC\uB294 \uC811\uC218\uB9CC \uC0AC\uC6A9\uD569\uB2C8\uB2E4.',
    en: 'Only Received is currently used for order status.',
    vi: 'Hien tai chi su dung trang thai Da nhan cho don hang.',
  },
  autoUpdateHelper: {
    ko: '\uC644\uB8CC \uAE30\uB2A5\uC744 \uB9CC\uB4E4\uAE30 \uC804\uAE4C\uC9C0\uB294 \uBAA8\uB4E0 \uC8FC\uBB38 \uC0C1\uD0DC\uB97C \uC811\uC218\uB85C \uC720\uC9C0\uD569\uB2C8\uB2E4.',
    en: 'Until the completion feature exists, all orders stay in Received.',
    vi: 'Truoc khi co tinh nang hoan thanh, tat ca don hang deu giu o trang thai Da nhan.',
  },
  lockedEditHelper: {
    ko: '\uC9C0\uAE08\uC740 Lock \uC5EC\uBD80\uC640 \uBB34\uAD00\uD558\uAC8C \uC0C1\uD0DC\uB97C \uC811\uC218\uB85C \uB454\uB2E4.',
    en: 'For now, the status stays Received regardless of lock state.',
    vi: 'Hien tai trang thai van la Da nhan bat ke trang thai khoa.',
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
  '\uC0DD\uC0B0': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC0DD\uC0B0\uC644\uB8CC': ORDER_STATUS_KEYS.PRODUCTION_DONE,
  '\uCD9C\uACE0\uC644\uB8CC': ORDER_STATUS_KEYS.SHIPPED,
  '\uCD9C\uACE0': ORDER_STATUS_KEYS.SHIPPED,
  '\uC815\uC0B0\uC644\uB8CC': ORDER_STATUS_KEYS.SETTLED,
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
