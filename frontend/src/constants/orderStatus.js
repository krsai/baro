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
  EDITING: 'EDITING',
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  PRODUCTION_DONE: 'PRODUCTION_DONE',
  SHIPPED: 'SHIPPED',
  SETTLED: 'SETTLED',
};

export const ORDER_STATUS_LABEL_KEYS = {
  [ORDER_STATUS_KEYS.EDITING]: 'orderStatus.editing',
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: 'orderStatus.orderReceived',
  [ORDER_STATUS_KEYS.IN_PROGRESS]: 'orderStatus.inProgress',
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: 'orderStatus.productionDone',
  [ORDER_STATUS_KEYS.SHIPPED]: 'orderStatus.shipped',
  [ORDER_STATUS_KEYS.SETTLED]: 'orderStatus.settled',
};

export const ORDER_STATUS_DEFAULT_LABELS = {
  [ORDER_STATUS_KEYS.EDITING]: {
    ko: '\uC218\uC815',
    en: 'Editing',
    vi: 'Dang sua',
  },
  [ORDER_STATUS_KEYS.ORDER_RECEIVED]: {
    ko: '\uC811\uC218',
    en: 'Received',
    vi: 'Da nhan',
  },
  [ORDER_STATUS_KEYS.IN_PROGRESS]: {
    ko: '\uC9C4\uD589',
    en: 'In Progress',
    vi: 'Dang tien hanh',
  },
  [ORDER_STATUS_KEYS.PRODUCTION_DONE]: {
    ko: '\uC644\uB8CC',
    en: 'Done',
    vi: 'Hoan thanh',
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
  filterExcludeDoneLabel: {
    ko: '\uC644\uB8CC \uC81C\uC678',
    en: 'All Except Done',
    vi: 'Tat ca tru hoan thanh',
  },
  noneLabel: {
    ko: '---',
    en: '---',
    vi: '---',
  },
  confirmedOnlyHelper: {
    ko: '\uC8FC\uBB38 \uC0C1\uD0DC\uB294 \uC218\uC815, \uC811\uC218, \uC9C4\uD589\uC744 \uC790\uB3D9 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.',
    en: 'Order status is currently managed automatically as Editing, Received, or In Progress.',
    vi: 'Trang thai don hang hien duoc quan ly tu dong la Dang sua, Da nhan hoac Dang tien hanh.',
  },
  autoUpdateHelper: {
    ko: '\uC8FC\uBB38 \uC0DD\uC131 \uD6C4 Lock \uC804\uC5D0\uB294 \uC218\uC815\uC774\uACE0, Lock \uD558\uBA74 \uC811\uC218\uB85C \uBC14\uB01D\uB2C8\uB2E4.',
    en: 'A newly created order stays in Editing until it is locked, then it becomes Received.',
    vi: 'Don hang moi tao se o trang thai Dang sua cho den khi bi khoa, sau do chuyen thanh Da nhan.',
  },
  lockedEditHelper: {
    ko: '\uC7A0\uAE08 \uD6C4 \uBBF8\uBC30\uC815 \uCE74\uB4DC\uAC00 \uB0A8\uC544 \uC788\uC73C\uBA74 \uC0C1\uD0DC\uB294 \uACC4\uC18D \uC811\uC218\uC785\uB2C8\uB2E4.',
    en: 'After locking, the order stays in Received while unassigned cards remain.',
    vi: 'Sau khi khoa, don hang se giu trang thai Da nhan khi van con the chua phan cong.',
  },
};

export const ORDER_STATUS_TEXT = {
  get fieldLabel() {
    return getOrderStatusText('fieldLabel');
  },
  get filterAllLabel() {
    return getOrderStatusText('filterAllLabel');
  },
  get filterExcludeDoneLabel() {
    return getOrderStatusText('filterExcludeDoneLabel');
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
    value: ORDER_STATUS_KEYS.EDITING,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.EDITING],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.ORDER_RECEIVED,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.ORDER_RECEIVED],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.IN_PROGRESS,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.IN_PROGRESS],
  }),
  createLocalizedOption({
    value: ORDER_STATUS_KEYS.PRODUCTION_DONE,
    labelKey: ORDER_STATUS_LABEL_KEYS[ORDER_STATUS_KEYS.PRODUCTION_DONE],
  }),
];

const normalizeOrderStatusToken = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const ORDER_STATUS_LEGACY_CODE_MAP = {
  '\uC218\uC815': ORDER_STATUS_KEYS.EDITING,
  '\uC8FC\uBB38\uC811\uC218': ORDER_STATUS_KEYS.ORDER_RECEIVED,
  '\uC811\uC218': ORDER_STATUS_KEYS.ORDER_RECEIVED,
  '\uC791\uC5C5\uC911': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC81C\uC791': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC0DD\uC0B0': ORDER_STATUS_KEYS.IN_PROGRESS,
  '\uC644\uB8CC': ORDER_STATUS_KEYS.PRODUCTION_DONE,
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
  normalizeOrderStatus(value) === ORDER_STATUS_KEYS.EDITING;
