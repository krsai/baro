import { saveInvoiceDraft, deleteInvoiceDraft } from "../services/invoiceDraftStore";
import { cancelIssuedInvoice, createInvoiceRevisionDraft, issueInvoiceDraft, recordInvoicePayment, replaceInvoicePaymentAllocations, voidInvoicePayment } from "../services/invoiceIssueStore";
import { approveInvoiceFinalLock, unlockInvoiceFinalLock, unlockInvoiceFinalLocksForInvoice } from "../services/invoiceFinalLock";
import { invoiceFinalReview } from '../services/invoiceFinalReview';
import { invoiceFamily, invoiceFamilyBalance } from '../services/invoiceSettlement';

const invoicePaymentMoney = (payments: any[], values: (payment: any) => unknown[]) => {
  const total = payments.reduce((sum: bigint, payment: any) => {
    const minor = values(payment).reduce((subtotal: bigint, value: unknown) => {
      const [whole, fraction = ""] = String(value ?? "0").split(".");
      return subtotal + BigInt(whole || "0") * 10000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
    }, 0n);
    return sum + (payment.kind === "REFUND" ? -minor : minor);
  }, 0n);
  const negative = total < 0n, absolute = negative ? -total : total;
  const text = absolute.toString().padStart(5, "0");
  return `${negative ? "-" : ""}${text.slice(0, -4)}.${text.slice(-4)}`;
};

export function registerInvoiceDraftRoutes(app: any, { db, requireAccess, actor }: any) {
  app.get('/invoices/issued/:id/final-review', async (req: any, res: any) => {
    const access = await requireAccess(req, res); if (!access) return;
    const review = await invoiceFinalReview(db, access.organization.id, req.params.id);
    res.setHeader('Cache-Control', 'no-store'); return res.json(review);
  });
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
        payments: { where: { voidedAt: null }, select: { amount: true, kind: true,
          allocations: { where: { voidedAt: null }, select: { amount: true } } } } },
    });
    const visible = rows.slice(0, 30);
    const familyIds = [...new Set(visible.map((row: any) => invoiceFamily(row)))];
    const familyInvoices = familyIds.length ? await db.invoice.findMany({ where: { sellerOrgId: access.organization.id,
      OR: [{ id: { in: familyIds } }, { rootInvoiceId: { in: familyIds } }] },
      select: { id: true, rootInvoiceId: true, status: true, receivableAdded: true,
        payments: { select: { amount: true, kind: true, voidedAt: true } } } }) : [];
    res.setHeader("Cache-Control", "no-store");
    return res.json({ rows: visible.map((row: any) => { const familyBalance = invoiceFamilyBalance(familyInvoices, invoiceFamily(row)); return ({ id: row.id, invoiceNumber: row.invoiceNumber,
      status: row.status, buyerName: (row.snapshot as any)?.fields?.buyer?.name ?? row.buyer.name, currencyCode: row.currencyCode, total: String(row.total),
      receivableAdded: String(row.receivableAdded),
      issuedAt: row.issuedAt, issuedBy: row.issuedBy, orders: row.orders,
      revisionOfInvoiceId: row.revisionOfInvoiceId, revisionNumber: row.revisionNumber, revisionReason: row.revisionReason,
      // A partially unlocked document must still offer Unlock for its remaining
      // locks. Locks belonging to a later invoice are not this document's locks.
      isFinalLocked: row.orders.some((order: any) => Boolean(order.workOrder?.invoiceFinalLockedAt)
        && order.workOrder.invoiceFinalLockInvoiceId === row.id),
      receivedAmount: familyBalance.receivedAmount, familyDebtAmount: familyBalance.debtAmount,
      familyBalanceAmount: familyBalance.balanceAmount, familyBalanceKind: familyBalance.balanceKind,
      isCurrentRevision: familyBalance.currentInvoiceId === row.id,
      directReceivedAmount: invoicePaymentMoney(row.payments, payment => [payment.amount]),
      allocatedAmount: invoicePaymentMoney(row.payments, payment => payment.allocations.map((allocation: any) => allocation.amount)) }); }), hasMore: rows.length > 30 });
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
