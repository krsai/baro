import { createHttpError } from "../utils/http";
import { editTransaction, STALE_EDIT } from "../utils/editRevision";
import { buildInvoiceSource } from "./invoiceSource";

const fail = (code: string): never => { throw createHttpError(409, code); };
const parseQuantity = (value: unknown) => {
  if (!/^\d+$/.test(String(value ?? ""))) fail("INVOICE_ISSUE_INVALID_QUANTITY");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity > 2147483647) fail("INVOICE_ISSUE_INVALID_QUANTITY");
  return quantity;
};
const parsePriceMinor = (value: unknown) => {
  if (!/^\d+(\.\d{1,4})?$/.test(String(value ?? ""))) return null;
  const [whole, fraction = ""] = String(value).split(".");
  const minor = BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
  return minor > 0n ? minor : null;
};
const parseMoneyScale4 = (value: unknown) => {
  if (!/^\d+(\.\d{1,4})?$/.test(String(value ?? ""))) return null;
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
};
const scale4Decimal = (value: bigint) => { const text = value.toString().padStart(5, "0"); return `${text.slice(0, -4)}.${text.slice(-4)}`; };
const currencyDigits = (currencyCode: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { fail("INVOICE_ISSUE_INVALID_CURRENCY"); }
  return 2;
};
const decimal = (minor: bigint, digits: number) => {
  const padded = minor.toString().padStart(digits + 1, "0");
  return digits ? `${padded.slice(0, -digits)}.${padded.slice(-digits)}` : padded;
};
const percentage = (value: unknown) => {
  const raw = String(value ?? "").trim() || "100";
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 100) fail("INVOICE_ISSUE_INVALID_PERCENTAGE");
  const [whole, fraction = ""] = raw.split(".");
  return { raw, basisPoints: BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0")) };
};

