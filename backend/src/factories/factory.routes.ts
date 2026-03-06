import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery } from "../middleware/access";
import { toNumberOrNull } from "../utils/common";

type FactoryRoutesDeps = {
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
};

const FACTORY_WORK_SECONDS_PER_MONTH = 26 * 8 * 60 * 60;

const roundToScale = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const resolveFactoryWageFields = (
  targetMonthlyWageInput: unknown,
  wagePerSecondInput: unknown
): { targetMonthlyWage: number | null; wagePerSecond: number | null } => {
  const targetMonthlyWage = toNumberOrNull(targetMonthlyWageInput);
  if (targetMonthlyWage === null) {
    return {
      targetMonthlyWage: null,
      wagePerSecond: toNumberOrNull(wagePerSecondInput),
    };
  }
  return {
    targetMonthlyWage,
    wagePerSecond: roundToScale(targetMonthlyWage / FACTORY_WORK_SECONDS_PER_MONTH, 2),
  };
};

export const createFactoryRouter = ({ isManufacturerOrg }: FactoryRoutesDeps) => {
  const factoryRouter = Router();

  factoryRouter.get("/factories", async (req, res) => {
    const organization = await getOrganizationByQuery(req);

    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const factories = await prisma.factory.findMany({
      where: { orgId: organization.id },
      orderBy: { id: "asc" },
    });
    return res.json(factories);
  });

  factoryRouter.post("/factories", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no factories" });
    }
    const {
      name,
      address,
      countryCode,
      phoneNumber,
      manager,
      targetMonthlyWage,
      wagePerSecond,
    } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);

    const factory = await prisma.factory.create({
      data: {
        orgId: organization.id,
        name: name.trim(),
        address: address?.trim?.() ?? address ?? null,
        countryCode: countryCode?.trim?.() ?? countryCode ?? null,
        phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
        manager: manager?.trim?.() ?? manager ?? null,
        targetMonthlyWage: wageFields.targetMonthlyWage,
        wagePerSecond: wageFields.wagePerSecond,
      },
    });

    return res.status(201).json(factory);
  });

  factoryRouter.put("/factories/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no factories" });
    }
    const existing = await prisma.factory.findFirst({
      where: { id, orgId: organization.id },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }

    const {
      name,
      address,
      countryCode,
      phoneNumber,
      manager,
      targetMonthlyWage,
      wagePerSecond,
    } = req.body ?? {};
    const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);

    const factory = await prisma.factory.update({
      where: { id },
      data: {
        name: typeof name === "string" ? name.trim() : existing.name,
        address: address?.trim?.() ?? address ?? null,
        countryCode: countryCode?.trim?.() ?? countryCode ?? null,
        phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
        manager: manager?.trim?.() ?? manager ?? null,
        targetMonthlyWage: wageFields.targetMonthlyWage,
        wagePerSecond: wageFields.wagePerSecond,
      },
    });

    return res.json(factory);
  });

  factoryRouter.delete("/factories/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    if (!isManufacturerOrg(organization)) {
      return res.status(400).json({ ok: false, error: "brand organizations have no factories" });
    }

    const existing = await prisma.factory.findFirst({
      where: { id, orgId: organization.id },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }

    const deleted = await prisma.$transaction(
      async (tx) => {
        const lines = await tx.line.findMany({
          where: { orgId: organization.id, factoryId: existing.id },
          select: { id: true },
        });
        const lineIds = lines.map((line) => line.id);

        const employees = await tx.employee.findMany({
          where: { orgId: organization.id, factoryId: existing.id },
          select: { id: true, orgMembershipId: true },
        });
        const employeeIds = employees.map((employee) => employee.id);
        const membershipIds = employees.map((employee) => employee.orgMembershipId);

        if (employeeIds.length > 0) {
          await tx.line.updateMany({
            where: {
              orgId: organization.id,
              managerEmployeeId: { in: employeeIds },
            },
            data: { managerEmployeeId: null },
          });
        }

        let deletedAssignmentPlans = 0;
        if (lineIds.length > 0) {
          const result = await tx.assignmentPlan.deleteMany({
            where: {
              orgId: organization.id,
              lineId: { in: lineIds },
            },
          });
          deletedAssignmentPlans = result.count;
        }

        let deletedLineAssignments = 0;
        const assignmentWhereOr: any[] = [];
        if (lineIds.length > 0) {
          assignmentWhereOr.push({ lineId: { in: lineIds } });
        }
        if (employeeIds.length > 0) {
          assignmentWhereOr.push({ employeeId: { in: employeeIds } });
        }
        if (assignmentWhereOr.length > 0) {
          const result = await tx.lineAssignment.deleteMany({
            where: { OR: assignmentWhereOr },
          });
          deletedLineAssignments = result.count;
        }

        let deletedLines = 0;
        if (lineIds.length > 0) {
          const result = await tx.line.deleteMany({
            where: {
              orgId: organization.id,
              id: { in: lineIds },
            },
          });
          deletedLines = result.count;
        }

        let deletedEmployees = 0;
        if (employeeIds.length > 0) {
          const result = await tx.employee.deleteMany({
            where: {
              orgId: organization.id,
              id: { in: employeeIds },
            },
          });
          deletedEmployees = result.count;
        }

        let deletedMemberships = 0;
        if (membershipIds.length > 0) {
          const result = await tx.orgMembership.deleteMany({
            where: {
              orgId: organization.id,
              id: { in: membershipIds },
            },
          });
          deletedMemberships = result.count;
        }

        await tx.factory.delete({ where: { id: existing.id } });

        return {
          deletedLineAssignments,
          deletedAssignmentPlans,
          deletedLines,
          deletedEmployees,
          deletedMemberships,
        };
      },
      { maxWait: 20_000, timeout: 120_000 }
    );

    return res.json({
      ok: true,
      deletedFactoryId: existing.id,
      deletedFactoryName: existing.name,
      ...deleted,
    });
  });

  return factoryRouter;
};
