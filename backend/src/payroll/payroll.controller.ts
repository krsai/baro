import { type Request, type Response } from "express";
import { getOrganizationByQuery, requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  deletePayrollSnapshot,
  getPayrollByMonth,
  getPayrollMonthReadiness,
  listPayrollSnapshots,
  savePayrollSnapshot,
} from "./payroll.service";
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
    select: { managementStartDate: true },
  });
  const managementStartDateKey = factories.length > 0
    ? factories
        .map(resolveFactoryManagementStartDateKey)
        .sort((a, b) => a.localeCompare(b))[0] ?? DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
    : DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  const currentMonthKey = resolveCurrentPayrollMonthKey({ timeZone });
  const workLogs = await prisma.workLog.findMany({
    where: {
      orgId: organization.id,
      workRecords: { some: {} },
    },
    select: {
      displayDate: true,
      factory: { select: { managementStartDate: true } },
    },
  });
  const availableMonthKeys = Array.from(
    new Set(
      workLogs
        .filter(
          (workLog) =>
            String(workLog.displayDate || "") >=
            resolveFactoryManagementStartDateKey(workLog.factory)
        )
        .map((workLog) => String(workLog.displayDate || "").slice(0, 7))
        .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= currentMonthKey)
    )
  ).sort((a, b) => b.localeCompare(a));
  return res.json({
    currentMonthKey,
    latestCompletedMonthKey: resolveLatestCompletedPayrollMonthKey({ timeZone }),
    managementStartDateKey,
    managementStartMonthKey: managementStartDateKey.slice(0, 7),
    availableMonthKeys,
    timeZone,
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

  const payroll = await getPayrollByMonth(organization.id, String(req.query.month || ""));
  return res.json(payroll);
};

export const getPayrollReadinessController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const readiness = await getPayrollMonthReadiness(
    organization.id,
    String(req.query.month || "")
  );
  return res.json(readiness);
};

export const savePayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;

  const snapshot = await savePayrollSnapshot({
    orgId: accessContext.organization.id,
    month: String(req.body?.month || ""),
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
    String(req.params.month || "")
  );
  return res.json(result);
};

