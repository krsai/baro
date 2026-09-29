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

export function invoiceFamilyBalance(invoices: any[], familyId: string) {
  const family = invoices.filter(invoice => invoiceFamily(invoice) === familyId);
  const current = family.find(invoice => invoice.status === 'ISSUED') || null;
  const received = family.reduce((sum, invoice) => sum + (invoice.payments || [])
    .filter((payment: any) => !payment.voidedAt)
    .reduce((paymentSum: bigint, payment: any) => paymentSum
      + (payment.kind === 'REFUND' ? -1n : 1n) * money4(payment.amount), 0n), 0n);
  const debt = current ? money4(current.receivableAdded) : 0n;
  return { currentInvoiceId: current?.id ?? null, receivedAmount: decimal4(received),
    debtAmount: decimal4(debt), balanceAmount: decimal4(debt >= received ? debt - received : received - debt),
    balanceKind: debt > received ? 'DUE' : debt < received ? 'CREDIT' : 'SETTLED' };
}

// A revision replaces one installment, including its entire payment family.
// Cancelled documents lose their debt, not the money actually received.
export function invoiceSettlement(rows: any[], excludedFamily?: string) {
  const scoped = rows.filter(row => invoiceFamily(row.invoice) !== excludedFamily);
  const billed = scoped.reduce((sum, row) => sum + (row.invoice.status === 'ISSUED' ? money4(row.receivableAdded) : 0n), 0n);
  let received = 0n, hasUnallocatedPayments = false;
  for (const row of scoped) for (const payment of row.invoice.payments) {
    if (payment.voidedAt) continue;
    const sign = payment.kind === 'REFUND' ? -1n : 1n;
    if (row.invoice.orders.length === 1) received += sign * money4(payment.amount);
    else {
      const allocations = payment.allocations.filter((item: any) => !item.voidedAt);
      if (allocations.reduce((sum: bigint, item: any) => sum + money4(item.amount), 0n) < money4(payment.amount)) hasUnallocatedPayments = true;
      received += sign * allocations.filter((item: any) => item.invoiceOrderId === row.id)
        .reduce((sum: bigint, item: any) => sum + money4(item.amount), 0n);
    }
  }
  return { priorBilledAmount: decimal4(billed), priorReceivedAmount: decimal4(received),
    defaultDeductionAmount: decimal4(received > 0n ? received : billed), hasUnallocatedPayments };
}
