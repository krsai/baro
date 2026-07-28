import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const PAY_TYPE_KEYS = {
  CT: 'CT',
  FIXED: 'FIXED',
};

export const PAY_TYPE_DEFAULT_LABELS = {
  [PAY_TYPE_KEYS.CT]: {
    ko: '\uC131\uACFC\uAE09',
    en: 'Performance Pay',
    vi: 'L\u01B0\u01A1ng theo s\u1EA3n l\u01B0\u1EE3ng',
  },
  [PAY_TYPE_KEYS.FIXED]: {
    ko: '\uACE0\uC815\uAE09',
    en: 'Fixed Pay',
    vi: 'L\u01B0\u01A1ng c\u1ED1 \u0111\u1ECBnh',
  },
};

export const PAY_COMPONENT_DEFAULT_LABELS = {
  BASE_SALARY: {
    ko: '\uAE30\uBCF8\uAE09',
    en: 'Base Salary',
    vi: 'L\u01B0\u01A1ng c\u01A1 b\u1EA3n',
  },
  FIXED_ALLOWANCE: {
    ko: '\uACE0\uC815\uC218\uB2F9',
    en: 'Fixed Allowance',
    vi: 'Ph\u1EE5 c\u1EA5p c\u1ED1 \u0111\u1ECBnh',
  },
  PRODUCTION_ALLOWANCE: {
    ko: '\uC0DD\uC0B0\uC218\uB2F9',
    en: 'Production Allowance',
    vi: 'Ph\u1EE5 c\u1EA5p s\u1EA3n l\u01B0\u1EE3ng',
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

export const normalizePayType = (value, fallback = PAY_TYPE_KEYS.FIXED) => {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  return upper === PAY_TYPE_KEYS.CT || upper === PAY_TYPE_KEYS.FIXED ? upper : fallback;
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
  [PAY_TYPE_KEYS.CT, PAY_TYPE_KEYS.FIXED].map((value) => ({
    value,
    label: getPayTypeLabel(value, value, languageCode),
  }));
