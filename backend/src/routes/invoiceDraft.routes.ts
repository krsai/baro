import { saveInvoiceDraft, deleteInvoiceDraft } from "../services/invoiceDraftStore";
import { cancelIssuedInvoice, createInvoiceRevisionDraft, issueInvoiceDraft, recordInvoicePayment, replaceInvoicePaymentAllocations, voidInvoicePayment } from "../services/invoiceIssueStore";
import { approveInvoiceFinalLock, unlockInvoiceFinalLock, unlockInvoiceFinalLocksForInvoice } from "../services/invoiceFinalLock";

const invoiceMoney = (values: unknown[]) => {
  const total = values.reduce((sum: bigint, value) => {
    const [whole, fraction = ""] = String(value ?? "0").split(".");
    return sum + BigInt(whole || "0") * 10000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
  }, 0n);
  const text = total.toString().padStart(5, "0");
  return `${text.slice(0, -4)}.${text.slice(-4)}`;
};

export function registerInvoiceDraftRoutes(app: any, { db, requireAccess, actor }: any) {
  app.get("/invoices/drafts", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const page = Number(req.query.page ?? 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return res.status(400).json({ error: "invalid page" });
    const rows = await db.invoiceDraft.findMany({ where: { sellerOrgId: access.organization.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: page * 30, take: 31,
      include: { buyer: { select: { name: true } }, orders: { select: { sourceOrderId: true } } },
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ rows: rows.slice(0, 30).map((row: any) => ({ id: row.id, revision: row.revision,
      buyerName: row.buyer.name, number: row.content?.fields?.number ?? "", updatedAt: row.updatedAt,
      updatedBy: row.updatedBy, orderIds: row.orders.map((order: any) => order.sourceOrderId) })), hasMore: rows.length > 30 });
  });
  app.get("/invoices/drafts/:id", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await db.invoiceDraft.findFirst({ where: { id: req.params.id, sellerOrgId: access.organization.id } });
    if (!row) return res.status(404).json({ error: "INVOICE_DRAFT_NOT_FOUND" });
    res.setHeader("Cache-Control", "no-store"); return res.json(row);
  });
  for (const [method, path] of [["post", "/invoices/drafts"], ["put", "/invoices/drafts/:id"]]) {
    app[method!](path, async (req: any, res: any) => {
      const access = await requireAccess(req, res); if (!access) return;
      const row = await saveInvoiceDraft(db, access.organization.id, actor(req) || "unknown", req.body, req.params.id);
      res.setHeader("Cache-Control", "no-store"); return res.json(row);
    });
  }
  app.delete("/invoices/drafts/:id", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    await deleteInvoiceDraft(db, access.organization.id, req.params.id, req.body?.revision);
    return res.status(204).send();
  });
  app.post("/invoices/drafts/:id/issue", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await issueInvoiceDraft(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body?.revision);
    res.setHeader("Cache-Control", "no-store"); return res.status(201).json(row);
  });
  app.get("/invoices/issued", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const page = Number(req.query.page ?? 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return res.status(400).json({ error: "invalid page" });
    const rows = await db.invoice.findMany({ where: { sellerOrgId: access.organization.id },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }], skip: page * 30, take: 31,
      include: { buyer: { select: { name: true } }, orders: { select: { id: true, sourceOrderId: true, sourceOrderNumber: true, installmentNumber: true,
        workOrder: { select: { totalQuantity: true, invoiceFinalLockedAt: true, invoiceFinalLockInvoiceId: true, invoiceFinalRecognizedQuantity: true } } } },
        payments: { where: { voidedAt: null }, select: { amount: true, allocations: { where: { voidedAt: null }, select: { amount: true } } } } },
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ rows: rows.slice(0, 30).map((row: any) => ({ id: row.id, invoiceNumber: row.invoiceNumber,
      status: row.status, buyerName: row.buyer.name, currencyCode: row.currencyCode, total: String(row.total),
      receivableAdded: String(row.receivableAdded),
      issuedAt: row.issuedAt, issuedBy: row.issuedBy, orders: row.orders,
      revisionOfInvoiceId: row.revisionOfInvoiceId, revisionNumber: row.revisionNumber, revisionReason: row.revisionReason,
      isFinalLocked: row.orders.length > 0 && row.orders.every((order: any) => Boolean(order.workOrder?.invoiceFinalLockedAt)),
      receivedAmount: invoiceMoney(row.payments.map((payment: any) => payment.amount)),
      allocatedAmount: invoiceMoney(row.payments.flatMap((payment: any) => payment.allocations.map((allocation: any) => allocation.amount))) })), hasMore: rows.length > 30 });
  });
  app.get("/invoices/issued/:id", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await db.invoice.findFirst({ where: { id: req.params.id, sellerOrgId: access.organization.id },
      include: { orders: { include: { workOrder: { select: { invoiceFinalLockedAt: true, invoiceFinalLockedBy: true,
        invoiceFinalLockInvoiceId: true, invoiceFinalLockReason: true, invoiceFinalRecognizedQuantity: true } } } }, payments: { orderBy: [{ receivedAt: "asc" }, { id: "asc" }], include: {
        allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      } }, revisedFrom: { select: { id: true, invoiceNumber: true, revisionNumber: true } },
      revision: { select: { id: true, invoiceNumber: true, revisionNumber: true, status: true } },
      finalLockEvents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    if (!row) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    res.setHeader("Cache-Control", "no-store"); return res.json({ ...row, subtotal: String(row.subtotal), total: String(row.total) });
  });
  app.post("/invoices/issued/:id/cancel", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await cancelIssuedInvoice(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body?.reason);
    res.setHeader("Cache-Control", "no-store"); return res.json(row);
  });
  app.post("/invoices/issued/:id/payments", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await recordInvoicePayment(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.status(201).json(row);
  });
  app.post("/invoices/payments/:id/allocations", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const rows = await replaceInvoicePaymentAllocations(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.json({ rows });
  });
  app.post("/invoices/payments/:id/void", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await voidInvoicePayment(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body?.reason);
    res.setHeader("Cache-Control", "no-store"); return res.json(row);
  });
  app.post("/invoices/issued/:id/revision-draft", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await createInvoiceRevisionDraft(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.status(201).json(row);
  });
  app.post("/invoices/issued/:id/final-lock", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const rows = await approveInvoiceFinalLock(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.json({ rows });
  });
  app.post("/invoices/orders/:orderId/final-unlock", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const row = await unlockInvoiceFinalLock(db, access.organization.id, actor(req) || "unknown", req.params.orderId, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.json(row);
  });
  app.post("/invoices/issued/:id/final-unlock", async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const rows = await unlockInvoiceFinalLocksForInvoice(db, access.organization.id, actor(req) || "unknown", req.params.id, req.body);
    res.setHeader("Cache-Control", "no-store"); return res.json({ rows });
  });
}
