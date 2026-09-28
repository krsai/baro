export const money4 = (value: unknown): bigint => {
  const text = String(value ?? '0');
  if (!/^\d+(\.\d{1,4})?$/.test(text)) throw new Error('INVOICE_INVALID_LEDGER_AMOUNT');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
export const decimal4 = (value: bigint) => {
  const text = value.toString().padStart(5, '0');
  return `${text.slice(0, -4)}.${text.slice(-4)}`;
};
export const invoiceFamily = (invoice: any) => invoice.rootInvoiceId || invoice.id;

// A revision replaces one installment, including its entire payment family.
// Cancelled documents lose their debt, not the money actually received.
export function invoiceSettlement(rows: any[], excludedFamily?: string) {
  const scoped = rows.filter(row => invoiceFamily(row.invoice) !== excludedFamily);
  const billed = scoped.reduce((sum, row) => sum + (row.invoice.status === 'ISSUED' ? money4(row.receivableAdded) : 0n), 0n);
  let received = 0n, hasUnallocatedPayments = false;
  for (const row of scoped) for (const payment of row.invoice.payments) {
    if (payment.voidedAt) continue;
    if (row.invoice.orders.length === 1) received += money4(payment.amount);
    else {
      const allocations = payment.allocations.filter((item: any) => !item.voidedAt);
      if (allocations.reduce((sum: bigint, item: any) => sum + money4(item.amount), 0n) < money4(payment.amount)) hasUnallocatedPayments = true;
      received += allocations.filter((item: any) => item.invoiceOrderId === row.id)
        .reduce((sum: bigint, item: any) => sum + money4(item.amount), 0n);
    }
  }
  return { priorBilledAmount: decimal4(billed), priorReceivedAmount: decimal4(received),
    defaultDeductionAmount: decimal4(received > 0n ? received : billed), hasUnallocatedPayments };
}
