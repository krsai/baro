import { Prisma, type OrgUserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import { createHttpError } from "../utils/http";

type LineRoutesDeps = {
  closeActiveLineAssignments: (employeeId: number, endedAt?: Date) => Promise<number[]>;
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
};

const LINE_ELIGIBLE_ROLES: OrgUserRole[] = ["WORKER"];
const LINE_ELIGIBLE_WORKER_ROLE_CODE = "WORKER_SEWING";

const normalizeDateKey = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};

const buildWorkDateRange = (workDate: unknown) => {
  const normalized = normalizeDateKey(workDate);
  if (!normalized) return null;
  const startAt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(startAt.getTime())) return null;
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setMilliseconds(endAt.getMilliseconds() - 1);
  return { dateKey: normalized, startAt, endAt };
};

const BUSINESS_TIME_ZONE =
  resolveOptionalString(process.env.BUSINESS_TIME_ZONE, "Asia/Seoul") || "Asia/Seoul";
const toDateKeyInTimeZone = (input: unknown, timeZone = BUSINESS_TIME_ZONE): string => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string" && input.trim() === "") return "";
  const date = input instanceof Date ? input : new Date(input as any);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
};
const todayDateKey = () => toDateKeyInTimeZone(new Date()) || new Date().toISOString().slice(0, 10);
const DEFAULT_FACTORY_MANAGEMENT_START_DATE = "2026-04-01";
const laterDateKey = (left: string, right: string) => (left >= right ? left : right);

const dateKeyToStableDate = (dateKey: string): Date | null => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return null;
  const value = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(value.getTime()) ? null : value;
};

