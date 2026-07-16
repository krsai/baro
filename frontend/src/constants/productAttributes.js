import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const SIZE_CODES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'FREE'];

export const GENDER_CODES = ['M', 'W', 'U'];

export const SIZE_SET_CODES = {
  LEGACY_APPAREL: 'LEGACY_APPAREL',
  URD_NUMERIC: 'URD_NUMERIC',
};

export const DEFAULT_SIZE_SET_CODE = SIZE_SET_CODES.LEGACY_APPAREL;

export const SIZE_SET_DEFINITIONS = [
  {
    code: SIZE_SET_CODES.LEGACY_APPAREL,
    label: {
      ko: '문자형 사이즈',
      en: 'Alpha sizes',
      vi: 'Kích cỡ chữ',
    },
    sizeCodes: SIZE_CODES,
    genderCodes: GENDER_CODES,
    usesGender: true,
    defaultGender: '',
    customerAliases: [],
  },
  {
    code: SIZE_SET_CODES.URD_NUMERIC,
    label: {
      ko: '숫자형 사이즈 (100–200)',
      en: 'Numeric sizes (100–200)',
      vi: 'Kích cỡ số (100–200)',
    },
    sizeCodes: ['100', '110', '120', '130', '140', '150', '160', '170', '180', '190', '200'],
    genderCodes: ['U'],
    usesGender: false,
    defaultGender: 'U',
    customerAliases: ['URD', 'WOORI', 'WOORIDEUL', '우리들'],
  },
];

const SIZE_SET_BY_CODE = new Map(SIZE_SET_DEFINITIONS.map((item) => [item.code, item]));

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

export const normalizeSizeSetCode = (value, fallback = DEFAULT_SIZE_SET_CODE) => {
  const code = String(value || '').trim().toUpperCase();
  if (SIZE_SET_BY_CODE.has(code)) return code;
  return fallback;
};

export const getSizeSetDefinition = (value) =>
  SIZE_SET_BY_CODE.get(normalizeSizeSetCode(value)) ||
  SIZE_SET_BY_CODE.get(DEFAULT_SIZE_SET_CODE);

export const getSizeSetSizeCodes = (value) => [...(getSizeSetDefinition(value)?.sizeCodes || [])];

export const getSizeSetGenderCodes = (value) =>
  [...(getSizeSetDefinition(value)?.genderCodes || GENDER_CODES)];

export const getSizeSetDefaultGender = (value) =>
  String(getSizeSetDefinition(value)?.defaultGender || '').trim();

export const usesGenderForSizeSet = (value) =>
  getSizeSetDefinition(value)?.usesGender !== false;

export const getSizeSetLabel = (
  value,
  fallback = '',
  languageCode = getCurrentLanguageCode()
) => {
  const definition = getSizeSetDefinition(value);
  return resolveLocalizedText(definition?.label, languageCode) || fallback || definition?.code || '';
};

export const getSizeSetOptions = (languageCode = getCurrentLanguageCode()) =>
  SIZE_SET_DEFINITIONS.map((definition) => ({
    code: definition.code,
    label: getSizeSetLabel(definition.code, definition.code, languageCode),
    usesGender: definition.usesGender !== false,
  }));

const normalizeSizeSetMatchText = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

export const getDefaultSizeSetCodeForCustomer = (customer, fallback = DEFAULT_SIZE_SET_CODE) => {
  const explicitCode = normalizeSizeSetCode(customer?.defaultSizeSetCode, '');
  if (explicitCode) return explicitCode;
  const candidates =
    customer && typeof customer === 'object'
      ? [customer.name, customer.nameKo, customer.nameVi, customer.code]
      : [customer];
  const normalizedCandidates = candidates
    .map(normalizeSizeSetMatchText)
    .filter(Boolean);
  const matched = SIZE_SET_DEFINITIONS.find((definition) =>
    (definition.customerAliases || []).some((alias) => {
      const normalizedAlias = normalizeSizeSetMatchText(alias);
      return normalizedCandidates.some((candidate) => candidate.includes(normalizedAlias));
    })
  );
  return matched?.code || fallback;
};

export const inferSizeSetCodeFromSizeQuantities = (
  sizeQuantities,
  fallback = DEFAULT_SIZE_SET_CODE
) => {
  if (!sizeQuantities || typeof sizeQuantities !== 'object') return fallback;
  const keys = Object.keys(sizeQuantities)
    .map((key) => String(key || '').trim().toUpperCase())
    .filter(Boolean);
  if (keys.length === 0) return fallback;
  const matched = SIZE_SET_DEFINITIONS.find((definition) => {
    if (definition.code === DEFAULT_SIZE_SET_CODE) return false;
    const sizeSetKeys = new Set((definition.sizeCodes || []).map((size) => String(size).toUpperCase()));
    return keys.some((key) => sizeSetKeys.has(key));
  });
  return matched?.code || fallback;
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
