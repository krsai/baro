import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import "./config/env";
import { Prisma, type OrgUserRole } from "@prisma/client";
import { prisma } from "./db";
import {
  normalizePayType,
  resolveEmployeeEffectivePayType,
  resolveOrgRoleLabel,
  resolveRoleDefaultPayType,
} from "./employees/employeeCompensation";
import { createEmployeeRouter } from "./employees/employee.routes";
import { createFactoryRouter } from "./factories/factory.routes";
import { createLineRouter } from "./lines/line.routes";
import { createOrgMembershipRouter } from "./org-memberships/orgMembership.routes";
import { createOrganizationRouter } from "./organizations/organization.routes";
import {
  attachOrganizationSubscription,
  ensureOrganizationSubscription,
  getHardCodedSystemAdminEmail,
  getOrganizationByQuery,
  getRequestedOrgIdText,
  getRequesterEmail,
  requireOrgRole,
  requireSystemAdmin,
} from "./middleware/access";
import { payrollRouter } from "./payroll/payroll.routes";
import {
  parseDateKeyParts,
  resolveAtTrainingMonthKey,
  shiftMonthKey,
} from "./utils/atTrainingMonthKey";
import {
  ensureArray,
  isNumericId,
  isValidOrgCode,
  normalizeComparableText,
  normalizeEmail,
  normalizeOrgCode,
  resolveOptionalString,
  toId,
  toNumberOrNull,
  toPositiveInt,
  toPositiveIntOrNull,
  wait,
} from "./utils/common";
import {
  createHttpError,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
  toErrorRecord,
} from "./utils/http";
import {
  resolveWorkRecordColorName,
  resolveWorkRecordProcessName,
  resolveWorkRecordStyleId,
  resolveWorkRecordStyleName,
  resolveWorkRecordStyleUid,
  WORK_RECORD_WITH_REFS_INCLUDE,
} from "./work-records/workRecord.shared";
import {
  AT_MONTHLY_A_CLAMP_RATIO,
  fitAtParamsWithProportionalAllocation,
  type AtTrainingDayBucket,
  type AtTrainingDayProcessRow,
} from "./services/atTraining";

const app = express();
app.use(cors());
app.use(express.json());

function assertGeneratedPrismaClientShape() {
  const modelByName = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [model.name, model])
  );
  const hasField = (modelName: string, fieldName: string) =>
    Boolean(
      modelByName
        .get(modelName)
        ?.fields.some((field) => field.name === fieldName)
    );

  const staleSignals: string[] = [];
  if (!hasField("WorkOrder", "workOrderItems")) {
    staleSignals.push("WorkOrder.workOrderItems missing");
  }
  if (!hasField("WorkOrderItem", "style")) {
    staleSignals.push("WorkOrderItem.style missing");
  }
  if (hasField("WorkOrderItem", "colorName")) {
    staleSignals.push("WorkOrderItem.colorName still present");
  }
  if (!hasField("WorkRecord", "styleUid")) {
    staleSignals.push("WorkRecord.styleUid missing");
  }
  if (hasField("WorkRecord", "processName")) {
    staleSignals.push("WorkRecord.processName still present");
  }
  if (hasField("WorkRecord", "colorName")) {
    staleSignals.push("WorkRecord.colorName still present");
  }

  if (staleSignals.length > 0) {
    throw new Error(
      `Stale Prisma client detected (${staleSignals.join(
        "; "
      )}). Run "npm run prisma:prepare-client" in backend and restart the server.`
    );
  }
}

assertGeneratedPrismaClientShape();

const WORK_ORDER_ITEM_GENDER_CODES = new Set(["M", "W", "U"]);
const WORK_ORDER_STATUS_CODES = new Set([
  "ORDER_RECEIVED",
  "IN_PROGRESS",
  "PRODUCTION_DONE",
  "SHIPPED",
]);
const WORK_ORDER_STATUS_LEGACY_CODE_MAP = new Map<string, string>([
  ["주문접수", "ORDER_RECEIVED"],
  ["작업중", "IN_PROGRESS"],
  ["생산완료", "PRODUCTION_DONE"],
  ["출고완료", "SHIPPED"],
]);
const DEFAULT_EMPLOYEE_ROLE_CODE_SEWING = "WORKER_SEWING";
const DEFAULT_EMPLOYEE_ROLES = [
  {
    code: "WORKER_CUTTING",
    name: "재단",
    defaultPayType: "FIXED",
    sortOrder: 1,
  },
  {
    code: DEFAULT_EMPLOYEE_ROLE_CODE_SEWING,
    name: "봉제",
    defaultPayType: "CT",
    sortOrder: 2,
  },
  {
    code: "WORKER_IRONING",
    name: "다림",
    defaultPayType: "FIXED",
    sortOrder: 3,
  },
  {
    code: "WORKER_INSPECTION",
    name: "검수",
    defaultPayType: "FIXED",
    sortOrder: 4,
  },
  {
    code: "WORKER_PACKING",
    name: "포장",
    defaultPayType: "FIXED",
    sortOrder: 5,
  },
  {
    code: "WORKER_OTHER",
    name: "기타",
    defaultPayType: "FIXED",
    sortOrder: 6,
  },
] as const;
const DEFAULT_EMPLOYEE_ROLE_CODES = new Set<string>(
  DEFAULT_EMPLOYEE_ROLES.map((role) => role.code)
);

const DEFAULT_ATTRIBUTES = {
  colors: [] as { code: string; name: string }[],
  categories: [
    { code: "OUT", name: "Outer" },
    { code: "TOP", name: "Top" },
    { code: "BTM", name: "Bottom" },
    { code: "DRS", name: "Dress" },
    { code: "ACC", name: "Accessory" },
  ],
  roles: DEFAULT_EMPLOYEE_ROLES,
  processes: [
    { code: "P01", name: "테스트 공정 01" },
    { code: "P02", name: "테스트 공정 02" },
    { code: "P03", name: "테스트 공정 03" },
    { code: "P04", name: "테스트 공정 04" },
    { code: "P05", name: "테스트 공정 05" },
    { code: "P06", name: "테스트 공정 06" },
    { code: "P07", name: "테스트 공정 07" },
    { code: "P08", name: "테스트 공정 08" },
    { code: "P09", name: "테스트 공정 09" },
    { code: "P10", name: "테스트 공정 10" },
  ],
};

const normalizeWorkOrderItemGender = (
  value: unknown,
  fallback: "M" | "W" | "U" | null = "M"
): "M" | "W" | "U" | null => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return fallback;
  if (WORK_ORDER_ITEM_GENDER_CODES.has(normalized)) {
    return normalized as "M" | "W" | "U";
  }
  if (normalized === "MEN" || normalized === "MALE" || normalized === "남성") {
    return "M";
  }
  if (normalized === "WOMEN" || normalized === "FEMALE" || normalized === "여성") {
    return "W";
  }
  if (normalized === "UNISEX" || normalized === "공용") {
    return "U";
  }
  return fallback;
};
const resolveWorkOrderStatus = (
  value: unknown,
  fallback:
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED" = "ORDER_RECEIVED"
): "ORDER_RECEIVED" | "IN_PROGRESS" | "PRODUCTION_DONE" | "SHIPPED" => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, "").trim();
  if (!normalized) return fallback;
  const upper = normalized.toUpperCase();
  if (WORK_ORDER_STATUS_CODES.has(upper)) {
    return upper as
      | "ORDER_RECEIVED"
      | "IN_PROGRESS"
      | "PRODUCTION_DONE"
      | "SHIPPED";
  }
  return (WORK_ORDER_STATUS_LEGACY_CODE_MAP.get(normalized) ??
    fallback) as
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED";
};
const isWorkOrderDeletableStatus = (value: unknown) =>
  resolveWorkOrderStatus(value) === "ORDER_RECEIVED";
const toSortOrder = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
};
const isWorkerEmployeeRoleCode = (value: unknown): boolean =>
  DEFAULT_EMPLOYEE_ROLE_CODES.has(String(value ?? "").trim().toUpperCase());
const FACTORY_WORK_HOURS_PER_DAY = 8;
const ATTENDANCE_DEFAULT_WORK_SECONDS = FACTORY_WORK_HOURS_PER_DAY * 60 * 60;
const AT_TRAINING_CUTOFF_DAY = 5;
const DEFAULT_TIME_REF_QUANTITY = 1000;
// 출퇴근 입력값을 AT 계산에 반영한다.
// 입력이 없거나 불완전한 경우 8시간(ATTENDANCE_DEFAULT_WORK_SECONDS)으로 폴백한다.
const USE_ATTENDANCE_INPUT_FOR_AT = true;
const AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO = (() => {
  const parsed = Number(process.env.AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO);
  if (!Number.isFinite(parsed) || parsed <= 1) return 8;
  return parsed;
})();
const AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS = toPositiveInt(
  process.env.AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS,
  8
);
const roundToScale = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const STARTUP_DB_MAX_RETRIES = toPositiveInt(
  process.env.STARTUP_DB_MAX_RETRIES,
  5
);
const STARTUP_DB_RETRY_DELAY_MS = toPositiveInt(
  process.env.STARTUP_DB_RETRY_DELAY_MS,
  1500
);
const ROLE_OPTIONS = new Set(["ADMIN", "OPERATOR", "ACCOUNTANT", "WORKER"]);
const ORG_ACCESS_ROLES: OrgUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "ACCOUNTANT",
  "WORKER",
];
const ORG_MANAGEMENT_ROLES: OrgUserRole[] = ["ADMIN", "OPERATOR"];
const MEMBERSHIP_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
  "TERMINATED",
]);
const SUBSCRIPTION_STATUSES = new Set([
  "NOT_SUBSCRIBED",
  "TRIAL",
  "ACTIVE",
  "GRACE",
  "SUSPENDED",
]);
const TRIAL_DAYS = 30;
const resolveRole = (value: any, fallback: OrgUserRole = "WORKER"): OrgUserRole =>
  ROLE_OPTIONS.has(value) ? (value as OrgUserRole) : fallback;
const resolveStatus = (value: any) =>
  MEMBERSHIP_STATUSES.has(value) ? value : null;
const resolveSubscriptionStatus = (value: any) =>
  SUBSCRIPTION_STATUSES.has(value) ? value : null;
const isManufacturerOrg = (org: { type?: string | null } | null | undefined) =>
  org?.type === "MANUFACTURER";
const isBrandOrg = (org: { type?: string | null } | null | undefined) =>
  org?.type === "BRAND";
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const normalizeSubscriptionEmailInput = (
  value: unknown,
  fieldName: string,
  fallback: string | null
) => {
  if (value === undefined) return { value: fallback };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string` };
  }
  const normalized = normalizeEmail(value);
  if (!normalized) return { value: null };
  if (!normalized.includes("@")) {
    return { error: `${fieldName} is invalid` };
  }
  return { value: normalized };
};

const normalizeDateInput = (
  value: unknown,
  fieldName: string,
  fallback: Date | null
) => {
  if (value === undefined) return { value: fallback };
  if (value === null || value === "") return { value: null };
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldName} is invalid` };
  }
  return { value: date };
};

const toOrganizationResponse = (organization: any) => {
  if (!organization) return organization;
  const { subscription, ...rest } = organization;
  return {
    ...rest,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          membershipEmail: subscription.membershipEmail ?? null,
          billingEmail: subscription.billingEmail ?? null,
          trialStartedAt: subscription.trialStartedAt ?? null,
          trialEndsAt: subscription.trialEndsAt ?? null,
          activatedAt: subscription.activatedAt ?? null,
          suspendedAt: subscription.suspendedAt ?? null,
          updatedAt: subscription.updatedAt ?? null,
          createdAt: subscription.createdAt ?? null,
        }
      : null,
  };
};

const hasSubscriptionPayload = (payload: any = {}) =>
  payload.subscriptionStatus !== undefined ||
  payload.status !== undefined ||
  payload.membershipEmail !== undefined ||
  payload.billingEmail !== undefined ||
  payload.trialStartedAt !== undefined ||
  payload.trialEndsAt !== undefined;

const applySubscriptionPayload = async (organization: any, payload: any = {}) => {
  const current = await ensureOrganizationSubscription(organization);
  if (!current) {
    throw createHttpError(404, "subscription not found");
  }
  if (!hasSubscriptionPayload(payload)) {
    return current;
  }

  const rawStatus = payload.subscriptionStatus ?? payload.status;
  let nextStatus = current.status;
  if (rawStatus !== undefined) {
    const resolved = resolveSubscriptionStatus(rawStatus);
    if (!resolved) {
      throw createHttpError(400, "invalid subscription status");
    }
    nextStatus = resolved;
  }

  const membershipEmailResolved = normalizeSubscriptionEmailInput(
    payload.membershipEmail,
    "membershipEmail",
    current.membershipEmail ?? null
  );
  if (membershipEmailResolved.error) {
    throw createHttpError(400, membershipEmailResolved.error);
  }
  const billingEmailResolved = normalizeSubscriptionEmailInput(
    payload.billingEmail,
    "billingEmail",
    current.billingEmail ?? null
  );
  if (billingEmailResolved.error) {
    throw createHttpError(400, billingEmailResolved.error);
  }

  const trialStartedAtResolved = normalizeDateInput(
    payload.trialStartedAt,
    "trialStartedAt",
    current.trialStartedAt
  );
  if (trialStartedAtResolved.error) {
    throw createHttpError(400, trialStartedAtResolved.error);
  }
  const trialEndsAtResolved = normalizeDateInput(
    payload.trialEndsAt,
    "trialEndsAt",
    current.trialEndsAt
  );
  if (trialEndsAtResolved.error) {
    throw createHttpError(400, trialEndsAtResolved.error);
  }

  const now = new Date();
  let membershipEmail = membershipEmailResolved.value;
  let billingEmail = billingEmailResolved.value;
  let trialStartedAt = trialStartedAtResolved.value;
  let trialEndsAt = trialEndsAtResolved.value;
  let activatedAt = current.activatedAt;
  let suspendedAt = current.suspendedAt;

  if (nextStatus === "TRIAL") {
    if (!trialStartedAt) {
      trialStartedAt = now;
    }
    if (!trialEndsAt) {
      trialEndsAt = addDays(trialStartedAt, TRIAL_DAYS);
    }
  }

  if (nextStatus === "ACTIVE") {
    if (!membershipEmail || !billingEmail) {
      throw createHttpError(
        400,
        "membershipEmail and billingEmail are required for ACTIVE"
      );
    }
    if (!activatedAt) {
      activatedAt = now;
    }
    suspendedAt = null;
  }

  if (nextStatus === "SUSPENDED") {
    suspendedAt = now;
  } else if (rawStatus !== undefined) {
    suspendedAt = null;
  }

  const updateData: any = {
    status: nextStatus,
    activatedAt,
    suspendedAt,
    ...(membershipEmail !== undefined ? { membershipEmail } : {}),
    ...(billingEmail !== undefined ? { billingEmail } : {}),
    ...(trialStartedAt !== undefined ? { trialStartedAt } : {}),
    ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
  };
  return prisma.organizationSubscription.update({
    where: { id: current.id },
    data: updateData,
  });
};

const ensureHardcodedSystemAdmin = async () => {
  const email = getHardCodedSystemAdminEmail();
  if (!email) return null;

  return prisma.systemUser.upsert({
    where: { email },
    update: { systemRole: "SYSTEM_ADMIN" },
    create: { email, systemRole: "SYSTEM_ADMIN" },
  });
};

const toCustomerResponse = (relationship: any, perspective: string = "MANUFACTURER") => {
  const targetOrg =
    perspective === "BRAND" ? relationship.manufacturer ?? {} : relationship.brand ?? {};
  const targetCode = targetOrg.code ?? relationship.customerCode ?? "";
  return {
    id: relationship.id,
    brandOrgId: relationship.brandOrgId,
    manufacturerOrgId: relationship.manufacturerOrgId,
    code: targetCode,
    name: targetOrg.name ?? "",
    manager: relationship.managerName ?? targetOrg.representative ?? "",
    phone: relationship.managerPhone ?? targetOrg.phone ?? "",
    email: relationship.managerEmail ?? targetOrg.email ?? "",
    registeredAt: relationship.createdAt,
    brand: relationship.brand ?? null,
    manufacturer: relationship.manufacturer ?? null,
  };
};

