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

const createLocalizedOption = (value) => ({
  value,
  get label() {
    return getOrderConfirmationStatusLabel(value, value);
  },
});

export const ORDER_CONFIRMATION_STATUS_KEYS = {
  PLANNED: 'PLANNED',
  CONFIRMED: 'CONFIRMED',
};

export const ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS = {
  [ORDER_CONFIRMATION_STATUS_KEYS.PLANNED]: {
    ko: '\uACC4\uD68D',
    en: 'Planned',
    vi: 'Ke hoach',
  },
  [ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED]: {
    ko: '\uD655\uC815',
    en: 'Confirmed',
    vi: 'Xac nhan',
  },
};

const ORDER_CONFIRMATION_TEXT_DEFAULTS = {
  fieldLabel: {
    ko: '\uD655\uC815 \uC5EC\uBD80',
    en: 'Confirmation',
    vi: 'Xac nhan',
  },
  filterAllLabel: {
    ko: '\uC804\uCCB4',
    en: 'All',
    vi: 'Tat ca',
  },
};

export const ORDER_CONFIRMATION_STATUS_OPTIONS = [
  createLocalizedOption(ORDER_CONFIRMATION_STATUS_KEYS.PLANNED),
  createLocalizedOption(ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED),
];

export const ORDER_CONFIRMATION_TEXT = {
  get fieldLabel() {
    return getOrderConfirmationText('fieldLabel');
  },
  get filterAllLabel() {
    return getOrderConfirmationText('filterAllLabel');
  },
};

const normalizeOrderConfirmationStatusToken = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const ORDER_CONFIRMATION_STATUS_LEGACY_CODE_MAP = {
  '\uACC4\uD68D': ORDER_CONFIRMATION_STATUS_KEYS.PLANNED,
  '\uD655\uC815': ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED,
};

export const getOrderConfirmationText = (
  key,
  fallback = '',
  languageCode = getCurrentLanguageCode()
) => resolveLocalizedText(ORDER_CONFIRMATION_TEXT_DEFAULTS[key], languageCode) || fallback;

export const normalizeOrderConfirmationStatus = (value) => {
  const normalized = normalizeOrderConfirmationStatusToken(value);
  if (!normalized) return '';

  const upper = normalized.toUpperCase();
  if (ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[upper]) return upper;
  return ORDER_CONFIRMATION_STATUS_LEGACY_CODE_MAP[normalized] || normalized;
};

export const getOrderConfirmationStatusLabel = (
  value,
  fallback = '-',
  languageCode = getCurrentLanguageCode()
) => {
  const normalized = normalizeOrderConfirmationStatus(value);
  return (
    resolveLocalizedText(ORDER_CONFIRMATION_STATUS_DEFAULT_LABELS[normalized], languageCode) ||
    fallback
  );
};

export const getOrderConfirmationDeleteTooltip = (
  value,
  languageCode = getCurrentLanguageCode()
) => {
  const label = getOrderConfirmationStatusLabel(
    value,
    String(value || '').trim() || '-',
    languageCode
  );
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'en');

  if (normalizedLanguageCode === 'ko') {
    return `${label}\uC77C \uB54C\uB9CC \uC0AD\uC81C \uAC00\uB2A5\uD569\uB2C8\uB2E4.`;
  }
  if (normalizedLanguageCode === 'vi') {
    return `Chi co the xoa khi don hang o trang thai ${label}.`;
  }
  return `Only orders in ${label} status can be deleted.`;
};

export const getOrderConfirmationDeleteOnlyMessage = (
  value,
  languageCode = getCurrentLanguageCode()
) => {
  const label = getOrderConfirmationStatusLabel(
    value,
    String(value || '').trim() || '-',
    languageCode
  );
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'en');

  if (normalizedLanguageCode === 'ko') {
    return `${label}\uC77C \uB54C\uB9CC \uC8FC\uBB38\uC744 \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
  }
  if (normalizedLanguageCode === 'vi') {
    return `Chi co the xoa don hang khi o trang thai ${label}.`;
  }
  return `Orders can only be deleted when they are ${label}.`;
};

export const hasOrderProgressStage = (value) =>
  normalizeOrderConfirmationStatus(value) === ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED;

export const isOrderConfirmationPlanned = (value) =>
  normalizeOrderConfirmationStatus(value) === ORDER_CONFIRMATION_STATUS_KEYS.PLANNED;
