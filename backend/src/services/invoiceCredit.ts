import { createHttpError } from '../utils/http';
import { retryEditTransaction } from '../utils/editRevision';
import { money4, decimal4 } from './invoiceSettlement';

const fail = (code: string): never => { throw createHttpError(409, code); };
const reasonText = (value: unknown) => {
  const valueText = String(value || '').trim();
  if (!valueText || valueText.length > 1000) fail('INVOICE_CREDIT_REASON_REQUIRED');
  return valueText;
};
async function guardCurrent(tx: any, invoice: any) {
  if (invoice.status !== 'ISSUED') fail('INVOICE_CREDIT_NOT_CURRENT');
  if (await tx.workOrder.findFirst({ where: { invoiceFinalLockInvoiceId: invoice.id } })) {
    fail('INVOICE_FINAL_LOCK_UNLOCK_REQUIRED');
  }
  if (await tx.invoiceOrder.findFirst({ where: {
    sourceOrderId: { in: invoice.orders.map((order: any) => order.sourceOrderId) },
    invoice: { sellerOrgId: invoice.sellerOrgId, status: 'ISSUED', sequenceNumber: { gt: invoice.sequenceNumber } },
  } })) fail('INVOICE_CREDIT_REVERSE_ORDER_REQUIRED');
}

// A credit reduces debt, never cash or quantities. Originals remain immutable.
export async function createInvoiceCredit(db: any, sellerOrgId: number, actor: string, invoiceId: string, body: any) {
  const raw = String(body?.amount ?? '').trim(), key = String(body?.clientKey || '');
  if (!/^\d{1,20}(\.\d{1,4})?$/.test(raw) || money4(raw) <= 0n
    || !/^[A-Za-z0-9_-]{16,100}$/.test(key) || !Number.isSafeInteger(body?.invoiceOrderId)) fail('INVOICE_CREDIT_INVALID');
  const reason = reasonText(body.reason);
  return retryEditTransaction(db, async (tx: any) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId }, include: { orders: true, credits: true } });
    if (!invoice) throw createHttpError(404, 'INVOICE_NOT_FOUND');
    const existing = invoice.credits.find((row: any) => row.clientKey === key);
    if (existing) {
      if (money4(existing.amount) !== money4(raw) || existing.invoiceOrderId !== body.invoiceOrderId || existing.reason !== reason) fail('INVOICE_CREDIT_RETRY_MISMATCH');
      return existing;
    }
    await guardCurrent(tx, invoice);
    const order = invoice.orders.find((row: any) => row.id === body.invoiceOrderId);
    if (!order) fail('INVOICE_CREDIT_INVALID');
    const credited = invoice.credits.filter((row: any) => row.invoiceOrderId === order.id && !row.voidedAt)
      .reduce((sum: bigint, row: any) => sum + money4(row.amount), 0n);
    if (credited + money4(raw) > money4(order.receivableAdded)) fail('INVOICE_CREDIT_EXCEEDS_DEBT');
    const amount = decimal4(money4(raw));
    return tx.invoiceCredit.create({ data: { invoiceId, invoiceOrderId: order.id, clientKey: key,
      amount, reason, createdBy: actor, snapshot: { version: 1, invoiceNumber: invoice.invoiceNumber,
        sourceOrderId: order.sourceOrderId, sourceOrderNumber: order.sourceOrderNumber,
        currencyCode: invoice.currencyCode, amount, reason,
        seller: invoice.snapshot?.fields?.seller, buyer: invoice.snapshot?.fields?.buyer } } });
  });
}

export async function voidInvoiceCredit(db: any, sellerOrgId: number, actor: string, id: string, inputReason: unknown) {
  const reason = reasonText(inputReason);
  return retryEditTransaction(db, async (tx: any) => {
    const credit = await tx.invoiceCredit.findFirst({ where: { id, invoice: { sellerOrgId } }, include: { invoice: { include: { orders: true } } } });
    if (!credit) throw createHttpError(404, 'INVOICE_CREDIT_NOT_FOUND');
    if (credit.voidedAt) {
      if (credit.voidReason !== reason) fail('INVOICE_CREDIT_RETRY_MISMATCH');
      return credit;
    }
    await guardCurrent(tx, credit.invoice);
    return tx.invoiceCredit.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor, voidReason: reason } });
  });
}