const createStyleId = () =>
  `S-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

const toStyleIdentityKey = (customer: any, value: any) =>
  `${(customer ?? "").trim()}::${(value ?? "").trim()}`;

const toOptionalSeconds = (value: any) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : roundToScale(parsed, 4);
};

type StyleAtParams = {
  a: number;
  b: number;
  version: number;
  updatedAt: string | null;
  trainedPeriod: string | null;
  attendanceCoverage: number | null;
  attendanceFallbackShare: number | null;
  observationCount: number | null;
};

const toStyleAtParams = (value: any): StyleAtParams | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = toOptionalSeconds((value as any).a);
  const b = toOptionalSeconds((value as any).b);
  if (a === null || b === null) return null;

  const versionRaw = Number((value as any).version);
  const version =
    Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;

  const updatedAtRaw = resolveOptionalString((value as any).updatedAt, null);
  const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
  const updatedAt =
    updatedAtDate && !Number.isNaN(updatedAtDate.getTime())
      ? updatedAtDate.toISOString()
      : null;

  const trainedPeriodRaw = resolveOptionalString(
    (value as any).trainedPeriod,
    null
  );
  const trainedPeriod =
    trainedPeriodRaw && /^\d{4}-\d{2}$/.test(trainedPeriodRaw)
      ? trainedPeriodRaw
      : null;
  const attendanceCoverageRaw = toNumberOrNull((value as any).attendanceCoverage);
  const attendanceCoverage =
    attendanceCoverageRaw === null
      ? null
      : roundToScale(Math.min(1, Math.max(0, attendanceCoverageRaw)), 4);
  const attendanceFallbackShareRaw = toNumberOrNull(
    (value as any).attendanceFallbackShare
  );
  const attendanceFallbackShare =
    attendanceFallbackShareRaw === null
      ? attendanceCoverage === null
        ? null
        : roundToScale(Math.min(1, Math.max(0, 1 - attendanceCoverage)), 4)
      : roundToScale(Math.min(1, Math.max(0, attendanceFallbackShareRaw)), 4);
  const observationCountRaw = toNumberOrNull((value as any).observationCount);
  const observationCount =
    observationCountRaw === null
      ? null
      : Math.max(0, Math.trunc(observationCountRaw));

  return {
    a,
    b,
    version,
    updatedAt,
    trainedPeriod,
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount,
  };
};

const isSameStyleAtParams = (
  left: StyleAtParams | null,
  right: StyleAtParams | null
) => {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return (
    left.a === right.a &&
    left.b === right.b &&
    left.version === right.version &&
    left.updatedAt === right.updatedAt &&
    left.trainedPeriod === right.trainedPeriod &&
    left.attendanceCoverage === right.attendanceCoverage &&
    left.attendanceFallbackShare === right.attendanceFallbackShare &&
    left.observationCount === right.observationCount
  );
};

const clampAtSlopeByMonthlyChange = (
  nextAInput: number,
  currentAtParams: StyleAtParams | null,
  options: { observationCount?: number | null } = {}
): number => {
  const nextA = toOptionalSeconds(nextAInput);
  if (nextA == null) return nextAInput;
  if (!currentAtParams || currentAtParams.a <= 0) return nextA;

  const observationCountRaw = Number(options.observationCount);
  const observationCount =
    Number.isFinite(observationCountRaw) && observationCountRaw > 0
      ? Math.trunc(observationCountRaw)
      : 0;
  const currentA = currentAtParams.a;
  const divergenceRatio = Math.max(
    nextA / currentA,
    currentA / Math.max(nextA, Number.EPSILON)
  );
  if (
    observationCount >= AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS &&
    Number.isFinite(divergenceRatio) &&
    divergenceRatio >= AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO
  ) {
    return nextA;
  }

  const minA = currentA * (1 - AT_MONTHLY_A_CLAMP_RATIO);
  const maxA = currentA * (1 + AT_MONTHLY_A_CLAMP_RATIO);
  return roundToScale(Math.min(maxA, Math.max(minA, nextA)), 4);
};

const normalizeStyleProcess = (process: any) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return process;
  }
  const { st: _legacySt, ...rest } = process;
  const next = { ...rest };
  if ("pt" in next) next.pt = toOptionalSeconds(next.pt);
  if ("at" in next) next.at = toOptionalSeconds(next.at);
  if ("ct" in next) next.ct = toOptionalSeconds(next.ct);
  const normalizedAtParams = toStyleAtParams((next as any).atParams);
  if (normalizedAtParams) {
    (next as any).atParams = normalizedAtParams;
  } else if ("atParams" in next) {
    delete (next as any).atParams;
  }
  next.timeRefQuantity = toPositiveInt(
    (next as any).timeRefQuantity ?? (next as any).referenceQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const hasCt = next.ct !== null && next.ct !== undefined;
  const hasAt = next.at !== null && next.at !== undefined;
  const isLikelyAutoCt =
    hasCt &&
    hasAt &&
    Math.abs(Number(next.ct) - Number(next.at)) < 1e-4;
  next.stManual =
    typeof next.stManual === "boolean" ? next.stManual : hasCt && !isLikelyAutoCt;
  if (next.stManual !== true && next.ct == null) {
    next.ct = next.pt ?? null;
  }
  if ("referenceQuantity" in next) {
    delete (next as any).referenceQuantity;
  }
  return next;
};

const normalizeStyleProcesses = (value: any) =>
  ensureArray(value).map((process) => normalizeStyleProcess(process));

type StyleProcessDuplicateIdentity = {
  identityKey: string;
  firstIndex: number;
  duplicateIndex: number;
};

const getStyleProcessIdentityKey = (process: any): string => {
  const codeKey = normalizeProcessCodeKey(process?.code);
  if (codeKey) return `code:${codeKey}`;
  const nameKey = normalizeProcessNameKey(process?.name);
  if (nameKey) return `name:${nameKey}`;
  return "";
};

const findStyleProcessDuplicateIdentity = (
  processes: any[]
): StyleProcessDuplicateIdentity | null => {
  const firstIndexByIdentity = new Map<string, number>();
  for (let index = 0; index < processes.length; index += 1) {
    const identityKey = getStyleProcessIdentityKey(processes[index]);
    if (!identityKey) continue;
    const firstIndex = firstIndexByIdentity.get(identityKey);
    if (firstIndex !== undefined) {
      return {
        identityKey,
        firstIndex,
        duplicateIndex: index,
      };
    }
    firstIndexByIdentity.set(identityKey, index);
  }
  return null;
};

const createStyleProcessDuplicateError = (
  duplicate: StyleProcessDuplicateIdentity,
  scope = "processes"
) =>
  `${scope} contains duplicate process entries (${duplicate.identityKey}, first index ${duplicate.firstIndex}, duplicate index ${duplicate.duplicateIndex})`;

const normalizeProcessCodeKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const normalizeProcessNameKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const toStyleProcessMetricKey = (
  styleKey: string,
  type: "code" | "name",
  value: string
) => `${styleKey}::${type}:${value}`;

const collectPositiveIntSet = (...values: any[]) =>
  Array.from(
    new Set(
      values
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const resolveWorkOrderItemStyleUid = (item: any) =>
  toPositiveIntOrNull(item?.style?.uid ?? item?.styleUid);
const resolveWorkOrderItemStyleId = (item: any) =>
  resolveOptionalString(item?.style?.styleId ?? item?.styleId, null);
const resolveWorkOrderItemStyleCode = (item: any) =>
  resolveOptionalString(item?.style?.styleCode ?? item?.styleCode, null);
const resolveWorkOrderItemStyleName = (item: any) =>
  resolveOptionalString(item?.style?.name ?? item?.styleName, null);
const resolveWorkOrderItemColorName = (item: any) =>
  resolveOptionalString(item?.color?.name ?? item?.colorName, null) ??
  resolveOptionalString(item?.color?.code ?? item?.colorCode, null) ??
  "";
const resolveAssignmentPlanColorName = (plan: any) =>
  resolveOptionalString(plan?.attrColor?.name ?? plan?.colorName, null) ??
  resolveOptionalString(plan?.attrColor?.code, null) ??
  "";

const resolveStyleSyncTargetOrgIds = async (orgId: number) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, type: true },
  });
  if (!org) return [orgId];

  const targetOrgIds = new Set<number>([org.id]);

  if (org.type === "MANUFACTURER") {
    const relationships = await prisma.orgRelationship.findMany({
      where: { manufacturerOrgId: org.id },
      select: { brandOrgId: true },
    });
    relationships.forEach((relationship) => {
      const brandOrgId = Number(relationship?.brandOrgId);
      if (Number.isSafeInteger(brandOrgId) && brandOrgId > 0) {
        targetOrgIds.add(brandOrgId);
      }
    });
  } else if (org.type === "BRAND") {
    const relationships = await prisma.orgRelationship.findMany({
      where: { brandOrgId: org.id },
      select: { manufacturerOrgId: true },
    });
    relationships.forEach((relationship) => {
      const manufacturerOrgId = Number(relationship?.manufacturerOrgId);
      if (Number.isSafeInteger(manufacturerOrgId) && manufacturerOrgId > 0) {
        targetOrgIds.add(manufacturerOrgId);
      }
    });
  }

  return Array.from(targetOrgIds.values());
};

type AtSyncRunOptions = {
  trainingMonthKey?: string | null;
};

const resolveAtSyncTrainingMonthKey = (options: AtSyncRunOptions = {}) => {
  const override = normalizeMonthKey(options.trainingMonthKey);
  if (override) return override;
  return resolveAtTrainingMonthKey({
    now: new Date(),
    timeZone: BUSINESS_TIME_ZONE,
    cutoffDay: AT_TRAINING_CUTOFF_DAY,
  });
};

const syncStyleProcessActualTimesFromWorkRecords = async (
  orgId: number,
  options: AtSyncRunOptions = {}
) => {
  const trainingMonthKey = resolveAtSyncTrainingMonthKey(options);
  const startedAt = Date.now();
  const finish = (
    updatedStyles: number,
    updatedProcesses: number,
    reason = "done"
  ) => {
    console.log(
      `[AT sync] orgId=${orgId} month=${trainingMonthKey} updatedStyles=${updatedStyles} updatedProcesses=${updatedProcesses} reason=${reason} durationMs=${Date.now() - startedAt}`
    );
    return { updatedStyles, updatedProcesses };
  };
  console.log(`[AT sync] start orgId=${orgId} month=${trainingMonthKey}`);
  const workLogs = await prisma.workLog.findMany({
    where: {
      orgId,
      workDate: { startsWith: trainingMonthKey },
    },
    select: {
      workDate: true,
      factoryId: true,
      workerCount: true,
      workRecords: {
        where: {
          quantity: { gt: 0 },
          styleId: { not: null },
        },
        select: {
          workerId: true,
          styleId: true,
          styleName: true,
          customerName: true,
          processCode: true,
          process: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          quantity: true,
        },
      },
    },
    orderBy: [{ workDate: "asc" }, { id: "asc" }],
  });

  const styleIds = Array.from(
    new Set(
      workLogs
        .flatMap((workLog) => workLog.workRecords)
        .map((record) => String(record.styleId || "").trim())
        .filter((styleId) => styleId !== "")
    )
  );
  if (styleIds.length === 0) {
    return finish(0, 0, "no_style_ids");
  }

  const syncTargetOrgIds = await resolveStyleSyncTargetOrgIds(orgId);
  const styleCandidates = await prisma.style.findMany({
    where: {
      orgId: { in: syncTargetOrgIds },
      styleId: { in: styleIds },
    },
    select: {
      uid: true,
      orgId: true,
      styleId: true,
      name: true,
      customer: true,
      processes: true,
    },
  });
  if (styleCandidates.length === 0) {
    return finish(0, 0, "no_style_candidates");
  }

  const stylesByStyleId = new Map<string, any[]>();
  styleCandidates.forEach((style) => {
    const key = String(style.styleId || "").trim();
    if (!key) return;
    const current = stylesByStyleId.get(key) || [];
    current.push(style);
    stylesByStyleId.set(key, current);
  });

  const resolveCandidateStyle = (record: {
    styleId: any;
    styleName: any;
    customerName: any;
  }) => {
    const styleId = String(record.styleId || "").trim();
    if (!styleId) return null;
    const candidates = stylesByStyleId.get(styleId) || [];
    if (candidates.length === 0) return null;

    const recordCustomerKey = normalizeComparableText(record.customerName);
    const recordStyleNameKey = normalizeComparableText(record.styleName);
    const sameCustomerCandidates = recordCustomerKey
      ? candidates.filter(
          (candidate) =>
            normalizeComparableText(candidate.customer) === recordCustomerKey
        )
      : candidates;
    const sameNameCandidates = recordStyleNameKey
      ? sameCustomerCandidates.filter(
          (candidate) => normalizeComparableText(candidate.name) === recordStyleNameKey
        )
      : sameCustomerCandidates;

    let resolvedStyle =
      sameNameCandidates[0] ??
      sameCustomerCandidates[0] ??
      candidates.find((candidate) => Number(candidate.orgId) === orgId) ??
      null;
    if (!resolvedStyle && candidates.length === 1) {
      resolvedStyle = candidates[0];
    }
    return resolvedStyle;
  };

  const trainingDayBuckets: AtTrainingDayBucket[] = [];
  const fallbackPerPieceByMetricKey = new Map<string, number | null>();
  const metricTrainingQualityByMetricKey = new Map<
    string,
    {
      totalQuantity: number;
      weightedCoverageQuantity: number;
      observationCount: number;
    }
  >();
  const matchedStyleUids = new Set<number>();
  const attendanceSecondsByWorkerDate = new Map<string, number>();
  const processLookupByStyleUid = styleCandidates.reduce((map, style) => {
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    normalizeStyleProcesses(style?.processes).forEach((process) => {
      const codeKey = normalizeProcessCodeKey((process as any)?.code);
      const nameKey = normalizeProcessNameKey((process as any)?.name);
      if (codeKey && !byCode.has(codeKey)) {
        byCode.set(codeKey, process);
      }
      if (nameKey && !byName.has(nameKey)) {
        byName.set(nameKey, process);
      }
    });
    map.set(style.uid, { byCode, byName });
    return map;
  }, new Map<number, { byCode: Map<string, any>; byName: Map<string, any> }>());

  if (USE_ATTENDANCE_INPUT_FOR_AT && workLogs.length > 0) {
    const workDates = Array.from(
      new Set(
        workLogs
          .map((workLog) => normalizeDateKey(workLog.workDate))
          .filter((value) => value !== "")
      )
    );
    const factoryIds = Array.from(
      new Set(
        workLogs
          .map((workLog) => toPositiveIntOrNull((workLog as any).factoryId))
          .filter((factoryId): factoryId is number => factoryId !== null)
      )
    );
    const workerIds = Array.from(
      new Set(
        workLogs
          .flatMap((workLog) => workLog.workRecords)
          .map((record) => toPositiveIntOrNull(record.workerId))
          .filter((workerId): workerId is number => workerId !== null)
      )
    );

    if (workDates.length > 0 && workerIds.length > 0) {
      try {
        const attendanceRows = await prisma.attendanceEntry.findMany({
          where: {
            orgId,
            workDate: { in: workDates },
            workerId: { in: workerIds },
            ...(factoryIds.length > 0 ? { factoryId: { in: factoryIds } } : {}),
          },
          select: {
            workDate: true,
            factoryId: true,
            workerId: true,
            workedSeconds: true,
          },
        });
        attendanceRows.forEach((row) => {
          const workDate = normalizeDateKey(row.workDate);
          const factoryId = toPositiveIntOrNull((row as any).factoryId);
          const workerId = toPositiveIntOrNull(row.workerId);
          const workedSeconds = toNumberOrNull(row.workedSeconds);
          if (
            !workDate ||
            factoryId === null ||
            workerId === null ||
            workedSeconds === null
          ) {
            return;
          }
          attendanceSecondsByWorkerDate.set(
            toAttendanceWorkerDateKey(workDate, workerId, factoryId),
            Math.max(0, Math.round(workedSeconds))
          );
        });
      } catch (error: unknown) {
        if (getErrorCode(error) !== "P2021") {
          throw error;
        }
        console.warn(
          `[AT sync] orgId=${orgId} month=${trainingMonthKey} attendance_table_missing=true fallback=default_8h`
        );
      }
    }
  }

  const resolveWorkerSecondsForDate = (
    workDate: string,
    workerId: number | null,
    factoryId: number | null
  ) => {
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      return ATTENDANCE_DEFAULT_WORK_SECONDS;
    }
    if (workerId === null || factoryId === null) {
      return ATTENDANCE_DEFAULT_WORK_SECONDS;
    }
    const key = toAttendanceWorkerDateKey(workDate, workerId, factoryId);
    if (!attendanceSecondsByWorkerDate.has(key)) {
      return ATTENDANCE_DEFAULT_WORK_SECONDS;
    }
    return toNonNegativeInt(attendanceSecondsByWorkerDate.get(key), 0);
  };

  const resolveProcessFallbackPerPieceSeconds = (
    styleUid: number,
    processCodeKey: string,
    processNameKey: string
  ) => {
    const lookup = processLookupByStyleUid.get(styleUid);
    if (!lookup) return null;
    const matched =
      (processCodeKey ? lookup.byCode.get(processCodeKey) : null) ||
      (processNameKey ? lookup.byName.get(processNameKey) : null) ||
      null;
    if (!matched) return null;
    return (
      toOptionalSeconds((matched as any).pt) ??
      toOptionalSeconds((matched as any).at) ??
      toOptionalSeconds((matched as any).ct)
    );
  };

  workLogs.forEach((workLog, workLogOrder) => {
    const workDate = normalizeDateKey(workLog.workDate);
    const workLogFactoryId = toPositiveIntOrNull((workLog as any).factoryId);
    if (!workDate) return;
    const resolvedRows = workLog.workRecords
      .map((record) => {
        const quantity = Number(record.quantity) || 0;
        if (quantity <= 0) return null;
        const resolvedStyle = resolveCandidateStyle(record);
        if (!resolvedStyle) return null;
        const processCodeKey = normalizeProcessCodeKey(record.processCode);
        const processNameKey = normalizeProcessNameKey(
          resolveWorkRecordProcessName(record)
        );
        if (!processCodeKey && !processNameKey) return null;
        return {
          resolvedStyle,
          quantity,
          workerId: toPositiveIntOrNull(record.workerId),
          processCodeKey,
          processNameKey,
        };
      })
      .filter(Boolean) as Array<{
      resolvedStyle: any;
      quantity: number;
      workerId: number | null;
      processCodeKey: string;
      processNameKey: string;
    }>;

    if (resolvedRows.length === 0) return;

    // AT 계산: worklog(라인×일자) 단위 총시간을 공정별 작업량(q * w_p)에 비례 배분하고,
    // 이를 반복 수렴시킨 뒤 최종 WLS(가중치 보정)로 a,b를 추정한다.
    const perProcessGroups = new Map<
      string,
      {
        resolvedStyle: any;
        processCodeKey: string;
        processNameKey: string;
        totalQuantity: number;
      }
    >();
    const workerIdsForDay = new Set<number>();

    resolvedRows.forEach((row) => {
      const metricKey = row.processCodeKey
        ? toStyleProcessMetricKey(String(row.resolvedStyle.uid), "code", row.processCodeKey)
        : toStyleProcessMetricKey(String(row.resolvedStyle.uid), "name", row.processNameKey);

      const current = perProcessGroups.get(metricKey) || {
        resolvedStyle: row.resolvedStyle,
        processCodeKey: row.processCodeKey,
        processNameKey: row.processNameKey,
        totalQuantity: 0,
      };
      if (row.workerId !== null) workerIdsForDay.add(row.workerId);
      current.totalQuantity += row.quantity;
      perProcessGroups.set(metricKey, current);
    });

    let attendanceCoverageRatio: number | null = null;
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      attendanceCoverageRatio = 1;
    } else if (workerIdsForDay.size > 0) {
      if (workLogFactoryId === null) {
        attendanceCoverageRatio = 0;
      } else {
        let attendanceProvidedCount = 0;
        workerIdsForDay.forEach((workerId) => {
          const key = toAttendanceWorkerDateKey(workDate, workerId, workLogFactoryId);
          if (attendanceSecondsByWorkerDate.has(key)) {
            attendanceProvidedCount += 1;
          }
        });
        attendanceCoverageRatio = attendanceProvidedCount / workerIdsForDay.size;
      }
    }
    if (!Number.isFinite(attendanceCoverageRatio as number)) {
      attendanceCoverageRatio = null;
    } else if (attendanceCoverageRatio !== null) {
      attendanceCoverageRatio = Math.min(1, Math.max(0, attendanceCoverageRatio));
    }

    const totalDaySeconds =
      workerIdsForDay.size > 0
        ? Array.from(workerIdsForDay.values()).reduce(
            (sum, workerId) =>
              sum + resolveWorkerSecondsForDate(workDate, workerId, workLogFactoryId),
            0
          )
        : Math.max(
            1,
            toPositiveIntOrNull((workLog as any).workerCount) ?? 1
          ) * ATTENDANCE_DEFAULT_WORK_SECONDS;
    if (!Number.isFinite(totalDaySeconds) || totalDaySeconds <= 0) return;

    const dayProcessRows: AtTrainingDayProcessRow[] = [];
    perProcessGroups.forEach((group, metricKey) => {
      if (group.totalQuantity <= 0) return;
      matchedStyleUids.add(group.resolvedStyle.uid);
      dayProcessRows.push({
        metricKey,
        quantity: group.totalQuantity,
        attendanceCoverage: attendanceCoverageRatio,
      });
      const qualityCurrent = metricTrainingQualityByMetricKey.get(metricKey) || {
        totalQuantity: 0,
        weightedCoverageQuantity: 0,
        observationCount: 0,
      };
      qualityCurrent.totalQuantity += group.totalQuantity;
      if (attendanceCoverageRatio !== null) {
        qualityCurrent.weightedCoverageQuantity +=
          group.totalQuantity * attendanceCoverageRatio;
      }
      qualityCurrent.observationCount += 1;
      metricTrainingQualityByMetricKey.set(metricKey, qualityCurrent);
      if (!fallbackPerPieceByMetricKey.has(metricKey)) {
        fallbackPerPieceByMetricKey.set(
          metricKey,
          resolveProcessFallbackPerPieceSeconds(
            Number(group.resolvedStyle.uid),
            group.processCodeKey,
            group.processNameKey
          )
        );
      } else if (fallbackPerPieceByMetricKey.get(metricKey) == null) {
        const resolvedFallback = resolveProcessFallbackPerPieceSeconds(
          Number(group.resolvedStyle.uid),
          group.processCodeKey,
          group.processNameKey
        );
        if (resolvedFallback != null) {
          fallbackPerPieceByMetricKey.set(metricKey, resolvedFallback);
        }
      }
    });
    if (dayProcessRows.length === 0) return;

    trainingDayBuckets.push({
      dayKey: `${workDate}#${workLogOrder}`,
      order: workLogOrder,
      totalSeconds: totalDaySeconds,
      processRows: dayProcessRows,
    });
  });

  if (trainingDayBuckets.length === 0) {
    return finish(0, 0, "no_metric_observations");
  }

  const fittingResult = fitAtParamsWithProportionalAllocation(
    trainingDayBuckets,
    fallbackPerPieceByMetricKey
  );
  const fittedParamsByMetric = fittingResult.paramsByMetric;
  if (fittedParamsByMetric.size === 0) {
    return finish(0, 0, "no_fitted_metrics");
  }
  console.log(
    `[AT sync] orgId=${orgId} month=${trainingMonthKey} metrics=${fittedParamsByMetric.size} iterations=${fittingResult.iterationCount} converged=${fittingResult.converged}`
  );

  const styles = styleCandidates.filter((style) => matchedStyleUids.has(style.uid));

  let updatedStyles = 0;
  let updatedProcesses = 0;
  let clampAdjustedProcesses = 0;
  for (const style of styles) {
    const normalizedProcesses = normalizeStyleProcesses(style.processes);
    let changed = false;
    const nextProcesses = normalizedProcesses.map((process) => {
      if (!process || typeof process !== "object" || Array.isArray(process)) {
        return process;
      }

      const codeKey = normalizeProcessCodeKey((process as any).code);
      const nameKey = normalizeProcessNameKey((process as any).name);
      const metricKey =
        (codeKey
          ? toStyleProcessMetricKey(String(style.uid), "code", codeKey)
          : null) ||
        (nameKey
          ? toStyleProcessMetricKey(String(style.uid), "name", nameKey)
          : null);
      if (!metricKey) return process;

      const fittedRaw = fittedParamsByMetric.get(metricKey);
      if (!fittedRaw) return process;

      const currentAtParams = toStyleAtParams((process as any).atParams);
      const referenceQuantity = toPositiveInt(
        (process as any).timeRefQuantity,
        DEFAULT_TIME_REF_QUANTITY
      );
      const qualityStats = metricTrainingQualityByMetricKey.get(metricKey) || null;
      const nextAttendanceCoverage =
        qualityStats && qualityStats.totalQuantity > 0
          ? roundToScale(
              Math.min(
                1,
                Math.max(
                  0,
                  qualityStats.weightedCoverageQuantity / qualityStats.totalQuantity
                )
              ),
              4
            )
          : null;
      const nextAttendanceFallbackShare =
        nextAttendanceCoverage == null
          ? null
          : roundToScale(Math.max(0, 1 - nextAttendanceCoverage), 4);
      const nextObservationCount =
        qualityStats && qualityStats.observationCount > 0
          ? Math.trunc(qualityStats.observationCount)
          : null;
      const clampedA = clampAtSlopeByMonthlyChange(fittedRaw.a, currentAtParams, {
        observationCount: nextObservationCount,
      });
      const fitted =
        clampedA !== fittedRaw.a
          ? { a: clampedA, b: fittedRaw.b }
          : fittedRaw;
      if (clampedA !== fittedRaw.a) {
        clampAdjustedProcesses += 1;
      }
      const nextAt = toOptionalSeconds(fitted.a + fitted.b / referenceQuantity);
      const currentAt = toOptionalSeconds((process as any).at);
      if (nextAt === null) return process;
      const hasAtParamDelta =
        currentAtParams === null ||
        currentAtParams.a !== fitted.a ||
        currentAtParams.b !== fitted.b;
      const hasQualityDelta =
        (currentAtParams?.attendanceCoverage ?? null) !==
          (nextAttendanceCoverage ?? null) ||
        (currentAtParams?.attendanceFallbackShare ?? null) !==
          (nextAttendanceFallbackShare ?? null) ||
        (currentAtParams?.observationCount ?? null) !==
          (nextObservationCount ?? null);
      const hasTrainingPeriodDelta =
        currentAtParams?.trainedPeriod !== trainingMonthKey;
      const shouldRefreshAtParams =
        currentAtParams === null ||
        hasAtParamDelta ||
        hasQualityDelta ||
        hasTrainingPeriodDelta;
      const nextAtParams = shouldRefreshAtParams
        ? {
            a: fitted.a,
            b: fitted.b,
            version:
              currentAtParams === null
                ? 1
                : currentAtParams.version + (hasAtParamDelta ? 1 : 0),
            updatedAt: new Date().toISOString(),
            trainedPeriod: trainingMonthKey,
            attendanceCoverage: nextAttendanceCoverage,
            attendanceFallbackShare: nextAttendanceFallbackShare,
            observationCount: nextObservationCount,
          }
        : currentAtParams;
      const atParamsChanged = !isSameStyleAtParams(currentAtParams, nextAtParams);

      const isStManual = (process as any).stManual === true;
      const currentCt = toOptionalSeconds((process as any).ct);
      // ST(CT)는 자동으로 AT에 맞춰 변경하지 않음. stManual=false이면 PT 기준 유지.
      const pt = toOptionalSeconds((process as any).pt);
      const nextCt = !isStManual ? (pt ?? currentCt) : currentCt;
      const ctChanged = (currentCt ?? null) !== (nextCt ?? null);
      const atChanged = currentAt !== nextAt;
      if (!atChanged && !ctChanged && !atParamsChanged) return process;

      changed = true;
      updatedProcesses += 1;
      return {
        ...(process as any),
        at: nextAt,
        ...(atParamsChanged ? { atParams: nextAtParams } : {}),
        ...(ctChanged ? { ct: nextCt } : {}),
      };
    });

    if (!changed) continue;
    updatedStyles += 1;
    await prisma.style.update({
      where: { uid: style.uid },
      data: { processes: nextProcesses },
    });
  }

  if (clampAdjustedProcesses > 0) {
    console.log(
      `[AT sync] orgId=${orgId} month=${trainingMonthKey} clampAdjustedProcesses=${clampAdjustedProcesses} clampRatio=${AT_MONTHLY_A_CLAMP_RATIO}`
    );
  }

  return finish(updatedStyles, updatedProcesses);
};

type AtSyncEventSource =
  | "attendance_put"
  | "worklog_post"
  | "worklog_put"
  | "worklog_delete";

const atEventSyncInProgressOrgIds = new Set<number>();

const triggerAtSyncFromEvent = (orgId: number, source: AtSyncEventSource) => {
  const now = new Date();
  const todayKey = toDateKeyInTimeZone(now, BUSINESS_TIME_ZONE);
  const todayParts = todayKey ? parseDateKeyParts(todayKey) : null;
  if (todayParts && todayParts.day < AT_TRAINING_CUTOFF_DAY) {
    console.log(
      `[AT sync][event:${source}] orgId=${orgId} skipped=before_cutoff day=${todayParts.day} cutoff=${AT_TRAINING_CUTOFF_DAY}`
    );
    return;
  }

  if (atAutoSyncInProgress) {
    console.log(
      `[AT sync][event:${source}] orgId=${orgId} note=scheduler_in_progress`
    );
  }

  if (atEventSyncInProgressOrgIds.has(orgId)) {
    console.log(
      `[AT sync][event:${source}] orgId=${orgId} skipped=already_in_progress`
    );
    return;
  }

  atEventSyncInProgressOrgIds.add(orgId);
  const startedAt = Date.now();
  syncStyleProcessActualTimesFromWorkRecords(orgId)
    .then((result) => {
      console.log(
        `[AT sync][event:${source}] orgId=${orgId} updatedStyles=${Number(result?.updatedStyles || 0)} updatedProcesses=${Number(result?.updatedProcesses || 0)} durationMs=${Date.now() - startedAt}`
      );
    })
    .catch((error: unknown) => {
      console.error(
        `[AT sync][event:${source}] orgId=${orgId} failed:`,
        getErrorMessage(error, String(error))
      );
    })
    .finally(() => {
      atEventSyncInProgressOrgIds.delete(orgId);
    });
};

const normalizeStylePayload = (
  payload: any,
  fallbackStyleId: string | null = null,
  options: { includeProcesses?: boolean } = {}
) => {
  const rawId = typeof payload?.id === "string" ? payload.id.trim() : "";
  const styleId = rawId || fallbackStyleId || createStyleId();
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const customer =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";
  const styleCodeInput = resolveOptionalString(payload?.styleCode, null);
  const styleCode = styleCodeInput ?? styleId;
  const includeProcesses = options.includeProcesses !== false;

  return {
    styleId,
    styleCode,
    name,
    customer,
    registrationDate: resolveOptionalString(payload?.registrationDate, null),
    designer: resolveOptionalString(payload?.designer, null),
    collection: resolveOptionalString(payload?.collection, null),
    season: resolveOptionalString(payload?.season, null),
    imageUrls: ensureArray(payload?.imageUrls),
    processes: includeProcesses ? normalizeStyleProcesses(payload?.processes) : [],
    bom: ensureArray(payload?.bom),
    bomNotes: resolveOptionalString(payload?.bomNotes, null),
  };
};
const toOrganizationOption = (organization: any) => ({
  id: organization?.id ?? null,
  name: organization?.name ?? "",
  code: organization?.code ?? null,
  type: organization?.type ?? null,
});
const toUniqueOrganizationOptions = (organizations: any[] = []) => {
  const byId = new Map<number, any>();
  organizations.forEach((organization) => {
    const id = Number(organization?.id);
    if (!Number.isFinite(id) || byId.has(id)) return;
    byId.set(id, toOrganizationOption(organization));
  });
  return Array.from(byId.values());
};

const parseStyleOwnerOrgIdQuery = (rawValue: unknown): number | null => {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const text = String(rawValue).trim();
  if (!/^\d+$/.test(text)) {
    throw createHttpError(400, "invalid ownerOrgId");
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, "invalid ownerOrgId");
  }
  return parsed;
};

const getAccessibleStyleOwnerOrgIds = async (organization: any) => {
  if (isBrandOrg(organization)) {
    return [organization.id];
  }
  if (!isManufacturerOrg(organization)) {
    throw createHttpError(400, "invalid organization type");
  }

  const relationships = await prisma.orgRelationship.findMany({
    where: { manufacturerOrgId: organization.id },
    select: { brandOrgId: true },
  });

  const ownerIds = new Set<number>([organization.id]);
  relationships.forEach((relationship) => {
    const brandOrgId = Number(relationship?.brandOrgId);
    if (Number.isSafeInteger(brandOrgId) && brandOrgId > 0) {
      ownerIds.add(brandOrgId);
    }
  });

  return Array.from(ownerIds.values());
};

const resolveStyleOwnerForCreateOrThrow = async ({
  organization,
  payload,
}: {
  organization: any;
  payload: any;
}) => {
  if (isBrandOrg(organization)) {
    return {
      ownerOrgId: organization.id,
      ownerOrgName: String(organization?.name || "").trim(),
    };
  }
  if (!isManufacturerOrg(organization)) {
    throw createHttpError(400, "invalid organization type");
  }

  const customerOrgId = toPositiveIntOrNull(
    payload?.customerOrgId ?? payload?.buyerOrgId ?? payload?.customerId
  );
  const customerName =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";

  if (customerOrgId) {
    const relationship = await prisma.orgRelationship.findFirst({
      where: {
        manufacturerOrgId: organization.id,
        brandOrgId: customerOrgId,
      },
      include: { brand: true },
    });
    if (!relationship?.brand) {
      throw createHttpError(400, "customer relationship not found");
    }
    return {
      ownerOrgId: relationship.brand.id,
      ownerOrgName: String(relationship.brand.name || "").trim(),
    };
  }

  if (!customerName) {
    throw createHttpError(400, "customer is required");
  }

  const relationships = await prisma.orgRelationship.findMany({
    where: { manufacturerOrgId: organization.id },
    include: { brand: true },
    orderBy: { id: "asc" },
  });
  const normalizedCustomerName = customerName.toLowerCase();
  const matched = relationships.filter((relationship) => {
    const brandName =
      typeof relationship?.brand?.name === "string"
        ? relationship.brand.name.trim().toLowerCase()
        : "";
    return brandName !== "" && brandName === normalizedCustomerName;
  });

  if (matched.length === 0 || !matched[0]?.brand) {
    throw createHttpError(400, "customer relationship not found");
  }
  if (matched.length > 1) {
    throw createHttpError(409, "multiple customers matched; provide customerOrgId");
  }

  return {
    ownerOrgId: matched[0].brand.id,
    ownerOrgName: String(matched[0].brand.name || "").trim(),
  };
};

const resolveStyleByIdForAccess = async ({
  organization,
  styleId,
  ownerOrgId,
}: {
  organization: any;
  styleId: string;
  ownerOrgId: number | null;
}) => {
  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  let ownerScope = accessibleOwnerOrgIds;

  if (ownerOrgId !== null) {
    if (!accessibleOwnerOrgIds.includes(ownerOrgId)) {
      throw createHttpError(403, "style access denied");
    }
    ownerScope = [ownerOrgId];
  }

  const styles = await prisma.style.findMany({
    where: {
      styleId,
      orgId: { in: ownerScope },
    },
    orderBy: { uid: "asc" },
    take: ownerOrgId === null ? 2 : 1,
  });

  if (styles.length === 0) return null;
  if (ownerOrgId === null && styles.length > 1) {
    throw createHttpError(409, "multiple styles matched; specify ownerOrgId");
  }

  return styles[0];
};

const findStyleConflict = async ({
  orgId,
  customer,
  name,
  styleCode,
  excludeUid = null,
}: {
  orgId: number;
  customer: string;
  name: string;
  styleCode: string;
  excludeUid?: number | null;
}) => {
  const where: any = {
    orgId,
    customer,
    OR: [{ name }, { styleCode }],
  };
  if (Number.isFinite(excludeUid)) {
    where.NOT = { uid: excludeUid as number };
  }
  const conflict = await prisma.style.findFirst({
    where,
    select: { uid: true, name: true, styleCode: true },
  });
  if (!conflict) return null;
  if (conflict.name === name) {
    return "style name already exists for this customer";
  }
  if (conflict.styleCode === styleCode) {
    return "style code already exists for this customer";
  }
  return "style already exists for this customer";
};

const toStyleResponse = (
  style: any,
  options: { includeProcesses?: boolean } = {}
) => ({
  id: style.styleId,
  ownerOrgId: style.orgId ?? null,
  customerOrgId: style.orgId ?? null,
  ownerOrgName: style.customer ?? "",
  styleCode: style.styleCode ?? "",
  name: style.name ?? "",
  customer: style.customer ?? "",
  registrationDate: style.registrationDate ?? "",
  designer: style.designer ?? "",
  collection: style.collection ?? "",
  season: style.season ?? "",
  imageUrls: ensureArray(style.imageUrls),
  processes:
    options.includeProcesses === false
      ? []
      : normalizeStyleProcesses(style.processes),
  bom: ensureArray(style.bom),
  bomNotes: style.bomNotes ?? "",
  createdAt: style.createdAt,
  updatedAt: style.updatedAt,
});

const sumOrderItemQuantity = (item: any = {}) => {
  const direct = Number(item?.totalQuantity);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

  const fromSizeQuantities = Object.values(item?.sizeQuantities ?? {}).reduce(
    (sum: number, value: any) => sum + (Number(value) || 0),
    0
  );
  if (fromSizeQuantities > 0) return Math.round(fromSizeQuantities);

  const fromLegacyRows = ensureArray(item?.quantities).reduce(
    (sum: number, row: any) => sum + (Number(row?.quantity) || 0),
    0
  );
  if (fromLegacyRows > 0) return Math.round(fromLegacyRows);

  return 0;
};

const normalizeOrderItems = (value: any) =>
  ensureArray(value)
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      gender: normalizeWorkOrderItemGender(item?.gender, "M"),
      totalQuantity: sumOrderItemQuantity(item),
    }));

