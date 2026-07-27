const INTEGER_FORMATTER = new Intl.NumberFormat('ko-KR');
const DECIMAL_FORMATTER_CACHE = new Map();

const getDecimalFormatter = (locale, minimumFractionDigits, maximumFractionDigits) => {
  const key = `${locale}:${minimumFractionDigits}:${maximumFractionDigits}`;
  if (DECIMAL_FORMATTER_CACHE.has(key)) {
    return DECIMAL_FORMATTER_CACHE.get(key);
  }

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  DECIMAL_FORMATTER_CACHE.set(key, formatter);
  return formatter;
};

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized =
    typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNumberWithCommas = (
  value,
  {
    fallback = '-',
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    locale = 'ko-KR',
  } = {}
) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;

  if (
    minimumFractionDigits === 0 &&
    maximumFractionDigits === 0
  ) {
    return locale === 'ko-KR'
      ? INTEGER_FORMATTER.format(Math.round(parsed))
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(parsed));
  }

  const formatter = Number.isInteger(parsed)
    ? (locale === 'ko-KR' ? INTEGER_FORMATTER : new Intl.NumberFormat(locale))
    : getDecimalFormatter(locale, minimumFractionDigits, maximumFractionDigits);
  return formatter.format(parsed);
};

export const formatDigitsWithCommas = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  return formatNumberWithCommas(digits, {
    fallback: '',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

export const parseNumberLike = (value) => {
  const parsed = toFiniteNumber(value);
  return parsed === null ? Number.NaN : parsed;
};
