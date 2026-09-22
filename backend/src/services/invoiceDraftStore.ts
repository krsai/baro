import { createHttpError } from "../utils/http";
import { editTransaction, STALE_EDIT } from "../utils/editRevision";
import { buildInvoiceSource } from "./invoiceSource";
import { isDeepStrictEqual } from "node:util";

const bad = (): never => { throw createHttpError(400, "INVOICE_DRAFT_INVALID"); };
const text = (value: unknown, max = 1000): string => {
  if (typeof value !== "string" || value.length > max) return bad();
  return value;
};
const object = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  return value;
};
const pickText = (value: any, keys: string[], max = 1000) => {
  object(value);
  return Object.fromEntries(keys.map(key => [key, text(value[key] ?? "", max)]));
};
export const normalizeInvoiceDraftContent = (body: any) => {
  object(body);
  if (!Number.isSafeInteger(body.buyerOrgId) || body.buyerOrgId <= 0) return bad();
  if (!Array.isArray(body.orders) || !body.orders.length || body.orders.length > 100) return bad();
  const orders = body.orders.map((row: any) => {
    object(row);
    const orderId = text(row.orderId, 200), sourceUpdatedAt = text(row.sourceUpdatedAt, 40);
    if (!orderId || !Number.isFinite(Date.parse(sourceUpdatedAt))) return bad();
    return { orderId, sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString() };
  });
  if (new Set(orders.map((row: any) => row.orderId)).size !== orders.length) return bad();
  if (!["MANUFACTURING_SERVICE_PRICE", "FINISHED_GOODS_PRICE"].includes(body.basis)) return bad();
  const currency = text(body.currency, 3);
  if (currency && !/^[A-Z]{3}$/.test(currency)) return bad();
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 5000) return bad();
  // Incomplete numeric inputs may be saved, but are never issued or totaled here.
  const lines = body.lines.map((row: any) => ({
    ...pickText(row, ["key", "remark", "adjustmentReason", "hsCode", "origin"]),
    quantity: text(row.quantity, 32),
  }));
  if (new Set(lines.map((row: any) => row.key)).size !== lines.length) return bad();
  const fields = { ...pickText(body.fields, ["number", "date", "shipTo", "shipmentDate", "dueDate", "incoterm", "paymentTerms", "bank", "notes"], 5000),
    seller: pickText(body.fields.seller, ["name", "address", "country", "taxId", "email", "phone"]),
    buyer: pickText(body.fields.buyer, ["name", "address", "country", "taxId", "email", "phone"]),
  };
  object(body.percentages);
  const percentages = Object.fromEntries(orders.map((row: any) => [row.orderId, text(body.percentages[row.orderId] ?? "", 32)]));
  return { version: 1, buyerOrgId: body.buyerOrgId, orders, basis: body.basis, currency, fields, percentages, lines };
};

export async function saveInvoiceDraft(db: any, sellerOrgId: number, actor: string, body: any, id?: string) {
  const content = normalizeInvoiceDraftContent(body);
  const clientKey = text(body.clientKey, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(clientKey)) return bad();
  if (id && (!Number.isSafeInteger(body.revision) || body.revision < 1)) return bad();
  return editTransaction(db, async (tx: any) => {
    const existing = await tx.invoiceDraft.findFirst({ where: id ? { id, sellerOrgId } : { sellerOrgId, clientKey } });
    if (id && !existing) throw createHttpError(404, "INVOICE_DRAFT_NOT_FOUND");
    if (existing) {
      if (!id && isDeepStrictEqual(normalizeInvoiceDraftContent(existing.content), content)) return existing;
      if (!id || existing.revision !== body.revision || existing.clientKey !== clientKey) throw createHttpError(409, STALE_EDIT);
    }
    const rows = await tx.workOrder.findMany({
      where: { sellerOrgId, buyerOrgId: content.buyerOrgId, orderId: { in: content.orders.map((row: any) => row.orderId) } },
      include: { workOrderItems: { include: { style: true, color: true } } },
    });
    const orderLinks: any[] = [], expectedLines = new Map<string, number>(), labels = new Map<string, string>();
    for (const requested of content.orders) {
      const matches = rows.filter((row: any) => row.orderId === requested.orderId);
      if (matches.length !== 1) throw createHttpError(409, "INVOICE_SOURCE_CHANGED");
      const row = matches[0];
      if (row.updatedAt.toISOString() !== requested.sourceUpdatedAt) throw createHttpError(409, "INVOICE_SOURCE_CHANGED");
      orderLinks.push({ workOrderId: row.id, sourceOrderId: row.orderId, sourceUpdatedAt: row.updatedAt });
      for (const line of buildInvoiceSource(row, [], [], null).lines) {
        expectedLines.set(JSON.stringify([row.orderId, line.key]), line.itemId);
        labels.set(JSON.stringify([row.orderId, line.key]), [row.orderNumber, line.styleCode, line.description,
          line.color, line.gender, line.size].filter(Boolean).join(" / "));
      }
    }
    if (content.lines.length !== expectedLines.size || content.lines.some((line: any) => !expectedLines.has(line.key))) {
      throw createHttpError(409, "INVOICE_SOURCE_CHANGED");
    }
    const lineLinks = content.lines.map((line: any) => ({ lineKey: line.key,
      workOrderItemId: expectedLines.get(line.key), sourceItemId: expectedLines.get(line.key) }));
    content.lines.forEach((line: any) => { line.label = labels.get(line.key); });
    if (!id) return tx.invoiceDraft.create({ data: {
      sellerOrgId, buyerOrgId: content.buyerOrgId, clientKey, content, createdBy: actor, updatedBy: actor,
      orders: { create: orderLinks }, lines: { create: lineLinks },
    } });
    const updated = await tx.invoiceDraft.updateMany({ where: { id, sellerOrgId, revision: body.revision },
      data: { content, buyerOrgId: content.buyerOrgId, updatedBy: actor, revision: { increment: 1 } } });
    if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
    await tx.invoiceDraftOrder.deleteMany({ where: { draftId: id } });
    await tx.invoiceDraftLine.deleteMany({ where: { draftId: id } });
    await tx.invoiceDraftOrder.createMany({ data: orderLinks.map(row => ({ ...row, draftId: id })) });
    await tx.invoiceDraftLine.createMany({ data: lineLinks.map((row: any) => ({ ...row, draftId: id })) });
    return tx.invoiceDraft.findFirst({ where: { id, sellerOrgId } });
  });
}

export async function deleteInvoiceDraft(db: any, sellerOrgId: number, id: string, revision: unknown) {
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) return bad();
  return editTransaction(db, async (tx: any) => {
    const result = await tx.invoiceDraft.deleteMany({ where: { id, sellerOrgId, revision } });
    if (result.count !== 1) throw createHttpError(409, STALE_EDIT);
  });
}