const syncOrderItemColorSnapshots = async (items: any) => {
  const normalizedItems = normalizeOrderItems(items);
  const colorIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => toPositiveIntOrNull(item?.colorId))
        .filter((value): value is number => value !== null)
    )
  );

  if (colorIds.length === 0) {
    return normalizedItems.map((item) => {
      const { colorName: _colorName, ...rest } = item ?? {};
      const colorCode =
        resolveOptionalString(item?.colorCode ?? item?.color, null) ?? "";
      return {
        ...rest,
        colorId: toPositiveIntOrNull(item?.colorId),
        colorCode,
      };
    });
  }

  const colors = await prisma.attrColor.findMany({
    where: { id: { in: colorIds } },
    select: { id: true, code: true, name: true },
  });
  const colorById = colors.reduce((map, color) => {
    map.set(color.id, color);
    return map;
  }, new Map<number, { id: number; code: string; name: string }>());

  return normalizedItems.map((item) => {
    const { colorName: _colorName, ...rest } = item ?? {};
    const colorId = toPositiveIntOrNull(item?.colorId);
    const linkedColor = colorId ? colorById.get(colorId) ?? null : null;
    const colorCode =
      resolveOptionalString(linkedColor?.code, null) ??
      resolveOptionalString(item?.colorCode ?? item?.color, null) ??
      "";

    return {
      ...rest,
      colorId: linkedColor?.id ?? null,
      colorCode,
    };
  });
};
const syncOrderItemStyleRefs = async (items: any, orgIds: any[]) => {
  const normalizedItems = normalizeOrderItems(items);
  const candidateOrgIds = collectPositiveIntSet(...orgIds);
  const styleIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => resolveOptionalString(item?.styleId, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const styleCodes = Array.from(
    new Set(
      normalizedItems
        .map((item) => resolveOptionalString(item?.styleCode, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const styleNames = Array.from(
    new Set(
      normalizedItems
        .map((item) => resolveOptionalString(item?.styleName, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (
    candidateOrgIds.length === 0 ||
    (styleIds.length === 0 && styleCodes.length === 0 && styleNames.length === 0)
  ) {
    return normalizedItems.map((item) => ({
      ...item,
      styleUid: toPositiveIntOrNull(item?.styleUid),
      styleId: resolveOptionalString(item?.styleId, null),
      styleName: resolveOptionalString(item?.styleName, null),
      styleCode: resolveOptionalString(item?.styleCode, null),
    }));
  }

  const styleWhere: Prisma.StyleWhereInput = {
    orgId: { in: candidateOrgIds },
    OR: [
      ...(styleIds.length > 0 ? [{ styleId: { in: styleIds } }] : []),
      ...(styleCodes.length > 0 ? [{ styleCode: { in: styleCodes } }] : []),
      ...(styleNames.length > 0 ? [{ name: { in: styleNames } }] : []),
    ],
  };
  const styles = await prisma.style.findMany({
    where: styleWhere,
    select: {
      uid: true,
      orgId: true,
      styleId: true,
      styleCode: true,
      name: true,
    },
  });

  const styleByUid = new Map<number, any>();
  const styleByOrgStyleId = new Map<string, any>();
  const styleByOrgStyleCode = new Map<string, any>();
  const styleByOrgStyleName = new Map<string, any>();
  styles.forEach((style) => {
    styleByUid.set(style.uid, style);
    const orgId = Number(style.orgId);
    if (style.styleId) {
      styleByOrgStyleId.set(`${orgId}:${normalizeComparableText(style.styleId)}`, style);
    }
    if (style.styleCode) {
      styleByOrgStyleCode.set(`${orgId}:${normalizeComparableText(style.styleCode)}`, style);
    }
    if (style.name) {
      styleByOrgStyleName.set(`${orgId}:${normalizeComparableText(style.name)}`, style);
    }
  });

  const resolveLinkedStyle = (item: any) => {
    const existingStyleUid = toPositiveIntOrNull(item?.styleUid);
    if (existingStyleUid) {
      const linked = styleByUid.get(existingStyleUid) ?? null;
      if (linked) return linked;
    }
    const styleIdKey = normalizeComparableText(item?.styleId);
    if (styleIdKey) {
      for (const orgId of candidateOrgIds) {
        const linked = styleByOrgStyleId.get(`${orgId}:${styleIdKey}`) ?? null;
        if (linked) return linked;
      }
    }
    const styleCodeKey = normalizeComparableText(item?.styleCode);
    if (styleCodeKey) {
      for (const orgId of candidateOrgIds) {
        const linked = styleByOrgStyleCode.get(`${orgId}:${styleCodeKey}`) ?? null;
        if (linked) return linked;
      }
    }
    const styleNameKey = normalizeComparableText(item?.styleName);
    if (styleNameKey) {
      for (const orgId of candidateOrgIds) {
        const linked = styleByOrgStyleName.get(`${orgId}:${styleNameKey}`) ?? null;
        if (linked) return linked;
      }
    }
    return null;
  };

  return normalizedItems.map((item) => {
    const linkedStyle = resolveLinkedStyle(item);
    return {
      ...item,
      styleUid: linkedStyle?.uid ?? toPositiveIntOrNull(item?.styleUid),
      styleId: resolveOptionalString(linkedStyle?.styleId ?? item?.styleId, null),
      styleName: resolveOptionalString(linkedStyle?.name ?? item?.styleName, null),
      styleCode: resolveOptionalString(
        linkedStyle?.styleCode ?? item?.styleCode,
        null
      ),
    };
  });
};

const buildOrderId = () =>
  `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_CREATE_SERIALIZABLE_RETRIES = 2;
const WORK_ORDER_ITEM_WITH_COLOR_INCLUDE = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    style: {
      select: {
        uid: true,
        styleId: true,
        styleCode: true,
        name: true,
      },
    },
    color: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
  },
};

const normalizeOrderPayload = (payload: any = {}, fallback: any = null) => {
  const fallbackOrderId =
    typeof fallback?.orderId === "string" ? fallback.orderId.trim() : "";
  const payloadOrderId =
    typeof payload?.id === "string" ? payload.id.trim() : "";
  const orderId = payloadOrderId || fallbackOrderId || buildOrderId();

  const fallbackOrderNumber =
    typeof fallback?.orderNumber === "string" ? fallback.orderNumber : "";
  const orderNumber =
    typeof payload?.orderNumber === "string"
      ? payload.orderNumber.trim()
      : fallbackOrderNumber;

  const items = normalizeOrderItems(
    payload?.items !== undefined ? payload.items : fallback?.items
  );
  const computedTotalQuantity = items.reduce(
    (sum, item) => sum + (Number(item?.totalQuantity) || 0),
    0
  );
  const buyerOrgId = toPositiveIntOrNull(
    payload?.buyerOrgId !== undefined ? payload.buyerOrgId : fallback?.buyerOrgId
  );
  const customerId = toPositiveIntOrNull(
    payload?.customerId !== undefined ? payload.customerId : fallback?.customerId
  );
  const resolvedCustomerId = customerId ?? buyerOrgId;
  const resolvedBuyerOrgId = buyerOrgId ?? resolvedCustomerId;

  const buyerOrgName = resolveOptionalString(
    payload?.buyerOrgName ?? payload?.customerName ?? payload?.customer,
    fallback?.buyerOrgName ?? fallback?.customerName ?? null
  );
  const customerName = resolveOptionalString(
    payload?.customerName ?? payload?.customer ?? payload?.buyerOrgName,
    fallback?.customerName ?? fallback?.buyerOrgName ?? null
  );
  const resolvedCustomerName = customerName ?? buyerOrgName;
  const resolvedBuyerOrgName = buyerOrgName ?? resolvedCustomerName;

  return {
    orderId,
    orderNumber,
    buyerOrgId: resolvedBuyerOrgId,
    buyerOrgName: resolvedBuyerOrgName,
    sellerOrgId: toNumberOrNull(
      payload?.sellerOrgId !== undefined
        ? payload.sellerOrgId
        : fallback?.sellerOrgId
    ),
    sellerOrgName: resolveOptionalString(
      payload?.sellerOrgName,
      fallback?.sellerOrgName ?? null
    ),
    customerId: resolvedCustomerId,
    customerName: resolvedCustomerName,
    dueDate: resolveOptionalString(payload?.dueDate, fallback?.dueDate ?? null),
    status: resolveWorkOrderStatus(
      payload?.status !== undefined ? payload?.status : fallback?.status,
      "ORDER_RECEIVED"
    ),
    items,
    totalQuantity: toNonNegativeInt(
      payload?.totalQuantity !== undefined
        ? payload.totalQuantity
        : fallback?.totalQuantity,
      computedTotalQuantity
    ),
  };
};

const getOrderAccessWhere = (orgId: number) => [
  { orgId },
  { buyerOrgId: orgId },
  { sellerOrgId: orgId },
];

const resolveOrderPartiesOrThrow = async ({
  buyerOrgId,
  sellerOrgId,
  requesterOrgId,
}: {
  buyerOrgId: number | null;
  sellerOrgId: number | null;
  requesterOrgId: number;
}) => {
  if (!buyerOrgId) {
    throw createHttpError(400, "buyerOrgId is required");
  }
  if (!sellerOrgId) {
    throw createHttpError(400, "sellerOrgId is required");
  }
  if (buyerOrgId === sellerOrgId) {
    throw createHttpError(400, "buyer and seller must be different organizations");
  }
  if (requesterOrgId !== buyerOrgId && requesterOrgId !== sellerOrgId) {
    throw createHttpError(403, "request organization must be buyer or seller");
  }

  const organizations = await prisma.organization.findMany({
    where: { id: { in: [buyerOrgId, sellerOrgId] } },
    select: { id: true, name: true, type: true },
  });

  const buyer = organizations.find((item) => item.id === buyerOrgId) ?? null;
  const seller = organizations.find((item) => item.id === sellerOrgId) ?? null;
  if (!buyer || !seller) {
    throw createHttpError(400, "buyer or seller organization not found");
  }
  if (!isBrandOrg(buyer)) {
    throw createHttpError(400, "buyer organization must be BRAND");
  }
  if (!isManufacturerOrg(seller)) {
    throw createHttpError(400, "seller organization must be MANUFACTURER");
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: {
      brandOrgId: buyerOrgId,
      manufacturerOrgId: sellerOrgId,
    },
    select: { id: true },
  });
  if (!relationship) {
    throw createHttpError(400, "buyer and seller must have an active relationship");
  }

  return { buyer, seller };
};

const findSharedOrderConflict = async ({
  buyerOrgId,
  sellerOrgId,
  orderNumber,
  excludeOrderRecordId = null,
}: {
  buyerOrgId: number;
  sellerOrgId: number;
  orderNumber: string;
  excludeOrderRecordId?: number | null;
}) => {
  const normalizedOrderNumber = String(orderNumber || "").trim();
  if (!normalizedOrderNumber) return null;

  return prisma.workOrder.findFirst({
    where: {
      buyerOrgId,
      sellerOrgId,
      orderNumber: normalizedOrderNumber,
      ...(excludeOrderRecordId ? { NOT: { id: excludeOrderRecordId } } : {}),
    },
    select: { id: true, orderId: true },
    orderBy: { id: "asc" },
  });
};

const createOrReuseSharedOrder = async ({ normalized }: { normalized: any }) => {
  const resolvedOwnerOrgId = toPositiveIntOrNull(normalized?.buyerOrgId);
  if (!resolvedOwnerOrgId) {
    throw createHttpError(400, "buyerOrgId is required");
  }

  for (let attempt = 0; attempt <= ORDER_CREATE_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.workOrder.findFirst({
            where: {
              buyerOrgId: normalized.buyerOrgId,
              sellerOrgId: normalized.sellerOrgId,
              orderNumber: normalized.orderNumber,
            },
            orderBy: { id: "asc" },
          });
          if (existing) {
            if (existing.orgId !== resolvedOwnerOrgId) {
              const normalizedExisting = await tx.workOrder.update({
                where: { id: existing.id },
                data: { orgId: resolvedOwnerOrgId },
              });
              return { order: normalizedExisting, created: false };
            }
            return { order: existing, created: false };
          }

          const created = await tx.workOrder.create({
            data: {
              orgId: resolvedOwnerOrgId,
              ...normalized,
            },
          });
          const itemsToCreate = normalizeOrderItems(normalized.items);
          if (itemsToCreate.length > 0) {
            await tx.workOrderItem.createMany({
              data: itemsToCreate.map((item: any, idx: number) => ({
                workOrderId: created.id,
                itemId: item.id || "",
                styleId: resolveOptionalString(item.styleId, null),
                styleUid: toPositiveIntOrNull(item.styleUid),
                styleName: resolveOptionalString(item.styleName, null),
                styleCode: resolveOptionalString(item.styleCode, null),
                colorId: toPositiveIntOrNull(item.colorId),
                colorCode: resolveOptionalString(item.colorCode, null),
                gender: normalizeWorkOrderItemGender(item.gender, "M"),
                sizeQuantities: item.sizeQuantities ?? null,
                totalQuantity: toNonNegativeInt(item.totalQuantity, 0),
                sortOrder: idx,
              })),
            });
          }
          const createdWithItems = await tx.workOrder.findUnique({
            where: { id: created.id },
            include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
          });
          return { order: createdWithItems ?? created, created: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }
      );
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "P2034" && attempt < ORDER_CREATE_SERIALIZABLE_RETRIES) {
        continue;
      }
      if (code === "P2002") {
        const existing = await prisma.workOrder.findFirst({
          where: {
            buyerOrgId: normalized.buyerOrgId,
            sellerOrgId: normalized.sellerOrgId,
            orderNumber: normalized.orderNumber,
          },
          orderBy: { id: "asc" },
        });
        if (existing) {
          if (existing.orgId !== resolvedOwnerOrgId) {
            const normalizedExisting = await prisma.workOrder.update({
              where: { id: existing.id },
              data: { orgId: resolvedOwnerOrgId },
            });
            return { order: normalizedExisting, created: false };
          }
          return { order: existing, created: false };
        }
      }
      throw error;
    }
  }

  throw createHttpError(409, "failed to create order due to concurrent updates");
};

const workOrderItemToItemShape = (row: any) => ({
  id: row.itemId || String(row.id),
  styleUid: resolveWorkOrderItemStyleUid(row),
  styleId: resolveWorkOrderItemStyleId(row) ?? "",
  styleName: resolveWorkOrderItemStyleName(row) ?? "",
  styleCode: resolveWorkOrderItemStyleCode(row) ?? "",
  colorId: toPositiveIntOrNull(row?.color?.id ?? row?.colorId),
  colorCode: row?.color?.code ?? row.colorCode ?? "",
  colorName: resolveWorkOrderItemColorName(row),
  gender: normalizeWorkOrderItemGender(row?.gender, "M") ?? "M",
  sizeQuantities: row.sizeQuantities ?? {},
  totalQuantity: row.totalQuantity ?? 0,
});

const toOrderResponse = (order: any) => {
  const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
    ? [...order.workOrderItems]
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(workOrderItemToItemShape)
    : null;
  const items = itemsFromRelation ?? normalizeOrderItems(order?.items);
  const ownerOrgId = order.buyerOrgId ?? order.orgId ?? null;
  return {
    id: order.orderId,
    ownerOrgId,
    orderNumber: order.orderNumber ?? "",
    buyerOrgId: order.buyerOrgId ?? null,
    buyerOrgName: order.buyerOrgName ?? "",
    sellerOrgId: order.sellerOrgId ?? null,
    sellerOrgName: order.sellerOrgName ?? "",
    customerId: order.customerId ?? order.buyerOrgId ?? null,
    customerName: order.customerName ?? order.buyerOrgName ?? "",
    customer: order.customerName ?? order.buyerOrgName ?? "",
    dueDate: order.dueDate ?? "",
    status: resolveWorkOrderStatus(order.status, "ORDER_RECEIVED"),
    items,
    totalQuantity: toNonNegativeInt(order.totalQuantity, 0),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

const normalizeDateKey = (value: any) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};
const normalizeMonthKey = (value: any) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : "";
};
const BUSINESS_TIME_ZONE = resolveOptionalString(process.env.BUSINESS_TIME_ZONE, "Asia/Seoul") || "Asia/Seoul";
const resolveFiniteEnvNumber = (
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
};
const WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER = resolveFiniteEnvNumber(
  process.env.WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER,
  3,
  1
);
const toDateKeyInTimeZone = (input: any, timeZone = BUSINESS_TIME_ZONE) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
};
const todayDateKey = () => toDateKeyInTimeZone(new Date()) || new Date().toISOString().slice(0, 10);
const normalizeTimeText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
const parseTimeToMinutes = (value: any): number | null => {
  const normalized = normalizeTimeText(value);
  if (!normalized) return null;
  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};
const calculateWorkedSeconds = (clockIn: any, clockOut: any): number | null => {
  const inMinutes = parseTimeToMinutes(clockIn);
  const outMinutes = parseTimeToMinutes(clockOut);
  if (inMinutes === null || outMinutes === null) return null;
  const diffMinutes =
    outMinutes >= inMinutes
      ? outMinutes - inMinutes
      : 24 * 60 - inMinutes + outMinutes;
  return Math.max(0, Math.round(diffMinutes * 60));
};
const toAttendanceWorkerDateKey = (
  workDate: string,
  workerId: number,
  factoryId: number
) => `${workDate}::${workerId}::${factoryId}`;
const normalizeAttendanceEntryPayloadList = (entries: any) => {
  const rows: Array<{
    workerId: number;
    clockIn: string | null;
    clockOut: string | null;
    workedSeconds: number | null;
    note: string | null;
  }> = [];
  const seenWorkerIds = new Set<number>();
  let invalidWorkerEntryIndex = -1;
  let invalidClockInEntryIndex = -1;
  let invalidClockOutEntryIndex = -1;
  let duplicateWorkerId: number | null = null;

  ensureArray(entries).forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;

    const clockInInput = resolveOptionalString(entry.clockIn, null);
    const clockOutInput = resolveOptionalString(entry.clockOut, null);
    const note = resolveOptionalString(entry.note, null);
    const hasAnyInput = clockInInput !== null || clockOutInput !== null || note !== null;
    if (!hasAnyInput) return;

    const workerId = toPositiveIntOrNull(entry.workerId);
    if (workerId === null) {
      if (invalidWorkerEntryIndex < 0) invalidWorkerEntryIndex = index;
      return;
    }

    const clockIn = normalizeTimeText(clockInInput);
    const clockOut = normalizeTimeText(clockOutInput);
    if (clockInInput !== null && clockIn === null) {
      if (invalidClockInEntryIndex < 0) invalidClockInEntryIndex = index;
      return;
    }
    if (clockOutInput !== null && clockOut === null) {
      if (invalidClockOutEntryIndex < 0) invalidClockOutEntryIndex = index;
      return;
    }

    if (seenWorkerIds.has(workerId)) {
      duplicateWorkerId = workerId;
      return;
    }
    seenWorkerIds.add(workerId);

    rows.push({
      workerId,
      clockIn,
      clockOut,
      workedSeconds: calculateWorkedSeconds(clockIn, clockOut),
      note,
    });
  });

  return {
    rows,
    invalidWorkerEntryIndex,
    invalidClockInEntryIndex,
    invalidClockOutEntryIndex,
    duplicateWorkerId,
  };
};
const toAttendanceEntryResponse = (entry: any) => ({
  id: entry?.id ?? null,
  orgId: entry?.orgId ?? null,
  factoryId: entry?.factoryId ?? null,
  workerId: entry?.workerId ?? null,
  workDate: entry?.workDate ?? "",
  clockIn: entry?.clockIn ?? null,
  clockOut: entry?.clockOut ?? null,
  workedSeconds:
    entry?.workedSeconds == null ? null : toNonNegativeInt(entry?.workedSeconds, 0),
  note: entry?.note ?? null,
  createdAt: entry?.createdAt ?? null,
  updatedAt: entry?.updatedAt ?? null,
});
const toNonNegativeInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};
const toSignedInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
};
const toOptionalFiniteNumber = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const normalizeWorkRecordPayloadList = (records: any) => {
  const rows: any[] = [];
  let invalidWorkerRecordIndex = -1;

  ensureArray(records).forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    const quantity = toNonNegativeInt(record.quantity, 0);
    if (quantity <= 0) return;

    const workerId = toPositiveIntOrNull(record.workerId);
    if (!workerId) {
      if (invalidWorkerRecordIndex < 0) invalidWorkerRecordIndex = index;
      return;
    }

    rows.push({
      workerId,
      workerName: resolveOptionalString(record.workerName, null),
      customerName: resolveOptionalString(record.customerName, null),
      styleId: resolveOptionalString(record.styleId, null),
      styleUid: toPositiveIntOrNull(record.styleUid),
      styleName: resolveOptionalString(record.styleName, null),
      processId: toPositiveIntOrNull(record.processId),
      processCode: resolveOptionalString(record.processCode, null),
      processName: resolveOptionalString(record.processName, null),
      colorId: toPositiveIntOrNull(record.colorId),
      colorCode: resolveOptionalString(record.colorCode, null),
      colorName: resolveOptionalString(record.colorName, null),
      ctSeconds: toNonNegativeInt(record.ctSeconds, 0),
      quantity,
      assignmentPlanId: toPositiveIntOrNull(record.assignmentPlanId),
    });
  });

  return { rows, invalidWorkerRecordIndex };
};
const syncWorkRecordRefs = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any[];
}) => {
  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedRecords.length === 0) return [];

  const styleIds = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.styleId, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const styleNames = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.styleName, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const processIds = collectPositiveIntSet(
    ...normalizedRecords.map((record) => record?.processId)
  );
  const processCodes = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.processCode, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const processNames = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.processName, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const colorIds = collectPositiveIntSet(
    ...normalizedRecords.map((record) => record?.colorId)
  );
  const colorCodes = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.colorCode, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const colorNames = Array.from(
    new Set(
      normalizedRecords
        .map((record) => resolveOptionalString(record?.colorName, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  const [styles, processes, colors] = await Promise.all([
    styleIds.length > 0 || styleNames.length > 0
      ? prisma.style.findMany({
          where: {
            orgId,
            OR: [
              ...(styleIds.length > 0 ? [{ styleId: { in: styleIds } }] : []),
              ...(styleNames.length > 0 ? [{ name: { in: styleNames } }] : []),
            ],
          },
          select: {
            uid: true,
            styleId: true,
            styleCode: true,
            name: true,
          },
        })
      : Promise.resolve([]),
    processIds.length > 0 || processCodes.length > 0 || processNames.length > 0
      ? prisma.attrProcess.findMany({
          where: {
            orgId,
            OR: [
              ...(processIds.length > 0 ? [{ id: { in: processIds } }] : []),
              ...(processCodes.length > 0 ? [{ code: { in: processCodes } }] : []),
              ...(processNames.length > 0 ? [{ name: { in: processNames } }] : []),
            ],
          },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    colorIds.length > 0 || colorCodes.length > 0 || colorNames.length > 0
      ? prisma.attrColor.findMany({
          where: {
            orgId,
            OR: [
              ...(colorIds.length > 0 ? [{ id: { in: colorIds } }] : []),
              ...(colorCodes.length > 0 ? [{ code: { in: colorCodes } }] : []),
              ...(colorNames.length > 0 ? [{ name: { in: colorNames } }] : []),
            ],
          },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const styleByUid = new Map(styles.map((style) => [style.uid, style]));
  const styleById = new Map(
    styles
      .filter((style) => style.styleId)
      .map((style) => [normalizeComparableText(style.styleId), style])
  );
  const styleByName = new Map(
    styles
      .filter((style) => style.name)
      .map((style) => [normalizeComparableText(style.name), style])
  );
  const processById = new Map(processes.map((process) => [process.id, process]));
  const processByCode = new Map(
    processes
      .filter((process) => process.code)
      .map((process) => [normalizeComparableText(process.code), process])
  );
  const processByName = new Map(
    processes
      .filter((process) => process.name)
      .map((process) => [normalizeComparableText(process.name), process])
  );
  const colorById = new Map(colors.map((color) => [color.id, color]));
  const colorByCode = new Map(
    colors
      .filter((color) => color.code)
      .map((color) => [normalizeComparableText(color.code), color])
  );
  const colorByName = new Map(
    colors
      .filter((color) => color.name)
      .map((color) => [normalizeComparableText(color.name), color])
  );

  return normalizedRecords.map((record) => {
    const linkedStyle =
      (toPositiveIntOrNull(record?.styleUid)
        ? styleByUid.get(Number(record.styleUid)) ?? null
        : null) ??
      (resolveOptionalString(record?.styleId, null)
        ? styleById.get(normalizeComparableText(record.styleId)) ?? null
        : null) ??
      (resolveOptionalString(record?.styleName, null)
        ? styleByName.get(normalizeComparableText(record.styleName)) ?? null
        : null);
    const linkedProcess =
      (toPositiveIntOrNull(record?.processId)
        ? processById.get(Number(record.processId)) ?? null
        : null) ??
      (resolveOptionalString(record?.processCode, null)
        ? processByCode.get(normalizeComparableText(record.processCode)) ?? null
        : null) ??
      (resolveOptionalString(record?.processName, null)
        ? processByName.get(normalizeComparableText(record.processName)) ?? null
        : null);
    const linkedColor =
      (toPositiveIntOrNull(record?.colorId)
        ? colorById.get(Number(record.colorId)) ?? null
        : null) ??
      (resolveOptionalString(record?.colorCode, null)
        ? colorByCode.get(normalizeComparableText(record.colorCode)) ?? null
        : null) ??
      (resolveOptionalString(record?.colorName, null)
        ? colorByName.get(normalizeComparableText(record.colorName)) ?? null
        : null);

    return {
      ...record,
      styleUid: linkedStyle?.uid ?? toPositiveIntOrNull(record?.styleUid),
      styleId: resolveOptionalString(linkedStyle?.styleId ?? record?.styleId, null),
      styleName: resolveOptionalString(linkedStyle?.name ?? record?.styleName, null),
      processId: linkedProcess?.id ?? toPositiveIntOrNull(record?.processId),
      processCode: resolveOptionalString(
        linkedProcess?.code ?? record?.processCode,
        null
      ),
      processName: resolveOptionalString(
        linkedProcess?.name ?? record?.processName,
        null
      ),
      colorId: linkedColor?.id ?? toPositiveIntOrNull(record?.colorId),
      colorCode: resolveOptionalString(linkedColor?.code ?? record?.colorCode, null),
      colorName: resolveOptionalString(linkedColor?.name ?? record?.colorName, null),
    };
  });
};
const buildWorkDateRange = (workDate: any) => {
  const normalized = normalizeDateKey(workDate);
  if (!normalized) return null;
  const startAt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(startAt.getTime())) return null;
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setMilliseconds(endAt.getMilliseconds() - 1);
  return { dateKey: normalized, startAt, endAt };
};
const resolveWorkLogLineMeta = (
  value: any
): { lineId: number | null; lineName: string | null } => {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : Array.isArray(value)
        ? value.find((item) => item && typeof item === "object")
        : null;

  const lineId = toPositiveIntOrNull(source?.lineId);
  const lineName = resolveOptionalString(source?.lineName, null);
  return { lineId, lineName };
};
const resolveWorkLogRecordResponses = (workLog: any) => {
  if (Array.isArray(workLog?.workRecords) && workLog.workRecords.length > 0) {
    return workLog.workRecords.map(toWorkRecordResponse);
  }
  return Array.isArray(workLog?.records) ? ensureArray(workLog.records) : [];
};
const collectWorkRecordWorkerIds = (records: any): number[] =>
  Array.from(
    new Set(
      ensureArray(records)
        .map((record) => toPositiveIntOrNull(record?.workerId))
        .filter((workerId): workerId is number => workerId !== null)
    )
  );
const collectWorkRecordAssignmentPlanIds = (records: any): number[] =>
  Array.from(
    new Set(
      ensureArray(records)
        .map((record) => toPositiveIntOrNull(record?.assignmentPlanId))
        .filter((planId): planId is number => planId !== null)
    )
  );
const toAssignmentProcessBucketKey = (
  assignmentPlanId: number,
  processMetricKey: string
) => `${assignmentPlanId}::${processMetricKey}`;
const resolveWorkRecordProcessMetric = (
  processCodeInput: any,
  processNameInput: any
) => {
  const processCode = resolveOptionalString(processCodeInput, null);
  const processName = resolveOptionalString(processNameInput, null);
  const codeKey = normalizeProcessCodeKey(processCode);
  if (codeKey) {
    return {
      processMetricKey: `code:${codeKey}`,
      processLabel: processCode || processName || `CODE:${codeKey}`,
    };
  }
  const nameKey = normalizeProcessNameKey(processName);
  if (nameKey) {
    return {
      processMetricKey: `name:${nameKey}`,
      processLabel: processName || processCode || `NAME:${nameKey}`,
    };
  }
  return {
    processMetricKey: "unknown",
    processLabel: processName || processCode || "미지정 공정",
  };
};
const resolveWorkRecordProcessMetricFromRecord = (record: any) =>
  resolveWorkRecordProcessMetric(
    record?.processCode,
    resolveWorkRecordProcessName(record)
  );
type AssignmentProcessQuantityBucket = {
  assignmentPlanId: number;
  processMetricKey: string;
  processLabel: string;
  quantity: number;
};
const collectAssignmentProcessQuantities = (records: any) => {
  const buckets = new Map<string, AssignmentProcessQuantityBucket>();

  ensureArray(records).forEach((record) => {
    if (!record || typeof record !== "object") return;
    const assignmentPlanId = toPositiveIntOrNull(record.assignmentPlanId);
    if (!assignmentPlanId) return;

    const quantity = toNonNegativeInt(record.quantity, 0);
    if (quantity <= 0) return;

    const processMetric = resolveWorkRecordProcessMetricFromRecord(record);
    const bucketKey = toAssignmentProcessBucketKey(
      assignmentPlanId,
      processMetric.processMetricKey
    );
    const current = buckets.get(bucketKey);
    if (current) {
      current.quantity += quantity;
      return;
    }

    buckets.set(bucketKey, {
      assignmentPlanId,
      processMetricKey: processMetric.processMetricKey,
      processLabel: processMetric.processLabel,
      quantity,
    });
  });

  return buckets;
};
const resolvePositiveRoundedQuantity = (value: any): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
};
const resolveAssignmentPlanBaselineQuantity = (plan: any): number | null => {
  const finalQuantity = resolvePositiveRoundedQuantity(plan?.finalQuantity);
  if (finalQuantity !== null) return finalQuantity;
  return resolvePositiveRoundedQuantity(plan?.quantity);
};
const formatAssignmentPlanLabel = (plan: any) => {
  const parts = [
    resolveOptionalString(plan?.orderNo, null),
    resolveOptionalString(plan?.label, null),
    resolveAssignmentPlanColorName(plan),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(" · ");
  return resolveOptionalString(plan?.externalId, null) || `assignmentPlan#${plan?.id ?? "?"}`;
};
const validateWorkLogAssignmentPlanCtAgreement = async ({
  orgId,
  lineId,
  records,
}: {
  orgId: number;
  lineId: number | null;
  records: any;
}) => {
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(records);
  if (assignmentPlanIds.length === 0) {
    return { status: 200, error: null as string | null };
  }

  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId, id: { in: assignmentPlanIds } },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      ctStatus: true,
      orderNo: true,
      label: true,
      colorName: true,
    },
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const missingPlanIds = assignmentPlanIds.filter(
    (planId) => !planById.has(planId)
  );
  if (missingPlanIds.length > 0) {
    return {
      status: 400,
      error: `assignment plan not found (${missingPlanIds.join(",")})`,
    };
  }

  if (lineId !== null) {
    const mismatchedPlan = plans.find((plan) => plan.lineId !== lineId);
    if (mismatchedPlan) {
      return {
        status: 400,
        error: `assignment plan line mismatch (${formatAssignmentPlanLabel(mismatchedPlan)})`,
      };
    }
  }

  const nonAgreedPlans = plans.filter(
    (plan) => String(plan?.ctStatus || "").toUpperCase() !== "AGREED"
  );
  if (nonAgreedPlans.length > 0) {
    const preview = nonAgreedPlans
      .slice(0, 3)
      .map((plan) => formatAssignmentPlanLabel(plan))
      .join(", ");
    const extraText =
      nonAgreedPlans.length > 3 ? ` (+${nonAgreedPlans.length - 3} more)` : "";
    return {
      status: 400,
      error: `ct agreement required before work log (${preview}${extraText})`,
    };
  }

  return { status: 200, error: null as string | null };
};
const validateWorkLogAssignmentProcessQuantities = async ({
  orgId,
  lineId,
  records,
  excludedWorkLogId = null,
}: {
  orgId: number;
  lineId: number | null;
  records: any;
  excludedWorkLogId?: number | null;
}) => {
  const incomingBuckets = collectAssignmentProcessQuantities(records);
  if (incomingBuckets.size === 0) {
    return { status: 200, error: null as string | null };
  }

  const assignmentPlanIds = Array.from(
    new Set(
      Array.from(incomingBuckets.values()).map(
        (bucket) => bucket.assignmentPlanId
      )
    )
  );
  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId, id: { in: assignmentPlanIds } },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      orderNo: true,
      label: true,
      colorName: true,
      quantity: true,
      finalQuantity: true,
    },
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const missingPlanIds = assignmentPlanIds.filter(
    (planId) => !planById.has(planId)
  );
  if (missingPlanIds.length > 0) {
    return {
      status: 400,
      error: `assignment plan not found (${missingPlanIds.join(",")})`,
    };
  }

  if (lineId !== null) {
    const mismatchedPlan = plans.find((plan) => plan.lineId !== lineId);
    if (mismatchedPlan) {
      return {
        status: 400,
        error: `assignment plan line mismatch (${formatAssignmentPlanLabel(mismatchedPlan)})`,
      };
    }
  }

  const existingRows = await prisma.workRecord.groupBy({
    by: ["assignmentPlanId", "processId", "processCode"],
    where: {
      orgId,
      assignmentPlanId: { in: assignmentPlanIds },
      ...(excludedWorkLogId ? { workLogId: { not: excludedWorkLogId } } : {}),
    },
    _sum: { quantity: true },
  });
  const processIds = collectPositiveIntSet(
    ...existingRows.map((row) => row.processId)
  );
  const processes =
    processIds.length > 0
      ? await prisma.attrProcess.findMany({
          where: { id: { in: processIds } },
          select: { id: true, name: true },
        })
      : [];
  const processNameById = new Map(
    processes.map((process) => [process.id, resolveOptionalString(process.name, null)])
  );

  const existingBuckets = new Map<string, number>();
  existingRows.forEach((row) => {
    const assignmentPlanId = toPositiveIntOrNull(row.assignmentPlanId);
    if (!assignmentPlanId) return;
    const quantity = toNonNegativeInt(row._sum.quantity, 0);
    if (quantity <= 0) return;

    const processMetric = resolveWorkRecordProcessMetric(
      row.processCode,
      row.processId ? processNameById.get(Number(row.processId)) ?? null : null
    );
    const bucketKey = toAssignmentProcessBucketKey(
      assignmentPlanId,
      processMetric.processMetricKey
    );
    existingBuckets.set(bucketKey, (existingBuckets.get(bucketKey) || 0) + quantity);
  });

  const violations: Array<{
    planLabel: string;
    processLabel: string;
    nextQuantity: number;
    maxAllowedQuantity: number;
  }> = [];

  incomingBuckets.forEach((incoming, bucketKey) => {
    const plan = planById.get(incoming.assignmentPlanId);
    if (!plan) return;
    const baselineQuantity = resolveAssignmentPlanBaselineQuantity(plan);
    if (baselineQuantity === null) return;

    const maxAllowedQuantity = Math.max(
      baselineQuantity,
      Math.ceil(
        baselineQuantity * WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER
      )
    );
    const existingQuantity = existingBuckets.get(bucketKey) || 0;
    const nextQuantity = existingQuantity + incoming.quantity;
    if (nextQuantity <= maxAllowedQuantity) return;

    violations.push({
      planLabel: formatAssignmentPlanLabel(plan),
      processLabel: incoming.processLabel,
      nextQuantity,
      maxAllowedQuantity,
    });
  });

  if (violations.length > 0) {
    const preview = violations
      .slice(0, 3)
      .map(
        (item) =>
          `${item.planLabel} / ${item.processLabel}: ${item.nextQuantity} > ${item.maxAllowedQuantity}`
      )
      .join("; ");
    const extraText =
      violations.length > 3 ? ` (+${violations.length - 3} more)` : "";
    return {
      status: 400,
      error:
        `process quantity exceeds allowed range ` +
        `(max ${WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER}x baseline): ` +
        `${preview}${extraText}`,
    };
  }

  return { status: 200, error: null as string | null };
};
const validateWorkLogLineWorkers = async ({
  orgId,
  lineId,
  factoryId,
  workDate,
  workerIds,
}: {
  orgId: number;
  lineId: number | null;
  factoryId: number | null;
  workDate: string;
  workerIds: number[];
}) => {
  if (!lineId) {
    return {
      status: 400,
      error: "lineId is required",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

  const line = await prisma.line.findFirst({
    where: { id: lineId, orgId },
    select: { id: true, factoryId: true, name: true },
  });
  if (!line) {
    return {
      status: 404,
      error: "line not found",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

  if (factoryId !== null && line.factoryId !== factoryId) {
    return {
      status: 400,
      error: "line does not belong to selected factory",
      line,
      missingWorkerIds: [] as number[],
    };
  }

  const dateRange = buildWorkDateRange(workDate);
  if (!dateRange) {
    return {
      status: 400,
      error: "invalid workDate",
      line,
      missingWorkerIds: [] as number[],
    };
  }

  if (workerIds.length === 0) {
    return {
      status: 200,
      error: null as string | null,
      line,
      missingWorkerIds: [] as number[],
    };
  }

  const matchedAssignments = await prisma.lineAssignment.findMany({
    where: {
      lineId: line.id,
      employeeId: { in: workerIds },
      startAt: { lte: dateRange.endAt },
      OR: [{ endAt: null }, { endAt: { gte: dateRange.startAt } }],
    },
    select: { employeeId: true },
  });
  const matchedWorkerIdSet = new Set(
    matchedAssignments.map((assignment) => assignment.employeeId)
  );
  const missingWorkerIds = workerIds.filter(
    (workerId) => !matchedWorkerIdSet.has(workerId)
  );

  return {
    status: 200,
    error: null as string | null,
    line,
    missingWorkerIds,
  };
};
const translateWorkLogErrorMessage = (error: any) => {
  const text = resolveOptionalString(error, "") || "";
  if (!text) return "작업 기록 처리 중 오류가 발생했습니다.";

  const invalidWorkerMatch = text.match(/^records\[(\d+)\]\.workerId is required$/);
  if (invalidWorkerMatch) {
    const displayIndex = Number(invalidWorkerMatch[1]) + 1;
    return `${displayIndex}번째 작업 기록에 작업자가 없습니다. 작업자를 다시 선택해 주세요.`;
  }

  if (text === "organization not found") return "조직 정보를 찾을 수 없습니다.";
  if (text === "invalid id") return "작업 기록 ID가 올바르지 않습니다.";
  if (text === "factory not found") return "선택한 공장을 찾을 수 없습니다.";
  if (text === "work log not found") return "작업 기록을 찾을 수 없습니다.";
  if (text === "lineId is required") return "라인을 선택해 주세요.";
  if (text === "line not found") return "선택한 라인을 찾을 수 없습니다.";
  if (text === "line does not belong to selected factory") {
    return "선택한 라인이 현재 공장에 속하지 않습니다.";
  }
  if (text === "invalid workDate") return "작업일자가 올바르지 않습니다.";
  if (text.startsWith("line worker mismatch for workDate")) {
    return "선택한 작업일 기준으로 현재 라인에 속하지 않은 작업자가 포함되어 있습니다. 라인과 작업자를 다시 확인해 주세요.";
  }
  if (text.startsWith("assignment plan not found")) {
    return "선택한 배정카드를 찾을 수 없습니다.";
  }
  if (text.startsWith("assignment plan line mismatch")) {
    return "선택한 라인과 맞지 않는 배정카드가 포함되어 있습니다.";
  }
  if (text.startsWith("ct agreement required before work log")) {
    return "CT 동의가 완료된 배정 카드만 작업 기록으로 저장할 수 있습니다.";
  }
  if (text.startsWith("process quantity exceeds allowed range")) {
    return "배정카드 공정 수량이 허용 범위를 초과했습니다. 수량을 확인해 주세요.";
  }

  return text;
};
const toWorkRecordResponse = (record: any) => ({
  workerId: record?.workerId ?? null,
  workerName: record?.workerName ?? "",
  customerName: record?.customerName ?? "",
  styleUid: resolveWorkRecordStyleUid(record),
  styleId: resolveWorkRecordStyleId(record) ?? "",
  styleName: resolveWorkRecordStyleName(record) ?? "",
  processId: toPositiveIntOrNull(record?.process?.id ?? record?.processId),
  processCode: record?.process?.code ?? record?.processCode ?? "",
  processName: resolveWorkRecordProcessName(record) ?? "",
  colorId: toPositiveIntOrNull(record?.color?.id ?? record?.colorId),
  colorCode: record?.color?.code ?? record?.colorCode ?? "",
  colorName: resolveWorkRecordColorName(record),
  ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
  quantity: toNonNegativeInt(record?.quantity, 0),
  assignmentPlanId: record?.assignmentPlanId ?? null,
});
const normalizeWorkLogPayload = (payload: any = {}, fallback: any = null) => {
  const workDateInput =
    payload?.workDate !== undefined ? payload.workDate : fallback?.workDate;
  const normalizedWorkDate = normalizeDateKey(workDateInput) || todayDateKey();
  const fallbackLineMeta = resolveWorkLogLineMeta(fallback?.records);
  const normalizedRecords = normalizeWorkRecordPayloadList(
    payload?.records !== undefined ? payload.records : fallback?.records
  );
  const records = normalizedRecords.rows;

  return {
    workDate: normalizedWorkDate,
    factoryId: toNumberOrNull(
      payload?.factoryId !== undefined ? payload.factoryId : fallback?.factoryId
    ),
    factoryName: resolveOptionalString(
      payload?.factoryName,
      fallback?.factoryName ?? null
    ),
    lineId: toPositiveIntOrNull(
      payload?.lineId !== undefined ? payload?.lineId : fallbackLineMeta.lineId
    ),
    lineName: resolveOptionalString(
      payload?.lineName,
      fallbackLineMeta.lineName ?? null
    ),
    factoryWagePerSecond: toOptionalFiniteNumber(
      payload?.factoryWagePerSecond,
      fallback?.factoryWagePerSecond ?? null
    ),
    ctBasis:
      resolveOptionalString(payload?.ctBasis, fallback?.ctBasis ?? "CT") ?? "CT",
    workerCount: toNonNegativeInt(
      payload?.workerCount !== undefined
        ? payload.workerCount
        : fallback?.workerCount,
      0
    ),
    itemCount: toNonNegativeInt(
      payload?.itemCount !== undefined ? payload.itemCount : fallback?.itemCount,
      0
    ),
    totalContractedSeconds: toNonNegativeInt(
      payload?.totalContractedSeconds !== undefined
        ? payload.totalContractedSeconds
        : fallback?.totalContractedSeconds,
      0
    ),
    note: resolveOptionalString(payload?.note, fallback?.note ?? null),
    records,
    invalidWorkerRecordIndex: normalizedRecords.invalidWorkerRecordIndex,
  };
};
const toWorkLogResponse = (workLog: any) => {
  const lineMeta = resolveWorkLogLineMeta(workLog?.records);
  return {
    id: workLog.id,
    workDate: workLog.workDate,
    factoryId: workLog.factoryId ?? null,
    factoryName: workLog.factoryName ?? "",
    lineId: lineMeta.lineId,
    lineName: lineMeta.lineName ?? "",
    factoryWagePerSecond: workLog.factoryWagePerSecond ?? null,
    ctBasis: workLog.ctBasis ?? "CT",
    workerCount: workLog.workerCount ?? 0,
    itemCount: workLog.itemCount ?? 0,
    totalContractedSeconds: workLog.totalContractedSeconds ?? 0,
    note: workLog.note ?? "",
    records: resolveWorkLogRecordResponses(workLog),
    createdAt: workLog.createdAt,
    updatedAt: workLog.updatedAt,
  };
};
const ASSIGNMENT_CT_STATUSES = new Set(["PENDING", "SENT", "AGREED", "REJECTED"]);
const ASSIGNMENT_SENT_TIMEOUT_HOURS = 48;
const ASSIGNMENT_SENT_TIMEOUT_MS = ASSIGNMENT_SENT_TIMEOUT_HOURS * 60 * 60 * 1000;
const ASSIGNMENT_SENT_TIMEOUT_ESCALATION_REASON = "SENT_TIMEOUT_48H";
const toOptionalNonNegativeInt = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};
const toOptionalFloat = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const toOptionalDateValue = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
};
const resolveAssignmentCtStatus = (value: any) =>
  ASSIGNMENT_CT_STATUSES.has(value) ? value : "PENDING";
const toIsoDateStringOrNull = (value: any): string | null => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
const resolveAssignmentExternalId = (item: any): string | null =>
  resolveOptionalString(item?.id ?? item?.externalId, null);
const extractIsoDateFromText = (value: any): string | null => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const matched = raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  if (!matched || !matched[0]) return null;
  const date = new Date(matched[0]);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
const resolveAssignmentSentAtIso = (item: any): string | null => {
  const direct = toIsoDateStringOrNull(item?.ctSentAt);
  if (direct) return direct;
  return extractIsoDateFromText(item?.ctNote);
};
const normalizeStateAssignmentItem = (item: any): any => {
  if (!item || typeof item !== "object") return item;
  const externalId = resolveAssignmentExternalId(item);
  const ctStatus = resolveAssignmentCtStatus(
    resolveOptionalString(item?.ctStatus, "PENDING") ?? "PENDING"
  );
  const version = toNonNegativeInt(item?.version, 0);
  const versionUpdatedAt = toIsoDateStringOrNull(item?.versionUpdatedAt);
  const ctSentAt = resolveAssignmentSentAtIso(item);
  const ctEscalatedAt = toIsoDateStringOrNull(item?.ctEscalatedAt);
  const ctEscalationReason = resolveOptionalString(item?.ctEscalationReason, null);
  const ctEscalationTargetRole = resolveOptionalString(
    item?.ctEscalationTargetRole,
    null
  );
  const ctEscalationStatus = resolveOptionalString(item?.ctEscalationStatus, null);

  return {
    ...item,
    ...(externalId ? { id: externalId } : {}),
    ctStatus,
    version,
    versionUpdatedAt,
    ctSentAt: ctStatus === "SENT" ? ctSentAt : null,
    ctEscalatedAt: ctStatus === "SENT" ? ctEscalatedAt : null,
    ctEscalationReason: ctStatus === "SENT" ? ctEscalationReason : null,
    ctEscalationTargetRole: ctStatus === "SENT" ? ctEscalationTargetRole : null,
    ctEscalationStatus: ctStatus === "SENT" ? ctEscalationStatus : null,
  };
};
const normalizeStateAssignments = (items: any): any[] =>
  ensureArray(items).map((item) => normalizeStateAssignmentItem(item));
const buildAssignmentVersionMap = (items: any[]): Map<string, number> =>
  ensureArray(items).reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, toNonNegativeInt(item?.version, 0));
    return map;
  }, new Map<string, number>());
const findAssignmentVersionConflicts = (
  incomingAssignments: any[],
  currentVersionByExternalId: Map<string, number>
) => {
  const seen = new Set<string>();
  return ensureArray(incomingAssignments).reduce((rows: any[], item) => {
    if (!item || typeof item !== "object") return rows;
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || seen.has(externalId)) return rows;
    seen.add(externalId);
    const expectedVersion = toNonNegativeInt(item?.version, 0);
    const currentVersion = currentVersionByExternalId.get(externalId) ?? 0;
    if (expectedVersion === currentVersion) return rows;
    rows.push({
      id: externalId,
      expectedVersion,
      currentVersion,
    });
    return rows;
  }, [] as any[]);
};
const withIncrementedAssignmentVersions = (
  incomingAssignments: any[],
  currentVersionByExternalId: Map<string, number>,
  nowIso: string
): any[] =>
  ensureArray(incomingAssignments).map((item) => {
    if (!item || typeof item !== "object") return item;
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId) return item;
    const currentVersion = currentVersionByExternalId.get(externalId) ?? 0;
    const nextStatus = resolveAssignmentCtStatus(
      resolveOptionalString(item?.ctStatus, "PENDING") ?? "PENDING"
    );
    const nextSentAt =
      nextStatus === "SENT" ? resolveAssignmentSentAtIso(item) ?? nowIso : null;
    return normalizeStateAssignmentItem({
      ...item,
      id: externalId,
      ctStatus: nextStatus,
      ctSentAt: nextSentAt,
      version: currentVersion + 1,
      versionUpdatedAt: nowIso,
      ...(nextStatus !== "SENT"
        ? {
            ctEscalatedAt: null,
            ctEscalationReason: null,
            ctEscalationTargetRole: null,
            ctEscalationStatus: null,
          }
        : {}),
    });
  });
const toStableJsonText = (value: any): string => {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJsonText(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${toStableJsonText((value as any)[key])}`)
    .join(",")}}`;
};
const isDeepEqualByStableJson = (left: any, right: any) =>
  toStableJsonText(left) === toStableJsonText(right);
const toComparableAssignmentStateItem = (item: any) => {
  const normalized = normalizeStateAssignmentItem(item);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }
  const {
    version: _version,
    versionUpdatedAt: _versionUpdatedAt,
    // assignmentPlan merge 과정에서 변하는 메타 필드는 버전 충돌/변경감지에서 제외한다.
    dbId: _dbId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    isCompleted: _isCompleted,
    finalQuantity: _finalQuantity,
    completedAt: _completedAt,
    ...rest
  } = normalized;
  return rest;
};
const isSameAssignmentStateContent = (left: any, right: any) =>
  isDeepEqualByStableJson(
    toComparableAssignmentStateItem(left),
    toComparableAssignmentStateItem(right)
  );
const buildAssignmentByExternalId = (items: any[]) =>
  ensureArray(items).reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());
