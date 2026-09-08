import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { createHttpError } from "./http";

export const STALE_EDIT = "STALE_EDIT: data changed in another screen; reload before saving";
export const editRevision = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value, (key, item) => key === "updatedAt" || key === "updatedBy" ? undefined : item))
  .digest("hex");

export const assertEditRevision = (expected: unknown, current: string) => {
  if (typeof expected !== "string" || expected !== current) throw createHttpError(409, STALE_EDIT);
};

// Serializable transactions also reject writers that raced after the revision check.
export const editTransaction = async <T>(db: any, run: (tx: Prisma.TransactionClient) => Promise<T>, timeout = 30000): Promise<T> => {
  try {
    return await db.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout });
  } catch (error: any) {
    if (error?.code === "P2034" || error?.code === "P2002") throw createHttpError(409, STALE_EDIT);
    throw error;
  }
};

export const assignmentBoardRevision = async (db: any, orgId: number) => {
  const [state, plans, cards] = await Promise.all([
    db.assignmentBoardState.findUnique({ where: { orgId }, select: { updatedAt: true } }),
    db.assignmentPlan.findMany({ where: { orgId }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.assignmentCard.findMany({ where: { orgId }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  return editRevision([state?.updatedAt ?? null, plans.map((row: any) => [row.id, row.updatedAt]), cards.map((row: any) => [row.id, row.updatedAt])]);
};
