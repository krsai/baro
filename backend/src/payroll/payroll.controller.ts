import { type Request, type Response } from "express";
import { getOrganizationByQuery, requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  deletePayrollSnapshot,
  getPayrollByMonth,
  listPayrollSnapshots,
  lockPayrollSnapshot,
} from "./payroll.service";

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

export const lockPayrollController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ["ADMIN", "ACCOUNTANT"],
  });
  if (!accessContext) return;

  const snapshot = await lockPayrollSnapshot({
    orgId: accessContext.organization.id,
    month: String(req.body?.month || ""),
    lockedBy:
      resolveOptionalString(req.body?.lockedBy, null) ??
      accessContext.requesterEmail ??
      "unknown",
    employees: req.body?.employees,
  });

  return res.status(201).json(snapshot);
};

export const deletePayrollSnapshotController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ["ADMIN"],
  });
  if (!accessContext) return;

  const result = await deletePayrollSnapshot(
    accessContext.organization.id,
    String(req.params.month || "")
  );
  return res.json(result);
};
