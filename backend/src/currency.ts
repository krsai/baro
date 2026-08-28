export const SUPPORTED_CURRENCY_CODES = ["VND", "USD", "KRW"] as const;

const SUPPORTED_CURRENCY_CODE_SET = new Set<string>(SUPPORTED_CURRENCY_CODES);

export const normalizeCurrencyCode = (value: unknown) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORTED_CURRENCY_CODE_SET.has(normalized) ? normalized : null;
};
