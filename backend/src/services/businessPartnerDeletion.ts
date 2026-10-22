const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

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
  if (!partner || !['PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER'].includes(partner.type)) throw new Error('BUSINESS_PARTNER_NOT_FOUND');
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
  const checks = [
    tx.style.count({ where: { orgId: manufacturer, customerOrgId: brand } }),
    tx.workOrder.count({ where: { sellerOrgId: manufacturer, buyerOrgId: brand } }),
    tx.assignmentCard.count({ where: { orgId: manufacturer, buyerOrgId: brand } }),
    tx.assignmentPlan.count({ where: { OR: [{ orgRelationshipId: id }, { orgId: manufacturer, buyerOrgId: brand }] } }),
    tx.invoice.count({ where: { sellerOrgId: manufacturer, buyerOrgId: brand } }),
    tx.invoiceDraft.count({ where: { sellerOrgId: manufacturer, buyerOrgId: brand } }),
    tx.customerSalesPriceList.count({ where: { orgRelationshipId: id } }),
  ];
  if ((await Promise.all(checks)).some(count => count > 0)) throw new Error('PARTNER_HAS_TRANSACTION_HISTORY');
  await tx.orgRelationship.delete({ where: { id } });
}
