import {invoiceLineNote, sumInvoiceAmounts} from './invoiceItemGrid.mjs';
import {formatEditableDecimal} from './editableDecimal.mjs';

export const invoiceNumber = value => value == null ? '—' : formatEditableDecimal(value);
const decimalKey = value => String(value ?? '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

// Presentation only: original source keys, quantities, and rounded amounts survive.
// Different saved prices, descriptions or customs information must remain separate.
export function invoiceStyleRows(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line.orderId, line.styleId ?? line.styleCode ?? line.lineKey ?? line.key,
      line.description || line.styleName, decimalKey(line.unitPrice), line.hsCode || '', line.origin || '', invoiceLineNote(line)]);
    if (!groups.has(key)) groups.set(key, {key, lines: []});
    groups.get(key).lines.push(line);
  }
  return [...groups.values()].map(group => ({...group,
    quantity: group.lines.every(line => line.quantity != null) ? group.lines.reduce((sum,line) => sum + Number(line.quantity),0) : null,
    orderedQuantity: group.lines.reduce((sum,line) => sum + Number(line.orderedQuantity || 0),0),
    amount: sumInvoiceAmounts(group.lines.map(line => Number(line.quantity) === 0 ? '0' : line.amount)),
    note: invoiceLineNote(group.lines[0]),
  }));
}

// Keep the real item/size references for issuance and audit; edit the visible total.
export function distributeInvoiceQuantity(group, raw) {
  if (raw === '') return group.lines.map(line => ({key:line.key,quantity:''}));
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return null;
  const total = BigInt(raw), weights = group.lines.map(line => BigInt(line.orderedQuantity || 0));
  const sum = weights.reduce((a,b) => a+b,0n);
  if (!sum) return group.lines.map((line,index) => ({key:line.key,quantity:index ? '0' : raw}));
  const quantities = weights.map(weight => total * weight / sum);
  let remaining = total - quantities.reduce((a,b) => a+b,0n);
  const ranks = weights.map((weight,index) => ({index,remainder:total*weight%sum})).sort((a,b) => a.remainder === b.remainder ? a.index-b.index : a.remainder>b.remainder ? -1 : 1);
  for (const rank of ranks) {if (!remaining) break; quantities[rank.index]++; remaining--;}
  return group.lines.map((line,index) => ({key:line.key,quantity:String(quantities[index])}));
}
