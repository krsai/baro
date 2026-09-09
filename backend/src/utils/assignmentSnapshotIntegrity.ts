import { createHttpError } from "./http";

export const SNAPSHOT_REFERENCE_ERROR = "SNAPSHOT_REFERENCE_INVALID: assignment process references require review";
export const snapshotProcessIds = (snapshot: any): number[] | null => {
  if (!Array.isArray(snapshot?.processes) || !snapshot.processes.length) return null;
  const ids = snapshot.processes.map((row: any) =>
    ["number", "string"].includes(typeof row?.styleProcessId) ? Number(row.styleProcessId) : NaN);
  if (ids.some((id: number) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) return null;
  return ids;
};

export const hasValidAssignmentProcessRefs = (plan: any, requireSt = true): boolean => {
  const ct = snapshotProcessIds(plan?.assignmentCtSnapshot);
  if (!ct) return false;
  const stSnapshot = plan?.assignmentStSnapshot;
  const versions = [plan?.styleProcessVersionId, plan?.assignmentCtSnapshot?.styleProcessVersionId, stSnapshot?.styleProcessVersionId]
    .filter(value => value != null).map(Number);
  if (!versions.every(id => Number.isSafeInteger(id) && id > 0) || new Set(versions).size > 1) return false;
  if (!requireSt && !stSnapshot) return true;
  const st = snapshotProcessIds(stSnapshot);
  return Boolean(st && st.length === ct.length && ct.every(id => st.includes(id)));
};

// Validate identities against the owning manufacturer's canonical rows, never labels or positions.
const snapshotVersionId = (plan: any) => plan.styleProcessVersionId ?? plan.assignmentCtSnapshot?.styleProcessVersionId ?? plan.assignmentStSnapshot?.styleProcessVersionId;
export const invalidAssignmentProcessRefIds = async (db: any, orgId: number, plans: any[]) => {
  const invalid = new Set<any>();
  if (!plans.length) return invalid;
  const ids = [...new Set(plans.flatMap(plan => snapshotProcessIds(plan.assignmentCtSnapshot) ?? []))];
  const versionIds = [...new Set(plans.map(plan => Number(snapshotVersionId(plan))).filter(id => Number.isSafeInteger(id) && id > 0))];
  const [rows, versions] = await Promise.all([
    db.styleProcess.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, styleId: true } }),
    db.styleProcessVersion.findMany({ where: { id: { in: versionIds }, orgId }, select: { id: true, styleId: true, processSnapshot: true } }),
  ]);
  const byId = new Map<number, number>(rows.map((row: any) => [row.id, row.styleId]));
  const byVersion = new Map<number, any>(versions.map((row: any) => [row.id, row]));
  for (const plan of plans) {
    const ct = snapshotProcessIds(plan.assignmentCtSnapshot);
    const version = byVersion.get(Number(snapshotVersionId(plan)));
    const versionProcesses = Array.isArray(version?.processSnapshot) ? version.processSnapshot : [];
    const versionProcessIds = snapshotProcessIds({ processes: versionProcesses.map((row: any) => ({ styleProcessId: row.styleProcessId ?? row.id })) });
    if (!hasValidAssignmentProcessRefs(plan) || !ct || ct.some(id => byId.get(id) !== Number(plan.styleId)) ||
        (snapshotVersionId(plan) != null && (!version || version.styleId !== Number(plan.styleId) || !versionProcessIds || versionProcessIds.length !== ct.length || ct.some(id => !versionProcessIds.includes(id))))) {
      invalid.add(plan.id ?? plan.externalId);
    }
  }
  return invalid;
};

export const assertAssignmentProcessRefs = async (db: any, orgId: number, plans: any[]) => {
  if ((await invalidAssignmentProcessRefIds(db, orgId, plans)).size) throw createHttpError(409, SNAPSHOT_REFERENCE_ERROR);
};