export const calculateInvoiceIssueSnapshot = (content: any, sources: any[], settlementContext: Record<string, any> = {}) => {
  const digits = currencyDigits(content.currency);
  const sourceLines = new Map<string, any>();
  const sourceStyles = new Map<string, any>();
  const sourceOrders = new Map<string, any>();
  for (const source of sources) {
    sourceOrders.set(source.orderId, source);
    for (const style of source.styles) sourceStyles.set(JSON.stringify([source.orderId, style.styleId]), style);
    for (const line of source.lines) sourceLines.set(JSON.stringify([source.orderId, line.key]), { ...line, orderId: source.orderId });
  }
  if (content.lines.length !== sourceLines.size) fail("INVOICE_SOURCE_CHANGED");
  const quantities = new Map<string, number>();
  for (const input of content.lines) {
    const source = sourceLines.get(input.key);
    if (!source) fail("INVOICE_SOURCE_CHANGED");
    const quantity = parseQuantity(input.quantity);
    if (quantity !== source.orderedQuantity && !String(input.adjustmentReason || "").trim()) fail("INVOICE_ISSUE_ADJUSTMENT_REASON_REQUIRED");
    const styleKey = JSON.stringify([source.orderId, source.styleId]);
    quantities.set(styleKey, (quantities.get(styleKey) || 0) + quantity);
  }
  const orderMinor = new Map<string, bigint>();
  const divisor = 10n ** BigInt(4 - Math.min(4, digits));
  const lines = content.lines.map((input: any) => {
    const source = sourceLines.get(input.key)!;
    const quantity = parseQuantity(input.quantity);
    const styleKey = JSON.stringify([source.orderId, source.styleId]);
    const style = sourceStyles.get(styleKey);
    const list = style?.prices?.find((row: any) => row.pricingBasis === content.basis && row.currencyCode === content.currency);
    const entries = [...(list?.entries || [])].sort((a: any, b: any) => a.quantity - b.quantity);
    const styleQuantity = quantities.get(styleKey) || 0;
    const entry = entries.filter((row: any) => row.quantity <= styleQuantity).at(-1) || entries[0];
    const priceMinor = parsePriceMinor(entry?.unitPrice);
    if (quantity > 0 && priceMinor == null) fail("INVOICE_ISSUE_PRICE_MISSING");
    const amountMinor = priceMinor == null ? 0n : (priceMinor * BigInt(quantity) + divisor / 2n) / divisor;
    orderMinor.set(source.orderId, (orderMinor.get(source.orderId) || 0n) + amountMinor);
    return { orderId: source.orderId, workOrderItemId: source.itemId, sourceItemId: source.itemId,
      lineKey: input.key, styleId: source.styleId ?? null, styleCode: source.styleCode || "",
      styleName: source.description || "", description: source.description || "", color: source.color || "",
      gender: source.gender || "", size: source.size || "", quantity, bucketQuantity: entry?.quantity ?? 0,
      unitPrice: entry?.unitPrice ?? "0", amount: decimal(amountMinor, digits), priceId: entry?.priceId ?? null,
      bucketVersionId: list?.versionId ?? null, remark: input.remark || "", adjustmentReason: input.adjustmentReason || "",
      hsCode: input.hsCode || "", origin: input.origin || "" };
  });
  if (!lines.some((line: any) => line.quantity > 0)) fail("INVOICE_ISSUE_EMPTY");
  let totalMinor = 0n;
  let receivableAddedMinor = 0n;
  const orders = content.orders.map((input: any) => {
    const source = sourceOrders.get(input.orderId); if (!source) fail("INVOICE_SOURCE_CHANGED");
    const percent = percentage(content.percentages?.[input.orderId]);
    const basisMinor = orderMinor.get(input.orderId) || 0n;
    const billedMinor = (basisMinor * percent.basisPoints + 5000n) / 10000n;
    const context = settlementContext[input.orderId] || {};
    const defaultScale4 = parseMoneyScale4(context.defaultDeductionAmount) ?? 0n;
    const defaultMinor = (defaultScale4 + divisor / 2n) / divisor;
    const deductionText = String(content.settlements?.[input.orderId]?.deduction ?? "").trim();
    const appliedScale4 = deductionText ? parseMoneyScale4(deductionText) : defaultScale4;
    if (appliedScale4 === null) throw createHttpError(409, "INVOICE_ISSUE_INVALID_DEDUCTION");
    const appliedMinor = (appliedScale4 + divisor / 2n) / divisor;
    const deductionReason = String(content.settlements?.[input.orderId]?.reason || "").trim();
    if (appliedMinor !== defaultMinor && !deductionReason) fail("INVOICE_ISSUE_DEDUCTION_REASON_REQUIRED");
    if (appliedMinor > billedMinor) fail("INVOICE_ISSUE_EXCESS_DEDUCTION_REVIEW");
    const netMinor = billedMinor - appliedMinor;
    const priorBilledMinor = ((parseMoneyScale4(context.priorBilledAmount) ?? 0n) + divisor / 2n) / divisor;
    const priorReceivedMinor = ((parseMoneyScale4(context.priorReceivedAmount) ?? 0n) + divisor / 2n) / divisor;
    const priorOutstandingMinor = priorBilledMinor > priorReceivedMinor ? priorBilledMinor - priorReceivedMinor : 0n;
    const newReceivableMinor = netMinor > priorOutstandingMinor ? netMinor - priorOutstandingMinor : 0n;
    totalMinor += netMinor;
    receivableAddedMinor += newReceivableMinor;
    return { workOrderId: source.workOrderId, sourceOrderId: source.orderId, sourceOrderNumber: source.orderNumber,
      sourceUpdatedAt: source.sourceUpdatedAt, billingPercentage: percent.raw,
      basisAmount: decimal(basisMinor, digits), billedAmount: decimal(billedMinor, digits),
      priorBilledAmount: String(context.priorBilledAmount || "0"), priorReceivedAmount: String(context.priorReceivedAmount || "0"),
      defaultDeductionAmount: decimal(defaultMinor, digits), appliedDeductionAmount: decimal(appliedMinor, digits),
      deductionReason, netAmount: decimal(netMinor, digits), priorOutstandingAmount: decimal(priorOutstandingMinor, digits),
      receivableAdded: decimal(newReceivableMinor, digits) };
  });
  const subtotalMinor = [...orderMinor.values()].reduce((sum, value) => sum + value, 0n);
  return { pricingBasis: content.basis, currencyCode: content.currency, subtotal: decimal(subtotalMinor, digits),
    total: decimal(totalMinor, digits), receivableAdded: decimal(receivableAddedMinor, digits), orders, lines, snapshot: { version: 2, fields: content.fields,
      pricingBasis: content.basis, currencyCode: content.currency, subtotal: decimal(subtotalMinor, digits),
      total: decimal(totalMinor, digits), receivableAdded: decimal(receivableAddedMinor, digits), orders, lines } };
};

