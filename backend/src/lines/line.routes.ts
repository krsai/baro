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

const updateLineHeadcounts = async (lineIds: number[]): Promise<Record<number, number>> => {
  if (lineIds.length === 0) return {};
  const uniqueIds = [...new Set(lineIds)];
  const result: Record<number, number> = {};
  await Promise.all(
    uniqueIds.map(async (lineId) => {
      const count = await prisma.lineAssignment.count({
        where: { lineId, endAt: null },
      });
      result[lineId] = count;
    })
  );
  return result;
};

const buildFactoryLineBoardSnapshot = async (orgId: number, factoryId: number) => {
  const [lines, workers, assignments] = await Promise.all([
    prisma.line.findMany({
      where: { orgId, factoryId },
      orderBy: [{ id: "asc" }],
    }),
    prisma.employee.findMany({
      where: {
        orgId,
        factoryId,
        membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
      },
      include: { membership: true },
      orderBy: [{ factoryId: "asc" }, { id: "asc" }],
    }),
    prisma.lineAssignment.findMany({
      where: {
        line: { orgId, factoryId },
        endAt: null,
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

    const workerRows = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId: factoryIdNum,
        membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
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
          },
          data: { lineName: null },
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
          data: { lineName: line.name },
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

        const manager = await prisma.employee.findFirst({
          where: {
            id: managerIdNum,
            orgId: organization.id,
            factoryId: existing.factoryId,
            membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
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

    if (typeof data.name === "string" && data.name.trim()) {
      await prisma.employee.updateMany({
        where: {
          orgId: organization.id,
          lineAssignments: {
            some: {
              lineId: updated.id,
              endAt: null,
            },
          },
        },
        data: { lineName: updated.name },
      });
    }

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
          data: { lineName: null },
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

      const dateRange = normalizedWorkDate ? buildWorkDateRange(normalizedWorkDate) : null;
      if (normalizedWorkDate && !dateRange) {
        return res.status(400).json({ ok: false, error: "invalid workDate" });
      }

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
        return res.json(
          employeeIds.length > 0
            ? [{ lineId: line.id, workerCount: employeeIds.length }]
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

    const dateRange = normalizedWorkDate ? buildWorkDateRange(normalizedWorkDate) : null;
    if (normalizedWorkDate && !dateRange) {
      return res.status(400).json({ ok: false, error: "invalid workDate" });
    }

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
      const employeeIdsByLine = assignments.reduce((map, assignment) => {
        const key = Number(assignment.lineId);
        const current = map.get(key) ?? new Set<number>();
        current.add(Number(assignment.employeeId));
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
          membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
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

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeIdNum,
        orgId: organization.id,
        factoryId: line.factoryId,
        membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
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
      data: { lineName: line.name },
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
