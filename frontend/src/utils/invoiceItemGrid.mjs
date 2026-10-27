export const invoiceLineNote = line => [...new Set([line.remark, line.adjustmentReason]
  .map(value => String(value || '')).filter(value => value.trim()))].join('\n');

// Group sizes from the same real order item only. Never combine separate
// orders, colors, genders or duplicate item rows based on their display names.
export function invoiceItemGrid(lines) {
  const groups = new Map();
  const sizes = [...new Set(lines.map(line => line.size || '—'))];
  for (const line of lines) {
    const key = JSON.stringify([line.orderId, line.itemId ?? line.key, line.styleId, line.color, line.gender]);
    if (!groups.has(key)) groups.set(key, { key, lines: [] });
    groups.get(key).lines.push(line);
  }
  return { sizes, rows: [...groups.values()].map(group => {
    const notes = [...new Set(group.lines.map(invoiceLineNote))];
    return { ...group, note: notes.length === 1 ? notes[0] : group.lines
      .filter(line => invoiceLineNote(line)).map(line => `${line.size || '—'}: ${invoiceLineNote(line)}`).join('\n') };
  }) };
}

// Display exact decimal text, including up to four unit-price decimal places.
// Currency formatting must not round or alter the values used for invoicing.
export function formatInvoiceMoney(value, currency) {
  if (value == null || !currency) return '—';
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return '—';
  let digits;
  try { digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().minimumFractionDigits; }
  catch { return '—'; }
  const [whole, fraction = ''] = text.split('.');
  const decimal = fraction.padEnd(digits, '0');
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimal ? `.${decimal}` : ''}`;
}

export function sumInvoiceAmounts(values) {
  if (values.some(value => value == null || !/^\d+(\.\d+)?$/.test(String(value)))) return null;
  const digits = Math.max(0, ...values.map(value => (String(value).split('.')[1] || '').length));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = String(value).split('.');
    return sum + BigInt(whole + fraction.padEnd(digits, '0'));
  }, 0n).toString().padStart(digits + 1, '0');
  return digits ? `${total.slice(0, -digits)}.${total.slice(-digits)}` : total;
}