export async function issueInvoiceDraft(db: any, sellerOrgId: number, actor: string, draftId: string, revision: unknown) {
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) fail("INVOICE_ISSUE_INVALID_REVISION");
  return editTransaction(db, async (tx: any) => {
    const draft = await tx.invoiceDraft.findFirst({ where: { id: draftId, sellerOrgId }, include: { orders: true, lines: true } });
    if (!draft) throw createHttpError(404, "INVOICE_DRAFT_NOT_FOUND");
    const issueKey = `${draft.id}:${revision}`;
    const existing = await tx.invoice.findFirst({ where: { sellerOrgId, clientKey: issueKey } });
    if (existing) return existing;
    if (draft.revision !== revision) throw createHttpError(409, STALE_EDIT);
    const content: any = draft.content;
    const revisionReason = String(draft.revisionReason || "").trim();
    const revisedFrom = draft.revisionOfInvoiceId ? await tx.invoice.findFirst({
      where: { id: draft.revisionOfInvoiceId, sellerOrgId }, include: { orders: true },
    }) : null;
    if (draft.revisionOfInvoiceId && (!revisedFrom || revisedFrom.status !== "ISSUED" || !revisionReason)) {
      fail("INVOICE_REVISION_SOURCE_INVALID");
    }
    const invoiceNumber = String(content.fields?.number || "").trim();
    if (!invoiceNumber || invoiceNumber.length > 200 || !Number.isFinite(Date.parse(content.fields?.date || ""))) fail("INVOICE_ISSUE_DOCUMENT_FIELDS_REQUIRED");
    const orders = await tx.workOrder.findMany({ where: { sellerOrgId, buyerOrgId: draft.buyerOrgId,
      orderId: { in: content.orders.map((row: any) => row.orderId) } },
      include: { workOrderItems: { include: { style: true, color: true } }, buyerOrg: true, sellerOrg: true } });
    if (orders.length !== content.orders.length) fail("INVOICE_SOURCE_CHANGED");
    for (const requested of content.orders) {
      const row = orders.find((order: any) => order.orderId === requested.orderId);
      if (!row || row.updatedAt.toISOString() !== requested.sourceUpdatedAt) fail("INVOICE_SOURCE_CHANGED");
    }
    const styleIds = [...new Set(orders.flatMap((order: any) => order.workOrderItems.map((item: any) => item.styleId).filter(Boolean)))];
    const relationship = await tx.orgRelationship.findFirst({ where: { manufacturerOrgId: sellerOrgId, brandOrgId: draft.buyerOrgId },
      include: { salesBucketSetVersion: { include: { entries: true } },
        salesBucketOverrides: { include: { quantityBucketSetVersion: { include: { entries: true } } } },
        salesPriceLists: { where: { styleId: { in: styleIds } }, include: { currency: true, prices: true } } } });
    const sources = orders.map((order: any) => ({ ...buildInvoiceSource(order, [], [], relationship), workOrderId: order.id }));
    const settlementContext: Record<string, any> = {};
    for (const source of sources) {
      const previous = await tx.invoiceOrder.findMany({ where: { sourceOrderId: source.orderId,
        invoice: { sellerOrgId, status: { in: ["ISSUED", "SUPERSEDED"] }, currencyCode: content.currency } },
        include: { invoice: { include: { payments: { where: { voidedAt: null }, include: {
          allocations: { where: { voidedAt: null }, select: { invoiceOrderId: true, amount: true } },
        } }, orders: { select: { id: true } } } } } });
      const priorBilled = previous.reduce((sum: bigint, row: any) => row.invoice.status === "ISSUED" && row.invoice.id !== revisedFrom?.id
        ? sum + (parseMoneyScale4(row.receivableAdded ?? row.netAmount ?? row.billedAmount) ?? 0n) : sum, 0n);
      const priorReceived = previous.reduce((sum: bigint, row: any) => sum + row.invoice.payments.reduce((paymentSum: bigint, payment: any) => {
        if (row.invoice.orders.length === 1) return paymentSum + (parseMoneyScale4(payment.amount) ?? 0n);
        return paymentSum + payment.allocations.filter((allocation: any) => allocation.invoiceOrderId === row.id)
          .reduce((allocationSum: bigint, allocation: any) => allocationSum + (parseMoneyScale4(allocation.amount) ?? 0n), 0n);
      }, 0n), 0n);
      settlementContext[source.orderId] = { priorBilledAmount: scale4Decimal(priorBilled), priorReceivedAmount: scale4Decimal(priorReceived),
        defaultDeductionAmount: scale4Decimal(priorReceived > 0n ? priorReceived : priorBilled), hasUnallocatedPayments: previous.some((row: any) =>
          row.invoice.orders.length > 1 && row.invoice.payments.some((payment: any) => payment.allocations.length === 0)) };
    }
    const calculated = calculateInvoiceIssueSnapshot(content, sources, settlementContext);
    for (const order of calculated.orders) {
      const revisedOrder = revisedFrom?.orders.find((row: any) => row.sourceOrderId === order.sourceOrderId);
      const prior = revisedOrder ? null : await tx.invoiceOrder.findFirst({ where: { sourceOrderId: order.sourceOrderId,
        invoice: { sellerOrgId } }, orderBy: { installmentNumber: "desc" }, select: { installmentNumber: true } });
      (order as any).installmentNumber = revisedOrder?.installmentNumber ?? ((prior?.installmentNumber || 0) + 1);
    }
    calculated.snapshot.orders = calculated.orders;
    const latest = await tx.invoice.findFirst({ where: { sellerOrgId }, orderBy: { sequenceNumber: "desc" }, select: { sequenceNumber: true } });
    const invoice = await tx.invoice.create({ data: { sellerOrgId, buyerOrgId: draft.buyerOrgId, invoiceNumber,
      clientKey: issueKey, sequenceNumber: (latest?.sequenceNumber || 0) + 1, pricingBasis: calculated.pricingBasis,
      currencyCode: calculated.currencyCode, subtotal: calculated.subtotal, total: calculated.total, receivableAdded: calculated.receivableAdded,
      snapshot: calculated.snapshot, issuedBy: actor, revisionOfInvoiceId: revisedFrom?.id ?? null,
      rootInvoiceId: revisedFrom ? (revisedFrom.rootInvoiceId || revisedFrom.id) : null,
      revisionNumber: revisedFrom ? revisedFrom.revisionNumber + 1 : 1, revisionReason } });
    for (const order of calculated.orders) {
      const orderRow = await tx.invoiceOrder.create({ data: { invoiceId: invoice.id, ...order } });
      const related = calculated.lines.filter((line: any) => line.orderId === order.sourceOrderId);
      if (related.length) await tx.invoiceLine.createMany({ data: related.map(({ orderId: _orderId, ...line }: any) => ({
        ...line, invoiceId: invoice.id, invoiceOrderId: orderRow.id,
      })) });
    }
    if (revisedFrom) {
      const superseded = await tx.invoice.updateMany({ where: { id: revisedFrom.id, sellerOrgId, status: "ISSUED" },
        data: { status: "SUPERSEDED" } });
      if (superseded.count !== 1) throw createHttpError(409, STALE_EDIT);
    }
    return invoice;
  });
}

