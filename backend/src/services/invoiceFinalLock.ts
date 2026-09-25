import { createHttpError } from "../utils/http";
import { editTransaction, STALE_EDIT } from "../utils/editRevision";

const fail = (code: string): never => { throw createHttpError(409, code); };
const clientKey = (value: unknown) => {
  const parsed = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(parsed)) fail("INVOICE_FINAL_LOCK_INVALID");
  return parsed;
};
const reason = (value: unknown) => {
  const parsed = String(value || "").trim();
  if (!parsed || parsed.length > 1000) fail("INVOICE_FINAL_LOCK_REASON_REQUIRED");
  return parsed;
};
const bypassTrigger = async (tx: any) => {
  if (typeof tx.$executeRawUnsafe === "function") await tx.$executeRawUnsafe("SET LOCAL baro.invoice_lock_bypass = 'on'");
};

export async function approveInvoiceFinalLock(db: any, sellerOrgId: number, actor: string, invoiceId: string, body: any) {
  const key = clientKey(body?.clientKey);
  if (!Array.isArray(body?.orders) || !body.orders.length) fail("INVOICE_FINAL_LOCK_INVALID");
  const approvals = body.orders.map((row: any) => ({ sourceOrderId: String(row?.sourceOrderId || "").trim(),
    recognizedQuantity: Number(row?.recognizedQuantity), reason: reason(row?.reason) }));
  if (approvals.some((row: any) => !row.sourceOrderId || !Number.isSafeInteger(row.recognizedQuantity) || row.recognizedQuantity < 0)
    || new Set(approvals.map((row: any) => row.sourceOrderId)).size !== approvals.length) fail("INVOICE_FINAL_LOCK_INVALID");
  return editTransaction(db, async (tx: any) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId }, include: { orders: true } });
    if (!invoice) throw createHttpError(404, "INVOICE_NOT_FOUND");
    if (invoice.status !== "ISSUED") fail("INVOICE_FINAL_LOCK_INVOICE_NOT_CURRENT");
    const invoiceOrderIds = invoice.orders.map((row: any) => row.sourceOrderId).sort();
    if (invoiceOrderIds.length !== approvals.length || approvals.map((row: any) => row.sourceOrderId).sort()
      .some((value: string, index: number) => value !== invoiceOrderIds[index])) fail("INVOICE_FINAL_LOCK_ORDER_SCOPE");
    const retried = await tx.invoiceFinalLockEvent.findMany({ where: { workOrder: { sellerOrgId }, clientKey: key }, orderBy: { workOrderId: "asc" } });
    if (retried.length) {
      if (retried.length !== approvals.length || retried.some((event: any) => event.action !== "LOCK" || event.invoiceId !== invoice.id)) {
        fail("INVOICE_FINAL_LOCK_RETRY_MISMATCH");
      }
      return retried;
    }
    const later = await tx.invoiceOrder.findFirst({ where: { sourceOrderId: { in: invoiceOrderIds },
      invoice: { sellerOrgId, status: "ISSUED", sequenceNumber: { gt: invoice.sequenceNumber } } } });
    if (later) fail("INVOICE_FINAL_LOCK_LATEST_INVOICE_REQUIRED");
    const orders = await tx.workOrder.findMany({ where: { sellerOrgId, orderId: { in: invoiceOrderIds } } });
    if (orders.length !== invoiceOrderIds.length) fail("INVOICE_FINAL_LOCK_SOURCE_CHANGED");
    if (orders.some((order: any) => order.invoiceFinalLockedAt)) fail("INVOICE_FINAL_LOCK_ALREADY_LOCKED");
    await bypassTrigger(tx);
    const now = new Date();
    for (const order of orders) {
      const approval = approvals.find((row: any) => row.sourceOrderId === order.orderId)!;
      const updated = await tx.workOrder.updateMany({ where: { id: order.id, sellerOrgId, invoiceFinalLockedAt: null }, data: {
        invoiceFinalLockedAt: now, invoiceFinalLockedBy: actor, invoiceFinalLockInvoiceId: invoice.id,
        invoiceFinalLockReason: approval.reason, invoiceFinalRecognizedQuantity: approval.recognizedQuantity,
      } });
      if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
      await tx.invoiceFinalLockEvent.create({ data: { sellerOrgId, workOrderId: order.id, invoiceId: invoice.id,
        clientKey: key, action: "LOCK", recognizedQuantity: approval.recognizedQuantity, reason: approval.reason, actor } });
    }
    return tx.invoiceFinalLockEvent.findMany({ where: { workOrder: { sellerOrgId }, clientKey: key }, orderBy: { workOrderId: "asc" } });
  });
}

