export const SIZE_CODES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

export const GENDER_CODES = ['M', 'W', 'U'];

const GENDER_CODE_MAP = {
  M: 'M',
  MEN: 'M',
  MALE: 'M',
  '\ub0a8\uc131': 'M',
  W: 'W',
  WOMEN: 'W',
  FEMALE: 'W',
  '\uc5ec\uc131': 'W',
  U: 'U',
  UNISEX: 'U',
  '\uacf5\uc6a9': 'U',
};

export const normalizeGenderCode = (value, fallback = 'M') => {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  if (!raw) return fallback;
  return GENDER_CODE_MAP[raw] || fallback;
};