export async function cancelIssuedInvoice(db: any, sellerOrgId: number, actor: string, invoiceId: string, reason: unknown) {
  const cancellationReason = String(reason || "").trim();
  if (!cancellationReason || cancellationReason.length > 1000) fail("INVOICE_CANCELLATION_REASON_REQUIRED");
  return editTransaction(db, async (tx: any) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId }, include: { orders: true } });
    if (!invoice) throw createHttpError(404, "INVOICE_NOT_FOUND");
    if (invoice.status === "CANCELLED") return invoice;
    const later = await tx.invoiceOrder.findFirst({ where: { sourceOrderId: { in: invoice.orders.map((row: any) => row.sourceOrderId) },
      invoice: { sellerOrgId, status: "ISSUED", sequenceNumber: { gt: invoice.sequenceNumber } } } });
    if (later) fail("INVOICE_CANCEL_REVERSE_ORDER_REQUIRED");
    const updated = await tx.invoice.updateMany({ where: { id: invoiceId, sellerOrgId, status: "ISSUED" },
      data: { status: "CANCELLED", cancelledBy: actor, cancelledAt: new Date(), cancellationReason } });
    if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
    return tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId } });
  });
}

export async function recordInvoicePayment(db: any, sellerOrgId: number, actor: string, invoiceId: string, body: any) {
  const rawAmount = String(body?.amount || "").trim();
  const clientKey = String(body?.clientKey || "").trim();
  const receivedAt = new Date(String(body?.receivedAt || ""));
  if (!/^\d+(\.\d{1,4})?$/.test(rawAmount) || Number(rawAmount) <= 0 || !/^[A-Za-z0-9_-]{16,100}$/.test(clientKey) || !Number.isFinite(receivedAt.getTime())) {
    fail("INVOICE_PAYMENT_INVALID");
  }
  const reference = String(body?.reference || "").trim(), note = String(body?.note || "").trim();
  if (reference.length > 500 || note.length > 2000) fail("INVOICE_PAYMENT_INVALID");
  return editTransaction(db, async (tx: any) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId } });
    if (!invoice) throw createHttpError(404, "INVOICE_NOT_FOUND");
    const existing = await tx.invoicePayment.findFirst({ where: { invoiceId, clientKey } });
    if (existing) return existing;
    if (invoice.status !== "ISSUED") fail("INVOICE_PAYMENT_CANCELLED_INVOICE");
    return tx.invoicePayment.create({ data: { invoiceId, clientKey, amount: rawAmount,
      currencyCode: invoice.currencyCode, receivedAt, reference, note, createdBy: actor } });
  });
}

