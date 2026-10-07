import { Prisma } from '@prisma/client';

const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
export const resolveStyleCategory = async (db: any, orgId: number, input: any, allowImportName = false) => {
  const id = input.categoryId;
  if (id !== undefined && id !== null && id !== '') {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) fail('invalid categoryId', 400);
    const category = await db.attrCategory.findFirst({ where: { id: Number(id), orgId } });
    if (!category) fail('category does not belong to the style manufacturer');
    return { categoryId: category.id, collection: category.name };
  }
  const name = String(input.collection || '').trim();
  if (!name) return { categoryId: null, collection: null };
  if (!allowImportName) fail('categoryId is required; category names are display values', 400);
  const matches = await db.attrCategory.findMany({ where: { orgId, name } });
  if (matches.length !== 1) fail(`category import requires one manufacturer-scoped match: ${name} (${matches.length})`);
  return { categoryId: matches[0].id, collection: matches[0].name };
};

// Global editing continues to replicate categories, while every style references
// the immutable ID of its manufacturer's copy. Copy updates never recreate rows.
export const syncCategoryCopies = async (prisma: any, sourceOrgId: number, items: any[], resolveCode?: (input: any) => string) =>
  prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('LOCK TABLE "AttrCategory" IN SHARE ROW EXCLUSIVE MODE');
    const organizations = await tx.organization.findMany({ where: { type: 'MANUFACTURER' }, select: { id: true } });
    if (!organizations.some((o: any) => o.id === sourceOrgId)) fail('category source must be a manufacturer');
    const previous = await tx.attrCategory.findMany({ where: { orgId: sourceOrgId } });
    const previousById = new Map<number, any>(previous.map((row: any) => [row.id, row]));
    const seen = new Set<number>();
    const codes = new Set<string>();
    const usedCodes = new Set<string>(previous.map((row: any) => row.code));
    const prepared = items.map((item: any) => {
      const id = /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
      if (id && (!previousById.has(id) || seen.has(id))) fail('invalid or duplicate category ID');
      if (id) seen.add(id);
      if (id) usedCodes.delete(previousById.get(id).code);
      let code = String(item.code || '').trim().toUpperCase();
      const name = String(item.name || item.nameKo || item.nameEn || item.nameVi || '').trim();
      if (!code && id) code = previousById.get(id).code;
      if (!code && resolveCode) code = resolveCode({ code, name, usedCodes });
      if (!code || !name || codes.has(code)) fail('category code and name are required; codes must be unique', 400);
      codes.add(code);
      usedCodes.add(code);
      return { id, oldCode: id ? previousById.get(id).code : null,
        data: { code, name, nameKo: item.nameKo || null, nameEn: item.nameEn || null, nameVi: item.nameVi || null } };
    });
    for (const org of organizations) {
      const rows = await tx.attrCategory.findMany({ where: { orgId: org.id } });
      const retained = new Set<number>();
      const updates: any[] = [];
      for (const item of prepared) {
        const row = org.id === sourceOrgId ? rows.find((r: any) => r.id === item.id)
          : rows.find((r: any) => r.code === item.oldCode);
        if (!row && item.oldCode && rows.length) fail(`category replica missing: org ${org.id}, code ${item.oldCode}`);
        if (row) { retained.add(row.id); updates.push({ row, data: item.data }); }
        else updates.push({ row: null, data: item.data });
      }
      const removed = rows.filter((r: any) => !retained.has(r.id));
      await tx.attrCategory.deleteMany({ where: { orgId: org.id, id: { in: removed.map((r: any) => r.id) } } });
      // Temporary unique codes permit simultaneous code swaps without losing IDs.
      for (const { row } of updates) if (row) await tx.attrCategory.update({ where: { id: row.id }, data: { code: `__FK_EDIT_${row.id}` } });
      for (const { row, data } of updates) {
        if (row) await tx.attrCategory.update({ where: { id: row.id }, data });
        else await tx.attrCategory.create({ data: { ...data, orgId: org.id } });
      }
    }
    return tx.attrCategory.findMany({ where: { orgId: sourceOrgId }, orderBy: { id: 'asc' } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
