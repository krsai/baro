import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const PAY_TYPE_KEYS = {
  CT: 'CT',
  FIXED: 'FIXED',
};

export const PAY_TYPE_DEFAULT_LABELS = {
  [PAY_TYPE_KEYS.CT]: {
    ko: '\uC131\uACFC\uAE09',
    en: 'Piece Rate',
    vi: 'Luong san pham',
  },
  [PAY_TYPE_KEYS.FIXED]: {
    ko: '\uACE0\uC815\uAE09',
    en: 'Fixed Salary',
    vi: 'Luong co dinh',
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
