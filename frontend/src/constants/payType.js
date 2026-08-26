import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const PAY_TYPE_KEYS = {
  GENERAL: 'GENERAL',
  OUTPUT: 'OUTPUT',
};

export const PAY_TYPE_DEFAULT_LABELS = {
  [PAY_TYPE_KEYS.OUTPUT]: {
    ko: '\uC0DD\uC0B0',
    en: 'Output',
    vi: 'S\u1EA3n l\u01B0\u1EE3ng',
  },
  [PAY_TYPE_KEYS.GENERAL]: {
    ko: '\uC77C\uBC18',
    en: 'General',
    vi: 'Th\u01B0\u1EDDng',
  },
};

export const PAY_COMPONENT_DEFAULT_LABELS = {
  BASE_SALARY: {
    ko: '\uAE30\uBCF8\uAE09',
    en: 'Base Salary',
    vi: 'L\u01B0\u01A1ng c\u01A1 b\u1EA3n',
  },
  ALLOWANCE: {
    ko: '\uC218\uB2F9',
    en: 'Allowance',
    vi: 'Ph\u1EE5 c\u1EA5p',
  },
  INCENTIVE: {
    ko: '\uC131\uACFC\uAE09',
    en: 'Incentive',
    vi: 'Th\u01B0\u1EDFng hi\u1EC7u su\u1EA5t',
  },
};

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

export const normalizePayType = (value, fallback = PAY_TYPE_KEYS.GENERAL) => {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  if (upper === PAY_TYPE_KEYS.GENERAL || upper === PAY_TYPE_KEYS.OUTPUT) return upper;
  if (upper === 'FIXED') return PAY_TYPE_KEYS.GENERAL;
  if (upper === 'CT') return PAY_TYPE_KEYS.OUTPUT;
  return fallback;
};

export const getPayTypeLabel = (
  value,
  fallback = '-',
  languageCode = getCurrentLanguageCode()
) => {
  const normalized = normalizePayType(value, '');
  return resolveLocalizedText(PAY_TYPE_DEFAULT_LABELS[normalized], languageCode) || fallback;
};

export const getPayTypeOptions = (languageCode = getCurrentLanguageCode()) =>
  [PAY_TYPE_KEYS.OUTPUT, PAY_TYPE_KEYS.GENERAL].map((value) => ({
    value,
    label: getPayTypeLabel(value, value, languageCode),
  }));
