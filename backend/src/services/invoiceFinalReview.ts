import { buildInvoiceSource } from './invoiceSource';
import { createHttpError } from '../utils/http';
import { editRevision } from '../utils/editRevision';

export async function invoiceFinalReview(db: any, sellerOrgId: number, invoiceId: string) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, sellerOrgId }, include: { orders: true } });
  if (!invoice || invoice.status !== 'ISSUED') throw createHttpError(409, 'INVOICE_FINAL_LOCK_INVOICE_NOT_CURRENT');
  const orderIds = invoice.orders.map((row: any) => row.sourceOrderId);
  const orders = await db.workOrder.findMany({ where: { sellerOrgId, orderId: { in: orderIds } },
    include: { workOrderItems: { include: { style: true, color: true } } }, orderBy: { id: 'asc' } });
  if (orders.length !== orderIds.length) throw createHttpError(409, 'INVOICE_FINAL_LOCK_SOURCE_CHANGED');
  const issuedLines = await db.invoiceLine.findMany({ where: {
    invoice: { sellerOrgId, status: 'ISSUED' }, invoiceOrder: { sourceOrderId: { in: orderIds } },
  }, include: { invoiceOrder: { select: { sourceOrderId: true } } }, orderBy: { id: 'asc' } });
  const reviews = orders.map((order: any) => {
    const map = new Map<string, any>();
    for (const line of buildInvoiceSource(order, [], [], null).lines) {
      const key = JSON.stringify([order.orderId, line.key]);
      map.set(key, { key, style: line.description || line.styleCode, color: line.color, gender: line.gender, size: line.size,
        orderedQuantity: line.orderedQuantity, invoicedQuantity: 0, currentInvoiceQuantity: 0 });
    }
    for (const line of issuedLines.filter((row: any) => row.invoiceOrder.sourceOrderId === order.orderId)) {
      const row = map.get(line.lineKey) || { key: line.lineKey, style: line.styleName || line.styleCode,
        color: line.color, gender: line.gender, size: line.size, orderedQuantity: 0, invoicedQuantity: 0, currentInvoiceQuantity: 0 };
      row.invoicedQuantity += line.quantity;
      if (line.invoiceId === invoiceId) row.currentInvoiceQuantity += line.quantity;
      map.set(line.lineKey, row);
    }
    return { sourceOrderId: order.orderId, orderNumber: order.orderNumber,
      lines: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(row => ({ ...row, difference: row.invoicedQuantity - row.orderedQuantity })) };
  });
  return { revision: editRevision(reviews), orders: reviews };
}

export function validateFinalLines(review: any, approval: any) {
  const input = approval.lines;
  if (!Array.isArray(input) || input.length !== review.lines.length
    || input.some(row => !row || typeof row !== 'object' || typeof row.key !== 'string')
    || new Set(input.map(row => row.key)).size !== input.length) {
    throw createHttpError(409, 'INVOICE_FINAL_LOCK_LINE_REVIEW_REQUIRED');
  }
  const lines = review.lines.map((line: any) => {
    const value = input.find(row => row.key === line.key);
    if (!value || !Number.isSafeInteger(value.recognizedQuantity) || value.recognizedQuantity < 0 || value.recognizedQuantity > 2147483647) {
      throw createHttpError(409, 'INVOICE_FINAL_LOCK_INVALID');
    }
    const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
    if (reason.length > 1000 || ((line.difference !== 0 || value.recognizedQuantity !== line.orderedQuantity) && !reason)) {
      throw createHttpError(409, 'INVOICE_FINAL_LOCK_LINE_REASON_REQUIRED');
    }
    return { ...line, recognizedQuantity: value.recognizedQuantity, reason };
  });
  if (lines.reduce((sum: number, line: any) => sum + line.recognizedQuantity, 0) !== approval.recognizedQuantity) {
    throw createHttpError(409, 'INVOICE_FINAL_LOCK_QUANTITY_MISMATCH');
  }
  return lines;
}
