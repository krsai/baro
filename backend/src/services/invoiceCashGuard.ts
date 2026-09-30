import { createHttpError } from '../utils/http';
import { invoiceFamily, money4 } from './invoiceSettlement';

// Evaluate the proposed ledger inside the same Serializable transaction as its
// write. A rejected correction rolls back, including allocation history writes.
export function assertInvoiceCashBalances(invoices: any[]) {
  const families = new Map<string, bigint>();
  const orders = new Map<string, bigint>();
  for (const invoice of invoices) {
    const family = invoiceFamily(invoice);
    for (const payment of invoice.payments) {
      if (payment.voidedAt) continue;
      const sign = payment.kind === 'REFUND' ? -1n : 1n;
      families.set(family, (families.get(family) ?? 0n) + sign * money4(payment.amount));
      for (const order of invoice.orders) {
        const amount = invoice.orders.length === 1 ? money4(payment.amount)
          : payment.allocations.filter((row: any) => !row.voidedAt && row.invoiceOrderId === order.id)
            .reduce((sum: bigint, row: any) => sum + money4(row.amount), 0n);
        const key = JSON.stringify([family, order.sourceOrderId]);
        orders.set(key, (orders.get(key) ?? 0n) + sign * amount);
      }
    }
  }
  if ([...families.values(), ...orders.values()].some(value => value < 0n)) {
    throw createHttpError(409, 'INVOICE_REFUND_BALANCE_CONFLICT');
  }
}

export async function guardInvoiceCashCorrection(tx: any, sellerOrgId: number, invoiceId: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId } });
  if (!invoice) throw createHttpError(404, 'INVOICE_NOT_FOUND');
  const family = invoiceFamily(invoice);
  const invoices = await tx.invoice.findMany({ where: { sellerOrgId,
    OR: [{ id: family }, { rootInvoiceId: family }] },
    include: { orders: true, payments: { include: { allocations: true } } } });
  assertInvoiceCashBalances(invoices);
}