const applySentTimeoutEscalation = (
  assignments: any,
  nowDate: Date = new Date()
): { assignments: any[]; changed: boolean } => {
  const nowMs = nowDate.getTime();
  const normalized = normalizeStateAssignments(assignments);
  let changed = false;
  const nextAssignments = normalized.map((item) => {
    if (!item || typeof item !== "object") return item;
    const ctStatus = resolveAssignmentCtStatus(item?.ctStatus);
    if (ctStatus !== "SENT") {
      if (
        item?.ctEscalatedAt != null ||
        item?.ctEscalationReason != null ||
        item?.ctEscalationTargetRole != null ||
        item?.ctEscalationStatus != null
      ) {
        changed = true;
        return {
          ...item,
          ctEscalatedAt: null,
          ctEscalationReason: null,
          ctEscalationTargetRole: null,
          ctEscalationStatus: null,
        };
      }
      return item;
    }
    const sentAtIso = resolveAssignmentSentAtIso(item);
    if (!sentAtIso) return item;
    const sentAtMs = new Date(sentAtIso).getTime();
    if (!Number.isFinite(sentAtMs)) return item;
    if (nowMs - sentAtMs < ASSIGNMENT_SENT_TIMEOUT_MS) return item;
    if (resolveOptionalString(item?.ctEscalatedAt, null)) return item;
    changed = true;
    return {
      ...item,
      ctSentAt: sentAtIso,
      ctEscalatedAt: nowDate.toISOString(),
      ctEscalationReason: ASSIGNMENT_SENT_TIMEOUT_ESCALATION_REASON,
      ctEscalationTargetRole: "ADMIN",
      ctEscalationStatus: "OPEN",
    };
  });
  return { assignments: nextAssignments, changed };
};
const resolveAssignmentPlanExternalIds = (items: any) =>
  ensureArray(items)
    .map((item) => resolveAssignmentExternalId(item))
    .filter((value): value is string => Boolean(value));
const mergeAssignmentPlanResponsesWithState = (plans: any[], stateAssignments: any[]) => {
  const stateByExternalId = normalizeStateAssignments(stateAssignments).reduce((map, item) => {
    if (!item || typeof item !== "object") return map;
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());

  return ensureArray(plans).map((plan) => {
    const base = toAssignmentPlanResponse(plan);
    const stateItem = stateByExternalId.get(base.id);
    if (!stateItem || typeof stateItem !== "object") return base;
    const merged = {
      ...stateItem,
      ...base,
      id: base.id,
      lineId: String(base.lineId),
      ctOverride: Boolean(stateItem.ctOverride),
    };
    const stateStartIndex = toNumberOrNull(stateItem?.startIndex);
    const stateEndIndex = toNumberOrNull(stateItem?.endIndex);
    const stateStartDayOffsetPercent = toOptionalFloat(
      stateItem?.startDayOffsetPercent,
      undefined
    );
    const stateStartDayPercent = toOptionalFloat(
      stateItem?.startDayPercent,
      undefined
    );
    const stateEndDayPercent = toOptionalFloat(
      stateItem?.endDayPercent,
      undefined
    );
    if (stateStartIndex !== null) {
      merged.startIndex = Math.trunc(stateStartIndex);
    }
    if (stateEndIndex !== null) {
      const fallbackStartIndex =
        stateStartIndex !== null
          ? Math.trunc(stateStartIndex)
          : toSignedInt(merged.startIndex, 0);
      merged.endIndex = Math.max(fallbackStartIndex, Math.trunc(stateEndIndex));
    }
    if (stateStartDayOffsetPercent !== undefined) {
      merged.startDayOffsetPercent = stateStartDayOffsetPercent;
    }
    if (stateStartDayPercent !== undefined) {
      merged.startDayPercent = stateStartDayPercent;
    }
    if (stateEndDayPercent !== undefined) {
      merged.endDayPercent = stateEndDayPercent;
    }
    return merged;
  });
};
const ASSIGNMENT_TEXT_CORRUPTION_REGEX = /\?{2,}|�/;
type AssignmentDisplayReferenceMaps = {
  orderByOrderId: Map<string, any>;
  orderByOrderNo: Map<string, any>;
  styleByStyleId: Map<string, any>;
};
const normalizeAssignmentDisplayKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const normalizeAssignmentDisplayGender = (value: any): string => {
  const key = normalizeAssignmentDisplayKey(value);
  if (key === "M" || key === "W" || key === "U") return key;
  return "";
};
const normalizeAssignmentCardColorKey = (value: any): string =>
  normalizeAssignmentDisplayKey(value);
const normalizeAssignmentCardGender = (value: any): string => {
  const key = normalizeAssignmentDisplayKey(value);
  if (key === "M" || key === "MEN" || key === "MALE" || key === "남성") return "M";
  if (key === "W" || key === "WOMEN" || key === "FEMALE" || key === "여성") return "W";
  if (key === "U" || key === "UNISEX" || key === "공용") return "U";
  return "U";
};
const resolveAssignmentCardLegacyColorKey = (row: any): string => {
  const fromCode = normalizeAssignmentCardColorKey(
    row?.colorCode ?? row?.color ?? row?.colorName
  );
  if (fromCode) return fromCode;
  const fromId = normalizeAssignmentCardColorKey(row?.colorId);
  if (!fromId || fromId === "M" || fromId === "W" || fromId === "U") return "UNSPEC";
  return fromId;
};
const resolveAssignmentCardVariantBucketsFromLegacyRows = (
  rows: any[] = [],
  itemGender = "U"
) => {
  const bucket = new Map<string, { colorId: string; gender: string; quantity: number }>();
  ensureArray(rows).forEach((row) => {
    const quantity = Number(row?.quantity) || 0;
    if (quantity <= 0) return;
    const colorId = resolveAssignmentCardLegacyColorKey(row);
    const rawGender = normalizeAssignmentDisplayKey(row?.gender ?? "");
    const gender =
      rawGender === "M" || rawGender === "W" || rawGender === "U"
        ? rawGender
        : itemGender;
    const bucketKey = `${colorId}::${gender}`;
    const existing = bucket.get(bucketKey);
    if (!existing) {
      bucket.set(bucketKey, { colorId, gender, quantity });
      return;
    }
    existing.quantity += quantity;
  });
  return Array.from(bucket.values());
};
const resolveAssignmentCardVariantBuckets = (item: any) => {
  const itemGender = normalizeAssignmentCardGender(item?.gender);
  const fromLegacyRows = resolveAssignmentCardVariantBucketsFromLegacyRows(
    ensureArray(item?.quantities),
    itemGender
  );
  if (fromLegacyRows.length > 0) return fromLegacyRows;

  const fallbackQuantity = sumOrderItemQuantity(item);
  if (fallbackQuantity <= 0) return [];

  const fallbackColor = normalizeAssignmentCardColorKey(
    item?.colorCode ?? item?.colorId ?? item?.color ?? "UNSPEC"
  );
  return [
    {
      colorId: fallbackColor || "UNSPEC",
      gender: normalizeAssignmentCardGender(item?.gender),
      quantity: fallbackQuantity,
    },
  ];
};
const resolveAssignmentCardAtTotalSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  const normalized = normalizeStyleProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const processQuantity = toPositiveInt(normalized?.quantity, 1);
  const atParams = toStyleAtParams((normalized as any)?.atParams);
  if (atParams) {
    return processQuantity * (atParams.a * resolvedOrderQuantity + atParams.b);
  }
  const at = toOptionalSeconds(normalized?.at);
  if (at == null) return null;
  return processQuantity * at * resolvedOrderQuantity;
};
const resolveAssignmentCardAtPerPieceSeconds = (process: any, orderQuantity = 1) => {
  const normalized = normalizeStyleProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const processQuantity = toPositiveInt(normalized?.quantity, 1);
  const totalAt = resolveAssignmentCardAtTotalSecondsForOrderQuantity(
    normalized,
    resolvedOrderQuantity
  );
  if (totalAt == null || !Number.isFinite(totalAt) || totalAt <= 0) return null;
  return totalAt / (processQuantity * resolvedOrderQuantity);
};
const resolveAssignmentCardStSeedSeconds = ({
  process,
  orderQuantity = 1,
}: {
  process: any;
  orderQuantity?: number;
}) => {
  const normalized = normalizeStyleProcess(process);
  const manualSt =
    normalized?.stManual === true ? toOptionalSeconds(normalized?.ct) : null;
  if (manualSt != null) return manualSt;

  const pt = toOptionalSeconds(normalized?.pt);
  if (pt != null) return pt;

  const atPerPiece = resolveAssignmentCardAtPerPieceSeconds(normalized, orderQuantity);
  if (atPerPiece != null && atPerPiece > 0) return atPerPiece;
  return null;
};
const calculateAssignmentCardTotalForOrderQuantity = (
  processes: any,
  key: "pt" | "at",
  orderQuantity = 1
) =>
  normalizeStyleProcesses(processes).reduce((acc, process) => {
    const processQuantity = toPositiveInt((process as any)?.quantity, 1);
    const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
    if (key === "at") {
      const atTotal = resolveAssignmentCardAtTotalSecondsForOrderQuantity(
        process,
        resolvedOrderQuantity
      );
      return atTotal == null ? acc : acc + atTotal;
    }
    const time = toOptionalSeconds((process as any)?.pt);
    if (time == null) return acc;
    return acc + processQuantity * time * resolvedOrderQuantity;
  }, 0);
const calculateAssignmentCardStTotalForOrderQuantity = (
  processes: any,
  orderQuantity = 1
) =>
  normalizeStyleProcesses(processes).reduce((acc, process) => {
    const processQuantity = toPositiveInt((process as any)?.quantity, 1);
    const stPerPiece = resolveAssignmentCardStSeedSeconds({
      process,
      orderQuantity,
    });
    if (stPerPiece == null) return acc;
    return acc + processQuantity * stPerPiece * toPositiveInt(orderQuantity, 1);
  }, 0);
const resolveAssignmentCardStatus = ({
  totalPt,
  totalAt,
  totalSt,
}: {
  totalPt: number;
  totalAt: number;
  totalSt: number;
}) => {
  if (Number(totalSt) > 0) return "ST";
  if (Number(totalAt) > 0) return "AT";
  if (Number(totalPt) > 0) return "PT";
  return "NONE";
};
const createAssignmentCardId = (
  orderId: any,
  styleId: any,
  colorId: any,
  gender: any
) =>
  `${String(orderId ?? "").trim()}::${String(styleId ?? "").trim()}::${normalizeAssignmentCardColorKey(
    colorId
  )}::${normalizeAssignmentCardGender(gender)}`;