export async function voidInvoicePayment(db: any, sellerOrgId: number, actor: string, paymentId: string, reason: unknown) {
  const voidReason = String(reason || "").trim();
  if (!voidReason || voidReason.length > 1000) fail("INVOICE_PAYMENT_VOID_REASON_REQUIRED");
  return editTransaction(db, async (tx: any) => {
    const payment = await tx.invoicePayment.findFirst({ where: { id: paymentId, invoice: { sellerOrgId } } });
    if (!payment) throw createHttpError(404, "INVOICE_PAYMENT_NOT_FOUND");
    if (payment.voidedAt) return payment;
    const updated = await tx.invoicePayment.updateMany({ where: { id: paymentId, voidedAt: null },
      data: { voidedAt: new Date(), voidedBy: actor, voidReason } });
    if (updated.count !== 1) throw createHttpError(409, STALE_EDIT);
    return tx.invoicePayment.findFirst({ where: { id: paymentId } });
  });
}

export async function replaceInvoicePaymentAllocations(db: any, sellerOrgId: number, actor: string, paymentId: string, body: any) {
  const batchKey = String(body?.clientKey || "").trim();
  const changeReason = String(body?.reason || "").trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(batchKey) || changeReason.length > 1000 || !Array.isArray(body?.allocations)) {
    fail("INVOICE_PAYMENT_ALLOCATION_INVALID");
  }
  const parsed = body.allocations.map((row: any) => ({
    invoiceOrderId: Number(row?.invoiceOrderId), amount: String(row?.amount || "").trim(),
  }));
  if (!parsed.length || parsed.some((row: any) => !Number.isSafeInteger(row.invoiceOrderId)
    || !/^\d+(\.\d{1,4})?$/.test(row.amount) || (parseMoneyScale4(row.amount) ?? 0n) <= 0n)
    || new Set(parsed.map((row: any) => row.invoiceOrderId)).size !== parsed.length) {
    fail("INVOICE_PAYMENT_ALLOCATION_INVALID");
  }
  return editTransaction(db, async (tx: any) => {
    const payment = await tx.invoicePayment.findFirst({ where: { id: paymentId, invoice: { sellerOrgId } },
      include: { invoice: { include: { orders: { select: { id: true } } } } } });
    if (!payment) throw createHttpError(404, "INVOICE_PAYMENT_NOT_FOUND");
    if (payment.voidedAt || payment.invoice.status === "CANCELLED") fail("INVOICE_PAYMENT_ALLOCATION_CLOSED");
    const allowed = new Set(payment.invoice.orders.map((row: any) => row.id));
    if (parsed.some((row: any) => !allowed.has(row.invoiceOrderId))) fail("INVOICE_PAYMENT_ALLOCATION_ORDER_SCOPE");
    const total = parsed.reduce((sum: bigint, row: any) => sum + (parseMoneyScale4(row.amount) ?? 0n), 0n);
    if (total > (parseMoneyScale4(payment.amount) ?? 0n)) fail("INVOICE_PAYMENT_ALLOCATION_EXCEEDS_PAYMENT");
    const retried = await tx.invoicePaymentAllocation.findMany({ where: { paymentId, batchKey }, orderBy: { invoiceOrderId: "asc" } });
    if (retried.length) {
      const expected = [...parsed].sort((a: any, b: any) => a.invoiceOrderId - b.invoiceOrderId);
      if (retried.length !== expected.length || retried.some((row: any, index: number) =>
        row.invoiceOrderId !== expected[index].invoiceOrderId || (parseMoneyScale4(row.amount) ?? 0n) !== (parseMoneyScale4(expected[index].amount) ?? 0n))) {
        fail("INVOICE_PAYMENT_ALLOCATION_RETRY_MISMATCH");
      }
      return retried;
    }
    const active = await tx.invoicePaymentAllocation.findMany({ where: { paymentId, voidedAt: null } });
    if (active.length && !changeReason) fail("INVOICE_PAYMENT_ALLOCATION_REASON_REQUIRED");
    if (active.length) await tx.invoicePaymentAllocation.updateMany({ where: { paymentId, voidedAt: null },
      data: { voidedAt: new Date(), voidedBy: actor, voidReason: changeReason } });
    await tx.invoicePaymentAllocation.createMany({ data: parsed.map((row: any) => ({ ...row, paymentId,
      invoiceId: payment.invoice.id, batchKey, createdBy: actor })) });
    return tx.invoicePaymentAllocation.findMany({ where: { paymentId, batchKey }, orderBy: { invoiceOrderId: "asc" } });
  });
}

