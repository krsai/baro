// Monetary installments never consume garment quantities. All money stays decimal.
export const INVOICE_BILLING_MODES = ['QUANTITY', 'PERCENTAGE', 'FIXED_AMOUNT'];

export function currencyDigits(currency) {
  if (!/^[A-Z]{3}$/.test(String(currency))) return null;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; }
  catch { return null; }
}

export function parseDecimalUnits(value, digits) {
  if (digits == null || digits < 0 || digits > 4) return null;
  const text = String(value ?? '').trim();
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  return BigInt(whole) * (10n ** BigInt(digits)) + BigInt(fraction.slice(0, digits).padEnd(digits, '0') || '0');
}

export function formatDecimalUnits(value, digits) {
  const text = value.toString().padStart(digits + 1, '0');
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
}

export function calculateMonetaryInstallment({ mode, currency, contractAmount, percentage, fixedAmount, agreementNote }) {
  const issues = [];
  const digits = currencyDigits(currency);
  if (digits == null) issues.push('CURRENCY');
  if (!['PERCENTAGE', 'FIXED_AMOUNT'].includes(mode)) issues.push('BILLING_MODE');
  if (!String(agreementNote || '').trim()) issues.push('AGREEMENT');
  let units = null;
  if (mode === 'PERCENTAGE') {
    const base = parseDecimalUnits(contractAmount, digits);
    const percent = parseDecimalUnits(percentage, 2);
    if (base == null || base <= 0n) issues.push('CONTRACT_AMOUNT');
    if (percent == null || percent <= 0n || percent > 10000n) issues.push('PERCENTAGE');
    if (base > 0n && percent > 0n && percent <= 10000n) units = (base * percent + 5000n) / 10000n;
  } else if (mode === 'FIXED_AMOUNT') {
    units = parseDecimalUnits(fixedAmount, digits);
  }
  if (units == null || units <= 0n) issues.push('AMOUNT');
  return { mode, contractAmount: mode === 'PERCENTAGE' ? String(contractAmount) : null,
    percentage: mode === 'PERCENTAGE' ? String(percentage) : null,
    agreementNote: String(agreementNote || '').trim(),
    total: units != null && digits != null ? formatDecimalUnits(units, digits) : null,
    invoiceQuantity: null, lines: [], styles: [], issues: [...new Set(issues)] };
}