const resolveStyleCandidateForAssignmentCard = ({
  order,
  item,
  styleCandidatesById,
}: {
  order: any;
  item: any;
  styleCandidatesById: Map<string, any[]>;
}) => {
  const styleId = resolveOptionalString(item?.styleId, null);
  if (!styleId) return null;
  const candidates = styleCandidatesById.get(styleId) || [];
  if (candidates.length <= 1) return candidates[0] ?? null;

  const orderCustomerKey = normalizeComparableText(
    order?.customerName ?? order?.buyerOrgName ?? order?.customer
  );
  const itemStyleNameKey = normalizeComparableText(item?.styleName);

  const sameCustomerCandidates = orderCustomerKey
    ? candidates.filter(
        (candidate) => normalizeComparableText(candidate?.customer) === orderCustomerKey
      )
    : candidates;
  const sameNameCandidates = itemStyleNameKey
    ? sameCustomerCandidates.filter(
        (candidate) => normalizeComparableText(candidate?.name) === itemStyleNameKey
      )
    : sameCustomerCandidates;

  return sameNameCandidates[0] ?? sameCustomerCandidates[0] ?? candidates[0] ?? null;
};
const buildAssignmentCardsFromOrders = ({
  orders,
  styles,
  colorNameByCode,
}: {
  orders: any[];
  styles: any[];
  colorNameByCode: Map<string, string>;
}) => {
  const cards: any[] = [];
  const cardById = new Map<string, any>();
  const styleCandidatesById = ensureArray(styles).reduce((map, style) => {
    const styleId = resolveOptionalString(style?.styleId, null);
    if (!styleId) return map;
    const current = map.get(styleId) || [];
    current.push(style);
    map.set(styleId, current);
    return map;
  }, new Map<string, any[]>());

  const upsertCard = (nextCard: any) => {
    const existing = cardById.get(nextCard.id);
    if (!existing) {
      cardById.set(nextCard.id, nextCard);
      cards.push(nextCard);
      return;
    }
    const mergedTotalPt = Number(existing.totalPt || 0) + Number(nextCard.totalPt || 0);
    const mergedTotalAt = Number(existing.totalAt || 0) + Number(nextCard.totalAt || 0);
    const mergedTotalSt = Number(existing.totalSt || 0) + Number(nextCard.totalSt || 0);
    const merged = {
      ...existing,
      quantity: Number(existing.quantity || 0) + Number(nextCard.quantity || 0),
      totalSeconds: Number(existing.totalSeconds || 0) + Number(nextCard.totalSeconds || 0),
      totalPt: mergedTotalPt,
      totalAt: mergedTotalAt,
      totalSt: mergedTotalSt,
      status: resolveAssignmentCardStatus({
        totalPt: mergedTotalPt,
        totalAt: mergedTotalAt,
        totalSt: mergedTotalSt,
      }),
      dueDate: existing.dueDate || nextCard.dueDate || "",
      processCount: Math.max(
        toNonNegativeInt(existing.processCount, 0),
        toNonNegativeInt(nextCard.processCount, 0)
      ),
    };
    cardById.set(nextCard.id, merged);
    const index = cards.findIndex((item) => item.id === nextCard.id);
    if (index >= 0) {
      cards[index] = merged;
    }
  };

  ensureArray(orders).forEach((order, orderIndex) => {
    const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
      ? [...order.workOrderItems]
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(workOrderItemToItemShape)
      : null;
    const items = itemsFromRelation ?? normalizeOrderItems(order?.items);
    items.forEach((item, itemIndex) => {
      const styleId = resolveOptionalString(item?.styleId, "");
      if (!styleId) return;

      const style = resolveStyleCandidateForAssignmentCard({
        order,
        item,
        styleCandidatesById,
      });
      const processes = normalizeStyleProcesses(style?.processes);
      const processCount = processes.length;
      const previewUrl =
        ensureArray(style?.imageUrls).length > 0 ? style.imageUrls[0] : "";
      const variantBuckets = resolveAssignmentCardVariantBuckets(item);
      if (variantBuckets.length === 0) return;

      variantBuckets.forEach(({ colorId, gender, quantity }) => {
        if ((Number(quantity) || 0) <= 0) return;

        const normalizedColor = normalizeAssignmentCardColorKey(colorId);
        const normalizedGender = normalizeAssignmentCardGender(gender);
        const colorName =
          colorNameByCode.get(normalizedColor) ||
          resolveOptionalString(item?.colorName, null) ||
          normalizedColor ||
          "색상 없음";
        const totalPt = calculateAssignmentCardTotalForOrderQuantity(
          processes,
          "pt",
          quantity
        );
        const totalAt = calculateAssignmentCardTotalForOrderQuantity(
          processes,
          "at",
          quantity
        );
        const totalSt = calculateAssignmentCardStTotalForOrderQuantity(processes, quantity);
        const status = resolveAssignmentCardStatus({ totalPt, totalAt, totalSt });
        const totalSeconds =
          status === "ST" ? totalSt : status === "AT" ? totalAt : totalPt;

        const resolvedOrderId =
          resolveOptionalString(order?.orderId ?? order?.id, null) ??
          `order-${orderIndex}`;
        const cardId = createAssignmentCardId(
          resolvedOrderId,
          styleId,
          normalizedColor,
          normalizedGender
        );

        upsertCard({
          id: cardId,
          originOrderId: cardId,
          orderNo: resolveOptionalString(order?.orderNumber, null) || resolvedOrderId || "-",
          dueDate: resolveOptionalString(order?.dueDate, null) || "",
          customer:
            resolveOptionalString(order?.customerName ?? order?.customer, null) || "-",
          styleId,
          styleName:
            resolveOptionalString(item?.styleName, null) ||
            resolveOptionalString(style?.name, null) ||
            `스타일 ${itemIndex + 1}`,
          styleCode:
            resolveOptionalString(item?.styleCode, null) ||
            resolveOptionalString(style?.styleCode, null) ||
            "",
          colorId: normalizedColor,
          colorName,
          gender: normalizedGender,
          quantity,
          processCount,
          status,
          totalSeconds,
          totalPt,
          totalAt,
          totalSt,
          previewUrl,
        });
      });
    });
  });

  return cards;
};
const mergeAssignmentCardsWithSaved = (baseCards: any, savedCards: any) => {
  const merged: any[] = [];
  const indexById = new Map<string, number>();

  ensureArray(baseCards).forEach((card) => {
    if (!card?.id) return;
    indexById.set(String(card.id), merged.length);
    merged.push(card);
  });

  ensureArray(savedCards).forEach((card) => {
    if (!card?.id) return;
    const key = String(card.id);
    const existingIndex = indexById.get(key);
    if (existingIndex == null) {
      indexById.set(key, merged.length);
      merged.push(card);
      return;
    }
    const baseCard = merged[existingIndex];
    merged[existingIndex] = {
      ...card,
      ...baseCard,
      id: baseCard.id,
      originOrderId: baseCard.originOrderId || card.originOrderId || baseCard.id,
    };
  });

  return merged;
};
const hasCorruptedAssignmentDisplayText = (value: any): boolean => {
  const text = resolveOptionalString(value, null);
  if (!text) return false;
  return ASSIGNMENT_TEXT_CORRUPTION_REGEX.test(text);
};
const shouldRepairAssignmentDisplayField = (current: any, fallback: any): boolean => {
  const fallbackText = resolveOptionalString(fallback, null);
  if (!fallbackText) return false;
  const currentText = resolveOptionalString(current, null);
  if (!currentText) return true;
  return hasCorruptedAssignmentDisplayText(currentText);
};
// plan의 display 필드 중 하나라도 비어있거나 오염된 경우 true 반환
// repair 호출 전 빠른 사전 체크용 — refs 로드 없이 실행 가능
const ASSIGNMENT_PLAN_DISPLAY_FIELDS = ["orderNo", "customer", "label", "colorName"] as const;
const assignmentPlanNeedsDisplayRepair = (plan: any): boolean => {
  if (!plan || typeof plan !== "object") return false;
  return ASSIGNMENT_PLAN_DISPLAY_FIELDS.some((field) => {
    const text = resolveOptionalString((plan as any)[field], null);
    return !text || hasCorruptedAssignmentDisplayText(text);
  });
};
const shouldRepairAssignmentBoardDisplayPayloadOnWrite = ({
  cards,
  assignments,
}: {
  cards: any;
  assignments: any;
}) => {
  const hasCorruptedCardText = ensureArray(cards).some((card) => {
    if (!card || typeof card !== "object") return false;
    return (
      hasCorruptedAssignmentDisplayText(card?.orderNo) ||
      hasCorruptedAssignmentDisplayText(card?.customer) ||
      hasCorruptedAssignmentDisplayText(card?.styleName) ||
      hasCorruptedAssignmentDisplayText(card?.colorName)
    );
  });
  if (hasCorruptedCardText) return true;

  return ensureArray(assignments).some((assignment) => {
    if (!assignment || typeof assignment !== "object") return false;
    return (
      hasCorruptedAssignmentDisplayText(assignment?.orderNo) ||
      hasCorruptedAssignmentDisplayText(assignment?.customer) ||
      hasCorruptedAssignmentDisplayText(assignment?.label) ||
      hasCorruptedAssignmentDisplayText(assignment?.colorName)
    );
  });
};
const stripAssignmentLabelGenderSuffix = (value: any) =>
  String(value ?? "")
    .replace(/\s*\[(M|W|U)\]\s*$/i, "")
    .trim();
const parseAssignmentCardIdentity = (
  value: any
): { orderId: string; styleId: string; colorKey: string; gender: string } | null => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const parts = raw.split("::");
  if (parts.length < 4) return null;
  const orderId = resolveOptionalString(parts[0], null);
  const styleId = resolveOptionalString(parts[1], null);
  if (!orderId || !styleId) return null;
  return {
    orderId,
    styleId,
    colorKey: normalizeAssignmentDisplayKey(parts[2]),
    gender: normalizeAssignmentDisplayGender(parts[3]),
  };
};
const loadAssignmentDisplayReferenceMaps = async (
  orgId: number
): Promise<AssignmentDisplayReferenceMaps> => {
  const [orders, styles] = await Promise.all([
    prisma.workOrder.findMany({
      where: { orgId },
      select: {
        orderId: true,
        orderNumber: true,
        customerName: true,
        buyerOrgName: true,
        items: true,
        workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE,
      },
    }),
    prisma.style.findMany({
      where: { orgId },
      select: {
        styleId: true,
        name: true,
        customer: true,
      },
    }),
  ]);
  const orderByOrderId = orders.reduce((map, order) => {
    const orderId = resolveOptionalString(order?.orderId, null);
    if (orderId && !map.has(orderId)) {
      map.set(orderId, order);
    }
    return map;
  }, new Map<string, any>());
  const orderByOrderNo = orders.reduce((map, order) => {
    const orderNo = resolveOptionalString(order?.orderNumber, null);
    if (orderNo && !map.has(orderNo)) {
      map.set(orderNo, order);
    }
    return map;
  }, new Map<string, any>());
  const styleByStyleId = styles.reduce((map, style) => {
    const styleId = resolveOptionalString(style?.styleId, null);
    if (styleId && !map.has(styleId)) {
      map.set(styleId, style);
    }
    return map;
  }, new Map<string, any>());
  return {
    orderByOrderId,
    orderByOrderNo,
    styleByStyleId,
  };
};
const findOrderItemByAssignmentIdentity = (order: any, identity: any): any | null => {
  if (!order || !identity) return null;
  const styleId = resolveOptionalString(identity?.styleId, null);
  if (!styleId) return null;
  const targetColorKey = normalizeAssignmentDisplayKey(identity?.colorKey);
  const targetGender = normalizeAssignmentDisplayGender(identity?.gender);
  const items = ensureArray(order?.items);
  const exact = items.find((item) => {
    if (resolveOptionalString(item?.styleId, null) !== styleId) return false;
    const itemColorKey = normalizeAssignmentDisplayKey(
      item?.colorCode ?? item?.colorId ?? item?.colorName
    );
    const itemGender = normalizeAssignmentDisplayGender(item?.gender);
    if (targetColorKey && itemColorKey && targetColorKey !== itemColorKey) return false;
    if (targetGender && itemGender && targetGender !== itemGender) return false;
    return true;
  });
  if (exact) return exact;
  return (
    items.find((item) => resolveOptionalString(item?.styleId, null) === styleId) ?? null
  );
};
const resolveAssignmentDisplayFallback = (
  target: any,
  refs: AssignmentDisplayReferenceMaps,
  cardIdentityText: any = null
) => {
  const identity = parseAssignmentCardIdentity(cardIdentityText);
  const targetOrderNo = resolveOptionalString(target?.orderNo, null);
  const order =
    (identity?.orderId ? refs.orderByOrderId.get(identity.orderId) : null) ??
    (targetOrderNo ? refs.orderByOrderNo.get(targetOrderNo) : null) ??
    null;
  const orderItem = findOrderItemByAssignmentIdentity(order, identity);
  const style = identity?.styleId ? refs.styleByStyleId.get(identity.styleId) ?? null : null;
  const gender =
    normalizeAssignmentDisplayGender(identity?.gender) ||
    normalizeAssignmentDisplayGender(orderItem?.gender) ||
    normalizeAssignmentDisplayGender(target?.gender);
  const styleName =
    resolveOptionalString(orderItem?.styleName, null) ??
    resolveOptionalString(style?.name, null) ??
    resolveOptionalString(stripAssignmentLabelGenderSuffix(target?.label), null) ??
    null;
  return {
    orderNo: resolveOptionalString(order?.orderNumber, null) ?? targetOrderNo,
    customer:
      resolveOptionalString(order?.customerName, null) ??
      resolveOptionalString(order?.buyerOrgName, null) ??
      resolveOptionalString(style?.customer, null) ??
      resolveOptionalString(target?.customer, null),
    styleName,
    colorName:
      resolveOptionalString(orderItem?.colorName, null) ??
      resolveOptionalString(target?.colorName, null),
    label: styleName ? `${styleName}${gender ? ` [${gender}]` : ""}` : null,
    gender: gender || null,
  };
};
const repairAssignmentBoardCardsDisplayText = (
  cards: any,
  refs: AssignmentDisplayReferenceMaps
): { cards: any[]; changed: boolean } => {
  let changed = false;
  const nextCards = ensureArray(cards).map((card) => {
    if (!card || typeof card !== "object") return card;
    const fallback = resolveAssignmentDisplayFallback(
      card,
      refs,
      card?.id ?? card?.originOrderId ?? null
    );
    let itemChanged = false;
    const next = { ...card };
    const applyField = (field: string, value: any) => {
      if (!shouldRepairAssignmentDisplayField((next as any)[field], value)) return;
      (next as any)[field] = resolveOptionalString(value, (next as any)[field] ?? "");
      itemChanged = true;
    };
    applyField("orderNo", fallback.orderNo);
    applyField("customer", fallback.customer);
    applyField("styleName", fallback.styleName);
    applyField("colorName", fallback.colorName);
    if (
      !resolveOptionalString(next?.gender, null) &&
      resolveOptionalString(fallback?.gender, null)
    ) {
      next.gender = fallback.gender;
      itemChanged = true;
    }
    if (itemChanged) changed = true;
    return next;
  });
  return { cards: nextCards, changed };
};
const repairAssignmentBoardAssignmentsDisplayText = (
  assignments: any,
  refs: AssignmentDisplayReferenceMaps
): { assignments: any[]; changed: boolean } => {
  let changed = false;
  const nextAssignments = ensureArray(assignments).map((assignment) => {
    if (!assignment || typeof assignment !== "object") return assignment;
    const fallback = resolveAssignmentDisplayFallback(
      assignment,
      refs,
      assignment?.cardId ?? assignment?.originOrderId ?? assignment?.id ?? null
    );
    let itemChanged = false;
    const next = { ...assignment };
    const applyField = (field: string, value: any) => {
      if (!shouldRepairAssignmentDisplayField((next as any)[field], value)) return;
      (next as any)[field] = resolveOptionalString(value, (next as any)[field] ?? "");
      itemChanged = true;
    };
    applyField("orderNo", fallback.orderNo);
    applyField("customer", fallback.customer);
    applyField("label", fallback.label);
    applyField("colorName", fallback.colorName);
    if (
      !resolveOptionalString(next?.gender, null) &&
      resolveOptionalString(fallback?.gender, null)
    ) {
      next.gender = fallback.gender;
      itemChanged = true;
    }
    if (itemChanged) changed = true;
    return next;
  });
  return { assignments: nextAssignments, changed };
};
const repairAssignmentBoardDisplayState = async ({
  orgId,
  cards,
  assignments,
  refs = null,
}: {
  orgId: number;
  cards: any;
  assignments: any;
  refs?: AssignmentDisplayReferenceMaps | null;
}): Promise<{
  cards: any[];
  assignments: any[];
  changed: boolean;
  refs: AssignmentDisplayReferenceMaps;
}> => {
  const resolvedRefs = refs ?? (await loadAssignmentDisplayReferenceMaps(orgId));
  const repairedCards = repairAssignmentBoardCardsDisplayText(cards, resolvedRefs);
  const repairedAssignments = repairAssignmentBoardAssignmentsDisplayText(
    assignments,
    resolvedRefs
  );
  return {
    cards: repairedCards.cards,
    assignments: repairedAssignments.assignments,
    changed: repairedCards.changed || repairedAssignments.changed,
    refs: resolvedRefs,
  };
};
const toNullableAssignmentText = (value: any): string | null => {
  const text = resolveOptionalString(value, null);
  return text && text.length > 0 ? text : null;
};
const repairAssignmentPlanDisplayRows = async ({
  orgId,
  plans,
  refs = null,
}: {
  orgId: number;
  plans: any[];
  refs?: AssignmentDisplayReferenceMaps | null;
}): Promise<{ plans: any[]; changed: boolean; refs: AssignmentDisplayReferenceMaps }> => {
  const resolvedRefs = refs ?? (await loadAssignmentDisplayReferenceMaps(orgId));
  const updates: Array<{
    id: number;
    data: {
      orderNo?: string | null;
      customer?: string | null;
      label?: string | null;
      colorName?: string | null;
    };
  }> = [];
  const repairedPlans = ensureArray(plans).map((plan) => {
    if (!plan || typeof plan !== "object") return plan;
    const fallback = resolveAssignmentDisplayFallback(
      plan,
      resolvedRefs,
      plan?.cardId ?? plan?.originOrderId ?? plan?.externalId ?? null
    );
    let itemChanged = false;
    const next = { ...plan };
    const applyField = (field: "orderNo" | "customer" | "label" | "colorName", value: any) => {
      if (!shouldRepairAssignmentDisplayField((next as any)[field], value)) return;
      (next as any)[field] = resolveOptionalString(value, (next as any)[field] ?? "");
      itemChanged = true;
    };
    applyField("orderNo", fallback.orderNo);
    applyField("customer", fallback.customer);
    applyField("label", fallback.label);
    applyField("colorName", fallback.colorName);

    const planId = toPositiveIntOrNull(plan?.id);
    if (itemChanged && planId) {
      updates.push({
        id: planId,
        data: {
          orderNo: toNullableAssignmentText(next.orderNo),
          customer: toNullableAssignmentText(next.customer),
          label: toNullableAssignmentText(next.label),
          colorName: toNullableAssignmentText(next.colorName),
        },
      });
    }
    return next;
  });

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((row) =>
        prisma.assignmentPlan.update({
          where: { id: row.id },
          data: row.data,
        })
      )
    );
  }

  return {
    plans: repairedPlans,
    changed: updates.length > 0,
    refs: resolvedRefs,
  };
};
const toAssignmentPlanResponse = (plan: any) => ({
  id: plan.externalId,
  lineId: String(plan.lineId),
  cardId: plan.cardId ?? "",
  orderNo: plan.orderNo ?? "",
  customer: plan.customer ?? "",
  label: plan.label ?? "",
  colorId: toPositiveIntOrNull(plan.colorId ?? plan.attrColor?.id),
  colorName: resolveAssignmentPlanColorName(plan),
  previewUrl: plan.previewUrl ?? "",
  imageUrl: plan.imageUrl ?? "",
  thumbnailUrl: plan.thumbnailUrl ?? "",
  quantity: plan.quantity ?? null,
  originOrderId: plan.originOrderId ?? "",
  basis: plan.basis ?? "",
  proposalBasis: plan.proposalBasis ?? "",
  proposalSeconds: plan.proposalSeconds ?? null,
  contractedSeconds: plan.contractedSeconds ?? null,
  ctStatus: resolveAssignmentCtStatus(plan.ctStatus),
  ctSource: plan.ctSource ?? "",
  ctAgreedBy: plan.ctAgreedBy ?? "",
  ctAgreedAt: plan.ctAgreedAt ?? null,
  ctNote: plan.ctNote ?? "",
  color: plan.color ?? "",
  stripeColor: plan.stripeColor ?? "",
  totalSeconds: plan.totalSeconds ?? null,
  startIndex: plan.startIndex,
  endIndex: plan.endIndex,
  startDayOffsetPercent: plan.startDayOffsetPercent ?? null,
  startDayPercent: plan.startDayPercent ?? null,
  endDayPercent: plan.endDayPercent ?? null,
  isCompleted: plan.isCompleted ?? false,
  finalQuantity: plan.finalQuantity ?? null,
  completedAt: plan.completedAt ?? null,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
});
const normalizeAssignmentPlanPayload = (items: any, lineIdSet: Set<number> | null = null) =>
  ensureArray(items)
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const externalId = resolveOptionalString(item.id ?? item.externalId, null);
      const lineId = toNumberOrNull(item.lineId);
      const lineIdNum =
        typeof lineId === "number" && Number.isFinite(lineId)
          ? Math.round(lineId)
          : null;
      if (!externalId || !lineIdNum) return null;
      if (lineIdSet && !lineIdSet.has(lineIdNum)) return null;

      const startIndex = toSignedInt(item.startIndex, 0);
      const endIndex = Math.max(startIndex, toSignedInt(item.endIndex, startIndex));
      const ctStatus = resolveAssignmentCtStatus(
        resolveOptionalString(item.ctStatus, "PENDING") ?? "PENDING"
      );
      const isCompleted = Boolean(item.isCompleted);
      const finalQuantity = isCompleted
        ? toOptionalNonNegativeInt(item.finalQuantity, undefined)
        : null;
      const completedAt = isCompleted
        ? toOptionalDateValue(item.completedAt, undefined)
        : null;

      return {
        lineId: lineIdNum,
        externalId,
        cardId: resolveOptionalString(item.cardId, null),
        orderNo: resolveOptionalString(item.orderNo, null),
        customer: resolveOptionalString(item.customer, null),
        label: resolveOptionalString(item.label, null),
        colorId: toPositiveIntOrNull(item.colorId),
        colorName: resolveOptionalString(item.colorName, null),
        previewUrl: resolveOptionalString(item.previewUrl, null),
        imageUrl: resolveOptionalString(item.imageUrl, null),
        thumbnailUrl: resolveOptionalString(item.thumbnailUrl, null),
        quantity: toOptionalNonNegativeInt(item.quantity, null),
        originOrderId: resolveOptionalString(item.originOrderId, null),
        basis: resolveOptionalString(item.basis, null),
        proposalBasis: resolveOptionalString(item.proposalBasis, null),
        proposalSeconds: toOptionalNonNegativeInt(item.proposalSeconds, null),
        contractedSeconds: toOptionalNonNegativeInt(item.contractedSeconds, null),
        ctStatus,
        ctSource: resolveOptionalString(item.ctSource, null),
        ctAgreedBy: resolveOptionalString(item.ctAgreedBy, null),
        ctAgreedAt: toOptionalDateValue(item.ctAgreedAt, null),
        ctNote: resolveOptionalString(item.ctNote, null),
        color: resolveOptionalString(item.color, null),
        stripeColor: resolveOptionalString(item.stripeColor, null),
        totalSeconds: toOptionalNonNegativeInt(item.totalSeconds, null),
        startIndex,
        endIndex,
        startDayOffsetPercent: toOptionalFloat(item.startDayOffsetPercent, null),
        startDayPercent: toOptionalFloat(item.startDayPercent, null),
        endDayPercent: toOptionalFloat(item.endDayPercent, null),
        isCompleted,
        finalQuantity,
        completedAt,
        updatedAt: new Date(),
      };
    })
    .filter((item): item is any => Boolean(item))
    .reduce((acc: any, item: any) => {
      if (acc.seen.has(item.externalId)) return acc;
      acc.seen.add(item.externalId);
      acc.rows.push(item);
      return acc;
    }, { seen: new Set<string>(), rows: [] as any[] }).rows;
const syncAssignmentPlanColorRefs = async (orgId: number, items: any[]) => {
  const normalizedItems = ensureArray(items).filter(
    (item) => item && typeof item === "object"
  );
  if (normalizedItems.length === 0) return [];

  const colorIds = collectPositiveIntSet(
    ...normalizedItems.map((item) => item?.colorId)
  );
  const colorNames = Array.from(
    new Set(
      normalizedItems
        .map((item) => resolveOptionalString(item?.colorName, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (colorIds.length === 0 && colorNames.length === 0) {
    return normalizedItems;
  }

  const colors = await prisma.attrColor.findMany({
    where: {
      orgId,
      OR: [
        ...(colorIds.length > 0 ? [{ id: { in: colorIds } }] : []),
        ...(colorNames.length > 0 ? [{ name: { in: colorNames } }] : []),
      ],
    },
    select: { id: true, code: true, name: true },
  });
  const colorById = new Map(colors.map((color) => [color.id, color]));
  const colorByName = new Map(
    colors
      .filter((color) => color.name)
      .map((color) => [normalizeComparableText(color.name), color])
  );

  return normalizedItems.map((item) => {
    const linkedColor =
      (toPositiveIntOrNull(item?.colorId)
        ? colorById.get(Number(item.colorId)) ?? null
        : null) ??
      (resolveOptionalString(item?.colorName, null)
        ? colorByName.get(normalizeComparableText(item.colorName)) ?? null
        : null);

    return {
      ...item,
      colorId: linkedColor?.id ?? toPositiveIntOrNull(item?.colorId),
      colorName: resolveOptionalString(linkedColor?.name ?? item?.colorName, null),
    };
  });
};
const toAssignmentPlanWriteData = (item: any) => ({
  lineId: item.lineId,
  cardId: item.cardId ?? null,
  orderNo: item.orderNo ?? null,
  customer: item.customer ?? null,
  label: item.label ?? null,
  colorId: item.colorId ?? null,
  colorName: item.colorName ?? null,
  previewUrl: item.previewUrl ?? null,
  imageUrl: item.imageUrl ?? null,
  thumbnailUrl: item.thumbnailUrl ?? null,
  quantity: item.quantity ?? null,
  originOrderId: item.originOrderId ?? null,
  basis: item.basis ?? null,
  proposalBasis: item.proposalBasis ?? null,
  proposalSeconds: item.proposalSeconds ?? null,
  contractedSeconds: item.contractedSeconds ?? null,
  ctStatus: item.ctStatus,
  ctSource: item.ctSource ?? null,
  ctAgreedBy: item.ctAgreedBy ?? null,
  ctAgreedAt: item.ctAgreedAt ?? null,
  ctNote: item.ctNote ?? null,
  color: item.color ?? null,
  stripeColor: item.stripeColor ?? null,
  totalSeconds: item.totalSeconds ?? null,
  startIndex: item.startIndex,
  endIndex: item.endIndex,
  startDayOffsetPercent: item.startDayOffsetPercent ?? null,
  startDayPercent: item.startDayPercent ?? null,
  endDayPercent: item.endDayPercent ?? null,
  isCompleted: item.isCompleted ?? false,
  finalQuantity:
    item.finalQuantity === undefined ? undefined : item.finalQuantity ?? null,
  completedAt:
    item.completedAt === undefined ? undefined : item.completedAt ?? null,
  updatedAt: item.updatedAt ?? new Date(),
});
const toAssignmentBoardStateResponse = (state: any, assignmentPlans: any[] | null = null) => {
  const stateAssignments = normalizeStateAssignments(state?.assignments);
  const mergedAssignments =
    Array.isArray(assignmentPlans) && assignmentPlans.length > 0
      ? mergeAssignmentPlanResponsesWithState(assignmentPlans, stateAssignments)
      : stateAssignments;
  return {
    cards: ensureArray(state?.cards),
    assignments: normalizeStateAssignments(mergedAssignments),
    createdAt: state?.createdAt ?? null,
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  };
};
const loadAssignmentPlansForBoardState = async (
  orgId: number,
  rawAssignments: any
) => {
  const activeExternalIds = resolveAssignmentPlanExternalIds(rawAssignments);
  const hasBoardAssignments = Array.isArray(rawAssignments);
  if (hasBoardAssignments && activeExternalIds.length === 0) {
    return [];
  }
  return prisma.assignmentPlan.findMany({
    where: {
      orgId,
      ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });
};
const buildReadOnlyAssignmentBoardStateResponse = async (orgId: number, state: any) => {
  const escalatedAssignments = state
    ? applySentTimeoutEscalation(state.assignments).assignments
    : [];
  const nextState = state
    ? {
        ...state,
        assignments: escalatedAssignments,
      }
    : null;
  const assignmentPlans = await loadAssignmentPlansForBoardState(
    orgId,
    nextState?.assignments
  );
  return toAssignmentBoardStateResponse(nextState, assignmentPlans);
};

const closeActiveLineAssignments = async (employeeId: number, endedAt: Date = new Date()) => {
  const activeAssignments = await prisma.lineAssignment.findMany({
    where: { employeeId, endAt: null },
    select: { lineId: true },
  });

  if (activeAssignments.length === 0) {
    return [];
  }

  const lineIds = activeAssignments.map((item) => item.lineId);
  await prisma.lineAssignment.updateMany({
    where: { employeeId, endAt: null },
    data: { endAt: endedAt },
  });

  await prisma.line.updateMany({
    where: { id: { in: lineIds }, managerEmployeeId: employeeId },
    data: { managerEmployeeId: null },
  });

  // Keep denormalized employee.lineName aligned with active line assignment.
  await prisma.employee.updateMany({
    where: { id: employeeId },
    data: { lineName: null },
  });

  return lineIds;
};

const seedAttributesIfEmpty = async (orgId: number) => {
  await prisma.$transaction([
    prisma.attrColor.createMany({
      data: DEFAULT_ATTRIBUTES.colors.map((item) => ({ ...item, orgId })),
      skipDuplicates: true,
    }),
    prisma.attrCategory.createMany({
      data: DEFAULT_ATTRIBUTES.categories.map((item) => ({ ...item, orgId })),
      skipDuplicates: true,
    }),
    prisma.attrProcess.createMany({
      data: DEFAULT_ATTRIBUTES.processes.map((item) => ({ ...item, orgId })),
      skipDuplicates: true,
    }),
  ]);
  await ensureDefaultEmployeeRoles(orgId);
};

const resolveEmployeeStoredPayType = async ({
  orgId,
  membershipRole,
  roleId,
  payType,
}: {
  orgId: number;
  membershipRole: OrgUserRole;
  roleId: number | null;
  payType: unknown;
}): Promise<"CT" | "FIXED"> => {
  if (membershipRole !== "WORKER") return "FIXED";

  const explicitPayType = normalizePayType(payType, null);
  if (explicitPayType) return explicitPayType;

  const normalizedRoleId = Number(roleId);
  if (Number.isSafeInteger(normalizedRoleId) && normalizedRoleId > 0) {
    const role = await prisma.attrRole.findFirst({
      where: { id: normalizedRoleId, orgId },
      select: { defaultPayType: true },
    });
    return resolveRoleDefaultPayType(role);
  }

  return "FIXED";
};

const toAttrRoleResponse = (role: any) => ({
  id: role?.id ?? null,
  code: String(role?.code ?? "").trim(),
  name: String(role?.name ?? "").trim(),
  defaultPayType: resolveRoleDefaultPayType(role),
  sortOrder: toSortOrder(role?.sortOrder, 0),
});

const ensureDefaultEmployeeRoles = async (orgId: number) => {
  const existingRoles = await prisma.attrRole.findMany({
    where: { orgId },
    select: { id: true, code: true, name: true, defaultPayType: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const usedRoleIds = new Set<number>();
  const writes: Prisma.PrismaPromise<any>[] = [];

  DEFAULT_EMPLOYEE_ROLES.forEach((defaultRole) => {
    const matchedRole =
      existingRoles.find(
        (role) => !usedRoleIds.has(role.id) && role.code === defaultRole.code
      ) ||
      existingRoles.find(
        (role) => !usedRoleIds.has(role.id) && role.name === defaultRole.name
      ) ||
      (defaultRole.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING
        ? existingRoles.find(
            (role) =>
              !usedRoleIds.has(role.id) &&
              (role.code === "WORKER" || role.name === "작업자")
          )
        : null);

    if (matchedRole) {
      usedRoleIds.add(matchedRole.id);
      writes.push(
        prisma.attrRole.update({
          where: { id: matchedRole.id },
          data: {
            code: defaultRole.code,
            name: defaultRole.name,
            defaultPayType: defaultRole.defaultPayType,
            sortOrder: defaultRole.sortOrder,
          },
        })
      );
      return;
    }

    writes.push(
      prisma.attrRole.create({
        data: {
          orgId,
          code: defaultRole.code,
          name: defaultRole.name,
          defaultPayType: defaultRole.defaultPayType,
          sortOrder: defaultRole.sortOrder,
        },
      })
    );
  });

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }

  const roles = await prisma.attrRole.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const sewingRole =
    roles.find((role) => role.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING) ?? null;
  if (!sewingRole) return roles;

  const workerEmployees = await prisma.employee.findMany({
    where: {
      orgId,
    },
    include: {
      membership: {
        select: { role: true },
      },
      role: {
        select: { code: true, defaultPayType: true },
      },
    },
  });
  const migrateEmployeeIds = workerEmployees
    .filter(
      (employee) =>
        employee.membership?.role === "WORKER" &&
        (!employee.roleId || !isWorkerEmployeeRoleCode(employee.role?.code))
    )
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const clearEmployeeRoleIds = workerEmployees
    .filter((employee) => employee.membership?.role !== "WORKER" && employee.roleId !== null)
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const workerIdsNeedingCtPayType = workerEmployees
    .filter((employee) => {
      if (employee.membership?.role !== "WORKER") return false;
      if (normalizePayType(employee.payType, null)) return false;
      const nextPayType =
        employee.roleId && isWorkerEmployeeRoleCode(employee.role?.code)
          ? resolveRoleDefaultPayType(employee.role)
          : resolveRoleDefaultPayType(sewingRole);
      return nextPayType === "CT";
    })
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const workerIdsNeedingFixedPayType = workerEmployees
    .filter((employee) => {
      if (employee.membership?.role !== "WORKER") return false;
      if (normalizePayType(employee.payType, null)) return false;
      const nextPayType =
        employee.roleId && isWorkerEmployeeRoleCode(employee.role?.code)
          ? resolveRoleDefaultPayType(employee.role)
          : resolveRoleDefaultPayType(sewingRole);
      return nextPayType === "FIXED";
    })
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const nonWorkerIdsNeedingFixedPayType = workerEmployees
    .filter(
      (employee) =>
        employee.membership?.role !== "WORKER" &&
        normalizePayType(employee.payType, null) !== "FIXED"
    )
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));

  if (
    migrateEmployeeIds.length > 0 ||
    clearEmployeeRoleIds.length > 0 ||
    workerIdsNeedingCtPayType.length > 0 ||
    workerIdsNeedingFixedPayType.length > 0 ||
    nonWorkerIdsNeedingFixedPayType.length > 0
  ) {
    const reconciliationWrites: Prisma.PrismaPromise<any>[] = [];
    if (migrateEmployeeIds.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: migrateEmployeeIds } },
          data: { roleId: sewingRole.id },
        })
      );
    }
    if (clearEmployeeRoleIds.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: clearEmployeeRoleIds } },
          data: { roleId: null },
        })
      );
    }
    if (workerIdsNeedingCtPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: workerIdsNeedingCtPayType } },
          data: { payType: "CT" },
        })
      );
    }
    if (workerIdsNeedingFixedPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: workerIdsNeedingFixedPayType } },
          data: { payType: "FIXED" },
        })
      );
    }
    if (nonWorkerIdsNeedingFixedPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: nonWorkerIdsNeedingFixedPayType } },
          data: { payType: "FIXED" },
        })
      );
    }
    await prisma.$transaction(reconciliationWrites);
  }

  return roles;
};

