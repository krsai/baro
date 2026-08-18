ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "salesCurrencyId" INTEGER;

CREATE TABLE "OrgRelationshipStyleSalesCurrency" (
  "id" SERIAL NOT NULL,
  "orgRelationshipId" INTEGER NOT NULL,
  "manufacturerOrgId" INTEGER NOT NULL,
  "brandOrgId" INTEGER NOT NULL,
  "styleId" INTEGER NOT NULL,
  "currencyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgRelationshipStyleSalesCurrency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgRelationshipStyleSalesCurrency_relationship_style_key"
  ON "OrgRelationshipStyleSalesCurrency"("orgRelationshipId", "styleId");
CREATE INDEX "OrgRelationshipStyleSalesCurrency_org_scope_idx"
  ON "OrgRelationshipStyleSalesCurrency"("manufacturerOrgId", "brandOrgId");
CREATE INDEX "OrgRelationshipStyleSalesCurrency_styleId_idx"
  ON "OrgRelationshipStyleSalesCurrency"("styleId");
CREATE INDEX "OrgRelationshipStyleSalesCurrency_currencyId_idx"
  ON "OrgRelationshipStyleSalesCurrency"("currencyId");
CREATE INDEX "OrgRelationship_salesCurrencyId_idx" ON "OrgRelationship"("salesCurrencyId");

ALTER TABLE "OrgRelationship" ADD CONSTRAINT "OrgRelationship_salesCurrency_fkey"
  FOREIGN KEY ("salesCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT;
ALTER TABLE "OrgRelationshipStyleSalesCurrency" ADD CONSTRAINT "OrgRelationshipStyleSalesCurrency_relationship_scope_fkey"
  FOREIGN KEY ("orgRelationshipId", "manufacturerOrgId", "brandOrgId")
  REFERENCES "OrgRelationship"("id", "manufacturerOrgId", "brandOrgId") ON DELETE CASCADE;
ALTER TABLE "OrgRelationshipStyleSalesCurrency" ADD CONSTRAINT "OrgRelationshipStyleSalesCurrency_style_brand_fkey"
  FOREIGN KEY ("styleId", "brandOrgId") REFERENCES "Style"("id", "orgId") ON DELETE CASCADE;
ALTER TABLE "OrgRelationshipStyleSalesCurrency" ADD CONSTRAINT "OrgRelationshipStyleSalesCurrency_currency_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT;
