import { Router } from "express";
import { prisma } from "../db";
import { normalizeEmployeeNo } from "../employees/employeeNumber";
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  normalizeFactoryManagementStartDateKey,
  parseFactoryManagementStartDateInput,
} from "./factoryManagementStart";
import { getOrganizationByQuery } from "../middleware/access";
import { toNumberOrNull } from "../utils/common";

type FactoryRoutesDeps = {
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
};

const FACTORY_WORK_SECONDS_PER_MONTH = 26 * 8 * 60 * 60;
const FACTORY_EMPLOYEE_NUMBER_WIDTH = 4;
const FACTORY_DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  KR: "+82",
  VN: "+84",
};

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

const normalizeFactoryCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized.length < 2 || normalized.length > 3) return null;
  return normalized;
};

const rebuildEmployeeNoWithFactoryCode = (
  employeeNoInput: unknown,
  factoryCodeInput: unknown
): string | null => {
  const factoryCode = normalizeFactoryCode(factoryCodeInput);
  const normalizedEmployeeNo = normalizeEmployeeNo(employeeNoInput);
  if (!factoryCode || !normalizedEmployeeNo) return null;

  const suffixMatch = normalizedEmployeeNo.match(/(\d+)$/);
  const sequenceText = suffixMatch?.[1];
  if (!sequenceText) return null;

  return `${factoryCode}-${sequenceText.padStart(
    FACTORY_EMPLOYEE_NUMBER_WIDTH,
    "0"
  )}`;
};

const normalizeFactoryCountry = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
};

const normalizeFactoryCountryCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toUpperCase();
  if (normalized === "KR") return FACTORY_DIAL_CODE_BY_COUNTRY.KR ?? null;
  if (normalized === "VN") return FACTORY_DIAL_CODE_BY_COUNTRY.VN ?? null;
  return trimmed;
};

