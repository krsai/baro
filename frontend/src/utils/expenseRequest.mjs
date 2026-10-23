import { parseDecimalUnits, formatDecimalUnits } from './invoiceBilling.mjs';

export const newExpenseLine = () => ({ key: crypto.randomUUID(), transactionCodeId: '',
  currency: 'VND', description: '', quantity: '', unitPrice: '', vatRate: '0', workOrderId: '', styleId: '', styleProcessId: '',
  assignmentPlanId: '', details: {}, enabled: { order: false, style: false, process: false } });
export const expenseCodeForLine = (line,code) => {
  if (!code) return code;
  if (line.productionLinked) return {...code,base:{...code.base,entryMode:'PROCESS'}};
  if (line.itemId && (code.base?.entryMode === 'PROCESS' || code.productionLinkRequired != null)) return {...code,base:{...code.base,entryMode:'GENERAL',orderInput:'OPTIONAL',styleInput:'OPTIONAL',processInput:line.styleProcessId?'OPTIONAL':'HIDDEN'}};
  return code;
};
export const inputMode = (code, key) => code?.base?.entryMode === 'PROCESS' ? 'REQUIRED' : code?.base?.[`${key}Input`] || (key === 'order' ? 'OPTIONAL' : 'HIDDEN');
export const visibleInput = (line, code, key) => inputMode(code, key) === 'REQUIRED' || inputMode(code, key) === 'OPTIONAL' && line.enabled[key];
export function expenseLineAmounts(line, currency) {
  const numeric = value => /^\d{1,12}(\.\d{1,4})?$/.test(String(value)) ? parseDecimalUnits(value, 4) : null;
  const price = numeric(line.unitPrice), quantity = numeric(line.quantity);
  const rate = /^\d{1,3}(\.\d{1,2})?$/.test(String(line.vatRate)) ? parseDecimalUnits(line.vatRate, 2) : null;
  if (!['USD','VND','KRW'].includes(currency) || price == null || quantity == null || price <= 0n || quantity <= 0n || rate == null || rate > 10000n) return null;
  const digits = currency === 'USD' ? 2 : 0;
  const divisor = 10n ** BigInt(8 - digits);
  const subtotal = (price * quantity + divisor / 2n) / divisor;
  const tax = (subtotal * rate + 5000n) / 10000n;
  if (subtotal <= 0n || subtotal + tax >= 10n ** BigInt(16 + digits)) return null;
  return { subtotal: formatDecimalUnits(subtotal, digits), vatAmount: formatDecimalUnits(tax, digits), amount: formatDecimalUnits(subtotal + tax, digits) };
}
export function expenseDocumentTotals(lines, currency) {
  const amounts = lines.map(line => expenseLineAmounts(line, currency));
  const digits = currency === 'USD' ? 2 : 0;
  const sum = key => formatDecimalUnits(amounts.reduce((total, item) => total + (item ? BigInt(item[key].replace('.', '')) : 0n), 0n), digits);
  return { subtotal: sum('subtotal'), vatAmount: sum('vatAmount'), amount: sum('amount'), incomplete: amounts.some(item => !item) };
}
export function validExpenseLine(line, code, currency) {
  code = expenseCodeForLine(line,code);
  if (!code || !expenseLineAmounts(line, currency)) return false;
  if (!code.vatEnabled && Number(line.vatRate) !== 0) return false;
  if (code.base?.entryMode === 'PROCESS' && (currency !== 'VND' || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) > 2147483647 || !line.assignmentPlanId)) return false;
  return ['order','style','process'].every(key => inputMode(code,key) !== 'REQUIRED' || Boolean(line[{order:'workOrderId',style:'styleId',process:'styleProcessId'}[key]])) &&
    (code.base?.requiredFields || []).every(key => line.details[key]?.trim());
}
export const expenseLinePayload = line => ({ ...(line.itemId ? {itemId:line.itemId} : {}), ...(line.sourceRecordId ? {sourceRecordId:line.sourceRecordId} : {}), transactionCodeId: line.transactionCodeId, currency: line.currency,
  quantity: line.quantity, unitPrice: line.unitPrice, vatRate: line.vatRate,
  workOrderId: line.workOrderId || null, styleId: line.styleId || null, styleProcessId: line.styleProcessId || null,
  assignmentPlanId: line.assignmentPlanId || null, details: line.details });

export const expenseTotalsByCurrency = lines => [...new Set(lines.map(line => line.currency))].sort().map(currency => ({ currency, ...expenseDocumentTotals(lines.filter(line => line.currency === currency), currency) }));
