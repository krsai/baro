import { Router } from "express";
import { prisma } from "../db";
import { normalizeEmployeeNo } from "../employees/employeeNumber";
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  normalizeFactoryManagementStartDateKey,
  parseFactoryManagementStartDateInput,
} from "./factoryManagementStart";
import { getOrganizationByQuery } from "../middleware/access";
import { toNumberOrNull, toPositiveIntOrNull } from "../utils/common";
import { createHttpError } from "../utils/http";

type FactoryRoutesDeps = {
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
};

const FACTORY_DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  KR: "+82",
  VN: "+84",
};
const FACTORY_MANAGER_EMPLOYEE_SELECT = {
  id: true,
  name: true,
  employeeNo: true,
  factoryId: true,
  orgId: true,
} as const;

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

const resolveFactoryWageUpdateFields = (params: {
  targetMonthlyWageInput: unknown;
  wagePerSecondInput: unknown;
  fallbackTargetMonthlyWage: unknown;
  fallbackWagePerSecond: unknown;
}): { targetMonthlyWage: number | null; wagePerSecond: number | null } => {
  const {
    targetMonthlyWageInput,
    wagePerSecondInput,
    fallbackTargetMonthlyWage,
    fallbackWagePerSecond,
  } = params;

  if (targetMonthlyWageInput === undefined && wagePerSecondInput === undefined) {
    return {
      targetMonthlyWage: toNumberOrNull(fallbackTargetMonthlyWage),
      wagePerSecond: toNumberOrNull(fallbackWagePerSecond),
    };
  }

  if (targetMonthlyWageInput !== undefined) {
    return resolveFactoryWageFields(targetMonthlyWageInput, wagePerSecondInput);
  }

  return {
    targetMonthlyWage: toNumberOrNull(fallbackTargetMonthlyWage),
    wagePerSecond: toNumberOrNull(wagePerSecondInput),
  };
};

const normalizeFactoryCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized.length < 2 || normalized.length > 3) return null;
  return normalized;
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

const resolveOptionalFactoryTextUpdate = (
  value: unknown,
  fallbackValue: unknown
): string | null =>
  value === undefined
    ? normalizeOptionalFactoryText(fallbackValue)
    : normalizeOptionalFactoryText(value);

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

const resolveFactoryManagerEmployeeInput = async (params: {
  organizationId: number;
  factoryId: number | null;
  managerEmployeeIdInput: unknown;
}): Promise<
  | { ok: true; hasInput: false; managerEmployeeId: null }
  | { ok: true; hasInput: true; managerEmployeeId: number | null }
  | { ok: false; status: number; error: string }
> => {
  const { organizationId, factoryId, managerEmployeeIdInput } = params;
  if (managerEmployeeIdInput === undefined) {
    return { ok: true, hasInput: false, managerEmployeeId: null };
  }
  if (managerEmployeeIdInput === null || managerEmployeeIdInput === "") {
    return { ok: true, hasInput: true, managerEmployeeId: null };
  }

  const managerEmployeeId = toPositiveIntOrNull(managerEmployeeIdInput);
  if (managerEmployeeId === null) {
    return { ok: false, status: 400, error: "invalid managerEmployeeId" };
  }
  if (factoryId === null) {
    return {
      ok: false,
      status: 400,
      error: "managerEmployeeId can be set only after the factory has been created",
    };
  }

  const manager = await prisma.employee.findFirst({
    where: {
      id: managerEmployeeId,
      orgId: organizationId,
      factoryId,
    },
    select: { id: true },
  });
  if (!manager) {
    return {
      ok: false,
      status: 400,
      error: "manager must belong to the factory",
    };
  }

  return { ok: true, hasInput: true, managerEmployeeId: manager.id };
};