export async function createInvoiceRevisionDraft(db: any, sellerOrgId: number, actor: string, invoiceId: string, body: any) {
  const clientKey = String(body?.clientKey || "").trim();
  const revisionReason = String(body?.reason || "").trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(clientKey) || !revisionReason || revisionReason.length > 1000) {
    fail("INVOICE_REVISION_INVALID");
  }
  return editTransaction(db, async (tx: any) => {
    const retried = await tx.invoiceDraft.findFirst({ where: { sellerOrgId, clientKey } });
    if (retried) {
      if (retried.revisionOfInvoiceId !== invoiceId || retried.revisionReason !== revisionReason) fail("INVOICE_REVISION_RETRY_MISMATCH");
      return retried;
    }
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, sellerOrgId }, include: { orders: true, lines: true } });
    if (!invoice) throw createHttpError(404, "INVOICE_NOT_FOUND");
    if (invoice.status !== "ISSUED") fail("INVOICE_REVISION_SOURCE_INVALID");
    const existingRevision = await tx.invoice.findFirst({ where: { revisionOfInvoiceId: invoiceId } });
    if (existingRevision) fail("INVOICE_REVISION_ALREADY_ISSUED");
    const existingDraft = await tx.invoiceDraft.findFirst({ where: { revisionOfInvoiceId: invoiceId } });
    if (existingDraft) return existingDraft;
    const snapshot: any = invoice.snapshot || {};
    const content = {
      basis: invoice.pricingBasis, currency: invoice.currencyCode, fields: {
        ...(snapshot.fields || {}), number: `${invoice.invoiceNumber}-R${Number(invoice.revisionNumber || 1) + 1}`,
      },
      orders: invoice.orders.map((row: any) => ({ orderId: row.sourceOrderId, sourceUpdatedAt: row.sourceUpdatedAt.toISOString() })),
      percentages: Object.fromEntries(invoice.orders.map((row: any) => [row.sourceOrderId, String(row.billingPercentage)])),
      settlements: Object.fromEntries(invoice.orders.map((row: any) => [row.sourceOrderId, {
        deduction: String(row.appliedDeductionAmount), reason: row.deductionReason || "",
      }])),
      lines: invoice.lines.map((line: any) => ({ key: line.lineKey, quantity: String(line.quantity), remark: line.remark || "",
        adjustmentReason: line.adjustmentReason || "", hsCode: line.hsCode || "", origin: line.origin || "" })),
    };
    const draft = await tx.invoiceDraft.create({ data: { sellerOrgId, buyerOrgId: invoice.buyerOrgId, clientKey,
      content, createdBy: actor, updatedBy: actor, revisionOfInvoiceId: invoice.id, revisionReason } });
    if (invoice.orders.length) await tx.invoiceDraftOrder.createMany({ data: invoice.orders.map((row: any) => ({ draftId: draft.id,
      workOrderId: row.workOrderId, sourceOrderId: row.sourceOrderId, sourceUpdatedAt: row.sourceUpdatedAt })) });
    if (invoice.lines.length) await tx.invoiceDraftLine.createMany({ data: invoice.lines.map((line: any) => ({ draftId: draft.id,
      workOrderItemId: line.workOrderItemId, sourceItemId: line.sourceItemId, lineKey: line.lineKey })) });
    return draft;
  });
}
