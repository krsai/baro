import { type EmployeeStatus, type OrgUserRole } from "@prisma/client";
import { normalizeEmail, resolveOptionalString } from "../utils/common";

export type EmployeeAccountLike = {
  orgId: number;
  email?: string | null;
  orgRole?: OrgUserRole | string | null;
  status?: EmployeeStatus | string | null;
  name?: string | null;
  requestedAt?: Date | string | null;
  requestedName?: string | null;
  approvedAt?: Date | string | null;
  approvedBy?: string | null;
};

export const normalizeEmployeeOrgRole = (value: unknown): OrgUserRole => {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "ADMIN" ||
    normalized === "OPERATOR" ||
    normalized === "ACCOUNTANT" ||
    normalized === "WORKER"
  ) {
    return normalized;
  }
  return "WORKER";
};

export const normalizeEmployeeStatus = (value: unknown): EmployeeStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "PENDING" ||
    normalized === "ACTIVE" ||
    normalized === "REJECTED" ||
    normalized === "SUSPENDED" ||
    normalized === "TERMINATED"
  ) {
    return normalized;
  }
  return "ACTIVE";
};

export const buildEmployeeAccountFields = (employee: EmployeeAccountLike) => ({
  orgId: employee.orgId,
  email: normalizeEmail(employee.email) || null,
  orgRole: normalizeEmployeeOrgRole(employee.orgRole),
  status: normalizeEmployeeStatus(employee.status),
  requestedAt: employee.requestedAt ?? null,
  requestedName: resolveOptionalString(employee.requestedName ?? employee.name, null),
  approvedAt: employee.approvedAt ?? null,
  approvedBy: resolveOptionalString(employee.approvedBy, null),
});
