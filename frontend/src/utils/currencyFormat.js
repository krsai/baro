import { CURRENCY_CODES } from '../constants/currencies.js';

const LOCALE_BY_LANGUAGE = Object.freeze({ ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' });
const ZERO_DECIMAL_CURRENCIES = new Set(['VND', 'KRW']);
const formatterCache = new Map();

export const formatCurrency = (
  value,
  {
    currencyCode = 'VND',
    languageCode = 'en',
    currencyDisplay = 'code',
    fallback = '-',
  } = {}
) => {
  const normalizedCode = String(currencyCode || '').trim().toUpperCase();
  if (!CURRENCY_CODES.includes(normalizedCode)) return fallback;
  const parsed = typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const locale = LOCALE_BY_LANGUAGE[languageCode] || LOCALE_BY_LANGUAGE.en;
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(normalizedCode) ? 0 : 2;
  const key = `${locale}:${normalizedCode}:${currencyDisplay}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCode,
      currencyDisplay,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }));
  }
  return formatterCache.get(key).format(parsed);
};
