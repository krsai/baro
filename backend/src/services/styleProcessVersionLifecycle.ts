import { Prisma } from '@prisma/client';
import { createHttpError } from '../utils/http';

const runtimeFields = new Set(['atParams', 'atSharedPrediction', 'atV2Observations', 'atModelVersion',
  'workRecordCount', 'hasWorkRecords', 'instanceId', 'createdAt', 'updatedAt', 'setAt', 'setBy',
  'atStFallbackApproved', 'atStFallbackSourceAssignmentPlanId', 'atStFallbackApprovedAt']);

export const processVersionSignature = (value: any): string => JSON.stringify(value, (key, item) =>
  runtimeFields.has(key) ? undefined : item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export const confirmedStyleProcessIds = (versions: any[]): Set<number> => new Set(versions.flatMap(version =>
  (Array.isArray(version.processSnapshot) ? version.processSnapshot : [])
    .map((row: any) => Number(row?.styleProcessId ?? row?.id))
    .filter((id: number) => Number.isSafeInteger(id) && id > 0)));

// Called inside the same transaction that saves processes, or a retryable
// confirmation transaction. A version needs no order/assignment to exist.
export async function confirmCurrentProcessVersion(db: any, input: {
  orgId: number; styleId: number; actor: string; date: string;
  loadSnapshot: (db: any) => Promise<any[]>;
  normalizeSnapshot?: (value: any) => any[];
}) {
  const locked = await db.$queryRawUnsafe('SELECT id FROM "Style" WHERE id=$1 AND "orgId"=$2 FOR NO KEY UPDATE', input.styleId, input.orgId);
  if (!locked.length) throw createHttpError(404, 'style not found');
  const snapshot = await input.loadSnapshot(db);
  const latest = await db.styleProcessVersion.findFirst({ where: { orgId: input.orgId, styleId: input.styleId }, orderBy: { versionNumber: 'desc' } });
  if (!latest && !snapshot.length) return null;
  // Retrying a successful confirmation returns the already-confirmed version.
  if (latest && processVersionSignature(input.normalizeSnapshot ? input.normalizeSnapshot(latest.processSnapshot) : latest.processSnapshot) === processVersionSignature(snapshot)) return latest;
  return db.styleProcessVersion.create({ data: {
    orgId: input.orgId, styleId: input.styleId, versionNumber: (latest?.versionNumber || 0) + 1,
    confirmedDate: input.date, confirmedBy: input.actor, processSnapshot: snapshot as Prisma.InputJsonValue,
  } });
}