const toFactoryResponse = (factory: any) => {
  const factoryId = toPositiveIntOrNull(factory?.id);
  const managerEmployee =
    factory?.managerEmployee &&
    toPositiveIntOrNull(factory?.managerEmployee?.id) &&
    toPositiveIntOrNull(factory?.managerEmployee?.factoryId) === factoryId
      ? {
          id: factory.managerEmployee.id,
          name: normalizeOptionalFactoryText(factory.managerEmployee.name),
          employeeNo: normalizeEmployeeNo(factory.managerEmployee.employeeNo) ?? null,
        }
      : null;
  const legacyManagerName = normalizeOptionalFactoryText(factory?.manager);
  const managerName = managerEmployee?.name ?? legacyManagerName ?? null;

  return {
    ...factory,
    managerEmployee,
    managerEmployeeId: managerEmployee?.id ?? null,
    managerEmployeeName: managerName,
    managerEmployeeNo: managerEmployee?.employeeNo ?? null,
    manager: managerName,
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
      include: {
        managerEmployee: {
          select: FACTORY_MANAGER_EMPLOYEE_SELECT,
        },
      },
      orderBy: { id: "asc" },
    });
    return res.json(factories.map(toFactoryResponse));
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
      managerEmployeeId,
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
    const managerEmployeeResolved = await resolveFactoryManagerEmployeeInput({
      organizationId: organization.id,
      factoryId: null,
      managerEmployeeIdInput: managerEmployeeId,
    });
    if (!managerEmployeeResolved.ok) {
      return res
        .status(managerEmployeeResolved.status)
        .json({ ok: false, error: managerEmployeeResolved.error });
    }

    const factory = await prisma.$transaction(async (tx) => {
      const createdFactory = await tx.factory.create({
        include: {
          managerEmployee: {
            select: FACTORY_MANAGER_EMPLOYEE_SELECT,
          },
        },
        data: {
          orgId: organization.id,
          name: name.trim(),
          nameKo: normalizeOptionalFactoryText(nameKo),
          nameVi: normalizeOptionalFactoryText(nameVi),
          factoryCode: normalizedCode,
          managementStartDate: managementStartDateResolved.value,
          address: normalizeOptionalFactoryText(address),
          country: phoneFields.country,
          countryCode: phoneFields.countryCode,
          phoneNumber: normalizeOptionalFactoryText(phoneNumber),
          managerEmployeeId: managerEmployeeResolved.managerEmployeeId,
          manager:
            managerEmployeeResolved.hasInput
              ? null
              : normalizeOptionalFactoryText(manager),
          targetMonthlyWage: wageFields.targetMonthlyWage,
          wagePerSecond: wageFields.wagePerSecond,
        },
      });
      await tx.warehouse.create({
        data: {
          orgId: organization.id,
          factoryId: createdFactory.id,
          name: "창고 1",
          isDefault: true,
        },
      });
      return createdFactory;
    });

    return res.status(201).json(toFactoryResponse(factory));
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
      managerEmployeeId,
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

    const wageFields = resolveFactoryWageUpdateFields({
      targetMonthlyWageInput: targetMonthlyWage,
      wagePerSecondInput: wagePerSecond,
      fallbackTargetMonthlyWage: existing.targetMonthlyWage,
      fallbackWagePerSecond: existing.wagePerSecond,
    });
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
    const managerEmployeeResolved = await resolveFactoryManagerEmployeeInput({
      organizationId: organization.id,
      factoryId: existing.id,
      managerEmployeeIdInput: managerEmployeeId,
    });
    if (!managerEmployeeResolved.ok) {
      return res
        .status(managerEmployeeResolved.status)
        .json({ ok: false, error: managerEmployeeResolved.error });
    }

    let factory;
    try {
      factory = await prisma.$transaction(async (tx) => {
        const updatedFactory = await tx.factory.update({
          include: {
            managerEmployee: {
              select: FACTORY_MANAGER_EMPLOYEE_SELECT,
            },
          },
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
            address: resolveOptionalFactoryTextUpdate(
              address,
              (existing as any)?.address
            ),
            country: phoneFields.country,
            countryCode: phoneFields.countryCode,
            phoneNumber: resolveOptionalFactoryTextUpdate(
              phoneNumber,
              existing.phoneNumber
            ),
            managerEmployeeId:
              managerEmployeeResolved.hasInput
                ? managerEmployeeResolved.managerEmployeeId
                : existing.managerEmployeeId ?? null,
            manager:
              managerEmployeeResolved.hasInput
                ? null
                : resolveOptionalFactoryTextUpdate(manager, existing.manager),
            targetMonthlyWage: wageFields.targetMonthlyWage,
            wagePerSecond: wageFields.wagePerSecond,
          },
        });

        return updatedFactory;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({
          ok: false,
          error: "factoryCode already in use",
        });
      }
      throw error;
    }

    return res.json(toFactoryResponse(factory));
  });

  factoryRouter.get("/factories/:id/warehouses", async (req, res) => {
    const factoryId = toPositiveIntOrNull(req.params.id);
    const organization = await getOrganizationByQuery(req);
    if (!organization) return res.status(404).json({ ok: false, error: "organization not found" });
    if (factoryId === null) return res.status(400).json({ ok: false, error: "invalid factory id" });
    const factory = await prisma.factory.findFirst({ where: { id: factoryId, orgId: organization.id }, select: { id: true } });
    if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    const warehouses = await prisma.warehouse.findMany({
      where: { orgId: organization.id, factoryId },
      orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { id: "asc" }],
    });
    return res.json(warehouses);
  });

  factoryRouter.post("/factories/:id/warehouses", async (req, res) => {
    const factoryId = toPositiveIntOrNull(req.params.id);
    const organization = await getOrganizationByQuery(req);
    if (!organization) return res.status(404).json({ ok: false, error: "organization not found" });
    if (factoryId === null) return res.status(400).json({ ok: false, error: "invalid factory id" });
    const factory = await prisma.factory.findFirst({ where: { id: factoryId, orgId: organization.id }, select: { id: true } });
    if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    const name = normalizeOptionalFactoryText(req.body?.name);
    if (!name) return res.status(400).json({ ok: false, error: "warehouse name is required" });
    try {
      const warehouse = await prisma.warehouse.create({
        data: { orgId: organization.id, factoryId, name, isDefault: false, isActive: true },
      });
      return res.status(201).json(warehouse);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({ ok: false, error: "warehouse name already in use" });
      }
      throw error;
    }
  });

  factoryRouter.put("/factories/:factoryId/warehouses/:warehouseId", async (req, res) => {
    const factoryId = toPositiveIntOrNull(req.params.factoryId);
    const warehouseId = toPositiveIntOrNull(req.params.warehouseId);
    const organization = await getOrganizationByQuery(req);
    if (!organization) return res.status(404).json({ ok: false, error: "organization not found" });
    if (factoryId === null || warehouseId === null) return res.status(400).json({ ok: false, error: "invalid warehouse id" });
    const existing = await prisma.warehouse.findFirst({
      where: { id: warehouseId, orgId: organization.id, factoryId },
    });
    if (!existing) return res.status(404).json({ ok: false, error: "warehouse not found" });
    const name = req.body?.name === undefined
      ? existing.name
      : normalizeOptionalFactoryText(req.body.name);
    if (!name) return res.status(400).json({ ok: false, error: "warehouse name is required" });
    const nextIsActive = req.body?.isActive === undefined ? existing.isActive : Boolean(req.body.isActive);
    const makeDefault = req.body?.isDefault === true;
    if (existing.isDefault && !nextIsActive) {
      return res.status(409).json({ ok: false, error: "select another default warehouse before deactivating this warehouse" });
    }
    try {
      const warehouse = await prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.warehouse.updateMany({
            where: { orgId: organization.id, factoryId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.warehouse.update({
          where: { id: warehouseId },
          data: { name, isActive: makeDefault ? true : nextIsActive, isDefault: makeDefault ? true : existing.isDefault },
        });
      });
      return res.json(warehouse);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({ ok: false, error: "warehouse name already in use" });
      }
      throw error;
    }
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
          select: { id: true },
        });
        const employeeIds = employees.map((employee) => employee.id);

        if (employeeIds.length > 0) {
          await tx.factory.updateMany({
            where: {
              orgId: organization.id,
              managerEmployeeId: { in: employeeIds },
            },
            data: { managerEmployeeId: null },
          });
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
            const linkedWorkRecordCount = await tx.workRecord.count({
              where: { assignmentPlanId: { in: planIds } },
            });
            if (linkedWorkRecordCount > 0) {
              throw createHttpError(409, "factory has assignment plans with work records");
            }
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

        await tx.factory.delete({ where: { id: existing.id } });

        return {
          deletedLineAssignments,
          deletedAssignmentPlans,
          deletedLines,
          deletedEmployees,
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
