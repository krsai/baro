import { saveInvoiceDraft, deleteInvoiceDraft } from "../services/invoiceDraftStore";
import { issueInvoiceDraft } from "../services/invoiceIssueStore";

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
      include: { buyer: { select: { name: true } }, orders: { select: { sourceOrderId: true, sourceOrderNumber: true } } },
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ rows: rows.slice(0, 30).map((row: any) => ({ id: row.id, invoiceNumber: row.invoiceNumber,
      status: row.status, buyerName: row.buyer.name, currencyCode: row.currencyCode, total: String(row.total),
      issuedAt: row.issuedAt, issuedBy: row.issuedBy, orders: row.orders })), hasMore: rows.length > 30 });
  });
}
