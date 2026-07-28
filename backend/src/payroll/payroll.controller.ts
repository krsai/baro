import { type Request, type Response } from "express";
import { getOrganizationByQuery, requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  deletePayrollSnapshot,
  getPayrollByMonth,
  listPayrollSnapshots,
  savePayrollSnapshot,
} from "./payroll.service";
import {
  resolveCurrentPayrollMonthKey,
  resolveLatestCompletedPayrollMonthKey,
} from "../utils/payrollMonth";

export const getPayrollCalendarController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const timeZone = process.env.BUSINESS_TIME_ZONE || "Asia/Seoul";
  return res.json({
    currentMonthKey: resolveCurrentPayrollMonthKey({ timeZone }),
    latestCompletedMonthKey: resolveLatestCompletedPayrollMonthKey({ timeZone }),
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

