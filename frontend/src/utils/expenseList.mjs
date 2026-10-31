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
// Group by the actual document FK; never merge standalone or historical records by a displayed number.
export function groupExpenseRequests(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.orgId ?? null, row.expenseRequestId != null ? 'request' : row.sourceKind || 'cost', row.expenseRequestId ?? row.id]);
    if (!groups.has(key)) groups.set(key,{key,row,items:[]});
    groups.get(key).items.push(row);
  }
  return [...groups.values()].map(group=>({...group,currencyTotals:expenseCurrencyTotals(group.items)}));
}
export const expenseIndustryKey = row => row.serviceTypeId != null ? `service:${row.serviceTypeId}` : row.sourceKind === 'HISTORICAL_WORK_RECORD' ? 'historical-process' : 'unclassified';
// Count classifications used by this request, not all capabilities of its payee.
// Labels can be identical or translated; only the related FK identifies a value.
export function summarizeExpenseDimensions(items, dimension, getLabel, language = 'ko') {
  const values = new Map();
  for (const item of items || []) {
    const id = dimension === 'category'
      ? item.transactionCode?.base?.expenseTypeId ?? item.transactionCode?.base?.expenseType?.id
      : item.serviceTypeId ?? item.serviceType?.id;
    const key = id == null ? 'unclassified' : String(id);
    if (!values.has(key)) values.set(key, getLabel(item));
  }
  const labels = [...values.values()];
  const count = Math.max(0, labels.length - 1);
  const first = labels[0] || '—';
  const text = !count ? first : language === 'ko' ? `${first} 외 ${count}개`
    : language === 'vi' ? `${first} và ${count} mục khác` : `${first} and ${count} more`;
  return { text, title: labels.join(', '), count: labels.length };
}
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
