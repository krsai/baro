export const ORGANIZATION_TYPE_KEYS = {
  MANUFACTURER: 'MANUFACTURER',
  BRAND: 'BRAND',
};

export const ORGANIZATION_TYPE_LABEL_KEYS = {
  [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 'organizationType.manufacturer',
  [ORGANIZATION_TYPE_KEYS.BRAND]: 'organizationType.brand',
};

export const ORGANIZATION_TYPE_DEFAULT_LABELS = {
  [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: '\uACF5\uC7A5',
  [ORGANIZATION_TYPE_KEYS.BRAND]: '\uBE0C\uB79C\uB4DC',
};

export const ORGANIZATION_TYPE_OPTIONS = [
  {
    value: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
    labelKey: ORGANIZATION_TYPE_LABEL_KEYS[ORGANIZATION_TYPE_KEYS.MANUFACTURER],
    label: ORGANIZATION_TYPE_DEFAULT_LABELS[ORGANIZATION_TYPE_KEYS.MANUFACTURER],
  },
  {
    value: ORGANIZATION_TYPE_KEYS.BRAND,
    labelKey: ORGANIZATION_TYPE_LABEL_KEYS[ORGANIZATION_TYPE_KEYS.BRAND],
    label: ORGANIZATION_TYPE_DEFAULT_LABELS[ORGANIZATION_TYPE_KEYS.BRAND],
  },
];

const normalizeTypeToken = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const ORGANIZATION_TYPE_TOKEN_MAP = {
  manufacturer: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  factory: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  '\uACF5\uC7A5': ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  '\uC218\uC8FC\uC790': ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  '\uD14C\uC2A4\uD2B8\uC218\uC8FC\uC790': ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  brand: ORGANIZATION_TYPE_KEYS.BRAND,
  '\uBE0C\uB79C\uB4DC': ORGANIZATION_TYPE_KEYS.BRAND,
  '\uBC1C\uC8FC\uC790': ORGANIZATION_TYPE_KEYS.BRAND,
  '\uD14C\uC2A4\uD2B8\uBC1C\uC8FC\uC790': ORGANIZATION_TYPE_KEYS.BRAND,
};

export const normalizeOrganizationType = (value) => {
  const token = normalizeTypeToken(value);
  if (!token) return '';
  if (ORGANIZATION_TYPE_TOKEN_MAP[token]) {
    return ORGANIZATION_TYPE_TOKEN_MAP[token];
  }
  const upper = token.toUpperCase();
  if (upper === ORGANIZATION_TYPE_KEYS.MANUFACTURER) {
    return ORGANIZATION_TYPE_KEYS.MANUFACTURER;
  }
  if (upper === ORGANIZATION_TYPE_KEYS.BRAND) {
    return ORGANIZATION_TYPE_KEYS.BRAND;
  }
  return '';
};

export const getOrganizationTypeOption = (value) => {
  const normalized = normalizeOrganizationType(value);
  if (!normalized) return null;
  return ORGANIZATION_TYPE_OPTIONS.find((option) => option.value === normalized) || null;
};

export const getOrganizationTypeLabel = (value, fallback = '-') => {
  const option = getOrganizationTypeOption(value);
  return option?.label || fallback;
};
