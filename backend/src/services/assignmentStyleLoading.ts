import { createHttpError } from '../utils/http';

export async function loadAssignmentStyleDetails(db: any, orgId: number, input: unknown, includeProcesses = true) {
  const text = String(input ?? '');
  if (!/^\d+(,\d+)*$/.test(text) || text.length > 50000) throw createHttpError(400, 'INVALID_ASSIGNMENT_STYLE_IDS');
  const ids = [...new Set(text.split(',').map(Number))];
  if (ids.length > 5000 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw createHttpError(400, 'INVALID_ASSIGNMENT_STYLE_IDS');
  // A style can belong to a customer; authorize it through this company's actual cards.
  const cards = await db.assignmentCard.findMany({ where: { orgId, styleId: { in: ids } }, select: { styleId: true } });
  const allowed = new Set(cards.map((card: any) => card.styleId));
  if (ids.some(id => !allowed.has(id))) throw createHttpError(404, 'ASSIGNMENT_STYLE_NOT_FOUND');
  return db.style.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: {
    id: true, orgId: true, customerOrgId: true, code: true, name: true, updatedAt: true,
    customerOrganization: { select: { id: true, name: true, nameKo: true, nameVi: true } }, ...(includeProcesses ? { processes: true } : {}),
  } });
}
