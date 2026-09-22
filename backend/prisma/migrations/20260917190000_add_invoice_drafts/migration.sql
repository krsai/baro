-- Drafts are editable work, not issued invoices or receivables.
CREATE TABLE IF NOT EXISTS "InvoiceDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sellerOrgId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "buyerOrgId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "clientKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "content" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceDraft_sellerOrgId_clientKey_key" UNIQUE ("sellerOrgId", "clientKey")
);
CREATE INDEX IF NOT EXISTS "InvoiceDraft_sellerOrgId_updatedAt_id_idx" ON "InvoiceDraft"("sellerOrgId", "updatedAt", "id");
CREATE INDEX IF NOT EXISTS "InvoiceDraft_buyerOrgId_idx" ON "InvoiceDraft"("buyerOrgId");
CREATE TABLE IF NOT EXISTS "InvoiceDraftOrder" (
  "id" SERIAL PRIMARY KEY,
  "draftId" TEXT NOT NULL REFERENCES "InvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workOrderId" INTEGER REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "sourceOrderId" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceDraftOrder_draftId_sourceOrderId_key" UNIQUE ("draftId", "sourceOrderId")
);
CREATE INDEX IF NOT EXISTS "InvoiceDraftOrder_workOrderId_idx" ON "InvoiceDraftOrder"("workOrderId");
CREATE TABLE IF NOT EXISTS "InvoiceDraftLine" (
  "id" SERIAL PRIMARY KEY,
  "draftId" TEXT NOT NULL REFERENCES "InvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workOrderItemId" INTEGER REFERENCES "WorkOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "sourceItemId" INTEGER NOT NULL,
  "lineKey" TEXT NOT NULL,
  CONSTRAINT "InvoiceDraftLine_draftId_lineKey_key" UNIQUE ("draftId", "lineKey")
);
CREATE INDEX IF NOT EXISTS "InvoiceDraftLine_workOrderItemId_idx" ON "InvoiceDraftLine"("workOrderItemId");
