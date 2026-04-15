import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const SIZE_CODES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'FREE'];

export const GENDER_CODES = ['M', 'W', 'U'];

export const GENDER_DEFAULT_LABELS = {
  M: {
    ko: '\uB0A8\uC131',
    en: 'Men',
    vi: 'Nam',
  },
  W: {
    ko: '\uC5EC\uC131',
    en: 'Women',
    vi: 'Nu',
  },
  U: {
    ko: '\uACF5\uC6A9',
    en: 'Unisex',
    vi: 'Unisex',
  },
};

const GENDER_CODE_MAP = {
  M: 'M',
  MEN: 'M',
  MALE: 'M',
  '\uB0A8\uC131': 'M',
  W: 'W',
  WOMEN: 'W',
  FEMALE: 'W',
  '\uC5EC\uC131': 'W',
  U: 'U',
  UNISEX: 'U',
  '\uACF5\uC6A9': 'U',
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

export const normalizeGenderCode = (value, fallback = 'M') => {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  if (!raw) return fallback;
  return GENDER_CODE_MAP[raw] || fallback;
};

export const getGenderLabel = (
  value,
  fallback = '-',
  languageCode = getCurrentLanguageCode()
) => {
  const normalized = normalizeGenderCode(value, '');
  return resolveLocalizedText(GENDER_DEFAULT_LABELS[normalized], languageCode) || fallback;
};

export const getGenderOptions = (languageCode = getCurrentLanguageCode()) =>
  GENDER_CODES.map((value) => ({
    value,
    label: getGenderLabel(value, value, languageCode),
  }));