export async function unlockInvoiceFinalLock(db: any, sellerOrgId: number, actor: string, sourceOrderId: string, body: any) {
  const key = clientKey(body?.clientKey), unlockReason = reason(body?.reason);
  return editTransaction(db, async (tx: any) => {
    const order = await tx.workOrder.findFirst({ where: { sellerOrgId, orderId: sourceOrderId } });
    if (!order) throw createHttpError(404, "ORDER_NOT_FOUND");
    const retried = await tx.invoiceFinalLockEvent.findFirst({ where: { workOrderId: order.id, clientKey: key } });
    if (retried) {
      if (retried.action !== "UNLOCK") fail("INVOICE_FINAL_LOCK_RETRY_MISMATCH");
      return retried;
    }
    if (!order.invoiceFinalLockedAt || !order.invoiceFinalLockInvoiceId) fail("INVOICE_FINAL_LOCK_NOT_LOCKED");
    await bypassTrigger(tx);
    const updated = await tx.workOrder.updateMany({ where: { id: order.id, sellerOrgId,
      invoiceFinalLockedAt: order.invoiceFinalLockedAt, invoiceFinalLockInvoiceId: order.invoiceFinalLockInvoiceId }, data: {
        invoiceFinalLockedAt: null, invoiceFinalLockedBy: null, invoiceFinalLockInvoiceId: null,
        invoiceFinalLockReason: "", invoiceFinalRecognizedQuantity: null,
      } });
    if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
    return tx.invoiceFinalLockEvent.create({ data: { sellerOrgId, workOrderId: order.id,
      invoiceId: order.invoiceFinalLockInvoiceId, clientKey: key, action: "UNLOCK",
      recognizedQuantity: order.invoiceFinalRecognizedQuantity, reason: unlockReason, actor } });
  });
}

export async function unlockInvoiceFinalLocksForInvoice(db: any, sellerOrgId: number, actor: string, invoiceId: string, body: any) {
  const key = clientKey(body?.clientKey), unlockReason = reason(body?.reason);
  return editTransaction(db, async (tx: any) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId } });
    if (!invoice) throw createHttpError(404, "INVOICE_NOT_FOUND");
    const retried = await tx.invoiceFinalLockEvent.findMany({ where: { invoiceId, clientKey: key }, orderBy: { workOrderId: "asc" } });
    if (retried.length) {
      if (retried.some((event: any) => event.action !== "UNLOCK")) fail("INVOICE_FINAL_LOCK_RETRY_MISMATCH");
      return retried;
    }
    const orders = await tx.workOrder.findMany({ where: { sellerOrgId, invoiceFinalLockInvoiceId: invoiceId,
      invoiceFinalLockedAt: { not: null } } });
    if (!orders.length) fail("INVOICE_FINAL_LOCK_NOT_LOCKED");
    await bypassTrigger(tx);
    for (const order of orders) {
      const updated = await tx.workOrder.updateMany({ where: { id: order.id, sellerOrgId,
        invoiceFinalLockedAt: order.invoiceFinalLockedAt, invoiceFinalLockInvoiceId: invoiceId }, data: {
          invoiceFinalLockedAt: null, invoiceFinalLockedBy: null, invoiceFinalLockInvoiceId: null,
          invoiceFinalLockReason: "", invoiceFinalRecognizedQuantity: null,
        } });
      if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
      await tx.invoiceFinalLockEvent.create({ data: { sellerOrgId, workOrderId: order.id, invoiceId,
        clientKey: key, action: "UNLOCK", recognizedQuantity: order.invoiceFinalRecognizedQuantity,
        reason: unlockReason, actor } });
    }
    return tx.invoiceFinalLockEvent.findMany({ where: { invoiceId, clientKey: key }, orderBy: { workOrderId: "asc" } });
  });
}

export async function rebaseInvoiceFinalLocks(tx: any, sellerOrgId: number, actor: string, fromInvoiceId: string, toInvoiceId: string) {
  const orders = await tx.workOrder.findMany({ where: { sellerOrgId, invoiceFinalLockInvoiceId: fromInvoiceId } });
  if (!orders.length) return;
  await bypassTrigger(tx);
  for (const order of orders) {
    const updated = await tx.workOrder.updateMany({ where: { id: order.id, sellerOrgId, invoiceFinalLockInvoiceId: fromInvoiceId },
      data: { invoiceFinalLockInvoiceId: toInvoiceId } });
    if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
    await tx.invoiceFinalLockEvent.create({ data: { sellerOrgId, workOrderId: order.id, invoiceId: toInvoiceId,
      clientKey: `revision-${toInvoiceId}`, action: "REBASE", recognizedQuantity: order.invoiceFinalRecognizedQuantity,
      reason: "Invoice revision preserved final settlement lock", actor } });
  }
}
