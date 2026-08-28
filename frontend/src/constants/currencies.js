export const CURRENCY_CODES = Object.freeze(['VND', 'USD', 'KRW']);

export const CURRENCY_SYMBOLS = Object.freeze({
  VND: '₫',
  USD: '$',
  KRW: '₩',
});

export const currencySymbol = (currencyCode) => CURRENCY_SYMBOLS[currencyCode] || currencyCode;