const resolveDefaultEmployeeRoleId = async (orgId: number) => {
  const roles = await ensureDefaultEmployeeRoles(orgId);
  const sewingRole = roles.find((role) => role.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING);
  return sewingRole?.id ?? null;
};

const normalizeManagedAttributeCode = (value: any): string =>
  String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const buildAutoManagedAttributeCodeBase = (
  name: any,
  fallbackPrefix = "ITEM"
): string => normalizeManagedAttributeCode(name) || fallbackPrefix;

const generateUniqueManagedAttributeCode = ({
  usedCodes,
  name,
  fallbackPrefix = "ITEM",
}: {
  usedCodes: Set<string>;
  name: any;
  fallbackPrefix?: string;
}) => {
  const baseCode = buildAutoManagedAttributeCodeBase(name, fallbackPrefix);
  let candidate = baseCode;
  let suffix = 2;

  while (usedCodes.has(candidate)) {
    candidate = `${baseCode}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const resolveColorAttributeCode = ({
  code,
  name,
  usedCodes,
}: {
  code: any;
  name: any;
  usedCodes: Set<string>;
}) => {
  const explicitCode = normalizeManagedAttributeCode(code);
  if (explicitCode) return explicitCode;
  if (!String(name ?? "").trim()) return "";
  return generateUniqueManagedAttributeCode({
    usedCodes,
    name,
    fallbackPrefix: "COLOR",
  });
};

const syncSection = async (model: any, orgId: number, items: any, options: any = {}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await model.findMany({
    where: { orgId },
    select: { id: true, code: true },
  });
  const existingIds = existing.map((item: any) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id: any) => !incomingIdSet.has(id));
  const deleteIdSet = new Set(deleteIds);
  if (deleteIds.length > 0 && typeof options.beforeDeleteIds === "function") {
    await options.beforeDeleteIds(deleteIds);
  }
  if (deleteIds.length > 0) {
    await model.deleteMany({ where: { orgId, id: { in: deleteIds } } });
  }

  const creates = [];
  const updates = [];
  const existingCodeById = existing.reduce((map: Map<number, string>, item: any) => {
    map.set(item.id, String(item.code ?? "").trim());
    return map;
  }, new Map<number, string>());
  const usedCodes = existing.reduce((set: Set<string>, item: any) => {
    if (deleteIdSet.has(item.id)) return set;
    const trackedCode =
      typeof options.trackCode === "function"
        ? options.trackCode(item.code)
        : String(item.code ?? "").trim();
    if (trackedCode) {
      set.add(trackedCode);
    }
    return set;
  }, new Set<string>());

  for (const item of safeItems) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const existingCode = itemId ? existingCodeById.get(itemId) ?? "" : "";
    const trackedExistingCode =
      typeof options.trackCode === "function"
        ? options.trackCode(existingCode)
        : String(existingCode ?? "").trim();
    if (trackedExistingCode) {
      usedCodes.delete(trackedExistingCode);
    }

    let code = (item.code ?? "").trim();
    const name = (item.name ?? "").trim();
    if (typeof options.resolveCode === "function") {
      code = options.resolveCode({
        code,
        name,
        item,
        itemId,
        existingCode,
        usedCodes,
      });
    }

    if (!code && !name) {
      if (trackedExistingCode) {
        usedCodes.add(trackedExistingCode);
      }
      continue;
    }

    if (itemId) {
      updates.push(
        model.updateMany({
          where: { id: itemId, orgId },
          data: { code, name },
        })
      );
    } else {
      creates.push({ orgId, code, name });
    }

    const trackedNextCode =
      typeof options.trackCode === "function"
        ? options.trackCode(code)
        : String(code ?? "").trim();
    if (trackedNextCode) {
      usedCodes.add(trackedNextCode);
    }
  }

  if (creates.length > 0) {
    await model.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return model.findMany({ where: { orgId }, orderBy: { id: "asc" } });
};

const syncRoleSection = async (orgId: number, items: any) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await prisma.attrRole.findMany({
    where: { orgId },
    select: { id: true, code: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const existingIds = existing.map((item) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id) => !incomingIdSet.has(id));

  if (deleteIds.length > 0) {
    await prisma.employee.updateMany({
      where: {
        orgId,
        roleId: { in: deleteIds },
      },
      data: { roleId: null },
    });
    await prisma.attrRole.deleteMany({ where: { orgId, id: { in: deleteIds } } });
  }

  const creates = [];
  const updates = [];
  for (const [index, item] of safeItems.entries()) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const code = resolveOptionalString(item.code, null);
    const name = resolveOptionalString(item.name, null);
    const defaultPayType = normalizePayType(item.defaultPayType, "FIXED") ?? "FIXED";
    const sortOrder = toSortOrder(item.sortOrder, index + 1);

    if (!code && !name) continue;

    const data = {
      code: code ?? "",
      name: name ?? "",
      defaultPayType,
      sortOrder,
    };

    if (itemId) {
      updates.push(
        prisma.attrRole.updateMany({
          where: { id: itemId, orgId },
          data,
        })
      );
    } else {
      creates.push({
        orgId,
        ...data,
      });
    }
  }

  if (creates.length > 0) {
    await prisma.attrRole.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  const roles = await prisma.attrRole.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return roles.map(toAttrRoleResponse);
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/context", async (req, res) => {
  const requesterEmail = normalizeEmail(req.query.email) || getRequesterEmail(req);
  if (!requesterEmail || !requesterEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  // Auto-provision system admin on first login
  if (requesterEmail === getHardCodedSystemAdminEmail()) {
    await prisma.systemUser.upsert({
      where: { email: requesterEmail },
      update: { systemRole: "SYSTEM_ADMIN" },
      create: { email: requesterEmail, systemRole: "SYSTEM_ADMIN" },
    });
  }

  const systemUser = await prisma.systemUser.findUnique({
    where: { email: requesterEmail },
    select: { systemRole: true },
  });
  if (systemUser?.systemRole === "SYSTEM_ADMIN") {
    // /auth/context is called before API headers are fully hydrated on first load.
    // Ensure org resolution can still evaluate system-admin fallback organization.
    if (!getRequesterEmail(req)) {
      (req.headers as any)["x-user-email"] = requesterEmail;
    }

    let organization = null;
    try {
      organization = await getOrganizationByQuery(req, { allowSuspended: true });
    } catch (error) {
      const status = getErrorStatus(error) ?? 500;
      const message = getErrorMessage(error, "failed to resolve organization");
      return res.status(status).json({ ok: false, error: message });
    }

    return res.json({
      email: requesterEmail,
      entryType: "SYSTEM",
      systemRole: systemUser.systemRole,
      orgId: organization?.id ?? null,
      orgName: organization?.name ?? null,
      orgType: organization?.type ?? null,
      orgRole: null,
      employeeName: null,
    });
  }

  const requestedOrgIdText = getRequestedOrgIdText(req);
  if (requestedOrgIdText) {
    if (!/^\d+$/.test(requestedOrgIdText)) {
      return res.status(400).json({ ok: false, error: "invalid orgId" });
    }
    const requestedOrgId = Number(requestedOrgIdText);
    if (!Number.isSafeInteger(requestedOrgId) || requestedOrgId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid orgId" });
    }

    const membership = await prisma.orgMembership.findUnique({
      where: {
        orgId_email: {
          orgId: requestedOrgId,
          email: requesterEmail,
        },
      },
      include: { organization: true, employee: true },
    });
    if (!membership || membership.status !== "ACTIVE" || !membership.organization) {
      return res.status(403).json({
        ok: false,
        error: "active org membership is required",
      });
    }

    return res.json({
      email: requesterEmail,
      entryType: "ORG",
      systemRole: "USER",
      orgId: membership.organization.id,
      orgName: membership.organization.name ?? null,
      orgType: membership.organization.type ?? null,
      orgRole: membership.role,
      factoryId: membership.employee?.factoryId ?? null,
      employeeName: membership.employee?.name ?? null,
    });
  }

  const membership = await prisma.orgMembership.findFirst({
    where: {
      email: requesterEmail,
      status: "ACTIVE",
    },
    include: { organization: true, employee: true },
    orderBy: { id: "asc" },
  });
  if (!membership || !membership.organization) {
    return res.status(403).json({
      ok: false,
      error: "active org membership is required",
    });
  }

  res.json({
    email: requesterEmail,
    entryType: "ORG",
    systemRole: "USER",
    orgId: membership.organization.id,
    orgName: membership.organization.name ?? null,
    orgType: membership.organization.type ?? null,
    orgRole: membership.role,
    factoryId: membership.employee?.factoryId ?? null,
    employeeName: membership.employee?.name ?? null,
  });
});

app.use(
  createOrganizationRouter({
    applySubscriptionPayload,
    toOrganizationResponse,
  })
);

app.use(
  createOrgMembershipRouter({
    closeActiveLineAssignments,
    ensureDefaultEmployeeRoles,
    isManufacturerOrg,
    resolveDefaultEmployeeRoleId,
    resolveEmployeeStoredPayType,
    resolveRole,
    resolveStatus,
  })
);

app.use(
  createEmployeeRouter({
    ensureDefaultEmployeeRoles,
    isManufacturerOrg,
    resolveDefaultEmployeeRoleId,
    resolveEmployeeStoredPayType,
  })
);

app.use(
  createFactoryRouter({
    isManufacturerOrg,
  })
);

app.use(
  createLineRouter({
    closeActiveLineAssignments,
    isManufacturerOrg,
  })
);
app.get("/assignment-plans", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const lineId = Number(req.query.lineId);
  const hasLineFilter = Number.isFinite(lineId) && lineId > 0;
  const factoryId = Number(req.query.factoryId);
  const hasFactoryFilter = Number.isFinite(factoryId) && factoryId > 0;
  if (!hasLineFilter && !hasFactoryFilter) {
    return res
      .status(400)
      .json({ ok: false, error: "lineId or factoryId is required" });
  }

  let lineIds: number[] = [];
  if (hasLineFilter) {
    const line = await prisma.line.findFirst({
      where: {
        id: lineId,
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
      },
      select: { id: true },
    });
    if (!line) {
      return res.status(404).json({ ok: false, error: "line not found" });
    }
    lineIds = [line.id];
  } else {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
      select: { id: true },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }

    const factoryLines = await prisma.line.findMany({
      where: { orgId: organization.id, factoryId },
      select: { id: true },
    });
    lineIds = factoryLines
      .map((line) => Number(line.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (lineIds.length === 0) {
      return res.json([]);
    }
  }

  let boardState = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
    select: { id: true, cards: true, assignments: true },
  });
  let assignmentDisplayRefs: AssignmentDisplayReferenceMaps | null = null;
  if (boardState) {
    const repairedBoardState = await repairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards: boardState.cards,
      assignments: boardState.assignments,
    });
    assignmentDisplayRefs = repairedBoardState.refs;
    if (repairedBoardState.changed) {
      boardState = await prisma.assignmentBoardState.update({
        where: { id: boardState.id },
        data: {
          cards: repairedBoardState.cards,
          assignments: repairedBoardState.assignments,
        },
        select: { id: true, cards: true, assignments: true },
      });
    } else {
      boardState = {
        ...boardState,
        cards: repairedBoardState.cards,
        assignments: repairedBoardState.assignments,
      };
    }
  }
  const activeExternalIds = resolveAssignmentPlanExternalIds(boardState?.assignments);
  const hasBoardAssignments = Array.isArray(boardState?.assignments);
  if (hasBoardAssignments && activeExternalIds.length === 0) {
    return res.json([]);
  }

  const assignmentPlanLineFilter: Prisma.AssignmentPlanWhereInput["lineId"] =
    lineIds.length === 1 ? lineIds[0]! : { in: lineIds };
  let plans = await prisma.assignmentPlan.findMany({
    where: {
      orgId: organization.id,
      lineId: assignmentPlanLineFilter,
      ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });
  if (plans.length > 0 && plans.some(assignmentPlanNeedsDisplayRepair)) {
    const repairedPlans = await repairAssignmentPlanDisplayRows({
      orgId: organization.id,
      plans,
      refs: assignmentDisplayRefs,
    });
    plans = repairedPlans.plans;
  }

  const boardCards = ensureArray(boardState?.cards);
  const cardById = boardCards.reduce((map, card) => {
    const key = resolveOptionalString(card?.id, null);
    if (!key || map.has(key)) return map;
    map.set(key, card);
    return map;
  }, new Map<string, any>());

  res.json(
    plans.map((plan) => {
      const cardId =
        resolveOptionalString(plan.cardId, null) ??
        resolveOptionalString(plan.originOrderId, null) ??
        null;
      const matchedCard = cardId ? cardById.get(cardId) ?? null : null;
      return {
        dbId: plan.id,
        id: plan.externalId,
        lineId: String(plan.lineId),
        cardId,
        styleId:
          resolveOptionalString(matchedCard?.styleId, null) ??
          resolveOptionalString(matchedCard?.styleCode, null) ??
          null,
        styleCode: resolveOptionalString(matchedCard?.styleCode, null) ?? "",
        orderNo: plan.orderNo ?? "",
        label: plan.label ?? "",
        customer: plan.customer ?? "",
        colorId: toPositiveIntOrNull(plan.colorId),
        colorName: resolveAssignmentPlanColorName(plan),
        color: plan.color ?? "",
        quantity: plan.quantity ?? null,
        contractedSeconds: plan.contractedSeconds ?? null,
        ctStatus: resolveAssignmentCtStatus(plan.ctStatus),
        ctAgreedSnapshot:
          matchedCard?.ctAgreedSnapshot && typeof matchedCard.ctAgreedSnapshot === "object"
            ? matchedCard.ctAgreedSnapshot
            : null,
        startIndex: plan.startIndex,
        endIndex: plan.endIndex,
        isCompleted: plan.isCompleted,
        finalQuantity: plan.finalQuantity ?? null,
        completedAt: plan.completedAt ?? null,
      };
    })
  );
});

const buildAssignmentPlanProgressRows = async (
  orgId: number,
  externalIds: string[] = []
) => {
  const normalizedExternalIds = Array.from(
    new Set(
      ensureArray(externalIds)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  const plans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      ...(normalizedExternalIds.length > 0
        ? { externalId: { in: normalizedExternalIds } }
        : {}),
    },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      orderNo: true,
      customer: true,
      label: true,
      quantity: true,
      finalQuantity: true,
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });
  if (plans.length === 0) return [];

  const lineIds = Array.from(
    new Set(
      plans
        .map((plan) => Number(plan?.lineId))
        .filter((lineId) => Number.isSafeInteger(lineId) && lineId > 0)
    )
  );
  const lineRows =
    lineIds.length > 0
      ? await prisma.line.findMany({
          where: { id: { in: lineIds } },
          select: { id: true, name: true },
        })
      : [];
  const lineNameById = new Map(
    lineRows.map((line) => [Number(line.id), resolveOptionalString(line.name, "") || ""])
  );

  const planIds = plans.map((plan) => Number(plan.id)).filter((id) => Number.isFinite(id));
  const processAggregates =
    planIds.length > 0
      ? await prisma.workRecord.groupBy({
          by: ["assignmentPlanId", "processId", "processCode"],
          where: {
            orgId,
            assignmentPlanId: { in: planIds },
          },
          _sum: { quantity: true },
        })
      : [];
  const processTotalsByPlanId = new Map<number, number[]>();
  const sumByPlanId = new Map<number, number>();
  processAggregates.forEach((row) => {
    const planId = Number(row.assignmentPlanId);
    if (!Number.isFinite(planId)) return;
    const quantity = Math.max(0, Math.round(Number(row._sum.quantity ?? 0)));
    sumByPlanId.set(planId, (sumByPlanId.get(planId) || 0) + quantity);
    if (quantity <= 0) return;
    const current = processTotalsByPlanId.get(planId) || [];
    current.push(quantity);
    processTotalsByPlanId.set(planId, current);
  });

  const resolveProducedQuantity = (planId: number, baselineQuantity: number | null) => {
    const sumQuantity = Math.max(0, Math.round(Number(sumByPlanId.get(planId) || 0)));
    const processTotals = processTotalsByPlanId.get(planId) || [];
    if (processTotals.length <= 1) return sumQuantity;

    const maxProcessQuantity = Math.max(...processTotals);
    // 다공정에서 동일 완성수량이 반복 기록되면(sum 과대) 생산량은 공정 최대치로 본다.
    if (baselineQuantity != null && baselineQuantity > 0) {
      const tolerance = Math.max(1, Math.round(baselineQuantity * 0.15));
      if (
        sumQuantity > baselineQuantity + tolerance &&
        maxProcessQuantity <= baselineQuantity + tolerance
      ) {
        return maxProcessQuantity;
      }
    }
    if (sumQuantity >= maxProcessQuantity * 2) {
      return maxProcessQuantity;
    }
    return sumQuantity;
  };

  return plans.map((plan) => {
    const planId = Number(plan.id);
    const plannedQuantity = toOptionalNonNegativeInt(plan.quantity, null);
    const finalQuantity = toOptionalNonNegativeInt(plan.finalQuantity, null);
    const baselineQuantityRaw =
      finalQuantity != null && finalQuantity > 0
        ? finalQuantity
        : plannedQuantity != null && plannedQuantity > 0
          ? plannedQuantity
          : null;
    const producedQuantity = resolveProducedQuantity(planId, baselineQuantityRaw);
    const overflowQuantity =
      baselineQuantityRaw == null ? 0 : Math.max(0, producedQuantity - baselineQuantityRaw);
    const progressPercent =
      baselineQuantityRaw == null || baselineQuantityRaw <= 0
        ? null
        : (producedQuantity / baselineQuantityRaw) * 100;

    return {
      id: plan.externalId,
      dbId: planId,
      lineId: String(plan.lineId),
      lineName: lineNameById.get(Number(plan.lineId)) || "",
      orderNo: resolveOptionalString(plan.orderNo, "") || "",
      customer: resolveOptionalString(plan.customer, "") || "",
      label: resolveOptionalString(plan.label, "") || "",
      plannedQuantity,
      finalQuantity,
      baselineQuantity: baselineQuantityRaw,
      producedQuantity,
      overflowQuantity,
      isOverflow: overflowQuantity > 0,
      progressPercent,
    };
  });
};

app.get("/assignment-plan-progress", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const idsQuery = resolveOptionalString(req.query.ids, "") || "";
  const externalIds = idsQuery
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const rows = await buildAssignmentPlanProgressRows(organization.id, externalIds);
  res.json(rows);
});

app.patch("/assignment-plans/:externalId/complete", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const { externalId } = req.params;
  const finalQuantity = req.body?.finalQuantity != null ? Number(req.body.finalQuantity) : null;
  if (finalQuantity !== null && (!Number.isFinite(finalQuantity) || finalQuantity < 0)) {
    return res.status(400).json({ ok: false, error: "finalQuantity must be a non-negative number" });
  }

  const plan = await prisma.assignmentPlan.findUnique({
    where: { orgId_externalId: { orgId: organization.id, externalId } },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const updatedPlan = await prisma.assignmentPlan.update({
    where: { id: plan.id },
    data: {
      isCompleted: true,
      finalQuantity: finalQuantity != null ? Math.round(finalQuantity) : null,
      completedAt: new Date(),
    },
  });

  const accumulatedResult = await prisma.workRecord.aggregate({
    where: { assignmentPlanId: plan.id },
    _sum: { quantity: true },
  });
  const accumulatedQuantity = accumulatedResult._sum.quantity ?? 0;
  const isOverflow =
    updatedPlan.finalQuantity != null && accumulatedQuantity > updatedPlan.finalQuantity;

  res.json({
    ok: true,
    dbId: updatedPlan.id,
    id: updatedPlan.externalId,
    isCompleted: updatedPlan.isCompleted,
    finalQuantity: updatedPlan.finalQuantity ?? null,
    completedAt: updatedPlan.completedAt ?? null,
    accumulatedQuantity,
    isOverflow,
  });
});

app.patch("/assignment-plans/:externalId/reopen", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const { externalId } = req.params;
  const plan = await prisma.assignmentPlan.findUnique({
    where: { orgId_externalId: { orgId: organization.id, externalId } },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const updatedPlan = await prisma.assignmentPlan.update({
    where: { id: plan.id },
    data: { isCompleted: false, finalQuantity: null, completedAt: null },
  });

  res.json({ ok: true, dbId: updatedPlan.id, id: updatedPlan.externalId, isCompleted: false });
});

app.get("/attendance-entries", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  const factoryId = Number(req.query.factoryId);
  if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }
  const workDate = normalizeDateKey(req.query.workDate);
  const month = normalizeMonthKey(req.query.month);
  if (!workDate && !month) {
    return res.status(400).json({
      ok: false,
      error: "workDate or month is required",
    });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
    select: { id: true },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const rows = await prisma.attendanceEntry.findMany({
    where: {
      orgId: organization.id,
      factoryId,
      ...(workDate ? { workDate } : { workDate: { startsWith: month } }),
    },
    orderBy: [{ workDate: "asc" }, { workerId: "asc" }, { id: "asc" }],
  });

  res.json(rows.map(toAttendanceEntryResponse));
});

app.put("/attendance-entries", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  const factoryId = Number(req.body?.factoryId);
  if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }
  const workDate = normalizeDateKey(req.body?.workDate);
  if (!workDate) {
    return res.status(400).json({ ok: false, error: "workDate is required (YYYY-MM-DD)" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
    select: { id: true },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const normalized = normalizeAttendanceEntryPayloadList(req.body?.entries);
  if (normalized.invalidWorkerEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidWorkerEntryIndex}].workerId is required`,
    });
  }
  if (normalized.invalidClockInEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidClockInEntryIndex}].clockIn must be HH:mm`,
    });
  }
  if (normalized.invalidClockOutEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidClockOutEntryIndex}].clockOut must be HH:mm`,
    });
  }
  if (normalized.duplicateWorkerId !== null) {
    return res.status(409).json({
      ok: false,
      error: `duplicate worker entry (${normalized.duplicateWorkerId})`,
    });
  }

  const workerIds = Array.from(new Set(normalized.rows.map((row) => row.workerId)));
  if (workerIds.length > 0) {
    const workers = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        id: { in: workerIds },
      },
      select: { id: true },
    });
    const validIds = new Set(workers.map((worker) => Number(worker.id)));
    const invalidWorkerId = workerIds.find((workerId) => !validIds.has(workerId));
    if (invalidWorkerId !== undefined) {
      return res.status(400).json({
        ok: false,
        error: `entries has invalid workerId (${invalidWorkerId})`,
      });
    }
  }

  const savedRows = await prisma.$transaction(async (tx) => {
    await tx.attendanceEntry.deleteMany({
      where: {
        orgId: organization.id,
        factoryId,
        workDate,
      },
    });

    if (normalized.rows.length > 0) {
      await tx.attendanceEntry.createMany({
        data: normalized.rows.map((row) => ({
          orgId: organization.id,
          factoryId,
          workerId: row.workerId,
          workDate,
          clockIn: row.clockIn,
          clockOut: row.clockOut,
          workedSeconds: row.workedSeconds,
          note: row.note,
        })),
      });
    }

    return tx.attendanceEntry.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        workDate,
      },
      orderBy: [{ workerId: "asc" }, { id: "asc" }],
    });
  });

  res.json(savedRows.map(toAttendanceEntryResponse));
  triggerAtSyncFromEvent(organization.id, "attendance_put");
});

app.get("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const factoryId = Number(req.query.factoryId);
  const hasFactoryFilter = Number.isFinite(factoryId);
  if (hasFactoryFilter) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  const workLogs = await prisma.workLog.findMany({
    where: {
      orgId: organization.id,
      ...(hasFactoryFilter ? { factoryId } : {}),
    },
    orderBy: [{ workDate: "desc" }, { id: "desc" }],
  });

  res.json(workLogs.map(toWorkLogResponse));
});

app.get("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const workLog = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    include: {
      workRecords: WORK_RECORD_WITH_REFS_INCLUDE,
    },
  });
  if (!workLog) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }

  res.json(toWorkLogResponse(workLog));
});

