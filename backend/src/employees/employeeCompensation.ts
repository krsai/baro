import { type OrgUserRole } from "@prisma/client";

export type EmployeePayType = "CT" | "FIXED";

const PAY_TYPE_OPTIONS = new Set(["CT", "FIXED"]);

export const ORG_ROLE_LABELS: Record<OrgUserRole, string> = {
  ADMIN: "관리자",
  OPERATOR: "운영자",
  ACCOUNTANT: "회계사",
  WORKER: "작업자",
};

export const normalizePayType = (
  value: unknown,
  fallback: EmployeePayType | null = null
): EmployeePayType | null => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toUpperCase();
  return PAY_TYPE_OPTIONS.has(normalized) ? (normalized as EmployeePayType) : fallback;
};

export const resolveRoleDefaultPayType = (role: any): EmployeePayType =>
  normalizePayType(role?.defaultPayType, "FIXED") ?? "FIXED";

export const resolveEmployeeEffectivePayType = (employee: any): EmployeePayType =>
  normalizePayType(employee?.payType, null) ??
  resolveRoleDefaultPayType(employee?.role) ??
  "FIXED";

export const resolveOrgRoleLabel = (value: unknown): string => {
  const normalized = String(value || "").trim().toUpperCase() as OrgUserRole;
  return ORG_ROLE_LABELS[normalized] || "";
};
