import { type OrgMembershipStatus, type OrgUserRole } from "@prisma/client";
import { normalizeEmail, resolveOptionalString } from "../utils/common";

type MembershipLike = {
  id: number;
  orgId: number;
  email?: string | null;
  role?: OrgUserRole | string | null;
  status?: OrgMembershipStatus | string | null;
  requestedAt?: Date | string | null;
  requestedName?: string | null;
  approvedAt?: Date | string | null;
  approvedBy?: string | null;
  createdAt?: Date | string | null;
  createdBy?: string | null;
};

type SyncEmployeeAccountOptions = {
  update?: Record<string, unknown>;
  create?: Record<string, unknown>;
};

const normalizeOrgRole = (value: unknown): OrgUserRole => {
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

const normalizeStatus = (value: unknown): OrgMembershipStatus => {
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

export const buildEmployeeAccountFieldsFromMembership = (
  membership: MembershipLike
) => ({
  orgId: membership.orgId,
  orgMembershipId: membership.id,
  email: normalizeEmail(membership.email) || null,
  orgRole: normalizeOrgRole(membership.role),
  status: normalizeStatus(membership.status),
  requestedAt: membership.requestedAt ?? null,
  requestedName: resolveOptionalString(membership.requestedName, null),
  approvedAt: membership.approvedAt ?? null,
  approvedBy: resolveOptionalString(membership.approvedBy, null),
});

export const syncEmployeeAccountFromMembership = async (
  tx: any,
  membership: MembershipLike,
  options: SyncEmployeeAccountOptions = {}
) => {
  const accountFields = buildEmployeeAccountFieldsFromMembership(membership);
  const requestedName = resolveOptionalString(membership.requestedName, null);
  const createData = {
    ...accountFields,
    name: requestedName,
    joinedAt:
      accountFields.status === "ACTIVE"
        ? accountFields.approvedAt ?? membership.createdAt ?? new Date()
        : null,
    ...options.create,
  };

  return tx.employee.upsert({
    where: { orgMembershipId: membership.id },
    update: {
      ...accountFields,
      ...options.update,
    },
    create: createData,
  });
};

export const buildOrgMembershipShadowFieldsFromEmployee = (employee: any) => ({
  orgId: employee.orgId,
  email: normalizeEmail(employee.email) || null,
  role: normalizeOrgRole(employee.orgRole),
  status: normalizeStatus(employee.status),
  requestedAt: employee.requestedAt ?? null,
  requestedName: resolveOptionalString(employee.requestedName ?? employee.name, null),
  approvedAt: employee.approvedAt ?? null,
  approvedBy: resolveOptionalString(employee.approvedBy, null),
});
