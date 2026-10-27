export const invoiceLineNote = line => [...new Set([line.remark, line.adjustmentReason]
  .map(value => String(value || '')).filter(value => value.trim()))].join('\n');

// Group sizes from the same real order item only. Never combine separate
// orders, colors, genders or duplicate item rows based on their display names.
export function invoiceItemGrid(lines) {
  const groups = new Map();
  const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'FREE'];
  const canonicalSize = size => ({ XXL: '2XL', XXXL: '3XL', F: 'FREE' })[size.toUpperCase()] || size.toUpperCase();
  const sizes = [...new Set(lines.map(line => line.size || '—'))].sort((a, b) => {
    const ai = sizeOrder.indexOf(canonicalSize(a)), bi = sizeOrder.indexOf(canonicalSize(b));
    if (ai >= 0 || bi >= 0) return (ai < 0 ? sizeOrder.length : ai) - (bi < 0 ? sizeOrder.length : bi);
    return a.localeCompare(b, 'en', { numeric: true });
  });
  // Preserve the selected order/style/color sequence while keeping each group
  // together. This is presentation only; original line keys and payloads stay intact.
  const ranks = [new Map(), new Map(), new Map()];
  const rank = (level, key) => {
    if (!ranks[level].has(key)) ranks[level].set(key, ranks[level].size);
    return ranks[level].get(key);
  };
  for (const line of lines) {
    const key = JSON.stringify([line.orderId, line.itemId ?? line.key, line.styleId, line.color, line.gender]);
    if (!groups.has(key)) groups.set(key, { key, lines: [], sort: [
      rank(0, line.orderId), rank(1, JSON.stringify([line.orderId, line.styleId])),
      rank(2, JSON.stringify([line.orderId, line.styleId, line.color])),
      ({ M: 0, W: 1, F: 1, U: 2 })[line.gender] ?? 3,
    ] });
    groups.get(key).lines.push(line);
  }
  return { sizes, rows: [...groups.values()].sort((a, b) => {
    for (let i = 0; i < a.sort.length; i++) if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i];
    return 0;
  }).map(({ sort, ...group }) => {
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