const previousDateKey = (dateKey: string): string => {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const nextDateKey = (dateKey: string): string => {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const findFirstUncoveredLineAssignmentRange = ({
  joinedDate,
  leftDate,
  assignments,
}: {
  joinedDate: string;
  leftDate: string;
  assignments: Array<{ startAt: Date; endAt: Date | null }>;
}): { startDate: string; endDate: string } | null => {
  if (!joinedDate || !leftDate || joinedDate > leftDate) return null;
  const ranges = assignments
    .map((assignment) => ({
      startDate: toDateKeyInTimeZone(assignment.startAt),
      endDate: toDateKeyInTimeZone(assignment.endAt) || leftDate,
    }))
    .filter((range) => range.startDate && range.endDate)
    .map((range) => ({
      startDate: range.startDate < joinedDate ? joinedDate : range.startDate,
      endDate: range.endDate > leftDate ? leftDate : range.endDate,
    }))
    .filter((range) => range.startDate <= range.endDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  let cursor = joinedDate;
  for (const range of ranges) {
    if (range.endDate < cursor) continue;
    if (range.startDate > cursor) {
      return { startDate: cursor, endDate: previousDateKey(range.startDate) };
    }
    const afterRange = nextDateKey(range.endDate);
    if (afterRange > cursor) cursor = afterRange;
    if (cursor > leftDate) return null;
  }
  return cursor <= leftDate ? { startDate: cursor, endDate: leftDate } : null;
};

const buildEffectiveDateRange = (workDate: unknown) =>
  buildWorkDateRange(normalizeDateKey(workDate) || todayDateKey());

const buildLineEligibleWorkerWhere = (
  dateRange: { startAt: Date; endAt: Date } | null = null
): Prisma.EmployeeWhereInput => ({
  orgRole: { in: LINE_ELIGIBLE_ROLES },
  status: "ACTIVE",
  role: { code: LINE_ELIGIBLE_WORKER_ROLE_CODE },
  ...(dateRange
    ? {
        AND: [
          { OR: [{ joinedAt: null }, { joinedAt: { lte: dateRange.endAt } }] },
          { OR: [{ leftAt: null }, { leftAt: { gte: dateRange.startAt } }] },
        ],
      }
    : {}),
});

const updateLineHeadcounts = async (lineIds: number[]): Promise<Record<number, number>> => {
  if (lineIds.length === 0) return {};
  const uniqueIds = [...new Set(lineIds)];
  const todayRange = buildEffectiveDateRange(null);
  const result: Record<number, number> = {};
  await Promise.all(
    uniqueIds.map(async (lineId) => {
      const count = await prisma.lineAssignment.count({
        where: {
          lineId,
          endAt: null,
          employee: buildLineEligibleWorkerWhere(todayRange),
        },
      });
      result[lineId] = count;
    })
  );
  return result;
};

const syncEmployeeFactoryForLine = async ({
  orgId,
  lineId,
  lineFactoryId,
}: {
  orgId: number;
  lineId: number;
  lineFactoryId: number;
}) => {
  const activeAssignments = await prisma.lineAssignment.findMany({
    where: {
      lineId,
      endAt: null,
    },
    select: {
      employeeId: true,
      employee: {
        select: {
          factoryId: true,
        },
      },
    },
  });
  const workerIdsToSync = activeAssignments
    .filter((assignment) => {
      const employeeId = Number(assignment?.employeeId);
      if (!Number.isFinite(employeeId) || employeeId <= 0) return false;
      const workerFactoryId =
        assignment?.employee?.factoryId == null ? null : Number(assignment.employee.factoryId);
      return workerFactoryId !== lineFactoryId;
    })
    .map((assignment) => Number(assignment.employeeId))
    .filter((employeeId) => Number.isFinite(employeeId) && employeeId > 0);

  if (workerIdsToSync.length === 0) return 0;
  const updated = await prisma.employee.updateMany({
    where: {
      orgId,
      id: { in: workerIdsToSync },
    },
    data: {
      factoryId: lineFactoryId,
    },
  });
  return updated.count;
};

const buildFactoryLineBoardSnapshot = async (orgId: number, factoryId: number) => {
  const todayRange = buildEffectiveDateRange(null);
  const [lines, workers, assignments, assignmentHistory] = await Promise.all([
    prisma.line.findMany({
      where: { orgId, factoryId },
      orderBy: [{ id: "asc" }],
    }),
    prisma.employee.findMany({
      where: {
        orgId,
        factoryId,
        ...buildLineEligibleWorkerWhere(todayRange),
      },
      orderBy: [{ factoryId: "asc" }, { id: "asc" }],
    }),
    prisma.lineAssignment.findMany({
      where: {
        line: { orgId, factoryId },
        endAt: null,
        employee: buildLineEligibleWorkerWhere(todayRange),
      },
      select: { employeeId: true, lineId: true, startAt: true },
    }),
    prisma.lineAssignment.findMany({
      where: {
        employee: { orgId, factoryId },
        line: { orgId, factoryId },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);

  const assignmentByEmployee = new Map<number, { lineId: number; startAt: Date }>();
  assignments.forEach((assignment) => {
    assignmentByEmployee.set(assignment.employeeId, {
      lineId: assignment.lineId,
      startAt: assignment.startAt,
    });
  });
  const employeeIdsWithHistory = new Set(
    assignmentHistory.map((assignment) => assignment.employeeId)
  );

  return {
    lines,
    workers: workers.map((worker) => ({
      id: worker.id,
      orgMembershipId: worker.id,
      name: worker.name,
      email: worker.email ?? "",
      factoryId: worker.factoryId,
      joinedAt: worker.joinedAt,
      currentLineId: assignmentByEmployee.get(worker.id)?.lineId ?? null,
      currentAssignmentStartDate:
        toDateKeyInTimeZone(assignmentByEmployee.get(worker.id)?.startAt) || null,
      hasLineAssignmentHistory: employeeIdsWithHistory.has(worker.id),
    })),
  };
};

export const createLineRouter = ({
  closeActiveLineAssignments,
  isManufacturerOrg,
}: LineRoutesDeps) => {
  const lineRouter = Router();

  lineRouter.get("/lines", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const factoryId = Number(req.query.factoryId);
    const hasFactoryFilter = Number.isFinite(factoryId);
    const managedOnly =
      req.query.managedOnly === "1" || req.query.managedOnly === "true";
    if (hasFactoryFilter) {
      const factory = await prisma.factory.findFirst({
        where: { id: factoryId, orgId: organization.id },
      });
      if (!factory) {
        return res.status(404).json({ ok: false, error: "factory not found" });
      }
    }

    let managerEmployeeId: number | null = null;
    if (managedOnly) {
      const requesterEmail = getRequesterEmail(req);
      if (!requesterEmail) {
        return res.json([]);
      }
      const requesterEmployee = await prisma.employee.findUnique({
        where: {
          orgId_email: {
            orgId: organization.id,
            email: requesterEmail,
          },
        },
        select: {
          status: true,
          id: true,
        },
      });
      if (!requesterEmployee || requesterEmployee.status !== "ACTIVE" || !requesterEmployee.id) {
        return res.json([]);
      }
      managerEmployeeId = requesterEmployee.id;
    }

    const where: Prisma.LineWhereInput = {
      orgId: organization.id,
      ...(hasFactoryFilter ? { factoryId } : {}),
      ...(managerEmployeeId ? { managerEmployeeId } : {}),
    };
    const lines = await prisma.line.findMany({
      where,
      orderBy: [{ factoryId: "asc" }, { id: "asc" }],
    });

    return res.json(lines);
  });

  lineRouter.post("/lines", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const { factoryId, name } = req.body ?? {};
    const factoryIdNum = Number(factoryId);
    if (!Number.isFinite(factoryIdNum)) {
      return res.status(400).json({ ok: false, error: "factoryId is required" });
    }

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }

    const existingLine = await prisma.line.findFirst({
      where: { factoryId: factoryIdNum, orgId: organization.id, name: trimmedName },
    });
    if (existingLine) {
      return res.status(409).json({ ok: false, error: "line already exists" });
    }

    const line = await prisma.line.create({
      data: {
        orgId: organization.id,
        factoryId: factoryIdNum,
        name: trimmedName,
      },
    });

    return res.status(201).json(line);
  });

  lineRouter.post("/lines/batch-save", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const factoryIdNum = Number(req.body?.factoryId);
    if (!Number.isFinite(factoryIdNum)) {
      return res.status(400).json({ ok: false, error: "factoryId is required" });
    }

    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
    const managementStartDate =
      toDateKeyInTimeZone(factory.managementStartDate) || DEFAULT_FACTORY_MANAGEMENT_START_DATE;

    const submittedLinesInput = Array.isArray(req.body?.lines) ? req.body.lines : null;
    const submittedWorkerAssignmentsInput = Array.isArray(req.body?.workerAssignments)
      ? req.body.workerAssignments
      : null;
    if (!submittedLinesInput || !submittedWorkerAssignmentsInput) {
      return res.status(400).json({
        ok: false,
        error: "lines and workerAssignments arrays are required",
      });
    }

    const existingLines = await prisma.line.findMany({
      where: { orgId: organization.id, factoryId: factoryIdNum },
      orderBy: [{ id: "asc" }],
    });
    const existingLineById = new Map(existingLines.map((line) => [line.id, line]));

    const seenLineKeys = new Set<string>();
    const seenLineIds = new Set<number>();
    const seenLineNames = new Set<string>();
    const parsedLines: Array<{
      id: number | null;
      lineKey: string;
      name: string;
      managerEmployeeId: number | null;
    }> = [];

    for (const item of submittedLinesInput) {
      const lineKey = resolveOptionalString(item?.lineKey, null)?.trim() ?? "";
      if (!lineKey) {
        return res.status(400).json({ ok: false, error: "lineKey is required" });
      }
      if (seenLineKeys.has(lineKey)) {
        return res.status(400).json({ ok: false, error: "duplicate lineKey" });
      }
      seenLineKeys.add(lineKey);

      let lineId: number | null = null;
      if (item?.id !== null && item?.id !== undefined && item?.id !== "") {
        const parsedId = Number(item.id);
        if (!Number.isFinite(parsedId) || parsedId <= 0) {
          return res.status(400).json({ ok: false, error: "invalid line id" });
        }
        if (!existingLineById.has(parsedId)) {
          return res.status(404).json({ ok: false, error: "line not found" });
        }
        if (seenLineIds.has(parsedId)) {
          return res.status(400).json({ ok: false, error: "duplicate line id" });
        }
        seenLineIds.add(parsedId);
        lineId = parsedId;
      }

      const trimmedName = resolveOptionalString(item?.name, null)?.trim() ?? "";
      if (!trimmedName) {
        return res.status(400).json({ ok: false, error: "line name is required" });
      }
      if (seenLineNames.has(trimmedName)) {
        return res.status(409).json({ ok: false, error: "line already exists" });
      }
      seenLineNames.add(trimmedName);

      let managerEmployeeId: number | null = null;
      if (
        item?.managerEmployeeId !== null &&
        item?.managerEmployeeId !== undefined &&
        item?.managerEmployeeId !== ""
      ) {
        const parsedManagerId = Number(item.managerEmployeeId);
        if (!Number.isFinite(parsedManagerId) || parsedManagerId <= 0) {
          return res.status(400).json({ ok: false, error: "invalid managerEmployeeId" });
        }
        managerEmployeeId = parsedManagerId;
      }

      parsedLines.push({
        id: lineId,
        lineKey,
        name: trimmedName,
        managerEmployeeId,
      });
    }

    const todayRange = buildEffectiveDateRange(null);
    const workerRows = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId: factoryIdNum,
        ...buildLineEligibleWorkerWhere(todayRange),
      },
      select: { id: true, joinedAt: true, leftAt: true },
      orderBy: [{ id: "asc" }],
    });
    const eligibleWorkerIds = workerRows.map((worker) => worker.id);
    const eligibleWorkerIdSet = new Set(eligibleWorkerIds);

    if (submittedWorkerAssignmentsInput.length !== eligibleWorkerIds.length) {
      return res.status(400).json({
        ok: false,
        error: "workerAssignments must include all eligible workers",
      });
    }

    const desiredLineKeyByEmployee = new Map<number, string | null>(
      eligibleWorkerIds.map((workerId) => [workerId, null])
    );
    const effectiveDateByEmployee = new Map<number, string>();
    const seenWorkerIds = new Set<number>();

    for (const item of submittedWorkerAssignmentsInput) {
      const employeeId = Number(item?.employeeId);
      if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return res.status(400).json({ ok: false, error: "invalid employeeId" });
      }
      if (!eligibleWorkerIdSet.has(employeeId)) {
        return res.status(404).json({ ok: false, error: "worker not found" });
      }
      if (seenWorkerIds.has(employeeId)) {
        return res.status(400).json({ ok: false, error: "duplicate employeeId" });
      }
      seenWorkerIds.add(employeeId);

      const lineKey = resolveOptionalString(item?.lineKey, null)?.trim() ?? "";
      if (lineKey && !seenLineKeys.has(lineKey)) {
        return res.status(400).json({ ok: false, error: "invalid worker lineKey" });
      }
      desiredLineKeyByEmployee.set(employeeId, lineKey || null);
      const effectiveDate = normalizeDateKey(item?.effectiveDate);
      if (item?.effectiveDate && !effectiveDate) {
        return res.status(400).json({ ok: false, error: "invalid effectiveDate" });
      }
      if (effectiveDate) effectiveDateByEmployee.set(employeeId, effectiveDate);
    }

    for (const line of parsedLines) {
      if (line.managerEmployeeId === null) continue;
      if (!eligibleWorkerIdSet.has(line.managerEmployeeId)) {
        return res.status(404).json({ ok: false, error: "manager not found" });
      }
      if (desiredLineKeyByEmployee.get(line.managerEmployeeId) !== line.lineKey) {
        return res.status(400).json({
          ok: false,
          error: "manager must be assigned to the line first",
        });
      }
    }

    const deletedLineIds = existingLines
      .filter((line) => !seenLineIds.has(line.id))
      .map((line) => line.id);

    const renamedExistingLines = parsedLines.filter((line) => {
      if (!line.id) return false;
      const existing = existingLineById.get(line.id);
      return existing ? existing.name !== line.name : false;
    });

    const refreshedLines = await prisma.$transaction(async (tx) => {
      const tempNamePrefix = `__line_tmp_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_`;

      for (const line of renamedExistingLines) {
        await tx.line.update({
          where: { id: line.id as number },
          data: { name: `${tempNamePrefix}${line.id}` },
        });
      }

      if (deletedLineIds.length > 0) {
        await tx.lineAssignment.deleteMany({
          where: { lineId: { in: deletedLineIds } },
        });
        const planRows = await tx.assignmentPlan.findMany({
          where: { orgId: organization.id, lineId: { in: deletedLineIds } },
          select: { id: true },
        });
        const planIds = planRows.map((plan) => plan.id);
        if (planIds.length > 0) {
          const linkedWorkRecordCount = await tx.workRecord.count({
            where: { assignmentPlanId: { in: planIds } },
          });
          if (linkedWorkRecordCount > 0) {
            throw createHttpError(409, "line has assignment plans with work records");
          }
          await tx.assignmentPlan.deleteMany({
            where: { id: { in: planIds } },
          });
        }
        await tx.line.deleteMany({
          where: { orgId: organization.id, id: { in: deletedLineIds } },
        });
      }

      const lineKeyToId = new Map<string, number>();
      parsedLines.forEach((line) => {
        if (line.id) {
          lineKeyToId.set(line.lineKey, line.id);
        }
      });

      for (const line of parsedLines) {
        if (line.id) continue;
        const created = await tx.line.create({
          data: {
            orgId: organization.id,
            factoryId: factoryIdNum,
            name: line.name,
          },
        });
        lineKeyToId.set(line.lineKey, created.id);
      }

      for (const line of renamedExistingLines) {
        await tx.line.update({
          where: { id: line.id as number },
          data: { name: line.name },
        });
      }

      const activeAssignments = await tx.lineAssignment.findMany({
        where: {
          employeeId: { in: eligibleWorkerIds },
          endAt: null,
        },
        select: { id: true, employeeId: true, lineId: true, startAt: true },
      });
      const assignmentHistory = await tx.lineAssignment.findMany({
        where: { employeeId: { in: eligibleWorkerIds } },
        select: { employeeId: true },
        distinct: ["employeeId"],
      });
      const employeeIdsWithHistory = new Set(
        assignmentHistory.map((assignment) => assignment.employeeId)
      );
      const workerById = new Map(workerRows.map((worker) => [worker.id, worker]));
      const currentAssignmentByEmployee = new Map<
        number,
        { id: number; lineId: number; startAt: Date }
      >();
      activeAssignments.forEach((assignment) => {
        currentAssignmentByEmployee.set(assignment.employeeId, assignment);
      });

      const assignmentsToCreate: Array<{
        employeeId: number;
        lineId: number;
        startAt: Date;
      }> = [];
      const assignmentsToClose: Array<{ id: number; endAt: Date }> = [];
      const employeeIdsByLineId = new Map<number, number[]>();
      const todayKey = todayDateKey();

      eligibleWorkerIds.forEach((employeeId) => {
        const desiredLineKey = desiredLineKeyByEmployee.get(employeeId) ?? null;
        const desiredLineId = desiredLineKey ? lineKeyToId.get(desiredLineKey) ?? null : null;
        const currentAssignment = currentAssignmentByEmployee.get(employeeId) ?? null;
        const currentLineId = currentAssignment?.lineId ?? null;

        if (currentLineId !== desiredLineId) {
          const worker = workerById.get(employeeId);
          const joinedDateKey = toDateKeyInTimeZone(worker?.joinedAt);
          const leftDateKey = toDateKeyInTimeZone(worker?.leftAt);
          const defaultEffectiveDate =
            desiredLineId !== null && !employeeIdsWithHistory.has(employeeId)
              ? laterDateKey(joinedDateKey || managementStartDate, managementStartDate)
              : todayKey;
          const effectiveDate =
            effectiveDateByEmployee.get(employeeId) || defaultEffectiveDate;
          if (effectiveDate < managementStartDate) {
            throw createHttpError(
              400,
              "line assignment cannot start before factory managementStartDate"
            );
          }
          if (joinedDateKey && effectiveDate < joinedDateKey) {
            throw createHttpError(400, "line assignment cannot start before joinedAt");
          }
          if (leftDateKey && effectiveDate > leftDateKey) {
            throw createHttpError(400, "line assignment cannot start after leftAt");
          }
          const effectiveStartAt = dateKeyToStableDate(effectiveDate);
          const priorEndAt = dateKeyToStableDate(previousDateKey(effectiveDate));
          if (!effectiveStartAt || !priorEndAt) {
            throw createHttpError(400, "invalid line assignment effectiveDate");
          }
          if (currentAssignment) {
            const currentStartDateKey = toDateKeyInTimeZone(currentAssignment.startAt);
            if (currentStartDateKey && effectiveDate <= currentStartDateKey) {
              throw createHttpError(
                409,
                "new line assignment must start after the current assignment start date"
              );
            }
            assignmentsToClose.push({ id: currentAssignment.id, endAt: priorEndAt });
          }
          if (desiredLineId !== null) {
            assignmentsToCreate.push({
              employeeId,
              lineId: desiredLineId,
              startAt: effectiveStartAt,
            });
          }
        }
        if (desiredLineId !== null) {
          const currentEmployeeIds = employeeIdsByLineId.get(desiredLineId) ?? [];
          currentEmployeeIds.push(employeeId);
          employeeIdsByLineId.set(desiredLineId, currentEmployeeIds);
        }
      });

      for (const assignment of assignmentsToClose) {
        await tx.lineAssignment.update({
          where: { id: assignment.id },
          data: { endAt: assignment.endAt },
        });
      }

      if (assignmentsToCreate.length > 0) {
        await tx.lineAssignment.createMany({
          data: assignmentsToCreate,
        });
      }

      for (const line of parsedLines) {
        const lineId = lineKeyToId.get(line.lineKey);
        if (!lineId) continue;
        await tx.line.update({
          where: { id: lineId },
          data: { managerEmployeeId: line.managerEmployeeId ?? null },
        });
      }

      if (eligibleWorkerIds.length > 0) {
        await tx.employee.updateMany({
          where: {
            orgId: organization.id,
            id: { in: eligibleWorkerIds },
            OR: [{ factoryId: null }, { factoryId: { not: factoryIdNum } }],
          },
          data: { factoryId: factoryIdNum },
        });

        await tx.employee.updateMany({
          where: {
            orgId: organization.id,
            id: { in: eligibleWorkerIds },
          },
          data: { lineId: null },
        });
      }

      for (const line of parsedLines) {
        const lineId = lineKeyToId.get(line.lineKey);
        if (!lineId) continue;
        const employeeIds = employeeIdsByLineId.get(lineId) ?? [];
        if (employeeIds.length === 0) continue;
        await tx.employee.updateMany({
          where: {
            orgId: organization.id,
            id: { in: employeeIds },
          },
          data: { lineId },
        });
      }

      return tx.line.findMany({
        where: { orgId: organization.id, factoryId: factoryIdNum },
        orderBy: [{ id: "asc" }],
      });
    });

    const snapshot = await buildFactoryLineBoardSnapshot(organization.id, factoryIdNum);
    return res.json({
      ok: true,
      lines: snapshot.lines.length > 0 ? snapshot.lines : refreshedLines,
      workers: snapshot.workers,
    });
  });

  lineRouter.patch("/lines/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const existing = await prisma.line.findFirst({
      where: { id, orgId: organization.id },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "line not found" });
    }

    const { name, isActive, managerEmployeeId } = req.body ?? {};
    const data: any = {};

    if (typeof name === "string") {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ ok: false, error: "name is required" });
      }
      const nameConflict = await prisma.line.findFirst({
        where: {
          factoryId: existing.factoryId,
          orgId: organization.id,
          name: trimmedName,
          NOT: { id: existing.id },
        },
      });
      if (nameConflict) {
        return res.status(409).json({ ok: false, error: "line already exists" });
      }
      data.name = trimmedName;
    }

    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    if (managerEmployeeId !== undefined) {
      if (managerEmployeeId === null || managerEmployeeId === "") {
        data.managerEmployeeId = null;
      } else {
        const managerIdNum = Number(managerEmployeeId);
        if (!Number.isFinite(managerIdNum)) {
          return res.status(400).json({ ok: false, error: "invalid managerEmployeeId" });
        }

        const todayRange = buildEffectiveDateRange(null);
        const manager = await prisma.employee.findFirst({
          where: {
            id: managerIdNum,
            orgId: organization.id,
            factoryId: existing.factoryId,
            ...buildLineEligibleWorkerWhere(todayRange),
          },
        });
        if (!manager) {
          return res.status(404).json({ ok: false, error: "manager not found" });
        }

        const activeAssignment = await prisma.lineAssignment.findFirst({
          where: { lineId: existing.id, employeeId: manager.id, endAt: null },
        });
        if (!activeAssignment) {
          return res.status(400).json({
            ok: false,
            error: "manager must be assigned to the line first",
          });
        }

        data.managerEmployeeId = manager.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "no changes provided" });
    }

    const updated = await prisma.line.update({
      where: { id: existing.id },
      data,
    });

    return res.json(updated);
  });

  lineRouter.delete("/lines/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const existing = await prisma.line.findFirst({
      where: { id, orgId: organization.id },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "line not found" });
    }

    let movedWorkers = 0;

    await prisma.$transaction(async (tx) => {
      const activeAssignments = await tx.lineAssignment.findMany({
        where: { lineId: existing.id, endAt: null },
        select: { employeeId: true },
      });

      const assignedEmployeeIds = activeAssignments.map((assignment) => assignment.employeeId);
      movedWorkers = assignedEmployeeIds.length;

      if (assignedEmployeeIds.length > 0) {
        await tx.employee.updateMany({
          where: { id: { in: assignedEmployeeIds }, orgId: organization.id },
          data: { lineId: null },
        });
      }

      await tx.lineAssignment.deleteMany({
        where: { lineId: existing.id },
      });

      const planRows = await tx.assignmentPlan.findMany({
        where: { lineId: existing.id, orgId: organization.id },
        select: { id: true },
      });
      const planIds = planRows.map((plan) => plan.id);
      if (planIds.length > 0) {
        const linkedWorkRecordCount = await tx.workRecord.count({
          where: { assignmentPlanId: { in: planIds } },
        });
        if (linkedWorkRecordCount > 0) {
          throw createHttpError(409, "line has assignment plans with work records");
        }
        await tx.assignmentPlan.deleteMany({
          where: { id: { in: planIds } },
        });
      }

      await tx.line.delete({
        where: { id: existing.id },
      });
    });

    return res.json({ ok: true, movedWorkers });
  });

  lineRouter.get("/line-workers", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const factoryId = Number(req.query.factoryId);
    const hasFactoryFilter = Number.isFinite(factoryId);
    const lineId = Number(req.query.lineId);
    const hasLineFilter = Number.isFinite(lineId) && lineId > 0;
    const summaryOnly = req.query.summary === "1" || req.query.summary === "true";
    const workDateInput = resolveOptionalString(req.query.workDate, null);
    const hasWorkDateFilter = Boolean(workDateInput);
    const normalizedWorkDate = hasWorkDateFilter ? normalizeDateKey(workDateInput) : null;
    if (hasWorkDateFilter && !normalizedWorkDate) {
      return res.status(400).json({ ok: false, error: "invalid workDate" });
    }
    if (hasWorkDateFilter && !hasLineFilter && !hasFactoryFilter) {
      return res.status(400).json({
        ok: false,
        error: "factoryId or lineId is required when workDate is provided",
      });
    }
    const effectiveDateRange = buildEffectiveDateRange(normalizedWorkDate);
    if (!effectiveDateRange) {
      return res.status(400).json({ ok: false, error: "invalid workDate" });
    }

    if (hasFactoryFilter) {
      const factory = await prisma.factory.findFirst({
        where: { id: factoryId, orgId: organization.id },
      });
      if (!factory) {
        return res.status(404).json({ ok: false, error: "factory not found" });
      }
    }

    if (hasLineFilter) {
      const line = await prisma.line.findFirst({
        where: {
          id: lineId,
          orgId: organization.id,
          ...(hasFactoryFilter ? { factoryId } : {}),
        },
        select: { id: true, factoryId: true },
      });
      if (!line) {
        return res.status(404).json({ ok: false, error: "line not found" });
      }

      try {
        await syncEmployeeFactoryForLine({
          orgId: organization.id,
          lineId: line.id,
          lineFactoryId: line.factoryId,
        });
      } catch (error) {
        console.warn(
          `[line-workers] orgId=${organization.id} lineId=${line.id} failed to sync employee.factoryId: ${
            resolveOptionalString((error as any)?.message, String(error || ""))
          }`
        );
      }

      const dateRange = normalizedWorkDate ? effectiveDateRange : null;

      const assignments = await prisma.lineAssignment.findMany({
        where: {
          lineId: line.id,
          ...(dateRange
            ? {
                startAt: { lte: dateRange.endAt },
                OR: [{ endAt: null }, { endAt: { gte: dateRange.startAt } }],
              }
            : { endAt: null }),
        },
        select: { employeeId: true, lineId: true },
        orderBy: [{ employeeId: "asc" }],
      });
      const employeeIds = Array.from(
        new Set(assignments.map((assignment) => assignment.employeeId))
      );
      if (summaryOnly) {
        const eligibleWorkerCount = await prisma.employee.count({
          where: {
            orgId: organization.id,
            id: { in: employeeIds },
            ...(hasFactoryFilter ? { factoryId } : {}),
            ...buildLineEligibleWorkerWhere(effectiveDateRange),
          },
        });
        return res.json(
          eligibleWorkerCount > 0
            ? [{ lineId: line.id, workerCount: eligibleWorkerCount }]
            : []
        );
      }
      if (employeeIds.length === 0) {
        return res.json([]);
      }

      const workers = await prisma.employee.findMany({
        where: {
          orgId: organization.id,
          id: { in: employeeIds },
          ...(hasFactoryFilter ? { factoryId } : {}),
          ...buildLineEligibleWorkerWhere(effectiveDateRange),
        },
        orderBy: [{ factoryId: "asc" }, { id: "asc" }],
      });
      const assignmentByEmployee = new Map();
      assignments.forEach((assignment) => {
        assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
      });

      return res.json(
        workers.map((worker) => ({
          id: worker.id,
          orgMembershipId: worker.id,
          name: worker.name,
          email: worker.email ?? "",
          factoryId: worker.factoryId,
          currentLineId: assignmentByEmployee.get(worker.id) ?? null,
        }))
      );
    }

    const dateRange = normalizedWorkDate ? effectiveDateRange : null;

    const assignmentWhere: Prisma.LineAssignmentWhereInput = {
      line: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
      },
      ...(dateRange
        ? {
            startAt: { lte: dateRange.endAt },
            OR: [{ endAt: null }, { endAt: { gte: dateRange.startAt } }],
          }
        : { endAt: null }),
    };

    if (summaryOnly) {
      const assignments = await prisma.lineAssignment.findMany({
        where: assignmentWhere,
        select: { employeeId: true, lineId: true },
      });
      const eligibleEmployeeIds = Array.from(
        new Set(assignments.map((assignment) => Number(assignment.employeeId)))
      );
      const eligibleRows =
        eligibleEmployeeIds.length > 0
          ? await prisma.employee.findMany({
              where: {
                orgId: organization.id,
                id: { in: eligibleEmployeeIds },
                ...(hasFactoryFilter ? { factoryId } : {}),
                ...buildLineEligibleWorkerWhere(effectiveDateRange),
              },
              select: { id: true },
            })
          : [];
      const eligibleEmployeeIdSet = new Set(
        eligibleRows.map((employee) => Number(employee.id))
      );
      const employeeIdsByLine = assignments.reduce((map, assignment) => {
        const employeeId = Number(assignment.employeeId);
        if (!eligibleEmployeeIdSet.has(employeeId)) return map;
        const key = Number(assignment.lineId);
        const current = map.get(key) ?? new Set<number>();
        current.add(employeeId);
        map.set(key, current);
        return map;
      }, new Map<number, Set<number>>());
      return res.json(
        Array.from(employeeIdsByLine.entries())
          .map(([currentLineId, employeeIds]) => ({
            lineId: currentLineId,
            workerCount: employeeIds.size,
          }))
          .sort((a, b) => a.lineId - b.lineId)
      );
    }

    const [workers, assignments] = await Promise.all([
      prisma.employee.findMany({
        where: {
          orgId: organization.id,
          ...(hasFactoryFilter ? { factoryId } : {}),
          ...buildLineEligibleWorkerWhere(effectiveDateRange),
        },
        orderBy: [{ factoryId: "asc" }, { id: "asc" }],
      }),
      prisma.lineAssignment.findMany({
        where: assignmentWhere,
        select: { employeeId: true, lineId: true },
      }),
    ]);

    const assignmentByEmployee = new Map();
    assignments.forEach((assignment) => {
      assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
    });

    return res.json(
      workers.map((worker) => ({
        id: worker.id,
        orgMembershipId: worker.id,
        name: worker.name,
        email: worker.email ?? "",
        factoryId: worker.factoryId,
        currentLineId: assignmentByEmployee.get(worker.id) ?? null,
      }))
    );
  });

  lineRouter.post("/line-assignments/assign", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const { lineId, employeeId } = req.body ?? {};
    const lineIdNum = Number(lineId);
    const employeeIdNum = Number(employeeId);
    if (!Number.isFinite(lineIdNum) || !Number.isFinite(employeeIdNum)) {
      return res.status(400).json({
        ok: false,
        error: "lineId and employeeId are required",
      });
    }

    const line = await prisma.line.findFirst({
      where: { id: lineIdNum, orgId: organization.id },
    });
    if (!line) {
      return res.status(404).json({ ok: false, error: "line not found" });
    }

    const todayRange = buildEffectiveDateRange(null);
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeIdNum,
        orgId: organization.id,
        factoryId: line.factoryId,
        ...buildLineEligibleWorkerWhere(todayRange),
      },
    });
    if (!employee) {
      return res.status(404).json({ ok: false, error: "worker not found" });
    }

    const now = new Date();
    const previousLineIds = await closeActiveLineAssignments(employee.id, now);

    const assignment = await prisma.lineAssignment.create({
      data: {
        lineId: line.id,
        employeeId: employee.id,
        startAt: now,
      },
    });

    await prisma.employee.update({
      where: { id: employee.id },
      data: { lineId: line.id, factoryId: line.factoryId },
    });

    const affectedLineIds = [...new Set([...previousLineIds, line.id])];
    const lineHeadcounts = await updateLineHeadcounts(affectedLineIds);

    return res.status(201).json({ ...assignment, lineHeadcounts });
  });

  lineRouter.get("/line-assignments/history", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    const employeeId = Number(req.query.employeeId);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ ok: false, error: "employeeId is required" });
    }
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId: organization.id },
      select: { id: true },
    });
    if (!employee) {
      return res.status(404).json({ ok: false, error: "worker not found" });
    }
    const rows = await prisma.lineAssignment.findMany({
      where: { employeeId, line: { orgId: organization.id } },
      include: { line: { select: { id: true, name: true } } },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
    });
    return res.json(
      rows.map((row) => ({
        id: row.id,
        lineId: row.lineId,
        lineName: row.line.name,
        startDate: toDateKeyInTimeZone(row.startAt),
        endDate: toDateKeyInTimeZone(row.endAt) || null,
      }))
    );
  });

  lineRouter.get("/line-assignment-history-candidates", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    const factoryId = Number(req.query.factoryId);
    if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
      return res.status(400).json({ ok: false, error: "factoryId is required" });
    }
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
      select: { id: true, managementStartDate: true },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
    const workers = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        orgRole: "WORKER",
        status: { in: ["ACTIVE", "TERMINATED"] },
        role: { code: LINE_ELIGIBLE_WORKER_ROLE_CODE },
        joinedAt: { not: null },
        leftAt: { lte: dateKeyToStableDate(todayDateKey())! },
      },
      select: {
        id: true,
        name: true,
        email: true,
        factoryId: true,
        joinedAt: true,
        leftAt: true,
        status: true,
        lineAssignments: {
          select: { startAt: true, endAt: true },
          orderBy: [{ startAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ leftAt: "desc" }, { name: "asc" }, { id: "asc" }],
    });
    return res.json(
      workers.flatMap((worker) => {
        const joinedDate = toDateKeyInTimeZone(worker.joinedAt);
        const leftDate = toDateKeyInTimeZone(worker.leftAt);
        const managementStartDate =
          toDateKeyInTimeZone(factory.managementStartDate) || DEFAULT_FACTORY_MANAGEMENT_START_DATE;
        const managedStartDate = laterDateKey(joinedDate || managementStartDate, managementStartDate);
        if (!leftDate || leftDate < managedStartDate) return [];
        const uncoveredRange = findFirstUncoveredLineAssignmentRange({
          joinedDate: managedStartDate,
          leftDate,
          assignments: worker.lineAssignments,
        });
        if (!uncoveredRange) return [];
        const { lineAssignments: _lineAssignments, ...workerFields } = worker;
        return [{
          ...workerFields,
          joinedDate,
          leftDate,
          managementStartDate,
          suggestedStartDate: uncoveredRange.startDate,
          suggestedEndDate: uncoveredRange.endDate,
          isHistoricalCandidate: true,
        }];
      })
    );
  });

  lineRouter.get("/line-terminated-workers", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }
    const factoryId = Number(req.query.factoryId);
    if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
      return res.status(400).json({ ok: false, error: "factoryId is required" });
    }
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
      select: { id: true },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
    const workers = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        orgRole: "WORKER",
        role: { code: LINE_ELIGIBLE_WORKER_ROLE_CODE },
        OR: [
          { status: "TERMINATED" },
          { leftAt: { lte: dateKeyToStableDate(todayDateKey())! } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        factoryId: true,
        joinedAt: true,
        leftAt: true,
        status: true,
      },
      orderBy: [{ leftAt: "desc" }, { name: "asc" }, { id: "asc" }],
    });
    return res.json(
      workers.map((worker) => ({
        ...worker,
        joinedDate: toDateKeyInTimeZone(worker.joinedAt),
        leftDate: toDateKeyInTimeZone(worker.leftAt),
      }))
    );
  });

  lineRouter.post("/line-assignments/history", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    const employeeId = Number(req.body?.employeeId);
    const lineId = Number(req.body?.lineId);
    const startDate = normalizeDateKey(req.body?.startDate);
    const endDate = normalizeDateKey(req.body?.endDate);
    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId <= 0 ||
      !Number.isSafeInteger(lineId) ||
      lineId <= 0 ||
      !startDate ||
      !endDate ||
      startDate > endDate
    ) {
      return res.status(400).json({ ok: false, error: "invalid historical assignment" });
    }
    const [employee, line] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: employeeId, orgId: organization.id, orgRole: "WORKER" },
        select: { id: true, factoryId: true, joinedAt: true, leftAt: true },
      }),
      prisma.line.findFirst({
        where: { id: lineId, orgId: organization.id },
        select: {
          id: true,
          factoryId: true,
          factory: { select: { managementStartDate: true } },
        },
      }),
    ]);
    if (!employee || !line || employee.factoryId !== line.factoryId) {
      return res.status(404).json({ ok: false, error: "worker or line not found" });
    }
    const joinedDate = toDateKeyInTimeZone(employee.joinedAt);
    const leftDate = toDateKeyInTimeZone(employee.leftAt);
    const managementStartDate =
      toDateKeyInTimeZone(line.factory.managementStartDate) || DEFAULT_FACTORY_MANAGEMENT_START_DATE;
    const managedStartDate = laterDateKey(joinedDate || managementStartDate, managementStartDate);
    if (
      startDate < managedStartDate ||
      (leftDate && endDate > leftDate)
    ) {
      return res.status(400).json({ ok: false, error: "assignment outside employment period" });
    }
    const startAt = dateKeyToStableDate(startDate)!;
    const endAt = dateKeyToStableDate(endDate)!;
    const overlap = await prisma.lineAssignment.findFirst({
      where: {
        employeeId,
        startAt: { lte: endAt },
        OR: [{ endAt: null }, { endAt: { gte: startAt } }],
      },
      select: { id: true },
    });
    if (overlap) {
      return res.status(409).json({ ok: false, error: "line assignment periods overlap" });
    }
    const created = await prisma.lineAssignment.create({
      data: { employeeId, lineId, startAt, endAt },
    });
    const allAssignments = await prisma.lineAssignment.findMany({
      where: { employeeId },
      select: { startAt: true, endAt: true },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });
    const uncoveredRange = findFirstUncoveredLineAssignmentRange({
      joinedDate: managedStartDate,
      leftDate,
      assignments: allAssignments,
    });
    return res.status(201).json({
      id: created.id,
      employeeId,
      lineId,
      startDate,
      endDate,
      coverageComplete: uncoveredRange === null,
      nextSuggestedStartDate: uncoveredRange?.startDate ?? null,
      nextSuggestedEndDate: uncoveredRange?.endDate ?? null,
    });
  });

  lineRouter.patch("/line-assignments/:id", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    const assignmentId = Number(req.params.id);
    if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid assignment id" });
    }
    const startDate = normalizeDateKey(req.body?.startDate);
    const endDateInput = req.body?.endDate;
    const endDate = endDateInput ? normalizeDateKey(endDateInput) : "";
    if (!startDate || (endDateInput && !endDate) || (endDate && startDate > endDate)) {
      return res.status(400).json({ ok: false, error: "invalid assignment date range" });
    }
    const assignment = await prisma.lineAssignment.findFirst({
      where: { id: assignmentId, line: { orgId: organization.id } },
      include: {
        employee: { select: { joinedAt: true, leftAt: true } },
        line: { include: { factory: { select: { managementStartDate: true } } } },
      },
    });
    if (!assignment) {
      return res.status(404).json({ ok: false, error: "line assignment not found" });
    }
    const joinedDate = toDateKeyInTimeZone(assignment.employee.joinedAt);
    const leftDate = toDateKeyInTimeZone(assignment.employee.leftAt);
    const managementStartDate =
      toDateKeyInTimeZone(assignment.line.factory.managementStartDate) ||
      DEFAULT_FACTORY_MANAGEMENT_START_DATE;
    const managedStartDate = laterDateKey(joinedDate || managementStartDate, managementStartDate);
    if (startDate < managedStartDate) {
      return res.status(400).json({
        ok: false,
        error: "assignment starts before employment or factory management period",
      });
    }
    if (leftDate && (!endDate || endDate > leftDate)) {
      return res.status(400).json({ ok: false, error: "assignment ends after leftAt" });
    }
    const startAt = dateKeyToStableDate(startDate)!;
    const endAt = endDate ? dateKeyToStableDate(endDate) : null;
    const overlap = await prisma.lineAssignment.findFirst({
      where: {
        employeeId: assignment.employeeId,
        id: { not: assignment.id },
        startAt: { lte: endAt ?? new Date("9999-12-31T12:00:00.000Z") },
        OR: [{ endAt: null }, { endAt: { gte: startAt } }],
      },
      select: { id: true },
    });
    if (overlap) {
      return res.status(409).json({ ok: false, error: "line assignment periods overlap" });
    }
    const updated = await prisma.lineAssignment.update({
      where: { id: assignment.id },
      data: { startAt, endAt },
    });
    return res.json({
      id: updated.id,
      startDate: toDateKeyInTimeZone(updated.startAt),
      endDate: toDateKeyInTimeZone(updated.endAt) || null,
    });
  });

  lineRouter.post("/line-assignments/unassign", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no lines" });
    }

    const { employeeId } = req.body ?? {};
    const employeeIdNum = Number(employeeId);
    if (!Number.isFinite(employeeIdNum)) {
      return res.status(400).json({ ok: false, error: "employeeId is required" });
    }

    const employee = await prisma.employee.findFirst({
      where: { id: employeeIdNum, orgId: organization.id },
    });
    if (!employee) {
      return res.status(404).json({ ok: false, error: "worker not found" });
    }

    const affectedLineIds = await closeActiveLineAssignments(employee.id, new Date());
    const lineHeadcounts = await updateLineHeadcounts(affectedLineIds);

    return res.json({ ok: true, lineHeadcounts });
  });

  return lineRouter;
};
