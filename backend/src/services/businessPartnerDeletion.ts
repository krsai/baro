const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

// One batch for the directory; use the same business sources as deletion.
export async function getCustomerUsage(db: any, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const sources = [
    ['Style', 'linked."orgId" = r."manufacturerOrgId" AND linked."customerOrgId" = r."brandOrgId"'],
    ['WorkOrder', 'linked."sellerOrgId" = r."manufacturerOrgId" AND linked."buyerOrgId" = r."brandOrgId"'],
    ['AssignmentCard', 'linked."orgId" = r."manufacturerOrgId" AND linked."buyerOrgId" = r."brandOrgId"'],
    ['AssignmentPlan', 'linked."orgRelationshipId" = r.id OR (linked."orgId" = r."manufacturerOrgId" AND linked."buyerOrgId" = r."brandOrgId")'],
    ['Invoice', 'linked."sellerOrgId" = r."manufacturerOrgId" AND linked."buyerOrgId" = r."brandOrgId"'],
    ['InvoiceDraft', 'linked."sellerOrgId" = r."manufacturerOrgId" AND linked."buyerOrgId" = r."brandOrgId"'],
    ['CustomerSalesPriceList', 'linked."orgRelationshipId" = r.id'],
  ];
  const rows = await db.$queryRawUnsafe(`SELECT r.id FROM "OrgRelationship" r WHERE r.id = ANY($1::int[]) AND (${sources.map(([table, condition]) => `EXISTS (SELECT 1 FROM ${quote(table!)} linked WHERE ${condition})`).join(' OR ')})`, ids);
  return new Set(rows.map((row: any) => row.id));
}

// Count actual FK references, including Cascade/SetNull, before deleting.
// Industry selections alone are configuration and may be removed with a partner.
export async function getBusinessPartnerUsage(db: any, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const relations = await db.$queryRawUnsafe(`
    SELECT ns.nspname::text AS schema, rel.relname::text AS table,
      array_agg(src.attname::text ORDER BY keys.ordinality) AS columns,
      array_agg(dst.attname::text ORDER BY keys.ordinality) AS targets
    FROM pg_constraint fk
    JOIN pg_class rel ON rel.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS keys(source, target, ordinality)
    JOIN pg_attribute src ON src.attrelid = fk.conrelid AND src.attnum = keys.source
    JOIN pg_attribute dst ON dst.attrelid = fk.confrelid AND dst.attnum = keys.target
    WHERE fk.contype = 'f' AND fk.confrelid = '"Organization"'::regclass
    GROUP BY fk.oid, ns.nspname, rel.relname
  `) as { schema: string; table: string; columns: string[]; targets: string[] }[];
  const checks = relations.filter(row => !(row.table === 'OrganizationOutsourcingServiceType' && row.columns.includes('partnerOrgId'))
    && !(row.table === 'OrganizationBankAccount' && row.columns.includes('entityId')));
  if (!checks.length) return new Set();
  const rows = await db.$queryRawUnsafe(checks.map(row => `
    SELECT DISTINCT org.id FROM ${quote(row.schema)}.${quote(row.table)} linked
    JOIN "Organization" org ON ${row.columns.map((column, index) => `linked.${quote(column)} = org.${quote(row.targets[index]!)}`).join(' AND ')}
    WHERE org.id = ANY($1::int[])
  `).join(' UNION '), ids) as { id: number }[];
  return new Set(rows.map(row => row.id));
}

export async function deleteUnusedBusinessPartner(tx: any, orgId: number, id: number) {
  // FK inserts acquire a key-share lock; deletion locks the referenced row first.
  const [partner] = await tx.$queryRawUnsafe(
    'SELECT id, type FROM "Organization" WHERE id = $1 AND "ownerOrgId" = $2 FOR UPDATE', id, orgId,
  );
  if (!partner || !['PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER', 'LOGISTICS_PROVIDER'].includes(partner.type)) throw new Error('BUSINESS_PARTNER_NOT_FOUND');
  if ((await getBusinessPartnerUsage(tx, [id])).has(id)) throw new Error('PARTNER_HAS_TRANSACTION_HISTORY');
  // Referenced bank accounts still fail their Restrict FKs and roll back the transaction.
  await tx.organizationBankAccount.deleteMany({ where: { entityId: id, orgId } });
  await tx.organizationOutsourcingServiceType.deleteMany({ where: { partnerOrgId: id } });
  await tx.organization.delete({ where: { id } });
}

export async function deleteUnusedCustomer(tx: any, orgId: number, id: number, manufacturerPerspective: boolean) {
  const [relationship] = await tx.$queryRawUnsafe(
    `SELECT * FROM "OrgRelationship" WHERE id=$1 AND ${manufacturerPerspective ? '"manufacturerOrgId"' : '"brandOrgId"'}=$2 FOR UPDATE`, id, orgId,
  );
  if (!relationship) throw new Error('CUSTOMER_NOT_FOUND');
  const manufacturer = relationship.manufacturerOrgId, brand = relationship.brandOrgId;
  // Serialize new organization FK references with deletion. Keep the shared entity itself.
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [manufacturer, brand]);
  if ((await getCustomerUsage(tx, [id])).has(id)) throw new Error('PARTNER_HAS_TRANSACTION_HISTORY');
  await tx.orgRelationship.delete({ where: { id } });
}
