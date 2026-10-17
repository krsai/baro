import { formatDecimalUnits } from './invoiceBilling.mjs';

// Keep legacy fractional production prices and never add unlike currencies.
export function amountUnits(value) {
  const text = String(value ?? '');
  if (!/^\d{1,18}(?:\.\d{1,4})?$/.test(text)) return 0n;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4,'0'));
}
export function expenseCurrencyTotals(rows) {
  const totals = new Map();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) || 0n) + amountUnits(row.amount));
  return [...totals].sort(([a],[b]) => String(a).localeCompare(String(b))).map(([currency,units]) => ({ currency, units, amount: formatDecimalUnits(units,4) }));
}
export const expenseIndustryKey = row => row.serviceTypeId != null ? `service:${row.serviceTypeId}` : row.sourceKind === 'HISTORICAL_WORK_RECORD' ? 'historical-process' : 'unclassified';
export function groupExpenseRows(rows, kind, getLabel) {
  const groups = new Map(), totals = new Map(expenseCurrencyTotals(rows).map(total => [total.currency,total.units]));
  for (const row of rows) {
    const identity = kind === 'partner' ? row.partnerOrgId ?? row.partner?.id ?? `unknown:${row.id}` : expenseIndustryKey(row);
    const key = JSON.stringify([identity,row.currency]);
    if (!groups.has(key)) groups.set(key,{ key, identity, name:getLabel(row), currency:row.currency, count:0, units:0n });
    const group = groups.get(key); group.count++; group.units += amountUnits(row.amount);
  }
  return [...groups.values()].map(group => ({ ...group, amount:formatDecimalUnits(group.units,4),
    share: totals.get(group.currency) ? Number(group.units * 1000n / totals.get(group.currency)) / 10 : 0 }));
}
