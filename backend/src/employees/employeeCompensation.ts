import { type OrgUserRole } from "@prisma/client";

export type EmployeePayType = "GENERAL" | "OUTPUT";

export const EMPLOYEE_PAY_TYPE = {
  GENERAL: "GENERAL",
  OUTPUT: "OUTPUT",
} as const;

const LEGACY_PAY_TYPE_MAP: Record<string, EmployeePayType> = {
  FIXED: EMPLOYEE_PAY_TYPE.GENERAL,
  CT: EMPLOYEE_PAY_TYPE.OUTPUT,
};

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
  if (normalized === EMPLOYEE_PAY_TYPE.GENERAL || normalized === EMPLOYEE_PAY_TYPE.OUTPUT) {
    return normalized;
  }
  return LEGACY_PAY_TYPE_MAP[normalized] ?? fallback;
};

export const resolveRoleDefaultPayType = (role: any): EmployeePayType =>
  normalizePayType(role?.defaultPayType, EMPLOYEE_PAY_TYPE.GENERAL) ??
  EMPLOYEE_PAY_TYPE.GENERAL;

export const resolveEmployeeEffectivePayType = (employee: any): EmployeePayType =>
  String(employee?.role?.code || "").trim().toUpperCase() === "WORKER_SUPERVISOR"
    ? EMPLOYEE_PAY_TYPE.GENERAL
    : normalizePayType(employee?.payType, null) ??
      resolveRoleDefaultPayType(employee?.role) ??
      EMPLOYEE_PAY_TYPE.GENERAL;

export const resolveOrgRoleLabel = (value: unknown): string => {
  const normalized = String(value || "").trim().toUpperCase() as OrgUserRole;
  return ORG_ROLE_LABELS[normalized] || "";
};