app.post("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const normalized = normalizeWorkLogPayload(req.body ?? {});
  if (normalized.invalidWorkerRecordIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${normalized.invalidWorkerRecordIndex}].workerId is required`
      ),
    });
  }
  if (normalized.factoryId !== null) {
    const factory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res
        .status(404)
        .json({ ok: false, error: translateWorkLogErrorMessage("factory not found") });
    }
  }
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: normalized.workDate,
    workerIds,
  });
  if (lineValidation.error) {
    return res
      .status(lineValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(lineValidation.error) });
  }
  if (lineValidation.missingWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `line worker mismatch for workDate (${lineValidation.missingWorkerIds.join(",")})`
      ),
    });
  }
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  const ctAgreementValidation = await validateWorkLogAssignmentPlanCtAgreement({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  if (ctAgreementValidation.error) {
    return res
      .status(ctAgreementValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctAgreementValidation.error) });
  }
  const quantityValidation = await validateWorkLogAssignmentProcessQuantities({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  if (quantityValidation.error) {
    return res
      .status(quantityValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(quantityValidation.error) });
  }

  const created = await prisma.$transaction(async (tx) => {
    const {
      records,
      invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
      lineId: _lineId,
      lineName: _lineName,
      ...workLogData
    } = normalized;
    const next = await tx.workLog.create({
      data: {
        orgId: organization.id,
        ...workLogData,
        records: {
          lineId: lineValidation.line?.id ?? null,
          lineName: lineValidation.line?.name ?? null,
        },
      },
    });

    if (records.length > 0) {
      await tx.workRecord.createMany({
        data: records.map((record: any) => ({
          orgId: organization.id,
          workLogId: next.id,
          workerId: record.workerId,
          workerName: record.workerName ?? null,
          customerName: record.customerName ?? null,
          styleId: record.styleId ?? null,
          styleUid: record.styleUid ?? null,
          styleName: record.styleName ?? null,
          processId: record.processId ?? null,
          processCode: record.processCode ?? null,
          colorId: record.colorId ?? null,
          colorCode: record.colorCode ?? null,
          ctSeconds: record.ctSeconds ?? 0,
          quantity: record.quantity ?? 0,
          assignmentPlanId: record.assignmentPlanId ?? null,
        })),
      });
    }

    return next;
  }, { timeout: 30000 });
  const createdWithRecords = await prisma.workLog.findUnique({
    where: { id: created.id },
    include: {
      workRecords: WORK_RECORD_WITH_REFS_INCLUDE,
    },
  });
  res.status(201).json(toWorkLogResponse(createdWithRecords ?? created));
  triggerAtSyncFromEvent(organization.id, "worklog_post");
});

app.put("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res
      .status(404)
      .json({ ok: false, error: translateWorkLogErrorMessage("organization not found") });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res
      .status(400)
      .json({ ok: false, error: translateWorkLogErrorMessage("invalid id") });
  }

  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
  });
  if (!existing) {
    return res
      .status(404)
      .json({ ok: false, error: translateWorkLogErrorMessage("work log not found") });
  }

  const normalized = normalizeWorkLogPayload(req.body ?? {}, existing);
  if (normalized.invalidWorkerRecordIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${normalized.invalidWorkerRecordIndex}].workerId is required`
      ),
    });
  }
  if (normalized.factoryId !== null) {
    const factory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res
        .status(404)
        .json({ ok: false, error: translateWorkLogErrorMessage("factory not found") });
    }
  }
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: normalized.workDate,
    workerIds,
  });
  if (lineValidation.error) {
    return res
      .status(lineValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(lineValidation.error) });
  }
  if (lineValidation.missingWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `line worker mismatch for workDate (${lineValidation.missingWorkerIds.join(",")})`
      ),
    });
  }
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  const ctAgreementValidation = await validateWorkLogAssignmentPlanCtAgreement({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  if (ctAgreementValidation.error) {
    return res
      .status(ctAgreementValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctAgreementValidation.error) });
  }
  const quantityValidation = await validateWorkLogAssignmentProcessQuantities({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
    excludedWorkLogId: existing.id,
  });
  if (quantityValidation.error) {
    return res
      .status(quantityValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(quantityValidation.error) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const {
      records,
      invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
      lineId: _lineId,
      lineName: _lineName,
      ...workLogData
    } = normalized;
    const next = await tx.workLog.update({
      where: { id: existing.id },
      data: {
        ...workLogData,
        records: {
          lineId: lineValidation.line?.id ?? null,
          lineName: lineValidation.line?.name ?? null,
        },
      },
    });

    await tx.workRecord.deleteMany({
      where: { orgId: organization.id, workLogId: existing.id },
    });

    if (records.length > 0) {
      await tx.workRecord.createMany({
        data: records.map((record: any) => ({
          orgId: organization.id,
          workLogId: existing.id,
          workerId: record.workerId,
          workerName: record.workerName ?? null,
          customerName: record.customerName ?? null,
          styleId: record.styleId ?? null,
          styleUid: record.styleUid ?? null,
          styleName: record.styleName ?? null,
          processId: record.processId ?? null,
          processCode: record.processCode ?? null,
          colorId: record.colorId ?? null,
          colorCode: record.colorCode ?? null,
          ctSeconds: record.ctSeconds ?? 0,
          quantity: record.quantity ?? 0,
          assignmentPlanId: record.assignmentPlanId ?? null,
        })),
      });
    }

    return next;
  }, { timeout: 30000 });
  const updatedWithRecords = await prisma.workLog.findUnique({
    where: { id: updated.id },
    include: {
      workRecords: WORK_RECORD_WITH_REFS_INCLUDE,
    },
  });
  res.json(toWorkLogResponse(updatedWithRecords ?? updated));
  triggerAtSyncFromEvent(organization.id, "worklog_put");
});

app.delete("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }

  await prisma.workLog.delete({
    where: { id: existing.id },
  });
  res.status(204).send();
  triggerAtSyncFromEvent(organization.id, "worklog_delete");
});

app.get("/assignment-board-view", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
  });
  const response = await buildReadOnlyAssignmentBoardStateResponse(
    organization.id,
    state
  );
  res.json(response);
});

app.get("/assignment-board-versions", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
    select: {
      assignments: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const response = await buildReadOnlyAssignmentBoardStateResponse(
    organization.id,
    state
  );

  res.json({
    assignments: response.assignments,
    createdAt: response.createdAt ?? null,
    updatedAt: response.updatedAt ?? null,
    serverNow: response.serverNow ?? new Date().toISOString(),
  });
});

app.get("/assignment-cards", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  const [orders, styles, colors, state] = await Promise.all([
    prisma.workOrder.findMany({
      where: { OR: getOrderAccessWhere(organization.id) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        orderId: true,
        orderNumber: true,
        dueDate: true,
        customerName: true,
        buyerOrgName: true,
        items: true,
        workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE,
      },
    }),
    prisma.style.findMany({
      where: { orgId: { in: accessibleOwnerOrgIds } },
      orderBy: { uid: "asc" },
      select: {
        orgId: true,
        styleId: true,
        styleCode: true,
        name: true,
        customer: true,
        imageUrls: true,
        processes: true,
      },
    }),
    prisma.attrColor.findMany({
      where: { orgId: organization.id },
      select: { code: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { cards: true, updatedAt: true },
    }),
  ]);

  const colorNameByCode = colors.reduce((map, row) => {
    const key = normalizeAssignmentCardColorKey(row?.code);
    if (!key || map.has(key)) return map;
    map.set(key, resolveOptionalString(row?.name, null) || key);
    return map;
  }, new Map<string, string>());

  const baseCards = buildAssignmentCardsFromOrders({
    orders,
    styles,
    colorNameByCode,
  });
  const mergedCards = mergeAssignmentCardsWithSaved(baseCards, state?.cards);
  const includeProcesses = isManufacturerOrg(organization);

  res.json({
    cards: mergedCards,
    styles: styles.map((style) =>
      toStyleResponse(style, {
        includeProcesses,
      })
    ),
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  });
});

app.get("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  let state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
  });
  if (state) {
    const {
      assignments: escalatedAssignments,
      changed: escalationChanged,
    } = applySentTimeoutEscalation(state.assignments);
    if (escalationChanged) {
      state = await prisma.assignmentBoardState.update({
        where: { id: state.id },
        data: { assignments: escalatedAssignments },
      });
    }
    const repairedState = await repairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards: state.cards,
      assignments: state.assignments,
    });
    if (repairedState.changed) {
      state = await prisma.assignmentBoardState.update({
        where: { id: state.id },
        data: {
          cards: repairedState.cards,
          assignments: repairedState.assignments,
        },
      });
    } else {
      state = {
        ...state,
        cards: repairedState.cards,
        assignments: repairedState.assignments,
      };
    }
  }
  const activeExternalIds = resolveAssignmentPlanExternalIds(state?.assignments);
  const hasBoardAssignments = Array.isArray(state?.assignments);
  let assignmentPlans =
    hasBoardAssignments && activeExternalIds.length === 0
      ? []
      : await prisma.assignmentPlan.findMany({
          where: {
            orgId: organization.id,
            ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
          },
          orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
        });
  if (assignmentPlans.length > 0 && assignmentPlans.some(assignmentPlanNeedsDisplayRepair)) {
    const repairedPlans = await repairAssignmentPlanDisplayRows({
      orgId: organization.id,
      plans: assignmentPlans,
    });
    assignmentPlans = repairedPlans.plans;
  }

  res.json(toAssignmentBoardStateResponse(state, assignmentPlans));
});

// CT 상태 변경 전용 경량 엔드포인트
// 전체 보드 상태를 전송하지 않고 변경된 assignment/card 필드만 패치
app.patch("/assignment-board-state/ct", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const assignmentId = resolveOptionalString(req.body?.assignmentId, null);
  if (!assignmentId) {
    return res.status(400).json({ ok: false, error: "assignmentId is required" });
  }
  const assignmentPatch = req.body?.assignmentPatch;
  if (!assignmentPatch || typeof assignmentPatch !== "object") {
    return res.status(400).json({ ok: false, error: "assignmentPatch is required" });
  }
  const cardId = resolveOptionalString(req.body?.cardId, null);
  const cardPatch = (req.body?.cardPatch && typeof req.body.cardPatch === "object")
    ? req.body.cardPatch
    : null;

  const existingState = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
    select: { id: true, cards: true, assignments: true },
  });
  if (!existingState) {
    return res.status(404).json({ ok: false, error: "board state not found" });
  }

  const currentAssignments = normalizeStateAssignments(existingState.assignments);
  const targetAssignment = currentAssignments.find(
    (a: any) => String(a?.id) === assignmentId
  );
  if (!targetAssignment) {
    return res.status(404).json({ ok: false, error: "assignment not found" });
  }

  const nowIso = new Date().toISOString();
  const currentVersion = Number((targetAssignment as any).version ?? 0);
  const nextCtStatus = resolveAssignmentCtStatus(
    resolveOptionalString(assignmentPatch?.ctStatus, "PENDING") ?? "PENDING"
  );
  const nextSentAt =
    nextCtStatus === "SENT"
      ? resolveAssignmentSentAtIso(assignmentPatch) ?? nowIso
      : null;

  const patchedAssignment = normalizeStateAssignmentItem({
    ...targetAssignment,
    ...assignmentPatch,
    id: assignmentId,
    ctStatus: nextCtStatus,
    ctSentAt: nextSentAt,
    version: currentVersion + 1,
    versionUpdatedAt: nowIso,
    ...(nextCtStatus !== "SENT"
      ? {
          ctEscalatedAt: null,
          ctEscalationReason: null,
          ctEscalationTargetRole: null,
          ctEscalationStatus: null,
        }
      : {}),
  });

  const nextAssignments = currentAssignments.map((a: any) =>
    String(a?.id) === assignmentId ? patchedAssignment : a
  );
  const { assignments: assignmentsForState } = applySentTimeoutEscalation(nextAssignments);

  let currentCards = ensureArray(existingState.cards);
  let patchedCard: any = null;
  if (cardId && cardPatch) {
    currentCards = currentCards.map((card: any) => {
      if (String(card?.id) !== cardId) return card;
      patchedCard = { ...card, ...cardPatch };
      return patchedCard;
    });
  }

  const updatedState = await prisma.assignmentBoardState.update({
    where: { id: existingState.id },
    data: { cards: currentCards, assignments: assignmentsForState },
    select: { updatedAt: true },
  });

  // assignment plan 동기화 (변경된 assignment 1건만)
  const externalId = resolveAssignmentExternalId(patchedAssignment);
  if (externalId) {
    const lineIdSet = new Set(
      (
        await prisma.line.findMany({
          where: { orgId: organization.id },
          select: { id: true },
        })
      ).map((line) => line.id)
    );
    const normalizedPlanChanges = await syncAssignmentPlanColorRefs(
      organization.id,
      normalizeAssignmentPlanPayload([patchedAssignment], lineIdSet)
    );
    if (normalizedPlanChanges.length > 0) {
      const planItem = normalizedPlanChanges[0];
      const existingPlan = await prisma.assignmentPlan.findFirst({
        where: { orgId: organization.id, externalId },
        select: { id: true },
      });
      if (existingPlan) {
        await prisma.assignmentPlan.update({
          where: { id: existingPlan.id },
          data: toAssignmentPlanWriteData(planItem),
        });
      } else {
        await prisma.assignmentPlan.create({
          data: {
            orgId: organization.id,
            externalId,
            ...toAssignmentPlanWriteData(planItem),
          },
        });
      }
    }
  }

  res.json({
    ok: true,
    assignment: patchedAssignment,
    card: patchedCard,
    updatedAt: updatedState.updatedAt,
    serverNow: nowIso,
  });
});

// 배정 취소 전용 경량 엔드포인트
// 전체 보드 상태를 전송하지 않고 해당 assignment만 제거
app.delete("/assignment-board-state/assignment/:assignmentId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const assignmentId = resolveOptionalString(req.params.assignmentId, null);
  if (!assignmentId) {
    return res.status(400).json({ ok: false, error: "assignmentId is required" });
  }
  const cardId = resolveOptionalString(req.body?.cardId, null);
  const cardPatch = (req.body?.cardPatch && typeof req.body.cardPatch === "object")
    ? req.body.cardPatch
    : null;

  const existingState = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
    select: { id: true, cards: true, assignments: true },
  });
  if (!existingState) {
    return res.status(404).json({ ok: false, error: "board state not found" });
  }

  const currentAssignments = normalizeStateAssignments(existingState.assignments);
  const targetAssignment = currentAssignments.find(
    (a: any) => String(a?.id) === assignmentId
  );
  if (!targetAssignment) {
    return res.status(404).json({ ok: false, error: "assignment not found" });
  }

  const nextAssignments = currentAssignments.filter(
    (a: any) => String(a?.id) !== assignmentId
  );

  let currentCards = ensureArray(existingState.cards);
  let patchedCard: any = null;
  if (cardId && cardPatch) {
    currentCards = currentCards.map((card: any) => {
      if (String(card?.id) !== cardId) return card;
      patchedCard = { ...card, ...cardPatch };
      return patchedCard;
    });
  }

  await prisma.assignmentBoardState.update({
    where: { id: existingState.id },
    data: { cards: currentCards, assignments: nextAssignments },
  });

  // 해당 assignment의 plan 레코드 제거
  const externalId = resolveAssignmentExternalId(targetAssignment);
  if (externalId) {
    await prisma.assignmentPlan.deleteMany({
      where: { orgId: organization.id, externalId },
    });
  }

  res.json({
    ok: true,
    removedAssignmentId: assignmentId,
    card: patchedCard,
  });
});

app.delete("/assignment-board-state", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { id: true },
    });
    if (existing) {
      await tx.assignmentBoardState.update({
        where: { orgId: organization.id },
        data: { assignments: [], cards: [] },
      });
    }
    await tx.assignmentPlan.deleteMany({ where: { orgId: organization.id } });
  });

  res.json({ ok: true });
});

app.put("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const cards = ensureArray(req.body?.cards);
  const incomingAssignments = ensureArray(req.body?.assignments);
  let cardsForSave = cards;
  let incomingAssignmentsForSave = incomingAssignments;
  if (
    shouldRepairAssignmentBoardDisplayPayloadOnWrite({
      cards: cardsForSave,
      assignments: incomingAssignmentsForSave,
    })
  ) {
    const repairedIncomingPayload = await repairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards: cardsForSave,
      assignments: incomingAssignmentsForSave,
    });
    cardsForSave = repairedIncomingPayload.cards;
    incomingAssignmentsForSave = repairedIncomingPayload.assignments;
  }
  const requesterEmail = getRequesterEmail(req);
  const [requesterSystemUser, requesterMembership] = requesterEmail
    ? await Promise.all([
        prisma.systemUser.findUnique({
          where: { email: requesterEmail },
          select: { systemRole: true },
        }),
        prisma.orgMembership.findUnique({
          where: {
            orgId_email: { orgId: organization.id, email: requesterEmail },
          },
          select: { role: true, status: true },
        }),
      ])
    : [null, null];
  const requesterIsSystemAdmin =
    requesterSystemUser?.systemRole === "SYSTEM_ADMIN";
  const requesterIsOrgAdmin =
    requesterMembership?.status === "ACTIVE" && requesterMembership?.role === "ADMIN";

  const updated = await prisma.$transaction(async (tx) => {
    const existingState = await tx.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { id: true, cards: true, assignments: true },
    });
    const {
      assignments: currentAssignments,
    } = applySentTimeoutEscalation(existingState?.assignments);
    const currentAssignmentsNormalized = normalizeStateAssignments(currentAssignments);
    const currentAssignmentsByExternalId =
      buildAssignmentByExternalId(currentAssignmentsNormalized);
    const nextAssignmentsNormalized = normalizeStateAssignments(
      incomingAssignmentsForSave
    );
    const nextAssignmentsByExternalId =
      buildAssignmentByExternalId(nextAssignmentsNormalized);
    const changedIncomingExternalIds = new Set<string>();
    const removedExternalIds = new Set<string>();

    nextAssignmentsByExternalId.forEach((nextItem: any, externalId: string) => {
      const currentItem = currentAssignmentsByExternalId.get(externalId);
      if (!currentItem || !isSameAssignmentStateContent(currentItem, nextItem)) {
        changedIncomingExternalIds.add(externalId);
      }
    });
    currentAssignmentsByExternalId.forEach(
      (_currentItem: any, externalId: string) => {
        if (!nextAssignmentsByExternalId.has(externalId)) {
          removedExternalIds.add(externalId);
        }
      }
    );

    const currentVersionByExternalId =
      buildAssignmentVersionMap(currentAssignmentsNormalized);
    const changedIncomingAssignments = nextAssignmentsNormalized.filter((item) => {
      const externalId = resolveAssignmentExternalId(item);
      return Boolean(externalId && changedIncomingExternalIds.has(externalId));
    });
    const versionConflicts = findAssignmentVersionConflicts(
      changedIncomingAssignments,
      currentVersionByExternalId
    );
    if (versionConflicts.length > 0) {
      const summary = versionConflicts
        .slice(0, 5)
        .map(
          (row) =>
            `${row.id} (expected=${row.expectedVersion}, current=${row.currentVersion})`
        )
        .join(", ");
      throw createHttpError(
        409,
        `assignment version conflict: ${summary}`
      );
    }

    const currentStatusByExternalId = currentAssignmentsNormalized.reduce(
      (map, item) => {
        const externalId = resolveAssignmentExternalId(item);
        if (!externalId || map.has(externalId)) return map;
        map.set(
          externalId,
          resolveAssignmentCtStatus(
            resolveOptionalString(item?.ctStatus, "PENDING") ?? "PENDING"
          )
        );
        return map;
      },
      new Map<string, string>()
    );
    for (const externalId of removedExternalIds.values()) {
      const previousStatus = currentStatusByExternalId.get(externalId) ?? "PENDING";
      if (previousStatus !== "AGREED") continue;
      if (!requesterIsSystemAdmin && !requesterIsOrgAdmin) {
        throw createHttpError(
          403,
          "only org admins can reopen agreed assignments"
        );
      }
    }
    for (const item of nextAssignmentsNormalized) {
      const externalId = resolveAssignmentExternalId(item);
      if (!externalId) continue;
      if (!changedIncomingExternalIds.has(externalId)) continue;
      const previousStatus = currentStatusByExternalId.get(externalId) ?? "PENDING";
      const nextStatus = resolveAssignmentCtStatus(item?.ctStatus);
      const isReopenFromAgreed = previousStatus === "AGREED" && nextStatus !== "AGREED";
      if (isReopenFromAgreed && !requesterIsSystemAdmin && !requesterIsOrgAdmin) {
        throw createHttpError(
          403,
          "only org admins can reopen agreed assignments"
        );
      }
    }

    const nowIso = new Date().toISOString();
    const versionedAssignments = nextAssignmentsNormalized.map((item) => {
      const externalId = resolveAssignmentExternalId(item);
      if (!externalId) {
        return normalizeStateAssignmentItem(item);
      }

      const currentItem = currentAssignmentsByExternalId.get(externalId);
      if (currentItem && !changedIncomingExternalIds.has(externalId)) {
        return normalizeStateAssignmentItem(currentItem);
      }

      const currentVersion = currentVersionByExternalId.get(externalId) ?? 0;
      const nextStatus = resolveAssignmentCtStatus(
        resolveOptionalString(item?.ctStatus, "PENDING") ?? "PENDING"
      );
      const nextSentAt =
        nextStatus === "SENT" ? resolveAssignmentSentAtIso(item) ?? nowIso : null;
      return normalizeStateAssignmentItem({
        ...item,
        id: externalId,
        ctStatus: nextStatus,
        ctSentAt: nextSentAt,
        version: currentVersion + 1,
        versionUpdatedAt: nowIso,
        ...(nextStatus !== "SENT"
          ? {
              ctEscalatedAt: null,
              ctEscalationReason: null,
              ctEscalationTargetRole: null,
              ctEscalationStatus: null,
            }
          : {}),
      });
    });
    const {
      assignments: assignmentsForState,
    } = applySentTimeoutEscalation(versionedAssignments);

    let state: any = null;
    if (!existingState) {
      state = await tx.assignmentBoardState.create({
        data: {
          orgId: organization.id,
          cards: cardsForSave,
          assignments: assignmentsForState,
        },
      });
    } else {
      state = await tx.assignmentBoardState.update({
        where: { id: existingState.id },
        data: {
          cards: cardsForSave,
          assignments: assignmentsForState,
        },
      });
    }

    const changedPlanTargetAssignments = nextAssignmentsNormalized.filter((item) => {
      const externalId = resolveAssignmentExternalId(item);
      return Boolean(externalId && changedIncomingExternalIds.has(externalId));
    });
    const removedExternalIdList = Array.from(removedExternalIds.values());

    return {
      state,
      changedPlanTargetAssignments,
      removedExternalIdList,
    };
  }, { timeout: 90000 });
  const updatedState = updated?.state ?? null;
  const changedPlanTargetAssignments = ensureArray(
    updated?.changedPlanTargetAssignments
  );
  const removedExternalIdList = ensureArray(updated?.removedExternalIdList).map((value) =>
    String(value)
  );
  const shouldSyncPlans =
    changedPlanTargetAssignments.length > 0 || removedExternalIdList.length > 0;
  if (shouldSyncPlans) {
    const lineIdSet =
      changedPlanTargetAssignments.length > 0
        ? new Set(
            (
              await prisma.line.findMany({
                where: { orgId: organization.id },
                select: { id: true },
              })
            ).map((line) => line.id)
          )
        : null;
    const normalizedPlanChanges =
      changedPlanTargetAssignments.length > 0
        ? await syncAssignmentPlanColorRefs(
            organization.id,
            normalizeAssignmentPlanPayload(changedPlanTargetAssignments, lineIdSet)
          )
        : [];
    const planSyncExternalIds = Array.from(
      new Set([
        ...normalizedPlanChanges.map((item: any) => item.externalId),
        ...removedExternalIdList,
      ])
    );

    const existingPlanRows =
      planSyncExternalIds.length > 0
        ? await prisma.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: planSyncExternalIds },
            },
            select: { id: true, externalId: true },
          })
        : [];
    const existingPlanByExternalId = new Map(
      existingPlanRows.map((plan) => [plan.externalId, plan])
    );

    const createPlanRows: any[] = [];
    const updatePlanRows: Array<{ id: number; item: any }> = [];
    normalizedPlanChanges.forEach((item: any) => {
      const existingPlan = existingPlanByExternalId.get(item.externalId);
      if (existingPlan) {
        updatePlanRows.push({ id: existingPlan.id, item });
        return;
      }
      createPlanRows.push(item);
    });

    if (createPlanRows.length > 0) {
      await prisma.assignmentPlan.createMany({
        data: createPlanRows.map((item: any) => ({
          orgId: organization.id,
          externalId: item.externalId,
          ...toAssignmentPlanWriteData(item),
        })),
      });
    }

    if (updatePlanRows.length > 0) {
      await Promise.all(
        updatePlanRows.map((row) =>
          prisma.assignmentPlan.update({
            where: { id: row.id },
            data: toAssignmentPlanWriteData(row.item),
          })
        )
      );
    }

    const removedExternalIdSet = new Set(removedExternalIdList);
    const removedPlanRows = existingPlanRows.filter((plan) =>
      removedExternalIdSet.has(plan.externalId)
    );
    if (removedPlanRows.length > 0) {
      const removedPlanIds = removedPlanRows.map((plan) => plan.id);
      const linkedRows = await prisma.workRecord.findMany({
        where: { assignmentPlanId: { in: removedPlanIds } },
        select: { assignmentPlanId: true },
        distinct: ["assignmentPlanId"],
      });
      const linkedPlanIdSet = new Set(
        linkedRows.map((row) => Number(row.assignmentPlanId))
      );
      const deletablePlanIds = removedPlanIds.filter(
        (planId) => !linkedPlanIdSet.has(planId)
      );
      if (deletablePlanIds.length > 0) {
        await prisma.assignmentPlan.deleteMany({
          where: { id: { in: deletablePlanIds } },
        });
      }
    }
  }
  res.json(toAssignmentBoardStateResponse(updatedState));
});

app.get("/customers", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization) && !isBrandOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const where = isManufacturerOrg(organization)
    ? { manufacturerOrgId: organization.id }
    : { brandOrgId: organization.id };
  const relationships = await prisma.orgRelationship.findMany({
    where,
    include: { brand: true, manufacturer: true },
    orderBy: { id: "asc" },
  });

  const perspective = isManufacturerOrg(organization) ? "MANUFACTURER" : "BRAND";
  res.json(relationships.map((item) => toCustomerResponse(item, perspective)));
});

app.get("/order-parties", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization) && !isBrandOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const where = isManufacturerOrg(organization)
    ? { manufacturerOrgId: organization.id }
    : { brandOrgId: organization.id };

  const relationships = await prisma.orgRelationship.findMany({
    where,
    include: {
      manufacturer: true,
      brand: true,
    },
    orderBy: { id: "asc" },
  });

  const relationshipPairs = relationships.map((relationship) => ({
    manufacturerOrgId: relationship.manufacturerOrgId,
    brandOrgId: relationship.brandOrgId,
  }));

  const buyerOrgOptions = isManufacturerOrg(organization)
    ? toUniqueOrganizationOptions(relationships.map((relationship) => relationship.brand))
    : [toOrganizationOption(organization)];

  const sellerOrgOptions = isManufacturerOrg(organization)
    ? [toOrganizationOption(organization)]
    : toUniqueOrganizationOptions(
        relationships.map((relationship) => relationship.manufacturer)
      );

  res.json({
    currentOrg: toOrganizationOption(organization),
    roleHint: isManufacturerOrg(organization) ? "MANUFACTURER" : "BRAND",
    buyerOrgOptions,
    sellerOrgOptions,
    relationshipPairs,
  });
});

app.get("/orders", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orders = await prisma.workOrder.findMany({
    where: { OR: getOrderAccessWhere(organization.id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
  });
  res.json(orders.map(toOrderResponse));
});

app.post("/orders", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const normalized = normalizeOrderPayload(req.body ?? {});
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  const buyerOrgId = toPositiveIntOrNull(normalized.buyerOrgId);
  const sellerOrgId = toPositiveIntOrNull(normalized.sellerOrgId);
  const { buyer, seller } = await resolveOrderPartiesOrThrow({
    buyerOrgId,
    sellerOrgId,
    requesterOrgId: organization.id,
  });
  normalized.buyerOrgId = buyer.id;
  normalized.buyerOrgName = buyer.name ?? "";
  normalized.customerId = buyer.id;
  normalized.customerName = buyer.name ?? "";
  normalized.sellerOrgId = seller.id;
  normalized.sellerOrgName = seller.name ?? "";
  normalized.items = await syncOrderItemColorSnapshots(normalized.items);
  normalized.items = await syncOrderItemStyleRefs(normalized.items, [
    buyer.id,
    seller.id,
  ]);
  normalized.totalQuantity = normalized.items.reduce(
    (sum: number, item: any) => sum + (Number(item?.totalQuantity) || 0),
    0
  );

  const { order, created } = await createOrReuseSharedOrder({ normalized });
  res.status(created ? 201 : 200).json(toOrderResponse(order));
});

app.put("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }

  const normalized = normalizeOrderPayload(req.body ?? {}, existing);
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  const buyerOrgId = toPositiveIntOrNull(normalized.buyerOrgId);
  const sellerOrgId = toPositiveIntOrNull(normalized.sellerOrgId);
  const { buyer, seller } = await resolveOrderPartiesOrThrow({
    buyerOrgId,
    sellerOrgId,
    requesterOrgId: organization.id,
  });
  normalized.buyerOrgId = buyer.id;
  normalized.buyerOrgName = buyer.name ?? "";
  normalized.customerId = buyer.id;
  normalized.customerName = buyer.name ?? "";
  normalized.sellerOrgId = seller.id;
  normalized.sellerOrgName = seller.name ?? "";
  normalized.items = await syncOrderItemColorSnapshots(normalized.items);
  normalized.items = await syncOrderItemStyleRefs(normalized.items, [
    buyer.id,
    seller.id,
  ]);
  normalized.totalQuantity = normalized.items.reduce(
    (sum: number, item: any) => sum + (Number(item?.totalQuantity) || 0),
    0
  );

  const orderNumberConflict = await findSharedOrderConflict({
    buyerOrgId: buyer.id,
    sellerOrgId: seller.id,
    orderNumber: normalized.orderNumber,
    excludeOrderRecordId: existing.id,
  });
  if (orderNumberConflict) {
    return res.status(409).json({
      ok: false,
      error: "order already exists for this buyer/seller pair",
    });
  }
  // Route param is source of truth.
  normalized.orderId = existing.orderId;

  const itemsToUpsert = normalizeOrderItems(normalized.items);
  const updated = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.workOrder.update({
      where: { id: existing.id },
      data: {
        ...normalized,
        orgId: buyer.id,
      },
    });
    await tx.workOrderItem.deleteMany({ where: { workOrderId: existing.id } });
    if (itemsToUpsert.length > 0) {
      await tx.workOrderItem.createMany({
        data: itemsToUpsert.map((item: any, idx: number) => ({
          workOrderId: updatedOrder.id,
          itemId: item.id || "",
          styleId: resolveOptionalString(item.styleId, null),
          styleUid: toPositiveIntOrNull(item.styleUid),
          styleName: resolveOptionalString(item.styleName, null),
          styleCode: resolveOptionalString(item.styleCode, null),
          colorId: toPositiveIntOrNull(item.colorId),
          colorCode: resolveOptionalString(item.colorCode, null),
          gender: normalizeWorkOrderItemGender(item.gender, "M"),
          sizeQuantities: item.sizeQuantities ?? null,
          totalQuantity: toNonNegativeInt(item.totalQuantity, 0),
          sortOrder: idx,
        })),
      });
    }
    return tx.workOrder.findUnique({
      where: { id: updatedOrder.id },
      include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
    });
  }, { timeout: 30000 });

  res.json(toOrderResponse(updated));
});

