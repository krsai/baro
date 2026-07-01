import { Prisma, type OrgUserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";

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

const buildEffectiveDateRange = (workDate: unknown) =>
  buildWorkDateRange(normalizeDateKey(workDate) || todayDateKey());

const buildLineEligibleWorkerWhere = (
  dateRange: { startAt: Date; endAt: Date } | null = null
): Prisma.EmployeeWhereInput => ({
  membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
  role: { code: LINE_ELIGIBLE_WORKER_ROLE_CODE },
  ...(dateRange
    ? {
        AND: [
          { OR: [{ joinedAt: null }, { joinedAt: { lte: dateRange.endAt } }] },
          // ACTIVE membership is treated as currently employed even if legacy
          // leftAt data remains populated.
          { membership: { status: "ACTIVE" } },
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
  const [lines, workers, assignments] = await Promise.all([
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
      include: { membership: true },
      orderBy: [{ factoryId: "asc" }, { id: "asc" }],
    }),
    prisma.lineAssignment.findMany({
      where: {
        line: { orgId, factoryId },
        endAt: null,
        employee: buildLineEligibleWorkerWhere(todayRange),
      },
      select: { employeeId: true, lineId: true },
    }),
  ]);

  const assignmentByEmployee = new Map<number, number>();
  assignments.forEach((assignment) => {
    assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
  });

  return {
    lines,
    workers: workers.map((worker) => ({
      id: worker.id,
      orgMembershipId: worker.orgMembershipId,
      name: worker.name,
      email: worker.membership?.email ?? "",
      factoryId: worker.factoryId,
      currentLineId: assignmentByEmployee.get(worker.id) ?? null,
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
      const membership = await prisma.orgMembership.findUnique({
        where: {
          orgId_email: {
            orgId: organization.id,
            email: requesterEmail,
          },
        },
        select: {
          status: true,
          employee: {
            select: { id: true },
          },
        },
      });
      if (!membership || membership.status !== "ACTIVE" || !membership.employee?.id) {
        return res.json([]);
      }
      managerEmployeeId = membership.employee.id;
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
      select: { id: true },
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
          await tx.workRecord.updateMany({
            where: { assignmentPlanId: { in: planIds } },
            data: { assignmentPlanId: null },
          });
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
        select: { employeeId: true, lineId: true },
      });
      const currentLineIdByEmployee = new Map<number, number>();
      activeAssignments.forEach((assignment) => {
        currentLineIdByEmployee.set(assignment.employeeId, assignment.lineId);
      });

      const employeesToClose: number[] = [];
      const assignmentsToCreate: Array<{
        employeeId: number;
        lineId: number;
        startAt: Date;
      }> = [];
      const employeeIdsByLineId = new Map<number, number[]>();
      const now = new Date();

      eligibleWorkerIds.forEach((employeeId) => {
        const desiredLineKey = desiredLineKeyByEmployee.get(employeeId) ?? null;
        const desiredLineId = desiredLineKey ? lineKeyToId.get(desiredLineKey) ?? null : null;
        const currentLineId = currentLineIdByEmployee.get(employeeId) ?? null;

        if (currentLineId !== desiredLineId && currentLineId !== null) {
          employeesToClose.push(employeeId);
        }
        if (desiredLineId !== null && currentLineId !== desiredLineId) {
          assignmentsToCreate.push({
            employeeId,
            lineId: desiredLineId,
            startAt: now,
          });
        }
        if (desiredLineId !== null) {
          const currentEmployeeIds = employeeIdsByLineId.get(desiredLineId) ?? [];
          currentEmployeeIds.push(employeeId);
          employeeIdsByLineId.set(desiredLineId, currentEmployeeIds);
        }
      });

      if (employeesToClose.length > 0) {
        await tx.lineAssignment.updateMany({
          where: {
            employeeId: { in: employeesToClose },
            endAt: null,
          },
          data: { endAt: now },
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
          include: { membership: true },
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
        await tx.workRecord.updateMany({
          where: { assignmentPlanId: { in: planIds } },
          data: { assignmentPlanId: null },
        });
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
        include: { membership: true },
        orderBy: [{ factoryId: "asc" }, { id: "asc" }],
      });
      const assignmentByEmployee = new Map();
      assignments.forEach((assignment) => {
        assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
      });

      return res.json(
        workers.map((worker) => ({
          id: worker.id,
          orgMembershipId: worker.orgMembershipId,
          name: worker.name,
          email: worker.membership?.email ?? "",
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
        include: { membership: true },
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
        orgMembershipId: worker.orgMembershipId,
        name: worker.name,
        email: worker.membership?.email ?? "",
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
      include: { membership: true },
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
