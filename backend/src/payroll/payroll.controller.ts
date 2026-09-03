import { type Request, type Response } from "express";
import { getOrganizationByQuery, requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  deletePayrollSnapshot,
  getPayrollByMonth,
  getPayrollMonthReadiness,
  getPayrollSettings,
  listPayrollSnapshots,
  lockPayrollSnapshot,
  savePayrollSnapshot,
  unlockPayrollSnapshot,
  updatePayrollEmployeeRates,
  updatePayrollSettings,
} from "./payroll.service";

export const getPayrollSettingsController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, { allowedRoles: ["ADMIN", "OPERATOR", "ACCOUNTANT"] });
  if (!accessContext) return;
  return res.json(await getPayrollSettings(accessContext.organization.id));
};

export const updatePayrollSettingsController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, { allowedRoles: ["ADMIN", "OPERATOR", "ACCOUNTANT"] });
  if (!accessContext) return;
  return res.json(await updatePayrollSettings(
    accessContext.organization.id,
    req.body?.alwaysFullAttendanceEmployeeIds,
    req.body?.payrollExcludedEmployeeIds
  ));
};
import {
  resolveCurrentPayrollMonthKey,
  resolveLatestCompletedPayrollMonthKey,
} from "../utils/payrollMonth";
import { prisma } from "../db";
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  resolveFactoryManagementStartDateKey,
} from "../factories/factoryManagementStart";

export const getPayrollCalendarController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const timeZone = process.env.BUSINESS_TIME_ZONE || "Asia/Seoul";
  const factories = await prisma.factory.findMany({
    where: { orgId: organization.id },
    select: { id: true, name: true, nameKo: true, nameVi: true, managementStartDate: true },
    orderBy: { id: "asc" },
  });
  const managementStartDateKey = factories.length > 0
    ? factories
        .map(resolveFactoryManagementStartDateKey)
        .sort((a, b) => a.localeCompare(b))[0] ?? DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
    : DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  const currentMonthKey = resolveCurrentPayrollMonthKey({ timeZone });
  const availableMonthKeys: string[] = [];
  const startMonthKey = managementStartDateKey.slice(0, 7);
  const startYear = Number(startMonthKey.slice(0, 4));
  const startMonth = Number(startMonthKey.slice(5, 7));
  const endYear = Number(currentMonthKey.slice(0, 4));
  const endMonth = Number(currentMonthKey.slice(5, 7));
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    availableMonthKeys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) { year += 1; month = 1; }
  }
  availableMonthKeys.sort((a, b) => b.localeCompare(a));
  return res.json({
    currentMonthKey,
    latestCompletedMonthKey: resolveLatestCompletedPayrollMonthKey({ timeZone }),
    managementStartDateKey,
    managementStartMonthKey: managementStartDateKey.slice(0, 7),
    availableMonthKeys,
    timeZone,
    factories: factories.map((factory) => ({
      id: factory.id,
      name: factory.name,
      nameKo: factory.nameKo,
      nameVi: factory.nameVi,
      managementStartDateKey: resolveFactoryManagementStartDateKey(factory),
    })),
  });
};

export const listPayrollSnapshotsController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const snapshots = await listPayrollSnapshots(organization.id);
  return res.json(snapshots);
};

export const getPayrollController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const payroll = await getPayrollByMonth(
    organization.id,
    String(req.query.month || ""),
    Number(req.query.factoryId)
  );
  return res.json(payroll);
};

export const getPayrollReadinessController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const readiness = await getPayrollMonthReadiness(
    organization.id,
    String(req.query.month || ""),
    Number(req.query.factoryId)
  );
  return res.json(readiness);
};

export const savePayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;

  const snapshot = await savePayrollSnapshot({
    orgId: accessContext.organization.id,
    month: String(req.body?.month || ""),
    factoryId: Number(req.body?.factoryId),
    savedBy:
      resolveOptionalString(req.body?.savedBy, null) ??
      resolveOptionalString(req.body?.lockedBy, null) ??
      accessContext.requesterEmail ??
      "unknown",
    employees: req.body?.employees,
  });

  return res.json(snapshot);
};

export const deletePayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;

  const result = await deletePayrollSnapshot(
    accessContext.organization.id,
    String(req.params.month || ""),
    Number(req.query.factoryId ?? req.body?.factoryId)
  );
  return res.json(result);
};

export const updatePayrollEmployeeRatesController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const result = await updatePayrollEmployeeRates({
    orgId: accessContext.organization.id,
    month: String(req.params.month || ""),
    factoryId: Number(req.body?.factoryId),
    overrides: req.body?.overrides,
    updatedBy: accessContext.requesterEmail ?? "unknown",
  });
  return res.json(result);
};

export const unlockPayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;

  const result = await unlockPayrollSnapshot(
    accessContext.organization.id,
    String(req.params.month || ""),
    Number(req.query.factoryId ?? req.body?.factoryId)
  );
  return res.json(result);
};

export const lockPayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const result = await lockPayrollSnapshot({
    orgId: accessContext.organization.id,
    month: String(req.params.month || ""),
    factoryId: Number(req.body?.factoryId),
    lockedBy:
      resolveOptionalString(req.body?.lockedBy, null) ??
      accessContext.requesterEmail ??
      "unknown",
  });
  return res.json(result);
};