app.delete("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }
  const ownerOrgId = existing.buyerOrgId ?? existing.orgId;
  if (ownerOrgId !== organization.id) {
    return res.status(403).json({
      ok: false,
      error: "only order owner can delete",
    });
  }
  if (!isWorkOrderDeletableStatus(existing.status)) {
    return res.status(409).json({
      ok: false,
      error: "only 주문접수 orders can be deleted",
    });
  }

  await prisma.workOrder.delete({ where: { id: existing.id } });
  res.status(204).send();
});

app.post("/customers", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const {
    brandOrgId,
    name,
    code,
    manager,
    phone,
    email,
    memo,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);
  if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
    return res.status(400).json({
      ok: false,
      error: "code must be 4 uppercase letters",
    });
  }

  let brand = null;
  const brandOrgIdNum = Number(brandOrgId);
  if (Number.isFinite(brandOrgIdNum)) {
    brand = await prisma.organization.findUnique({
      where: { id: brandOrgIdNum },
    });
    if (!brand) {
      return res.status(404).json({ ok: false, error: "brand not found" });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: brand.id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    if (brand.code !== normalizedCode) {
      await prisma.organization.update({
        where: { id: brand.id },
        data: { code: normalizedCode },
      });
    }
  } else {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    brand = await prisma.organization.create({
      data: {
        name: trimmedName,
        code: normalizedCode,
        type: "BRAND",
      },
    });
  }

  if (!isBrandOrg(brand)) {
    return res.status(400).json({ ok: false, error: "invalid brand type" });
  }

  if (brand.id === organization.id) {
    return res.status(400).json({
      ok: false,
      error: "cannot link organization to itself",
    });
  }

  const relationship = await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId: organization.id,
        brandOrgId: brand.id,
      },
    },
    update: {
      customerCode: normalizedCode,
      managerName: resolveOptionalString(manager, null),
      managerPhone: resolveOptionalString(phone, null),
      managerEmail: resolveOptionalString(email, null),
      memo: resolveOptionalString(memo, null),
    },
    create: {
      manufacturerOrgId: organization.id,
      brandOrgId: brand.id,
      customerCode: normalizedCode,
      managerName: resolveOptionalString(manager, null),
      managerPhone: resolveOptionalString(phone, null),
      managerEmail: resolveOptionalString(email, null),
      memo: resolveOptionalString(memo, null),
    },
    include: { brand: true },
  });

  res.status(201).json(toCustomerResponse(relationship));
});

app.put("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const existing = await prisma.orgRelationship.findFirst({
    where: { id, manufacturerOrgId: organization.id },
    include: { brand: true },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  const { name, code, manager, phone, email, memo } = req.body ?? {};
  const normalizedCode =
    code !== undefined ? normalizeOrgCode(code) : undefined;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
  }

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: existing.brandOrgId },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  if (name !== undefined) {
    await prisma.organization.update({
      where: { id: existing.brandOrgId },
      data: { name: name.trim() },
    });
  }

  if (code !== undefined && normalizedCode) {
    await prisma.organization.update({
      where: { id: existing.brandOrgId },
      data: { code: normalizedCode },
    });
  }

  const relationshipUpdateData: any = {
    managerName: resolveOptionalString(manager, existing.managerName),
    managerPhone: resolveOptionalString(phone, existing.managerPhone),
    managerEmail: resolveOptionalString(email, existing.managerEmail),
    memo: resolveOptionalString(memo, existing.memo),
    ...(code !== undefined ? { customerCode: normalizedCode } : {}),
  };
  await prisma.orgRelationship.update({
    where: { id: existing.id },
    data: relationshipUpdateData,
  });

  const refreshed = await prisma.orgRelationship.findUnique({
    where: { id: existing.id },
    include: { brand: true },
  });

  res.json(toCustomerResponse(refreshed));
});

app.delete("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const existing = await prisma.orgRelationship.findFirst({
    where: { id, manufacturerOrgId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  await prisma.orgRelationship.delete({ where: { id: existing.id } });
  res.status(204).send();
});

app.get("/styles", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);
  const compact = req.query.compact === "1" || req.query.compact === "true";
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);
  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  const ownerScope =
    ownerOrgId === null
      ? accessibleOwnerOrgIds
      : accessibleOwnerOrgIds.includes(ownerOrgId)
        ? [ownerOrgId]
        : null;
  if (!ownerScope) {
    return res.status(403).json({ ok: false, error: "style access denied" });
  }

  const styles = await prisma.style.findMany({
    where: { orgId: { in: ownerScope } },
    orderBy: { uid: "asc" },
    ...(compact
      ? {
          // Skip heavy BOM payload for list pages that only need summary/process data.
          select: {
            orgId: true,
            styleId: true,
            styleCode: true,
            name: true,
            customer: true,
            registrationDate: true,
            designer: true,
            collection: true,
            season: true,
            imageUrls: true,
            processes: true,
            createdAt: true,
            updatedAt: true,
          },
        }
      : {}),
  });

  res.json(styles.map((style) => toStyleResponse(style, { includeProcesses })));
});

app.get("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const style = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!style) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  res.json(toStyleResponse(style, { includeProcesses }));
});

app.post("/styles", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const payload = normalizeStylePayload(req.body ?? {}, null, { includeProcesses });
  if (!payload.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  const duplicateProcess = findStyleProcessDuplicateIdentity(payload.processes);
  if (duplicateProcess) {
    return res.status(400).json({
      ok: false,
      error: createStyleProcessDuplicateError(duplicateProcess),
    });
  }
  const owner = await resolveStyleOwnerForCreateOrThrow({
    organization,
    payload: req.body ?? {},
  });
  payload.customer = owner.ownerOrgName || payload.customer;
  if (!payload.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: owner.ownerOrgId,
    customer: payload.customer,
    name: payload.name,
    styleCode: payload.styleCode,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: owner.ownerOrgId, styleId: payload.styleId },
  });
  if (existing) {
    return res
      .status(409)
      .json({ ok: false, error: "styleId already exists" });
  }

  const created = await prisma.style.create({
    data: {
      orgId: owner.ownerOrgId,
      ...payload,
    },
  });

  res.status(201).json(toStyleResponse(created, { includeProcesses }));
});

app.put("/styles/:styleId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const existing = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  const normalized = normalizeStylePayload(
    {
      id: existing.styleId,
      styleCode: req.body?.styleCode ?? existing.styleCode,
      name: req.body?.name ?? existing.name,
      customer: existing.customer,
      registrationDate: req.body?.registrationDate ?? existing.registrationDate,
      designer: req.body?.designer ?? existing.designer,
      collection: req.body?.collection ?? existing.collection,
      season: req.body?.season ?? existing.season,
      imageUrls: req.body?.imageUrls ?? existing.imageUrls,
      processes: includeProcesses
        ? req.body?.processes ?? existing.processes
        : existing.processes,
      bom: req.body?.bom ?? existing.bom,
      bomNotes: req.body?.bomNotes ?? existing.bomNotes,
    },
    existing.styleId,
    { includeProcesses: true }
  );

  if (!normalized.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!normalized.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }
  const duplicateProcess = includeProcesses
    ? findStyleProcessDuplicateIdentity(normalized.processes)
    : null;
  if (duplicateProcess) {
    return res.status(400).json({
      ok: false,
      error: createStyleProcessDuplicateError(duplicateProcess),
    });
  }

  const conflictMessage = await findStyleConflict({
    orgId: existing.orgId,
    customer: normalized.customer,
    name: normalized.name,
    styleCode: normalized.styleCode,
    excludeUid: existing.uid,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const updated = await prisma.style.update({
    where: { uid: existing.uid },
    data: {
      styleCode: normalized.styleCode,
      name: normalized.name,
      customer: normalized.customer,
      registrationDate: normalized.registrationDate,
      designer: normalized.designer,
      collection: normalized.collection,
      season: normalized.season,
      imageUrls: normalized.imageUrls,
      processes: includeProcesses
        ? normalized.processes
        : normalizeStyleProcesses(existing.processes),
      bom: normalized.bom,
      bomNotes: normalized.bomNotes,
    },
  });

  res.json(toStyleResponse(updated, { includeProcesses }));
});

app.delete("/styles/:styleId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const existing = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }
  if (existing.orgId !== organization.id) {
    return res
      .status(403)
      .json({ ok: false, error: "only owner organization can delete style" });
  }

  const inUseOrderItem = await prisma.workOrderItem.findFirst({
    where: {
      styleId,
      workOrder: {
        OR: [{ orgId: existing.orgId }, { buyerOrgId: existing.orgId }],
      },
    },
    select: {
      workOrder: { select: { orderId: true, orderNumber: true } },
    },
  });
  if (inUseOrderItem) {
    const orderLabel = inUseOrderItem.workOrder.orderNumber || inUseOrderItem.workOrder.orderId;
    return res.status(409).json({
      ok: false,
      error: `style is used by order ${orderLabel}`,
    });
  }

  try {
    await prisma.style.delete({
      where: { uid: existing.uid },
    });
    res.status(204).send();
  } catch (error) {
    // P2025 = Record to delete does not exist.
    if (getErrorCode(error) === "P2025") {
      return res.status(404).json({ ok: false, error: "style not found" });
    }
    res.status(500).json({ ok: false, error: "failed to delete style" });
  }
});

app.post("/styles/import", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const rows = Array.isArray(req.body?.styles) ? req.body.styles : [];
  if (rows.length === 0) {
    return res.status(400).json({ ok: false, error: "styles is required" });
  }

  const normalizedRows = rows
    .map((item: any, rowIndex: number) => ({
      rowIndex,
      raw: item,
      normalized: normalizeStylePayload(item, null, { includeProcesses }),
    }))
    .filter((item: any) => {
      if (!item.normalized?.name) return false;
      if (item.normalized?.customer) return true;
      const customerOrgId = toPositiveIntOrNull(
        item.raw?.customerOrgId ?? item.raw?.buyerOrgId ?? item.raw?.customerId
      );
      return customerOrgId !== null;
    });

  if (normalizedRows.length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "no valid styles to import" });
  }
  for (const item of normalizedRows) {
    const duplicateProcess = findStyleProcessDuplicateIdentity(
      item.normalized.processes
    );
    if (duplicateProcess) {
      return res.status(400).json({
        ok: false,
        error: createStyleProcessDuplicateError(
          duplicateProcess,
          `styles[${item.rowIndex}].processes`
        ),
      });
    }
  }

  const rowsWithOwner = await Promise.all(
    normalizedRows.map(async (item: any) => {
      const owner = await resolveStyleOwnerForCreateOrThrow({
        organization,
        payload: item.raw ?? item.normalized,
      });
      return {
        ...item.normalized,
        customer: owner.ownerOrgName || item.normalized.customer,
        ownerOrgId: owner.ownerOrgId,
      };
    })
  );

  const seenNameKeys = new Set();
  const seenCodeKeys = new Set();
  for (const item of rowsWithOwner) {
    const nameKey = `${item.ownerOrgId}:${toStyleIdentityKey(item.customer, item.name)}`;
    if (seenNameKeys.has(nameKey)) {
      return res.status(409).json({
        ok: false,
        error: "style name already exists for this customer",
      });
    }
    seenNameKeys.add(nameKey);

    const codeKey = `${item.ownerOrgId}:${toStyleIdentityKey(
      item.customer,
      item.styleCode
    )}`;
    if (seenCodeKeys.has(codeKey)) {
      return res.status(409).json({
        ok: false,
        error: "style code already exists for this customer",
      });
    }
    seenCodeKeys.add(codeKey);
  }

  const uniqueOwnerOrgIds = Array.from(
    new Set(rowsWithOwner.map((item: any) => item.ownerOrgId))
  );
  const uniqueStyleIds = Array.from(
    new Set(rowsWithOwner.map((item: any) => item.styleId))
  );
  const existingStyleRows = await prisma.style.findMany({
    where: {
      orgId: { in: uniqueOwnerOrgIds },
      styleId: { in: uniqueStyleIds },
    },
    select: { uid: true, styleId: true, orgId: true },
  });
  const existingStyleUidByOwnerStyle = new Map(
    existingStyleRows.map((row) => [`${row.orgId}:${row.styleId}`, row.uid])
  );

  for (const item of rowsWithOwner) {
    const conflictMessage = await findStyleConflict({
      orgId: item.ownerOrgId,
      customer: item.customer,
      name: item.name,
      styleCode: item.styleCode,
      excludeUid:
        existingStyleUidByOwnerStyle.get(`${item.ownerOrgId}:${item.styleId}`) ??
        null,
    });
    if (conflictMessage) {
      return res.status(409).json({ ok: false, error: conflictMessage });
    }
  }

  await prisma.$transaction(
    rowsWithOwner.map((item: any) => {
      const { ownerOrgId, ...stylePayload } = item;
      return prisma.style.upsert({
        where: {
          orgId_styleId: {
            orgId: ownerOrgId,
            styleId: stylePayload.styleId,
          },
        },
        update: {
          styleCode: stylePayload.styleCode,
          name: stylePayload.name,
          customer: stylePayload.customer,
          registrationDate: stylePayload.registrationDate,
          designer: stylePayload.designer,
          collection: stylePayload.collection,
          season: stylePayload.season,
          imageUrls: stylePayload.imageUrls,
          processes: stylePayload.processes,
          bom: stylePayload.bom,
          bomNotes: stylePayload.bomNotes,
        },
        create: {
          orgId: ownerOrgId,
          ...stylePayload,
        },
      });
    })
  );

  const imported = await prisma.style.findMany({
    where: { orgId: { in: uniqueOwnerOrgIds } },
    orderBy: { uid: "asc" },
  });

  res.status(201).json(imported.map((style) => toStyleResponse(style, { includeProcesses })));
});

app.get("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);
  await seedAttributesIfEmpty(organization.id);

  const [colors, categories, roles, processes] = await Promise.all([
    prisma.attrColor.findMany({
      where: { orgId: organization.id },
      orderBy: { id: "asc" },
    }),
    prisma.attrCategory.findMany({
      where: { orgId: organization.id },
      orderBy: { id: "asc" },
    }),
    ensureDefaultEmployeeRoles(organization.id).then((items) =>
      items.filter((item) => isWorkerEmployeeRoleCode(item.code)).map(toAttrRoleResponse)
    ),
    includeProcesses
      ? prisma.attrProcess.findMany({
          where: { orgId: organization.id },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);

  res.json({
    colors,
    categories,
    roles,
    processes,
    canManageProcesses: includeProcesses,
  });
});

app.post("/attributes/colors", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const name = resolveOptionalString(req.body?.name, null);
  const code = resolveOptionalString(req.body?.code, null);
  if (!name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const existingCodes = await prisma.attrColor.findMany({
    where: { orgId: organization.id },
    select: { code: true },
  });
  const usedCodes = existingCodes.reduce((set: Set<string>, item) => {
    const trackedCode = normalizeManagedAttributeCode(item.code);
    if (trackedCode) {
      set.add(trackedCode);
    }
    return set;
  }, new Set<string>());

  const nextCode = resolveColorAttributeCode({ code, name, usedCodes });
  const created = await prisma.attrColor.create({
    data: {
      orgId: organization.id,
      code: nextCode,
      name,
    },
  });

  res.status(201).json(created);
});

app.put("/attributes", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);
  const payload = req.body ?? {};

  const tasks = [];
  const response: {
    colors?: any[];
    categories?: any[];
    roles?: any[];
    processes?: any[];
  } = {};

  if (payload.colors) {
    tasks.push(
      syncSection(prisma.attrColor, organization.id, payload.colors, {
        resolveCode: resolveColorAttributeCode,
        trackCode: normalizeManagedAttributeCode,
      }).then((data) => {
        response.colors = data;
      })
    );
  }
  if (payload.categories) {
    tasks.push(
      syncSection(prisma.attrCategory, organization.id, payload.categories).then(
        (data) => {
          response.categories = data;
        }
      )
    );
  }
  if (payload.roles) {
    tasks.push(
      syncRoleSection(organization.id, payload.roles).then((data) => {
        response.roles = data;
      })
    );
  }
  if (payload.processes) {
    if (!includeProcesses) {
      return res.status(403).json({
        ok: false,
        error: "brand organizations cannot manage processes",
      });
    }
    tasks.push(
      syncSection(prisma.attrProcess, organization.id, payload.processes).then(
        (data) => {
          response.processes = data;
        }
      )
    );
  }

  await Promise.all(tasks);

  res.json(response);
});

app.post("/at-sync/run-now", async (req, res) => {
  const access = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!access) return;

  const mode = String(req.body?.mode ?? "")
    .trim()
    .toLowerCase();
  const explicitTrainingMonthKey = normalizeMonthKey(req.body?.trainingMonthKey);
  const hasTrainingMonthField = req.body?.trainingMonthKey !== undefined;

  if (hasTrainingMonthField && !explicitTrainingMonthKey) {
    return res.status(400).json({
      ok: false,
      error: "trainingMonthKey must be YYYY-MM",
    });
  }

  if (
    mode &&
    mode !== "auto" &&
    mode !== "current" &&
    mode !== "previous"
  ) {
    return res.status(400).json({
      ok: false,
      error: "mode must be one of: auto, current, previous",
    });
  }

  const todayKey = toDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
  const currentMonthKey = normalizeMonthKey(todayKey.slice(0, 7));
  const previousMonthKey = currentMonthKey ? shiftMonthKey(currentMonthKey, -1) : "";

  const overrideTrainingMonthKey =
    explicitTrainingMonthKey ||
    (mode === "current" ? currentMonthKey : "") ||
    (mode === "previous" ? previousMonthKey : "") ||
    "";

  const resolvedTrainingMonthKey = resolveAtSyncTrainingMonthKey({
    trainingMonthKey: overrideTrainingMonthKey,
  });
  const startedAt = Date.now();
  const result = await syncStyleProcessActualTimesFromWorkRecords(access.organization.id, {
    trainingMonthKey: overrideTrainingMonthKey,
  });

  return res.json({
    ok: true,
    orgId: access.organization.id,
    mode: mode || (overrideTrainingMonthKey ? "override" : "auto"),
    trainingMonthKey: resolvedTrainingMonthKey,
    updatedStyles: Number(result?.updatedStyles || 0),
    updatedProcesses: Number(result?.updatedProcesses || 0),
    durationMs: Date.now() - startedAt,
  });
});

// ─── Payroll ───────────────────────────────────────────────────────────────

app.use(payrollRouter);

// ───────────────────────────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const errorRecord = toErrorRecord(error);
  const prismaErrorCode = getErrorCode(error);
  const prismaMeta =
    errorRecord && typeof errorRecord.meta === "object" && errorRecord.meta !== null
      ? (errorRecord.meta as Record<string, unknown>)
      : null;
  const prismaErrorTargetRaw = prismaMeta?.target;
  const prismaErrorTarget = Array.isArray(prismaErrorTargetRaw)
    ? prismaErrorTargetRaw.map((item) => String(item))
    : [String(prismaErrorTargetRaw || "")];
  const hasCompositeTargetFields =
    prismaErrorTarget.includes("orgId") &&
    prismaErrorTarget.includes("customerId") &&
    prismaErrorTarget.includes("orderNumber");
  const hasSharedOrderTargetFields =
    prismaErrorTarget.includes("buyerOrgId") &&
    prismaErrorTarget.includes("sellerOrgId") &&
    prismaErrorTarget.includes("orderNumber");
  const hasAttributeCodeTargetFields =
    prismaErrorTarget.includes("orgId") &&
    prismaErrorTarget.includes("code");
  const isOrderNumberByPairUniqueError =
    prismaErrorCode === "P2002" &&
    (hasSharedOrderTargetFields ||
      prismaErrorTarget.some((item) =>
        /WorkOrder_.*buyerOrgId.*sellerOrgId.*orderNumber.*_key/i.test(item)
      ));
  if (isOrderNumberByPairUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "order already exists for this buyer/seller pair",
    });
  }
  const isOrderNumberByCustomerUniqueError =
    prismaErrorCode === "P2002" &&
    (hasCompositeTargetFields ||
      prismaErrorTarget.some((item) =>
        /WorkOrder_orgId_customerId_orderNumber_key/i.test(item)
      ));
  if (isOrderNumberByCustomerUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "order number already exists for this customer",
    });
  }
  const isAttributeCodeUniqueError =
    prismaErrorCode === "P2002" &&
    (hasAttributeCodeTargetFields ||
      prismaErrorTarget.some((item) =>
        /Attr(Color|Category|Role|Process)_orgId_code_key/i.test(item)
      ));
  if (isAttributeCodeUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "attribute code already exists in this organization",
    });
  }

  const status = getErrorStatus(error);
  if (status !== null) {
    return res.status(status).json({
      ok: false,
      error: getErrorMessage(error, "request failed"),
    });
  }
  console.error(error);
  return res.status(500).json({ ok: false, error: "internal server error" });
});

const port = process.env.PORT || 4000;
const AT_AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const AT_AUTO_SYNC_DB_LOCK_NAMESPACE = 20260223;
const AT_AUTO_SYNC_DB_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const AT_AUTO_SYNC_JOB_KEY = "AT_SYNC";
let atAutoSyncTimer: NodeJS.Timeout | null = null;
let atAutoSyncInProgress = false;
let atAutoSyncLastTrainingMonthKey: string | null = null;
let atAutoSyncRunHistoryTableReady = false;
let atAutoSyncRunHistoryTableUnsupported = false;

type AutoAtSyncSummary = {
  manufacturerCount: number;
  totalUpdatedStyles: number;
  totalUpdatedProcesses: number;
};

type AutoAtSyncExecutionResult = {
  executed: boolean;
  reason: "done" | "already_completed" | "locked_by_other_instance";
  summary: AutoAtSyncSummary;
};

const ensureAtAutoSyncRunHistoryTable = async () => {
  if (atAutoSyncRunHistoryTableReady) return true;
  if (atAutoSyncRunHistoryTableUnsupported) return false;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SchedulerRunHistory" (
        "jobKey" TEXT NOT NULL,
        "monthKey" TEXT NOT NULL,
        "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("jobKey", "monthKey")
      )
    `);
    atAutoSyncRunHistoryTableReady = true;
    return true;
  } catch (error: unknown) {
    atAutoSyncRunHistoryTableUnsupported = true;
    console.warn(
      `[AT sync][scheduler] db run-history disabled: ${getErrorMessage(error, String(error))}`
    );
    return false;
  }
};

const toAtAutoSyncLockKey = (trainingMonthKey: string) => {
  const normalized = String(trainingMonthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return year * 100 + month;
};

const runAutoAtSyncAcrossManufacturers = async (): Promise<AutoAtSyncSummary> => {
  const manufacturerRows = await prisma.organization.findMany({
    where: { type: "MANUFACTURER" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let totalUpdatedStyles = 0;
  let totalUpdatedProcesses = 0;
  for (const row of manufacturerRows) {
    const result = await syncStyleProcessActualTimesFromWorkRecords(row.id);
    totalUpdatedStyles += Number(result?.updatedStyles || 0);
    totalUpdatedProcesses += Number(result?.updatedProcesses || 0);
  }

  return {
    manufacturerCount: manufacturerRows.length,
    totalUpdatedStyles,
    totalUpdatedProcesses,
  };
};

const runAutoAtSyncWithDbLock = async (
  trainingMonthKey: string
): Promise<AutoAtSyncExecutionResult> => {
  const lockKey = toAtAutoSyncLockKey(trainingMonthKey);
  if (lockKey === null) {
    const summary = await runAutoAtSyncAcrossManufacturers();
    return { executed: true, reason: "done", summary };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(CAST(${AT_AUTO_SYNC_DB_LOCK_NAMESPACE} AS integer), CAST(${lockKey} AS integer)) AS acquired`
      );
      if (lockRows[0]?.acquired !== true) {
        return {
          executed: false,
          reason: "locked_by_other_instance" as const,
          summary: {
            manufacturerCount: 0,
            totalUpdatedStyles: 0,
            totalUpdatedProcesses: 0,
          },
        };
      }

      const completedRows = await tx.$queryRaw<Array<{ completed: boolean }>>(
        Prisma.sql`SELECT TRUE AS completed FROM "SchedulerRunHistory" WHERE "jobKey" = ${AT_AUTO_SYNC_JOB_KEY} AND "monthKey" = ${trainingMonthKey} LIMIT 1`
      );
      if (completedRows[0]?.completed === true) {
        return {
          executed: false,
          reason: "already_completed" as const,
          summary: {
            manufacturerCount: 0,
            totalUpdatedStyles: 0,
            totalUpdatedProcesses: 0,
          },
        };
      }

      const summary = await runAutoAtSyncAcrossManufacturers();
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "SchedulerRunHistory" ("jobKey", "monthKey", "completedAt") VALUES (${AT_AUTO_SYNC_JOB_KEY}, ${trainingMonthKey}, NOW()) ON CONFLICT ("jobKey", "monthKey") DO NOTHING`
      );

      return { executed: true, reason: "done" as const, summary };
    },
    { timeout: AT_AUTO_SYNC_DB_LOCK_TIMEOUT_MS }
  );

  return result;
};

const runAutoAtSyncIfDue = async (trigger: "startup" | "interval") => {
  if (atAutoSyncInProgress) return;

  const now = new Date();
  const todayKey = toDateKeyInTimeZone(now, BUSINESS_TIME_ZONE);
  const todayParts = todayKey ? parseDateKeyParts(todayKey) : null;
  if (!todayParts) return;
  if (todayParts.day < AT_TRAINING_CUTOFF_DAY) return;

  const trainingMonthKey = resolveAtTrainingMonthKey({
    now,
    timeZone: BUSINESS_TIME_ZONE,
    cutoffDay: AT_TRAINING_CUTOFF_DAY,
  });
  if (!trainingMonthKey) return;
  if (atAutoSyncLastTrainingMonthKey === trainingMonthKey) return;

  atAutoSyncInProgress = true;
  try {
    const canUseDbLock = await ensureAtAutoSyncRunHistoryTable();
    if (!canUseDbLock) {
      const summary = await runAutoAtSyncAcrossManufacturers();
      atAutoSyncLastTrainingMonthKey = trainingMonthKey;
      console.log(
        `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} mode=in_memory manufacturers=${summary.manufacturerCount} updatedStyles=${summary.totalUpdatedStyles} updatedProcesses=${summary.totalUpdatedProcesses}`
      );
      return;
    }

    const result = await runAutoAtSyncWithDbLock(trainingMonthKey);
    if (!result.executed) {
      if (result.reason === "already_completed") {
        atAutoSyncLastTrainingMonthKey = trainingMonthKey;
      }
      console.log(
        `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} skipped=${result.reason}`
      );
      return;
    }

    atAutoSyncLastTrainingMonthKey = trainingMonthKey;
    console.log(
      `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} mode=db_lock manufacturers=${result.summary.manufacturerCount} updatedStyles=${result.summary.totalUpdatedStyles} updatedProcesses=${result.summary.totalUpdatedProcesses}`
    );
  } catch (error: unknown) {
    console.error(
      `[AT sync][scheduler:${trigger}] failed:`,
      getErrorMessage(error, String(error))
    );
  } finally {
    atAutoSyncInProgress = false;
  }
};

const startAutoAtSyncScheduler = () => {
  if (atAutoSyncTimer) return;
  runAutoAtSyncIfDue("startup").catch((error: unknown) => {
    console.error(
      "[AT sync][scheduler:startup] failed:",
      getErrorMessage(error, String(error))
    );
  });
  atAutoSyncTimer = setInterval(() => {
    runAutoAtSyncIfDue("interval").catch((error: unknown) => {
      console.error(
        "[AT sync][scheduler:interval] failed:",
        getErrorMessage(error, String(error))
      );
    });
  }, AT_AUTO_SYNC_INTERVAL_MS);
  if (typeof atAutoSyncTimer.unref === "function") {
    atAutoSyncTimer.unref();
  }
};

const resolveDatabaseEndpoint = (): string => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}:${parsed.port || "5432"}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
};

const ensureDatabaseReady = async () => {
  const endpoint = resolveDatabaseEndpoint();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= STARTUP_DB_MAX_RETRIES; attempt += 1) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= STARTUP_DB_MAX_RETRIES;
      const message = getErrorMessage(error, "unknown startup DB error");
      if (isLastAttempt) break;
      console.warn(
        `[startup] DB connect attempt ${attempt}/${STARTUP_DB_MAX_RETRIES} failed (${endpoint}): ${message}. Retrying in ${STARTUP_DB_RETRY_DELAY_MS}ms.`
      );
      await wait(STARTUP_DB_RETRY_DELAY_MS);
    }
  }

  throw lastError;
};

const startServer = async () => {
  await ensureDatabaseReady();
  await ensureHardcodedSystemAdmin();
  await ensureAtAutoSyncRunHistoryTable();
  startAutoAtSyncScheduler();
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error(
      `[startup] Unable to connect to database at ${resolveDatabaseEndpoint()}. Check DATABASE_URL/network access and retry.`
    );
  }
  console.error("failed to start API server", error);
  process.exit(1);
});