const normalizeOptionalFactoryText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const resolveFactoryPhoneFields = (params: {
  countryInput: unknown;
  countryCodeInput: unknown;
  fallbackCountry?: unknown;
  fallbackCountryCode?: unknown;
}): { country: string | null; countryCode: string | null } => {
  const countryFromInput = normalizeFactoryCountry(params.countryInput);
  const countryCodeFromInput = normalizeFactoryCountryCode(params.countryCodeInput);
  const fallbackCountry = normalizeFactoryCountry(params.fallbackCountry);
  const fallbackCountryCode = normalizeFactoryCountryCode(params.fallbackCountryCode);

  let country = countryFromInput ?? fallbackCountry;
  let countryCode = countryCodeFromInput ?? fallbackCountryCode;

  if (!country && countryCode === FACTORY_DIAL_CODE_BY_COUNTRY.KR) {
    country = "KR";
  } else if (!country && countryCode === FACTORY_DIAL_CODE_BY_COUNTRY.VN) {
    country = "VN";
  }

  if (!countryCode && country && FACTORY_DIAL_CODE_BY_COUNTRY[country]) {
    countryCode = FACTORY_DIAL_CODE_BY_COUNTRY[country] ?? null;
  }

  return {
    country,
    countryCode,
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
      nameKo,
      nameVi,
      factoryCode,
      managementStartDate,
      address,
      country,
      countryCode,
      phoneNumber,
      manager,
      targetMonthlyWage,
      wagePerSecond,
    } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const normalizedCode = normalizeFactoryCode(factoryCode);
    if (!normalizedCode) {
      return res.status(400).json({ ok: false, error: "factoryCode must be 2-3 uppercase English letters" });
    }
    const codeConflict = await prisma.factory.findFirst({
      where: { orgId: organization.id, factoryCode: normalizedCode },
    });
    if (codeConflict) {
      return res.status(409).json({ ok: false, error: "factoryCode already in use" });
    }
    const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);
    const phoneFields = resolveFactoryPhoneFields({
      countryInput: country,
      countryCodeInput: countryCode,
    });
    const managementStartDateResolved = parseFactoryManagementStartDateInput(
      managementStartDate,
      DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
    );
    if (managementStartDateResolved.error) {
      return res.status(400).json({ ok: false, error: managementStartDateResolved.error });
    }

    const factory = await prisma.factory.create({
      data: {
        orgId: organization.id,
        name: name.trim(),
        nameKo: normalizeOptionalFactoryText(nameKo),
        nameVi: normalizeOptionalFactoryText(nameVi),
        factoryCode: normalizedCode,
        managementStartDate: managementStartDateResolved.value,
        address: address?.trim?.() ?? address ?? null,
        country: phoneFields.country,
        countryCode: phoneFields.countryCode,
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
      nameKo,
      nameVi,
      factoryCode,
      managementStartDate,
      address,
      country,
      countryCode,
      phoneNumber,
      manager,
      targetMonthlyWage,
      wagePerSecond,
    } = req.body ?? {};

    let resolvedCode = (existing as any).factoryCode ?? null;
    if (factoryCode !== undefined) {
      const normalizedCode = normalizeFactoryCode(factoryCode);
      if (!normalizedCode) {
        return res.status(400).json({ ok: false, error: "factoryCode must be 2-3 uppercase English letters" });
      }
      const codeConflict = await prisma.factory.findFirst({
        where: { orgId: organization.id, factoryCode: normalizedCode, id: { not: id } },
      });
      if (codeConflict) {
        return res.status(409).json({ ok: false, error: "factoryCode already in use" });
      }
      resolvedCode = normalizedCode;
    }

    const previousCode = normalizeFactoryCode((existing as any)?.factoryCode);
    const nextCode = normalizeFactoryCode(resolvedCode);
    const shouldSyncEmployeeNumbers = Boolean(nextCode) && previousCode !== nextCode;
    const employeeRowsToSync = shouldSyncEmployeeNumbers
      ? await prisma.employee.findMany({
          where: {
            orgId: organization.id,
            factoryId: existing.id,
          },
          select: {
            id: true,
            employeeNo: true,
          },
          orderBy: [{ id: "asc" }],
        })
      : [];
    const employeeNumberUpdates = employeeRowsToSync
      .map((employee) => {
        const nextEmployeeNo = rebuildEmployeeNoWithFactoryCode(
          employee.employeeNo,
          nextCode
        );
        if (!nextEmployeeNo) return null;
        const currentEmployeeNo = normalizeEmployeeNo(employee.employeeNo);
        if (currentEmployeeNo === nextEmployeeNo) return null;
        return {
          id: employee.id,
          employeeNo: nextEmployeeNo,
        };
      })
      .filter((row): row is { id: number; employeeNo: string } => Boolean(row));

    if (employeeNumberUpdates.length > 0) {
      const duplicateEmployeeNo = employeeNumberUpdates.find((candidate, index, rows) =>
        rows.findIndex((row) => row.employeeNo === candidate.employeeNo) !== index
      );
      if (duplicateEmployeeNo) {
        return res.status(409).json({
          ok: false,
          error:
            "factoryCode change would create duplicate employee numbers in this factory",
        });
      }

      const conflictingEmployees = await prisma.employee.findMany({
        where: {
          orgId: organization.id,
          id: { notIn: employeeNumberUpdates.map((row) => row.id) },
          employeeNo: { in: employeeNumberUpdates.map((row) => row.employeeNo) },
        },
        select: {
          id: true,
          employeeNo: true,
        },
        orderBy: [{ id: "asc" }],
      });
      if (conflictingEmployees.length > 0) {
        return res.status(409).json({
          ok: false,
          error:
            "factoryCode change would conflict with existing employee numbers",
        });
      }
    }

    const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);
    const phoneFields = resolveFactoryPhoneFields({
      countryInput: country,
      countryCodeInput: countryCode,
      fallbackCountry: (existing as any)?.country ?? null,
      fallbackCountryCode: existing.countryCode,
    });
    const managementStartDateResolved = parseFactoryManagementStartDateInput(
      managementStartDate,
      normalizeFactoryManagementStartDateKey((existing as any)?.managementStartDate)
    );
    if (managementStartDateResolved.error) {
      return res.status(400).json({ ok: false, error: managementStartDateResolved.error });
    }

    let factory;
    try {
      factory = await prisma.$transaction(async (tx) => {
        const updatedFactory = await tx.factory.update({
          where: { id },
          data: {
            name: typeof name === "string" ? name.trim() : existing.name,
            nameKo:
              nameKo !== undefined
                ? normalizeOptionalFactoryText(nameKo)
                : (existing as any)?.nameKo ?? null,
            nameVi:
              nameVi !== undefined
                ? normalizeOptionalFactoryText(nameVi)
                : (existing as any)?.nameVi ?? null,
            factoryCode: resolvedCode,
            managementStartDate: managementStartDateResolved.value,
            address: address?.trim?.() ?? address ?? null,
            country: phoneFields.country,
            countryCode: phoneFields.countryCode,
            phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
            manager: manager?.trim?.() ?? manager ?? null,
            targetMonthlyWage: wageFields.targetMonthlyWage,
            wagePerSecond: wageFields.wagePerSecond,
          },
        });

        for (const employeeUpdate of employeeNumberUpdates) {
          await tx.employee.update({
            where: { id: employeeUpdate.id },
            data: { employeeNo: employeeUpdate.employeeNo },
          });
        }

        return updatedFactory;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({
          ok: false,
          error:
            "factoryCode change would conflict with existing employee numbers",
        });
      }
      throw error;
    }

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
          const planRows = await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              lineId: { in: lineIds },
            },
            select: { id: true },
          });
          const planIds = planRows.map((plan) => plan.id);
          if (planIds.length > 0) {
            await tx.workRecord.updateMany({
              where: { assignmentPlanId: { in: planIds } },
              data: { assignmentPlanId: null },
            });
          }
          const result =
            planIds.length > 0
              ? await tx.assignmentPlan.deleteMany({
                  where: { id: { in: planIds } },
                })
              : { count: 0 };
          deletedAssignmentPlans = Number(result?.count || 0);
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
