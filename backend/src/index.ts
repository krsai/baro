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
  getSystemAdminContactEmail,
  getOrganizationByQuery,
  getRequestedOrgIdText,
  getRequesterEmail,
  requireOrgRole,
  requireSystemAdmin,
} from "./middleware/access";
import { payrollRouter } from "./payroll/payroll.routes";
import { quantitySettlementRouter } from "./quantity-settlement/quantitySettlement.routes";
import {
  getCurrentRequestActor,
  runWithRequestActor,
} from "./requestActor";
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
const JSON_BODY_LIMIT =
  String(process.env.JSON_BODY_LIMIT || "10mb").trim() || "10mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use((req, _res, next) =>
  runWithRequestActor(getRequesterEmail(req), () => next())
);

const WORK_LOG_RECORD_INCLUDE = {
  orderBy: { id: "asc" as const },
  include: {
    process: {
      select: {
        id: true,
        code: true,
        name: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
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
const WORK_LOG_DETAIL_RECORD_SELECT = {
  orderBy: { id: "asc" as const },
  select: {
    workerId: true,
    workerName: true,
    customerName: true,
    orderNo: true,
    lineId: true,
    styleUid: true,
    styleId: true,
    styleName: true,
    processId: true,
    processCode: true,
    colorId: true,
    colorCode: true,
    assignmentPlanId: true,
    ctSeconds: true,
    quantity: true,
    process: {
      select: {
        id: true,
        code: true,
        name: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
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
  if (!hasField("WorkRecord", "orderNo")) {
    staleSignals.push("WorkRecord.orderNo missing");
  }
  if (!hasField("WorkRecord", "lineId")) {
    staleSignals.push("WorkRecord.lineId missing");
  }
  if (!hasField("Organization", "assignmentCards")) {
    staleSignals.push("Organization.assignmentCards missing");
  }
  if (!hasField("AssignmentCard", "payload")) {
    staleSignals.push("AssignmentCard.payload missing");
  }
  if (!modelByName.has("OrganizationHoliday")) {
    staleSignals.push("OrganizationHoliday model missing");
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
  "EDITING",
  "ORDER_RECEIVED",
  "IN_PROGRESS",
  "PRODUCTION_DONE",
  "SHIPPED",
  "SETTLED",
]);
const WORK_ORDER_CONFIRMATION_STATUS_CODES = new Set([
  "PLANNED",
  "CONFIRMED",
]);
const AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES = new Set([
  "EDITING",
  "ORDER_RECEIVED",
  "IN_PROGRESS",
]);
let supportsWorkOrderEditingStatus = false;
const resolveUnlockedWorkOrderStatus = (): "EDITING" | "ORDER_RECEIVED" =>
  supportsWorkOrderEditingStatus ? "EDITING" : "ORDER_RECEIVED";
const ORDER_MODIFICATION_LOCK_ERROR =
  "order modification is locked";
const ORDER_MODIFICATION_LOCK_STATE_CHANGE_ERROR =
  "order modification lock cannot be changed";
const ORDER_MODIFICATION_UNLOCK_ASSIGNMENT_RELEASE_REQUIRED_ERROR =
  "order unlock requires assignment release";
const ORDER_MODIFICATION_UNLOCK_PAST_ASSIGNMENT_CONFIRMATION_REQUIRED_ERROR =
  "order unlock requires past assignment release confirmation";
const WORK_ORDER_STATUS_LEGACY_CODE_MAP = new Map<string, string>([
  ["수정", "EDITING"],
  ["주문접수", "ORDER_RECEIVED"],
  ["접수", "ORDER_RECEIVED"],
  ["작업중", "IN_PROGRESS"],
  ["제작", "IN_PROGRESS"],
  ["생산", "IN_PROGRESS"],
  ["완료", "PRODUCTION_DONE"],
  ["생산완료", "PRODUCTION_DONE"],
  ["출고완료", "SHIPPED"],
  ["출고", "SHIPPED"],
  ["정산완료", "SETTLED"],
  ["정산", "SETTLED"],
]);
const DEFAULT_EMPLOYEE_ROLE_CODE_SEWING = "WORKER_SEWING";
const DEFAULT_EMPLOYEE_ROLES = [
  {
    code: "WORKER_SUPERVISOR",
    name: "감독",
    defaultPayType: "CT",
    sortOrder: 1,
  },
  {
    code: "WORKER_CUTTING",
    name: "재단",
    defaultPayType: "CT",
    sortOrder: 2,
  },
  {
    code: DEFAULT_EMPLOYEE_ROLE_CODE_SEWING,
    name: "봉제",
    defaultPayType: "CT",
    sortOrder: 3,
  },
  {
    code: "WORKER_IRONING",
    name: "다림",
    defaultPayType: "CT",
    sortOrder: 4,
  },
  {
    code: "WORKER_INSPECTION",
    name: "검수",
    defaultPayType: "CT",
    sortOrder: 5,
  },
  {
    code: "WORKER_PACKING",
    name: "포장",
    defaultPayType: "CT",
    sortOrder: 6,
  },
  {
    code: "WORKER_OTHER",
    name: "기타",
    defaultPayType: "CT",
    sortOrder: 7,
  },
] as const;
const DEFAULT_EMPLOYEE_ROLE_CODES = new Set<string>(
  DEFAULT_EMPLOYEE_ROLES.map((role) => role.code)
);

const DEFAULT_ATTRIBUTES = {
  colors: [] as { code: string; name: string }[],
  categories: [
    {
      code: "01-CHEF",
      name: "Chef Uniform",
      nameKo: "쉐프복",
      nameEn: "Chef Uniform",
      nameVi: "Đồng phục đầu bếp",
    },
    {
      code: "02-APRON",
      name: "Apron",
      nameKo: "앞치마",
      nameEn: "Apron",
      nameVi: "Tạp dề",
    },
    {
      code: "03-WINDBREAKER",
      name: "Windbreaker",
      nameKo: "바람막이",
      nameEn: "Windbreaker",
      nameVi: "Áo khoác gió",
    },
    {
      code: "04-SS-TSHIRT",
      name: "Short Sleeve T-Shirt",
      nameKo: "반팔 티셔츠",
      nameEn: "Short Sleeve T-Shirt",
      nameVi: "Áo thun ngắn tay",
    },
    {
      code: "05-LS-TSHIRT",
      name: "Long Sleeve T-Shirt",
      nameKo: "긴팔 티셔츠",
      nameEn: "Long Sleeve T-Shirt",
      nameVi: "Áo thun dài tay",
    },
    {
      code: "06-SCRUB",
      name: "Scrub",
      nameKo: "스크럽",
      nameEn: "Scrub",
      nameVi: "Đồng phục scrub",
    },
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
    | "EDITING"
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED"
    | "SETTLED" = "EDITING"
): "EDITING" | "ORDER_RECEIVED" | "IN_PROGRESS" | "PRODUCTION_DONE" | "SHIPPED" | "SETTLED" => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, "").trim();
  if (!normalized) return fallback;
  const upper = normalized.toUpperCase();
  if (WORK_ORDER_STATUS_CODES.has(upper)) {
    return upper as
      | "EDITING"
      | "ORDER_RECEIVED"
      | "IN_PROGRESS"
      | "PRODUCTION_DONE"
      | "SHIPPED"
      | "SETTLED";
  }
  return (WORK_ORDER_STATUS_LEGACY_CODE_MAP.get(normalized) ??
    fallback) as
    | "EDITING"
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED"
    | "SETTLED";
};
const resolveDefaultWorkOrderStatusForLockState = (
  isLocked: boolean
): "EDITING" | "ORDER_RECEIVED" =>
  isLocked ? "ORDER_RECEIVED" : resolveUnlockedWorkOrderStatus();
const resolveCanonicalWorkOrderStatusForLockState = ({
  status,
  isManualLocked,
}: {
  status: unknown;
  isManualLocked: boolean;
}):
  | "EDITING"
  | "ORDER_RECEIVED"
  | "IN_PROGRESS"
  | "PRODUCTION_DONE"
  | "SHIPPED"
  | "SETTLED" => {
  const rawStatus = resolveWorkOrderStatus(
    status,
    resolveDefaultWorkOrderStatusForLockState(isManualLocked)
  );
  if (!AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES.has(rawStatus)) {
    return rawStatus;
  }
  if (!isManualLocked) {
    return resolveUnlockedWorkOrderStatus();
  }
  if (rawStatus === "EDITING") {
    return "ORDER_RECEIVED";
  }
  return rawStatus;
};
const resolveWorkOrderConfirmationStatus = (
  value: unknown,
  fallback: "PLANNED" | "CONFIRMED" = "PLANNED"
): "PLANNED" | "CONFIRMED" => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, "").trim().toUpperCase();
  if (!normalized) return fallback;
  if (WORK_ORDER_CONFIRMATION_STATUS_CODES.has(normalized)) {
    return normalized as "PLANNED" | "CONFIRMED";
  }
  return fallback;
};
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
const AT_AUTO_SYNC_ENABLED = false;
const DEFAULT_TIME_REF_QUANTITY = 1000;
const DEFAULT_ST_BUCKET_QUANTITY = 1;
const ST_STANDARD_BUCKETS = Object.freeze([
  DEFAULT_ST_BUCKET_QUANTITY,
  3,
  5,
  10,
  30,
  50,
  100,
  300,
  500,
  1000,
  3000,
  5000,
  10000,
]);
// 출퇴근 입력값을 AT 계산에 반영한다.
// 출퇴근 기록이 있는 봉제 작업자(재직자)의 실제 근로시간만 AT 집계에 사용한다.
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
const STARTUP_BOOTSTRAP_RETRY_DELAY_MS = toPositiveInt(
  process.env.STARTUP_BOOTSTRAP_RETRY_DELAY_MS,
  5000
);
const ROLE_OPTIONS = new Set(["ADMIN", "OPERATOR", "ACCOUNTANT", "WORKER"]);
const ORG_ACCESS_ROLES: OrgUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "ACCOUNTANT",
  "WORKER",
];
const ORG_MANAGEMENT_ROLES: OrgUserRole[] = ORG_ACCESS_ROLES;
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
const GRACE_DAYS = 30;
const SUBSCRIPTION_NULL_DATE_CUTOFF_MS = Date.UTC(1971, 0, 1);
const ORGANIZATION_TYPE_KEYS = {
  MANUFACTURER: "MANUFACTURER",
  BRAND: "BRAND",
} as const;
type OrganizationTypeKey =
  (typeof ORGANIZATION_TYPE_KEYS)[keyof typeof ORGANIZATION_TYPE_KEYS];

const ONBOARDING_ORGANIZATION_TYPE_OPTIONS = new Set<OrganizationTypeKey>(
  Object.values(ORGANIZATION_TYPE_KEYS)
);
const ONBOARDING_ORGANIZATION_TYPE_TOKENS: Record<string, OrganizationTypeKey> = {
  manufacturer: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  factory: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "공장": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "수주자": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "테스트수주자": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  brand: ORGANIZATION_TYPE_KEYS.BRAND,
  "브랜드": ORGANIZATION_TYPE_KEYS.BRAND,
  "발주자": ORGANIZATION_TYPE_KEYS.BRAND,
  "테스트발주자": ORGANIZATION_TYPE_KEYS.BRAND,
};
const ONBOARDING_COUNTRY_OPTIONS = new Set(["KR", "VN"]);
const ONBOARDING_COMPANY_NAME_MIN_LENGTH = 2;
const ONBOARDING_COMPANY_NAME_MAX_LENGTH = 120;
const ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH = 240;
const ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH = 80;
const ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH = 40;
const ONBOARDING_KR_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{3}-\d{2}-\d{5})$/;
const ONBOARDING_VN_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{13}|\d{10}-\d{3})$/;
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
const resolveCustomerPerspective = (
  org: { type?: string | null } | null | undefined
): "MANUFACTURER" | "BRAND" | null => {
  if (isManufacturerOrg(org)) return "MANUFACTURER";
  if (isBrandOrg(org)) return "BRAND";
  return null;
};
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const normalizeSubscriptionDateOrNull = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime() < SUBSCRIPTION_NULL_DATE_CUTOFF_MS ? null : date;
};

const buildSubscriptionResponse = (subscription: any) => {
  if (!subscription || typeof subscription !== "object") return null;
  const trialStartedAt = normalizeSubscriptionDateOrNull(subscription.trialStartedAt);
  const trialEndsAt = normalizeSubscriptionDateOrNull(subscription.trialEndsAt);
  const activatedAt = normalizeSubscriptionDateOrNull(subscription.activatedAt);
  const activeEndsAt = normalizeSubscriptionDateOrNull(subscription.activeEndsAt);
  const suspendedAt = normalizeSubscriptionDateOrNull(subscription.suspendedAt);
  const graceEndsAt = activeEndsAt ? addDays(new Date(activeEndsAt), GRACE_DAYS) : null;
  return {
    id: subscription.id,
    status: subscription.status,
    serviceContactEmail: subscription.membershipEmail ?? null,
    membershipEmail: subscription.membershipEmail ?? null,
    billingEmail: subscription.billingEmail ?? null,
    trialStartedAt,
    trialEndsAt,
    activatedAt,
    activeEndsAt,
    graceEndsAt,
    suspendedAt,
    updatedAt: subscription.updatedAt ?? null,
    createdAt: subscription.createdAt ?? null,
  };
};

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
  const rawDate = new Date(value as any);
  if (Number.isNaN(rawDate.getTime())) {
    return { error: `${fieldName} is invalid` };
  }
  const date = normalizeSubscriptionDateOrNull(value);
  return { value: date };
};

const toOrganizationResponse = (organization: any) => {
  if (!organization) return organization;
  const { subscription, ...rest } = organization;
  return {
    ...rest,
    subscription: buildSubscriptionResponse(subscription),
  };
};

const hasSubscriptionPayload = (payload: any = {}) =>
  payload.subscriptionStatus !== undefined ||
  payload.status !== undefined ||
  payload.serviceContactEmail !== undefined ||
  payload.membershipEmail !== undefined ||
  payload.billingEmail !== undefined ||
  payload.trialStartedAt !== undefined ||
  payload.trialEndsAt !== undefined ||
  payload.activeEndsAt !== undefined;

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

  const serviceContactEmailInput =
    payload.serviceContactEmail !== undefined
      ? payload.serviceContactEmail
      : payload.membershipEmail;

  const serviceContactEmailResolved = normalizeSubscriptionEmailInput(
    serviceContactEmailInput,
    "serviceContactEmail",
    current.membershipEmail ?? null
  );
  if (serviceContactEmailResolved.error) {
    throw createHttpError(400, serviceContactEmailResolved.error);
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
  const activeEndsAtResolved = normalizeDateInput(
    payload.activeEndsAt,
    "activeEndsAt",
    current.activeEndsAt
  );
  if (activeEndsAtResolved.error) {
    throw createHttpError(400, activeEndsAtResolved.error);
  }

  const now = new Date();
  let serviceContactEmail = serviceContactEmailResolved.value;
  let billingEmail = billingEmailResolved.value;
  let trialStartedAt = trialStartedAtResolved.value;
  let trialEndsAt = trialEndsAtResolved.value;
  let activatedAt = current.activatedAt;
  let activeEndsAt = activeEndsAtResolved.value;
  let suspendedAt = current.suspendedAt;

  if (nextStatus === "TRIAL") {
    if (!trialStartedAt) {
      trialStartedAt = now;
    }
    if (!trialEndsAt) {
      trialEndsAt = addDays(trialStartedAt, TRIAL_DAYS);
    }
    activeEndsAt = null;
    suspendedAt = null;
  }

  if (nextStatus === "ACTIVE") {
    if (!serviceContactEmail || !billingEmail) {
      throw createHttpError(
        400,
        "serviceContactEmail and billingEmail are required for ACTIVE"
      );
    }
    if (!activatedAt) {
      activatedAt = now;
    }
    if (rawStatus !== undefined && current.status !== "ACTIVE" && payload.activeEndsAt === undefined) {
      activeEndsAt = null;
    }
    suspendedAt = null;
  }

  if (nextStatus === "GRACE") {
    if (!activeEndsAt) {
      activeEndsAt = current.activeEndsAt ?? now;
    }
    suspendedAt = null;
  }

  if (nextStatus === "SUSPENDED") {
    suspendedAt = now;
  } else if (nextStatus === "NOT_SUBSCRIBED") {
    suspendedAt = null;
    activeEndsAt = null;
  } else if (rawStatus !== undefined) {
    suspendedAt = null;
  }

  const updateData: any = {
    status: nextStatus,
    activatedAt,
    activeEndsAt,
    suspendedAt,
    ...(serviceContactEmail !== undefined
      ? { membershipEmail: serviceContactEmail }
      : {}),
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

const combineOrganizationPhone = (countryCode: unknown, phoneNumber: unknown) => {
  const normalizedCountryCode = resolveOptionalString(countryCode, null);
  const normalizedPhoneNumber = resolveOptionalString(phoneNumber, null);
  return [normalizedCountryCode, normalizedPhoneNumber].filter(Boolean).join(" ");
};

const buildSharedCustomerOrganizationData = (
  payload: any = {},
  fallbackOrganization: any = null
) => {
  return {
    code:
      payload?.code !== undefined
        ? normalizeOrgCode(payload.code)
        : normalizeOrgCode(fallbackOrganization?.code),
    name:
      payload?.name !== undefined
        ? resolveOptionalString(payload.name, null)
        : resolveOptionalString(fallbackOrganization?.name, null),
    address:
      payload?.address !== undefined
        ? resolveOptionalString(payload.address, null)
        : resolveOptionalString(fallbackOrganization?.address, null),
    country:
      payload?.country !== undefined
        ? resolveOptionalString(payload.country, null)
        : resolveOptionalString((fallbackOrganization as any)?.country, null),
    countryCode:
      payload?.countryCode !== undefined
        ? resolveOptionalString(payload.countryCode, null)
        : resolveOptionalString((fallbackOrganization as any)?.countryCode, null),
    phone:
      payload?.phoneNumber !== undefined || payload?.phone !== undefined
        ? resolveOptionalString(payload.phoneNumber ?? payload.phone, null)
        : resolveOptionalString(fallbackOrganization?.phone, null),
    representative:
      payload?.manager !== undefined || payload?.representative !== undefined
        ? resolveOptionalString(payload.manager ?? payload.representative, null)
        : resolveOptionalString(fallbackOrganization?.representative, null),
    email:
      payload?.email !== undefined
        ? resolveOptionalString(payload.email, null)
        : resolveOptionalString(fallbackOrganization?.email, null),
  };
};

const toCustomerResponse = (relationship: any, perspective: string = "MANUFACTURER") => {
  const targetOrg =
    perspective === "BRAND" ? relationship.manufacturer ?? {} : relationship.brand ?? {};
  const targetCode = targetOrg.code ?? relationship.customerCode ?? "";
  const phone = combineOrganizationPhone(
    (targetOrg as any)?.countryCode ?? null,
    targetOrg.phone ?? relationship.managerPhone ?? null
  );
  return {
    id: relationship.id,
    brandOrgId: relationship.brandOrgId,
    manufacturerOrgId: relationship.manufacturerOrgId,
    code: targetCode,
    name: targetOrg.name ?? "",
    address: targetOrg.address ?? "",
    country: (targetOrg as any)?.country ?? null,
    countryCode: (targetOrg as any)?.countryCode ?? null,
    phoneNumber: targetOrg.phone ?? relationship.managerPhone ?? "",
    phone,
    manager: targetOrg.representative ?? relationship.managerName ?? "",
    email: targetOrg.email ?? relationship.managerEmail ?? "",
    targetMonthlyWage: (targetOrg as any)?.targetMonthlyWage ?? null,
    wagePerSecond: (targetOrg as any)?.wagePerSecond ?? null,
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

const toOptionalProcessSeconds = (value: any) => {
  const parsed = toOptionalSeconds(value);
  if (parsed === null) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
};

const resolveStBucketQuantity = (
  orderQuantity: any,
  fallback = DEFAULT_ST_BUCKET_QUANTITY
) => {
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, fallback);
  let resolvedBucket = fallback;
  ST_STANDARD_BUCKETS.forEach((bucket) => {
    if (resolvedOrderQuantity >= bucket) {
      resolvedBucket = bucket;
    }
  });
  return resolvedBucket;
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

type StyleStBucket = {
  bucketQuantity: number;
  bucketStSeconds: number;
  setBy: string | null;
  setAt: string | null;
  updatedAt: string | null;
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

const toStyleStBucket = (value: any): StyleStBucket | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bucketQuantity = resolveStBucketQuantity(
    (value as any).bucketQuantity ?? (value as any).quantity
  );
  const bucketStSeconds = toOptionalProcessSeconds(
    (value as any).bucketStSeconds ?? (value as any).seconds
  );
  if (bucketQuantity === null || bucketStSeconds === null) return null;
  const setAtRaw = resolveOptionalString((value as any).setAt, null);
  const setAtDate = setAtRaw ? new Date(setAtRaw) : null;
  const updatedAtRaw = resolveOptionalString((value as any).updatedAt, null);
  const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
  return {
    bucketQuantity,
    bucketStSeconds,
    setBy: resolveOptionalString((value as any).setBy, null),
    setAt:
      setAtDate && !Number.isNaN(setAtDate.getTime())
        ? setAtDate.toISOString()
        : null,
    updatedAt:
      updatedAtDate && !Number.isNaN(updatedAtDate.getTime())
        ? updatedAtDate.toISOString()
        : null,
  };
};

const normalizeStyleProcessStBuckets = (
  values: any,
  legacyProcess: any = null
): StyleStBucket[] => {
  const byQuantity = new Map<number, StyleStBucket>();
  ensureArray(values).forEach((value) => {
    const normalized = toStyleStBucket(value);
    if (!normalized) return;
    byQuantity.set(normalized.bucketQuantity, normalized);
  });

  const legacyCt = toOptionalProcessSeconds((legacyProcess as any)?.ct);
  const legacyQuantity = resolveStBucketQuantity(
    (legacyProcess as any)?.timeRefQuantity ??
      (legacyProcess as any)?.referenceQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  if (
    byQuantity.size === 0 &&
    (legacyProcess as any)?.stManual === true &&
    legacyCt !== null
  ) {
    byQuantity.set(legacyQuantity, {
      bucketQuantity: legacyQuantity,
      bucketStSeconds: legacyCt,
      setBy: "LEGACY",
      setAt: null,
      updatedAt: null,
    });
  }

  return Array.from(byQuantity.values()).sort(
    (left, right) => left.bucketQuantity - right.bucketQuantity
  );
};

const findStyleProcessExactStBucket = (
  values: StyleStBucket[] = [],
  orderQuantity = 1
): StyleStBucket | null => {
  const resolvedOrderQuantity = resolveStBucketQuantity(orderQuantity);
  return (
    values.find((value) => toPositiveInt(value.bucketQuantity, 0) === resolvedOrderQuantity) ??
    null
  );
};

const resolveStyleProcessAtTotalSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return null;
  }
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const atParams = toStyleAtParams((process as any).atParams);
  if (!atParams) return null;
  return atParams.a * resolvedOrderQuantity + atParams.b;
};

const resolveStyleProcessAtPerPieceSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const totalAt = resolveStyleProcessAtTotalSecondsForOrderQuantity(
    process,
    resolvedOrderQuantity
  );
  if (totalAt == null || !Number.isFinite(totalAt) || totalAt <= 0) return null;
  return totalAt / resolvedOrderQuantity;
};

const resolveStyleProcessAtPerPieceSecondsForReferenceQuantity = (process: any) => {
  const referenceQuantity = toPositiveInt(
    (process as any)?.timeRefQuantity ?? (process as any)?.referenceQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  return resolveStyleProcessAtPerPieceSecondsForOrderQuantity(
    process,
    referenceQuantity
  );
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

const resolveOnboardingRequesterEmail = (req: Request, fallbackEmail?: unknown) =>
  normalizeEmail(getRequesterEmail(req) || req.query?.email || fallbackEmail);

const resolveOnboardingOrganizationType = (
  value: unknown
): OrganizationTypeKey | null => {
  const token = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!token) return null;
  if (ONBOARDING_ORGANIZATION_TYPE_TOKENS[token]) {
    return ONBOARDING_ORGANIZATION_TYPE_TOKENS[token];
  }
  const normalized = token.toUpperCase() as OrganizationTypeKey;
  return ONBOARDING_ORGANIZATION_TYPE_OPTIONS.has(normalized)
    ? normalized
    : null;
};

const resolveOnboardingCountry = (value: unknown): "KR" | "VN" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "KR" || normalized === "KOREA" || normalized === "SOUTH KOREA") {
    return "KR";
  }
  if (
    normalized === "VN" ||
    normalized === "VIETNAM" ||
    normalized === "VIET NAM"
  ) {
    return "VN";
  }
  return ONBOARDING_COUNTRY_OPTIONS.has(normalized) ? (normalized as "KR" | "VN") : null;
};

const normalizeOnboardingBusinessNumber = (value: unknown) =>
  String(resolveOptionalString(value, "") || "")
    .trim()
    .replace(/[\s-]+/g, "");

const getOnboardingBusinessNumberIdentity = (value: unknown) =>
  normalizeOnboardingBusinessNumber(value).replace(/\D+/g, "");

const findOrganizationByBusinessNumberIdentity = async (
  businessNumberIdentity: string
) => {
  if (!businessNumberIdentity) return null;
  const organizations = await prisma.organization.findMany({
    where: {
      businessNumber: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      businessNumber: true,
    },
    orderBy: { id: "asc" },
  });
  return (
    organizations.find(
      (organization) =>
        getOnboardingBusinessNumberIdentity(organization.businessNumber) ===
        businessNumberIdentity
    ) ?? null
  );
};

const findPendingOnboardingRequestByBusinessNumberIdentity = async (
  businessNumberIdentity: string,
  options: { excludeRequestId?: number } = {}
) => {
  if (!businessNumberIdentity) return null;
  const pendingRequests = await prisma.onboardingRequest.findMany({
    where: {
      status: "PENDING",
      requestType: "REGISTER_ORG",
      ...(options.excludeRequestId ? { NOT: { id: options.excludeRequestId } } : {}),
    },
    select: {
      id: true,
      requesterEmail: true,
      organizationNameEn: true,
      businessNumber: true,
    },
    orderBy: { id: "desc" },
  });
  return (
    pendingRequests.find(
      (request) =>
        getOnboardingBusinessNumberIdentity(request.businessNumber) ===
        businessNumberIdentity
    ) ?? null
  );
};

const isValidOnboardingBusinessNumber = (
  country: "KR" | "VN",
  businessNumber: string
) => {
  if (country === "KR") {
    return ONBOARDING_KR_BUSINESS_NUMBER_REGEX.test(businessNumber);
  }
  if (country === "VN") {
    return ONBOARDING_VN_BUSINESS_NUMBER_REGEX.test(businessNumber);
  }
  return false;
};

const toOnboardingRequestSummary = (request: any) => ({
  id: request.id,
  requesterEmail: request.requesterEmail,
  organizationNameEn: request.organizationNameEn,
  organizationType: request.organizationType ?? null,
  country: request.country ?? null,
  companyAddress: request.companyAddress ?? null,
  businessNumber: request.businessNumber,
  contactName: request.contactName ?? null,
  contactEmail: request.contactEmail,
  contactPhone: request.contactPhone,
  status: request.status,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  approvedBy: request.approvedBy ?? null,
  approvedAt: request.approvedAt ?? null,
  rejectedBy: request.rejectedBy ?? null,
  rejectedAt: request.rejectedAt ?? null,
  rejectionReason: request.rejectionReason ?? null,
  organizationId: request.organizationId ?? null,
  organizationName: request.organization?.name ?? null,
  approvedOrganizationType: request.organization?.type ?? null,
});

const normalizeStyleProcessCodeSegment = (value: any) =>
  String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

const hashStyleProcessText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase();
};

const buildCustomStyleSpecCode = (value: any) => {
  const text = resolveOptionalString(value, null);
  if (!text) return "";
  const compact = text.replace(/\s+/g, "").toLowerCase();
  const numberMatch = compact.match(/\d+(?:\.\d+)?/);
  const numericToken = numberMatch ? numberMatch[0].replace(/\./g, "_") : "";
  if (numericToken) {
    if (/(mm)/i.test(compact)) return `${numericToken}MM`;
    if (/(cm)/i.test(compact)) return `${numericToken}CM`;
    if (/(line|needle|ly|줄|선)/i.test(compact)) return `${numericToken}N`;
    if (/(thread|chi|실|soi)/i.test(compact)) return `${numericToken}T`;
  }
  const normalized = normalizeStyleProcessCodeSegment(text);
  if (normalized) return normalized;
  return `SPEC_${hashStyleProcessText(text).slice(0, 6)}`;
};

type StyleProcessCompositionEntryKind =
  | "part"
  | "target"
  | "action"
  | "spec"
  | "location"
  | "targetSpec"
  | "actionSpec";

const normalizeStyleProcessCompositionEntryKind = (
  kind: StyleProcessCompositionEntryKind
): "part" | "target" | "action" | "spec" => {
  if (kind === "location") return "part";
  if (kind === "targetSpec" || kind === "actionSpec") return "spec";
  return kind;
};

const normalizeStyleProcessCompositionEntry = (
  value: any,
  kind: StyleProcessCompositionEntryKind
) => {
  const normalizedKind = normalizeStyleProcessCompositionEntryKind(kind);
  if (value === null || value === undefined) return null;
  const fallbackText =
    typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(
          value?.label ??
            value?.nameKo ??
            value?.nameEn ??
            value?.nameVi ??
            value?.name ??
            value?.value,
          null
        )
      : resolveOptionalString(value, null);
  const codeSource =
    typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.code, null)
      : null;
  const code =
    normalizeStyleProcessCodeSegment(codeSource) ||
    (normalizedKind === "spec" ? buildCustomStyleSpecCode(fallbackText) : "");
  const label = fallbackText ?? code;
  if (!label && !code) return null;

  const nameKo =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameKo, null)
      : null) ??
    label ??
    "";
  const nameEn =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameEn, null)
      : null) ??
    label ??
    "";
  const nameVi =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameVi, null)
      : null) ??
    label ??
    "";

  return {
    code: code || null,
    label: label || code,
    nameKo,
    nameEn,
    nameVi,
    isCustom:
      Boolean(
        typeof value === "object" &&
          !Array.isArray(value) &&
          (value as any)?.isCustom
      ) || !codeSource,
  };
};

const normalizeStyleProcessCompositionEntries = (
  value: any,
  kind: StyleProcessCompositionEntryKind
) => {
  const entries = ensureArray(value)
    .map((item) => normalizeStyleProcessCompositionEntry(item, kind))
    .filter(Boolean);
  const used = new Set<string>();
  return entries.filter((entry) => {
    const labelText = resolveOptionalString(entry?.label, "") ?? "";
    const dedupeKey = `${resolveOptionalString(entry?.code, null) ?? ""}::${labelText.toLowerCase()}`;
    if (!dedupeKey || used.has(dedupeKey)) return false;
    used.add(dedupeKey);
    return true;
  });
};

const normalizeStyleProcessComposition = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const locationInputs = [
    ...ensureArray((value as any)?.locations),
    ...ensureArray((value as any)?.parts),
    ...(value as any)?.location ? [(value as any).location] : [],
    ...(value as any)?.part ? [(value as any).part] : [],
  ];
  const locations = normalizeStyleProcessCompositionEntries(locationInputs, "part");
  const rawTargetPairs = ensureArray((value as any)?.targetPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const targetEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.target ?? (pair as any)?.targetItem,
        "target"
      );
      const targetSpecEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.targetSpec ?? (pair as any)?.spec ?? (pair as any)?.targetSpecItem,
        "targetSpec"
      );
      if (!targetEntry && !targetSpecEntry) return null;
      return {
        target: targetEntry,
        targetSpec: targetSpecEntry,
      };
    })
    .filter(Boolean) as Array<{
    target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
    targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
  }>;

  const rawTargets = normalizeStyleProcessCompositionEntries(
    (value as any)?.targets,
    "target"
  );

  const legacySpecs = normalizeStyleProcessCompositionEntries((value as any)?.specs, "spec");
  const targetSpecInputs = [
    ...ensureArray((value as any)?.targetSpecs),
    ...(value as any)?.targetSpec ? [(value as any).targetSpec] : [],
    ...((ensureArray((value as any)?.targetSpecs).length === 0 &&
    (value as any)?.targetSpec === undefined
      ? legacySpecs
      : []) as any[]),
  ];
  const rawTargetSpecs = normalizeStyleProcessCompositionEntries(targetSpecInputs, "spec");

  const targetPairs =
    rawTargetPairs.length > 0
      ? rawTargetPairs.filter((pair) => Boolean(pair?.target))
      : (() => {
          const pairCount = Math.max(rawTargets.length, rawTargetSpecs.length);
          if (pairCount === 0) return [] as Array<{
            target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }>;
          const pairs: Array<{
            target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }> = [];
          for (let index = 0; index < pairCount; index += 1) {
            const targetEntry = rawTargets[index] ?? null;
            const targetSpecEntry = rawTargetSpecs[index] ?? null;
            if (!targetEntry && !targetSpecEntry) continue;
            if (!targetEntry) continue;
            pairs.push({
              target: targetEntry,
              targetSpec: targetSpecEntry,
            });
          }
          return pairs;
        })();

  const rawActionPairs = ensureArray((value as any)?.actionPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const actionEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.action ?? (pair as any)?.actionItem,
        "action"
      );
      const actionSpecEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.actionSpec ?? (pair as any)?.spec ?? (pair as any)?.actionSpecItem,
        "actionSpec"
      );
      if (!actionEntry && !actionSpecEntry) return null;
      return {
        action: actionEntry,
        actionSpec: actionSpecEntry,
      };
    })
    .filter(Boolean) as Array<{
    action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
    actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
  }>;
  const rawActions = normalizeStyleProcessCompositionEntries(
    (value as any)?.actions,
    "action"
  );
  const actionSpecInputs = [
    ...ensureArray((value as any)?.actionSpecs),
    ...(value as any)?.actionSpec ? [(value as any).actionSpec] : [],
  ];
  const rawActionSpecs = normalizeStyleProcessCompositionEntries(actionSpecInputs, "spec");
  const actionPairs =
    rawActionPairs.length > 0
      ? rawActionPairs.filter((pair) => Boolean(pair?.action))
      : (() => {
          const pairCount = Math.max(rawActions.length, rawActionSpecs.length);
          if (pairCount === 0) return [] as Array<{
            action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }>;
          const pairs: Array<{
            action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }> = [];
          for (let index = 0; index < pairCount; index += 1) {
            const actionEntry = rawActions[index] ?? null;
            const actionSpecEntry = rawActionSpecs[index] ?? null;
            if (!actionEntry && !actionSpecEntry) continue;
            if (!actionEntry) continue;
            pairs.push({
              action: actionEntry,
              actionSpec: actionSpecEntry,
            });
          }
          return pairs;
        })();
  if (
    locations.length === 0 &&
    targetPairs.length === 0 &&
    actionPairs.length === 0
  ) {
    return null;
  }
  return {
    locations,
    targetPairs,
    actionPairs,
  };
};

const resolveStyleProcessCompositionText = (
  entry: any,
  language: "ko" | "en" | "vi"
) => {
  if (!entry || typeof entry !== "object") return "";
  if (language === "ko") {
    return resolveOptionalString(entry?.nameKo ?? entry?.label ?? entry?.code, "") ?? "";
  }
  if (language === "vi") {
    return resolveOptionalString(entry?.nameVi ?? entry?.label ?? entry?.code, "") ?? "";
  }
  return resolveOptionalString(entry?.nameEn ?? entry?.label ?? entry?.code, "") ?? "";
};

const buildStyleProcessNameFromComposition = (
  composition: any,
  language: "ko" | "en" | "vi",
  fallback: any = null
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) {
    return resolveOptionalString(fallback, null);
  }

  const locationText = normalizedComposition.locations
    .map((entry: any) => resolveStyleProcessCompositionText(entry, language))
    .filter(Boolean)
    .join("·");
  const targetPairs = ensureArray((normalizedComposition as any)?.targetPairs);
  const targetWithSpec = targetPairs
    .map((pair: any) => {
      const targetText = resolveStyleProcessCompositionText(pair?.target, language);
      const targetSpecText = resolveStyleProcessCompositionText(
        pair?.targetSpec,
        language
      );
      if (targetText) {
        return `${targetText}${targetSpecText ? `(${targetSpecText})` : ""}`;
      }
      if (targetSpecText) return `(${targetSpecText})`;
      return "";
    })
    .filter(Boolean)
    .join(" + ");
  const actionPairs = ensureArray((normalizedComposition as any)?.actionPairs);
  const actionWithSpec = actionPairs
    .map((pair: any) => {
      const actionText = resolveStyleProcessCompositionText(pair?.action, language);
      const actionSpecText = resolveStyleProcessCompositionText(pair?.actionSpec, language);
      if (actionText) {
        return `${actionText}${actionSpecText ? `(${actionSpecText})` : ""}`;
      }
      if (actionSpecText) return `(${actionSpecText})`;
      return "";
    })
    .filter(Boolean)
    .join(" + ");
  const leftText =
    locationText && targetWithSpec
      ? `${locationText}: ${targetWithSpec}`
      : locationText || targetWithSpec;
  const baseText =
    leftText && actionWithSpec
      ? `${leftText} - ${actionWithSpec}`
      : leftText || actionWithSpec;
  if (!baseText) {
    return resolveOptionalString(fallback, null);
  }
  return baseText;
};

const buildStyleProcessLocalizedNamesFromComposition = (
  composition: any,
  fallback: {
    name?: any;
    nameKo?: any;
    nameEn?: any;
    nameVi?: any;
  } = {}
) => ({
  nameKo:
    buildStyleProcessNameFromComposition(composition, "ko", fallback.nameKo ?? fallback.name) ?? "",
  nameEn:
    buildStyleProcessNameFromComposition(composition, "en", fallback.nameEn ?? fallback.name) ?? "",
  nameVi:
    buildStyleProcessNameFromComposition(composition, "vi", fallback.nameVi ?? fallback.name) ?? "",
});

const buildStyleProcessCodeFromComposition = (
  composition: any,
  fallback: any = null
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) {
    return normalizeStyleProcessCodeSegment(fallback);
  }
  const tokens = [
    ...normalizedComposition.locations.map((entry: any) =>
      resolveOptionalString(entry?.code, null)
    ),
    ...ensureArray((normalizedComposition as any)?.targetPairs).flatMap((pair: any) => [
      resolveOptionalString(pair?.target?.code, null),
      resolveOptionalString(pair?.targetSpec?.code, null) ||
        buildCustomStyleSpecCode(pair?.targetSpec?.label),
    ]),
    ...ensureArray((normalizedComposition as any)?.actionPairs).flatMap((pair: any) => [
      resolveOptionalString(pair?.action?.code, null),
      resolveOptionalString(pair?.actionSpec?.code, null) ||
        buildCustomStyleSpecCode(pair?.actionSpec?.label),
    ]),
  ]
    .map((token) => normalizeStyleProcessCodeSegment(token))
    .filter(Boolean);

  if (tokens.length > 0) return tokens.join("_");
  return normalizeStyleProcessCodeSegment(fallback);
};

const resolveStyleProcessDisplayCode = (value: any) => {
  const normalized = normalizeStyleProcessCodeSegment(value);
  return normalized || null;
};

const resolveStyleProcessVisibleCode = (
  rowProcessCode: any,
  displayProcess: any = null
) => {
  if (
    displayProcess &&
    typeof displayProcess === "object" &&
    !Array.isArray(displayProcess)
  ) {
    const displayCode = resolveStyleProcessDisplayCode((displayProcess as any).code);
    if (displayCode) return displayCode;
    if ("code" in (displayProcess as any)) return null;
  }
  return resolveOptionalString(rowProcessCode, null);
};

const normalizeStyleProcess = (process: any) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return process;
  }
  const {
    st: _legacySt,
    processQuantity: _legacyProcessQuantity,
    quantity: _legacyQuantity,
    timesPerPiece: _rawTimesPerPiece,
    stValues: _legacyStValues,
    stBuckets: _rawStBuckets,
    ...rest
  } = process;
  const next = { ...rest };
  const explicitManualName = resolveOptionalString(
    (next as any).manualName ?? (next as any).processText,
    null
  );
  if (explicitManualName) {
    (next as any).manualName = explicitManualName;
  } else if ("manualName" in next) {
    delete (next as any).manualName;
  }
  if ("processText" in next) {
    delete (next as any).processText;
  }
  const normalizedDisplayCode = resolveStyleProcessDisplayCode((next as any).code);
  if (normalizedDisplayCode) {
    (next as any).code = normalizedDisplayCode;
  } else if ("code" in next) {
    (next as any).code = null;
  }
  const normalizedStorageCode = resolveStyleProcessDisplayCode(
    (next as any).storageCode
  );
  if (normalizedStorageCode) {
    (next as any).storageCode = normalizedStorageCode;
  } else if ("storageCode" in next) {
    (next as any).storageCode = null;
  }
  const normalizedComposition = normalizeStyleProcessComposition(
    (next as any).processComposition
  );
  if (normalizedComposition) {
    (next as any).processComposition = normalizedComposition;
    if (explicitManualName) {
      (next as any).name = explicitManualName;
      (next as any).nameKo = explicitManualName;
      (next as any).nameEn = explicitManualName;
      (next as any).nameVi = explicitManualName;
    } else {
      const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
        normalizedComposition,
        {
          name: (next as any).name,
          nameKo: (next as any).nameKo,
          nameEn: (next as any).nameEn,
          nameVi: (next as any).nameVi,
        }
      );
      (next as any).name = localizedNames.nameEn || (next as any).name;
      (next as any).nameKo = localizedNames.nameKo;
      (next as any).nameEn = localizedNames.nameEn;
      (next as any).nameVi = localizedNames.nameVi;
    }

    // Legacy rows with 4+ actions exceed current UI constraints (max 3).
    const hasTooManyActions =
      ensureArray((normalizedComposition as any)?.actionPairs).length > 3;
    if (hasTooManyActions) {
      const existingDescription = resolveOptionalString((next as any).description, "") ?? "";
      const normalizedDescription = existingDescription.trim();
      const reviewMessage =
        "Legacy process has more than 3 actions. Please review and split if needed.";
      if (!normalizedDescription) {
        (next as any).description = `[REVIEW] ${reviewMessage}`;
      } else if (!normalizedDescription.startsWith("[REVIEW]")) {
        (next as any).description = `[REVIEW] ${normalizedDescription}`;
      }
      (next as any).needsReview = true;
      (next as any).reviewComment =
        (resolveOptionalString((next as any).reviewComment, null) ??
          resolveOptionalString((next as any).description, null) ??
          reviewMessage)
          .replace(/^\[REVIEW\]\s*/i, "")
          .trim();
    }
  } else if ("processComposition" in next) {
    delete (next as any).processComposition;
  }
  if (explicitManualName) {
    (next as any).name = explicitManualName;
    (next as any).nameKo = explicitManualName;
    (next as any).nameEn = explicitManualName;
    (next as any).nameVi = explicitManualName;
  }
  const normalizedStBuckets = normalizeStyleProcessStBuckets(
    _rawStBuckets ?? _legacyStValues,
    next
  );
  const resolvedTimeRefQuantity = toPositiveInt(
    (next as any).timeRefQuantity ??
      (next as any).referenceQuantity ??
      normalizedStBuckets[0]?.bucketQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const exactStBucket = findStyleProcessExactStBucket(
    normalizedStBuckets,
    resolvedTimeRefQuantity
  );
  if ("pt" in next) next.pt = toOptionalProcessSeconds(next.pt);
  const legacyCt =
    normalizedStBuckets.length === 0 ? toOptionalProcessSeconds(next.ct) : null;
  next.ct = exactStBucket?.bucketStSeconds ?? legacyCt;
  const normalizedAtParams = toStyleAtParams((next as any).atParams);
  if (normalizedAtParams) {
    (next as any).atParams = normalizedAtParams;
  } else if ("atParams" in next) {
    delete (next as any).atParams;
  }
  if ("at" in next) {
    delete (next as any).at;
  }
  if (normalizedStBuckets.length > 0) {
    (next as any).stBuckets = normalizedStBuckets;
  } else if ("stBuckets" in next) {
    delete (next as any).stBuckets;
  }
  if ("stValues" in next) {
    delete (next as any).stValues;
  }
  next.timeRefQuantity = resolvedTimeRefQuantity;
  const hasCt = next.ct !== null && next.ct !== undefined;
  const atPerPiece = resolveStyleProcessAtPerPieceSecondsForReferenceQuantity(next);
  const hasAt = atPerPiece !== null;
  const isLikelyAutoCt =
    hasCt &&
    hasAt &&
    Math.abs(Number(next.ct) - Number(atPerPiece)) < 1e-4;
  next.stManual =
    exactStBucket !== null ||
    (typeof next.stManual === "boolean" ? next.stManual : hasCt && !isLikelyAutoCt);
  if ("referenceQuantity" in next) {
    delete (next as any).referenceQuantity;
  }
  next.timesPerPiece = toPositiveInt(
    _rawTimesPerPiece ?? _legacyQuantity ?? _legacyProcessQuantity,
    1
  );
  if ("quantity" in next) {
    delete (next as any).quantity;
  }
  if ("processQuantity" in next) {
    delete (next as any).processQuantity;
  }
  return next;
};

const normalizeStyleProcesses = (value: any) =>
  ensureArray(value).map((process) => normalizeStyleProcess(process));

const resolveStyleProcessExactStPerPieceSeconds = (
  process: any,
  orderQuantity = 1
) => {
  const normalized = normalizeStyleProcess(process);
  const exactStBucket = findStyleProcessExactStBucket(
    ensureArray((normalized as any)?.stBuckets) as StyleStBucket[],
    orderQuantity
  );
  if (exactStBucket) return exactStBucket.bucketStSeconds;

  if (ensureArray((normalized as any)?.stBuckets).length > 0) {
    return null;
  }

  const resolvedOrderQuantity = resolveStBucketQuantity(orderQuantity);
  const legacyQuantity = resolveStBucketQuantity(
    (normalized as any)?.timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const legacyCt = toOptionalProcessSeconds((normalized as any)?.ct);
  if (
    (normalized as any)?.stManual === true &&
    legacyCt !== null &&
    legacyQuantity === resolvedOrderQuantity
  ) {
    return legacyCt;
  }
  return null;
};

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

type AtTrainingBucketStoreClient = Prisma.TransactionClient | typeof prisma;
type AtTrainingMetricQuality = {
  totalQuantity: number;
  weightedCoverageQuantity: number;
  observationCount: number;
};
type AtTrainingBucketProcessDraft = {
  styleUid: number;
  styleProcessId: number;
  quantity: number;
};
type AtTrainingBucketDraft = {
  sourceWorkLogId: number;
  monthKey: string;
  workDate: string;
  factoryId: number | null;
  laborInputSeconds: number;
  attendanceCoverage: number | null;
  processRows: AtTrainingBucketProcessDraft[];
};

const toAtTrainingStyleProcessMetricKey = (styleProcessId: number) =>
  `STYLE_PROCESS:${styleProcessId}`;

const resolveStoredStyleProcessFallbackPerPieceSeconds = (processRow: any) => {
  const timesPerPiece = toPositiveInt(processRow?.timesPerPiece, 1);
  const ptSeconds = toOptionalSeconds(processRow?.ptSeconds);
  if (ptSeconds != null) {
    return roundToScale(ptSeconds * timesPerPiece, 4);
  }
  return resolveStyleProcessAtPerPieceSecondsForReferenceQuantity({
    timesPerPiece: processRow?.timesPerPiece,
    atParams: processRow?.atParams,
    timeRefQuantity: DEFAULT_TIME_REF_QUANTITY,
  });
};

const loadAtTrainingSourceWorkLogs = async ({
  orgId,
  trainingMonthKey = null,
  workLogIds = [],
  workDate = null,
  factoryId = null,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey?: string | null;
  workLogIds?: number[];
  workDate?: string | null;
  factoryId?: number | null;
  db?: AtTrainingBucketStoreClient;
}) => {
  const normalizedWorkLogIds = Array.from(
    new Set(
      ensureArray(workLogIds)
        .map((workLogId) => toPositiveIntOrNull(workLogId))
        .filter((workLogId): workLogId is number => workLogId !== null)
    )
  );
  const where: Prisma.WorkLogWhereInput = { orgId };
  if (normalizedWorkLogIds.length > 0) {
    where.id = { in: normalizedWorkLogIds };
  } else {
    const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
    const normalizedWorkDate = normalizeDateKey(workDate);
    const normalizedFactoryId = toPositiveIntOrNull(factoryId);
    if (normalizedTrainingMonthKey) {
      where.displayDate = { startsWith: normalizedTrainingMonthKey };
    } else if (normalizedWorkDate) {
      where.displayDate = normalizedWorkDate;
    }
    if (normalizedFactoryId !== null) {
      where.factoryId = normalizedFactoryId;
    }
  }

  try {
    return await db.workLog.findMany({
      where,
      select: {
        id: true,
        displayDate: true,
        coverageStartDate: true,
        coverageEndDate: true,
        entryMode: true,
        factoryId: true,
        workerCount: true,
        workRecords: {
          where: {
            quantity: { gt: 0 },
            OR: [{ styleId: { not: null } }, { styleUid: { not: null } }],
          },
          select: {
            workerId: true,
            styleUid: true,
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
      orderBy: [{ displayDate: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    return db.workLog.findMany({
      where,
      select: {
        id: true,
        displayDate: true,
        factoryId: true,
        workerCount: true,
        workRecords: {
          where: {
            quantity: { gt: 0 },
            OR: [{ styleId: { not: null } }, { styleUid: { not: null } }],
          },
          select: {
            workerId: true,
            styleUid: true,
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
      orderBy: [{ displayDate: "asc" }, { id: "asc" }],
    });
  }
};

const buildAtTrainingBucketDraftsFromRawSource = async ({
  orgId,
  trainingMonthKey = null,
  workLogIds = [],
  workDate = null,
  factoryId = null,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey?: string | null;
  workLogIds?: number[];
  workDate?: string | null;
  factoryId?: number | null;
  db?: AtTrainingBucketStoreClient;
}): Promise<AtTrainingBucketDraft[]> => {
  const workLogs = await loadAtTrainingSourceWorkLogs({
    orgId,
    trainingMonthKey,
    workLogIds,
    workDate,
    factoryId,
    db,
  });
  if (workLogs.length === 0) return [];
  const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
  const normalizedRequestedWorkDate = normalizeDateKey(workDate);

  const styleIds = Array.from(
    new Set(
      workLogs
        .flatMap((item) => item.workRecords)
        .map((record) => String(record.styleId || "").trim())
        .filter((styleId) => styleId !== "")
    )
  );
  const styleUids = Array.from(
    new Set(
      workLogs
        .flatMap((item) => item.workRecords)
        .map((record) => toPositiveIntOrNull((record as any).styleUid))
        .filter((styleUid): styleUid is number => styleUid !== null)
    )
  );
  if (styleIds.length === 0 && styleUids.length === 0) return [];

  const syncTargetOrgIds = await resolveStyleSyncTargetOrgIds(orgId);
  const styleCandidates = await db.style.findMany({
    where: {
      orgId: { in: syncTargetOrgIds },
      OR: [
        ...(styleIds.length > 0 ? [{ styleId: { in: styleIds } }] : []),
        ...(styleUids.length > 0 ? [{ uid: { in: styleUids } }] : []),
      ],
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
  if (styleCandidates.length === 0) return [];

  await ensureStyleProcessStorageForStyles(styleCandidates, {
    processOrgId: orgId,
    db,
  });
  const styleProcessRowsByStyleUid = await loadStyleProcessRowsByStyleUid(
    styleCandidates.map((style) => Number(style.uid)),
    { processOrgId: orgId, db }
  );

  const stylesByStyleId = new Map<string, any[]>();
  styleCandidates.forEach((style) => {
    const styleIdKey = String(style.styleId || "").trim();
    if (!styleIdKey) return;
    const current = stylesByStyleId.get(styleIdKey) || [];
    current.push(style);
    stylesByStyleId.set(styleIdKey, current);
  });
  const stylesByUid = new Map(
    styleCandidates.map((style) => [Number(style.uid), style])
  );

  const processLookupByStyleUid = styleCandidates.reduce((map, style) => {
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    ensureArray(styleProcessRowsByStyleUid.get(Number(style.uid))).forEach((processRow) => {
      const codeKey = normalizeProcessCodeKey(processRow?.processCode);
      const nameKey = normalizeProcessNameKey(processRow?.processName);
      if (codeKey && !byCode.has(codeKey)) {
        byCode.set(codeKey, processRow);
      }
      if (nameKey && !byName.has(nameKey)) {
        byName.set(nameKey, processRow);
      }
    });
    map.set(Number(style.uid), { byCode, byName });
    return map;
  }, new Map<number, { byCode: Map<string, any>; byName: Map<string, any> }>());

  const resolveCandidateStyle = (record: {
    styleUid?: any;
    styleId: any;
    styleName: any;
    customerName: any;
  }) => {
    const directStyleUid = toPositiveIntOrNull((record as any).styleUid);
    if (directStyleUid !== null && stylesByUid.has(directStyleUid)) {
      return stylesByUid.get(directStyleUid) ?? null;
    }
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

  const workerIds = Array.from(
    new Set(
      workLogs
        .flatMap((workLog) => workLog.workRecords)
        .map((record) => toPositiveIntOrNull(record.workerId))
        .filter((workerId): workerId is number => workerId !== null)
    )
  );
  const eligibleWorkerDateWindowById = new Map<
    number,
    { joinedDateKey: string; leftDateKey: string }
  >();
  if (workerIds.length > 0) {
    const workerRows = await db.employee.findMany({
      where: {
        orgId,
        id: { in: workerIds },
      },
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        membership: {
          select: {
            role: true,
            status: true,
          },
        },
        role: {
          select: {
            code: true,
          },
        },
      },
    });
    workerRows.forEach((worker) => {
      const workerId = toPositiveIntOrNull(worker.id);
      if (workerId === null) return;
      if (worker.membership?.role !== "WORKER") return;
      if (worker.membership?.status !== "ACTIVE") return;
      const workerRoleCode = String(worker.role?.code ?? "").trim().toUpperCase();
      if (workerRoleCode !== DEFAULT_EMPLOYEE_ROLE_CODE_SEWING) return;
      eligibleWorkerDateWindowById.set(workerId, {
        joinedDateKey: toDateKeyInTimeZone(worker.joinedAt, BUSINESS_TIME_ZONE),
        leftDateKey: toDateKeyInTimeZone(worker.leftAt, BUSINESS_TIME_ZONE),
      });
    });
  }
  const isEligibleWorkerOnDate = (
    workerId: number | null,
    normalizedWorkDate: string
  ): workerId is number => {
    if (workerId === null || !normalizedWorkDate) return false;
    const eligibility = eligibleWorkerDateWindowById.get(workerId);
    if (!eligibility) return false;
    if (eligibility.joinedDateKey && normalizedWorkDate < eligibility.joinedDateKey) {
      return false;
    }
    if (eligibility.leftDateKey && normalizedWorkDate > eligibility.leftDateKey) {
      return false;
    }
    return true;
  };

  const attendanceSecondsByWorkerDate = new Map<string, number>();
  const maxAttendanceDateByFactory = new Map<string, string>();
  if (USE_ATTENDANCE_INPUT_FOR_AT && workLogs.length > 0) {
    const explicitWorkDates = Array.from(
      new Set(
        workLogs
          .map((workLog) => normalizeDateKey(workLog.displayDate))
          .filter((value) => value !== "")
      )
    );
    const factoryIds = Array.from(
      new Set(
        workLogs
          .map((workLog) => toPositiveIntOrNull((workLog as any).factoryId))
          .filter((resolvedFactoryId): resolvedFactoryId is number => resolvedFactoryId !== null)
      )
    );
    const eligibleWorkerIds = Array.from(eligibleWorkerDateWindowById.keys());
    const attendanceWorkDateWhere =
      normalizedTrainingMonthKey !== ""
        ? { startsWith: normalizedTrainingMonthKey }
        : normalizedRequestedWorkDate !== ""
          ? { startsWith: normalizedRequestedWorkDate.slice(0, 7) }
          : explicitWorkDates.length > 0
            ? { in: explicitWorkDates }
            : null;

    if (attendanceWorkDateWhere && eligibleWorkerIds.length > 0) {
      try {
        const attendanceRows = await db.attendanceEntry.findMany({
          where: {
            orgId,
            workDate: attendanceWorkDateWhere as any,
            workerId: { in: eligibleWorkerIds },
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
          const normalizedWorkDate = normalizeDateKey(row.workDate);
          const resolvedFactoryId = toPositiveIntOrNull((row as any).factoryId);
          const resolvedWorkerId = toPositiveIntOrNull(row.workerId);
          const workedSeconds = toNumberOrNull(row.workedSeconds);
          if (
            !normalizedWorkDate ||
            resolvedFactoryId === null ||
            resolvedWorkerId === null ||
            !isEligibleWorkerOnDate(resolvedWorkerId, normalizedWorkDate)
          ) {
            return;
          }
          const factoryTrackerKey = String(resolvedFactoryId);
          const currentMaxDate = maxAttendanceDateByFactory.get(factoryTrackerKey) || "";
          if (!currentMaxDate || normalizedWorkDate > currentMaxDate) {
            maxAttendanceDateByFactory.set(factoryTrackerKey, normalizedWorkDate);
          }
          if (workedSeconds === null || workedSeconds <= 0) {
            return;
          }
          attendanceSecondsByWorkerDate.set(
            toAttendanceWorkerDateKey(
              normalizedWorkDate,
              resolvedWorkerId,
              resolvedFactoryId
            ),
            Math.max(0, Math.round(workedSeconds))
          );
        });
      } catch (error: unknown) {
        if (getErrorCode(error) !== "P2021") {
          throw error;
        }
        const contextMonthKey =
          normalizedTrainingMonthKey ||
          normalizeMonthKey(
            normalizedRequestedWorkDate
              ? String(normalizedRequestedWorkDate).slice(0, 7)
              : ""
          ) ||
          "mixed";
        console.warn(
          `[AT sync] orgId=${orgId} month=${contextMonthKey} attendance_table_missing=true mode=attendance_only`
        );
      }
    }
  }

  const toUtcDateFromDateKey = (dateKey: string): Date | null => {
    const parts = parseDateKeyParts(dateKey);
    if (!parts) return null;
    const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (Number.isNaN(utcDate.getTime())) return null;
    return utcDate;
  };
  const toDateKeyFromUtcDate = (date: Date): string =>
    date.toISOString().slice(0, 10);
  const shiftDateKeyByDays = (dateKey: string, days: number): string | null => {
    const baseDate = toUtcDateFromDateKey(dateKey);
    if (!baseDate) return null;
    baseDate.setUTCDate(baseDate.getUTCDate() + Math.trunc(days));
    return toDateKeyFromUtcDate(baseDate);
  };
  const countDateRangeDaysInclusive = (startDateKey: string, endDateKey: string): number => {
    const startDate = toUtcDateFromDateKey(startDateKey);
    const endDate = toUtcDateFromDateKey(endDateKey);
    if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) return 0;
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
  };

  const resolveWorkerSecondsForDate = (
    normalizedWorkDate: string,
    workerId: number | null,
    resolvedFactoryId: number | null
  ) => {
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      return ATTENDANCE_DEFAULT_WORK_SECONDS;
    }
    if (workerId === null || resolvedFactoryId === null) {
      return 0;
    }
    return toNonNegativeInt(
      attendanceSecondsByWorkerDate.get(
        toAttendanceWorkerDateKey(normalizedWorkDate, workerId, resolvedFactoryId)
      ),
      0
    );
  };
  const resolveWorkerSecondsForPeriod = ({
    periodStartDateKey,
    periodEndDateKey,
    workerId,
    resolvedFactoryId,
  }: {
    periodStartDateKey: string;
    periodEndDateKey: string;
    workerId: number | null;
    resolvedFactoryId: number | null;
  }): number => {
    const dayCount = countDateRangeDaysInclusive(periodStartDateKey, periodEndDateKey);
    if (dayCount <= 0) return 0;
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      return dayCount * ATTENDANCE_DEFAULT_WORK_SECONDS;
    }
    if (workerId === null || resolvedFactoryId === null) {
      return 0;
    }

    let sum = 0;
    let cursorDateKey = periodStartDateKey;
    for (let offset = 0; offset < dayCount; offset += 1) {
      sum += resolveWorkerSecondsForDate(cursorDateKey, workerId, resolvedFactoryId);
      if (offset === dayCount - 1) break;
      const nextDateKey = shiftDateKeyByDays(cursorDateKey, 1);
      if (!nextDateKey) break;
      cursorDateKey = nextDateKey;
    }
    return sum;
  };
  const filteredWorkLogs =
    USE_ATTENDANCE_INPUT_FOR_AT && normalizedRequestedWorkDate === ""
      ? workLogs.filter((workLog) => {
          const normalizedWorkDate = normalizeDateKey(workLog.displayDate);
          const resolvedFactoryId = toPositiveIntOrNull((workLog as any).factoryId);
          if (!normalizedWorkDate || resolvedFactoryId === null) {
            return false;
          }
          const maxAttendanceDate =
            maxAttendanceDateByFactory.get(String(resolvedFactoryId)) || "";
          return maxAttendanceDate !== "" && normalizedWorkDate <= maxAttendanceDate;
        })
      : workLogs;
  if (filteredWorkLogs.length === 0) return [];

  const previousPeriodEndDateByFactory = new Map<string, string>();

  return filteredWorkLogs.reduce((drafts, workLog) => {
    const normalizedWorkDate = normalizeDateKey(workLog.displayDate);
    const normalizedCoverageEndDate =
      resolveWorkLogCoverageEndDate(workLog, normalizedWorkDate) || normalizedWorkDate;
    const monthKey = normalizeMonthKey(normalizedCoverageEndDate.slice(0, 7));
    const resolvedFactoryId = toPositiveIntOrNull((workLog as any).factoryId);
    const workLogId = toPositiveIntOrNull(workLog.id);
    if (!normalizedWorkDate || !normalizedCoverageEndDate || !monthKey || workLogId === null) {
      return drafts;
    }

    // Prefer explicit coverage dates. Fallback to previous-input-date inference by factory.
    const periodTrackerKey =
      resolvedFactoryId === null ? "__factory_null__" : String(resolvedFactoryId);
    const previousPeriodEndDateKey =
      previousPeriodEndDateByFactory.get(periodTrackerKey) || "";
    const monthStartDateKey = `${monthKey}-01`;
    const nextDateAfterPrevious = previousPeriodEndDateKey
      ? shiftDateKeyByDays(previousPeriodEndDateKey, 1)
      : null;
    const candidatePeriodStartDateKey = nextDateAfterPrevious || monthStartDateKey;
    const explicitCoverageStartDate =
      resolveWorkLogCoverageStartDate(workLog, normalizedCoverageEndDate) || null;
    const inferredPeriodStartDateKey =
      candidatePeriodStartDateKey <= normalizedCoverageEndDate
        ? candidatePeriodStartDateKey
        : normalizedCoverageEndDate;
    const periodStartDateKey =
      explicitCoverageStartDate && explicitCoverageStartDate <= normalizedCoverageEndDate
        ? explicitCoverageStartDate
        : inferredPeriodStartDateKey;
    const periodDayCount = Math.max(
      1,
      countDateRangeDaysInclusive(periodStartDateKey, normalizedCoverageEndDate)
    );

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
        const lookup = processLookupByStyleUid.get(Number(resolvedStyle.uid));
        if (!lookup) return null;
        const matchedStyleProcess =
          (processCodeKey ? lookup.byCode.get(processCodeKey) : null) ||
          (processNameKey ? lookup.byName.get(processNameKey) : null) ||
          null;
        const styleProcessId = toPositiveIntOrNull(matchedStyleProcess?.id);
        if (styleProcessId === null) return null;
        return {
          styleUid: Number(resolvedStyle.uid),
          styleProcessId,
          quantity,
          workerId: toPositiveIntOrNull(record.workerId),
        };
      })
      .filter(Boolean) as Array<{
      styleUid: number;
      styleProcessId: number;
      quantity: number;
      workerId: number | null;
    }>;
    if (resolvedRows.length === 0) {
      return drafts;
    }

    const perProcessGroups = new Map<number, AtTrainingBucketProcessDraft>();
    const workerIdsForDay = new Set<number>();
    resolvedRows.forEach((row) => {
      const current = perProcessGroups.get(row.styleProcessId) || {
        styleUid: row.styleUid,
        styleProcessId: row.styleProcessId,
        quantity: 0,
      };
      current.quantity += row.quantity;
      perProcessGroups.set(row.styleProcessId, current);
      if (row.workerId !== null) {
        workerIdsForDay.add(row.workerId);
      }
    });

    const workerSecondsById = new Map<number, number>();
    workerIdsForDay.forEach((workerId) => {
      workerSecondsById.set(
        workerId,
        resolveWorkerSecondsForPeriod({
          periodStartDateKey,
          periodEndDateKey: normalizedCoverageEndDate,
          workerId,
          resolvedFactoryId,
        })
      );
    });

    let attendanceCoverage: number | null = null;
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      attendanceCoverage = 1;
    } else if (workerIdsForDay.size > 0) {
      if (resolvedFactoryId === null) {
        attendanceCoverage = 0;
      } else {
        let attendanceProvidedCount = 0;
        workerSecondsById.forEach((seconds) => {
          if (seconds > 0) {
            attendanceProvidedCount += 1;
          }
        });
        attendanceCoverage = attendanceProvidedCount / workerIdsForDay.size;
      }
    }
    if (!Number.isFinite(attendanceCoverage as number)) {
      attendanceCoverage = null;
    } else if (attendanceCoverage !== null) {
      attendanceCoverage = roundToScale(
        Math.min(1, Math.max(0, attendanceCoverage)),
        4
      );
    }

    const laborInputSeconds =
      workerIdsForDay.size > 0
        ? Array.from(workerSecondsById.values()).reduce((sum, seconds) => sum + seconds, 0)
        : Math.max(1, toPositiveIntOrNull((workLog as any).workerCount) ?? 1) *
          ATTENDANCE_DEFAULT_WORK_SECONDS *
          periodDayCount;
    if (!Number.isFinite(laborInputSeconds) || laborInputSeconds <= 0) {
      return drafts;
    }

    const processRows = Array.from(perProcessGroups.values()).filter(
      (item) =>
        item.styleUid > 0 &&
        item.styleProcessId > 0 &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    );
    if (processRows.length === 0) {
      return drafts;
    }

    drafts.push({
      sourceWorkLogId: workLogId,
      monthKey,
      workDate: normalizedCoverageEndDate,
      factoryId: resolvedFactoryId,
      laborInputSeconds: Math.max(1, Math.round(laborInputSeconds)),
      attendanceCoverage,
      processRows,
    });
    previousPeriodEndDateByFactory.set(periodTrackerKey, normalizedCoverageEndDate);
    return drafts;
  }, [] as AtTrainingBucketDraft[]);
};

const replaceAtTrainingBucketsForMonth = async ({
  orgId,
  trainingMonthKey,
  drafts,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey: string;
  drafts: AtTrainingBucketDraft[];
  db?: AtTrainingBucketStoreClient;
}) => {
  const actor = getCurrentRequestActor();
  await db.$executeRaw(
    Prisma.sql`DELETE FROM "AtTrainingBucket" WHERE "orgId" = ${orgId} AND "monthKey" = ${trainingMonthKey}`
  );

  for (const draft of drafts) {
    const insertedRows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      INSERT INTO "AtTrainingBucket" (
        "orgId",
        "monthKey",
        "sourceWorkLogId",
        "workDate",
        "factoryId",
        "laborInputSeconds",
        "attendanceCoverage",
        "createdBy",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${orgId},
        ${draft.monthKey},
        ${draft.sourceWorkLogId},
        ${draft.workDate},
        ${draft.factoryId},
        ${draft.laborInputSeconds},
        ${draft.attendanceCoverage},
        ${actor},
        NOW(),
        NOW()
      )
      RETURNING "id"
    `);
    const bucketId = toPositiveIntOrNull(insertedRows[0]?.id);
    if (bucketId === null || draft.processRows.length === 0) continue;

    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "AtTrainingBucketProcess" (
          "orgId",
          "bucketId",
          "styleUid",
          "styleProcessId",
          "quantity",
          "createdBy",
          "createdAt",
          "updatedAt"
        )
        VALUES ${Prisma.join(
          draft.processRows.map((processRow) => {
            const quantity = Math.max(1, Math.round(processRow.quantity));
            return Prisma.sql`(
              ${orgId},
              ${bucketId},
              ${processRow.styleUid},
              ${processRow.styleProcessId},
              ${quantity},
              ${actor},
              NOW(),
              NOW()
            )`;
          })
        )}
      `
    );
  }
};

const syncAtTrainingBucketsForMonth = async ({
  orgId,
  trainingMonthKey,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey: string;
  db?: AtTrainingBucketStoreClient;
}) => {
  const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
  if (!normalizedTrainingMonthKey) return 0;
  const drafts = await buildAtTrainingBucketDraftsFromRawSource({
    orgId,
    trainingMonthKey: normalizedTrainingMonthKey,
    db,
  });
  await replaceAtTrainingBucketsForMonth({
    orgId,
    trainingMonthKey: normalizedTrainingMonthKey,
    drafts,
    db,
  });
  return drafts.length;
};

const collectRawAtTrainingMonthKeysForOrg = async (orgId: number) => {
  const rows = await prisma.workLog.findMany({
    where: { orgId },
    select: { displayDate: true },
    orderBy: [{ displayDate: "asc" }, { id: "asc" }],
  });
  return Array.from(
    new Set(
      rows
        .map((row) => normalizeMonthKey(normalizeDateKey(row.displayDate).slice(0, 7)))
        .filter((monthKey) => monthKey !== "")
    )
  ).sort();
};

const collectStoredAtTrainingMonthKeysForOrg = async (orgId: number) => {
  const rows = await prisma.$queryRaw<Array<{ monthKey: string }>>(Prisma.sql`
    SELECT DISTINCT "monthKey"
    FROM "AtTrainingBucket"
    WHERE "orgId" = ${orgId}
    ORDER BY "monthKey" ASC
  `);
  return Array.from(
    new Set(
      rows
        .map((row: { monthKey: string }) => normalizeMonthKey(row.monthKey))
        .filter((monthKey: string) => monthKey !== "")
    )
  ).sort();
};

const ensureHistoricalAtTrainingBucketsForOrg = async ({
  orgId,
  maxMonthKey,
  excludeMonthKeys = [],
}: {
  orgId: number;
  maxMonthKey: string;
  excludeMonthKeys?: string[];
}) => {
  const normalizedMaxMonthKey = normalizeMonthKey(maxMonthKey);
  if (!normalizedMaxMonthKey) return [] as string[];

  const [rawMonthKeys, storedMonthKeys] = await Promise.all([
    collectRawAtTrainingMonthKeysForOrg(orgId),
    collectStoredAtTrainingMonthKeysForOrg(orgId),
  ]);
  const storedMonthKeySet = new Set(storedMonthKeys);
  const excludeMonthKeySet = new Set(
    ensureArray(excludeMonthKeys)
      .map((monthKey) => normalizeMonthKey(monthKey))
      .filter((monthKey) => monthKey !== "")
  );
  const missingMonthKeys = rawMonthKeys.filter(
    (monthKey) =>
      monthKey <= normalizedMaxMonthKey &&
      !storedMonthKeySet.has(monthKey) &&
      !excludeMonthKeySet.has(monthKey)
  );

  for (const monthKey of missingMonthKeys) {
    await prisma.$transaction(
      async (tx) => {
        await syncAtTrainingBucketsForMonth({
          orgId,
          trainingMonthKey: monthKey,
          db: tx,
        });
      },
      { timeout: 30000 }
    );
  }

  return missingMonthKeys;
};

const loadAtTrainingDataFromBuckets = async ({
  orgId,
  upToMonthKey,
}: {
  orgId: number;
  upToMonthKey: string;
}) => {
  const normalizedUpToMonthKey = normalizeMonthKey(upToMonthKey);
  if (!normalizedUpToMonthKey) {
    return {
      trainingDayBuckets: [] as AtTrainingDayBucket[],
      fallbackPerPieceByMetricKey: new Map<string, number | null>(),
      metricTrainingQualityByMetricKey: new Map<string, AtTrainingMetricQuality>(),
      styleProcessRowsById: new Map<number, any>(),
    };
  }

  type StoredAtTrainingBucketRow = {
    id: number;
    workDate: string;
    laborInputSeconds: number;
    attendanceCoverage: number | null;
  };
  type StoredAtTrainingBucketProcessRow = {
    bucketId: number;
    styleProcessId: number;
    quantity: number;
  };

  const bucketRows = await prisma.$queryRaw<StoredAtTrainingBucketRow[]>(Prisma.sql`
    SELECT
      "id",
      "workDate",
      "laborInputSeconds",
      "attendanceCoverage"
    FROM "AtTrainingBucket"
    WHERE "orgId" = ${orgId} AND "monthKey" <= ${normalizedUpToMonthKey}
    ORDER BY "workDate" ASC, "id" ASC
  `);
  if (bucketRows.length === 0) {
    return {
      trainingDayBuckets: [] as AtTrainingDayBucket[],
      fallbackPerPieceByMetricKey: new Map<string, number | null>(),
      metricTrainingQualityByMetricKey: new Map<string, AtTrainingMetricQuality>(),
      styleProcessRowsById: new Map<number, any>(),
    };
  }

  const bucketIds = bucketRows
    .map((bucketRow: StoredAtTrainingBucketRow) => toPositiveIntOrNull(bucketRow.id))
    .filter((bucketId): bucketId is number => bucketId !== null);
  const bucketProcessRows =
    bucketIds.length > 0
      ? await prisma.$queryRaw<StoredAtTrainingBucketProcessRow[]>(Prisma.sql`
          SELECT
            "bucketId",
            "styleProcessId",
            "quantity"
          FROM "AtTrainingBucketProcess"
          WHERE "orgId" = ${orgId} AND "bucketId" IN (${Prisma.join(bucketIds)})
          ORDER BY "bucketId" ASC, "styleProcessId" ASC
        `)
      : [];
  const bucketProcessRowsByBucketId = bucketProcessRows.reduce((map, row) => {
    const bucketId = toPositiveIntOrNull(row?.bucketId);
    if (bucketId === null) return map;
    const current = map.get(bucketId) || [];
    current.push(row);
    map.set(bucketId, current);
    return map;
  }, new Map<number, StoredAtTrainingBucketProcessRow[]>());

  const styleProcessIds = Array.from(
    new Set(
      bucketProcessRows
        .map((row: StoredAtTrainingBucketProcessRow) =>
          toPositiveIntOrNull(row?.styleProcessId)
        )
        .filter((styleProcessId): styleProcessId is number => styleProcessId !== null)
    )
  );
  const styleProcessRows =
    styleProcessIds.length > 0
      ? await prisma.styleProcess.findMany({
          where: {
            orgId,
            id: { in: styleProcessIds },
          },
          select: {
            id: true,
            styleUid: true,
            timesPerPiece: true,
            ptSeconds: true,
            atParams: true,
          },
        })
      : [];
  const styleProcessRowsById = new Map(
    styleProcessRows.map((row) => [Number(row.id), row])
  );

  const trainingDayBuckets: AtTrainingDayBucket[] = [];
  const fallbackPerPieceByMetricKey = new Map<string, number | null>();
  const metricTrainingQualityByMetricKey = new Map<
    string,
    AtTrainingMetricQuality
  >();

  bucketRows.forEach((bucketRow: StoredAtTrainingBucketRow, bucketOrder: number) => {
    const laborInputSeconds = toNumberOrNull(bucketRow.laborInputSeconds);
    if (laborInputSeconds === null || laborInputSeconds <= 0) return;
    const attendanceCoverage = toNumberOrNull(bucketRow.attendanceCoverage);
    const dayProcessRows: AtTrainingDayProcessRow[] = [];

    ensureArray(bucketProcessRowsByBucketId.get(Number(bucketRow.id))).forEach((processRow) => {
      const styleProcessId = toPositiveIntOrNull(processRow?.styleProcessId);
      const quantity = Number(processRow?.quantity) || 0;
      if (styleProcessId === null || quantity <= 0) return;
      const styleProcessRow = styleProcessRowsById.get(styleProcessId);
      if (!styleProcessRow) return;

      const metricKey = toAtTrainingStyleProcessMetricKey(styleProcessId);
      dayProcessRows.push({
        metricKey,
        quantity,
        attendanceCoverage,
      });

      const qualityCurrent = metricTrainingQualityByMetricKey.get(metricKey) || {
        totalQuantity: 0,
        weightedCoverageQuantity: 0,
        observationCount: 0,
      };
      qualityCurrent.totalQuantity += quantity;
      if (attendanceCoverage !== null) {
        qualityCurrent.weightedCoverageQuantity += quantity * attendanceCoverage;
      }
      qualityCurrent.observationCount += 1;
      metricTrainingQualityByMetricKey.set(metricKey, qualityCurrent);

      if (!fallbackPerPieceByMetricKey.has(metricKey)) {
        fallbackPerPieceByMetricKey.set(
          metricKey,
          resolveStoredStyleProcessFallbackPerPieceSeconds(styleProcessRow)
        );
      } else if (fallbackPerPieceByMetricKey.get(metricKey) == null) {
        const resolvedFallback =
          resolveStoredStyleProcessFallbackPerPieceSeconds(styleProcessRow);
        if (resolvedFallback != null) {
          fallbackPerPieceByMetricKey.set(metricKey, resolvedFallback);
        }
      }
    });

    if (dayProcessRows.length === 0) return;
    trainingDayBuckets.push({
      dayKey: `${bucketRow.workDate}#${bucketRow.id}`,
      order: bucketOrder,
      laborInputSeconds: Math.max(1, Math.round(laborInputSeconds)),
      processRows: dayProcessRows,
    });
  });

  return {
    trainingDayBuckets,
    fallbackPerPieceByMetricKey,
    metricTrainingQualityByMetricKey,
    styleProcessRowsById,
  };
};

const applyAtTrainingResultsToStyleProcesses = async ({
  orgId,
  trainingMonthKey,
  fittedParamsByMetric,
  metricTrainingQualityByMetricKey,
  styleProcessRowsById,
}: {
  orgId: number;
  trainingMonthKey: string;
  fittedParamsByMetric: Map<string, { a: number; b: number }>;
  metricTrainingQualityByMetricKey: Map<string, AtTrainingMetricQuality>;
  styleProcessRowsById: Map<number, any>;
}) => {
  let updatedProcesses = 0;
  let clampAdjustedProcesses = 0;
  const changedStyleUids = new Set<number>();
  const refreshedStyleUids = new Set<number>();

  for (const processRow of styleProcessRowsById.values()) {
    const styleProcessId = toPositiveIntOrNull(processRow?.id);
    const styleUid = toPositiveIntOrNull(processRow?.styleUid);
    if (styleProcessId === null || styleUid === null) continue;

    const metricKey = toAtTrainingStyleProcessMetricKey(styleProcessId);
    const fittedRaw = fittedParamsByMetric.get(metricKey);
    if (!fittedRaw) continue;
    refreshedStyleUids.add(styleUid);

    const currentAtParams = toStyleAtParams((processRow as any).atParams);
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
      clampedA !== fittedRaw.a ? { a: clampedA, b: fittedRaw.b } : fittedRaw;
    if (clampedA !== fittedRaw.a) {
      clampAdjustedProcesses += 1;
    }

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
    if (!atParamsChanged) continue;

    updatedProcesses += 1;
    changedStyleUids.add(styleUid);
    await prisma.styleProcess.update({
      where: { id: styleProcessId },
      data: {
        atParams: nextAtParams,
      },
    });
  }

  if (refreshedStyleUids.size > 0) {
    const targetStyleUids = Array.from(refreshedStyleUids.values());
    const rowsByStyleUid = await refreshStyleProcessMirrorForStyleUids(targetStyleUids, {
      processOrgId: orgId,
    });
    const styles = await prisma.style.findMany({
      where: { uid: { in: targetStyleUids } },
      select: { uid: true, processes: true },
    });
    for (const style of styles) {
      const styleUid = Number(style.uid);
      const nextProcesses = buildStyleProcessMirrorFromRows(
        rowsByStyleUid.get(styleUid) || [],
        undefined,
        style.processes
      );
      if (
        JSON.stringify(normalizeStyleProcesses(style?.processes)) ===
        JSON.stringify(nextProcesses)
      ) {
        continue;
      }
      await prisma.style.update({
        where: { uid: styleUid },
        data: { processes: nextProcesses },
      });
    }
    await rebuildAssignmentCardsForOrgIds(await resolveStyleSyncTargetOrgIds(orgId));
  }

  return {
    updatedStyles: changedStyleUids.size,
    updatedProcesses,
    clampAdjustedProcesses,
  };
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
  {
    const backfilledMonthKeys = await ensureHistoricalAtTrainingBucketsForOrg({
      orgId,
      maxMonthKey: trainingMonthKey,
      excludeMonthKeys: [trainingMonthKey],
    });
    if (backfilledMonthKeys.length > 0) {
      console.log(
        `[AT sync] orgId=${orgId} month=${trainingMonthKey} backfilledMonths=${backfilledMonthKeys.join(",")}`
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await syncAtTrainingBucketsForMonth({
          orgId,
          trainingMonthKey,
          db: tx,
        });
      },
      { timeout: 30000 }
    );

    const bucketTrainingData = await loadAtTrainingDataFromBuckets({
      orgId,
      upToMonthKey: trainingMonthKey,
    });
    if (bucketTrainingData.trainingDayBuckets.length === 0) {
      return finish(0, 0, "no_metric_observations");
    }

    const fittingResult = fitAtParamsWithProportionalAllocation(
      bucketTrainingData.trainingDayBuckets,
      bucketTrainingData.fallbackPerPieceByMetricKey
    );
    const fittedParamsByMetric = fittingResult.paramsByMetric;
    if (fittedParamsByMetric.size === 0) {
      return finish(0, 0, "no_fitted_metrics");
    }
    console.log(
      `[AT sync] orgId=${orgId} month=${trainingMonthKey} metrics=${fittedParamsByMetric.size} dayBuckets=${bucketTrainingData.trainingDayBuckets.length} iterations=${fittingResult.iterationCount} converged=${fittingResult.converged}`
    );

    const applyResult = await applyAtTrainingResultsToStyleProcesses({
      orgId,
      trainingMonthKey,
      fittedParamsByMetric,
      metricTrainingQualityByMetricKey:
        bucketTrainingData.metricTrainingQualityByMetricKey,
      styleProcessRowsById: bucketTrainingData.styleProcessRowsById,
    });
    if (applyResult.clampAdjustedProcesses > 0) {
      console.log(
        `[AT sync] orgId=${orgId} month=${trainingMonthKey} clampAdjustedProcesses=${applyResult.clampAdjustedProcesses} clampRatio=${AT_MONTHLY_A_CLAMP_RATIO}`
      );
    }

    return finish(
      applyResult.updatedStyles,
      applyResult.updatedProcesses,
      backfilledMonthKeys.length > 0
        ? `done+backfilled_${backfilledMonthKeys.length}`
        : "done"
    );
  }
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

type StyleStorageClient = Prisma.TransactionClient | typeof prisma;

const STYLE_PROCESS_STANDARD_INCLUDE: Prisma.StyleProcessInclude = {
  standards: {
    orderBy: [{ bucketQuantity: "asc" }, { id: "asc" }],
  },
};

const resolveStyleProcessStorageCode = (process: any, index: number) => {
  const explicitCode = normalizeProcessCodeKey(process?.code);
  if (explicitCode) return explicitCode;
  const storedCode = normalizeProcessCodeKey(process?.storageCode);
  if (storedCode) return storedCode;
  const compositionCode = buildStyleProcessCodeFromComposition(
    process?.processComposition,
    null
  );
  const codeKey = normalizeProcessCodeKey(compositionCode);
  if (codeKey) return codeKey;
  const nameKey = normalizeProcessNameKey(process?.name);
  if (nameKey) return nameKey.toUpperCase();
  return `PROC_${index + 1}`;
};

const buildStyleProcessStorageDrafts = (processes: any): any[] =>
  normalizeStyleProcesses(processes).map((process, index) => {
    const normalizedComposition = normalizeStyleProcessComposition(
      (process as any)?.processComposition
    );
    const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
      normalizedComposition,
      {
        name: (process as any)?.name,
        nameKo: (process as any)?.nameKo,
        nameEn: (process as any)?.nameEn,
        nameVi: (process as any)?.nameVi,
      }
    );
    const manualName = resolveOptionalString((process as any)?.manualName, null);
    return {
      processCode: resolveStyleProcessStorageCode(process, index),
      processName:
        manualName ??
        resolveOptionalString((process as any)?.name, null) ??
        resolveOptionalString((process as any)?.nameEn, null) ??
        resolveOptionalString(localizedNames.nameEn, null) ??
        resolveOptionalString((process as any)?.code, null) ??
        resolveStyleProcessStorageCode(process, index),
      processComposition: normalizedComposition,
      processDescription: resolveOptionalString((process as any)?.description, null),
      timesPerPiece: toPositiveInt(
        (process as any)?.timesPerPiece ?? (process as any)?.quantity ?? (process as any)?.processQuantity,
        1
      ),
      sortOrder: index,
      ptSeconds: toOptionalProcessSeconds((process as any)?.pt),
      atParams: toStyleAtParams((process as any)?.atParams),
      stBuckets: normalizeStyleProcessStBuckets(
        (process as any)?.stBuckets ?? (process as any)?.stValues,
        process
      ),
    };
  });

const loadStyleProcessNameLookup = async ({
  orgId,
  processCodes,
  db = prisma,
}: {
  orgId?: number | null;
  processCodes: any[];
  db?: StyleStorageClient;
}) => {
  const resolvedOrgId = toPositiveIntOrNull(orgId);
  const codes = Array.from(
    new Set(
      ensureArray(processCodes)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (resolvedOrgId === null || codes.length === 0) {
    return new Map<
      string,
      {
        name: string | null;
        nameKo: string | null;
        nameEn: string | null;
        nameVi: string | null;
      }
    >();
  }

  const rows = await db.attrProcess.findMany({
    where: {
      orgId: resolvedOrgId,
      code: { in: codes },
    },
    select: {
      code: true,
      name: true,
      nameKo: true,
      nameEn: true,
      nameVi: true,
    },
  });

  return rows.reduce((map, row) => {
    const codeKey = normalizeProcessCodeKey(row.code);
    if (!codeKey) return map;
    const fallbackName = resolveOptionalString(row.name, null);
    map.set(codeKey, {
      name: fallbackName,
      nameKo: resolveOptionalString(row.nameKo, null),
      nameEn: resolveOptionalString(row.nameEn, null) ?? fallbackName,
      nameVi: resolveOptionalString(row.nameVi, null),
    });
    return map;
  }, new Map<
    string,
    {
      name: string | null;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    }
  >());
};

const buildStyleProcessMirrorFromRows = (
  rows: any[] = [],
  processNameLookup = new Map<
    string,
    {
      name: string | null;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    }
  >(),
  displayProcesses: any = []
) =>
  (() => {
    const displayProcessList = ensureArray(displayProcesses);
    return ensureArray(rows)
      .slice()
      .sort(
        (left, right) =>
          Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0) ||
          Number(left?.id ?? 0) - Number(right?.id ?? 0)
      )
      .map((row, index) => {
        const displayProcess = displayProcessList[index] ?? null;
        const normalizedComposition = normalizeStyleProcessComposition(
          row.processComposition
        );
        const masterNames =
          processNameLookup.get(normalizeProcessCodeKey(row.processCode)) ?? null;
        const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
          normalizedComposition,
          {
            name: masterNames?.nameEn ?? masterNames?.name ?? row.processName,
            nameKo: masterNames?.nameKo ?? null,
            nameEn: masterNames?.nameEn ?? masterNames?.name ?? row.processName,
            nameVi: masterNames?.nameVi ?? null,
          }
        );
        const manualName = resolveOptionalString(row.processName, null);
        return normalizeStyleProcess({
          code: resolveStyleProcessVisibleCode(row.processCode, displayProcess),
          storageCode: row.processCode,
          manualName,
          name:
            manualName ||
            localizedNames.nameEn ||
            masterNames?.nameEn ||
            masterNames?.name ||
            row.processName,
          nameKo: manualName || localizedNames.nameKo || masterNames?.nameKo,
          nameEn:
            manualName ||
            localizedNames.nameEn ||
            masterNames?.nameEn ||
            masterNames?.name ||
            row.processName,
          nameVi: manualName || localizedNames.nameVi || masterNames?.nameVi,
          processComposition: normalizedComposition,
          description: row.processDescription ?? null,
          timesPerPiece: row.timesPerPiece ?? 1,
          pt: toOptionalProcessSeconds(row.ptSeconds),
          atParams: toStyleAtParams(row.atParams),
          stBuckets: ensureArray(row.standards).map((standard) => ({
            bucketQuantity: resolveStBucketQuantity(
              (standard as any)?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY
            ),
            bucketStSeconds: toOptionalProcessSeconds((standard as any)?.bucketStSeconds),
            setBy: resolveOptionalString((standard as any)?.setBy, null),
            setAt:
              (standard as any)?.setAt instanceof Date
                ? (standard as any).setAt.toISOString()
                : resolveOptionalString((standard as any)?.setAt, null),
            updatedAt:
              (standard as any)?.updatedAt instanceof Date
                ? (standard as any).updatedAt.toISOString()
                : resolveOptionalString((standard as any)?.updatedAt, null),
          })),
          timeRefQuantity:
            ensureArray(row.standards)[0]?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY,
          instanceId: `${row.processCode || "PROC"}-${row.id || index}-${index}`,
        });
      });
  })();

const loadStyleProcessRowsByStyleUid = async (
  styleUids: number[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => {
  const db = options.db ?? prisma;
  const processOrgId = toPositiveIntOrNull(options.processOrgId);
  const normalizedStyleUids = Array.from(
    new Set(
      ensureArray(styleUids)
        .map((styleUid) => toPositiveIntOrNull(styleUid))
        .filter((styleUid): styleUid is number => styleUid !== null)
    )
  );
  if (normalizedStyleUids.length === 0) return new Map<number, any[]>();
  const rows = await db.styleProcess.findMany({
    where: {
      styleUid: { in: normalizedStyleUids },
      ...(processOrgId !== null ? { orgId: processOrgId } : {}),
    },
    include: STYLE_PROCESS_STANDARD_INCLUDE,
    orderBy: [{ styleUid: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.reduce((map, row) => {
    const current = map.get(row.styleUid) || [];
    current.push(row);
    map.set(row.styleUid, current);
    return map;
  }, new Map<number, any[]>());
};

const refreshStyleProcessMirrorForStyleUids = async (
  styleUids: number[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => loadStyleProcessRowsByStyleUid(styleUids, options);

const syncStyleProcessStorageForStyle = async ({
  styleUid,
  orgId,
  processes,
  db = prisma,
}: {
  styleUid: number;
  orgId: number;
  processes: any;
  db?: StyleStorageClient;
}) => {
  const processOrgId = toPositiveIntOrNull(orgId);
  if (processOrgId === null) {
    throw createHttpError(400, "invalid style process orgId");
  }
  const drafts = buildStyleProcessStorageDrafts(processes);
  const existingRows = await db.styleProcess.findMany({
    where: { styleUid, orgId: processOrgId },
    select: { id: true, processCode: true },
  });
  const existingByCode = new Map(
    existingRows.map((row) => [normalizeProcessCodeKey(row.processCode), row.id])
  );
  const nextCodes = new Set(drafts.map((draft) => normalizeProcessCodeKey(draft.processCode)));

  if (existingRows.length > 0) {
    const deleteIds = existingRows
      .filter((row) => !nextCodes.has(normalizeProcessCodeKey(row.processCode)))
      .map((row) => row.id);
    if (deleteIds.length > 0) {
      await db.styleProcess.deleteMany({
        where: { id: { in: deleteIds } },
      });
    }
  }

  for (const draft of drafts) {
    const normalizedProcessCode = normalizeProcessCodeKey(draft.processCode);
    const existingId = existingByCode.get(normalizedProcessCode);
    const row = existingId
      ? await db.styleProcess.update({
          where: { id: existingId },
          data: {
            processCode: draft.processCode,
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        })
      : await db.styleProcess.upsert({
          where: {
            styleUid_orgId_processCode: {
              styleUid,
              orgId: processOrgId,
              processCode: draft.processCode,
            },
          },
          update: {
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
          create: {
            orgId: processOrgId,
            styleUid,
            processCode: draft.processCode,
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        });
    existingByCode.set(normalizedProcessCode, row.id);

    await db.styleProcessStandard.deleteMany({
      where: { styleProcessId: row.id },
    });
    if (draft.stBuckets.length > 0) {
      await db.styleProcessStandard.createMany({
        data: draft.stBuckets.map((stValue: StyleStBucket) => ({
          orgId: processOrgId,
          styleProcessId: row.id,
          bucketQuantity: stValue.bucketQuantity,
          bucketStSeconds: stValue.bucketStSeconds,
          setBy: stValue.setBy,
          setAt: stValue.setAt ? new Date(stValue.setAt) : undefined,
        })),
        skipDuplicates: true,
      });
    }
  }

  const rowsByStyleUid = await refreshStyleProcessMirrorForStyleUids([styleUid], {
    processOrgId,
    db,
  });
  const rows = rowsByStyleUid.get(styleUid) || [];
  const processNameLookup = await loadStyleProcessNameLookup({
    orgId: processOrgId,
    processCodes: rows.map((row) => row?.processCode),
    db,
  });
  return buildStyleProcessMirrorFromRows(rows, processNameLookup, processes);
};

const ensureStyleProcessStorageForStyles = async (
  styles: any[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => {
  const db = options.db ?? prisma;
  const processOrgId = toPositiveIntOrNull(options.processOrgId);
  const styleRows = ensureArray(styles).filter(
    (style) => style && typeof style === "object" && Number.isFinite(Number(style?.uid))
  );
  if (styleRows.length === 0) return new Map<number, any[]>();

  let rowsByStyleUid = await loadStyleProcessRowsByStyleUid(
    styleRows.map((style) => Number(style.uid)),
    { processOrgId, db }
  );
  const missingStyles = styleRows.filter((style) => {
    if ((rowsByStyleUid.get(Number(style.uid)) || []).length > 0) return false;
    return normalizeStyleProcesses(style?.processes).length > 0;
  });

  for (const style of missingStyles) {
    const seedOrgId = processOrgId ?? Number(style.orgId);
    if (!Number.isFinite(seedOrgId) || seedOrgId <= 0) continue;
    await syncStyleProcessStorageForStyle({
      styleUid: Number(style.uid),
      orgId: seedOrgId,
      processes: style.processes,
      db,
    });
  }

  if (missingStyles.length > 0) {
    rowsByStyleUid = await loadStyleProcessRowsByStyleUid(
      styleRows.map((style) => Number(style.uid)),
      { processOrgId, db }
    );
  }

  const processNameLookup = await loadStyleProcessNameLookup({
    orgId: processOrgId,
    processCodes: Array.from(rowsByStyleUid.values()).flatMap((rows) =>
      ensureArray(rows).map((row) => row?.processCode)
    ),
    db,
  });

  return styleRows.reduce((map, style) => {
    const styleUid = Number(style.uid);
    const rows = rowsByStyleUid.get(styleUid) || [];
    map.set(
      styleUid,
      rows.length > 0
        ? buildStyleProcessMirrorFromRows(rows, processNameLookup, style.processes)
        : processOrgId !== null && Number(style.orgId) !== processOrgId
          ? []
          : normalizeStyleProcesses(style.processes)
    );
    return map;
  }, new Map<number, any[]>());
};

const collectStyleQuantityRequirementsFromOrders = ({
  orders,
  styles,
}: {
  orders: any[];
  styles: any[];
}) => {
  const quantityByStyleUid = new Map<number, Set<number>>();
  const styleCandidatesById = ensureArray(styles).reduce((map, style) => {
    const styleId = resolveOptionalString(style?.styleId, null);
    if (!styleId) return map;
    const current = map.get(styleId) || [];
    current.push(style);
    map.set(styleId, current);
    return map;
  }, new Map<string, any[]>());

  ensureArray(orders).forEach((order) => {
    const quantityByStyleUidInOrder = new Map<number, number>();
    const itemsFromRelation =
      Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
        ? [...order.workOrderItems]
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(workOrderItemToItemShape)
        : null;
    const items = itemsFromRelation ?? normalizeOrderItems(order?.items);
    items.forEach((item) => {
      const style = resolveStyleCandidateForAssignmentCard({
        order,
        item,
        styleCandidatesById,
      });
      const styleUid = toPositiveIntOrNull(style?.uid);
      if (styleUid === null) return;
      const normalizedQuantity = toPositiveIntOrNull(sumOrderItemQuantity(item));
      if (normalizedQuantity === null) return;
      quantityByStyleUidInOrder.set(
        styleUid,
        (quantityByStyleUidInOrder.get(styleUid) || 0) + normalizedQuantity
      );
    });

    quantityByStyleUidInOrder.forEach((quantity, styleUid) => {
      const current = quantityByStyleUid.get(styleUid) || new Set<number>();
      current.add(resolveStBucketQuantity(quantity));
      quantityByStyleUid.set(styleUid, current);
    });
  });

  return quantityByStyleUid;
};

const ensureStyleStandardsForQuantities = async ({
  styles,
  quantityByStyleUid,
  processOrgId = null,
  db = prisma,
}: {
  styles: any[];
  quantityByStyleUid: Map<number, Set<number>>;
  processOrgId?: number | null;
  db?: StyleStorageClient;
}) => {
  const styleUids = Array.from(quantityByStyleUid.keys());
  if (styleUids.length === 0) {
    return ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
  }

  await ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
  const rowsByStyleUid = await loadStyleProcessRowsByStyleUid(styleUids, {
    processOrgId,
    db,
  });
  const touchedStyleUids = new Set<number>();

  for (const styleUid of styleUids) {
    const requiredQuantities = Array.from(quantityByStyleUid.get(styleUid) || []);
    const processRows = rowsByStyleUid.get(styleUid) || [];
    for (const processRow of processRows) {
      const existingQuantities = new Set(
        ensureArray(processRow.standards).map((standard) =>
          resolveStBucketQuantity((standard as any)?.bucketQuantity ?? 1)
        )
      );
      const ptSeconds = toOptionalProcessSeconds(processRow.ptSeconds);
      if (ptSeconds === null) continue;
      const missingQuantities = requiredQuantities.filter(
        (quantity) => !existingQuantities.has(quantity)
      );
      if (missingQuantities.length === 0) continue;
      await db.styleProcessStandard.createMany({
        data: missingQuantities.map((quantity) => ({
          orgId: processRow.orgId,
          styleProcessId: processRow.id,
          bucketQuantity: quantity,
          bucketStSeconds: ptSeconds,
          setBy: "PT_DERIVED",
        })),
        skipDuplicates: true,
      });
      touchedStyleUids.add(styleUid);
    }
  }

  if (touchedStyleUids.size > 0) {
    await refreshStyleProcessMirrorForStyleUids(Array.from(touchedStyleUids), {
      processOrgId,
      db,
    });
  }

  return ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
};

const toStyleResponse = (
  style: any,
  options: {
    includeProcesses?: boolean;
    processMirrorMap?: Map<number, any[]>;
  } = {}
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
      : options.processMirrorMap?.get(Number(style.uid)) ??
        normalizeStyleProcesses(style.processes),
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

const normalizeOrderItemSizeKey = (value: unknown): string => {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return "";
  if (raw === "XXL" || raw === "2X") return "2XL";
  if (raw === "XXXL" || raw === "3X") return "3XL";
  if (raw === "XXXXL" || raw === "4X") return "4XL";
  if (
    raw === "FREE" ||
    raw === "FREESIZE" ||
    raw === "ONESIZE" ||
    raw === "ONESZ" ||
    raw === "F"
  ) {
    return "FREE";
  }
  return raw;
};

const normalizeOrderItemSizeQuantities = (item: any = {}) => {
  const next: Record<string, number> = {};
  const directEntries =
    item?.sizeQuantities && typeof item.sizeQuantities === "object"
      ? Object.entries(item.sizeQuantities)
      : [];
  directEntries.forEach(([rawKey, rawValue]) => {
    const sizeKey = normalizeOrderItemSizeKey(rawKey);
    if (!sizeKey) return;
    const quantity = Math.max(0, Math.round(Number(rawValue) || 0));
    next[sizeKey] = quantity;
  });
  if (Object.values(next).some((quantity) => quantity > 0)) {
    return next;
  }

  ensureArray(item?.quantities).forEach((row: any) => {
    const sizeKey = normalizeOrderItemSizeKey(
      row?.sizeId ?? row?.sizeName ?? row?.size
    );
    if (!sizeKey) return;
    const quantity = Math.max(0, Math.round(Number(row?.quantity) || 0));
    if (quantity <= 0) return;
    next[sizeKey] = (next[sizeKey] || 0) + quantity;
  });
  return next;
};

const resolveOrderItemColorCode = (item: any = {}, sizeQuantities: Record<string, number>) => {
  const directColorCode =
    resolveOptionalString(item?.colorCode ?? item?.color, null) ?? "";
  if (directColorCode) return directColorCode;

  for (const row of ensureArray(item?.quantities)) {
    const rowColorCode =
      resolveOptionalString(row?.colorCode ?? row?.color, null) ?? "";
    if (rowColorCode) return rowColorCode;
    const rowColorId = resolveOptionalString(row?.colorId, null) ?? "";
    if (rowColorId && !WORK_ORDER_ITEM_GENDER_CODES.has(rowColorId.toUpperCase())) {
      return rowColorId;
    }
  }

  if (Object.values(sizeQuantities).some((quantity) => quantity > 0)) {
    const rawColorId = resolveOptionalString(item?.colorId, null) ?? "";
    if (rawColorId && !WORK_ORDER_ITEM_GENDER_CODES.has(rawColorId.toUpperCase())) {
      return rawColorId;
    }
  }

  return "";
};

const resolveOrderItemColorId = (item: any = {}) => {
  const directColorId = toPositiveIntOrNull(item?.colorId);
  if (directColorId !== null) return directColorId;
  for (const row of ensureArray(item?.quantities)) {
    const legacyColorId = toPositiveIntOrNull(row?.colorId);
    if (legacyColorId !== null) return legacyColorId;
  }
  return null;
};

const resolveOrderItemColorName = (item: any = {}, fallbackCode = "") => {
  const directName = resolveOptionalString(item?.colorName, null);
  if (directName) return directName;
  for (const row of ensureArray(item?.quantities)) {
    const legacyName = resolveOptionalString(row?.colorName ?? row?.color, null);
    if (legacyName) return legacyName;
  }
  return fallbackCode;
};

const resolveOrderItemGender = (item: any = {}) => {
  const directGender = normalizeWorkOrderItemGender(item?.gender, null);
  if (directGender) return directGender;
  for (const row of ensureArray(item?.quantities)) {
    const legacyGender = normalizeWorkOrderItemGender(
      row?.gender ?? row?.colorId,
      null
    );
    if (legacyGender) return legacyGender;
  }
  return "M";
};

const normalizeOrderItems = (value: any): any[] =>
  ensureArray(value)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const { quantities: _legacyQuantities, ...rest } = item as Record<string, unknown>;
      const sizeQuantities = normalizeOrderItemSizeQuantities(item);
      const colorCode = resolveOrderItemColorCode(item, sizeQuantities);
      return {
        ...rest,
        colorId: resolveOrderItemColorId(item),
        colorCode,
        colorName: resolveOrderItemColorName(item, colorCode),
        gender: resolveOrderItemGender(item),
        sizeQuantities,
        totalQuantity: sumOrderItemQuantity({
          ...item,
          sizeQuantities,
        }),
      };
    });

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
      const colorCode =
        resolveOptionalString(item?.colorCode ?? item?.color, null) ?? "";
      return {
        ...item,
        colorId: toPositiveIntOrNull(item?.colorId),
        colorCode,
        colorName: resolveOrderItemColorName(item, colorCode),
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
    const colorId = toPositiveIntOrNull(item?.colorId);
    const linkedColor = colorId ? colorById.get(colorId) ?? null : null;
    const colorCode =
      resolveOptionalString(linkedColor?.code, null) ??
      resolveOptionalString(item?.colorCode ?? item?.color, null) ??
      "";

    return {
      ...item,
      colorId: linkedColor?.id ?? null,
      colorCode,
      colorName:
        resolveOptionalString(linkedColor?.name, null) ??
        resolveOrderItemColorName(item, colorCode),
    };
  });
};
const syncOrderItemStyleRefs = async (items: any, orgIds: any[]) => {
  const normalizedItems = normalizeOrderItems(items);
  const candidateOrgIds = collectPositiveIntSet(...orgIds);
  const rawStyleUids = Array.from(
    new Set(
      normalizedItems
        .map((item) => toPositiveIntOrNull(item?.styleUid))
        .filter((value): value is number => value !== null)
    )
  );
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
    candidateOrgIds.length === 0 &&
    rawStyleUids.length === 0
  ) {
    return normalizedItems.map((item) => ({
      ...item,
      styleUid: null,
      styleId: resolveOptionalString(item?.styleId, null),
      styleName: resolveOptionalString(item?.styleName, null),
      styleCode: resolveOptionalString(item?.styleCode, null),
    }));
  }

  const styleWhereOr: Prisma.StyleWhereInput[] = [
    ...(rawStyleUids.length > 0 ? [{ uid: { in: rawStyleUids } }] : []),
    ...(candidateOrgIds.length > 0 && styleIds.length > 0
      ? [{ orgId: { in: candidateOrgIds }, styleId: { in: styleIds } }]
      : []),
    ...(candidateOrgIds.length > 0 && styleCodes.length > 0
      ? [{ orgId: { in: candidateOrgIds }, styleCode: { in: styleCodes } }]
      : []),
    ...(candidateOrgIds.length > 0 && styleNames.length > 0
      ? [{ orgId: { in: candidateOrgIds }, name: { in: styleNames } }]
      : []),
  ];
  if (styleWhereOr.length === 0) {
    return normalizedItems.map((item) => ({
      ...item,
      styleUid: null,
      styleId: resolveOptionalString(item?.styleId, null),
      styleName: resolveOptionalString(item?.styleName, null),
      styleCode: resolveOptionalString(item?.styleCode, null),
    }));
  }
  const styles = await prisma.style.findMany({
    where: { OR: styleWhereOr },
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
      styleUid: linkedStyle?.uid ?? null,
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
  const confirmationStatus = resolveWorkOrderConfirmationStatus(
    fallback?.confirmationStatus ?? payload?.confirmationStatus,
    "PLANNED"
  );
  const status = resolveCanonicalWorkOrderStatusForLockState({
    status: payload?.status ?? fallback?.status,
    isManualLocked: Boolean(fallback?.modificationLockedAt),
  });

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
    status,
    confirmationStatus,
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

const createOrReuseSharedOrder = async ({
  normalized,
}: {
  normalized: any;
}) => {
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

const toOrderResponse = (
  order: any,
  options: {
    isAssignmentModificationLocked?: boolean;
  } = {}
) => {
  const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
    ? [...order.workOrderItems]
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(workOrderItemToItemShape)
    : null;
  const items = itemsFromRelation ?? normalizeOrderItems(order?.items);
  const ownerOrgId = order.buyerOrgId ?? order.orgId ?? null;
  const isManualModificationLocked = Boolean(order?.modificationLockedAt);
  const isAssignmentModificationLocked = Boolean(options.isAssignmentModificationLocked);
  const isModificationLocked = isManualModificationLocked;
  const status = resolveCanonicalWorkOrderStatusForLockState({
    status: order.status,
    isManualLocked: isManualModificationLocked,
  });
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
    status,
    confirmationStatus: resolveWorkOrderConfirmationStatus(
      order.confirmationStatus,
      "PLANNED"
    ),
    items,
    totalQuantity: toNonNegativeInt(order.totalQuantity, 0),
    isModificationLocked,
    isManualModificationLocked,
    isAssignmentModificationLocked,
    canToggleModificationLock: true,
    modificationLockedAt: order.modificationLockedAt ?? null,
    modificationLockedBy: order.modificationLockedBy ?? "",
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
const toDateKeyInTimeZone = (input: any, timeZone = BUSINESS_TIME_ZONE) => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string" && input.trim() === "") return "";
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
const evaluateWorkerEmploymentOnDateKey = ({
  joinedAt,
  leftAt,
  targetDateKey,
}: {
  joinedAt?: unknown;
  leftAt?: unknown;
  targetDateKey?: string | null;
}) => {
  const normalizedTargetDateKey = normalizeDateKey(targetDateKey);
  const joinedDateKey = toDateKeyInTimeZone(joinedAt, BUSINESS_TIME_ZONE);
  const leftDateKey = toDateKeyInTimeZone(leftAt, BUSINESS_TIME_ZONE);

  if (!normalizedTargetDateKey) {
    return {
      passed: false,
      reason: "invalid_workDate",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  if (joinedDateKey && normalizedTargetDateKey < joinedDateKey) {
    return {
      passed: false,
      reason: "workDate_before_joinedAt",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  // leftAt is inclusive: worker is treated as employed on leftAt date.
  if (leftDateKey && normalizedTargetDateKey > leftDateKey) {
    return {
      passed: false,
      reason: "workDate_after_leftAt",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  return {
    passed: true,
    reason: "pass",
    joinedDateKey,
    leftDateKey,
  } as const;
};
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
const normalizeHolidayDateKeyList = (holidays: any): string[] =>
  Array.from(
    new Set(
      ensureArray(holidays)
        .map((value) => normalizeDateKey(value))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right));
const toHolidayDateKeyResponse = (rows: any) =>
  ensureArray(rows)
    .map((row) => normalizeDateKey(row?.holidayDate))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
let organizationHolidayStorageReadyPromise: Promise<void> | null = null;
const ensureOrganizationHolidayStorageReady = async () => {
  if (organizationHolidayStorageReadyPromise) {
    await organizationHolidayStorageReadyPromise;
    return;
  }

  organizationHolidayStorageReadyPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrganizationHoliday" (
        "id" SERIAL NOT NULL,
        "orgId" INTEGER NOT NULL,
        "holidayDate" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationHoliday_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationHoliday_orgId_holidayDate_key"
      ON "OrganizationHoliday" ("orgId", "holidayDate")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationHoliday_orgId_holidayDate_idx"
      ON "OrganizationHoliday" ("orgId", "holidayDate")
    `);
  })();

  try {
    await organizationHolidayStorageReadyPromise;
  } catch (error) {
    organizationHolidayStorageReadyPromise = null;
    throw error;
  }
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
      orderNo: resolveOptionalString(record.orderNo, null),
      lineId: toPositiveIntOrNull(record.lineId),
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
  const styleUids = collectPositiveIntSet(
    ...normalizedRecords.map((record) => record?.styleUid)
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
    styleUids.length > 0 || styleIds.length > 0 || styleNames.length > 0
      ? prisma.style.findMany({
          where: {
            orgId,
            OR: [
              ...(styleUids.length > 0 ? [{ uid: { in: styleUids } }] : []),
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
      orderNo: resolveOptionalString(record?.orderNo, null),
      lineId: toPositiveIntOrNull(record?.lineId),
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
const attachCanonicalFieldsToWorkRecords = async ({
  orgId,
  lineId,
  records,
  db = prisma,
}: {
  orgId: number;
  lineId: number | null;
  records: any[];
  db?: any;
}) => {
  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedRecords.length === 0) return [];

  const normalizedLineId = toPositiveIntOrNull(lineId);
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(normalizedRecords);
  const planRows =
    assignmentPlanIds.length > 0
      ? await db.assignmentPlan.findMany({
          where: { orgId, id: { in: assignmentPlanIds } },
          select: { id: true, orderNo: true },
        })
      : [];
  const orderNoByPlanId = new Map(
    ensureArray(planRows).map((plan) => [
      toPositiveIntOrNull(plan?.id),
      resolveOptionalString(plan?.orderNo, null),
    ])
  );

  return normalizedRecords.map((record) => {
    const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
    const planOrderNo =
      assignmentPlanId != null ? orderNoByPlanId.get(assignmentPlanId) ?? null : null;
    return {
      ...record,
      orderNo: resolveOptionalString(planOrderNo ?? record?.orderNo, null),
      lineId: normalizedLineId ?? toPositiveIntOrNull(record?.lineId),
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
const shiftDateKeyByDays = (dateKey: string, days: number): string | null => {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(utcDate.getTime())) return null;
  utcDate.setUTCDate(utcDate.getUTCDate() + Math.trunc(days));
  return utcDate.toISOString().slice(0, 10);
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
const isWorkLogCoverageMissingColumnError = (error: any) => {
  const code = resolveOptionalString((error as any)?.code, "") || "";
  if (code !== "P2022") return false;
  const missingColumn =
    resolveOptionalString((error as any)?.meta?.column, null) ||
    resolveOptionalString((error as any)?.message, "");
  if (!missingColumn) return false;
  return /(WorkLog\.)?(coverageStartDate|coverageEndDate|entryMode)/i.test(
    missingColumn
  );
};

const buildWorkLogSelectWithOptionalCoverage = ({
  includeCoverage,
  includeRecords,
}: {
  includeCoverage: boolean;
  includeRecords: boolean;
}) => {
  const select: Record<string, any> = {
    id: true,
    displayDate: true,
    factoryId: true,
    factoryName: true,
    factoryWagePerSecond: true,
    ctBasis: true,
    workerCount: true,
    itemCount: true,
    totalCtSeconds: true,
    note: true,
    records: true,
    createdAt: true,
    updatedAt: true,
    updatedBy: true,
  };
  if (includeCoverage) {
    select.coverageStartDate = true;
    select.coverageEndDate = true;
    select.entryMode = true;
  }
  if (includeRecords) {
    select.workRecords = WORK_LOG_RECORD_INCLUDE;
  }
  return select;
};

const fetchWorkLogByIdWithRecordsSafe = async ({
  orgId,
  workLogId,
  recordSelect,
  warnLabel,
}: {
  orgId: number;
  workLogId: number;
  recordSelect: any;
  warnLabel: string;
}) => {
  try {
    return await prisma.workLog.findFirst({
      where: { id: workLogId, orgId },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: true,
          includeRecords: false,
        }),
        workRecords: recordSelect,
      },
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    const fallbackRow = await prisma.workLog.findFirst({
      where: { id: workLogId, orgId },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: false,
          includeRecords: false,
        }),
        workRecords: recordSelect,
      },
    });
    console.warn(
      `[${warnLabel}] orgId=${orgId} workLogId=${workLogId} missing work-log coverage columns; fallback record projection activated`
    );
    return fallbackRow;
  }
};
const findPreviousWorkLogCoverageForLine = async ({
  orgId,
  factoryId = null,
  lineId,
  beforeWorkDate,
}: {
  orgId: number;
  factoryId?: number | null;
  lineId: number;
  beforeWorkDate: string;
}) => {
  const normalizedBeforeWorkDate = normalizeDateKey(beforeWorkDate);
  const normalizedFactoryId = toPositiveIntOrNull(factoryId);
  if (!lineId || !normalizedBeforeWorkDate) {
    return null;
  }

  const pageSize = 200;
  for (let skip = 0; skip < 2000; skip += pageSize) {
    let candidates: any[] = [];
    try {
      candidates = await prisma.workLog.findMany({
        where: {
          orgId,
          ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
          displayDate: { lt: normalizedBeforeWorkDate },
        },
        select: {
          id: true,
          displayDate: true,
          coverageStartDate: true,
          coverageEndDate: true,
          entryMode: true,
          records: true,
        },
        orderBy: [{ displayDate: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      });
    } catch (error) {
      if (!isWorkLogCoverageMissingColumnError(error)) throw error;
      candidates = await prisma.workLog.findMany({
        where: {
          orgId,
          ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
          displayDate: { lt: normalizedBeforeWorkDate },
        },
        select: {
          id: true,
          displayDate: true,
          records: true,
        },
        orderBy: [{ displayDate: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      });
      if (skip === 0) {
        console.warn(
          `[work-log-context] orgId=${orgId} lineId=${lineId} missing work-log coverage columns; fallback previous-coverage query activated`
        );
      }
    }
    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      const candidateLineMeta = resolveWorkLogLineMeta(candidate?.records);
      if (toPositiveIntOrNull(candidateLineMeta.lineId) !== lineId) continue;
      const coverageEndDate = resolveWorkLogCoverageEndDate(candidate, candidate?.displayDate);
      const coverageStartDate = resolveWorkLogCoverageStartDate(
        candidate,
        coverageEndDate
      );
      return {
        workLogId: toPositiveIntOrNull(candidate?.id),
        displayDate: normalizeDateKey(candidate?.displayDate),
        coverageStartDate,
        coverageEndDate,
        entryMode: resolveWorkLogEntryMode({
          coverageStartDate,
          coverageEndDate,
          requestedEntryMode: candidate?.entryMode,
        }),
      };
    }

    if (candidates.length < pageSize) break;
  }

  return null;
};
const resolveWorkLogRecordResponses = (workLog: any) => {
  if (Array.isArray(workLog?.workRecords) && workLog.workRecords.length > 0) {
    return workLog.workRecords.map(toWorkRecordResponse);
  }
  if (Array.isArray(workLog?.records?.rows)) {
    return ensureArray(workLog.records.rows);
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
const resolveOrderIdFromAssignmentBoardItem = (item: any): string | null =>
  extractOrderIdFromAssignmentCardText(item?.originOrderId) ??
  extractOrderIdFromAssignmentCardText(item?.cardId) ??
  extractOrderIdFromAssignmentCardText(item?.id);
const buildOrderProgressCoverageByOrderId = ({
  cards,
  assignments,
}: {
  cards: any;
  assignments: any;
}) => {
  const coverageByOrderId = new Map<
    string,
    { hasUnassignedCards: boolean; hasAssignments: boolean }
  >();
  const ensureCoverage = (orderId: string) => {
    const current = coverageByOrderId.get(orderId);
    if (current) return current;
    const next = { hasUnassignedCards: false, hasAssignments: false };
    coverageByOrderId.set(orderId, next);
    return next;
  };

  ensureArray(cards).forEach((card) => {
    if ((resolveOptionalString(card?.type, "") ?? "").toUpperCase() === "DELTA") {
      return;
    }
    const orderId = resolveOrderIdFromAssignmentBoardItem(card);
    if (!orderId) return;
    ensureCoverage(orderId).hasUnassignedCards = true;
  });

  normalizeStateAssignments(assignments).forEach((assignment) => {
    const orderId = resolveOrderIdFromAssignmentBoardItem(assignment);
    if (!orderId) return;
    ensureCoverage(orderId).hasAssignments = true;
  });

  return coverageByOrderId;
};
const resolveAutoOrderProgressStatus = ({
  isManualLocked,
  coverage,
}: {
  isManualLocked: boolean;
  coverage?: { hasUnassignedCards: boolean; hasAssignments: boolean } | null;
}): "EDITING" | "ORDER_RECEIVED" | "IN_PROGRESS" => {
  if (!isManualLocked) {
    return resolveUnlockedWorkOrderStatus();
  }
  if (!coverage) {
    return "ORDER_RECEIVED";
  }
  if (coverage.hasAssignments && !coverage.hasUnassignedCards) {
    return "IN_PROGRESS";
  }
  return "ORDER_RECEIVED";
};
const syncOrderProgressStatusesForOrg = async ({
  orgId,
  orderIds = null,
  cards = null,
  assignments = null,
  includeTerminalStages = false,
}: {
  orgId: number;
  orderIds?: string[] | null;
  cards?: any;
  assignments?: any;
  includeTerminalStages?: boolean;
}) => {
  void includeTerminalStages;
  const normalizedOrderIds = Array.from(
    new Set(
      ensureArray(orderIds)
        .map((orderId) => resolveOptionalString(orderId, null))
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  );
  const shouldLoadCards = cards == null;
  const shouldLoadAssignments = assignments == null;
  const [resolvedCards, resolvedAssignments] = await Promise.all([
    shouldLoadCards ? loadAssignmentCardsForOrg({ orgId }) : Promise.resolve(cards),
    shouldLoadAssignments
      ? prisma.assignmentBoardState.findUnique({
          where: { orgId },
          select: { assignments: true },
        })
      : Promise.resolve({ assignments }),
  ]);
  const coverageByOrderId = buildOrderProgressCoverageByOrderId({
    cards: resolvedCards,
    assignments: resolvedAssignments?.assignments ?? assignments,
  });
  const orders = await prisma.workOrder.findMany({
    where: {
      OR: getOrderAccessWhere(orgId),
      ...(normalizedOrderIds.length > 0 ? { orderId: { in: normalizedOrderIds } } : {}),
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      modificationLockedAt: true,
    },
  });
  const updates = orders.flatMap((order) => {
    const currentStatus = resolveCanonicalWorkOrderStatusForLockState({
      status: order?.status,
      isManualLocked: Boolean(order?.modificationLockedAt),
    });
    if (
      !includeTerminalStages &&
      !AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES.has(currentStatus)
    ) {
      return [];
    }
    const nextStatus = resolveAutoOrderProgressStatus({
      isManualLocked: Boolean(order?.modificationLockedAt),
      coverage:
        coverageByOrderId.get(
          resolveOptionalString(order?.orderId, null) ?? ""
        ) ?? null,
    });
    if (currentStatus === nextStatus) return [];
    return [{ id: order.id, status: nextStatus }];
  });
  if (updates.length === 0) return;

  await prisma.$transaction(
    updates.map((item) =>
      prisma.workOrder.update({
        where: { id: item.id },
        data: { status: item.status },
      })
    )
  );
};
const syncConfirmedOrdersToInProgressFromWorkRecords = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any;
}) => {
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(records);
  if (assignmentPlanIds.length === 0) return;

  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId, id: { in: assignmentPlanIds } },
    select: {
      originOrderId: true,
      cardId: true,
    },
  });
  const orderIds = Array.from(
    new Set(
      plans
        .map(
          (plan) =>
            extractOrderIdFromAssignmentCardText(plan?.originOrderId) ??
            extractOrderIdFromAssignmentCardText(plan?.cardId)
        )
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  );
  if (orderIds.length === 0) return;
  await syncOrderProgressStatusesForOrg({
    orgId,
    orderIds,
  });
};
const trySyncConfirmedOrdersToInProgressFromWorkRecords = async ({
  orgId,
  records,
  mode,
}: {
  orgId: number;
  records: any;
  mode: "create" | "update";
}) => {
  try {
    await syncConfirmedOrdersToInProgressFromWorkRecords({
      orgId,
      records,
    });
  } catch (error) {
    console.warn(
      `[order-progress-sync] orgId=${orgId} mode=${mode} failed: ${getErrorMessage(
        error,
        "failed to sync order progress after work-log save"
      )}`
    );
  }
};
const summarizeWorkLogRecordsForDebug = (records: any) =>
  ensureArray(records).slice(0, 5).map((record, index) => ({
    index,
    workerId: toPositiveIntOrNull(record?.workerId),
    workerName: resolveOptionalString(record?.workerName, null),
    orderNo: resolveOptionalString(record?.orderNo, null),
    lineId: toPositiveIntOrNull(record?.lineId),
    styleUid: toPositiveIntOrNull(record?.styleUid),
    styleId: resolveOptionalString(record?.styleId, null),
    processId: toPositiveIntOrNull(record?.processId),
    processCode: resolveOptionalString(record?.processCode, null),
    quantity: toNonNegativeInt(record?.quantity, 0),
    assignmentPlanId: toPositiveIntOrNull(record?.assignmentPlanId),
  }));
const buildWorkLogRecordTraceRows = (records: any, limit = 40) =>
  ensureArray(records)
    .slice(0, limit)
    .map((record, index) => ({
      index: index + 1,
      workerId: toPositiveIntOrNull(record?.workerId),
      workerName: resolveOptionalString(record?.workerName, null),
      assignmentPlanId: toPositiveIntOrNull(record?.assignmentPlanId),
      orderNo: resolveOptionalString(record?.orderNo, null),
      lineId: toPositiveIntOrNull(record?.lineId),
      styleUid: toPositiveIntOrNull(record?.styleUid),
      styleId: resolveOptionalString(record?.styleId, null),
      styleName: resolveOptionalString(record?.styleName, null),
      processId: toPositiveIntOrNull(record?.processId),
      processCode: resolveOptionalString(record?.processCode, null),
      quantity: toNonNegativeInt(record?.quantity, 0),
      ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
    }));
const logWorkLogRecordTrace = (label: string, records: any) => {
  const rows = buildWorkLogRecordTraceRows(records);
  if (rows.length === 0) return;
  console.log(`${label} recordRows=${rows.length}`);
  console.table(rows);
};
const summarizeWorkLogPayloadForDebug = (payload: any = {}) => {
  const records = ensureArray(payload?.records);
  return {
    workDate: normalizeDateKey(payload?.workDate),
    coverageStartDate: normalizeDateKey(payload?.coverageStartDate),
    coverageEndDate: normalizeDateKey(payload?.coverageEndDate),
    entryMode: resolveOptionalString(payload?.entryMode, null),
    factoryId: toPositiveIntOrNull(payload?.factoryId),
    lineId: toPositiveIntOrNull(payload?.lineId),
    workerCount: toNonNegativeInt(payload?.workerCount, 0),
    itemCount: toNonNegativeInt(payload?.itemCount, records.length),
    totalCtSeconds: toNonNegativeInt(payload?.totalCtSeconds, 0),
    noteLength: resolveOptionalString(payload?.note, "")?.length ?? 0,
    recordCount: records.length,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(records).slice(0, 10),
    recordsPreview: summarizeWorkLogRecordsForDebug(records),
  };
};
const createWorkLogMutationTrace = ({
  req,
  mode,
  payload,
  workLogId = null,
}: {
  req: any;
  mode: "create" | "update" | "delete";
  payload?: any;
  workLogId?: number | null;
}) => {
  const requestId = `wl-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const trace = {
    requestId,
    mode,
    step: "start",
    workLogId,
    payloadSummary: summarizeWorkLogPayloadForDebug(payload),
  };
  req.__workLogTrace = trace;
  console.log(
    `[work-logs:${mode}] req=${requestId} step=start`,
    trace.payloadSummary
  );
  logWorkLogRecordTrace(
    `[work-logs:${mode}] req=${requestId} step=start`,
    payload?.records
  );
  return trace;
};
const updateWorkLogMutationTrace = (
  trace: {
    requestId: string;
    mode: "create" | "update" | "delete";
    step: string;
    workLogId?: number | null;
    payloadSummary?: any;
  } | null,
  step: string,
  details: Record<string, unknown> | null = null
) => {
  if (!trace) return;
  trace.step = step;
  if (details && Object.keys(details).length > 0) {
    console.log(
      `[work-logs:${trace.mode}] req=${trace.requestId} step=${step}`,
      details
    );
    return;
  }
  console.log(`[work-logs:${trace.mode}] req=${trace.requestId} step=${step}`);
};
const trySyncAssignmentPlanSideEffectsAfterWorkLogMutation = async ({
  orgId,
  assignmentPlanIds,
  mode,
}: {
  orgId: number;
  assignmentPlanIds: any;
  mode: "create" | "update" | "delete";
}) => {
  const normalizedPlanIds = Array.from(
    new Set(
      ensureArray(assignmentPlanIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
  if (normalizedPlanIds.length === 0) return;

  // Important:
  // Mutating persisted board/plan schedule from work-log deltas can accumulate drift
  // when users edit or delete logs repeatedly across environments.
  // Keep schedule mutation disabled by default and rely on deterministic
  // progress snapshot recomputation for rendering.
  const shouldMutateScheduleFromWorkLogs =
    resolveOptionalString(process.env.ENABLE_WORKLOG_SCHEDULE_SYNC, "")?.toLowerCase?.() ===
    "true";
  if (shouldMutateScheduleFromWorkLogs) {
    // Work-log mutation is already committed at this point.
    // Downstream assignment sync should not flip the API response to a failure.
    try {
      await syncAssignmentSchedulesFromWorkRecordPlans({
        orgId,
        assignmentPlanIds: normalizedPlanIds,
      });
    } catch (error) {
      console.warn(
        `[work-logs:${mode}] orgId=${orgId} assignment schedule sync failed: ${getErrorMessage(
          error,
          "failed to sync assignment schedules after work-log mutation"
        )}`
      );
    }
  }

  try {
    await persistAssignmentPlanProgressSnapshot({
      orgId,
      assignmentPlanIds: normalizedPlanIds,
    });
  } catch (error) {
    console.warn(
      `[work-logs:${mode}] orgId=${orgId} assignment progress snapshot sync failed: ${getErrorMessage(
        error,
        "failed to persist assignment progress snapshot after work-log mutation"
      )}`
    );
  }
};
const toUtcDateFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): Date | null => {
  const dateKey = normalizeDateKey(dateKeyInput);
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate;
};
const toDateKeyFromUtcDateForAssignmentSchedule = (date: Date): string =>
  date.toISOString().slice(0, 10);
const shiftDateKeyByDaysForAssignmentSchedule = (
  dateKeyInput: any,
  days: number
): string | null => {
  const baseDate = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!baseDate) return null;
  baseDate.setUTCDate(baseDate.getUTCDate() + Math.trunc(days));
  return toDateKeyFromUtcDateForAssignmentSchedule(baseDate);
};
const diffDateKeysByDaysForAssignmentSchedule = (
  fromDateKeyInput: any,
  toDateKeyInput: any
): number | null => {
  const fromDate = toUtcDateFromDateKeyForAssignmentSchedule(fromDateKeyInput);
  const toDate = toUtcDateFromDateKeyForAssignmentSchedule(toDateKeyInput);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
};
const countDateRangeDaysInclusiveForAssignmentSchedule = (
  startDateKeyInput: any,
  endDateKeyInput: any
): number => {
  const diffDays = diffDateKeysByDaysForAssignmentSchedule(
    startDateKeyInput,
    endDateKeyInput
  );
  if (diffDays == null || diffDays < 0) return 0;
  return diffDays + 1;
};
const toEpochDayFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): number | null => {
  const date = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!date) return null;
  return Math.trunc(date.getTime() / (24 * 60 * 60 * 1000));
};
const resolveAssignmentProducedQuantityFromProcessTotals = ({
  processTotals,
  baselineQuantity: _baselineQuantity,
}: {
  processTotals: number[];
  baselineQuantity: number | null;
}): number => {
  const normalizedTotals = ensureArray(processTotals)
    .map((value) => Math.max(0, Math.round(Number(value) || 0)))
    .filter((value) => value > 0);
  if (normalizedTotals.length === 0) return 0;
  if (normalizedTotals.length === 1) return normalizedTotals[0]!;
  // 완제품 수량은 공정별 누적의 최소값으로 본다.
  return Math.min(...normalizedTotals);
};
const resolveAssignmentPlanClosedQty = (plan: any) =>
  toOptionalNonNegativeInt(plan?.closedQty, toOptionalNonNegativeInt(plan?.finalQuantity, null));

const resolveAssignmentPlanClosedAtValue = (plan: any) =>
  toOptionalDateValue(plan?.closedAt, toOptionalDateValue(plan?.completedAt, null));

const resolveAssignmentPlanClosedAt = (plan: any) =>
  toIsoDateStringOrNull(resolveAssignmentPlanClosedAtValue(plan));

const resolveAssignmentPlanCloseMode = ({
  closedQty,
  targetQty,
}: {
  closedQty: number | null;
  targetQty: number | null;
}): "FULL" | "SHORT" | "OVER" | null => {
  if (closedQty == null) return null;
  if (targetQty == null || targetQty <= 0) return "FULL";
  if (closedQty === targetQty) return "FULL";
  if (closedQty < targetQty) return "SHORT";
  return "OVER";
};

const resolveAssignmentPlanCloseBasis = (plan: any): "QC_BASED" | "MANUAL" | null => {
  const basis = resolveOptionalString(plan?.closeBasis, null);
  if (basis === "QC_BASED" || basis === "MANUAL") return basis;
  return null;
};
const resolveAssignmentPlanLatestQcDate = (plan: any) =>
  normalizeDateKey(plan?.latestQcDate) || null;

const resolveAssignmentPlanQcPassedTotal = (plan: any) =>
  Math.max(0, Math.round(Number(plan?.qcPassedTotal ?? 0) || 0));

const normalizeQcPassEventSizeKey = (value: any) => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, "") || null;
};

const buildQcPassEventResponse = (event: any) => ({
  id: toPositiveIntOrNull(event?.id),
  assignmentPlanId: toPositiveIntOrNull(event?.assignmentPlanId),
  inspectedOn: normalizeDateKey(event?.inspectedOn) || null,
  passedQuantity: Math.max(0, Math.round(Number(event?.passedQuantity ?? 0) || 0)),
  colorId: toPositiveIntOrNull(event?.colorId),
  colorName:
    resolveOptionalString(event?.attrColor?.name, null) ??
    resolveOptionalString(event?.attrColor?.nameKo, null) ??
    resolveOptionalString(event?.attrColor?.code, null),
  sizeKey: normalizeQcPassEventSizeKey(event?.sizeKey),
  note: resolveOptionalString(event?.note, null),
  sourceType:
    resolveOptionalString(event?.sourceType, null) === "MIGRATED_LEGACY"
      ? "MIGRATED_LEGACY"
      : "MANUAL",
  cancelledAt: toIsoDateStringOrNull(toOptionalDateValue(event?.cancelledAt, null)),
  cancelledBy: resolveOptionalString(event?.cancelledBy, null),
  createdAt: toIsoDateStringOrNull(toOptionalDateValue(event?.createdAt, null)),
  createdBy: resolveOptionalString(event?.createdBy, null),
});

const syncAssignmentPlanQcAggregate = async ({
  orgId,
  planId,
  db = prisma,
}: {
  orgId: number;
  planId: number;
  db?: any;
}) => {
  const normalizedPlanId = toPositiveIntOrNull(planId);
  if (normalizedPlanId == null) {
    return { qcPassedTotal: 0, latestQcDate: null };
  }

  const aggregate = await db.qcPassEvent.aggregate({
    where: {
      orgId,
      assignmentPlanId: normalizedPlanId,
      cancelledAt: null,
    },
    _sum: { passedQuantity: true },
    _max: { inspectedOn: true },
  });

  const qcPassedTotal = Math.max(
    0,
    Math.round(Number(aggregate?._sum?.passedQuantity ?? 0) || 0)
  );
  const latestQcDate = normalizeDateKey(aggregate?._max?.inspectedOn) || null;

  try {
    await db.assignmentPlan.update({
      where: { id: normalizedPlanId },
      data: {
        qcPassedTotal,
        latestQcDate,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) {
      throw error;
    }
    console.warn(
      "[assignment-plan][qc-aggregate] skip legacy qc summary column update (schema out of sync)"
    );
  }

  return { qcPassedTotal, latestQcDate };
};

const findAssignmentPlanForQcEvent = async ({
  orgId,
  assignmentPlanRef,
  db = prisma,
}: {
  orgId: number;
  assignmentPlanRef: any;
  db?: any;
}) => {
  const externalId = resolveOptionalString(assignmentPlanRef, null);
  if (externalId) {
    const byExternalId = await db.assignmentPlan.findFirst({
      where: { orgId, externalId },
      select: {
        id: true,
        externalId: true,
        quantity: true,
        isCompleted: true,
        finalQuantity: true,
        completedAt: true,
        closedQty: true,
        closedAt: true,
      },
    });
    if (byExternalId) return byExternalId;
  }

  const numericId = toPositiveIntOrNull(assignmentPlanRef);
  if (numericId == null) return null;
  return db.assignmentPlan.findFirst({
    where: { orgId, id: numericId },
    select: {
      id: true,
      externalId: true,
      quantity: true,
      isCompleted: true,
      finalQuantity: true,
      completedAt: true,
      closedQty: true,
      closedAt: true,
    },
  });
};
const resolveWorkRecordProcessBucketKeyForAssignmentSchedule = (
  value: any
): string => {
  const processId = toPositiveIntOrNull(value?.processId);
  if (processId != null) return `id:${processId}`;
  const processCode = resolveOptionalString(value?.processCode, null);
  if (processCode) return `code:${normalizeComparableText(processCode)}`;
  return "unknown";
};
const allocateExtendedDurationsByPlannedRatio = (
  plannedDurations: number[],
  targetTotalDays: number
): number[] => {
  const normalizedPlanned = ensureArray(plannedDurations).map((value) =>
    Math.max(1, Math.round(Number(value) || 1))
  );
  if (normalizedPlanned.length === 0) return [];
  const plannedTotal = normalizedPlanned.reduce((sum, value) => sum + value, 0);
  if (targetTotalDays <= plannedTotal) {
    return [...normalizedPlanned];
  }

  const extraDays = targetTotalDays - plannedTotal;
  const baseAdds = normalizedPlanned.map((duration) =>
    Math.floor((duration / plannedTotal) * extraDays)
  );
  let remaining = extraDays - baseAdds.reduce((sum, value) => sum + value, 0);
  const rankedByRemainder = normalizedPlanned
    .map((duration, index) => ({
      index,
      remainder: (duration / plannedTotal) * extraDays - (baseAdds[index] || 0),
    }))
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.index - b.index;
    });
  for (let i = 0; i < rankedByRemainder.length && remaining > 0; i += 1) {
    const targetIndex = rankedByRemainder[i]!.index;
    baseAdds[targetIndex] = (baseAdds[targetIndex] || 0) + 1;
    remaining -= 1;
  }

  return normalizedPlanned.map((duration, index) => duration + (baseAdds[index] || 0));
};
const syncAssignmentSchedulesFromWorkRecordPlans = async ({
  orgId,
  assignmentPlanIds,
}: {
  orgId: number;
  assignmentPlanIds: any;
}): Promise<{ updatedAssignmentCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(assignmentPlanIds);
  if (normalizedPlanIds.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const [boardState, affectedPlans] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { id: true, assignments: true },
    }),
    prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: normalizedPlanIds } },
      select: { id: true, externalId: true, lineId: true },
    }),
  ]);
  if (!boardState || affectedPlans.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const lineIds = Array.from(
    new Set(
      affectedPlans
        .map((plan) => toPositiveIntOrNull(plan?.lineId))
        .filter((lineId): lineId is number => lineId !== null)
    )
  );
  if (lineIds.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const linePlans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      lineId: { in: lineIds },
    },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      quantity: true,
      startIndex: true,
      endIndex: true,
      startDayOffsetPercent: true,
      startDayPercent: true,
      endDayPercent: true,
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });
  if (linePlans.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const linePlanIds = linePlans.map((plan) => plan.id);
  const workRecords =
    linePlanIds.length > 0
      ? await prisma.workRecord.findMany({
          where: {
            orgId,
            assignmentPlanId: { in: linePlanIds },
          },
          select: {
            assignmentPlanId: true,
            processId: true,
            processCode: true,
            quantity: true,
            workLog: {
              select: {
                displayDate: true,
              },
            },
          },
        })
      : [];

  const baselineQuantityByPlanId = linePlans.reduce((map, plan) => {
    const baselineQuantity = toOptionalNonNegativeInt(plan?.quantity, null);
    if (baselineQuantity != null && baselineQuantity > 0) {
      map.set(plan.id, baselineQuantity);
    }
    return map;
  }, new Map<number, number>());

  const processBucketsByPlanDate = new Map<
    number,
    Map<string, Map<string, number>>
  >();
  workRecords.forEach((record) => {
    const planId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (!planId || !baselineQuantityByPlanId.has(planId)) return;
    const workDateKey = normalizeDateKey(record?.workLog?.displayDate);
    if (!workDateKey) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;

    const byDate = processBucketsByPlanDate.get(planId) || new Map<string, Map<string, number>>();
    const byProcess =
      byDate.get(workDateKey) || new Map<string, number>();
    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    byProcess.set(processKey, (byProcess.get(processKey) || 0) + quantity);
    byDate.set(workDateKey, byProcess);
    processBucketsByPlanDate.set(planId, byDate);
  });

  const completionDateByPlanId = new Map<number, string>();
  linePlans.forEach((plan) => {
    const baselineQuantity = baselineQuantityByPlanId.get(plan.id);
    if (baselineQuantity == null || baselineQuantity <= 0) return;

    const byDate = processBucketsByPlanDate.get(plan.id);
    if (!byDate || byDate.size === 0) return;

    const cumulativeByProcess = new Map<string, number>();
    const sortedDateKeys = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    for (const dateKey of sortedDateKeys) {
      const byProcess = byDate.get(dateKey);
      if (!byProcess) continue;
      byProcess.forEach((value, processKey) => {
        cumulativeByProcess.set(
          processKey,
          (cumulativeByProcess.get(processKey) || 0) + Math.max(0, Math.round(value))
        );
      });

      const producedQuantity = resolveAssignmentProducedQuantityFromProcessTotals({
        processTotals: Array.from(cumulativeByProcess.values()),
        baselineQuantity,
      });
      if (producedQuantity >= baselineQuantity) {
        completionDateByPlanId.set(plan.id, dateKey);
        break;
      }
    }
  });

  const planByExternalId = linePlans.reduce((map, plan) => {
    if (!plan?.externalId || map.has(plan.externalId)) return map;
    map.set(plan.externalId, plan);
    return map;
  }, new Map<string, any>());
  const targetLineIdSet = new Set(lineIds.map((lineId) => String(lineId)));

  const stateAssignments = normalizeStateAssignments(boardState.assignments);
  const changedExternalIds = new Set<string>();

  const updateAssignmentRange = ({
    entry,
    nextStartDateKey,
    nextEndDateKey,
    epochOffset,
  }: {
    entry: any;
    nextStartDateKey: string;
    nextEndDateKey: string;
    epochOffset: number | null;
  }) => {
    const nextStartEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(nextStartDateKey);
    const nextEndEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(nextEndDateKey);
    if (nextStartEpochDay == null || nextEndEpochDay == null) return;

    const nextStartIndexRaw =
      epochOffset == null ? toSignedInt(entry.assignment?.startIndex, 0) : nextStartEpochDay - epochOffset;
    const nextEndIndexRaw =
      epochOffset == null ? toSignedInt(entry.assignment?.endIndex, nextStartIndexRaw) : nextEndEpochDay - epochOffset;
    const nextStartIndex = Math.max(0, Math.trunc(nextStartIndexRaw));
    const nextEndIndex = Math.max(nextStartIndex, Math.trunc(nextEndIndexRaw));

    const prevStartDateKey = normalizeDateKey(entry.assignment?.startDateKey) || entry.startDateKey;
    const prevEndDateKey = normalizeDateKey(entry.assignment?.endDateKey) || entry.endDateKey;
    const prevStartIndex = toSignedInt(entry.assignment?.startIndex, 0);
    const prevEndIndex = Math.max(
      prevStartIndex,
      toSignedInt(entry.assignment?.endIndex, prevStartIndex)
    );

    const isChanged =
      prevStartDateKey !== nextStartDateKey ||
      prevEndDateKey !== nextEndDateKey ||
      prevStartIndex !== nextStartIndex ||
      prevEndIndex !== nextEndIndex;
    if (!isChanged) return;

    entry.startDateKey = nextStartDateKey;
    entry.endDateKey = nextEndDateKey;
    entry.assignment = {
      ...entry.assignment,
      startDateKey: nextStartDateKey,
      endDateKey: nextEndDateKey,
      startIndex: nextStartIndex,
      endIndex: nextEndIndex,
    };
    changedExternalIds.add(entry.externalId);
  };

  lineIds.forEach((lineId) => {
    const lineIdText = String(lineId);
    if (!targetLineIdSet.has(lineIdText)) return;

    const lineCandidates = stateAssignments
      .map((assignment, stateIndex) => ({ assignment, stateIndex }))
      .filter(({ assignment }) => String(assignment?.lineId ?? "") === lineIdText)
      .filter(({ assignment }) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId) return false;
        const plan = planByExternalId.get(externalId);
        return Boolean(plan && Number(plan.lineId) === Number(lineId));
      });
    if (lineCandidates.length === 0) return;

    let missingDateCandidateCount = 0;
    const lineEntries = lineCandidates
      .map(({ assignment, stateIndex }) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId) return null;
        const plan = planByExternalId.get(externalId);
        if (!plan || Number(plan.lineId) !== Number(lineId)) return null;

        const startDateKey =
          normalizeDateKey(assignment?.startDateKey) ||
          normalizeDateKey(resolveAssignmentStartDateKey(assignment));
        const endDateKeyFromState = normalizeDateKey(assignment?.endDateKey);
        const startIndex = toSignedInt(assignment?.startIndex, 0);
        const endIndex = Math.max(startIndex, toSignedInt(assignment?.endIndex, startIndex));
        const fallbackSpanDays = Math.max(0, endIndex - startIndex);
        const endDateKey =
          endDateKeyFromState ||
          (startDateKey
            ? shiftDateKeyByDaysForAssignmentSchedule(startDateKey, fallbackSpanDays)
            : null);
        if (!startDateKey || !endDateKey) {
          missingDateCandidateCount += 1;
          return null;
        }

        const plannedDurationDays = Math.max(
          1,
          countDateRangeDaysInclusiveForAssignmentSchedule(startDateKey, endDateKey)
        );
        return {
          externalId,
          planId: plan.id,
          stateIndex,
          assignment: { ...assignment },
          startDateKey,
          endDateKey,
          plannedDurationDays,
          completionDateKey:
            normalizeDateKey(completionDateByPlanId.get(plan.id) || "") || null,
        };
      })
      .filter((entry): entry is any => Boolean(entry))
      .sort((a, b) => {
        const startCompare = a.startDateKey.localeCompare(b.startDateKey);
        if (startCompare !== 0) return startCompare;
        const endCompare = a.endDateKey.localeCompare(b.endDateKey);
        if (endCompare !== 0) return endCompare;
        return String(a.externalId).localeCompare(String(b.externalId));
      });
    if (missingDateCandidateCount > 0) return;
    if (lineEntries.length === 0) return;

    const anchorEpochOffsets = lineEntries
      .map((entry) => {
        const startEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(entry.startDateKey);
        if (startEpochDay == null) return null;
        const startIndex = toSignedInt(entry.assignment?.startIndex, 0);
        return startEpochDay - startIndex;
      })
      .filter((value): value is number => Number.isFinite(value));
    const epochOffset = anchorEpochOffsets.length > 0 ? anchorEpochOffsets[0]! : null;

    const chains: any[][] = [];
    lineEntries.forEach((entry) => {
      const lastChain = chains.length > 0 ? chains[chains.length - 1]! : null;
      if (!lastChain || lastChain.length === 0) {
        chains.push([entry]);
        return;
      }
      const prev = lastChain[lastChain.length - 1];
      const gapFromPrev = diffDateKeysByDaysForAssignmentSchedule(
        prev.endDateKey,
        entry.startDateKey
      );
      if (gapFromPrev != null && gapFromPrev <= 1) {
        lastChain.push(entry);
        return;
      }
      chains.push([entry]);
    });

    chains.forEach((chain) => {
      let cursor = 0;
      while (cursor < chain.length) {
        const first = chain[cursor];
        if (!first?.completionDateKey) {
          cursor += 1;
          continue;
        }
        let blockEndIndex = cursor;
        while (blockEndIndex + 1 < chain.length && chain[blockEndIndex + 1]?.completionDateKey) {
          blockEndIndex += 1;
        }
        const block = chain.slice(cursor, blockEndIndex + 1);
        const oldBlockEndDateKey = block[block.length - 1]!.endDateKey;
        const blockCompletionKeys = block
          .map((entry) => normalizeDateKey(entry?.completionDateKey))
          .filter((value): value is string => Boolean(value));
        if (blockCompletionKeys.length === 0) {
          cursor = blockEndIndex + 1;
          continue;
        }
        const actualBlockEndDateKey = blockCompletionKeys.reduce((max, key) =>
          key > max ? key : max
        );
        const overrunDays = diffDateKeysByDaysForAssignmentSchedule(
          oldBlockEndDateKey,
          actualBlockEndDateKey
        );
        if (overrunDays == null || overrunDays <= 0) {
          cursor = blockEndIndex + 1;
          continue;
        }

        const uniqueCompletionDates = new Set(blockCompletionKeys);
        const shouldDistributeByRatio =
          block.length > 1 && uniqueCompletionDates.size === 1;

        if (shouldDistributeByRatio) {
          const blockStartDateKey = block[0]!.startDateKey;
          const targetTotalDays = countDateRangeDaysInclusiveForAssignmentSchedule(
            blockStartDateKey,
            actualBlockEndDateKey
          );
          if (targetTotalDays > 0) {
            const plannedDurations = block.map((entry) =>
              Math.max(
                1,
                countDateRangeDaysInclusiveForAssignmentSchedule(
                  entry.startDateKey,
                  entry.endDateKey
                )
              )
            );
            const allocatedDurations = allocateExtendedDurationsByPlannedRatio(
              plannedDurations,
              targetTotalDays
            );
            let nextStartDateKey: string | null = blockStartDateKey;
            block.forEach((entry, index) => {
              if (!nextStartDateKey) return;
              const allocatedDays = Math.max(1, allocatedDurations[index] || 1);
              const nextEndDateKey =
                shiftDateKeyByDaysForAssignmentSchedule(
                  nextStartDateKey,
                  allocatedDays - 1
                ) || nextStartDateKey;
              updateAssignmentRange({
                entry,
                nextStartDateKey,
                nextEndDateKey,
                epochOffset,
              });
              nextStartDateKey =
                shiftDateKeyByDaysForAssignmentSchedule(nextEndDateKey, 1) || null;
            });
          }
        } else {
          let nextStartDateKey: string | null = block[0]!.startDateKey;
          block.forEach((entry) => {
            if (!nextStartDateKey) return;
            const plannedDays = Math.max(
              1,
              countDateRangeDaysInclusiveForAssignmentSchedule(
                entry.startDateKey,
                entry.endDateKey
              )
            );
            const minEndDateKey =
              shiftDateKeyByDaysForAssignmentSchedule(nextStartDateKey, plannedDays - 1) ||
              nextStartDateKey;
            const completionDateKey = normalizeDateKey(entry?.completionDateKey);
            const nextEndDateKey =
              completionDateKey && completionDateKey > minEndDateKey
                ? completionDateKey
                : minEndDateKey;
            updateAssignmentRange({
              entry,
              nextStartDateKey,
              nextEndDateKey,
              epochOffset,
            });
            nextStartDateKey =
              shiftDateKeyByDaysForAssignmentSchedule(nextEndDateKey, 1) || null;
          });
        }

        const newBlockEndDateKey = block[block.length - 1]!.endDateKey;
        const shiftedDays = diffDateKeysByDaysForAssignmentSchedule(
          oldBlockEndDateKey,
          newBlockEndDateKey
        );
        if (shiftedDays != null && shiftedDays > 0) {
          for (let i = blockEndIndex + 1; i < chain.length; i += 1) {
            const target = chain[i]!;
            const shiftedStart =
              shiftDateKeyByDaysForAssignmentSchedule(target.startDateKey, shiftedDays) ||
              target.startDateKey;
            const shiftedEnd =
              shiftDateKeyByDaysForAssignmentSchedule(target.endDateKey, shiftedDays) ||
              target.endDateKey;
            updateAssignmentRange({
              entry: target,
              nextStartDateKey: shiftedStart,
              nextEndDateKey: shiftedEnd,
              epochOffset,
            });
          }
        }

        cursor = blockEndIndex + 1;
      }
    });

    lineEntries.forEach((entry) => {
      stateAssignments[entry.stateIndex] = normalizeStateAssignmentItem(entry.assignment);
    });
  });

  if (changedExternalIds.size === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const nextAssignments = stateAssignments.map((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || !changedExternalIds.has(externalId)) {
      return normalizeStateAssignmentItem(assignment);
    }
    return normalizeStateAssignmentItem({
      ...assignment,
      id: externalId,
    });
  });

  const nextAssignmentByExternalId = nextAssignments.reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());
  const planUpdates = linePlans
    .filter((plan) => changedExternalIds.has(plan.externalId))
    .map((plan) => {
      const assignment = nextAssignmentByExternalId.get(plan.externalId);
      if (!assignment) return null;
      const startIndex = toSignedInt(assignment?.startIndex, plan.startIndex);
      const endIndex = Math.max(
        startIndex,
        toSignedInt(assignment?.endIndex, Math.max(startIndex, plan.endIndex))
      );
      return {
        id: plan.id,
        data: {
          startIndex,
          endIndex,
          startDayOffsetPercent: toOptionalFloat(
            assignment?.startDayOffsetPercent,
            plan.startDayOffsetPercent ?? null
          ),
          startDayPercent: toOptionalFloat(
            assignment?.startDayPercent,
            plan.startDayPercent ?? null
          ),
          endDayPercent: toOptionalFloat(
            assignment?.endDayPercent,
            plan.endDayPercent ?? null
          ),
          updatedAt: new Date(),
        } as Prisma.AssignmentPlanUncheckedUpdateInput,
      };
    })
    .filter((item): item is { id: number; data: Prisma.AssignmentPlanUncheckedUpdateInput } =>
      Boolean(item)
    );

  await prisma.$transaction(async (tx) => {
    await tx.assignmentBoardState.update({
      where: { id: boardState.id },
      data: {
        assignments: nextAssignments,
      },
    });
    if (planUpdates.length > 0) {
      await Promise.all(
        planUpdates.map((row) =>
          tx.assignmentPlan.update({
            where: { id: row.id },
            data: row.data,
          })
        )
      );
    }
  });

  return {
    updatedAssignmentCount: changedExternalIds.size,
  };
};
const syncAssignmentSchedulesFromWorkRecords = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any;
}): Promise<{ updatedAssignmentCount: number }> =>
  syncAssignmentSchedulesFromWorkRecordPlans({
    orgId,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(records),
  });
const normalizeAssignmentScheduleRepairPayload = (
  value: any,
  fallback: any = null
): {
  startIndex: number;
  endIndex: number;
  startDayOffsetPercent: number | null;
  startDayPercent: number | null;
  endDayPercent: number | null;
  startDateKey: string | null;
  endDateKey: string | null;
} | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const fallbackStartIndex = toSignedInt(fallback?.startIndex, 0);
  const startIndex = toSignedInt(value?.startIndex, fallbackStartIndex);
  const endIndex = Math.max(startIndex, toSignedInt(value?.endIndex, startIndex));
  const startDateKey = normalizeDateKey(value?.startDateKey) || null;
  const endDateKey = normalizeDateKey(value?.endDateKey) || startDateKey;

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: toOptionalFloat(value?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(value?.startDayPercent, null),
    endDayPercent: toOptionalFloat(value?.endDayPercent, null),
    startDateKey,
    endDateKey,
  };
};
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
const resolveWorkRecordStyleMetric = (record: any) => {
  const styleUid = toPositiveIntOrNull(record?.styleUid);
  if (styleUid) {
    return {
      styleMetricKey: `uid:${styleUid}`,
      styleLabel:
        resolveOptionalString(record?.styleId, null) ??
        resolveOptionalString(record?.styleName, null) ??
        `UID:${styleUid}`,
    };
  }
  const styleId = resolveOptionalString(record?.styleId, null);
  if (styleId) {
    return {
      styleMetricKey: `id:${normalizeComparableText(styleId)}`,
      styleLabel: styleId,
    };
  }
  const styleName = resolveOptionalString(record?.styleName, null);
  if (styleName) {
    return {
      styleMetricKey: `name:${normalizeComparableText(styleName)}`,
      styleLabel: styleName,
    };
  }
  const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
  if (assignmentPlanId) {
    return {
      styleMetricKey: `plan:${assignmentPlanId}`,
      styleLabel: `assignmentPlan#${assignmentPlanId}`,
    };
  }
  return { styleMetricKey: "", styleLabel: "미지정 스타일" };
};
const buildWorkRecordWorkerStyleProcessSignature = (record: any) => {
  const workerId = toPositiveIntOrNull(record?.workerId);
  if (!workerId) return null;
  const styleMetric = resolveWorkRecordStyleMetric(record);
  if (!styleMetric.styleMetricKey) return null;
  const processMetric = resolveWorkRecordProcessMetricFromRecord(record);
  if (!processMetric.processMetricKey || processMetric.processMetricKey === "unknown") {
    return null;
  }
  return `${workerId}::${styleMetric.styleMetricKey}::${processMetric.processMetricKey}`;
};
const formatWorkerStyleProcessIdentityLabel = (record: any) => {
  const workerId = toPositiveIntOrNull(record?.workerId);
  const workerLabel =
    resolveOptionalString(record?.workerName, null) ??
    (workerId ? `worker#${workerId}` : "미지정 작업자");
  const styleLabel = resolveWorkRecordStyleMetric(record).styleLabel;
  const processLabel = resolveWorkRecordProcessMetricFromRecord(record).processLabel;
  return [workerLabel, styleLabel, processLabel].filter(Boolean).join(" / ");
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
const validateWorkLogAssignmentPlanCtSnapshot = async ({
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
  void lineId;

  let plans: any[] = [];
  try {
    plans = await prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: assignmentPlanIds } },
      select: {
        id: true,
        externalId: true,
        lineId: true,
        assignmentCtSnapshot: true,
        ctTotalSeconds: true,
        orderNo: true,
        label: true,
        colorName: true,
        isCompleted: true,
        completedAt: true,
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    plans = await prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: assignmentPlanIds } },
      select: {
        id: true,
        externalId: true,
        lineId: true,
        assignmentCtSnapshot: true,
        orderNo: true,
        label: true,
        colorName: true,
        isCompleted: true,
        completedAt: true,
      },
    });
  }
  const planById = new Map(plans.map((plan: any) => [plan.id, plan]));

  const missingPlanIds = assignmentPlanIds.filter(
    (planId) => !planById.has(planId)
  );
  if (missingPlanIds.length > 0) {
    return {
      status: 400,
      error: `assignment plan not found (${missingPlanIds.join(",")})`,
    };
  }

  const completedPlans = plans.filter((plan) => plan?.isCompleted === true);
  if (completedPlans.length > 0) {
    const preview = completedPlans
      .slice(0, 3)
      .map((plan) => formatAssignmentPlanLabel(plan))
      .join(", ");
    const extraText =
      completedPlans.length > 3
        ? ` (+${completedPlans.length - 3} more)`
        : "";
    return {
      status: 409,
      error: `assignment plan already completed (${preview}${extraText})`,
    };
  }

  const missingSnapshotPlans = plans.filter((plan) => {
    const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
    return !ctSnapshot || resolveAssignmentCtTotalSeconds(plan) == null;
  });
  if (missingSnapshotPlans.length > 0) {
    const preview = missingSnapshotPlans
      .slice(0, 3)
      .map((plan) => formatAssignmentPlanLabel(plan))
      .join(", ");
    const extraText =
      missingSnapshotPlans.length > 3
        ? ` (+${missingSnapshotPlans.length - 3} more)`
        : "";
    return {
      status: 400,
      error: `ct snapshot required before work log (${preview}${extraText})`,
    };
  }

  return { status: 200, error: null as string | null };
};
const validateWorkLogWorkerStyleProcessDuplicates = async ({
  orgId,
  workDate,
  records,
  excludedWorkLogId = null,
}: {
  orgId: number;
  workDate: string;
  records: any;
  excludedWorkLogId?: number | null;
}) => {
  const normalizedWorkDate = normalizeDateKey(workDate);
  if (!normalizedWorkDate) {
    return { status: 400, error: "invalid workDate" };
  }

  const incomingRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (incomingRecords.length === 0) {
    return { status: 200, error: null as string | null };
  }

  const firstIncomingRecordBySignature = new Map<string, any>();
  const incomingDuplicateRows: any[] = [];
  incomingRecords.forEach((record) => {
    const signature = buildWorkRecordWorkerStyleProcessSignature(record);
    if (!signature) return;
    if (firstIncomingRecordBySignature.has(signature)) {
      incomingDuplicateRows.push(record);
      return;
    }
    firstIncomingRecordBySignature.set(signature, record);
  });

  if (incomingDuplicateRows.length > 0) {
    const preview = incomingDuplicateRows
      .slice(0, 3)
      .map((record) => formatWorkerStyleProcessIdentityLabel(record))
      .join("; ");
    const extraText =
      incomingDuplicateRows.length > 3
        ? ` (+${incomingDuplicateRows.length - 3} more)`
        : "";
    return {
      status: 400,
      error: `duplicate worker-style-process on workDate: ${preview}${extraText}`,
    };
  }

  const workerIds = collectPositiveIntSet(
    ...incomingRecords.map((record) => record?.workerId)
  );
  if (workerIds.length === 0 || firstIncomingRecordBySignature.size === 0) {
    return { status: 200, error: null as string | null };
  }

  const existingRows = await prisma.workRecord.findMany({
    where: {
      orgId,
      workerId: { in: workerIds },
      workLog: {
        orgId,
        displayDate: normalizedWorkDate,
        ...(excludedWorkLogId ? { id: { not: excludedWorkLogId } } : {}),
      },
    },
    select: {
      workerId: true,
      workerName: true,
      styleUid: true,
      styleId: true,
      styleName: true,
      processId: true,
      processCode: true,
      assignmentPlanId: true,
      process: {
        select: { name: true },
      },
    },
  });

  const existingSignatureSet = new Set<string>();
  existingRows.forEach((row) => {
    const signature = buildWorkRecordWorkerStyleProcessSignature({
      workerId: row.workerId,
      workerName: row.workerName,
      styleUid: row.styleUid,
      styleId: row.styleId,
      styleName: row.styleName,
      processId: row.processId,
      processCode: row.processCode,
      processName: row.process?.name ?? null,
      assignmentPlanId: row.assignmentPlanId,
    });
    if (signature) existingSignatureSet.add(signature);
  });

  const conflictRows = Array.from(firstIncomingRecordBySignature.entries())
    .filter(([signature]) => existingSignatureSet.has(signature))
    .map(([, record]) => record);
  if (conflictRows.length > 0) {
    const preview = conflictRows
      .slice(0, 3)
      .map((record) => formatWorkerStyleProcessIdentityLabel(record))
      .join("; ");
    const extraText =
      conflictRows.length > 3 ? ` (+${conflictRows.length - 3} more)` : "";
    return {
      status: 400,
      error: `duplicate worker-style-process on workDate: ${preview}${extraText}`,
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
  const normalizedWorkDate = normalizeDateKey(workDate);
  if (!normalizedWorkDate) {
    return {
      status: 400,
      error: "invalid workDate",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

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

  const dateRange = buildWorkDateRange(normalizedWorkDate);
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
  let missingWorkerIds = workerIds.filter(
    (workerId) => !matchedWorkerIdSet.has(workerId)
  );

  // 과거 작업일 기준 배정 이력이 비어 있는 경우(월말 일괄입력 등)에는
  // 현재 활성 배정(endAt = null)도 허용해 작업 기록 입력이 막히지 않도록 한다.
  if (missingWorkerIds.length > 0) {
    const fallbackAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        employeeId: { in: missingWorkerIds },
        endAt: null,
      },
      select: { employeeId: true },
    });
    fallbackAssignments.forEach((assignment) => {
      matchedWorkerIdSet.add(assignment.employeeId);
    });
    missingWorkerIds = workerIds.filter(
      (workerId) => !matchedWorkerIdSet.has(workerId)
    );
  }

  // Legacy fallback: if line assignment history is missing, allow workers whose
  // denormalized employee.lineName still matches the selected line.
  if (missingWorkerIds.length > 0) {
    const fallbackLegacyWorkers = await prisma.employee.findMany({
      where: {
        orgId,
        id: { in: missingWorkerIds },
        ...(factoryId !== null
          ? {
              OR: [{ factoryId }, { factoryId: null }],
            }
          : {}),
        lineName: {
          equals: line.name,
          mode: "insensitive",
        },
        membership: {
          role: "WORKER",
          status: "ACTIVE",
        },
        role: {
          code: DEFAULT_EMPLOYEE_ROLE_CODE_SEWING,
        },
      },
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
      },
    });

    fallbackLegacyWorkers.forEach((worker) => {
      const workerId = toPositiveIntOrNull(worker.id);
      if (workerId === null) return;
      const employmentCheck = evaluateWorkerEmploymentOnDateKey({
        joinedAt: worker.joinedAt,
        leftAt: worker.leftAt,
        targetDateKey: normalizedWorkDate,
      });
      if (!employmentCheck.passed) return;
      matchedWorkerIdSet.add(workerId);
    });
    missingWorkerIds = workerIds.filter(
      (workerId) => !matchedWorkerIdSet.has(workerId)
    );
  }

  return {
    status: 200,
    error: null as string | null,
    line,
    missingWorkerIds,
  };
};
const validateWorkLogWorkerEmploymentWindow = async ({
  orgId,
  factoryId,
  workDate,
  workerIds,
}: {
  orgId: number;
  factoryId: number | null;
  workDate: string;
  workerIds: number[];
}) => {
  const normalizedWorkDate = normalizeDateKey(workDate);
  if (!normalizedWorkDate) {
    return {
      status: 400,
      error: "invalid workDate",
      invalidWorkerIds: [] as number[],
    };
  }

  const isWorkerAvailableOnWorkDate = (
    worker: {
      joinedAt?: unknown;
      leftAt?: unknown;
      membershipStatus?: unknown;
    } | null | undefined,
    targetWorkDate: string
  ) => {
    if (!worker) return false;
    const employmentCheck = evaluateWorkerEmploymentOnDateKey({
      joinedAt: worker.joinedAt,
      leftAt: worker.leftAt,
      targetDateKey: targetWorkDate,
    });
    return employmentCheck.passed;
  };

  if (workerIds.length === 0) {
    return {
      status: 200,
      error: null as string | null,
      invalidWorkerIds: [] as number[],
    };
  }

  const workers = await prisma.employee.findMany({
    where: {
      orgId,
      id: { in: workerIds },
    },
    select: {
      id: true,
      joinedAt: true,
      leftAt: true,
      membership: {
        select: {
          status: true,
        },
      },
    },
  });
  const workerById = new Map<
    number,
    { joinedAt: unknown; leftAt: unknown; membershipStatus: unknown }
  >();
  workers.forEach((worker) => {
    const workerId = toPositiveIntOrNull(worker.id);
    if (workerId === null) return;
    workerById.set(workerId, {
      joinedAt: worker.joinedAt,
      leftAt: worker.leftAt,
      membershipStatus: worker.membership?.status,
    });
  });

  const invalidWorkerIds: number[] = [];
  workerIds.forEach((workerId) => {
    const worker = workerById.get(workerId);
    if (!worker) return;
    if (!isWorkerAvailableOnWorkDate(worker, normalizedWorkDate)) {
      invalidWorkerIds.push(workerId);
    }
  });

  return {
    status: 200,
    error: null as string | null,
    invalidWorkerIds,
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
  if (text.startsWith("duplicate worker-style-process on workDate")) {
    const detail = resolveOptionalString(text.split(":").slice(1).join(":").trim(), null);
    if (detail) {
      return `같은 작업자가 같은 스타일의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다. (${detail})`;
    }
    return "같은 작업자가 같은 스타일의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다.";
  }
  if (text.startsWith("line worker mismatch for workDate")) {
    return "선택한 작업일 기준으로 현재 라인에 속하지 않은 작업자가 포함되어 있습니다. 라인과 작업자를 다시 확인해 주세요.";
  }
  if (text.startsWith("worker employment mismatch for workDate")) {
    return "퇴사일(또는 입사일) 기준으로 입력할 수 없는 작업자가 포함되어 있습니다.";
  }
  if (text.startsWith("assignment plan not found")) {
    return "선택한 배정카드를 찾을 수 없습니다.";
  }
  if (text.startsWith("assignment plan line mismatch")) {
    return "선택한 라인과 맞지 않는 배정카드가 포함되어 있습니다.";
  }
  if (text.startsWith("assignment plan already completed")) {
    return "이미 마감완료된 배정카드가 포함되어 있습니다. 관리자에게 확인해 주세요.";
  }
  if (
    text.startsWith("ct snapshot required before work log") ||
    text.startsWith("ct agreement required before work log")
  ) {
    return "CT snapshot이 저장된 배정 카드만 작업 기록으로 저장할 수 있습니다.";
  }

  return text;
};
const toWorkRecordResponse = (record: any) => ({
  workerId: record?.workerId ?? null,
  workerName: record?.workerName ?? "",
  customerName: record?.customerName ?? "",
  orderNo: resolveOptionalString(record?.orderNo, "") ?? "",
  lineId: toPositiveIntOrNull(record?.lineId),
  styleUid: resolveWorkRecordStyleUid(record),
  styleId: resolveWorkRecordStyleId(record) ?? "",
  styleName: resolveWorkRecordStyleName(record) ?? "",
  processId: toPositiveIntOrNull(record?.process?.id ?? record?.processId),
  processCode: record?.process?.code ?? record?.processCode ?? "",
  processName: resolveWorkRecordProcessName(record) ?? "",
  processNameKo:
    resolveOptionalString(record?.process?.nameKo ?? record?.processNameKo, null) ?? "",
  processNameEn:
    resolveOptionalString(record?.process?.nameEn ?? record?.processNameEn, null) ?? "",
  processNameVi:
    resolveOptionalString(record?.process?.nameVi ?? record?.processNameVi, null) ?? "",
  colorId: toPositiveIntOrNull(record?.color?.id ?? record?.colorId),
  colorCode: record?.color?.code ?? record?.colorCode ?? "",
  colorName: resolveWorkRecordColorName(record),
  ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
  quantity: toNonNegativeInt(record?.quantity, 0),
  assignmentPlanId: record?.assignmentPlanId ?? null,
});
const resolveWorkLogCoverageStartDate = (source: any, fallbackDate: string | null = null) =>
  normalizeDateKey(source?.coverageStartDate) ||
  normalizeDateKey(fallbackDate) ||
  null;

const resolveWorkLogCoverageEndDate = (source: any, fallbackDate: string | null = null) =>
  normalizeDateKey(source?.coverageEndDate) ||
  normalizeDateKey(fallbackDate) ||
  null;

const resolveWorkLogEntryMode = ({
  coverageStartDate,
  coverageEndDate,
  requestedEntryMode = null,
}: {
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  requestedEntryMode?: any;
}): "daily" | "period_summary" => {
  const normalizedRequested = resolveOptionalString(requestedEntryMode, null)?.toLowerCase();
  if (normalizedRequested === "daily" || normalizedRequested === "period_summary") {
    return normalizedRequested;
  }
  if (!coverageStartDate || !coverageEndDate) return "daily";
  return coverageStartDate === coverageEndDate ? "daily" : "period_summary";
};
const normalizeWorkLogPayload = (payload: any = {}, fallback: any = null) => {
  const coverageEndInput =
    payload?.coverageEndDate !== undefined
      ? payload.coverageEndDate
      : payload?.workDate !== undefined
        ? payload.workDate
        : fallback?.coverageEndDate !== undefined
          ? fallback?.coverageEndDate
          : fallback?.displayDate;
  const normalizedCoverageEndDate = normalizeDateKey(coverageEndInput) || todayDateKey();
  const coverageStartInput =
    payload?.coverageStartDate !== undefined
      ? payload.coverageStartDate
      : fallback?.coverageStartDate !== undefined
        ? fallback?.coverageStartDate
        : normalizedCoverageEndDate;
  const normalizedCoverageStartDateCandidate =
    normalizeDateKey(coverageStartInput) || normalizedCoverageEndDate;
  const normalizedCoverageStartDate =
    normalizedCoverageStartDateCandidate <= normalizedCoverageEndDate
      ? normalizedCoverageStartDateCandidate
      : normalizedCoverageEndDate;
  const entryMode = resolveWorkLogEntryMode({
    coverageStartDate: normalizedCoverageStartDate,
    coverageEndDate: normalizedCoverageEndDate,
    requestedEntryMode:
      payload?.entryMode !== undefined ? payload.entryMode : fallback?.entryMode,
  });
  const fallbackLineMeta = resolveWorkLogLineMeta(fallback?.records);
  const normalizedRecords = normalizeWorkRecordPayloadList(
    payload?.records !== undefined ? payload.records : fallback?.records
  );
  const records = normalizedRecords.rows;

  return {
    displayDate: normalizedCoverageEndDate,
    coverageStartDate: normalizedCoverageStartDate,
    coverageEndDate: normalizedCoverageEndDate,
    entryMode,
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
    totalCtSeconds: toNonNegativeInt(
      payload?.totalCtSeconds !== undefined
        ? payload.totalCtSeconds
        : fallback?.totalCtSeconds,
      0
    ),
    note: resolveOptionalString(payload?.note, fallback?.note ?? null),
    records,
    invalidWorkerRecordIndex: normalizedRecords.invalidWorkerRecordIndex,
  };
};
const stripCoverageFieldsFromWorkLogData = <T extends Record<string, any>>(
  workLogData: T
): Omit<T, "coverageStartDate" | "coverageEndDate" | "entryMode"> => {
  const {
    coverageStartDate: _coverageStartDate,
    coverageEndDate: _coverageEndDate,
    entryMode: _entryMode,
    ...rest
  } = workLogData || {};
  return rest as Omit<T, "coverageStartDate" | "coverageEndDate" | "entryMode">;
};
const buildWorkLogWriteDataWithOptionalCoverage = <T extends Record<string, any>>(
  workLogData: T,
  options: { includeCoverage: boolean }
) =>
  options.includeCoverage
    ? workLogData
    : stripCoverageFieldsFromWorkLogData(workLogData);
const toWorkLogResponse = (workLog: any) => {
  const lineMeta = resolveWorkLogLineMeta(workLog?.records);
  const coverageEndDate = resolveWorkLogCoverageEndDate(workLog, workLog?.displayDate);
  const coverageStartDate = resolveWorkLogCoverageStartDate(workLog, coverageEndDate);
  const entryMode = resolveWorkLogEntryMode({
    coverageStartDate,
    coverageEndDate,
    requestedEntryMode: workLog?.entryMode,
  });
  return {
    id: workLog.id,
    workDate: coverageEndDate || workLog.displayDate,
    coverageStartDate,
    coverageEndDate,
    entryMode,
    factoryId: workLog.factoryId ?? null,
    factoryName: workLog.factoryName ?? "",
    lineId: lineMeta.lineId,
    lineName: lineMeta.lineName ?? "",
    factoryWagePerSecond: workLog.factoryWagePerSecond ?? null,
    ctBasis: workLog.ctBasis ?? "CT",
    workerCount: workLog.workerCount ?? 0,
    itemCount: workLog.itemCount ?? 0,
    totalCtSeconds: workLog.totalCtSeconds ?? 0,
    note: workLog.note ?? "",
    records: resolveWorkLogRecordResponses(workLog),
    createdAt: workLog.createdAt,
    updatedAt: workLog.updatedAt,
    updatedBy: resolveOptionalString(workLog.updatedBy, null),
  };
};
const toWorkLogContextWorkerResponse = (row: any) => ({
  id: row?.employee?.id ?? row?.employeeId ?? null,
  orgMembershipId: row?.employee?.orgMembershipId ?? null,
  name: resolveOptionalString(row?.employee?.name, "") ?? "",
  email: resolveOptionalString(row?.employee?.membership?.email, "") ?? "",
  factoryId: row?.employee?.factoryId ?? null,
  currentLineId: row?.lineId ?? null,
});
const buildWorkLogContextAssignmentDisplayKey = (plan: any) => {
  const orderNo = resolveOptionalString(plan?.orderNo, "") ?? "";
  const label =
    resolveOptionalString(plan?.label, null) ??
    resolveOptionalString(plan?.styleId, null) ??
    "";
  const quantity = toOptionalNonNegativeInt(
    plan?.finalQuantity ?? plan?.quantity,
    null
  );
  if (!orderNo && !label && quantity == null) return "";
  return [orderNo, label, quantity ?? ""].join("|");
};
const summarizeWorkLogContextDuplicateAssignments = (plans: any[] = []) => {
  const duplicateBuckets = ensureArray(plans).reduce((map, plan) => {
    const displayKey = buildWorkLogContextAssignmentDisplayKey(plan);
    if (!displayKey) return map;
    const current = map.get(displayKey) || {
      displayKey,
      count: 0,
      externalIds: [] as string[],
      lineIds: [] as string[],
    };
    current.count += 1;
    const externalId = resolveOptionalString(plan?.externalId ?? plan?.id, null);
    if (externalId) {
      current.externalIds.push(externalId);
    }
    const lineId =
      resolveOptionalString(plan?.lineId, null) ??
      (toPositiveIntOrNull(plan?.lineId) !== null
        ? String(toPositiveIntOrNull(plan?.lineId))
        : null);
    if (lineId) {
      current.lineIds.push(lineId);
    }
    map.set(displayKey, current);
    return map;
  }, new Map<
    string,
    { displayKey: string; count: number; externalIds: string[]; lineIds: string[] }
  >());

  return Array.from<
    { displayKey: string; count: number; externalIds: string[]; lineIds: string[] }
  >(duplicateBuckets.values())
    .filter((entry) => entry.count > 1)
    .slice(0, 10);
};
const toWorkLogContextAssignmentResponse = (plan: any) => {
  const normalizedSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const closedAt = resolveAssignmentPlanClosedAt(plan);
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: toOptionalNonNegativeInt(plan?.quantity, null),
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);
  const completedAt = closedAt;
  const isCompleted = plan?.isCompleted === true;
  return {
    dbId: plan?.id ?? null,
    id: resolveOptionalString(plan?.externalId, "") ?? "",
    lineId: String(plan?.lineId ?? ""),
    lineName: resolveOptionalString(plan?.lineName, "") ?? "",
    styleId:
      resolveOptionalString(plan?.label, null) ??
      resolveOptionalString(plan?.orderNo, null) ??
      "",
    styleCode:
      resolveOptionalString(plan?.label, null) ??
      resolveOptionalString(plan?.orderNo, null) ??
      "",
    orderNo: resolveOptionalString(plan?.orderNo, "") ?? "",
    label: resolveOptionalString(plan?.label, "") ?? "",
    customer: resolveOptionalString(plan?.customer, "") ?? "",
    colorId: toPositiveIntOrNull(plan?.colorId),
    colorName: resolveAssignmentPlanColorName(plan),
    color: resolveOptionalString(plan?.color, "") ?? "",
    quantity: plan?.quantity ?? null,
    ctTotalSeconds: resolveAssignmentCtTotalSeconds(plan),
    assignmentCtSnapshot: normalizedSnapshot,
    ctUpdatedBy: normalizedSnapshot?.updatedBy ?? "",
    ctUpdatedAt: normalizedSnapshot?.updatedAt ?? null,
    startIndex: plan?.startIndex ?? 0,
    endIndex: plan?.endIndex ?? 0,
    isCompleted,
    finalQuantity,
    closedQty,
    completedAt,
    closedAt,
    closeMode,
    closeBasis,
    closedBy: resolveOptionalString(plan?.closedBy, null),
  };
};
const buildWorkLogContextResponse = async ({
  orgId,
  factoryId = null,
  lineId = null,
  lineName = null,
  workDate = null,
  coverageStartDate = null,
  debug = false,
}: {
  orgId: number;
  factoryId?: number | null;
  lineId?: number | null;
  lineName?: string | null;
  workDate?: string | null;
  coverageStartDate?: string | null;
  debug?: boolean;
}) => {
  const normalizedLineId = toPositiveIntOrNull(lineId);
  const normalizedFactoryId = toPositiveIntOrNull(factoryId);
  const normalizedWorkDate = normalizeDateKey(workDate);
  const normalizedCoverageStartDate = normalizeDateKey(coverageStartDate);
  console.log(
    `[buildWorkLogContextResponse] called orgId=${orgId} factoryId=${normalizedFactoryId ?? "null"} lineId=${normalizedLineId ?? "null"} workDate=${normalizedWorkDate || "-"} coverageStartDate=${normalizedCoverageStartDate || "-"}`
  );
  const buildBaseResponse = ({
    line: currentLine = null,
    workers = [],
    assignments = [],
    previousCoverageEndDate = null,
    suggestedCoverageStartDate = null,
    isFirstLineWorkLog = false,
  }: {
    line?: { id: number; name: string } | null;
    workers?: any[];
    assignments?: any[];
    previousCoverageEndDate?: string | null;
    suggestedCoverageStartDate?: string | null;
    isFirstLineWorkLog?: boolean;
  }) => ({
    line: currentLine,
    workers,
    assignments,
    previousCoverageEndDate,
    suggestedCoverageStartDate,
    isFirstLineWorkLog,
  });
  if (!normalizedLineId || !normalizedWorkDate) {
    const response = buildBaseResponse({
      line: normalizedLineId
        ? {
            id: normalizedLineId,
            name: resolveOptionalString(lineName, "") ?? "",
          }
        : null,
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "missing_line_or_work_date",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: normalizedLineId,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  const line = await prisma.line.findFirst({
    where: {
      id: normalizedLineId,
      orgId,
      ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
    },
    select: { id: true, name: true, factoryId: true },
  });
  if (!line) {
    const response = buildBaseResponse({
      line: normalizedLineId
        ? {
            id: normalizedLineId,
            name: resolveOptionalString(lineName, "") ?? "",
          }
        : null,
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "line_not_found_or_factory_mismatch",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: normalizedLineId,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  // Keep employee.factoryId aligned with active line assignments so
  // line-based work-log worker queries stay consistent.
  try {
    const activeLineAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
      },
      select: {
        employeeId: true,
        employee: {
          select: {
            factoryId: true,
          },
        },
      },
    });
    const workerIdsToSync = activeLineAssignments
      .filter((assignment) => {
        const workerId = toPositiveIntOrNull(assignment?.employeeId);
        if (workerId === null) return false;
        const workerFactoryId = toPositiveIntOrNull(assignment?.employee?.factoryId);
        return workerFactoryId !== line.factoryId;
      })
      .map((assignment) => toPositiveIntOrNull(assignment?.employeeId))
      .filter((workerId): workerId is number => workerId !== null);

    if (workerIdsToSync.length > 0) {
      await prisma.employee.updateMany({
        where: {
          orgId,
          id: { in: workerIdsToSync },
        },
        data: {
          factoryId: line.factoryId,
        },
      });
      console.warn(
        `[work-log-context] orgId=${orgId} lineId=${line.id} synced employee.factoryId for ${workerIdsToSync.length} active line workers`
      );
    }
  } catch (error) {
    console.warn(
      `[work-log-context] orgId=${orgId} lineId=${line.id} failed to sync line worker factory links: ${
        resolveOptionalString((error as any)?.message, String(error || ""))
      }`
    );
  }

  const dateRange = buildWorkDateRange(normalizedWorkDate);
  if (!dateRange) {
    const response = buildBaseResponse({
      line: { id: line.id, name: line.name ?? "" },
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "invalid_date_range",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: line.id,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  const factoryLines = await prisma.line.findMany({
    where: {
      orgId,
      factoryId: line.factoryId,
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const factoryLineIds = factoryLines
    .map((item) => toPositiveIntOrNull(item?.id))
    .filter((item): item is number => item !== null);
  const lineNameById = new Map(
    factoryLines.map((item) => [
      Number(item.id),
      resolveOptionalString(item.name, "") ?? "",
    ])
  );
  const lineAssignmentSelect = {
    employeeId: true,
    lineId: true,
    startAt: true,
    endAt: true,
    employee: {
      select: {
        id: true,
        orgMembershipId: true,
        name: true,
        factoryId: true,
        lineName: true,
        joinedAt: true,
        leftAt: true,
        role: {
          select: {
            code: true,
          },
        },
        membership: {
          select: {
            email: true,
            role: true,
            status: true,
          },
        },
      },
    },
  } as const;
  const previousCoverage = await findPreviousWorkLogCoverageForLine({
    orgId,
    factoryId: line.factoryId,
    lineId: line.id,
    beforeWorkDate: normalizedWorkDate,
  });
  const previousCoverageEndDate =
    resolveWorkLogCoverageEndDate(previousCoverage, previousCoverage?.displayDate) || null;
  const suggestedCoverageStartDate = previousCoverageEndDate
    ? shiftDateKeyByDays(previousCoverageEndDate, 1)
    : null;
  const employmentFilterDateKey =
    normalizeDateKey(normalizedCoverageStartDate) ||
    normalizeDateKey(suggestedCoverageStartDate) ||
    normalizedWorkDate;

  const lineAssignmentsOnWorkDatePromise = prisma.lineAssignment.findMany({
    where: {
      lineId: line.id,
      startAt: { lte: dateRange.endAt },
      OR: [{ endAt: null }, { endAt: { gte: dateRange.startAt } }],
      employee: {
        is: {
          orgId,
        },
      },
    },
    select: lineAssignmentSelect,
    orderBy: [{ employeeId: "asc" }],
  });
  const loadAssignmentPlansForWorkLogContext = async () => {
    if (factoryLineIds.length === 0) return [] as any[];
    const where = { orgId, lineId: { in: factoryLineIds }, isCompleted: false };
    const orderBy: any[] = [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }];
    try {
      return await prisma.assignmentPlan.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          lineId: true,
          orderNo: true,
          customer: true,
          label: true,
          colorId: true,
          colorName: true,
          quantity: true,
          ctTotalSeconds: true,
          assignmentCtSnapshot: true,
          color: true,
          startIndex: true,
          endIndex: true,
          isCompleted: true,
          finalQuantity: true,
          completedAt: true,
        },
        orderBy,
      });
    } catch (error) {
      if (!isAssignmentPlanMissingColumnError(error)) throw error;
      return prisma.assignmentPlan.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          lineId: true,
          orderNo: true,
          customer: true,
          label: true,
          colorId: true,
          colorName: true,
          quantity: true,
          assignmentCtSnapshot: true,
          color: true,
          startIndex: true,
          endIndex: true,
          isCompleted: true,
          finalQuantity: true,
          completedAt: true,
        },
        orderBy,
      });
    }
  };

  let [lineAssignmentsOnWorkDate, assignmentPlans] = await Promise.all([
    lineAssignmentsOnWorkDatePromise,
    loadAssignmentPlansForWorkLogContext(),
  ]);

  // Keep work-log style options consistent with scheduler cards.
  // If board-state has assignments that are missing from AssignmentPlan,
  // backfill minimal plan rows so work-log context can surface them.
  if (factoryLineIds.length > 0) {
    const lineIdSet = new Set(factoryLineIds);
    const boardState = await prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { assignments: true },
    });
    const activeExternalIds = resolveAssignmentPlanExternalIds(boardState?.assignments);
    const hasBoardAssignments = Array.isArray(boardState?.assignments);
    if (activeExternalIds.length > 0) {
      const existingExternalIdSet = new Set(
        ensureArray(assignmentPlans)
          .map((plan) => resolveOptionalString(plan?.externalId, null))
          .filter((value): value is string => Boolean(value))
      );
      const missingPlanSeedAssignments = normalizeStateAssignments(
        boardState?.assignments
      ).filter((assignment) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId || existingExternalIdSet.has(externalId)) return false;
        if (Boolean(assignment?.isCompleted)) return false;
        const lineIdNum = toPositiveIntOrNull(assignment?.lineId);
        if (!lineIdNum || !lineIdSet.has(lineIdNum)) return false;
        return true;
      });
      console.log(
        `[work-log-context] plan sync check: org=${orgId} lineId=${line.id} boardIds=${activeExternalIds.length} dbIds=${existingExternalIdSet.size} missing=${missingPlanSeedAssignments.length} missingIds=${missingPlanSeedAssignments
          .map((assignment) => resolveAssignmentExternalId(assignment))
          .filter((value): value is string => Boolean(value))
          .slice(0, 10)
          .join(",")}`
      );

      if (missingPlanSeedAssignments.length > 0) {
        const normalizedMissingRowsFallback = normalizeAssignmentPlanPayload(
          missingPlanSeedAssignments,
          lineIdSet
        );
        try {
          const normalizedMissingRows = await syncAssignmentPlanColorRefs(
            orgId,
            normalizeAssignmentPlanPayload(missingPlanSeedAssignments, lineIdSet)
          );
          if (normalizedMissingRows.length > 0) {
            await prisma.assignmentPlan.createMany({
              data: normalizedMissingRows.map((item: any) => ({
                orgId,
                externalId: item.externalId,
                ...toAssignmentPlanWriteData(item),
              })) as Prisma.AssignmentPlanCreateManyInput[],
              skipDuplicates: true,
            });
            assignmentPlans = await loadAssignmentPlansForWorkLogContext();
            console.warn(
              `[work-log-context] orgId=${orgId} lineId=${line.id} backfilled ${normalizedMissingRows.length} assignmentPlan rows from board-state`
            );
          }
        } catch (error) {
          const errCode = (error as any)?.code || "unknown";
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[work-log-context] orgId=${orgId} lineId=${line.id} assignmentPlan backfill FAILED code=${errCode}: ${String(
              message
            ).slice(0, 200)}`
          );
          if (normalizedMissingRowsFallback.length > 0) {
            const existingAfterFailure = new Set(
              ensureArray(assignmentPlans)
                .map((plan) => resolveOptionalString(plan?.externalId, null))
                .filter((value): value is string => Boolean(value))
            );
            const syntheticRows = normalizedMissingRowsFallback
              .filter((item: any) => !existingAfterFailure.has(item.externalId))
              .map((item: any) => ({
                id: null,
                externalId: item.externalId,
                lineId: item.lineId,
                orderNo: item.orderNo ?? null,
                customer: item.customer ?? null,
                label: item.label ?? null,
                colorId: item.colorId ?? null,
                colorName: item.colorName ?? null,
                quantity: item.quantity ?? null,
                ctTotalSeconds: item.ctTotalSeconds ?? null,
                assignmentCtSnapshot: item.assignmentCtSnapshot ?? item.ctSnapshot ?? null,
                color: item.color ?? null,
                startIndex: item.startIndex ?? 0,
                endIndex: item.endIndex ?? 0,
                isCompleted: false,
                finalQuantity: null,
                completedAt: null,
              }));
            if (syntheticRows.length > 0) {
              assignmentPlans = [...assignmentPlans, ...syntheticRows];
              console.warn(
                `[work-log-context] orgId=${orgId} lineId=${line.id} using synthetic assignment fallback rows count=${syntheticRows.length}`
              );
            }
          }
        }
      }
    }

    // Exclude stale DB rows that are no longer present in the current board state.
    // Mirrors the externalId filter already applied in GET /assignment-plans.
    const assignmentPlansBeforeBoardFilter = [...assignmentPlans];
    if (hasBoardAssignments) {
      if (activeExternalIds.length === 0) {
        assignmentPlans = [];
      } else {
        const activeExternalIdSet = new Set(activeExternalIds);
        assignmentPlans = assignmentPlans.filter((plan) => {
          const externalId = resolveOptionalString(plan?.externalId, null);
          if (!externalId) return false;
          return activeExternalIdSet.has(externalId);
        });
      }
    }

    const removedStaleCount =
      assignmentPlansBeforeBoardFilter.length - assignmentPlans.length;
    const duplicateDisplayAssignments =
      summarizeWorkLogContextDuplicateAssignments(assignmentPlans);
    console.log(
      `[buildWorkLogContextResponse] board-sync orgId=${orgId} lineId=${line.id} hasBoardAssignments=${hasBoardAssignments} activeExternalIds=${activeExternalIds.length} assignmentPlansBefore=${assignmentPlansBeforeBoardFilter.length} assignmentPlansAfter=${assignmentPlans.length} removedStale=${removedStaleCount}`
    );
    if (removedStaleCount > 0) {
      const activeExternalIdSet = new Set(activeExternalIds);
      const removedPlanSummaries = assignmentPlansBeforeBoardFilter
        .filter((plan) => {
          const externalId = resolveOptionalString(plan?.externalId, null);
          if (!externalId) return false;
          return !activeExternalIdSet.has(externalId);
        })
        .slice(0, 10)
        .map((plan) => ({
          externalId: resolveOptionalString(plan?.externalId, null),
          orderNo: resolveOptionalString(plan?.orderNo, null),
          label: resolveOptionalString(plan?.label, null),
          quantity: toOptionalNonNegativeInt(plan?.quantity, null),
          lineId: toPositiveIntOrNull(plan?.lineId),
        }));
      console.log(
        `[buildWorkLogContextResponse] removed-stale-plans orgId=${orgId} lineId=${line.id} sample=${JSON.stringify(
          removedPlanSummaries
        )}`
      );
    }
    if (duplicateDisplayAssignments.length > 0) {
      console.log(
        `[buildWorkLogContextResponse] duplicate-display-assignments orgId=${orgId} lineId=${line.id} sample=${JSON.stringify(
          duplicateDisplayAssignments
        )}`
      );
    }
  }

  const filterDebugStages: Array<{
    stage: string;
    total: number;
    passed: number;
    dropped: number;
    droppedByReason: Record<string, number>;
    droppedWorkers: Array<{
      employeeId: number | null;
      name: string;
      reason: string;
      workerFactoryId: number | null;
      joinedDateKey: string;
      leftDateKey: string;
      assignmentStartDateKey: string;
      assignmentEndDateKey: string;
      membershipStatus: string;
      membershipRole: string;
      roleCode: string;
    }>;
  }> = [];
  const filterWorkersByEmploymentWindow = (rows: any[], stage: string) => {
    const safeRows = ensureArray(rows);
    const passed: any[] = [];
    const droppedWorkers: Array<{
      employeeId: number | null;
      name: string;
      reason: string;
      workerFactoryId: number | null;
      joinedDateKey: string;
      leftDateKey: string;
      assignmentStartDateKey: string;
      assignmentEndDateKey: string;
      membershipStatus: string;
      membershipRole: string;
      roleCode: string;
    }> = [];

    safeRows.forEach((assignment) => {
      const employee = assignment?.employee;
      const employeeId = toPositiveIntOrNull(employee?.id ?? assignment?.employeeId);
      const joinedDateKey = toDateKeyInTimeZone(employee?.joinedAt, BUSINESS_TIME_ZONE);
      const leftDateKey = toDateKeyInTimeZone(employee?.leftAt, BUSINESS_TIME_ZONE);
      const assignmentStartDateKey = toDateKeyInTimeZone(
        assignment?.startAt,
        BUSINESS_TIME_ZONE
      );
      const assignmentEndDateKey = toDateKeyInTimeZone(
        assignment?.endAt,
        BUSINESS_TIME_ZONE
      );
      const membershipStatus = String(employee?.membership?.status ?? "").trim();
      const membershipRole = String(employee?.membership?.role ?? "").trim();
      const roleCode = String(employee?.role?.code ?? "").trim();
      const baseInfo = {
        employeeId,
        name: resolveOptionalString(employee?.name, "") ?? "",
        workerFactoryId: toPositiveIntOrNull(employee?.factoryId),
        joinedDateKey,
        leftDateKey,
        assignmentStartDateKey,
        assignmentEndDateKey,
        membershipStatus,
        membershipRole,
        roleCode,
      };

      if (!employee) {
        droppedWorkers.push({
          ...baseInfo,
          reason: "missing_employee",
        });
        return;
      }
      const employmentCheck = evaluateWorkerEmploymentOnDateKey({
        joinedAt: employee?.joinedAt,
        leftAt: employee?.leftAt,
        targetDateKey: employmentFilterDateKey,
      });
      if (!employmentCheck.passed) {
        droppedWorkers.push({
          ...baseInfo,
          reason: employmentCheck.reason,
        });
        return;
      }
      passed.push(assignment);
    });

    const droppedByReason = droppedWorkers.reduce<Record<string, number>>(
      (acc, item) => {
        const key = item.reason || "unknown";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {}
    );
    filterDebugStages.push({
      stage,
      total: safeRows.length,
      passed: passed.length,
      dropped: droppedWorkers.length,
      droppedByReason,
      droppedWorkers,
    });
    return passed;
  };

  let workersForDate = filterWorkersByEmploymentWindow(
    lineAssignmentsOnWorkDate,
    "line_assignments_on_work_date"
  );

  if (workersForDate.length === 0) {
    const activeLineAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ employeeId: "asc" }],
    });
    const fallbackWorkers = filterWorkersByEmploymentWindow(
      activeLineAssignments,
      "fallback_active_line_assignments"
    );
    if (fallbackWorkers.length > 0) {
      workersForDate = fallbackWorkers;
      console.log(
        `[work-log-context] orgId=${orgId} lineId=${line.id} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} workers=fallback_active_assignments`
      );
    }
  }

  // Legacy fallback: keep old employee.lineName mapping working when lineAssignment
  // history is missing or has not been migrated.
  if (workersForDate.length === 0) {
    const legacyWorkers = await prisma.employee.findMany({
      where: {
        orgId,
        ...(normalizedFactoryId
          ? {
              OR: [{ factoryId: normalizedFactoryId }, { factoryId: null }],
            }
          : {}),
        lineName: {
          equals: line.name,
          mode: "insensitive",
        },
        membership: {
          role: "WORKER",
          status: "ACTIVE",
        },
        role: {
          code: DEFAULT_EMPLOYEE_ROLE_CODE_SEWING,
        },
      },
      select: lineAssignmentSelect.employee.select,
      orderBy: [{ id: "asc" }],
    });
    const legacyWorkersForDate = filterWorkersByEmploymentWindow(
      legacyWorkers.map((employee) => ({
        employeeId: employee.id,
        lineId: line.id,
        employee,
      })),
      "fallback_employee_line_name"
    );
    if (legacyWorkersForDate.length > 0) {
      workersForDate = legacyWorkersForDate;
      console.log(
        `[work-log-context] orgId=${orgId} lineId=${line.id} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} workers=fallback_employee_line_name`
      );
    }
  }

  // Last fallback for data-recovery cases:
  // if active assignment rows are missing but the line has historical members,
  // surface workers from the latest historical assignment on this line.
  if (workersForDate.length === 0) {
    const historicalAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: { not: null },
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ endAt: "desc" }, { id: "desc" }],
    });

    const latestHistoricalByEmployeeId = new Map<number, any>();
    historicalAssignments.forEach((assignment) => {
      const employeeId = toPositiveIntOrNull(assignment?.employeeId);
      if (employeeId === null) return;
      if (latestHistoricalByEmployeeId.has(employeeId)) return;
      latestHistoricalByEmployeeId.set(employeeId, assignment);
    });

    const historicalEmployeeIds = Array.from(latestHistoricalByEmployeeId.keys());
    if (historicalEmployeeIds.length > 0) {
      const activeAssignmentsOnAnyLine = await prisma.lineAssignment.findMany({
        where: {
          employeeId: { in: historicalEmployeeIds },
          endAt: null,
          employee: {
            is: {
              orgId,
            },
          },
        },
        select: { employeeId: true, lineId: true },
      });
      const activeLineByEmployeeId = new Map<number, number>();
      activeAssignmentsOnAnyLine.forEach((assignment) => {
        const employeeId = toPositiveIntOrNull(assignment?.employeeId);
        const activeLineId = toPositiveIntOrNull(assignment?.lineId);
        if (employeeId === null || activeLineId === null) return;
        if (activeLineByEmployeeId.has(employeeId)) return;
        activeLineByEmployeeId.set(employeeId, activeLineId);
      });

      const historicalCandidates = Array.from(latestHistoricalByEmployeeId.values()).filter(
        (assignment) => {
          const employeeId = toPositiveIntOrNull(assignment?.employeeId);
          if (employeeId === null) return false;
          const activeLineId = activeLineByEmployeeId.get(employeeId);
          if (activeLineId === undefined) return true;
          return activeLineId === line.id;
        }
      );
      const fallbackWorkers = filterWorkersByEmploymentWindow(
        historicalCandidates,
        "fallback_historical_line_assignments"
      );
      if (fallbackWorkers.length > 0) {
        workersForDate = fallbackWorkers;
        console.log(
          `[work-log-context] orgId=${orgId} lineId=${line.id} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} workers=fallback_historical_line_assignments`
        );
      }
    }
  }

  if (workersForDate.length === 0) {
    const activeAssignmentsAllFactories = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ employeeId: "asc" }],
    });
    const activeAssignmentsOnSelectedFactory = activeAssignmentsAllFactories.filter(
      (assignment) => {
        if (!normalizedFactoryId) return true;
        const workerFactoryId = toPositiveIntOrNull(assignment?.employee?.factoryId);
        return workerFactoryId === normalizedFactoryId;
      }
    );

    console.log(
      `[work-log-context][debug] orgId=${orgId} lineId=${line.id} lineName=${line.name ?? ""} factoryId=${normalizedFactoryId ?? "null"} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} finalWorkers=0`
    );
    console.log(
      `[work-log-context][debug] baseCounts onWorkDate=${lineAssignmentsOnWorkDate.length} activeAnyFactory=${activeAssignmentsAllFactories.length} activeSelectedFactory=${activeAssignmentsOnSelectedFactory.length} assignmentPlans=${assignmentPlans.length}`
    );
    filterDebugStages.forEach((stageSummary) => {
      console.log(
        `[work-log-context][debug] stage=${stageSummary.stage} total=${stageSummary.total} passed=${stageSummary.passed} dropped=${stageSummary.dropped} droppedByReason=${JSON.stringify(
          stageSummary.droppedByReason
        )}`
      );
      stageSummary.droppedWorkers.slice(0, 40).forEach((worker) => {
        console.log(
          `[work-log-context][debug] stage=${stageSummary.stage} drop workerId=${worker.employeeId ?? "null"} name=${worker.name || "-"} reason=${worker.reason} workerFactoryId=${worker.workerFactoryId ?? "null"} joined=${worker.joinedDateKey || "-"} left=${worker.leftDateKey || "-"} assignmentStart=${worker.assignmentStartDateKey || "-"} assignmentEnd=${worker.assignmentEndDateKey || "-"} membershipStatus=${worker.membershipStatus || "-"} membershipRole=${worker.membershipRole || "-"} roleCode=${worker.roleCode || "-"}`
        );
      });
    });
  }

  const response = buildBaseResponse({
    line: { id: line.id, name: line.name ?? "" },
    workers: workersForDate.map(toWorkLogContextWorkerResponse),
    assignments: assignmentPlans
      .map((plan) =>
        toWorkLogContextAssignmentResponse({
          ...plan,
          lineName: lineNameById.get(Number(plan?.lineId)) || "",
        })
      ),
    previousCoverageEndDate,
    suggestedCoverageStartDate,
    isFirstLineWorkLog: !previousCoverageEndDate,
  });
  console.log(
    `[buildWorkLogContextResponse] result orgId=${orgId} lineId=${line.id} workers=${response.workers.length} assignments=${response.assignments.length} previousCoverageEndDate=${response.previousCoverageEndDate ?? "-"} suggestedCoverageStartDate=${response.suggestedCoverageStartDate ?? "-"}`
  );
  if (!debug) return response;

  return {
    ...response,
    _debug: {
      orgId,
      factoryId: normalizedFactoryId,
      lineId: line.id,
      lineName: line.name ?? "",
      workDate: normalizedWorkDate,
      filterWorkDate: employmentFilterDateKey,
      baseCounts: {
        lineAssignmentsOnWorkDate: lineAssignmentsOnWorkDate.length,
        assignmentPlansInFactory: assignmentPlans.length,
      },
      lineAssignmentsOnWorkDateWorkers: lineAssignmentsOnWorkDate.map((assignment) => {
        const employee = assignment?.employee;
        const membershipStatus = String(employee?.membership?.status ?? "")
          .trim()
          .toUpperCase();
        const joinedDateKey = toDateKeyInTimeZone(employee?.joinedAt, BUSINESS_TIME_ZONE);
        const leftDateKey = toDateKeyInTimeZone(employee?.leftAt, BUSINESS_TIME_ZONE);
        const employmentCheck = evaluateWorkerEmploymentOnDateKey({
          joinedAt: employee?.joinedAt,
          leftAt: employee?.leftAt,
          targetDateKey: employmentFilterDateKey,
        });
        const joinedPass = employmentCheck.reason !== "workDate_before_joinedAt";
        const leftPass = employmentCheck.reason !== "workDate_after_leftAt";
        const membershipPass = true;
        return {
          workerId: toPositiveIntOrNull(employee?.id ?? assignment?.employeeId),
          workerName: resolveOptionalString(employee?.name, "") ?? "",
          membershipStatus,
          membershipRole: String(employee?.membership?.role ?? "").trim().toUpperCase(),
          roleCode: String(employee?.role?.code ?? "").trim().toUpperCase(),
          workerFactoryId: toPositiveIntOrNull(employee?.factoryId),
          joinedAtRaw: employee?.joinedAt ?? null,
          leftAtRaw: employee?.leftAt ?? null,
          joinedDateKey,
          leftDateKey,
          joinedPass,
          membershipPass,
          leftPass,
          finalPass: employmentCheck.passed && membershipPass,
          employmentReason: employmentCheck.reason,
        };
      }),
      stageSummaries: filterDebugStages,
      stageReasonTotals: filterDebugStages.map((stage) => ({
        stage: stage.stage,
        droppedByReason: stage.droppedByReason,
      })),
      stageDropExamples: filterDebugStages.map((stage) => ({
        stage: stage.stage,
        examples: stage.droppedWorkers.slice(0, 5),
      })),
      finalWorkerCount: response.workers.length,
      finalWorkerIds: response.workers
        .map((worker) => toPositiveIntOrNull(worker?.id))
        .filter((workerId): workerId is number => workerId !== null),
      fallbackUsed:
        workersForDate.length > 0 && lineAssignmentsOnWorkDate.length === 0
          ? "fallback"
          : "on_work_date_assignments",
    },
  };
};
const resolveWorkLogUpdatedBy = async (orgId: number, req: Request): Promise<string | null> => {
  const requesterEmail = resolveOptionalString(getRequesterEmail(req), null);
  if (!requesterEmail) return null;

  const membership = await prisma.orgMembership.findFirst({
    where: {
      orgId,
      email: requesterEmail,
    },
    include: {
      employee: true,
    },
  });

  const employeeName = resolveOptionalString(membership?.employee?.name, null);
  if (employeeName) return employeeName;
  return requesterEmail;
};
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
const toIsoDateStringOrNull = (value: any): string | null => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
const resolveAssignmentExternalId = (item: any): string | null =>
  resolveOptionalString(item?.id ?? item?.externalId, null);

const normalizeAssignmentCtSnapshotSchedule = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    startIndex: toOptionalNonNegativeInt(value?.startIndex, null),
    endIndex: toOptionalNonNegativeInt(value?.endIndex, null),
    startDayOffsetPercent: toOptionalFloat(value?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(value?.startDayPercent, null),
    endDayPercent: toOptionalFloat(value?.endDayPercent, null),
    startDateKey: resolveOptionalString(value?.startDateKey, null),
    endDateKey: resolveOptionalString(value?.endDateKey, null),
  };
};

const normalizeAssignmentCtSnapshotProcess = (value: any, index = 0) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const processKey =
    resolveOptionalString(
      value?.processKey ?? value?.code ?? value?.id,
      null
    ) ?? `PROCESS-${index + 1}`;
  const timesPerPiece = Math.max(
    1,
    toOptionalNonNegativeInt(value?.timesPerPiece ?? value?.quantity, 1) ?? 1
  );
  const rawPieceCtSeconds = toOptionalFloat(value?.pieceCtSeconds ?? value?.ctPerPieceSeconds, null);
  const snapshotCtSeconds =
    toOptionalProcessSeconds(value?.snapshotCtSeconds ?? value?.ctSeconds) ??
    (rawPieceCtSeconds != null ? toOptionalProcessSeconds(rawPieceCtSeconds / timesPerPiece) : null);
  if (snapshotCtSeconds == null || snapshotCtSeconds <= 0) return null;
  const pieceCtSeconds = toOptionalFloat(
    rawPieceCtSeconds ?? snapshotCtSeconds * timesPerPiece,
    timesPerPiece * snapshotCtSeconds
  );
  const processCode = resolveOptionalString(
    value?.processCode ?? value?.code,
    null
  );
  return {
    processKey,
    processCode,
    name:
      resolveOptionalString(
        value?.name ?? value?.processName ?? value?.label,
        null
      ) ?? `공정 ${index + 1}`,
    nameKo: resolveOptionalString(
      value?.nameKo ?? value?.processNameKo ?? value?.labelKo,
      null
    ),
    nameEn: resolveOptionalString(
      value?.nameEn ?? value?.processNameEn ?? value?.labelEn,
      null
    ),
    nameVi: resolveOptionalString(
      value?.nameVi ?? value?.processNameVi ?? value?.labelVi,
      null
    ),
    timesPerPiece,
    basis: resolveOptionalString(value?.basis, null),
    snapshotCtSeconds,
    pieceCtSeconds,
  };
};

const normalizeAssignmentCtSnapshot = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const processes = ensureArray(value?.processes)
    .map((item, index) => normalizeAssignmentCtSnapshotProcess(item, index))
    .filter((item): item is any => Boolean(item));
  const quantity = toOptionalNonNegativeInt(value?.quantity, null);
  const pieceCtTotalSeconds =
    toOptionalFloat(value?.pieceCtTotalSeconds ?? value?.totalCtPerPieceSeconds, null) ??
    (processes.length > 0
      ? processes.reduce(
          (sum, item) => sum + (Number(item?.pieceCtSeconds) || 0),
          0
        )
      : null);
  const assignmentCtTotalSeconds =
    toOptionalNonNegativeInt(value?.assignmentCtTotalSeconds ?? value?.totalCtSeconds, null) ??
    (quantity != null && pieceCtTotalSeconds != null
      ? Math.max(0, Math.round(pieceCtTotalSeconds * quantity))
      : null);

  return {
    updatedAt: toIsoDateStringOrNull(value?.updatedAt),
    updatedBy: resolveOptionalString(value?.updatedBy, null),
    quantity,
    schedule: normalizeAssignmentCtSnapshotSchedule(value?.schedule),
    pieceCtTotalSeconds,
    assignmentCtTotalSeconds,
    processes,
  };
};
const resolveAssignmentCtSnapshotInput = (item: any) =>
  item?.assignmentCtSnapshot ?? item?.ctSnapshot ?? null;
const resolveNormalizedAssignmentCtSnapshot = (item: any) =>
  normalizeAssignmentCtSnapshot(resolveAssignmentCtSnapshotInput(item));

const resolveAssignmentCtTotalSeconds = (item: any) => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(item);
  if (snapshot?.assignmentCtTotalSeconds != null) {
    return Math.max(0, Math.round(Number(snapshot.assignmentCtTotalSeconds) || 0));
  }
  const ctTotalSeconds = toOptionalNonNegativeInt(item?.ctTotalSeconds, null);
  if (ctTotalSeconds != null) return ctTotalSeconds;
  return null;
};

const normalizeStateAssignmentItem = (item: any): any => {
  if (!item || typeof item !== "object") return item;
  const externalId = resolveAssignmentExternalId(item);
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds(item);
  const stTotalSeconds =
    toOptionalNonNegativeInt(item?.stTotalSeconds, null);
  const version = toNonNegativeInt(item?.version, 0);
  const versionUpdatedAt = toIsoDateStringOrNull(item?.versionUpdatedAt);
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
  const {
    ctSnapshot: _ctSnapshot,
    assignmentCtSnapshot: _assignmentCtSnapshot,
    proposalSeconds: _proposalSeconds,
    ctStatus: _ctStatus,
    ctSource: _ctSource,
    ctAgreedBy: _ctAgreedBy,
    ctAgreedAt: _ctAgreedAt,
    ctNote: _ctNote,
    ctSentAt: _ctSentAt,
    ctEscalatedAt: _ctEscalatedAt,
    ctEscalationReason: _ctEscalationReason,
    ctEscalationTargetRole: _ctEscalationTargetRole,
    ctEscalationStatus: _ctEscalationStatus,
    ctAgreedSnapshot: _ctAgreedSnapshot,
    ctOverride: _ctOverride,
    ...rest
  } = item;

  return {
    ...rest,
    ...(externalId ? { id: externalId } : {}),
    ctTotalSeconds,
    assignmentCtSnapshot,
    stTotalSeconds,
    version,
    versionUpdatedAt,
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
    return normalizeStateAssignmentItem({
      ...item,
      id: externalId,
      version: currentVersion + 1,
      versionUpdatedAt: nowIso,
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
  _nowDate: Date = new Date()
): { assignments: any[]; changed: boolean } => {
  return {
    assignments: normalizeStateAssignments(assignments),
    changed: false,
  };
};
const resolveAssignmentPlanExternalIds = (items: any) =>
  ensureArray(items)
    .map((item) => resolveAssignmentExternalId(item))
    .filter((value): value is string => Boolean(value));
const mergeAssignmentPlanResponsesWithState = (plans: any[], stateAssignments: any[]) => {
  const applyPlanStateMerge = (base: any, stateItem: any) => {
    if (!stateItem || typeof stateItem !== "object") return base;
    const merged = {
      ...stateItem,
      ...base,
      id: base.id,
      lineId: String(base.lineId),
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
  };

  const normalizedStateAssignments = normalizeStateAssignments(stateAssignments);
  const planByExternalId = ensureArray(plans).reduce((map, plan) => {
    const base = toAssignmentPlanResponse(plan);
    const externalId = resolveAssignmentExternalId(base);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, base);
    return map;
  }, new Map<string, any>());

  const mergedAssignments: any[] = [];
  normalizedStateAssignments.forEach((stateItem) => {
    const externalId = resolveAssignmentExternalId(stateItem);
    if (!externalId) {
      mergedAssignments.push(normalizeStateAssignmentItem(stateItem));
      return;
    }
    const planBase = planByExternalId.get(externalId);
    if (!planBase) {
      // Keep board-state rows even when assignmentPlan sync is temporarily unavailable.
      // Without this fallback, reload can hide recently saved assignments.
      mergedAssignments.push(normalizeStateAssignmentItem(stateItem));
      return;
    }
    mergedAssignments.push(applyPlanStateMerge(planBase, stateItem));
    planByExternalId.delete(externalId);
  });

  if (planByExternalId.size > 0) {
    planByExternalId.forEach((planBase: any) => {
      mergedAssignments.push(planBase);
    });
  }

  return mergedAssignments;
};
const ASSIGNMENT_TEXT_CORRUPTION_REGEX = /\?{2,}|\uFFFD/u;
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
  return resolveStyleProcessAtTotalSecondsForOrderQuantity(normalized, orderQuantity);
};
const resolveAssignmentCardAtPerPieceSeconds = (process: any, orderQuantity = 1) => {
  const normalized = normalizeStyleProcess(process);
  const totalAt = resolveAssignmentCardAtTotalSecondsForOrderQuantity(
    normalized,
    orderQuantity
  );
  if (totalAt == null || !Number.isFinite(totalAt) || totalAt <= 0) return null;
  return resolveStyleProcessAtPerPieceSecondsForOrderQuantity(normalized, orderQuantity);
};
const resolveAssignmentCardStSeedSeconds = ({
  process,
  orderQuantity = 1,
}: {
  process: any;
  orderQuantity?: number;
}) => {
  const normalized = normalizeStyleProcess(process);
  const manualSt = resolveStyleProcessExactStPerPieceSeconds(
    normalized,
    orderQuantity
  );
  if (manualSt != null) return manualSt;

  const pt = toOptionalSeconds(normalized?.pt);
  if (pt != null) return pt;
  return null;
};
const calculateAssignmentCardTotalForOrderQuantity = (
  processes: any,
  key: "pt" | "at",
  orderQuantity = 1
) => {
  const total = normalizeStyleProcesses(processes).reduce((acc, process) => {
    const processQuantity = toPositiveInt(
      (process as any)?.timesPerPiece ?? (process as any)?.quantity,
      1
    );
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
  return Math.round(total);
};
const calculateAssignmentCardStTotalForOrderQuantity = (
  processes: any,
  orderQuantity = 1
) => {
  const total = normalizeStyleProcesses(processes).reduce((acc, process) => {
    const processQuantity = toPositiveInt(
      (process as any)?.timesPerPiece ?? (process as any)?.quantity,
      1
    );
    const stPerPiece = resolveAssignmentCardStSeedSeconds({
      process,
      orderQuantity,
    });
    if (stPerPiece == null) return acc;
    return acc + processQuantity * stPerPiece * toPositiveInt(orderQuantity, 1);
  }, 0);
  return Math.round(total);
};
const resolveAssignmentCardStatus = ({
  totalPt,
  totalSt,
}: {
  totalPt: number;
  totalSt: number;
}) => {
  if (Number(totalSt) > 0) return "ST";
  if (Number(totalPt) > 0) return "PT";
  return "NONE";
};
const createAssignmentCardId = (orderId: any, styleId: any) =>
  `${String(orderId ?? "").trim()}::${String(styleId ?? "").trim()}`;
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
}: {
  orders: any[];
  styles: any[];
}) => {
  const cards: any[] = [];
  const styleCandidatesById = ensureArray(styles).reduce((map, style) => {
    const styleId = resolveOptionalString(style?.styleId, null);
    if (!styleId) return map;
    const current = map.get(styleId) || [];
    current.push(style);
    map.set(styleId, current);
    return map;
  }, new Map<string, any[]>());

  ensureArray(orders).forEach((order, orderIndex) => {
    const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
      ? [...order.workOrderItems]
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(workOrderItemToItemShape)
      : null;
    const items = itemsFromRelation ?? normalizeOrderItems(order?.items);
    const groupedByStyleId = new Map<
      string,
      {
        quantity: number;
        itemIndex: number;
        style: any;
        styleName: string | null;
        styleCode: string | null;
      }
    >();

    items.forEach((item, itemIndex) => {
      const styleId = resolveOptionalString(item?.styleId, "");
      if (!styleId) return;
      const quantity = toPositiveIntOrNull(sumOrderItemQuantity(item));
      if (quantity === null) return;

      const style = resolveStyleCandidateForAssignmentCard({
        order,
        item,
        styleCandidatesById,
      });
      const current = groupedByStyleId.get(styleId);
      if (!current) {
        groupedByStyleId.set(styleId, {
          quantity,
          itemIndex,
          style,
          styleName: resolveOptionalString(item?.styleName, null),
          styleCode: resolveOptionalString(item?.styleCode, null),
        });
        return;
      }
      current.quantity += quantity;
      if (!current.style && style) current.style = style;
      if (!current.styleName) {
        current.styleName = resolveOptionalString(item?.styleName, null);
      }
      if (!current.styleCode) {
        current.styleCode = resolveOptionalString(item?.styleCode, null);
      }
    });

    groupedByStyleId.forEach((group, styleId) => {
      const processes = normalizeStyleProcesses(group.style?.processes);
      const processCount = processes.length;
      const previewUrl =
        ensureArray(group.style?.imageUrls).length > 0 ? group.style.imageUrls[0] : "";
      const totalPt = calculateAssignmentCardTotalForOrderQuantity(
        processes,
        "pt",
        group.quantity
      );
      const totalAt = calculateAssignmentCardTotalForOrderQuantity(
        processes,
        "at",
        group.quantity
      );
      const totalSt = calculateAssignmentCardStTotalForOrderQuantity(
        processes,
        group.quantity
      );
      const status = resolveAssignmentCardStatus({ totalPt, totalSt });
      const resolvedOrderId =
        resolveOptionalString(order?.orderId ?? order?.id, null) ??
        `order-${orderIndex}`;
      const cardId = createAssignmentCardId(resolvedOrderId, styleId);

      cards.push({
        id: cardId,
        originOrderId: cardId,
        orderNo: resolveOptionalString(order?.orderNumber, null) || resolvedOrderId || "-",
        dueDate: resolveOptionalString(order?.dueDate, null) || "",
        customer:
          resolveOptionalString(order?.customerName ?? order?.customer, null) || "-",
        styleId,
        styleName:
          group.styleName ??
          resolveOptionalString(group.style?.name, null) ??
          `스타일 ${group.itemIndex + 1}`,
        styleCode:
          group.styleCode ??
          resolveOptionalString(group.style?.styleCode, null) ??
          "",
        colorId: null,
        colorName: null,
        gender: null,
        cardQuantity: group.quantity,
        processCount,
        status,
        cardPtTotalSeconds: totalPt,
        cardAtTotalSeconds: totalAt,
        cardStTotalSeconds: totalSt,
        previewUrl,
      });
    });
  });

  return cards;
};
const mergeAssignmentCardsWithSaved = (baseCards: any, savedCards: any) => {
  const merged: any[] = [];
  const indexById = new Map<string, number>();
  const isDeltaCard = (card: any) =>
    (resolveOptionalString(card?.type, "") ?? "").toUpperCase() === "DELTA";

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
      if (!isDeltaCard(card)) return;
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
type AssignmentCardStoreClient = Prisma.TransactionClient | typeof prisma;
const resolveAssignmentCardPayloadStatus = (card: any) => {
  const status = (resolveOptionalString(card?.status, "") ?? "").toUpperCase();
  if (status === "ST" || status === "PT" || status === "CT" || status === "AT") {
    return status === "ST" ? "ST" : "PT";
  }
  const cardStTotalSeconds = toOptionalNonNegativeInt(
    card?.cardStTotalSeconds ?? card?.totalSt,
    null
  );
  if (cardStTotalSeconds !== null && cardStTotalSeconds > 0) return "ST";
  const cardPtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardPtTotalSeconds ?? card?.totalPt,
    null
  );
  if (cardPtTotalSeconds !== null && cardPtTotalSeconds > 0) return "PT";
  return status || "NONE";
};

const stripLegacyAssignmentCardPayload = (card: any) => {
  if (!card || typeof card !== "object" || Array.isArray(card)) return card;
  const status = resolveAssignmentCardPayloadStatus(card);
  const cardQuantity = toOptionalNonNegativeInt(
    card?.cardQuantity ?? card?.quantity,
    null
  );
  const cardPtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardPtTotalSeconds ??
      card?.totalPt ??
      (status !== "ST" ? card?.stTotalSeconds : null),
    null
  );
  const cardAtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardAtTotalSeconds ?? card?.totalAt,
    null
  );
  const cardStTotalSeconds = toOptionalNonNegativeInt(
    card?.cardStTotalSeconds ??
      card?.totalSt ??
      (status === "ST" ? card?.stTotalSeconds : null),
    null
  );
  const {
    quantity: _quantity,
    totalPt: _totalPt,
    totalAt: _totalAt,
    totalSt: _totalSt,
    stTotalSeconds: _stTotalSeconds,
    totalSeconds: _totalSeconds,
    stSeconds: _stSeconds,
    contractedSeconds: _contractedSeconds,
    operatorCtProposal: _operatorCtProposal,
    pendingCtProposal: _pendingCtProposal,
    ctAgreedSnapshot: _ctAgreedSnapshot,
    ctAgreementHistory: _ctAgreementHistory,
    ...rest
  } = card as Record<string, unknown>;
  return {
    ...rest,
    status,
    ...(cardQuantity !== null ? { cardQuantity } : {}),
    ...(cardPtTotalSeconds !== null ? { cardPtTotalSeconds } : {}),
    ...(cardAtTotalSeconds !== null ? { cardAtTotalSeconds } : {}),
    ...(cardStTotalSeconds !== null ? { cardStTotalSeconds } : {}),
  };
};

const normalizeAssignmentCardsForStore = (cards: any): any[] => {
  const seen = new Set<string>();
  const normalized: any[] = [];
  ensureArray(cards).forEach((card) => {
    if (!card || typeof card !== "object" || Array.isArray(card)) return;
    const sanitizedCard = stripLegacyAssignmentCardPayload(card);
    const cardId = resolveOptionalString((sanitizedCard as any)?.id, null);
    if (!cardId || seen.has(cardId)) return;
    seen.add(cardId);
    normalized.push({
      ...(sanitizedCard as Record<string, unknown>),
      id: cardId,
      originOrderId:
        resolveOptionalString((sanitizedCard as any)?.originOrderId, null) ?? cardId,
    });
  });
  return normalized;
};
const toAssignmentCardFromStoreRow = (row: any): any | null => {
  if (!row || typeof row !== "object") return null;
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : null;
  if (!payload) return null;
  const cardId =
    resolveOptionalString((payload as any)?.id, null) ??
    resolveOptionalString(row.cardId, null);
  if (!cardId) return null;
  const sanitizedPayload = stripLegacyAssignmentCardPayload(payload);
  return {
    ...(sanitizedPayload as Record<string, unknown>),
    id: cardId,
    originOrderId:
      resolveOptionalString((sanitizedPayload as any)?.originOrderId, null) ?? cardId,
  };
};
const syncAssignmentCardsForOrg = async ({
  orgId,
  cards,
  db = prisma,
}: {
  orgId: number;
  cards: any;
  db?: AssignmentCardStoreClient;
}): Promise<any[]> => {
  const normalizedCards = normalizeAssignmentCardsForStore(cards);
  const nextCardIdSet = new Set(normalizedCards.map((card) => String(card.id)));
  await db.assignmentCard.deleteMany({
    where: {
      orgId,
      ...(nextCardIdSet.size > 0
        ? { cardId: { notIn: Array.from(nextCardIdSet.values()) } }
        : {}),
    },
  });
  for (let index = 0; index < normalizedCards.length; index += 1) {
    const card = normalizedCards[index];
    const cardId = String(card.id);
    await db.assignmentCard.upsert({
      where: {
        orgId_cardId: {
          orgId,
          cardId,
        },
      },
      update: {
        sortOrder: index,
        payload: card,
      },
      create: {
        orgId,
        cardId,
        sortOrder: index,
        payload: card,
      },
    });
  }

  return normalizedCards;
};
const loadAssignmentCardsForOrg = async ({
  orgId,
  db = prisma,
}: {
  orgId: number;
  db?: AssignmentCardStoreClient;
}): Promise<any[]> => {
  const rows = await db.assignmentCard.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { cardId: true, payload: true },
  });
  const cards = rows
    .map((row) => toAssignmentCardFromStoreRow(row))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  return cards;
};
const rebuildAssignmentCardsForOrg = async (orgId: number) => {
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, type: true },
  });
  if (!organization) return [];

  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  const [styles, orders, savedCards] = await Promise.all([
    prisma.style.findMany({
      where: { orgId: { in: accessibleOwnerOrgIds } },
      orderBy: { uid: "asc" },
      select: {
        uid: true,
        orgId: true,
        styleId: true,
        styleCode: true,
        name: true,
        customer: true,
        imageUrls: true,
        processes: true,
      },
    }),
    prisma.workOrder.findMany({
      where: { OR: getOrderAccessWhere(orgId) },
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
    loadAssignmentCardsForOrg({ orgId }),
  ]);
  const initialProcessMirrorMap = await ensureStyleProcessStorageForStyles(styles, {
    processOrgId: orgId,
  });
  const stylesWithProcesses = styles.map((style) => ({
    ...style,
    processes:
      initialProcessMirrorMap.get(Number(style.uid)) ??
      normalizeStyleProcesses(style.processes),
  }));
  const quantityByStyleUid = collectStyleQuantityRequirementsFromOrders({
    orders,
    styles: stylesWithProcesses,
  });
  const processMirrorMap = await ensureStyleStandardsForQuantities({
    styles,
    quantityByStyleUid,
    processOrgId: orgId,
  });
  const hydratedStyles = styles.map((style) => ({
    ...style,
    processes:
      processMirrorMap.get(Number(style.uid)) ??
      initialProcessMirrorMap.get(Number(style.uid)) ??
      normalizeStyleProcesses(style.processes),
  }));

  const baseCards = buildAssignmentCardsFromOrders({
    orders,
    styles: hydratedStyles,
  });
  const cards = mergeAssignmentCardsWithSaved(baseCards, savedCards);
  const syncedCards = await syncAssignmentCardsForOrg({ orgId, cards });
  await syncOrderProgressStatusesForOrg({
    orgId,
    cards: syncedCards,
  });
  return syncedCards;
};
const ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES = new Set([
  "P2034",
  "P2024",
  "P1008",
]);
const ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS = 3;
const ASSIGNMENT_CARD_REBUILD_RETRY_DELAY_MS = 120;
const assignmentCardRebuildChainByOrgId = new Map<number, Promise<any>>();
const waitMs = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const isRetryableAssignmentCardRebuildError = (error: unknown) => {
  const code = getErrorCode(error);
  if (!code) return false;
  return ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES.has(code);
};
const rebuildAssignmentCardsForOrgWithRetry = async (orgId: number) => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await rebuildAssignmentCardsForOrg(orgId);
    } catch (error) {
      lastError = error;
      if (
        attempt >= ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS ||
        !isRetryableAssignmentCardRebuildError(error)
      ) {
        throw error;
      }
      await waitMs(ASSIGNMENT_CARD_REBUILD_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
};
const enqueueAssignmentCardRebuildForOrg = async (orgId: number) => {
  const previous = assignmentCardRebuildChainByOrgId.get(orgId) ?? Promise.resolve();
  const current = previous
    .catch(() => null)
    .then(() => rebuildAssignmentCardsForOrgWithRetry(orgId));
  assignmentCardRebuildChainByOrgId.set(orgId, current);
  try {
    return await current;
  } finally {
    if (assignmentCardRebuildChainByOrgId.get(orgId) === current) {
      assignmentCardRebuildChainByOrgId.delete(orgId);
    }
  }
};
const rebuildAssignmentCardsForOrgIds = async (orgIds: Array<number | null | undefined>) => {
  const uniqueOrgIds = Array.from(
    new Set(
      orgIds
        .map((orgId) => toPositiveIntOrNull(orgId))
        .filter((orgId): orgId is number => orgId !== null)
    )
  );
  await Promise.all(
    uniqueOrgIds.map((orgId) => enqueueAssignmentCardRebuildForOrg(orgId))
  );
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
  if (parts.length < 2) return null;
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
const extractOrderIdFromAssignmentCardText = (value: any): string | null =>
  resolveOptionalString(parseAssignmentCardIdentity(value)?.orderId, null);
const getOrderRelatedOrgIds = (order: any): number[] =>
  Array.from(
    new Set(
      [order?.orgId, order?.buyerOrgId, order?.sellerOrgId]
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const buildAssignmentPlanOrderMatchWhereOr = (
  orderId: string
): Prisma.AssignmentPlanWhereInput[] => {
  const prefix = `${orderId}::`;
  return [
    { originOrderId: { startsWith: prefix } },
    { cardId: { startsWith: prefix } },
    { originOrderId: orderId },
    { cardId: orderId },
  ];
};
const resolveAssignmentStartDateKey = (assignment: any): string | null => {
  const direct = normalizeDateKey(assignment?.startDateKey);
  if (direct) return direct;
  const snapshot = resolveNormalizedAssignmentCtSnapshot(assignment);
  return normalizeDateKey(snapshot?.schedule?.startDateKey);
};
const normalizePlanIdList = (planIds: any): number[] =>
  Array.from(
    new Set(
      ensureArray(planIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const detachWorkRecordsAndDeleteAssignmentPlans = async ({
  planIds,
  db = prisma,
}: {
  planIds: any;
  db?: any;
}): Promise<{ detachedCount: number; deletedCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(planIds);
  if (normalizedPlanIds.length === 0) {
    return { detachedCount: 0, deletedCount: 0 };
  }
  const detachedResult = await db.workRecord.updateMany({
    where: { assignmentPlanId: { in: normalizedPlanIds } },
    data: { assignmentPlanId: null },
  });
  const deletedResult = await db.assignmentPlan.deleteMany({
    where: { id: { in: normalizedPlanIds } },
  });
  return {
    detachedCount: toNonNegativeInt(detachedResult?.count, 0),
    deletedCount: toNonNegativeInt(deletedResult?.count, 0),
  };
};
const loadOrderAssignmentReleaseSummary = async ({
  orderId,
  orgIds,
}: {
  orderId: string;
  orgIds: number[];
}) => {
  const normalizedOrderId = resolveOptionalString(orderId, null);
  const normalizedOrgIds = Array.from(
    new Set(
      ensureArray(orgIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
  if (!normalizedOrderId || normalizedOrgIds.length === 0) {
    return {
      orderId: normalizedOrderId ?? "",
      candidateAssignmentCount: 0,
      candidatePlanCount: 0,
      pastStartedAssignmentCount: 0,
      earliestPastStartDate: null,
      affectedOrgIds: [] as number[],
    };
  }

  const todayKey = todayDateKey();
  const planWhereOr = buildAssignmentPlanOrderMatchWhereOr(normalizedOrderId);
  const rows = await Promise.all(
    normalizedOrgIds.map(async (orgId) => {
      const [state, planCount] = await Promise.all([
        prisma.assignmentBoardState.findUnique({
          where: { orgId },
          select: { assignments: true },
        }),
        prisma.assignmentPlan.count({
          where: {
            orgId,
            OR: planWhereOr,
          },
        }),
      ]);
      const matchingAssignments = normalizeStateAssignments(state?.assignments).filter(
        (item) => resolveOrderIdFromAssignmentBoardItem(item) === normalizedOrderId
      );
      let pastStartedCount = 0;
      let earliestPastStartDate: string | null = null;
      matchingAssignments.forEach((assignment) => {
        const startDateKey = resolveAssignmentStartDateKey(assignment);
        if (!startDateKey || startDateKey >= todayKey) return;
        pastStartedCount += 1;
        if (!earliestPastStartDate || startDateKey < earliestPastStartDate) {
          earliestPastStartDate = startDateKey;
        }
      });
      return {
        orgId,
        assignmentCount: matchingAssignments.length,
        planCount: toNonNegativeInt(planCount, 0),
        pastStartedCount,
        earliestPastStartDate,
      };
    })
  );

  let candidateAssignmentCount = 0;
  let candidatePlanCount = 0;
  let pastStartedAssignmentCount = 0;
  let earliestPastStartDate: string | null = null;
  const affectedOrgIds: number[] = [];
  rows.forEach((row) => {
    candidateAssignmentCount += row.assignmentCount;
    candidatePlanCount += row.planCount;
    pastStartedAssignmentCount += row.pastStartedCount;
    const rowEarliestPastStartDate = resolveOptionalString(
      row.earliestPastStartDate,
      null
    );
    if (
      rowEarliestPastStartDate &&
      (!earliestPastStartDate || rowEarliestPastStartDate < earliestPastStartDate)
    ) {
      earliestPastStartDate = rowEarliestPastStartDate;
    }
    if (row.assignmentCount > 0 || row.planCount > 0) {
      affectedOrgIds.push(row.orgId);
    }
  });

  return {
    orderId: normalizedOrderId,
    candidateAssignmentCount,
    candidatePlanCount,
    pastStartedAssignmentCount,
    earliestPastStartDate,
    affectedOrgIds,
  };
};
const releaseOrderAssignmentsForUnlock = async ({
  orderId,
  orgIds,
}: {
  orderId: string;
  orgIds: number[];
}) => {
  const normalizedOrderId = resolveOptionalString(orderId, null);
  const normalizedOrgIds = Array.from(
    new Set(
      ensureArray(orgIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
  if (!normalizedOrderId || normalizedOrgIds.length === 0) {
    return {
      orderId: normalizedOrderId ?? "",
      releasedAssignmentCount: 0,
      releasedPlanCount: 0,
      detachedWorkRecordCount: 0,
      affectedOrgIds: [] as number[],
    };
  }

  const planWhereOr = buildAssignmentPlanOrderMatchWhereOr(normalizedOrderId);
  let releasedAssignmentCount = 0;
  let releasedPlanCount = 0;
  let detachedWorkRecordCount = 0;
  const affectedOrgIdSet = new Set<number>();

  for (const orgId of normalizedOrgIds) {
    const releasedForOrg = await prisma.$transaction(async (tx) => {
      const state = await tx.assignmentBoardState.findUnique({
        where: { orgId },
        select: { id: true, assignments: true },
      });
      const currentAssignments = normalizeStateAssignments(state?.assignments);
      const releasedAssignments = currentAssignments.filter(
        (item) => resolveOrderIdFromAssignmentBoardItem(item) === normalizedOrderId
      );
      const releasedAssignmentCountForOrg = releasedAssignments.length;
      const nextAssignments =
        releasedAssignmentCountForOrg > 0
          ? currentAssignments.filter(
              (item) => resolveOrderIdFromAssignmentBoardItem(item) !== normalizedOrderId
            )
          : currentAssignments;

      if (state && releasedAssignmentCountForOrg > 0) {
        await tx.assignmentBoardState.update({
          where: { id: state.id },
          data: { assignments: nextAssignments },
        });
      }

      const releasedExternalIds = Array.from(
        new Set(
          releasedAssignments
            .map((item) => resolveAssignmentExternalId(item))
            .filter((value): value is string => Boolean(value))
        )
      );
      const lookupWhereOr: Prisma.AssignmentPlanWhereInput[] = [...planWhereOr];
      if (releasedExternalIds.length > 0) {
        lookupWhereOr.push({ externalId: { in: releasedExternalIds } });
      }
      const planRows = await tx.assignmentPlan.findMany({
        where: {
          orgId,
          OR: lookupWhereOr,
        },
        select: { id: true },
      });
      const releaseResult = await detachWorkRecordsAndDeleteAssignmentPlans({
        planIds: planRows.map((plan) => plan.id),
        db: tx,
      });
      return {
        releasedAssignmentCountForOrg,
        releasedPlanCountForOrg: releaseResult.deletedCount,
        detachedWorkRecordCountForOrg: releaseResult.detachedCount,
      };
    });

    releasedAssignmentCount += releasedForOrg.releasedAssignmentCountForOrg;
    releasedPlanCount += releasedForOrg.releasedPlanCountForOrg;
    detachedWorkRecordCount += releasedForOrg.detachedWorkRecordCountForOrg;
    if (
      releasedForOrg.releasedAssignmentCountForOrg > 0 ||
      releasedForOrg.releasedPlanCountForOrg > 0 ||
      releasedForOrg.detachedWorkRecordCountForOrg > 0
    ) {
      affectedOrgIdSet.add(orgId);
      await syncOrderProgressStatusesForOrg({
        orgId,
        orderIds: [normalizedOrderId],
        includeTerminalStages: true,
      });
    }
  }

  return {
    orderId: normalizedOrderId,
    releasedAssignmentCount,
    releasedPlanCount,
    detachedWorkRecordCount,
    affectedOrgIds: Array.from(affectedOrgIdSet.values()),
  };
};
const buildOrderModificationLockState = ({
  order,
  isAssignmentLocked = false,
}: {
  order: any;
  isAssignmentLocked?: boolean;
}) => {
  const isManualLocked = Boolean(order?.modificationLockedAt);
  const assignmentLocked = Boolean(isAssignmentLocked);
  return {
    isManualLocked,
    isAssignmentLocked: assignmentLocked,
    canToggle: true,
    isLocked: isManualLocked,
  };
};
const loadOrderAssignmentModificationLockMap = async (
  orders: any[]
): Promise<Map<string, boolean>> => {
  const safeOrders = ensureArray(orders).filter((order) => order && typeof order === "object");
  const orderIds = Array.from(
    new Set(
      safeOrders
        .map((order) => resolveOptionalString(order?.orderId ?? order?.id, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const lockMap = new Map<string, boolean>();
  if (orderIds.length === 0) return lockMap;

  const orderIdSet = new Set(orderIds);
  const orgIds = Array.from(
    new Set(safeOrders.flatMap((order) => getOrderRelatedOrgIds(order)))
  );
  if (orgIds.length === 0) return lockMap;

  let lockedPlans: Array<{ originOrderId: string | null; cardId: string | null }> = [];
  try {
    lockedPlans = await prisma.assignmentPlan.findMany({
      where: {
        orgId: { in: orgIds },
        ctTotalSeconds: { not: null },
      },
      select: {
        originOrderId: true,
        cardId: true,
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    lockedPlans = await prisma.assignmentPlan.findMany({
      where: {
        orgId: { in: orgIds },
        assignmentCtSnapshot: { not: Prisma.JsonNull },
      },
      select: {
        originOrderId: true,
        cardId: true,
      },
    });
  }
  lockedPlans.forEach((plan) => {
    const orderId =
      extractOrderIdFromAssignmentCardText(plan?.originOrderId) ??
      extractOrderIdFromAssignmentCardText(plan?.cardId);
    if (!orderId || !orderIdSet.has(orderId)) return;
    lockMap.set(orderId, true);
  });
  return lockMap;
};
const isOrderAssignmentModificationLocked = async (order: any): Promise<boolean> => {
  const orderId = resolveOptionalString(order?.orderId ?? order?.id, null);
  if (!orderId) return false;
  const orgIds = getOrderRelatedOrgIds(order);
  if (orgIds.length === 0) return false;

  const prefix = `${orderId}::`;
  let lockedPlan: { id: number } | null = null;
  try {
    lockedPlan = await prisma.assignmentPlan.findFirst({
      where: {
        orgId: { in: orgIds },
        ctTotalSeconds: { not: null },
        OR: [
          { originOrderId: { startsWith: prefix } },
          { cardId: { startsWith: prefix } },
        ],
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    lockedPlan = await prisma.assignmentPlan.findFirst({
      where: {
        orgId: { in: orgIds },
        assignmentCtSnapshot: { not: Prisma.JsonNull },
        OR: [
          { originOrderId: { startsWith: prefix } },
          { cardId: { startsWith: prefix } },
        ],
      },
      select: { id: true },
    });
  }
  return Boolean(lockedPlan);
};
const getOrderModificationLockState = async (order: any) =>
  buildOrderModificationLockState({
    order,
    isAssignmentLocked: await isOrderAssignmentModificationLocked(order),
  });
const isOrderModificationLocked = async (order: any): Promise<boolean> => {
  return (await getOrderModificationLockState(order)).isLocked;
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
  const hasVariantIdentity = Boolean(
    normalizeAssignmentDisplayKey(identity?.colorKey) ||
      normalizeAssignmentDisplayGender(identity?.gender)
  );
  const gender =
    normalizeAssignmentDisplayGender(identity?.gender) ||
    normalizeAssignmentDisplayGender(target?.gender) ||
    (hasVariantIdentity ? normalizeAssignmentDisplayGender(orderItem?.gender) : "");
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
      (hasVariantIdentity ? resolveOptionalString(orderItem?.colorName, null) : null) ??
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
const safelyRepairAssignmentBoardDisplayState = async ({
  orgId,
  cards,
  assignments,
  refs = null,
  context,
}: {
  orgId: number;
  cards: any;
  assignments: any;
  refs?: AssignmentDisplayReferenceMaps | null;
  context: string;
}): Promise<{
  cards: any[];
  assignments: any[];
  changed: boolean;
  refs: AssignmentDisplayReferenceMaps | null;
}> => {
  try {
    return await repairAssignmentBoardDisplayState({
      orgId,
      cards,
      assignments,
      refs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[assignment-board] display repair skipped (${context}, org=${orgId}): ${message}`
    );
    return {
      cards: ensureArray(cards),
      assignments: normalizeStateAssignments(assignments),
      changed: false,
      refs,
    };
  }
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
const toAssignmentPlanResponse = (plan: any) => {
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...plan,
    assignmentCtSnapshot,
  });
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const completedAt = resolveAssignmentPlanClosedAt(plan);
  const isCompleted = plan?.isCompleted === true;
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: toOptionalNonNegativeInt(plan?.quantity, null),
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);
  return {
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
    ctTotalSeconds,
    assignmentCtSnapshot,
    ctUpdatedBy: assignmentCtSnapshot?.updatedBy ?? "",
    ctUpdatedAt: assignmentCtSnapshot?.updatedAt ?? null,
    color: plan.color ?? "",
    stripeColor: plan.stripeColor ?? "",
    stTotalSeconds: plan.stTotalSeconds ?? null,
    startIndex: plan.startIndex,
    endIndex: plan.endIndex,
    startDayOffsetPercent: plan.startDayOffsetPercent ?? null,
    startDayPercent: plan.startDayPercent ?? null,
    endDayPercent: plan.endDayPercent ?? null,
    isCompleted,
    finalQuantity,
    closedQty,
    completedAt,
    closedAt: completedAt,
    closedBy: resolveOptionalString(plan?.closedBy, null),
    closeMode,
    closeBasis,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};
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
      const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
      const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
        ...item,
        assignmentCtSnapshot,
      });
      const stTotalSeconds =
        toOptionalNonNegativeInt(item.stTotalSeconds, null);
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
        ctTotalSeconds,
        assignmentCtSnapshot,
        color: resolveOptionalString(item.color, null),
        stripeColor: resolveOptionalString(item.stripeColor, null),
        stTotalSeconds,
        startIndex,
        endIndex,
        startDayOffsetPercent: toOptionalFloat(item.startDayOffsetPercent, null),
        startDayPercent: toOptionalFloat(item.startDayPercent, null),
        endDayPercent: toOptionalFloat(item.endDayPercent, null),
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
const resolveAssignmentSnapshotProcessCodeCandidates = (process: any): string[] => {
  const bucket = new Set<string>();
  const pushCode = (value: any) => {
    const key = normalizeProcessCodeKey(value);
    if (key) bucket.add(key);
  };

  pushCode(process?.processCode);
  pushCode(process?.code);
  const processKey = resolveOptionalString(process?.processKey, null);
  if (processKey) {
    pushCode(processKey);
    const instancePatternMatch = processKey.match(/^(.*)-\d+-\d+$/);
    if (instancePatternMatch?.[1]) {
      pushCode(instancePatternMatch[1]);
    }
  }
  return Array.from(bucket.values());
};
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
const toAssignmentPlanWriteData = (item: any) => {
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...item,
    assignmentCtSnapshot,
  });
  // Completion state is owned by dedicated completion endpoints.
  // Assignment board save must not overwrite completion-related fields.
  return {
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
    ctTotalSeconds,
    assignmentCtSnapshot: (assignmentCtSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
    color: item.color ?? null,
    stripeColor: item.stripeColor ?? null,
    stTotalSeconds: item.stTotalSeconds ?? null,
    startIndex: item.startIndex,
    endIndex: item.endIndex,
    startDayOffsetPercent: item.startDayOffsetPercent ?? null,
    startDayPercent: item.startDayPercent ?? null,
    endDayPercent: item.endDayPercent ?? null,
    updatedAt: item.updatedAt ?? new Date(),
  };
};
const COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  orderNo: true,
  customer: true,
  label: true,
  colorId: true,
  colorName: true,
  previewUrl: true,
  imageUrl: true,
  thumbnailUrl: true,
  quantity: true,
  originOrderId: true,
  basis: true,
  ctTotalSeconds: true,
  assignmentCtSnapshot: true,
  color: true,
  stripeColor: true,
  stTotalSeconds: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  isCompleted: true,
};
const normalizeAssignmentLineIdForWriteCompare = (value: any): number | null => {
  const lineId = toNumberOrNull(value);
  return typeof lineId === "number" && Number.isFinite(lineId)
    ? Math.round(lineId)
    : null;
};
const buildCompletedAssignmentWriteComparable = (item: any) => {
  const assignmentCtSnapshot = normalizeAssignmentCtSnapshot(
    item?.assignmentCtSnapshot ?? item?.ctSnapshot
  );
  const assignmentCtTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...item,
    assignmentCtSnapshot,
  });
  return {
    lineId: normalizeAssignmentLineIdForWriteCompare(item?.lineId),
    cardId: resolveOptionalString(item?.cardId, null),
    orderNo: resolveOptionalString(item?.orderNo, null),
    customer: resolveOptionalString(item?.customer, null),
    label: resolveOptionalString(item?.label, null),
    colorId: toPositiveIntOrNull(item?.colorId),
    colorName: resolveOptionalString(item?.colorName, null),
    previewUrl: resolveOptionalString(item?.previewUrl, null),
    imageUrl: resolveOptionalString(item?.imageUrl, null),
    thumbnailUrl: resolveOptionalString(item?.thumbnailUrl, null),
    assignmentQuantity: toOptionalNonNegativeInt(
      item?.assignmentQuantity ?? item?.quantity,
      null
    ),
    originOrderId: resolveOptionalString(item?.originOrderId, null),
    basis: resolveOptionalString(item?.basis, null),
    assignmentCtTotalSeconds,
    assignmentCtSnapshot,
    color: resolveOptionalString(item?.color, null),
    stripeColor: resolveOptionalString(item?.stripeColor, null),
    assignmentStTotalSeconds: toOptionalNonNegativeInt(
      item?.assignmentStTotalSeconds ?? item?.stTotalSeconds,
      null
    ),
    startIndex: toSignedInt(item?.startIndex, 0),
    endIndex: Math.max(
      toSignedInt(item?.startIndex, 0),
      toSignedInt(item?.endIndex, toSignedInt(item?.startIndex, 0))
    ),
    startDayOffsetPercent: toOptionalFloat(item?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(item?.startDayPercent, null),
    endDayPercent: toOptionalFloat(item?.endDayPercent, null),
  };
};
const listCompletedAssignmentWriteDiffFields = (current: any, incoming: any): string[] => {
  const currentComparable = buildCompletedAssignmentWriteComparable(current);
  const incomingComparable = buildCompletedAssignmentWriteComparable(incoming);
  return Object.keys(currentComparable).filter(
    (key) =>
      toStableJsonText((currentComparable as any)[key]) !==
      toStableJsonText((incomingComparable as any)[key])
  );
};
const normalizeAssignmentStDraftsPayload = (value: any) => {
  if (value === undefined) return new Map<string, Map<string, number>>();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "invalid stDrafts payload");
  }

  const result = new Map<string, Map<string, number>>();
  Object.entries(value).forEach(([rawExternalId, rawDraft]) => {
    const externalId = resolveOptionalString(rawExternalId, null);
    if (!externalId) return;
    if (rawDraft === undefined) return;
    if (rawDraft === null || typeof rawDraft !== "object" || Array.isArray(rawDraft)) {
      throw createHttpError(400, "invalid stDrafts assignment entry");
    }

    const processDrafts = new Map<string, number>();
    Object.entries(rawDraft).forEach(([rawProcessKey, rawSeconds]) => {
      const processKey = resolveOptionalString(rawProcessKey, null);
      if (!processKey) return;
      const seconds = toOptionalProcessSeconds(rawSeconds);
      if (seconds === null || seconds <= 0) {
        throw createHttpError(400, "invalid stDrafts seconds");
      }
      processDrafts.set(processKey, seconds);
    });

    if (processDrafts.size > 0) {
      result.set(externalId, processDrafts);
    }
  });
  return result;
};

const buildAssignmentStDraftWarnings = ({
  assignmentExternalId,
  processKeys,
  reason,
}: {
  assignmentExternalId: string;
  processKeys: string[];
  reason: string;
}) =>
  processKeys.map((processKey) => ({
    type: "ST_DRAFT_PROCESS_IGNORED",
    assignmentId: assignmentExternalId,
    processKey,
    reason,
  }));

const resolveAssignmentStyleIdForStCalculation = ({
  assignment,
  cardById,
}: {
  assignment: any;
  cardById: Map<string, any>;
}) => {
  const cardId = resolveOptionalString(
    assignment?.cardId ?? assignment?.originOrderId,
    null
  );
  const linkedCard = cardId ? cardById.get(cardId) ?? null : null;
  const parsedCardIdentity = cardId ? parseAssignmentCardIdentity(cardId) : null;
  return resolveOptionalString(
    linkedCard?.styleId ?? parsedCardIdentity?.styleId ?? assignment?.styleId,
    null
  );
};

const buildStyleProcessLookupForStCalculation = (styleProcessRows: any[]) => {
  const byStyleUidAndId = new Map<string, any>();
  const byStyleUidAndCode = new Map<string, any>();
  const byStyleUidAndName = new Map<string, any>();

  ensureArray(styleProcessRows).forEach((row) => {
    const styleUid = toPositiveIntOrNull(row?.styleUid);
    const rowId = toPositiveIntOrNull(row?.id);
    if (styleUid === null || rowId === null) return;
    byStyleUidAndId.set(`${styleUid}::${rowId}`, row);

    const codeKey = normalizeProcessCodeKey(row?.processCode);
    if (codeKey) {
      byStyleUidAndCode.set(`${styleUid}::${codeKey}`, row);
    }

    const nameKey = normalizeProcessNameKey(row?.processName);
    if (nameKey) {
      byStyleUidAndName.set(`${styleUid}::${nameKey}`, row);
    }
  });

  const resolveRowForSnapshotProcess = (styleUid: number, process: any) => {
    const processId = toPositiveIntOrNull(process?.processId ?? process?.id);
    if (processId !== null) {
      const byId = byStyleUidAndId.get(`${styleUid}::${processId}`);
      if (byId) return byId;
    }

    for (const codeKey of resolveAssignmentSnapshotProcessCodeCandidates(process)) {
      const byCode = byStyleUidAndCode.get(`${styleUid}::${codeKey}`);
      if (byCode) return byCode;
    }

    const nameKey = normalizeProcessNameKey(
      process?.name ?? process?.processName ?? process?.label
    );
    if (nameKey) {
      return byStyleUidAndName.get(`${styleUid}::${nameKey}`) ?? null;
    }
    return null;
  };

  return {
    resolveRowForSnapshotProcess,
  };
};

const resolveStyleProcessBucketStSeconds = (row: any, bucketQuantity: number) => {
  const standard = ensureArray(row?.standards).find(
    (item) =>
      resolveStBucketQuantity((item as any)?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY) ===
      bucketQuantity
  );
  const bucketStSeconds = toOptionalProcessSeconds((standard as any)?.bucketStSeconds);
  if (bucketStSeconds !== null) return bucketStSeconds;
  return toOptionalProcessSeconds(row?.ptSeconds);
};

const calculateAssignmentStTotalSecondsFromStyleRows = ({
  styleProcessRows,
  assignmentQuantity,
  bucketQuantity,
}: {
  styleProcessRows: any[];
  assignmentQuantity: number;
  bucketQuantity: number;
}) => {
  let pieceStTotalSeconds = 0;
  let hasAnyProcessSt = false;
  ensureArray(styleProcessRows).forEach((row) => {
    const bucketStSeconds = resolveStyleProcessBucketStSeconds(row, bucketQuantity);
    if (bucketStSeconds === null) return;
    const timesPerPiece = toPositiveInt(row?.timesPerPiece, 1);
    pieceStTotalSeconds += bucketStSeconds * timesPerPiece;
    hasAnyProcessSt = true;
  });
  if (!hasAnyProcessSt) return null;
  return Math.max(0, Math.round(pieceStTotalSeconds * assignmentQuantity));
};

const calculateAssignmentStTotalSecondsFromSnapshotProcesses = ({
  snapshotProcesses,
  assignmentQuantity,
  bucketQuantity,
  styleUid,
  styleProcessLookup,
}: {
  snapshotProcesses: any[];
  assignmentQuantity: number;
  bucketQuantity: number;
  styleUid: number | null;
  styleProcessLookup: ReturnType<typeof buildStyleProcessLookupForStCalculation>;
}) => {
  let pieceStTotalSeconds = 0;
  let hasAnyProcessSt = false;
  ensureArray(snapshotProcesses).forEach((process) => {
    const matchedRow =
      styleUid === null
        ? null
        : styleProcessLookup.resolveRowForSnapshotProcess(styleUid, process);
    const bucketStSeconds =
      matchedRow !== null
        ? resolveStyleProcessBucketStSeconds(matchedRow, bucketQuantity)
        : null;
    if (bucketStSeconds === null) return;
    const timesPerPiece = toPositiveInt(process?.timesPerPiece ?? process?.quantity, 1);
    pieceStTotalSeconds += bucketStSeconds * timesPerPiece;
    hasAnyProcessSt = true;
  });
  if (!hasAnyProcessSt) return null;
  return Math.max(0, Math.round(pieceStTotalSeconds * assignmentQuantity));
};

const hasAssignmentStructuralStChange = (assignment: any, existingPlan: any) => {
  if (!existingPlan) return true;
  const assignmentQuantity = toOptionalNonNegativeInt(assignment?.quantity, null);
  const existingQuantity = toOptionalNonNegativeInt(existingPlan?.quantity, null);
  if (assignmentQuantity !== existingQuantity) return true;

  const lineId = normalizeAssignmentLineIdForWriteCompare(assignment?.lineId);
  const existingLineId = normalizeAssignmentLineIdForWriteCompare(existingPlan?.lineId);
  if (lineId !== existingLineId) return true;

  const startIndex = toSignedInt(assignment?.startIndex, 0);
  const existingStartIndex = toSignedInt(existingPlan?.startIndex, 0);
  if (startIndex !== existingStartIndex) return true;

  const endIndex = Math.max(startIndex, toSignedInt(assignment?.endIndex, startIndex));
  const existingEndIndex = Math.max(
    existingStartIndex,
    toSignedInt(existingPlan?.endIndex, existingStartIndex)
  );
  return endIndex !== existingEndIndex;
};
const prepareAssignmentBoardStTotalsForSave = async ({
  organization,
  accessibleStyleOwnerOrgIds,
  cards,
  assignments,
  existingPlanByExternalId,
  stDraftsByExternalId,
  db,
}: {
  organization: any;
  accessibleStyleOwnerOrgIds: number[];
  cards: any[];
  assignments: any[];
  existingPlanByExternalId: Map<string, any>;
  stDraftsByExternalId: Map<string, Map<string, number>>;
  db: any;
}) => {
  const normalizedAssignments = ensureArray(assignments).filter(
    (item) => item && typeof item === "object"
  );
  const warnings: any[] = [];
  const changedExternalIds = new Set<string>();
  if (normalizedAssignments.length === 0) {
    return { assignments: normalizedAssignments, warnings, changedExternalIds };
  }

  const cardById = ensureArray(cards).reduce((map, card) => {
    const cardId = resolveOptionalString(card?.id, null);
    if (!cardId || map.has(cardId)) return map;
    map.set(cardId, card);
    return map;
  }, new Map<string, any>());

  const targetByExternalId = new Map<string, any>();
  const assignmentStyleIds = new Set<string>();
  normalizedAssignments.forEach((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || Boolean(assignment?.isCompleted)) return;

    const existingPlan = existingPlanByExternalId.get(externalId) ?? null;
    const stDrafts = stDraftsByExternalId.get(externalId) ?? new Map<string, number>();
    const hasStDrafts = stDrafts.size > 0;
    const hasStructuralChange = hasAssignmentStructuralStChange(assignment, existingPlan);
    const existingAssignmentStTotalSeconds = toOptionalNonNegativeInt(
      existingPlan?.stTotalSeconds,
      null
    );

    const styleId = resolveAssignmentStyleIdForStCalculation({
      assignment,
      cardById,
    });
    const shouldRecalculate = hasStDrafts || hasStructuralChange;
    if (shouldRecalculate && styleId) assignmentStyleIds.add(styleId);

    targetByExternalId.set(externalId, {
      assignment,
      existingPlan,
      existingAssignmentStTotalSeconds,
      stDrafts,
      hasStDrafts,
      hasStructuralChange,
      styleId,
      shouldRecalculate,
    });
  });

  const recalcTargets = Array.from(targetByExternalId.values()).filter(
    (target) => target.shouldRecalculate
  );
  if (assignmentStyleIds.size === 0 && recalcTargets.length === 0) {
    const assignmentsWithExistingTotals = normalizedAssignments.map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      const target = externalId ? targetByExternalId.get(externalId) : null;
      const existingAssignmentStTotalSeconds =
        target?.existingAssignmentStTotalSeconds ?? null;
      if (existingAssignmentStTotalSeconds === null) return assignment;
      if (
        externalId &&
        toOptionalNonNegativeInt(assignment?.stTotalSeconds, null) !==
        existingAssignmentStTotalSeconds
      ) {
        changedExternalIds.add(externalId);
      }
      return {
        ...assignment,
        stTotalSeconds: existingAssignmentStTotalSeconds,
      };
    });
    return { assignments: assignmentsWithExistingTotals, warnings, changedExternalIds };
  }

  const styles =
    assignmentStyleIds.size > 0
      ? await db.style.findMany({
          where: {
            orgId: { in: accessibleStyleOwnerOrgIds },
            styleId: { in: Array.from(assignmentStyleIds.values()) },
          },
          orderBy: { uid: "asc" },
          select: {
            uid: true,
            orgId: true,
            styleId: true,
            processes: true,
          },
        })
      : [];
  const styleByStyleId = ensureArray(styles).reduce((map, style) => {
    const styleId = resolveOptionalString(style?.styleId, null);
    const styleUid = toPositiveIntOrNull(style?.uid);
    if (!styleId || styleUid === null || map.has(styleId)) return map;
    map.set(styleId, style);
    return map;
  }, new Map<string, any>());

  const quantityByStyleUid = new Map<number, Set<number>>();
  recalcTargets.forEach((target) => {
    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleUid = toPositiveIntOrNull(style?.uid);
    if (styleUid === null) return;
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    const current = quantityByStyleUid.get(styleUid) ?? new Set<number>();
    current.add(bucketQuantity);
    quantityByStyleUid.set(styleUid, current);
  });

  const styleRowsForStCalculation = Array.from(styleByStyleId.values()) as any[];
  const styleUids = Array.from(
    new Set(
      styleRowsForStCalculation
        .map((style) => toPositiveIntOrNull(style?.uid))
        .filter((styleUid): styleUid is number => styleUid !== null)
    )
  );
  if (styleUids.length > 0) {
    await ensureStyleStandardsForQuantities({
      styles: styleRowsForStCalculation,
      quantityByStyleUid,
      processOrgId: organization.id,
      db,
    });
  }

  let styleProcessRowsByStyleUid =
    styleUids.length > 0
      ? await loadStyleProcessRowsByStyleUid(styleUids, {
          processOrgId: organization.id,
          db,
        })
      : new Map<number, any[]>();
  let styleProcessLookup = buildStyleProcessLookupForStCalculation(
    Array.from(styleProcessRowsByStyleUid.values()).flat()
  );

  const standardUpserts = new Map<
    string,
    { styleProcessId: number; bucketQuantity: number; bucketStSeconds: number }
  >();
  recalcTargets.forEach((target) => {
    if (!target.hasStDrafts) return;
    const externalId = resolveAssignmentExternalId(target.assignment);
    if (!externalId) return;

    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleUid = toPositiveIntOrNull(style?.uid);
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(target.assignment);
    const snapshotProcessByKey = ensureArray(ctSnapshot?.processes).reduce(
      (map, process) => {
        const processKey = resolveOptionalString(process?.processKey, null);
        if (!processKey || map.has(processKey)) return map;
        map.set(processKey, process);
        return map;
      },
      new Map<string, any>()
    );

    const missingProcessKeys: string[] = [];
    const unmatchedProcessKeys: string[] = [];
    target.stDrafts.forEach((bucketStSeconds: number, processKey: string) => {
      const snapshotProcess = snapshotProcessByKey.get(processKey) ?? null;
      if (!snapshotProcess) {
        missingProcessKeys.push(processKey);
        return;
      }
      if (styleUid === null) {
        unmatchedProcessKeys.push(processKey);
        return;
      }
      const styleProcessRow = styleProcessLookup.resolveRowForSnapshotProcess(
        styleUid,
        snapshotProcess
      );
      const styleProcessId = toPositiveIntOrNull(styleProcessRow?.id);
      if (styleProcessId === null) {
        unmatchedProcessKeys.push(processKey);
        return;
      }
      standardUpserts.set(`${styleProcessId}::${bucketQuantity}`, {
        styleProcessId,
        bucketQuantity,
        bucketStSeconds,
      });
    });

    warnings.push(
      ...buildAssignmentStDraftWarnings({
        assignmentExternalId: externalId,
        processKeys: missingProcessKeys,
        reason: "processKey not found in assignment snapshot",
      }),
      ...buildAssignmentStDraftWarnings({
        assignmentExternalId: externalId,
        processKeys: unmatchedProcessKeys,
        reason: "processKey not matched to style process standard",
      })
    );
  });

  if (standardUpserts.size > 0) {
    const now = new Date();
    await Promise.all(
      Array.from(standardUpserts.values()).map((item) =>
        db.styleProcessStandard.upsert({
          where: {
            styleProcessId_bucketQuantity: {
              styleProcessId: item.styleProcessId,
              bucketQuantity: item.bucketQuantity,
            },
          },
          create: {
            orgId: organization.id,
            styleProcessId: item.styleProcessId,
            bucketQuantity: item.bucketQuantity,
            bucketStSeconds: item.bucketStSeconds,
            setBy: "ASSIGNMENT_DETAIL",
            setAt: now,
          },
          update: {
            bucketStSeconds: item.bucketStSeconds,
            setBy: "ASSIGNMENT_DETAIL",
            setAt: now,
          },
        })
      )
    );

    styleProcessRowsByStyleUid = await loadStyleProcessRowsByStyleUid(styleUids, {
      processOrgId: organization.id,
      db,
    });
    styleProcessLookup = buildStyleProcessLookupForStCalculation(
      Array.from(styleProcessRowsByStyleUid.values()).flat()
    );
  }

  const assignmentStTotalSecondsByExternalId = new Map<string, number>();
  targetByExternalId.forEach((target, externalId) => {
    if (!target.shouldRecalculate) {
      if (target.existingAssignmentStTotalSeconds !== null) {
        assignmentStTotalSecondsByExternalId.set(
          externalId,
          target.existingAssignmentStTotalSeconds
        );
      }
      return;
    }

    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleUid = toPositiveIntOrNull(style?.uid);
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    let assignmentStTotalSeconds: number | null = null;

    if (target.hasStructuralChange) {
      const styleProcessRows =
        styleUid === null ? [] : styleProcessRowsByStyleUid.get(styleUid) ?? [];
      assignmentStTotalSeconds = calculateAssignmentStTotalSecondsFromStyleRows({
        styleProcessRows,
        assignmentQuantity,
        bucketQuantity,
      });
      if (assignmentStTotalSeconds === null && style) {
        const fallbackTotal = calculateAssignmentCardStTotalForOrderQuantity(
          style.processes,
          assignmentQuantity
        );
        assignmentStTotalSeconds = fallbackTotal > 0 ? fallbackTotal : null;
      }
    } else {
      const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(target.assignment);
      assignmentStTotalSeconds = calculateAssignmentStTotalSecondsFromSnapshotProcesses({
        snapshotProcesses: ensureArray(ctSnapshot?.processes),
        assignmentQuantity,
        bucketQuantity,
        styleUid,
        styleProcessLookup,
      });
    }

    if (assignmentStTotalSeconds === null) {
      throw createHttpError(
        409,
        `assignment ST total cannot be recalculated: ${externalId}`
      );
    }
    assignmentStTotalSecondsByExternalId.set(externalId, assignmentStTotalSeconds);
  });

  const nextAssignments = normalizedAssignments.map((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || !assignmentStTotalSecondsByExternalId.has(externalId)) {
      return assignment;
    }
    const assignmentStTotalSeconds =
      assignmentStTotalSecondsByExternalId.get(externalId) ?? null;
    if (
      assignmentStTotalSeconds !== null &&
      toOptionalNonNegativeInt(assignment?.stTotalSeconds, null) !==
        assignmentStTotalSeconds
    ) {
      changedExternalIds.add(externalId);
    }
    return {
      ...assignment,
      stTotalSeconds: assignmentStTotalSeconds,
    };
  });

  return { assignments: nextAssignments, warnings, changedExternalIds };
};
const toAssignmentBoardStateResponse = (
  state: any,
  assignmentPlans: any[] | null = null,
  cards: any[] | null = null
) => {
  const stateAssignments = normalizeStateAssignments(state?.assignments);
  const mergedAssignments =
    Array.isArray(assignmentPlans) && assignmentPlans.length > 0
      ? mergeAssignmentPlanResponsesWithState(assignmentPlans, stateAssignments)
      : stateAssignments;
  return {
    cards: Array.isArray(cards) ? cards : ensureArray(state?.cards),
    assignments: normalizeStateAssignments(mergedAssignments),
    createdAt: state?.createdAt ?? null,
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  };
};
const ASSIGNMENT_PLAN_SELECT_CORE = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  orderNo: true,
  customer: true,
  label: true,
  colorId: true,
  colorName: true,
  previewUrl: true,
  imageUrl: true,
  thumbnailUrl: true,
  quantity: true,
  originOrderId: true,
  basis: true,
  ctTotalSeconds: true,
  assignmentCtSnapshot: true,
  color: true,
  stripeColor: true,
  stTotalSeconds: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  createdAt: true,
  updatedAt: true,
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_CLOSE = {
  ...ASSIGNMENT_PLAN_SELECT_CORE,
  isCompleted: true,
  finalQuantity: true,
  completedAt: true,
  closedQty: true,
  closedAt: true,
  closedBy: true,
  closeMode: true,
  closeBasis: true,
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION = {
  ...ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
  productionCompletedAt: true,
  actualProducedCompletedAt: true,
  candidateEndDate: true,
  renderEndDate: true,
  forecastCompletedAt: true,
  forecastBasis: true,
  confidence: true,
  scheduleStatus: true,
} as const;
// Legacy fallback: excludes stTotalSeconds/ctTotalSeconds for DB schema drift tolerance
const ASSIGNMENT_PLAN_SELECT_LEGACY = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  orderNo: true,
  customer: true,
  label: true,
  colorId: true,
  colorName: true,
  previewUrl: true,
  imageUrl: true,
  thumbnailUrl: true,
  quantity: true,
  originOrderId: true,
  basis: true,
  assignmentCtSnapshot: true,
  color: true,
  stripeColor: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  createdAt: true,
  updatedAt: true,
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY = {
  ...ASSIGNMENT_PLAN_SELECT_LEGACY,
  isCompleted: true,
  finalQuantity: true,
  completedAt: true,
  closedQty: true,
  closedAt: true,
  closedBy: true,
  closeMode: true,
  closeBasis: true,
} as const;
const isAssignmentPlanMissingColumnError = (error: any): boolean => {
  const code = resolveOptionalString(error?.code, null);
  if (code === "P2022") return true;
  const message = resolveOptionalString(error?.message, String(error || "")) || "";
  return /column/i.test(message) && /does not exist/i.test(message);
};
const findAssignmentPlansWithSelectFallback = async ({
  where,
  orderBy,
  selectAttempts,
  context,
}: {
  where: Prisma.AssignmentPlanWhereInput;
  orderBy: Prisma.AssignmentPlanOrderByWithRelationInput[];
  selectAttempts: ReadonlyArray<Record<string, true>>;
  context: string;
}): Promise<any[]> => {
  let lastError: any = null;
  for (let index = 0; index < selectAttempts.length; index += 1) {
    const select = selectAttempts[index]!;
    try {
      return await prisma.assignmentPlan.findMany({
        where,
        orderBy,
        select: select as any,
      });
    } catch (error) {
      lastError = error;
      if (!isAssignmentPlanMissingColumnError(error) || index >= selectAttempts.length - 1) {
        throw error;
      }
      const missingColumn =
        resolveOptionalString((error as any)?.meta?.column, null) || "unknown";
      console.warn(
        `[assignment-plan] ${context}: missing column '${missingColumn}', retrying with legacy select`
      );
    }
  }
  throw lastError;
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
  return findAssignmentPlansWithSelectFallback({
    where: {
      orgId,
      ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
    context: "loadAssignmentPlansForBoardState",
  });
};
const buildReadOnlyAssignmentBoardStateResponse = async (
  orgId: number,
  state: any,
  options: {
    includeCards?: boolean;
    includePlans?: boolean;
  } = {}
) => {
  const includeCards = options.includeCards !== false;
  const includePlans = options.includePlans !== false;
  const escalatedAssignments = state
    ? applySentTimeoutEscalation(state.assignments).assignments
    : [];
  const nextState = state
    ? {
        ...state,
        assignments: escalatedAssignments,
      }
    : null;
  const assignmentPlans = includePlans
    ? await loadAssignmentPlansForBoardState(orgId, nextState?.assignments)
    : null;
  const cards = includeCards ? await loadAssignmentCardsForOrg({ orgId }) : [];
  return toAssignmentBoardStateResponse(nextState, assignmentPlans, cards);
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

const seedAttributesIfEmpty = async (
  orgId: number,
  options: {
    includeColors?: boolean;
    includeCategories?: boolean;
    includeProcesses?: boolean;
  } = {}
) => {
  const includeColors = options.includeColors !== false;
  const includeCategories = options.includeCategories !== false;
  const includeProcesses = options.includeProcesses !== false;
  const [colorCount, categoryCount, processCount] = await Promise.all([
    includeColors ? prisma.attrColor.count() : Promise.resolve(0),
    includeCategories
      ? prisma.attrCategory.count({ where: { orgId } })
      : Promise.resolve(0),
    includeProcesses
      ? prisma.attrProcess.count({ where: { orgId } })
      : Promise.resolve(0),
  ]);

  const tasks: Prisma.PrismaPromise<any>[] = [];
  if (includeColors && colorCount === 0) {
    tasks.push(
      prisma.attrColor.createMany({
        data: DEFAULT_ATTRIBUTES.colors.map((item) => ({
          ...item,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (includeCategories && categoryCount === 0) {
    tasks.push(
      prisma.attrCategory.createMany({
        data: DEFAULT_ATTRIBUTES.categories.map((item) => ({
          ...item,
          orgId,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (includeProcesses && processCount === 0) {
    tasks.push(
      prisma.attrProcess.createMany({
        data: DEFAULT_ATTRIBUTES.processes.map((item) => ({
          ...item,
          orgId,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (tasks.length > 0) {
    await prisma.$transaction(tasks);
  }
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

const resolveManagedAttributeNameData = (item: any) => {
  const fallbackName = resolveOptionalString(item?.name, null);
  const nameKo = resolveOptionalString(item?.nameKo, null);
  const nameEn = resolveOptionalString(item?.nameEn, null) ?? fallbackName;
  const nameVi = resolveOptionalString(item?.nameVi, null);
  const name = nameEn ?? fallbackName ?? nameKo ?? nameVi ?? "";
  return {
    name,
    nameKo,
    nameEn,
    nameVi,
  };
};

const capitalizeAttributeDisplayName = (value: string | null) => {
  const text = resolveOptionalString(value, null);
  if (!text) return null;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const resolveManagedColorNameData = (item: any) => {
  const base = resolveManagedAttributeNameData(item);
  const nameEn = capitalizeAttributeDisplayName(base.nameEn);
  const nameVi = capitalizeAttributeDisplayName(base.nameVi);
  const name = capitalizeAttributeDisplayName(nameEn ?? base.name) ?? "";
  return {
    name,
    nameKo: base.nameKo,
    nameEn,
    nameVi,
  };
};

type ProcessMasterOptionType =
  | "LOCATION"
  | "TARGET"
  | "TARGET_SPEC"
  | "ACTION"
  | "ACTION_SPEC";

type ProcessMasterOptionGroupKey =
  | "locations"
  | "targets"
  | "targetSpecs"
  | "actions"
  | "actionSpecs";

type ProcessMasterRelationType =
  | "TARGET_TARGET_SPEC"
  | "ACTION_ACTION_SPEC"
  | "TARGET_TARGET";

type ProcessMasterRelationGroupKey =
  | "targetToTargetSpecs"
  | "actionToActionSpecs"
  | "targetToTargets";

type ProcessMasterOptionRow = {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string | null;
  nameEn: string | null;
  nameVi: string | null;
  sortOrder: number;
};

type ProcessMasterRelationRow = {
  id: number;
  type: ProcessMasterRelationType;
  parentOptionId: number;
  childOptionId: number;
  parentCode: string;
  childCode: string;
};

const PROCESS_MASTER_TYPE_KEYS = [
  "LOCATION",
  "TARGET",
  "TARGET_SPEC",
  "ACTION",
  "ACTION_SPEC",
] as const;

const PROCESS_MASTER_GROUP_BY_TYPE: Record<
  ProcessMasterOptionType,
  ProcessMasterOptionGroupKey
> = {
  LOCATION: "locations",
  TARGET: "targets",
  TARGET_SPEC: "targetSpecs",
  ACTION: "actions",
  ACTION_SPEC: "actionSpecs",
};
const PROCESS_MASTER_COMPOSITION_GROUP_BY_TYPE: Record<
  ProcessMasterOptionType,
  ProcessMasterOptionGroupKey
> = {
  LOCATION: "locations",
  TARGET: "targets",
  ACTION: "actions",
  TARGET_SPEC: "targetSpecs",
  ACTION_SPEC: "actionSpecs",
};

const PROCESS_MASTER_FALLBACK_CODE_BY_TYPE: Record<ProcessMasterOptionType, string> = {
  LOCATION: "LOCATION",
  TARGET: "TARGET",
  ACTION: "ACTION",
  TARGET_SPEC: "TARGET_SPEC",
  ACTION_SPEC: "ACTION_SPEC",
};

const PROCESS_MASTER_RELATION_TYPE_KEYS = [
  "TARGET_TARGET_SPEC",
  "ACTION_ACTION_SPEC",
  "TARGET_TARGET",
] as const;

const PROCESS_MASTER_RELATION_META: Record<
  ProcessMasterRelationType,
  {
    groupKey: ProcessMasterRelationGroupKey;
    parentType: ProcessMasterOptionType;
    childType: ProcessMasterOptionType;
  }
> = {
  TARGET_TARGET_SPEC: {
    groupKey: "targetToTargetSpecs",
    parentType: "TARGET",
    childType: "TARGET_SPEC",
  },
  ACTION_ACTION_SPEC: {
    groupKey: "actionToActionSpecs",
    parentType: "ACTION",
    childType: "ACTION_SPEC",
  },
  TARGET_TARGET: {
    groupKey: "targetToTargets",
    parentType: "TARGET",
    childType: "TARGET",
  },
};

type ProcessMasterSeedItem = {
  ko: string;
  en: string;
  vi: string;
};

const PROCESS_MASTER_DEFAULT_OPTIONS: Record<
  ProcessMasterOptionType,
  ProcessMasterSeedItem[]
> = {
  LOCATION: [
    { ko: "앞여밈", en: "Front opening", vi: "Nep truoc" },
    { ko: "앞목", en: "Front neckline", vi: "Co truoc" },
    { ko: "앞판", en: "Front panel", vi: "Than truoc" },
    { ko: "뒤목", en: "Back neckline", vi: "Co sau" },
    { ko: "뒤판", en: "Back panel", vi: "Than sau" },
    { ko: "소매", en: "Sleeve", vi: "Tay" },
    { ko: "어깨", en: "Shoulder", vi: "Vai" },
    { ko: "옆선", en: "Side seam", vi: "Suon" },
    { ko: "허리", en: "Waist", vi: "Eo" },
    { ko: "밑단", en: "Hem", vi: "Lai" },
    { ko: "칼라", en: "Collar", vi: "Co ao" },
  ],
  TARGET: [
    { ko: "주머니", en: "Pocket", vi: "Tui" },
    { ko: "지퍼", en: "Zipper", vi: "Day keo" },
    { ko: "페이싱", en: "Facing", vi: "Nep lot" },
    { ko: "요크", en: "Yoke", vi: "Cau vai" },
    { ko: "테이프", en: "Tape", vi: "Bang" },
    { ko: "바이어스", en: "Bias", vi: "Vien xeo" },
    { ko: "고무줄", en: "Elastic", vi: "Thun" },
    { ko: "시보리", en: "Rib", vi: "Cua bo" },
    { ko: "안감", en: "Lining", vi: "Lot trong" },
    { ko: "겉감", en: "Outer fabric", vi: "Lot ngoai" },
    { ko: "단추", en: "Button", vi: "Nut" },
    { ko: "스냅", en: "Snap", vi: "Nut bam" },
  ],
  ACTION: [
    { ko: "부착", en: "Attach", vi: "Gan" },
    { ko: "상침", en: "Topstitch", vi: "Di top" },
    { ko: "봉제", en: "Sew", vi: "May" },
    { ko: "연결", en: "Join", vi: "Noi" },
    { ko: "접기", en: "Fold", vi: "Gap" },
    { ko: "뒤집어 박기", en: "Turn-and-stitch", vi: "Lat va may" },
    { ko: "오버록", en: "Overlock", vi: "Vat so" },
    { ko: "시접정리", en: "Seam finish", vi: "Hoan tat duong may" },
    { ko: "검사", en: "Inspect", vi: "Kiem tra" },
    { ko: "다림", en: "Press", vi: "Ui" },
  ],
  TARGET_SPEC: [
  ],
  ACTION_SPEC: [
  ],
};

const normalizeProcessMasterType = (value: any): ProcessMasterOptionType | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    normalized === "LOCATION" ||
    normalized === "LOCATIONS" ||
    normalized === "PART" ||
    normalized === "PARTS"
  ) {
    return "LOCATION";
  }
  if (normalized === "TARGET" || normalized === "TARGETS") return "TARGET";
  if (
    normalized === "TARGET_SPEC" ||
    normalized === "TARGET_SPECS" ||
    normalized === "TARGETSPEC" ||
    normalized === "TARGETSPECS" ||
    normalized === "SPEC" ||
    normalized === "SPECS"
  ) {
    return "TARGET_SPEC";
  }
  if (normalized === "ACTION" || normalized === "ACTIONS") return "ACTION";
  if (
    normalized === "ACTION_SPEC" ||
    normalized === "ACTION_SPECS" ||
    normalized === "ACTIONSPEC" ||
    normalized === "ACTIONSPECS"
  ) {
    return "ACTION_SPEC";
  }
  return null;
};

const normalizeProcessMasterRelationType = (
  value: any
): ProcessMasterRelationType | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "TARGET_TARGET_SPEC" ||
    normalized === "TARGET_TO_TARGET_SPEC" ||
    normalized === "TARGET_SPEC_LINK"
  ) {
    return "TARGET_TARGET_SPEC";
  }
  if (
    normalized === "ACTION_ACTION_SPEC" ||
    normalized === "ACTION_TO_ACTION_SPEC" ||
    normalized === "ACTION_SPEC_LINK"
  ) {
    return "ACTION_ACTION_SPEC";
  }
  if (
    normalized === "TARGET_TARGET" ||
    normalized === "TARGET_TO_TARGET" ||
    normalized === "TARGET_LINK"
  ) {
    return "TARGET_TARGET";
  }
  return null;
};

const normalizeProcessMasterCode = (value: any): string =>
  normalizeManagedAttributeCode(value).replace(/-/g, "_");

const normalizeProcessMasterLabel = (value: any): string =>
  resolveOptionalString(value, null) ?? "";

const resolveProcessMasterNameData = (item: any) => {
  const nameKo = normalizeProcessMasterLabel(item?.nameKo);
  const nameEn = normalizeProcessMasterLabel(item?.nameEn);
  const nameVi = normalizeProcessMasterLabel(item?.nameVi);
  const fallback = normalizeProcessMasterLabel(
    item?.label ?? item?.name ?? item?.value
  );
  const resolvedNameKo = nameKo || fallback;
  const resolvedLabel = resolvedNameKo || nameEn || nameVi || fallback;

  return {
    nameKo: resolvedNameKo,
    nameEn,
    nameVi,
    label: resolvedLabel,
  };
};

const toProcessMasterOptionResponse = (row: any) => ({
  id: toPositiveIntOrNull(row?.id),
  type: normalizeProcessMasterType(row?.type),
  code: normalizeProcessMasterCode(row?.code),
  label: normalizeProcessMasterLabel(
    row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi
  ),
  nameKo: normalizeProcessMasterLabel(row?.nameKo ?? row?.label),
  nameEn: normalizeProcessMasterLabel(row?.nameEn),
  nameVi: normalizeProcessMasterLabel(row?.nameVi),
  sortOrder: toPositiveIntOrNull(row?.sortOrder) ?? 0,
});

const groupProcessMasterOptions = (rows: any[] = []) => {
  const grouped = {
    locations: [] as any[],
    targets: [] as any[],
    targetSpecs: [] as any[],
    actions: [] as any[],
    actionSpecs: [] as any[],
  };

  rows.forEach((row) => {
    const normalized = toProcessMasterOptionResponse(row);
    const type = normalizeProcessMasterType(normalized.type);
    if (!type) return;
    const groupKey = PROCESS_MASTER_GROUP_BY_TYPE[type];
    if (!groupKey) return;
    grouped[groupKey].push(normalized);
  });

  return grouped;
};

const toProcessMasterRelationResponse = (row: any) => ({
  id: toPositiveIntOrNull(row?.id),
  type: normalizeProcessMasterRelationType(row?.type),
  parentOptionId: toPositiveIntOrNull(row?.parentOptionId),
  childOptionId: toPositiveIntOrNull(row?.childOptionId),
  parentCode: normalizeProcessMasterCode(row?.parentCode),
  childCode: normalizeProcessMasterCode(row?.childCode),
});

const groupProcessMasterRelations = (rows: any[] = []) => {
  const grouped = {
    targetToTargetSpecs: [] as any[],
    actionToActionSpecs: [] as any[],
    targetToTargets: [] as any[],
  };

  rows.forEach((row) => {
    const normalized = toProcessMasterRelationResponse(row);
    const type = normalizeProcessMasterRelationType(normalized.type);
    if (!type) return;
    const meta = PROCESS_MASTER_RELATION_META[type];
    if (!meta) return;
    const relation = {
      id: normalized.id,
      type,
      parentOptionId: normalized.parentOptionId,
      childOptionId: normalized.childOptionId,
      parentCode: normalized.parentCode,
      childCode: normalized.childCode,
      ...(type === "TARGET_TARGET_SPEC"
        ? {
            targetCode: normalized.parentCode,
            targetSpecCode: normalized.childCode,
          }
        : type === "ACTION_ACTION_SPEC"
          ? {
              actionCode: normalized.parentCode,
              actionSpecCode: normalized.childCode,
            }
          : {
              targetCode: normalized.parentCode,
              linkedTargetCode: normalized.childCode,
            }),
    };
    grouped[meta.groupKey].push(relation);
  });

  return grouped;
};

const buildProcessMasterOptionsResponse = (
  optionRows: any[] = [],
  relationRows: any[] = [],
  usageConflicts: any[] = []
) => {
  const groupedOptions = groupProcessMasterOptions(optionRows);
  const groupedRelations = groupProcessMasterRelations(relationRows);
  return {
    ...groupedOptions,
    ...groupedRelations,
    relations: groupedRelations,
    usageConflicts: ensureArray(usageConflicts),
  };
};

const generateUniqueProcessMasterCode = ({
  type,
  label,
  usedCodes,
}: {
  type: ProcessMasterOptionType;
  label: string;
  usedCodes: Set<string>;
}) => {
  const fallback = PROCESS_MASTER_FALLBACK_CODE_BY_TYPE[type];
  const baseCode = normalizeProcessMasterCode(label) || fallback;
  let candidate = baseCode;
  let suffix = 2;
  while (usedCodes.has(candidate)) {
    candidate = `${baseCode}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const listProcessMasterOptionsWithDb = async (
  db: ProcessMasterStoreClient = prisma
): Promise<ProcessMasterOptionRow[]> =>
  db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    ORDER BY "type" ASC, "sortOrder" ASC, "id" ASC
  `);

const listProcessMasterOptions = async (): Promise<ProcessMasterOptionRow[]> =>
  listProcessMasterOptionsWithDb(prisma);

const countProcessMasterOptions = async () => {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ProcessMasterOption"
  `);
  return Number(rows[0]?.count ?? 0);
};

const insertProcessMasterOptions = async (
  rows: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }>
) => {
  if (rows.length === 0) return;
  const actor = getCurrentRequestActor();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProcessMasterOption" (
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder",
      "createdBy",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.type}::"ProcessMasterOptionType",
        ${row.code},
        ${row.label},
        ${row.nameKo || null},
        ${row.nameEn || null},
        ${row.nameVi || null},
        ${row.sortOrder},
        ${actor},
        NOW(),
        NOW()
      )`)
    )}
    ON CONFLICT ("type", "code") DO NOTHING
  `);
};

const deleteProcessMasterOptionsByIds = async (ids: number[]) => {
  if (ids.length === 0) return;
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "ProcessMasterOption" WHERE "id" IN (${Prisma.join(ids)})`
  );
};

const updateProcessMasterOptionRow = async (row: {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string;
  nameEn: string;
  nameVi: string;
  sortOrder: number;
}) => {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProcessMasterOption"
    SET
      "type" = ${row.type}::"ProcessMasterOptionType",
      "code" = ${row.code},
      "label" = ${row.label},
      "nameKo" = ${row.nameKo || null},
      "nameEn" = ${row.nameEn || null},
      "nameVi" = ${row.nameVi || null},
      "sortOrder" = ${row.sortOrder},
      "updatedAt" = NOW()
    WHERE "id" = ${row.id}
  `);
};

const listProcessMasterOptionRelations = async (): Promise<
  ProcessMasterRelationRow[]
> =>
  prisma.$queryRaw<ProcessMasterRelationRow[]>(Prisma.sql`
    SELECT
      relation."id",
      relation."type",
      relation."parentOptionId",
      relation."childOptionId",
      parent."code" AS "parentCode",
      child."code" AS "childCode"
    FROM "ProcessMasterOptionRelation" relation
    JOIN "ProcessMasterOption" parent
      ON parent."id" = relation."parentOptionId"
    JOIN "ProcessMasterOption" child
      ON child."id" = relation."childOptionId"
    ORDER BY
      relation."type" ASC,
      parent."sortOrder" ASC,
      parent."id" ASC,
      child."sortOrder" ASC,
      child."id" ASC,
      relation."id" ASC
  `);

const deleteProcessMasterOptionRelationsByIds = async (ids: number[]) => {
  if (ids.length === 0) return;
  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "ProcessMasterOptionRelation"
      WHERE "id" IN (${Prisma.join(ids)})
    `
  );
};

const insertProcessMasterOptionRelationsWithDb = async (
  db: ProcessMasterStoreClient,
  rows: Array<{
    type: ProcessMasterRelationType;
    parentOptionId: number;
    childOptionId: number;
  }>
) => {
  if (rows.length === 0) return;
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "ProcessMasterOptionRelation" (
        "type",
        "parentOptionId",
        "childOptionId",
        "createdAt",
        "updatedAt"
      )
      VALUES ${Prisma.join(
        rows.map((row) => Prisma.sql`(
          ${row.type},
          ${row.parentOptionId},
          ${row.childOptionId},
          NOW(),
          NOW()
        )`)
      )}
      ON CONFLICT ("type", "parentOptionId", "childOptionId") DO NOTHING
    `
  );
};

const insertProcessMasterOptionRelations = async (
  rows: Array<{
    type: ProcessMasterRelationType;
    parentOptionId: number;
    childOptionId: number;
  }>
) => insertProcessMasterOptionRelationsWithDb(prisma, rows);

const normalizeProcessMasterMatchToken = (value: any): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildProcessMasterMatchTokenSet = (row: Partial<ProcessMasterOptionRow>) => {
  const tokens = new Set<string>();
  [
    row?.code,
    row?.label,
    row?.nameKo,
    row?.nameEn,
    row?.nameVi,
  ].forEach((value) => {
    const token = normalizeProcessMasterMatchToken(value);
    if (token) tokens.add(token);
  });
  return tokens;
};

const PROCESS_MASTER_TYPE_CORRECTIONS: Array<{
  expectedType: ProcessMasterOptionType;
  aliases: string[];
}> = [
  {
    expectedType: "TARGET",
    aliases: ["주머니", "Pocket", "Tui", "POCKET"],
  },
];

const rowMatchesAliases = (row: Partial<ProcessMasterOptionRow>, aliases: Set<string>) => {
  const rowTokens = buildProcessMasterMatchTokenSet(row);
  for (const token of rowTokens) {
    if (aliases.has(token)) return true;
  }
  return false;
};

const applyProcessMasterTypeCorrections = async () => {
  const existing = await listProcessMasterOptions();
  if (existing.length === 0) return existing;

  let workingRows = [...existing];
  let hasChanges = false;

  for (const correction of PROCESS_MASTER_TYPE_CORRECTIONS) {
    const aliasSet = new Set(
      correction.aliases
        .map((alias) => normalizeProcessMasterMatchToken(alias))
        .filter(Boolean)
    );
    if (aliasSet.size === 0) continue;

    const misplacedRows = workingRows.filter(
      (row) =>
        row.type !== correction.expectedType &&
        rowMatchesAliases(row, aliasSet)
    );

    for (const row of misplacedRows) {
      const normalizedCode = normalizeProcessMasterCode(row.code);
      const duplicateInExpectedType = workingRows.find(
        (candidate) =>
          candidate.id !== row.id &&
          candidate.type === correction.expectedType &&
          (rowMatchesAliases(candidate, aliasSet) ||
            (normalizedCode &&
              normalizeProcessMasterCode(candidate.code) === normalizedCode))
      );

      if (duplicateInExpectedType) {
        await deleteProcessMasterOptionsByIds([row.id]);
        workingRows = workingRows.filter((candidate) => candidate.id !== row.id);
      } else {
        await updateProcessMasterOptionRow({
          id: row.id,
          type: correction.expectedType,
          code: row.code,
          label: row.label,
          nameKo: row.nameKo || "",
          nameEn: row.nameEn || "",
          nameVi: row.nameVi || "",
          sortOrder: row.sortOrder,
        });
        workingRows = workingRows.map((candidate) =>
          candidate.id === row.id
            ? { ...candidate, type: correction.expectedType }
            : candidate
        );
      }

      hasChanges = true;
    }
  }

  if (!hasChanges) return existing;
  return listProcessMasterOptions();
};

const ensureDefaultProcessMasterOptions = async () => {
  const existingCount = await countProcessMasterOptions();
  if (existingCount === 0) {
    const seedRows: Array<{
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number;
    }> = [];

    PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
      const type = typeKey as ProcessMasterOptionType;
      const usedCodes = new Set<string>();
      PROCESS_MASTER_DEFAULT_OPTIONS[type].forEach((item, index) => {
        const nameKo = normalizeProcessMasterLabel(item?.ko);
        const nameEn = normalizeProcessMasterLabel(item?.en);
        const nameVi = normalizeProcessMasterLabel(item?.vi);
        const label = nameKo || nameEn || nameVi;
        const codeSeedLabel = nameEn || nameKo || nameVi || label;
        const code = generateUniqueProcessMasterCode({
          type,
          label: codeSeedLabel,
          usedCodes,
        });
        usedCodes.add(code);
        seedRows.push({
          type,
          code,
          label,
          nameKo,
          nameEn,
          nameVi,
          sortOrder: index + 1,
        });
      });
    });

    if (seedRows.length > 0) {
      await insertProcessMasterOptions(seedRows);
    }
  }

  return applyProcessMasterTypeCorrections();
};

const flattenProcessMasterPayloadItems = (payload: any) => {
  const pushItems = (
    items: any[],
    type: ProcessMasterOptionType,
    target: Array<{
      id: number | null;
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number | null;
    }>
  ) => {
    ensureArray(items).forEach((item: any, index: number) => {
      if (typeof item === "string") {
        target.push({
          id: null,
          type,
          code: "",
          label: normalizeProcessMasterLabel(item),
          nameKo: normalizeProcessMasterLabel(item),
          nameEn: "",
          nameVi: "",
          sortOrder: index + 1,
        });
        return;
      }
      const itemType = normalizeProcessMasterType(item?.type) ?? type;
      if (!itemType) return;
      const nameData = resolveProcessMasterNameData(item);
      target.push({
        id: isNumericId(item?.id) ? toId(item.id) : null,
        type: itemType,
        code: normalizeProcessMasterCode(item?.code),
        label: nameData.label,
        nameKo: nameData.nameKo,
        nameEn: nameData.nameEn,
        nameVi: nameData.nameVi,
        sortOrder: toPositiveIntOrNull(item?.sortOrder),
      });
    });
  };

  const flattened: Array<{
    id: number | null;
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number | null;
  }> = [];

  if (Array.isArray(payload)) {
    payload.forEach((item: any, index: number) => {
      const type = normalizeProcessMasterType(item?.type);
      if (!type) return;
      const nameData = resolveProcessMasterNameData(item);
      flattened.push({
        id: isNumericId(item?.id) ? toId(item.id) : null,
        type,
        code: normalizeProcessMasterCode(item?.code),
        label: nameData.label,
        nameKo: nameData.nameKo,
        nameEn: nameData.nameEn,
        nameVi: nameData.nameVi,
        sortOrder: toPositiveIntOrNull(item?.sortOrder) ?? index + 1,
      });
    });
    return flattened;
  }

  pushItems(payload?.locations ?? payload?.parts, "LOCATION", flattened);
  pushItems(payload?.targets, "TARGET", flattened);
  pushItems(payload?.targetSpecs ?? payload?.specs, "TARGET_SPEC", flattened);
  pushItems(payload?.actions, "ACTION", flattened);
  pushItems(payload?.actionSpecs, "ACTION_SPEC", flattened);
  return flattened;
};

type ProcessMasterDeletionUsageConflict = {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string;
  nameEn: string;
  nameVi: string;
  styleProcessCount: number;
  referenceCount: number;
  sampleStyleProcessIds: number[];
};

type ProcessMasterOptionInUseError = Error & {
  status: number;
  code: "PROCESS_MASTER_OPTION_IN_USE";
  reason: "PROCESS_MASTER_OPTION_IN_USE";
  usageCount: number;
  conflicts: ProcessMasterDeletionUsageConflict[];
};

const findProcessMasterDeletionUsageConflicts = async (
  deleteRows: ProcessMasterOptionRow[]
): Promise<ProcessMasterDeletionUsageConflict[]> => {
  if (deleteRows.length === 0) return [];

  const tracked = new Map<
    string,
    {
      id: number;
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      styleProcessIds: Set<number>;
      referenceCount: number;
      sampleStyleProcessIds: number[];
    }
  >();

  deleteRows.forEach((row) => {
    const id = toPositiveIntOrNull(row?.id);
    const type = normalizeProcessMasterType(row?.type);
    const code = normalizeProcessMasterCode(row?.code);
    if (!id || !type || !code) return;
    const key = `${type}:${code}`;
    if (tracked.has(key)) return;
    const label =
      normalizeProcessMasterLabel(
        row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi ?? row?.code
      ) || code;
    tracked.set(key, {
      id,
      type,
      code,
      label,
      nameKo: normalizeProcessMasterLabel(row?.nameKo) || label,
      nameEn: normalizeProcessMasterLabel(row?.nameEn) || label,
      nameVi: normalizeProcessMasterLabel(row?.nameVi) || label,
      styleProcessIds: new Set<number>(),
      referenceCount: 0,
      sampleStyleProcessIds: [],
    });
  });
  if (tracked.size === 0) return [];

  const styleProcesses = await prisma.styleProcess.findMany({
    select: { id: true, processComposition: true },
    orderBy: { id: "asc" },
  });

  styleProcesses.forEach((styleProcess) => {
    const styleProcessId = toPositiveIntOrNull(styleProcess?.id);
    if (!styleProcessId) return;
    const composition = normalizeStyleProcessComposition(styleProcess?.processComposition);
    if (!composition) return;

    PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
      const type = typeKey as ProcessMasterOptionType;
      const groupKey = PROCESS_MASTER_COMPOSITION_GROUP_BY_TYPE[type];
      const entries = ensureArray((composition as any)?.[groupKey]);
      entries.forEach((entry) => {
        const code = normalizeProcessMasterCode((entry as any)?.code);
        if (!code) return;
        const key = `${type}:${code}`;
        const candidate = tracked.get(key);
        if (!candidate) return;
        candidate.referenceCount += 1;
        candidate.styleProcessIds.add(styleProcessId);
        if (
          candidate.sampleStyleProcessIds.length < 5 &&
          !candidate.sampleStyleProcessIds.includes(styleProcessId)
        ) {
          candidate.sampleStyleProcessIds.push(styleProcessId);
        }
      });
    });
  });

  return Array.from(tracked.values())
    .map((item) => ({
      id: item.id,
      type: item.type,
      code: item.code,
      label: item.label,
      nameKo: item.nameKo,
      nameEn: item.nameEn,
      nameVi: item.nameVi,
      styleProcessCount: item.styleProcessIds.size,
      referenceCount: item.referenceCount,
      sampleStyleProcessIds: item.sampleStyleProcessIds,
    }))
    .filter((item) => item.styleProcessCount > 0)
    .sort((left, right) => {
      if (right.styleProcessCount !== left.styleProcessCount) {
        return right.styleProcessCount - left.styleProcessCount;
      }
      return left.code.localeCompare(right.code, "en-US");
    });
};

const createProcessMasterOptionInUseError = (
  conflicts: ProcessMasterDeletionUsageConflict[]
): ProcessMasterOptionInUseError => {
  const usageCount = conflicts.reduce(
    (sum, item) => sum + (Number(item.referenceCount) || 0),
    0
  );
  const error = createHttpError(
    409,
    `사용 중인 공정 항목은 삭제할 수 없습니다. ${usageCount}건 참조 중입니다.`
  ) as ProcessMasterOptionInUseError;
  error.code = "PROCESS_MASTER_OPTION_IN_USE";
  error.reason = "PROCESS_MASTER_OPTION_IN_USE";
  error.usageCount = usageCount;
  error.conflicts = conflicts;
  return error;
};

const isProcessMasterOptionInUseError = (
  error: unknown
): error is ProcessMasterOptionInUseError => {
  const record = toErrorRecord(error);
  const code = String(record?.code || record?.reason || "");
  return code === "PROCESS_MASTER_OPTION_IN_USE";
};

const syncProcessMasterOptions = async (payload: any) => {
  const incomingItems = flattenProcessMasterPayloadItems(payload).filter(
    (item) =>
      item.type &&
      (item.label || item.nameKo || item.nameEn || item.nameVi)
  );
  const incomingIds = incomingItems
    .filter((item) => item.id !== null)
    .map((item) => item.id as number);
  const incomingIdSet = new Set(incomingIds);

  const existing = await listProcessMasterOptions();
  const deleteRows = existing.filter((row) => !incomingIdSet.has(row.id));
  if (deleteRows.length > 0) {
    const conflicts = await findProcessMasterDeletionUsageConflicts(deleteRows);
    if (conflicts.length > 0) {
      throw createProcessMasterOptionInUseError(conflicts);
    }
  }
  const deleteIds = deleteRows.map((row) => row.id);
  if (deleteIds.length > 0) {
    await deleteProcessMasterOptionsByIds(deleteIds);
  }

  const existingById = new Map(
    existing.map((row) => [row.id, { type: row.type, code: row.code }])
  );
  const usedCodesByType = PROCESS_MASTER_TYPE_KEYS.reduce((map, typeKey) => {
    map.set(typeKey as ProcessMasterOptionType, new Set<string>());
    return map;
  }, new Map<ProcessMasterOptionType, Set<string>>());

  existing.forEach((row) => {
    if (deleteIds.includes(row.id)) return;
    const type = normalizeProcessMasterType(row.type);
    if (!type) return;
    const used = usedCodesByType.get(type);
    if (!used) return;
    const code = normalizeProcessMasterCode(row.code);
    if (code) used.add(code);
  });

  const nextSortOrderByType = new Map<ProcessMasterOptionType, number>();
  const creates: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }> = [];
  const updates: Array<{
    id: number;
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }> = [];

  incomingItems.forEach((item) => {
    const type = normalizeProcessMasterType(item.type);
    if (!type) return;
    const usedCodes = usedCodesByType.get(type) ?? new Set<string>();

    const itemId = item.id;
    const existingInfo = itemId ? existingById.get(itemId) : null;
    if (existingInfo && normalizeProcessMasterType(existingInfo.type) === type) {
      const currentCode = normalizeProcessMasterCode(existingInfo.code);
      if (currentCode) {
        usedCodes.delete(currentCode);
      }
    }

    let code = normalizeProcessMasterCode(item.code);
    if (!code || usedCodes.has(code)) {
      const codeSeedLabel =
        normalizeProcessMasterLabel(item.nameEn) ||
        normalizeProcessMasterLabel(item.label) ||
        normalizeProcessMasterLabel(item.nameKo) ||
        normalizeProcessMasterLabel(item.nameVi);
      code = generateUniqueProcessMasterCode({
        type,
        label: codeSeedLabel,
        usedCodes,
      });
    }
    usedCodes.add(code);
    usedCodesByType.set(type, usedCodes);

    const nextSortOrder =
      item.sortOrder ?? ((nextSortOrderByType.get(type) || 0) + 1);
    nextSortOrderByType.set(type, nextSortOrder);

    if (itemId) {
      updates.push({
        id: itemId,
        type,
        code,
        label: item.label,
        nameKo: item.nameKo,
        nameEn: item.nameEn,
        nameVi: item.nameVi,
        sortOrder: nextSortOrder,
      });
    } else {
      creates.push({
        type,
        code,
        label: item.label,
        nameKo: item.nameKo,
        nameEn: item.nameEn,
        nameVi: item.nameVi,
        sortOrder: nextSortOrder,
      });
    }
  });

  if (creates.length > 0) {
    await insertProcessMasterOptions(creates);
  }

  if (updates.length > 0) {
    for (const row of updates) {
      await updateProcessMasterOptionRow(row);
    }
  }

  return listProcessMasterOptions();
};

const parseProcessMasterRelationPayload = (payload: any) => {
  const relationContainer =
    payload && typeof payload === "object" && payload.relations && typeof payload.relations === "object"
      ? payload.relations
      : payload;
  const hasTargetSpecRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "targetToTargetSpecs"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "targetSpecLinks"
        ))
  );
  const hasTargetTargetRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "targetToTargets"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "targetLinks"
        ))
  );
  const hasActionRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "actionToActionSpecs"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "actionSpecLinks"
        ))
  );
  const providedTypes = new Set<ProcessMasterRelationType>();
  const entriesByType = new Map<
    ProcessMasterRelationType,
    Array<{ parentCode: string; childCode: string }>
  >();

  const collectEntries = (
    type: ProcessMasterRelationType,
    items: any[],
    resolveCodes: (item: any) => { parentCode: string; childCode: string }
  ) => {
    providedTypes.add(type);
    const dedup = new Set<string>();
    const collected: Array<{ parentCode: string; childCode: string }> = [];

    ensureArray(items).forEach((item) => {
      const { parentCode, childCode } = resolveCodes(item);
      if (!parentCode || !childCode) return;
      const key = `${parentCode}:${childCode}`;
      if (dedup.has(key)) return;
      dedup.add(key);
      collected.push({ parentCode, childCode });
    });

    entriesByType.set(type, collected);
  };

  if (hasTargetSpecRelationKey) {
    collectEntries(
      "TARGET_TARGET_SPEC",
      relationContainer?.targetToTargetSpecs ?? relationContainer?.targetSpecLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.targetCode ?? item?.target?.code ?? item?.target
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.targetSpecCode ??
            item?.targetSpec?.code ??
            item?.targetSpec
        ),
      })
    );
  }

  if (hasTargetTargetRelationKey) {
    collectEntries(
      "TARGET_TARGET",
      relationContainer?.targetToTargets ?? relationContainer?.targetLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.targetCode ?? item?.target?.code ?? item?.target
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.linkedTargetCode ??
            item?.linkedTarget?.code ??
            item?.linkedTarget
        ),
      })
    );
  }

  if (hasActionRelationKey) {
    collectEntries(
      "ACTION_ACTION_SPEC",
      relationContainer?.actionToActionSpecs ?? relationContainer?.actionSpecLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.actionCode ?? item?.action?.code ?? item?.action
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.actionSpecCode ??
            item?.actionSpec?.code ??
            item?.actionSpec
        ),
      })
    );
  }

  return {
    hasProvidedKeys:
      hasTargetSpecRelationKey || hasTargetTargetRelationKey || hasActionRelationKey,
    providedTypes,
    entriesByType,
  };
};

const syncProcessMasterRelations = async ({
  payload,
  processMasterRows,
}: {
  payload: any;
  processMasterRows: ProcessMasterOptionRow[];
}) => {
  const parsedPayload = parseProcessMasterRelationPayload(payload);
  if (!parsedPayload.hasProvidedKeys) {
    return listProcessMasterOptionRelations();
  }

  const optionCodeLookupByType = new Map<
    ProcessMasterOptionType,
    Map<string, number>
  >();
  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    optionCodeLookupByType.set(typeKey as ProcessMasterOptionType, new Map());
  });
  processMasterRows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    const code = normalizeProcessMasterCode(row?.code);
    if (!type || !code) return;
    const typeMap = optionCodeLookupByType.get(type);
    if (!typeMap) return;
    typeMap.set(code, row.id);
  });

  const existingRelations = await listProcessMasterOptionRelations();
  for (const relationType of parsedPayload.providedTypes) {
    const meta = PROCESS_MASTER_RELATION_META[relationType];
    if (!meta) continue;
    const parentLookup = optionCodeLookupByType.get(meta.parentType) ?? new Map();
    const childLookup = optionCodeLookupByType.get(meta.childType) ?? new Map();
    const desiredTuples = parsedPayload.entriesByType.get(relationType) ?? [];

    const desiredLinks: Array<{
      type: ProcessMasterRelationType;
      parentOptionId: number;
      childOptionId: number;
    }> = [];
    const desiredKeySet = new Set<string>();

    desiredTuples.forEach(({ parentCode, childCode }) => {
      const parentOptionId = parentLookup.get(parentCode);
      const childOptionId = childLookup.get(childCode);
      if (!parentOptionId || !childOptionId) return;
      if (
        relationType === "TARGET_TARGET" &&
        Number(parentOptionId) === Number(childOptionId)
      ) {
        return;
      }
      const key = `${parentOptionId}:${childOptionId}`;
      if (desiredKeySet.has(key)) return;
      desiredKeySet.add(key);
      desiredLinks.push({
        type: relationType,
        parentOptionId,
        childOptionId,
      });
    });

    const existingByType = existingRelations.filter(
      (row) => normalizeProcessMasterRelationType(row?.type) === relationType
    );
    const existingKeyToRow = new Map<string, ProcessMasterRelationRow>();
    existingByType.forEach((row) => {
      const parentOptionId = toPositiveIntOrNull(row?.parentOptionId);
      const childOptionId = toPositiveIntOrNull(row?.childOptionId);
      if (!parentOptionId || !childOptionId) return;
      existingKeyToRow.set(`${parentOptionId}:${childOptionId}`, row);
    });

    const deleteIds = existingByType
      .filter((row) => {
        const parentOptionId = toPositiveIntOrNull(row?.parentOptionId);
        const childOptionId = toPositiveIntOrNull(row?.childOptionId);
        if (!parentOptionId || !childOptionId) return true;
        return !desiredKeySet.has(`${parentOptionId}:${childOptionId}`);
      })
      .map((row) => toPositiveIntOrNull(row?.id))
      .filter((id): id is number => id !== null);

    const creates = desiredLinks.filter(
      (row) => !existingKeyToRow.has(`${row.parentOptionId}:${row.childOptionId}`)
    );

    if (deleteIds.length > 0) {
      await deleteProcessMasterOptionRelationsByIds(deleteIds);
    }
    if (creates.length > 0) {
      await insertProcessMasterOptionRelations(creates);
    }
  }

  return listProcessMasterOptionRelations();
};

type ProcessMasterStoreClient = Prisma.TransactionClient | typeof prisma;
type ProcessCompositionKind =
  | "location"
  | "target"
  | "targetSpec"
  | "action"
  | "actionSpec"
  | "part"
  | "spec";

const toCanonicalProcessCompositionKind = (
  kind: ProcessCompositionKind
): "location" | "target" | "targetSpec" | "action" | "actionSpec" => {
  if (kind === "part") return "location";
  if (kind === "spec") return "targetSpec";
  return kind;
};

const listProcessMasterOptionsByType = async (
  db: ProcessMasterStoreClient,
  type: ProcessMasterOptionType
): Promise<ProcessMasterOptionRow[]> =>
  db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    WHERE "type" = ${type}::"ProcessMasterOptionType"
    ORDER BY "sortOrder" ASC, "id" ASC
  `);

const listActionProcessMasterOptions = async (
  db: ProcessMasterStoreClient
): Promise<ProcessMasterOptionRow[]> =>
  listProcessMasterOptionsByType(db, "ACTION");

const insertProcessMasterOptionsWithDb = async (
  db: ProcessMasterStoreClient,
  rows: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }>
) => {
  if (rows.length === 0) return;
  const actor = getCurrentRequestActor();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "ProcessMasterOption" (
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder",
      "createdBy",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.type}::"ProcessMasterOptionType",
        ${row.code},
        ${row.label},
        ${row.nameKo || null},
        ${row.nameEn || null},
        ${row.nameVi || null},
        ${row.sortOrder},
        ${actor},
        NOW(),
        NOW()
      )`)
    )}
    ON CONFLICT ("type", "code") DO NOTHING
  `);
};

const PROCESS_MASTER_TYPE_BY_COMPOSITION_KIND: Record<
  ProcessCompositionKind,
  ProcessMasterOptionType
> = {
  location: "LOCATION",
  part: "LOCATION",
  target: "TARGET",
  targetSpec: "TARGET_SPEC",
  action: "ACTION",
  actionSpec: "ACTION_SPEC",
  spec: "TARGET_SPEC",
};

const collectStyleProcessMasterCandidatesByKind = (
  processes: any,
  kind: ProcessCompositionKind
) => {
  const canonicalKind = toCanonicalProcessCompositionKind(kind);
  const candidates: Array<{
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
  }> = [];

  normalizeStyleProcesses(processes).forEach((process) => {
    const composition = normalizeStyleProcessComposition(
      (process as any)?.processComposition
    );
    const targetPairs = ensureArray((composition as any)?.targetPairs);
    const actionPairs = ensureArray((composition as any)?.actionPairs);
    const entries =
      canonicalKind === "location"
        ? ensureArray((composition as any)?.locations)
        : canonicalKind === "target"
          ? targetPairs.map((pair: any) => (pair as any)?.target).filter(Boolean)
          : canonicalKind === "targetSpec"
            ? targetPairs
                .map((pair: any) => (pair as any)?.targetSpec)
                .filter(Boolean)
            : canonicalKind === "actionSpec"
              ? actionPairs
                  .map((pair: any) => (pair as any)?.actionSpec)
                  .filter(Boolean)
              : actionPairs.map((pair: any) => (pair as any)?.action).filter(Boolean);
    entries.forEach((entry) => {
      const label = normalizeProcessMasterLabel(
        (entry as any)?.label ??
          (entry as any)?.nameKo ??
          (entry as any)?.nameEn ??
          (entry as any)?.nameVi
      );
      if (!label) return;

      if (canonicalKind === "action") {
        const token = normalizeProcessMasterMatchToken(label);
        if (
          token.includes("작업 누락") ||
          token.includes("action missing") ||
          token.includes("thieu thao tac")
        ) {
          return;
        }
      }

      const nameKo = normalizeProcessMasterLabel((entry as any)?.nameKo || label);
      const nameEn = normalizeProcessMasterLabel((entry as any)?.nameEn || label);
      const nameVi = normalizeProcessMasterLabel((entry as any)?.nameVi || label);

      candidates.push({
        label,
        nameKo: nameKo || label,
        nameEn: nameEn || label,
        nameVi: nameVi || label,
      });
    });
  });

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const tokenKey = [
      normalizeProcessMasterMatchToken(candidate.label),
      normalizeProcessMasterMatchToken(candidate.nameKo),
      normalizeProcessMasterMatchToken(candidate.nameEn),
      normalizeProcessMasterMatchToken(candidate.nameVi),
    ]
      .filter(Boolean)
      .sort()
      .join("|");
    if (!tokenKey || seen.has(tokenKey)) return false;
    seen.add(tokenKey);
    return true;
  });
};

const ensureProcessMasterOptionsFromStyleProcesses = async ({
  processes,
  kinds = [
    "location",
    "target",
    "targetSpec",
    "action",
    "actionSpec",
  ] as ProcessCompositionKind[],
  db,
}: {
  processes: any;
  kinds?: ProcessCompositionKind[];
  db: ProcessMasterStoreClient;
}) => {
  for (const kind of kinds) {
    const type = PROCESS_MASTER_TYPE_BY_COMPOSITION_KIND[kind];
    if (!type) continue;
    const candidates = collectStyleProcessMasterCandidatesByKind(processes, kind);
    if (candidates.length === 0) continue;

    const existingRows = await listProcessMasterOptionsByType(db, type);
    const usedCodes = existingRows.reduce((set, row) => {
      const normalizedCode = normalizeProcessMasterCode(row.code);
      if (normalizedCode) set.add(normalizedCode);
      return set;
    }, new Set<string>());
    const existingTokens = existingRows.reduce((set, row) => {
      buildProcessMasterMatchTokenSet(row).forEach((token) => set.add(token));
      return set;
    }, new Set<string>());
    let nextSortOrder = existingRows.reduce(
      (maxValue, row) => Math.max(maxValue, toPositiveIntOrNull(row?.sortOrder) ?? 0),
      0
    );

    const creates: Array<{
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number;
    }> = [];

    candidates.forEach((candidate) => {
      const candidateTokens = new Set<string>();
      [
        candidate.label,
        candidate.nameKo,
        candidate.nameEn,
        candidate.nameVi,
      ].forEach((value) => {
        const token = normalizeProcessMasterMatchToken(value);
        if (token) candidateTokens.add(token);
      });

      const isAlreadyExists = Array.from(candidateTokens).some((token) =>
        existingTokens.has(token)
      );
      if (isAlreadyExists) return;

      const codeSeedLabel =
        normalizeProcessMasterLabel(candidate.nameEn) ||
        normalizeProcessMasterLabel(candidate.label) ||
        normalizeProcessMasterLabel(candidate.nameKo) ||
        normalizeProcessMasterLabel(candidate.nameVi);
      const code = generateUniqueProcessMasterCode({
        type,
        label: codeSeedLabel,
        usedCodes,
      });
      usedCodes.add(code);
      nextSortOrder += 1;

      creates.push({
        type,
        code,
        label: candidate.label,
        nameKo: candidate.nameKo || candidate.label,
        nameEn: candidate.nameEn || candidate.label,
        nameVi: candidate.nameVi || candidate.label,
        sortOrder: nextSortOrder,
      });

      existingTokens.add(normalizeProcessMasterMatchToken(code));
      candidateTokens.forEach((token) => existingTokens.add(token));
    });

    if (creates.length > 0) {
      await insertProcessMasterOptionsWithDb(db, creates);
    }
  }
};

const ensureActionProcessMasterOptionsFromStyleProcesses = async ({
  processes,
  db,
}: {
  processes: any;
  db: ProcessMasterStoreClient;
}) =>
  ensureProcessMasterOptionsFromStyleProcesses({
    processes,
    kinds: ["action"],
    db,
  });

type ProcessMasterResolverState = {
  rowsByType: Map<ProcessMasterOptionType, ProcessMasterOptionRow[]>;
  usedCodesByType: Map<ProcessMasterOptionType, Set<string>>;
  nextSortOrderByType: Map<ProcessMasterOptionType, number>;
};

const createProcessMasterResolverState = (
  rows: ProcessMasterOptionRow[] = []
): ProcessMasterResolverState => {
  const rowsByType = new Map<ProcessMasterOptionType, ProcessMasterOptionRow[]>();
  const usedCodesByType = new Map<ProcessMasterOptionType, Set<string>>();
  const nextSortOrderByType = new Map<ProcessMasterOptionType, number>();

  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    rowsByType.set(typeKey as ProcessMasterOptionType, []);
    usedCodesByType.set(typeKey as ProcessMasterOptionType, new Set<string>());
    nextSortOrderByType.set(typeKey as ProcessMasterOptionType, 0);
  });

  rows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    if (!type) return;
    const group = rowsByType.get(type) ?? [];
    group.push(row);
    rowsByType.set(type, group);

    const code = normalizeProcessMasterCode(row?.code);
    if (code) {
      const usedCodes = usedCodesByType.get(type) ?? new Set<string>();
      usedCodes.add(code);
      usedCodesByType.set(type, usedCodes);
    }

    const sortOrder = toPositiveIntOrNull(row?.sortOrder) ?? 0;
    const currentSort = nextSortOrderByType.get(type) ?? 0;
    if (sortOrder > currentSort) {
      nextSortOrderByType.set(type, sortOrder);
    }
  });

  return {
    rowsByType,
    usedCodesByType,
    nextSortOrderByType,
  };
};

const appendProcessMasterResolverRow = (
  state: ProcessMasterResolverState,
  row: ProcessMasterOptionRow
) => {
  const type = normalizeProcessMasterType(row?.type);
  if (!type) return;

  const currentRows = state.rowsByType.get(type) ?? [];
  const nextRows = [...currentRows, row].sort((left, right) => {
    const leftSort = toPositiveIntOrNull(left?.sortOrder) ?? 0;
    const rightSort = toPositiveIntOrNull(right?.sortOrder) ?? 0;
    if (leftSort !== rightSort) return leftSort - rightSort;
    return (toPositiveIntOrNull(left?.id) ?? 0) - (toPositiveIntOrNull(right?.id) ?? 0);
  });
  state.rowsByType.set(type, nextRows);

  const code = normalizeProcessMasterCode(row?.code);
  if (code) {
    const usedCodes = state.usedCodesByType.get(type) ?? new Set<string>();
    usedCodes.add(code);
    state.usedCodesByType.set(type, usedCodes);
  }

  const sortOrder = toPositiveIntOrNull(row?.sortOrder) ?? 0;
  const currentSort = state.nextSortOrderByType.get(type) ?? 0;
  if (sortOrder > currentSort) {
    state.nextSortOrderByType.set(type, sortOrder);
  }
};

const listProcessMasterEntryLabelTokens = (entry: any) =>
  [
    normalizeProcessMasterMatchToken(entry?.label),
    normalizeProcessMasterMatchToken(entry?.nameKo),
    normalizeProcessMasterMatchToken(entry?.nameEn),
    normalizeProcessMasterMatchToken(entry?.nameVi),
  ].filter(Boolean);

const findMatchingProcessMasterOptionRow = ({
  rows,
  entry,
}: {
  rows: ProcessMasterOptionRow[];
  entry: any;
}): ProcessMasterOptionRow | null => {
  if (!rows.length || !entry) return null;

  const entryCode = normalizeProcessMasterCode(entry?.code);
  if (entryCode) {
    const codeMatched =
      rows.find((row) => normalizeProcessMasterCode(row?.code) === entryCode) ?? null;
    if (codeMatched) return codeMatched;
  }

  const labelTokens = new Set(listProcessMasterEntryLabelTokens(entry));
  if (labelTokens.size === 0) return null;

  const primaryToken =
    normalizeProcessMasterMatchToken(
      entry?.label ?? entry?.nameKo ?? entry?.nameEn ?? entry?.nameVi
    ) || null;

  const matchedRows = rows.filter((row) => {
    const rowTokens = buildProcessMasterMatchTokenSet(row);
    for (const token of labelTokens) {
      if (rowTokens.has(token)) return true;
    }
    return false;
  });
  if (matchedRows.length === 0) return null;
  if (matchedRows.length === 1) return matchedRows[0] ?? null;

  if (primaryToken) {
    const primaryMatched =
      matchedRows.find((row) => {
        const rowPrimaryToken =
          normalizeProcessMasterMatchToken(
            row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi
          ) || null;
        if (rowPrimaryToken && rowPrimaryToken === primaryToken) return true;
        const rowTokens = buildProcessMasterMatchTokenSet(row);
        return rowTokens.has(primaryToken);
      }) ?? null;
    if (primaryMatched) return primaryMatched;
  }

  return (
    [...matchedRows].sort((left, right) => {
      const leftSort = toPositiveIntOrNull(left?.sortOrder) ?? 0;
      const rightSort = toPositiveIntOrNull(right?.sortOrder) ?? 0;
      if (leftSort !== rightSort) return leftSort - rightSort;
      return (toPositiveIntOrNull(left?.id) ?? 0) - (toPositiveIntOrNull(right?.id) ?? 0);
    })[0] ?? null
  );
};

const findProcessMasterOptionByTypeAndCodeWithDb = async (
  db: ProcessMasterStoreClient,
  type: ProcessMasterOptionType,
  code: string
): Promise<ProcessMasterOptionRow | null> => {
  if (!code) return null;
  const rows = await db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    WHERE "type" = ${type}::"ProcessMasterOptionType"
      AND "code" = ${code}
    ORDER BY "id" ASC
    LIMIT 1
  `);
  return rows[0] ?? null;
};

const toCanonicalStyleProcessCompositionEntry = (
  row: ProcessMasterOptionRow,
  fallbackEntry: any = null
) => {
  const code = normalizeProcessMasterCode(row?.code);
  const label =
    normalizeProcessMasterLabel(
      row?.label ??
        row?.nameKo ??
        row?.nameEn ??
        row?.nameVi ??
        fallbackEntry?.label ??
        fallbackEntry?.nameKo ??
        fallbackEntry?.nameEn ??
        fallbackEntry?.nameVi
    ) || code;
  return {
    code: code || null,
    label,
    nameKo:
      normalizeProcessMasterLabel(row?.nameKo) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameKo) ||
      label,
    nameEn:
      normalizeProcessMasterLabel(row?.nameEn) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameEn) ||
      label,
    nameVi:
      normalizeProcessMasterLabel(row?.nameVi) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameVi) ||
      label,
    isCustom: false,
  };
};

const resolveOrCreateProcessMasterOptionFromStyleEntry = async ({
  db,
  state,
  type,
  entry,
}: {
  db: ProcessMasterStoreClient;
  state: ProcessMasterResolverState;
  type: ProcessMasterOptionType;
  entry: any;
}): Promise<ProcessMasterOptionRow | null> => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const rows = state.rowsByType.get(type) ?? [];
  const matchedRow = findMatchingProcessMasterOptionRow({ rows, entry });
  if (matchedRow) return matchedRow;

  if (!Boolean(entry?.isCustom)) {
    return null;
  }

  const usedCodes = state.usedCodesByType.get(type) ?? new Set<string>();
  const codeCandidate = normalizeProcessMasterCode(entry?.code);
  let code = codeCandidate;
  if (!code || usedCodes.has(code)) {
    const codeSeedLabel =
      normalizeProcessMasterLabel(entry?.nameEn) ||
      normalizeProcessMasterLabel(entry?.label) ||
      normalizeProcessMasterLabel(entry?.nameKo) ||
      normalizeProcessMasterLabel(entry?.nameVi);
    code = generateUniqueProcessMasterCode({
      type,
      label: codeSeedLabel,
      usedCodes,
    });
  }

  const label =
    normalizeProcessMasterLabel(
      entry?.label ?? entry?.nameKo ?? entry?.nameEn ?? entry?.nameVi
    ) || code;
  const nameKo = normalizeProcessMasterLabel(entry?.nameKo) || label;
  const nameEn = normalizeProcessMasterLabel(entry?.nameEn) || label;
  const nameVi = normalizeProcessMasterLabel(entry?.nameVi) || label;
  const nextSortOrder = (state.nextSortOrderByType.get(type) ?? 0) + 1;

  await insertProcessMasterOptionsWithDb(db, [
    {
      type,
      code,
      label,
      nameKo,
      nameEn,
      nameVi,
      sortOrder: nextSortOrder,
    },
  ]);

  const createdRow = await findProcessMasterOptionByTypeAndCodeWithDb(db, type, code);
  if (!createdRow) return null;

  appendProcessMasterResolverRow(state, createdRow);
  return createdRow;
};

const syncProcessMasterFromStyleProcesses = async ({
  processes,
  db,
}: {
  processes: any;
  db: ProcessMasterStoreClient;
}) => {
  await ensureProcessMasterOptionTypeSchemaReady();
  await ensureProcessMasterOptionRelationSchemaReady();

  const normalizedProcesses = normalizeStyleProcesses(processes);
  if (normalizedProcesses.length === 0) return normalizedProcesses;

  const processMasterRows = await listProcessMasterOptionsWithDb(db);
  const resolverState = createProcessMasterResolverState(processMasterRows);
  const pendingTargetSpecRelations = new Map<string, { parentOptionId: number; childOptionId: number }>();
  const pendingActionSpecRelations = new Map<string, { parentOptionId: number; childOptionId: number }>();

  const canonicalizedProcesses: any[] = [];

  for (const process of normalizedProcesses) {
    const normalizedProcess = normalizeStyleProcess(process);
    const composition = normalizeStyleProcessComposition(
      (normalizedProcess as any)?.processComposition
    );
    if (!composition) {
      canonicalizedProcesses.push(normalizedProcess);
      continue;
    }

    const canonicalLocations: any[] = [];
    for (const rawLocationEntry of ensureArray((composition as any)?.locations)) {
      const locationEntry = normalizeStyleProcessCompositionEntry(rawLocationEntry, "location");
      if (!locationEntry) continue;
      const locationRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "LOCATION",
        entry: locationEntry,
      });
      canonicalLocations.push(
        locationRow
          ? toCanonicalStyleProcessCompositionEntry(locationRow, locationEntry)
          : locationEntry
      );
    }

    const canonicalTargetPairs: Array<{ target: any; targetSpec: any | null }> = [];
    for (const rawPair of ensureArray((composition as any)?.targetPairs)) {
      if (!rawPair || typeof rawPair !== "object" || Array.isArray(rawPair)) continue;
      const targetEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.target,
        "target"
      );
      if (!targetEntry) continue;
      const targetRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "TARGET",
        entry: targetEntry,
      });
      const canonicalTarget = targetRow
        ? toCanonicalStyleProcessCompositionEntry(targetRow, targetEntry)
        : targetEntry;

      const targetSpecEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.targetSpec,
        "targetSpec"
      );
      let targetSpecRow: ProcessMasterOptionRow | null = null;
      let canonicalTargetSpec: any | null = null;
      if (targetSpecEntry) {
        targetSpecRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
          db,
          state: resolverState,
          type: "TARGET_SPEC",
          entry: targetSpecEntry,
        });
        canonicalTargetSpec = targetSpecRow
          ? toCanonicalStyleProcessCompositionEntry(targetSpecRow, targetSpecEntry)
          : targetSpecEntry;
      }

      canonicalTargetPairs.push({
        target: canonicalTarget,
        targetSpec: canonicalTargetSpec,
      });

      if (targetRow && targetSpecRow) {
        pendingTargetSpecRelations.set(
          `${targetRow.id}:${targetSpecRow.id}`,
          {
            parentOptionId: targetRow.id,
            childOptionId: targetSpecRow.id,
          }
        );
      }
    }

    const canonicalActionPairs: Array<{ action: any; actionSpec: any | null }> = [];
    for (const rawPair of ensureArray((composition as any)?.actionPairs)) {
      if (!rawPair || typeof rawPair !== "object" || Array.isArray(rawPair)) continue;
      const actionEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.action,
        "action"
      );
      if (!actionEntry) continue;
      const actionRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "ACTION",
        entry: actionEntry,
      });
      const canonicalAction = actionRow
        ? toCanonicalStyleProcessCompositionEntry(actionRow, actionEntry)
        : actionEntry;

      const actionSpecEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.actionSpec,
        "actionSpec"
      );
      let actionSpecRow: ProcessMasterOptionRow | null = null;
      let canonicalActionSpec: any | null = null;
      if (actionSpecEntry) {
        actionSpecRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
          db,
          state: resolverState,
          type: "ACTION_SPEC",
          entry: actionSpecEntry,
        });
        canonicalActionSpec = actionSpecRow
          ? toCanonicalStyleProcessCompositionEntry(actionSpecRow, actionSpecEntry)
          : actionSpecEntry;
      }

      canonicalActionPairs.push({
        action: canonicalAction,
        actionSpec: canonicalActionSpec,
      });

      if (actionRow && actionSpecRow) {
        pendingActionSpecRelations.set(
          `${actionRow.id}:${actionSpecRow.id}`,
          {
            parentOptionId: actionRow.id,
            childOptionId: actionSpecRow.id,
          }
        );
      }
    }

    const canonicalComposition = {
      locations: canonicalLocations,
      targetPairs: canonicalTargetPairs,
      actionPairs: canonicalActionPairs,
    };

    canonicalizedProcesses.push(
      normalizeStyleProcess({
        ...normalizedProcess,
        processComposition: canonicalComposition,
      })
    );
  }

  const relationCreates = [
    ...Array.from(pendingTargetSpecRelations.values()).map((item) => ({
      type: "TARGET_TARGET_SPEC" as ProcessMasterRelationType,
      parentOptionId: item.parentOptionId,
      childOptionId: item.childOptionId,
    })),
    ...Array.from(pendingActionSpecRelations.values()).map((item) => ({
      type: "ACTION_ACTION_SPEC" as ProcessMasterRelationType,
      parentOptionId: item.parentOptionId,
      childOptionId: item.childOptionId,
    })),
  ];
  if (relationCreates.length > 0) {
    await insertProcessMasterOptionRelationsWithDb(db, relationCreates);
  }

  return canonicalizedProcesses;
};

const PROCESS_COMPOSITION_KIND_BY_MASTER_TYPE: Record<
  ProcessMasterOptionType,
  "location" | "target" | "targetSpec" | "action" | "actionSpec"
> = {
  LOCATION: "location",
  TARGET: "target",
  ACTION: "action",
  TARGET_SPEC: "targetSpec",
  ACTION_SPEC: "actionSpec",
};

const buildProcessMasterNameLookupByTypeAndCode = (
  rows: Array<Partial<ProcessMasterOptionRow>> = []
) => {
  const lookup = new Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >();
  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    lookup.set(typeKey as ProcessMasterOptionType, new Map());
  });

  rows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    if (!type) return;
    const codeKey = normalizeProcessMasterCode(row?.code);
    if (!codeKey) return;
    const typeLookup = lookup.get(type);
    if (!typeLookup) return;
    const label =
      normalizeProcessMasterLabel(row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi) ||
      codeKey;
    typeLookup.set(codeKey, {
      label,
      nameKo: normalizeProcessMasterLabel(row?.nameKo) || label,
      nameEn: normalizeProcessMasterLabel(row?.nameEn) || label,
      nameVi: normalizeProcessMasterLabel(row?.nameVi) || label,
    });
  });

  return lookup;
};

const applyProcessMasterNamesToCompositionEntry = (
  entry: any,
  type: ProcessMasterOptionType,
  lookupByTypeAndCode: Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >
) => {
  const kind = PROCESS_COMPOSITION_KIND_BY_MASTER_TYPE[type];
  const normalizedEntry = normalizeStyleProcessCompositionEntry(entry, kind);
  if (!normalizedEntry) return null;

  const codeKey = normalizeProcessMasterCode(normalizedEntry.code);
  if (!codeKey) return normalizedEntry;

  const masterNames = lookupByTypeAndCode.get(type)?.get(codeKey);
  if (!masterNames) return normalizedEntry;

  const label = masterNames.label || normalizedEntry.label;
  return {
    ...normalizedEntry,
    code: codeKey || normalizedEntry.code,
    label: label || normalizedEntry.label,
    nameKo: masterNames.nameKo || label || normalizedEntry.nameKo,
    nameEn: masterNames.nameEn || label || normalizedEntry.nameEn,
    nameVi: masterNames.nameVi || label || normalizedEntry.nameVi,
  };
};

const applyProcessMasterNamesToComposition = (
  composition: any,
  lookupByTypeAndCode: Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) return null;

  const locations = ensureArray(normalizedComposition.locations)
    .map((entry) =>
      applyProcessMasterNamesToCompositionEntry(entry, "LOCATION", lookupByTypeAndCode)
    )
    .filter(Boolean);
  const targetPairs = ensureArray((normalizedComposition as any)?.targetPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const target = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.target,
        "TARGET",
        lookupByTypeAndCode
      );
      if (!target) return null;
      const targetSpec = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.targetSpec,
        "TARGET_SPEC",
        lookupByTypeAndCode
      );
      return {
        target,
        targetSpec: targetSpec ?? null,
      };
    })
    .filter(Boolean);
  const actionPairs = ensureArray((normalizedComposition as any)?.actionPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const action = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.action,
        "ACTION",
        lookupByTypeAndCode
      );
      if (!action) return null;
      const actionSpec = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.actionSpec,
        "ACTION_SPEC",
        lookupByTypeAndCode
      );
      return {
        action,
        actionSpec: actionSpec ?? null,
      };
    })
    .filter(Boolean);

  if (
    locations.length === 0 &&
    targetPairs.length === 0 &&
    actionPairs.length === 0
  ) {
    return null;
  }

  return {
    locations,
    targetPairs,
    actionPairs,
  };
};

const syncStyleProcessCompositionNamesWithMasterOptions = async ({
  processMasterRows = null,
  db = prisma,
}: {
  processMasterRows?: Array<Partial<ProcessMasterOptionRow>> | null;
  db?: Prisma.TransactionClient | typeof prisma;
}) => {
  const rows =
    processMasterRows && processMasterRows.length > 0
      ? processMasterRows
      : await listProcessMasterOptions();
  if (rows.length === 0) return 0;

  const lookupByTypeAndCode = buildProcessMasterNameLookupByTypeAndCode(rows);
  const styleProcesses = await db.styleProcess.findMany({
    select: {
      id: true,
      processCode: true,
      processName: true,
      processComposition: true,
    },
    orderBy: { id: "asc" },
  });

  let updatedCount = 0;
  for (const row of styleProcesses) {
    const previousComposition = normalizeStyleProcessComposition(row.processComposition);
    if (!previousComposition) continue;

    const nextComposition = applyProcessMasterNamesToComposition(
      previousComposition,
      lookupByTypeAndCode
    );
    if (!nextComposition) continue;

    const previousKey = JSON.stringify(previousComposition);
    const nextKey = JSON.stringify(nextComposition);
    const localizedNames = buildStyleProcessLocalizedNamesFromComposition(nextComposition, {
      name: row.processName,
      nameEn: row.processName,
    });
    const nextProcessName =
      resolveOptionalString(localizedNames.nameEn, null) ??
      resolveOptionalString(row.processName, null) ??
      resolveOptionalString(row.processCode, null) ??
      "";

    const isCompositionChanged = previousKey !== nextKey;
    const isProcessNameChanged =
      resolveOptionalString(row.processName, null) !== nextProcessName;
    if (!isCompositionChanged && !isProcessNameChanged) continue;

    await db.styleProcess.update({
      where: { id: row.id },
      data: {
        processComposition: nextComposition ?? Prisma.JsonNull,
        processName: nextProcessName,
      },
    });
    updatedCount += 1;
  }

  return updatedCount;
};

const PROCESS_TEXT_PLACEHOLDERS = {
  ko: {
    target: "((주대상 누락))",
    action: "((작업 누락))",
  },
  en: {
    target: "((Primary target missing))",
    action: "((Action missing))",
  },
  vi: {
    target: "((Thieu doi tuong chinh))",
    action: "((Thieu thao tac))",
  },
} as const;

const splitProcessTokens = (value: string, separatorPattern: RegExp): string[] =>
  String(value ?? "")
    .split(separatorPattern)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeOptionalProcessDisplayText = (
  value: any,
  placeholders: { target: string; action: string }
) => {
  const text = resolveOptionalString(value, null);
  if (!text) return null;
  return normalizeProcessDisplayText(text, placeholders);
};

const normalizeProcessPlaceholderText = (
  text: string,
  placeholders: { target: string; action: string }
) => {
  const normalized = String(text ?? "").trim();
  if (!normalized) return normalized;
  const compact = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /(primary|주대상|doi tuong chinh)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.target;
  }
  if (
    /(action|작업|thao tac)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.action;
  }
  return normalized;
};

const normalizeProcessDisplayText = (
  value: any,
  placeholders: { target: string; action: string }
) => {
  const rawText = resolveOptionalString(value, null);
  if (!rawText) {
    return `${placeholders.target} - ${placeholders.action}`;
  }

  const [leftChunk, rightChunk] = String(rawText).split(/\s*-\s*/, 2);
  const rawLeft = normalizeProcessPlaceholderText(
    resolveOptionalString(leftChunk, null) ?? placeholders.target,
    placeholders
  );
  const rawRight = normalizeProcessPlaceholderText(
    resolveOptionalString(rightChunk, null) ?? placeholders.action,
    placeholders
  );

  let partText = rawLeft;
  let targetText = "";
  let shouldRequireTarget = false;
  const hasHangul = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(rawLeft);
  const isPlaceholderLeft = rawLeft.includes("((") && rawLeft.includes("))");

  const colonIndex = rawLeft.indexOf(":");
  if (!isPlaceholderLeft && colonIndex >= 0) {
    partText = rawLeft.slice(0, colonIndex).trim();
    targetText = rawLeft.slice(colonIndex + 1).trim();
    shouldRequireTarget = true;
  } else if (!isPlaceholderLeft && rawLeft.includes("/")) {
    const slashTokens = splitProcessTokens(rawLeft, /[·/]/g);
    if (slashTokens.length > 1) {
      partText = slashTokens[0] ?? "";
      targetText = slashTokens.slice(1).join("·");
      shouldRequireTarget = true;
    }
  } else {
    const firstSpaceMatch = rawLeft.match(/\s+/);
    const firstSpaceIndex = firstSpaceMatch?.index ?? -1;
    if (hasHangul && !isPlaceholderLeft && firstSpaceIndex > 0) {
      partText = rawLeft.slice(0, firstSpaceIndex).trim();
      targetText = rawLeft.slice(firstSpaceIndex + firstSpaceMatch![0].length).trim();
      shouldRequireTarget = true;
    }
  }

  const normalizedPart = partText || placeholders.target;
  const normalizedTargets = splitProcessTokens(targetText, /[·/]/g).join("·");
  const leftText =
    shouldRequireTarget || normalizedTargets
      ? `${normalizedPart}: ${normalizedTargets || placeholders.target}`
      : normalizedPart;

  const specTokens = Array.from(rawRight.matchAll(/\(([^)]*)\)/g))
    .map((match) => match?.[1] ?? "")
    .flatMap((specValue) => splitProcessTokens(specValue, /[·/+]/g));
  const normalizedSpec = specTokens.join("·");
  const actionChunk = rawRight.replace(/\([^)]*\)/g, " ");
  const normalizedActions = splitProcessTokens(actionChunk, /[·+]/g).join("·");
  const rightText = normalizedActions || placeholders.action;

  return normalizedSpec
    ? `${leftText} - ${rightText} (${normalizedSpec})`
    : `${leftText} - ${rightText}`;
};

const resolveManagedProcessNameData = (item: any) => {
  const base = resolveManagedAttributeNameData(item);
  const nameEn = normalizeProcessDisplayText(
    resolveOptionalString(base.nameEn, null) ?? base.name,
    PROCESS_TEXT_PLACEHOLDERS.en
  );
  const nameKo = normalizeOptionalProcessDisplayText(
    base.nameKo,
    PROCESS_TEXT_PLACEHOLDERS.ko
  );
  const nameVi = normalizeOptionalProcessDisplayText(
    base.nameVi,
    PROCESS_TEXT_PLACEHOLDERS.vi
  );
  return {
    name: nameEn,
    nameKo,
    nameEn,
    nameVi,
  };
};

const buildCombinedLocalizedProcessName = (item: {
  code?: any;
  nameEn?: any;
  nameKo?: any;
  nameVi?: any;
}) => {
  const nameKo = resolveOptionalString(item?.nameKo, null);
  const nameVi = resolveOptionalString(item?.nameVi, null);
  const nameEn = resolveOptionalString(item?.nameEn, null);
  const code = resolveOptionalString(item?.code, null);
  const localizedParts = [nameKo, nameVi].filter(Boolean);
  if (localizedParts.length > 0) {
    return localizedParts.join(" / ");
  }
  return (
    nameEn ??
    code ??
    `${PROCESS_TEXT_PLACEHOLDERS.ko.target} / ${PROCESS_TEXT_PLACEHOLDERS.vi.target}`
  );
};

const sameTrimmedText = (left: any, right: any) =>
  resolveOptionalString(left, "") === resolveOptionalString(right, "");

const syncStyleProcessNamesFromMaster = async ({
  orgId,
  processes,
  db = prisma,
}: {
  orgId: number;
  processes: any[];
  db?: Prisma.TransactionClient | typeof prisma;
}) => {
  const codeToName = new Map<string, string>();

  ensureArray(processes).forEach((item) => {
    const codeKey = normalizeProcessCodeKey(item?.code);
    if (!codeKey) return;
    const normalized = resolveManagedProcessNameData(item);
    const combinedName = buildCombinedLocalizedProcessName({
      code: item?.code,
      nameEn: normalized.nameEn,
      nameKo: normalized.nameKo,
      nameVi: normalized.nameVi,
    });
    if (!combinedName) return;
    codeToName.set(codeKey, combinedName);
  });

  if (codeToName.size === 0) {
    return {
      touchedCodes: 0,
      updatedStyleProcessCount: 0,
      updatedStyleCount: 0,
    };
  }

  const targetCodes = Array.from(codeToName.keys());
  const styleProcessRows = await db.styleProcess.findMany({
    where: {
      orgId,
      processCode: { in: targetCodes },
    },
    select: {
      id: true,
      processCode: true,
      processName: true,
    },
  });

  let updatedStyleProcessCount = 0;
  for (const row of styleProcessRows) {
    const nextName = codeToName.get(normalizeProcessCodeKey(row.processCode));
    if (!nextName || sameTrimmedText(row.processName, nextName)) continue;
    await db.styleProcess.update({
      where: { id: row.id },
      data: { processName: nextName },
    });
    updatedStyleProcessCount += 1;
  }

  const styleRows = await db.style.findMany({
    where: { orgId },
    select: { uid: true, processes: true },
  });
  let updatedStyleCount = 0;

  for (const style of styleRows) {
    const styleProcesses = Array.isArray(style.processes) ? style.processes : null;
    if (!styleProcesses || styleProcesses.length === 0) continue;

    let touched = false;
    const nextProcesses = styleProcesses.map((process) => {
      if (!process || typeof process !== "object" || Array.isArray(process)) return process;
      const codeKey = normalizeProcessCodeKey((process as any)?.code);
      if (!codeKey) return process;
      const nextName = codeToName.get(codeKey);
      if (!nextName || sameTrimmedText((process as any)?.name, nextName)) return process;
      touched = true;
      return {
        ...(process as any),
        name: nextName,
      };
    });

    if (!touched) continue;
    await db.style.update({
      where: { uid: style.uid },
      data: { processes: nextProcesses },
    });
    updatedStyleCount += 1;
  }

  return {
    touchedCodes: targetCodes.length,
    updatedStyleProcessCount,
    updatedStyleCount,
  };
};

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

const resolveCategoryAttributeCode = ({
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
    fallbackPrefix: "CATEGORY",
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
    const {
      name,
      nameKo,
      nameEn,
      nameVi,
    } = (
      typeof options.resolveNameData === "function"
        ? options.resolveNameData(item, { orgId, itemId, existingCode })
        : resolveManagedColorNameData(item)
    ) as {
      name: string;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    };
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
          data: { code, name, nameKo, nameEn, nameVi },
        })
      );
    } else {
      creates.push({ orgId, code, name, nameKo, nameEn, nameVi });
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
const syncGlobalColorSection = async (items: any) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await prisma.attrColor.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
  });
  const existingIds = existing.map((item) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id) => !incomingIdSet.has(id));
  const deleteIdSet = new Set(deleteIds);
  if (deleteIds.length > 0) {
    await prisma.attrColor.deleteMany({ where: { id: { in: deleteIds } } });
  }

  const existingById = existing.reduce(
    (map: Map<number, { code: string; name: string }>, item) => {
      map.set(item.id, {
        code: String(item.code ?? "").trim(),
        name: String(item.name ?? "").trim(),
      });
      return map;
    },
    new Map<number, { code: string; name: string }>()
  );
  const usedCodes = existing.reduce((set: Set<string>, item) => {
    if (deleteIdSet.has(item.id)) return set;
    const trackedCode = normalizeManagedAttributeCode(item.code);
    if (trackedCode) set.add(trackedCode);
    return set;
  }, new Set<string>());

  const creates: Array<{
    code: string;
    name: string;
    nameKo: string | null;
    nameEn: string | null;
    nameVi: string | null;
  }> = [];
  const updates: Array<{
    id: number;
    code: string;
    name: string;
    nameKo: string | null;
    nameEn: string | null;
    nameVi: string | null;
  }> = [];
  const changedCodes: Array<{ id: number; code: string }> = [];
  const changedNames: Array<{ id: number; name: string }> = [];

  for (const item of safeItems) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const existingRow = itemId
      ? existingById.get(itemId) ?? { code: "", name: "" }
      : { code: "", name: "" };
    const trackedExistingCode = normalizeManagedAttributeCode(existingRow.code);
    if (trackedExistingCode) {
      usedCodes.delete(trackedExistingCode);
    }

    const { name, nameKo, nameEn, nameVi } = resolveManagedAttributeNameData(item);
    const code = resolveColorAttributeCode({
      code: String(item?.code ?? "").trim(),
      name,
      usedCodes,
    });

    if (!code && !name) {
      if (trackedExistingCode) {
        usedCodes.add(trackedExistingCode);
      }
      continue;
    }

    if (itemId) {
      updates.push({
        id: itemId,
        code,
        name,
        nameKo,
        nameEn,
        nameVi,
      });
      if (existingRow.code !== code) {
        changedCodes.push({ id: itemId, code });
      }
      if (existingRow.name !== name) {
        changedNames.push({ id: itemId, name });
      }
    } else {
      creates.push({ code, name, nameKo, nameEn, nameVi });
    }

    const trackedNextCode = normalizeManagedAttributeCode(code);
    if (trackedNextCode) {
      usedCodes.add(trackedNextCode);
    }
  }

  if (creates.length > 0) {
    await prisma.attrColor.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((row) =>
        prisma.attrColor.update({
          where: { id: row.id },
          data: {
            code: row.code,
            name: row.name,
            nameKo: row.nameKo,
            nameEn: row.nameEn,
            nameVi: row.nameVi,
          },
        })
      )
    );
  }

  if (changedCodes.length > 0) {
    await prisma.$transaction([
      ...changedCodes.map((row) =>
        prisma.workOrderItem.updateMany({
          where: { colorId: row.id },
          data: { colorCode: row.code },
        })
      ),
      ...changedCodes.map((row) =>
        prisma.workRecord.updateMany({
          where: { colorId: row.id },
          data: { colorCode: row.code },
        })
      ),
    ]);
  }

  if (changedNames.length > 0) {
    await prisma.$transaction(
      changedNames.map((row) =>
        prisma.assignmentPlan.updateMany({
          where: { colorId: row.id },
          data: { colorName: row.name },
        })
      )
    );
  }

  return prisma.attrColor.findMany({ orderBy: { id: "asc" } });
};

const listGlobalCategorySection = async (fallbackOrgId: number | null = null) => {
  const firstCategory = await prisma.attrCategory.findFirst({
    select: { orgId: true },
    orderBy: [{ orgId: "asc" }, { id: "asc" }],
  });
  const sourceOrgId = firstCategory?.orgId ?? fallbackOrgId;
  if (!sourceOrgId) return [];
  return prisma.attrCategory.findMany({
    where: { orgId: sourceOrgId },
    orderBy: { id: "asc" },
  });
};

const syncGlobalCategorySection = async (
  items: any,
  options: {
    fallbackOrgId?: number | null;
  } = {}
) => {
  const organizations = await prisma.organization.findMany({
    where: {
      type: { in: ["MANUFACTURER", "BRAND"] },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const organizationIds = organizations
    .map((item) => toPositiveIntOrNull(item.id))
    .filter((id): id is number => id !== null);
  const fallbackOrgId = toPositiveIntOrNull(options.fallbackOrgId) ?? organizationIds[0] ?? null;
  if (!fallbackOrgId) return [];

  const sourceRows = await syncSection(prisma.attrCategory, fallbackOrgId, items, {
    resolveCode: ({ code, name, usedCodes }: { code: string; name: string; usedCodes: Set<string> }) =>
      resolveCategoryAttributeCode({ code, name, usedCodes }),
    trackCode: normalizeManagedAttributeCode,
  });

  const replicatedRows = sourceRows.map((row: any) => ({
    code: row.code,
    name: row.name,
    nameKo: row.nameKo,
    nameEn: row.nameEn,
    nameVi: row.nameVi,
  }));

  await Promise.all(
    organizationIds
      .filter((orgId) => orgId !== fallbackOrgId)
      .map((orgId) =>
        syncSection(prisma.attrCategory, orgId, replicatedRows, {
          resolveCode: ({
            code,
            name,
            usedCodes,
          }: {
            code: string;
            name: string;
            usedCodes: Set<string>;
          }) => resolveCategoryAttributeCode({ code, name, usedCodes }),
          trackCode: normalizeManagedAttributeCode,
        })
      )
  );

  return sourceRows;
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
  res.json({
    ok: true,
    ready: startupLifecycleState === "ready",
    startupState: startupLifecycleState,
  });
});

app.get("/ready", (_req, res) => {
  if (startupLifecycleState !== "ready") {
    return res.status(503).json({
      ok: false,
      ready: false,
      startupState: startupLifecycleState,
    });
  }
  return res.json({ ok: true, ready: true });
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
      subscription: buildSubscriptionResponse(organization?.subscription),
      systemAdminContactEmail: getSystemAdminContactEmail(),
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
    if (membership && membership.status === "ACTIVE" && membership.organization) {
      const organization = await attachOrganizationSubscription(membership.organization);
      return res.json({
        email: requesterEmail,
        entryType: "ORG",
        systemRole: "USER",
        orgId: organization?.id ?? membership.organization.id,
        orgName: organization?.name ?? membership.organization.name ?? null,
        orgType: organization?.type ?? membership.organization.type ?? null,
        orgRole: membership.role,
        factoryId: membership.employee?.factoryId ?? null,
        employeeName: membership.employee?.name ?? null,
        subscription: buildSubscriptionResponse(organization?.subscription),
        systemAdminContactEmail: getSystemAdminContactEmail(),
      });
    }
    // If requested org is stale/unauthorized, fall through and resolve by user's actual access.
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
    const [pendingMembershipCount, latestRegistrationRequest] = await Promise.all([
      prisma.orgMembership.count({
        where: {
          email: requesterEmail,
          status: "PENDING",
        },
      }),
      prisma.onboardingRequest.findFirst({
        where: {
          requesterEmail,
          status: "PENDING",
        },
        orderBy: { id: "desc" },
      }),
    ]);

    return res.json({
      email: requesterEmail,
      entryType: "ONBOARDING",
      systemRole: "USER",
      orgId: null,
      orgName: null,
      orgType: null,
      orgRole: null,
      employeeName: null,
      onboardingRequired: true,
      pendingMembershipCount,
      latestRegistrationRequest: latestRegistrationRequest
        ? toOnboardingRequestSummary(latestRegistrationRequest)
        : null,
      systemAdminContactEmail: getSystemAdminContactEmail(),
    });
  }

  const organization = await attachOrganizationSubscription(membership.organization);
  res.json({
    email: requesterEmail,
    entryType: "ORG",
    systemRole: "USER",
    orgId: organization?.id ?? membership.organization.id,
    orgName: organization?.name ?? membership.organization.name ?? null,
    orgType: organization?.type ?? membership.organization.type ?? null,
    orgRole: membership.role,
    factoryId: membership.employee?.factoryId ?? null,
    employeeName: membership.employee?.name ?? null,
    subscription: buildSubscriptionResponse(organization?.subscription),
    systemAdminContactEmail: getSystemAdminContactEmail(),
  });
});

app.post("/onboarding/company-requests", async (req, res) => {
  const requesterEmail = resolveOnboardingRequesterEmail(
    req,
    req.body?.requesterEmail ?? req.body?.email
  );
  if (!requesterEmail || !requesterEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "request user email is required" });
  }

  const organizationNameEn = resolveOptionalString(
    req.body?.organizationName ?? req.body?.organizationNameEn,
    null
  );
  if (
    !organizationNameEn ||
    organizationNameEn.length < ONBOARDING_COMPANY_NAME_MIN_LENGTH ||
    organizationNameEn.length > ONBOARDING_COMPANY_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `organizationName must be ${ONBOARDING_COMPANY_NAME_MIN_LENGTH}-${ONBOARDING_COMPANY_NAME_MAX_LENGTH} chars`,
    });
  }

  const rawOrganizationType =
    req.body?.organizationType ?? req.body?.orgType ?? req.body?.industryType;
  const organizationType =
    rawOrganizationType === undefined || rawOrganizationType === null || rawOrganizationType === ""
      ? ORGANIZATION_TYPE_KEYS.MANUFACTURER
      : resolveOnboardingOrganizationType(rawOrganizationType);
  if (!organizationType) {
    return res.status(400).json({
      ok: false,
      error: `organizationType must be ${ORGANIZATION_TYPE_KEYS.MANUFACTURER} or ${ORGANIZATION_TYPE_KEYS.BRAND}`,
    });
  }

  const country = resolveOnboardingCountry(req.body?.country ?? req.body?.countryCode);
  if (!country) {
    return res.status(400).json({ ok: false, error: "country must be KR or VN" });
  }

  const companyAddress = resolveOptionalString(
    req.body?.companyAddress ?? req.body?.address,
    null
  );
  if (!companyAddress || companyAddress.length > ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: `companyAddress is required (max ${ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH} chars)`,
    });
  }

  const businessNumber = normalizeOnboardingBusinessNumber(req.body?.businessNumber);
  if (!businessNumber) {
    return res.status(400).json({ ok: false, error: "businessNumber is required" });
  }
  if (!isValidOnboardingBusinessNumber(country, businessNumber)) {
    return res.status(400).json({
      ok: false,
      error:
        country === "KR"
          ? "invalid KR businessNumber format (10 digits or 3-2-5)"
          : "invalid VN businessNumber format (10 digits or 13 digits)",
    });
  }
  const businessNumberIdentity = getOnboardingBusinessNumberIdentity(businessNumber);

  const contactName = resolveOptionalString(
    req.body?.representativeName ?? req.body?.contactName,
    null
  );
  if (
    !contactName ||
    contactName.length > ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `contactName is required (max ${ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH} chars)`,
    });
  }

  const contactEmail = normalizeEmail(req.body?.representativeEmail ?? req.body?.contactEmail);
  if (!contactEmail || !contactEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "contactEmail is required" });
  }

  const contactPhone = resolveOptionalString(
    req.body?.representativeContact ?? req.body?.contactPhone,
    null
  );
  if (
    !contactPhone ||
    contactPhone.length > ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `contactPhone is required (max ${ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH} chars)`,
    });
  }

  const hasActiveMembership = await prisma.orgMembership.count({
    where: {
      email: requesterEmail,
      status: "ACTIVE",
    },
  });
  if (hasActiveMembership > 0) {
    return res.status(409).json({
      ok: false,
      error: "active org membership already exists",
    });
  }

  const existingPendingRequest = await prisma.onboardingRequest.findFirst({
    where: {
      requesterEmail,
      status: "PENDING",
      requestType: "REGISTER_ORG",
    },
    orderBy: { id: "desc" },
  });

  const [existingOrganization, duplicatePendingRequest] = await Promise.all([
    findOrganizationByBusinessNumberIdentity(businessNumberIdentity),
    findPendingOnboardingRequestByBusinessNumberIdentity(
      businessNumberIdentity,
      existingPendingRequest?.id
        ? { excludeRequestId: existingPendingRequest.id }
        : {}
    ),
  ]);

  if (existingOrganization) {
    return res.status(409).json({
      ok: false,
      error: "organization already exists for this businessNumber",
    });
  }

  if (duplicatePendingRequest) {
    return res.status(409).json({
      ok: false,
      error: "pending company request already exists for this businessNumber",
    });
  }

  const savedRequest = existingPendingRequest
    ? await prisma.onboardingRequest.update({
        where: { id: existingPendingRequest.id },
        data: {
          organizationNameEn,
          organizationType,
          country,
          companyAddress,
          businessNumber,
          contactName,
          contactEmail,
          contactPhone,
        },
      })
    : await prisma.onboardingRequest.create({
        data: {
          requesterEmail,
          requestType: "REGISTER_ORG",
          organizationNameEn,
          organizationType,
          country,
          companyAddress,
          businessNumber,
          contactName,
          contactEmail,
          contactPhone,
          status: "PENDING",
        },
      });

  return res.status(existingPendingRequest ? 200 : 201).json({
    ok: true,
    request: toOnboardingRequestSummary(savedRequest),
  });
});

app.get("/system/onboarding-requests", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const pendingCompanyRequests = await prisma.onboardingRequest.findMany({
    where: { status: "PENDING" },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return res.json({
    pendingMembershipRequests: [],
    pendingCompanyRequests: pendingCompanyRequests.map(toOnboardingRequestSummary),
  });
});

app.patch("/system/company-requests/:id/approve", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const companyRequest = await prisma.onboardingRequest.findUnique({
    where: { id },
  });
  if (!companyRequest) {
    return res.status(404).json({ ok: false, error: "request not found" });
  }
  if (companyRequest.status !== "PENDING") {
    return res.status(409).json({ ok: false, error: "request is not pending" });
  }

  const rawSubscriptionStatus = req.body?.subscriptionStatus ?? req.body?.status;
  const normalizedSubscriptionStatus =
    rawSubscriptionStatus === undefined
      ? undefined
      : resolveSubscriptionStatus(rawSubscriptionStatus);
  if (rawSubscriptionStatus !== undefined && !normalizedSubscriptionStatus) {
    return res.status(400).json({ ok: false, error: "invalid subscription status" });
  }

  const normalizedServiceContactEmail = normalizeEmail(
    req.body?.serviceContactEmail ?? req.body?.membershipEmail
  );
  const normalizedBillingEmail = normalizeEmail(req.body?.billingEmail);
  const subscriptionPayload: Record<string, unknown> = {};
  subscriptionPayload.subscriptionStatus =
    normalizedSubscriptionStatus ?? "TRIAL";
  if (normalizedSubscriptionStatus === "ACTIVE") {
    subscriptionPayload.serviceContactEmail =
      normalizedServiceContactEmail || companyRequest.contactEmail;
    subscriptionPayload.billingEmail =
      normalizedBillingEmail || companyRequest.contactEmail;
    subscriptionPayload.activeEndsAt = req.body?.activeEndsAt ?? null;
  } else {
    if (normalizedServiceContactEmail) {
      subscriptionPayload.serviceContactEmail = normalizedServiceContactEmail;
    }
    if (normalizedBillingEmail) {
      subscriptionPayload.billingEmail = normalizedBillingEmail;
    }
  }

  const now = new Date();
  const businessNumberIdentity = getOnboardingBusinessNumberIdentity(
    companyRequest.businessNumber
  );
  const existingOrganization = await findOrganizationByBusinessNumberIdentity(
    businessNumberIdentity
  );
  if (existingOrganization) {
    return res.status(409).json({
      ok: false,
      error: "organization already exists for this businessNumber",
    });
  }

  const organizationType =
    resolveOnboardingOrganizationType(companyRequest.organizationType) ??
    ORGANIZATION_TYPE_KEYS.MANUFACTURER;
  const organizationCountry = resolveOnboardingCountry(companyRequest.country);
  const organization = await prisma.organization.create({
    data: {
      name: companyRequest.organizationNameEn,
      businessNumber: companyRequest.businessNumber,
      representative: companyRequest.contactName || null,
      address: companyRequest.companyAddress || null,
      country: organizationCountry ?? null,
      email: companyRequest.contactEmail,
      phone: companyRequest.contactPhone,
      type: organizationType,
    },
  });

  await applySubscriptionPayload(organization, subscriptionPayload);
  const organizationWithSubscription = await attachOrganizationSubscription(organization);

  const approvedMembership = await prisma.orgMembership.upsert({
    where: {
      orgId_email: {
        orgId: organization.id,
        email: companyRequest.requesterEmail,
      },
    },
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      requestedAt: now,
      approvedAt: now,
      approvedBy: systemAdmin.requesterEmail,
    },
    create: {
      orgId: organization.id,
      email: companyRequest.requesterEmail,
      role: "ADMIN",
      status: "ACTIVE",
      requestedAt: now,
      approvedAt: now,
      approvedBy: systemAdmin.requesterEmail,
    },
  });

  const updatedRequest = await prisma.onboardingRequest.update({
    where: { id: companyRequest.id },
    data: {
      status: "APPROVED",
      approvedAt: now,
      approvedBy: systemAdmin.requesterEmail,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      organizationId: organization.id,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return res.json({
    ok: true,
    request: toOnboardingRequestSummary(updatedRequest),
    organization: toOrganizationResponse(organizationWithSubscription),
    membership: approvedMembership,
  });
});

app.patch("/system/company-requests/:id/reject", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const companyRequest = await prisma.onboardingRequest.findUnique({
    where: { id },
  });
  if (!companyRequest) {
    return res.status(404).json({ ok: false, error: "request not found" });
  }
  if (companyRequest.status !== "PENDING") {
    return res.status(409).json({ ok: false, error: "request is not pending" });
  }

  const rejectionReason = resolveOptionalString(req.body?.reason, null);
  const now = new Date();
  const updatedRequest = await prisma.onboardingRequest.update({
    where: { id: companyRequest.id },
    data: {
      status: "REJECTED",
      rejectedAt: now,
      rejectedBy: systemAdmin.requesterEmail,
      rejectionReason,
      approvedAt: null,
      approvedBy: null,
      organizationId: null,
    },
  });

  return res.json({
    ok: true,
    request: toOnboardingRequestSummary(updatedRequest),
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
    isManufacturerOrg,
    resolveDefaultEmployeeRoleId,
    resolveEmployeeStoredPayType,
    resolveRole,
    resolveStatus,
  })
);

app.use(
  createEmployeeRouter({
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
    select: { id: true, assignments: true },
  });
  let boardCards = await loadAssignmentCardsForOrg({ orgId: organization.id });
  let assignmentDisplayRefs: AssignmentDisplayReferenceMaps | null = null;
  if (boardState) {
    const repairedBoardState = await safelyRepairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards: boardCards,
      assignments: boardState.assignments,
      context: "GET /assignment-plans",
    });
    assignmentDisplayRefs = repairedBoardState.refs;
    if (repairedBoardState.changed) {
      const nextCards = repairedBoardState.cards;
      const nextAssignments = repairedBoardState.assignments;
      const updatedBoardState = await prisma.$transaction(async (tx) => {
        await syncAssignmentCardsForOrg({
          orgId: organization.id,
          cards: nextCards,
          db: tx,
        });
        return tx.assignmentBoardState.update({
          where: { id: boardState!.id },
          data: {
            assignments: nextAssignments,
          },
          select: { id: true, assignments: true },
        });
      });
      boardState = updatedBoardState;
      boardCards = nextCards;
    } else {
      boardState = {
        ...boardState,
        assignments: repairedBoardState.assignments,
      };
      boardCards = repairedBoardState.cards;
    }
  }
  const activeExternalIds = resolveAssignmentPlanExternalIds(boardState?.assignments);
  const hasBoardAssignments = Array.isArray(boardState?.assignments);
  if (hasBoardAssignments && activeExternalIds.length === 0) {
    return res.json([]);
  }

  const assignmentPlanLineFilter: Prisma.AssignmentPlanWhereInput["lineId"] =
    lineIds.length === 1 ? lineIds[0]! : { in: lineIds };
  let plans = await findAssignmentPlansWithSelectFallback({
    where: {
      orgId: organization.id,
      lineId: assignmentPlanLineFilter,
      ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
    context: "GET /assignment-plans",
  });
  if (hasBoardAssignments && activeExternalIds.length > 0) {
    const existingExternalIdSet = new Set(
      ensureArray(plans)
        .map((plan) => resolveOptionalString(plan?.externalId, null))
        .filter((value): value is string => Boolean(value))
    );
    const lineIdSet = new Set(lineIds);
    const missingPlanSeedAssignments = normalizeStateAssignments(
      boardState?.assignments
    ).filter((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId || existingExternalIdSet.has(externalId)) return false;
      const lineIdNum = toPositiveIntOrNull(assignment?.lineId);
      if (!lineIdNum || !lineIdSet.has(lineIdNum)) return false;
      return true;
    });
    console.log(
      `[assignment-plans] board/db sync check: org=${organization.id} boardIds=${activeExternalIds.length} dbIds=${existingExternalIdSet.size} missing=${missingPlanSeedAssignments.length} missingIds=${missingPlanSeedAssignments
        .map((assignment) => resolveAssignmentExternalId(assignment))
        .filter((value): value is string => Boolean(value))
        .slice(0, 10)
        .join(",")}`
    );
    if (missingPlanSeedAssignments.length > 0) {
      const normalizedMissingRowsFallback = normalizeAssignmentPlanPayload(
        missingPlanSeedAssignments,
        lineIdSet
      );
      try {
        const normalizedMissingRows = await syncAssignmentPlanColorRefs(
          organization.id,
          normalizeAssignmentPlanPayload(missingPlanSeedAssignments, lineIdSet)
        );
        if (normalizedMissingRows.length > 0) {
          await prisma.assignmentPlan.createMany({
            data: normalizedMissingRows.map((item: any) => ({
              orgId: organization.id,
              externalId: item.externalId,
              ...toAssignmentPlanWriteData(item),
            })) as Prisma.AssignmentPlanCreateManyInput[],
            skipDuplicates: true,
          });
          plans = await findAssignmentPlansWithSelectFallback({
            where: {
              orgId: organization.id,
              lineId: assignmentPlanLineFilter,
              ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
            },
            orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
            selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
            context: "GET /assignment-plans",
          });
        }
      } catch (error) {
        const errCode = (error as any)?.code || "unknown";
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[assignment-plans] backfill FAILED: org=${organization.id} code=${errCode} message=${String(
            message
          ).slice(0, 200)}`
        );
        if (normalizedMissingRowsFallback.length > 0) {
          const existingAfterFailure = new Set(
            ensureArray(plans)
              .map((plan) => resolveOptionalString(plan?.externalId, null))
              .filter((value): value is string => Boolean(value))
          );
          const syntheticRows = normalizedMissingRowsFallback
            .filter((item: any) => !existingAfterFailure.has(item.externalId))
            .map((item: any) => ({
              id: null,
              externalId: item.externalId,
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
              ctTotalSeconds: item.ctTotalSeconds ?? null,
              assignmentCtSnapshot: item.assignmentCtSnapshot ?? item.ctSnapshot ?? null,
              color: item.color ?? null,
              stripeColor: item.stripeColor ?? null,
              stTotalSeconds: item.stTotalSeconds ?? null,
              startIndex: item.startIndex ?? 0,
              endIndex: item.endIndex ?? 0,
              startDayOffsetPercent: item.startDayOffsetPercent ?? null,
              startDayPercent: item.startDayPercent ?? null,
              endDayPercent: item.endDayPercent ?? null,
              isCompleted: false,
              finalQuantity: null,
              completedAt: null,
              closedQty: null,
              closedAt: null,
              closedBy: null,
              closeMode: null,
              closeBasis: null,
              createdAt: null,
              updatedAt: new Date(),
            }));
          if (syntheticRows.length > 0) {
            plans = [...plans, ...syntheticRows];
            console.warn(
              `[assignment-plans] using synthetic fallback rows from board-state: org=${organization.id} count=${syntheticRows.length}`
            );
          }
        }
      }
    }
  }
  if (plans.length > 0 && plans.some(assignmentPlanNeedsDisplayRepair)) {
    const repairedPlans = await repairAssignmentPlanDisplayRows({
      orgId: organization.id,
      plans,
      refs: assignmentDisplayRefs,
    });
    plans = repairedPlans.plans;
  }

  const cardById = boardCards.reduce((map, card) => {
    const key = resolveOptionalString(card?.id, null);
    if (!key || map.has(key)) return map;
    map.set(key, card);
    return map;
  }, new Map<string, any>());
  const stateByExternalId = normalizeStateAssignments(boardState?.assignments).reduce(
    (map, assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId || map.has(externalId)) return map;
      map.set(externalId, assignment);
      return map;
    },
    new Map<string, any>()
  );

  res.json(
    plans.map((plan) => {
      const cardId =
        resolveOptionalString(plan.cardId, null) ??
        resolveOptionalString(plan.originOrderId, null) ??
        null;
      const stateAssignment =
        stateByExternalId.get(resolveOptionalString(plan.externalId, null) || "") || null;
      const matchedCard = cardId ? cardById.get(cardId) ?? null : null;
      const startDateKey =
        normalizeDateKey(stateAssignment?.startDateKey) ||
        normalizeDateKey(resolveAssignmentStartDateKey(stateAssignment));
      const endDateKey =
        normalizeDateKey(stateAssignment?.endDateKey) ||
        (startDateKey
          ? shiftDateKeyByDaysForAssignmentSchedule(
              startDateKey,
              Math.max(0, toSignedInt(plan.endIndex, plan.startIndex) - toSignedInt(plan.startIndex, 0))
            )
          : null);
      const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
      const closedQty = resolveAssignmentPlanClosedQty(plan);
      const completedAt = resolveAssignmentPlanClosedAt(plan);
      const isCompleted = plan?.isCompleted === true;
      const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
      const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
      const closeMode =
        resolveOptionalString(plan?.closeMode, null) ??
        resolveAssignmentPlanCloseMode({
          closedQty,
          targetQty: toOptionalNonNegativeInt(plan?.quantity, null),
        });
      const closeBasis = resolveAssignmentPlanCloseBasis(plan);
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
        ctTotalSeconds: resolveAssignmentCtTotalSeconds(plan),
        assignmentCtSnapshot: resolveNormalizedAssignmentCtSnapshot(plan),
        ctUpdatedBy:
          resolveNormalizedAssignmentCtSnapshot(plan)?.updatedBy ?? "",
        ctUpdatedAt:
          resolveNormalizedAssignmentCtSnapshot(plan)?.updatedAt ?? null,
        startIndex: plan.startIndex,
        endIndex: plan.endIndex,
        startDateKey,
        endDateKey,
        isCompleted,
        finalQuantity,
        qcPassedTotal,
        latestQcDate,
        closedQty,
        completedAt,
        closedAt: completedAt,
        closedBy: resolveOptionalString(plan?.closedBy, null),
        closeMode,
        closeBasis,
      };
    })
  );
});

const ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE = "UNAVAILABLE";
const ASSIGNMENT_FORECAST_BASIS_WORKLOG_RATIO = "WORKLOG_RATIO";
const ASSIGNMENT_CONFIDENCE_UNAVAILABLE = "UNAVAILABLE";
const ASSIGNMENT_CONFIDENCE_LOW = "LOW";
const ASSIGNMENT_CONFIDENCE_MEDIUM = "MEDIUM";
const ASSIGNMENT_CONFIDENCE_HIGH = "HIGH";
const ASSIGNMENT_STATUS_IN_PROGRESS = "IN_PROGRESS";
const ASSIGNMENT_STATUS_READY_TO_COMPLETE = "READY_TO_COMPLETE";
const ASSIGNMENT_STATUS_PRODUCTION_COMPLETED = "PRODUCTION_COMPLETED";

type AssignmentPlanWorkStats = {
  processTotalsByKey: Map<string, number>;
  dailyProcessTotalsByDate: Map<string, Map<string, number>>;
  firstWorkDate: string | null;
  lastWorkDate: string | null;
  hasRangeCoverage: boolean;
};

const toDateValueFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): Date | null => {
  const utcDate = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!utcDate) return null;
  return new Date(utcDate.getTime());
};

const resolveAssignmentPlanRequiredProcessGroups = (plan: any): string[][] => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const processRows = ensureArray(snapshot?.processes);
  if (processRows.length === 0) return [];

  const groups = processRows
    .map((process) => {
      const candidates: string[] = [];
      const processId = toPositiveIntOrNull(process?.processId ?? process?.id);
      if (processId) candidates.push(`id:${processId}`);
      const processCode = normalizeProcessCodeKey(process?.processCode ?? process?.code);
      if (processCode) candidates.push(`code:${processCode}`);
      return Array.from(new Set(candidates));
    })
    .filter((group) => group.length > 0);

  return groups;
};

const resolveAssignmentPlanStyleMatchKeys = (plan: any): string[] => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const candidates = [
    parseAssignmentCardIdentity(plan?.cardId)?.styleId,
    parseAssignmentCardIdentity(plan?.originOrderId)?.styleId,
    (snapshot as any)?.styleId,
    plan?.label,
  ];
  return Array.from(
    new Set(
      candidates
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeComparableText(value))
        .filter(Boolean)
    )
  );
};

const resolveAssignmentPlanStyleQueryValues = (plan: any): string[] => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  return Array.from(
    new Set(
      [
        parseAssignmentCardIdentity(plan?.cardId)?.styleId,
        parseAssignmentCardIdentity(plan?.originOrderId)?.styleId,
        (snapshot as any)?.styleId,
        plan?.label,
      ]
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );
};

const resolveWorkRecordStyleMatchKeysForAssignmentSchedule = (record: any): string[] =>
  Array.from(
    new Set(
      [record?.styleId, record?.styleName]
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeComparableText(value))
        .filter(Boolean)
    )
  );

const resolveWorkRecordOrderNoMatchKey = (record: any): string | null => {
  const orderNo = resolveOptionalString(record?.orderNo, null);
  return orderNo ? normalizeComparableText(orderNo) : null;
};

const resolveOrphanWorkRecordLineId = (record: any): number | null =>
  toPositiveIntOrNull(record?.lineId) ??
  resolveWorkLogLineMeta(record?.workLog?.records).lineId;

const doesAssignmentScheduleContainWorkDate = ({
  startDateKey,
  endDateKey,
  workDateKey,
}: {
  startDateKey: string | null;
  endDateKey: string | null;
  workDateKey: string | null;
}): boolean => {
  const normalizedWorkDateKey = normalizeDateKey(workDateKey);
  if (!normalizedWorkDateKey) return false;
  const normalizedStartDateKey = normalizeDateKey(startDateKey);
  const normalizedEndDateKey = normalizeDateKey(endDateKey);
  if (normalizedStartDateKey && normalizedWorkDateKey < normalizedStartDateKey) return false;
  if (normalizedEndDateKey && normalizedWorkDateKey > normalizedEndDateKey) return false;
  return Boolean(normalizedStartDateKey || normalizedEndDateKey);
};

const buildAssignmentPlanProgressMatchCandidates = ({
  plans,
  stateAssignmentsByExternalId,
}: {
  plans: any[];
  stateAssignmentsByExternalId: Map<string, any>;
}) =>
  ensureArray(plans)
    .map((plan) => {
      const planId = toPositiveIntOrNull(plan?.id);
      if (!planId) return null;
      const externalId = resolveOptionalString(plan?.externalId, null);
      const stateAssignment = externalId
        ? stateAssignmentsByExternalId.get(externalId) || null
        : null;
      const snapshotSchedule = resolveNormalizedAssignmentCtSnapshot(plan)?.schedule || null;
      const startDateKey =
        normalizeDateKey(stateAssignment?.startDateKey) ||
        normalizeDateKey(snapshotSchedule?.startDateKey) ||
        null;
      const endDateKey =
        normalizeDateKey(stateAssignment?.endDateKey) ||
        normalizeDateKey(snapshotSchedule?.endDateKey) ||
        null;
      return {
        planId,
        lineId: toPositiveIntOrNull(plan?.lineId),
        orderNoKey: resolveOptionalString(plan?.orderNo, null)
          ? normalizeComparableText(plan.orderNo)
          : null,
        styleKeys: resolveAssignmentPlanStyleMatchKeys(plan),
        processKeys: new Set(resolveAssignmentPlanRequiredProcessGroups(plan).flat()),
        startDateKey,
        endDateKey,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        planId: number;
        lineId: number | null;
        orderNoKey: string | null;
        styleKeys: string[];
        processKeys: Set<string>;
        startDateKey: string | null;
        endDateKey: string | null;
      } => Boolean(candidate && candidate.styleKeys.length > 0)
    );

const resolveOrphanWorkRecordAssignmentPlanMatch = ({
  record,
  candidates,
}: {
  record: any;
  candidates: Array<{
    planId: number;
    lineId: number | null;
    orderNoKey: string | null;
    styleKeys: string[];
    processKeys: Set<string>;
    startDateKey: string | null;
    endDateKey: string | null;
  }>;
}) => {
  const styleKeys = resolveWorkRecordStyleMatchKeysForAssignmentSchedule(record);
  if (styleKeys.length === 0) return null;

  let narrowed = candidates.filter((candidate) =>
    candidate.styleKeys.some((styleKey) => styleKeys.includes(styleKey))
  );
  if (narrowed.length === 0) return null;

  const orderNoKey = resolveWorkRecordOrderNoMatchKey(record);
  if (orderNoKey) {
    const orderMatched = narrowed.filter((candidate) => candidate.orderNoKey === orderNoKey);
    if (orderMatched.length > 0) narrowed = orderMatched;
  }

  const lineId = resolveOrphanWorkRecordLineId(record);
  if (lineId) {
    const lineMatched = narrowed.filter((candidate) => candidate.lineId === lineId);
    if (lineMatched.length > 0) narrowed = lineMatched;
  }

  const workDateKey =
    resolveWorkLogCoverageEndDate(record?.workLog, record?.workLog?.displayDate) ||
    normalizeDateKey(record?.workLog?.displayDate);
  if (workDateKey) {
    const dateMatched = narrowed.filter((candidate) =>
      doesAssignmentScheduleContainWorkDate({
        startDateKey: candidate.startDateKey,
        endDateKey: candidate.endDateKey,
        workDateKey,
      })
    );
    if (dateMatched.length > 0) narrowed = dateMatched;
  }

  const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
  if (processKey && processKey !== "unknown") {
    const processMatched = narrowed.filter(
      (candidate) =>
        candidate.processKeys.size === 0 || candidate.processKeys.has(processKey)
    );
    if (processMatched.length > 0) narrowed = processMatched;
  }

  return narrowed.length === 1 ? narrowed[0]! : null;
};

const loadAssignmentPlanProgressWorkRows = async ({
  orgId,
  plans,
  stateAssignmentsByExternalId,
  context,
}: {
  orgId: number;
  plans: any[];
  stateAssignmentsByExternalId: Map<string, any>;
  context: string;
}) => {
  const normalizedPlans = ensureArray(plans).filter(Boolean);
  const planIds = normalizedPlans
    .map((plan) => toPositiveIntOrNull(plan?.id))
    .filter((planId): planId is number => planId !== null);
  if (planIds.length === 0) return [];

  const selectWorkRows = async ({
    where,
    includeCoverage,
  }: {
    where: Prisma.WorkRecordWhereInput;
    includeCoverage: boolean;
  }) =>
    prisma.workRecord.findMany({
      where,
      select: {
        assignmentPlanId: true,
        orderNo: true,
        lineId: true,
        styleId: true,
        styleName: true,
        processId: true,
        processCode: true,
        quantity: true,
        workLog: {
          select: {
            displayDate: true,
            records: true,
            ...(includeCoverage
              ? {
                  coverageStartDate: true,
                  coverageEndDate: true,
                  entryMode: true,
                }
              : {}),
          },
        },
      },
    });

  let directRows: any[] = [];
  try {
    directRows = await selectWorkRows({
      where: {
        orgId,
        assignmentPlanId: { in: planIds },
      },
      includeCoverage: true,
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    directRows = await selectWorkRows({
      where: {
        orgId,
        assignmentPlanId: { in: planIds },
      },
      includeCoverage: false,
    });
    console.warn(
      `[assignment-plan-progress] orgId=${orgId} ${context}: missing work-log coverage columns; fallback work-record projection activated`
    );
  }

  const candidates = buildAssignmentPlanProgressMatchCandidates({
    plans: normalizedPlans,
    stateAssignmentsByExternalId,
  });
  if (candidates.length === 0) return directRows;

  const styleLabels = Array.from(
    new Set(
      normalizedPlans
        .flatMap((plan) => resolveAssignmentPlanStyleQueryValues(plan))
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (styleLabels.length === 0) return directRows;

  const datedCandidates = candidates.filter(
    (candidate) => candidate.startDateKey || candidate.endDateKey
  );
  const dateBounds =
    datedCandidates.length > 0
      ? datedCandidates.reduce(
          (range, candidate) => {
            const startDateKey = normalizeDateKey(candidate.startDateKey);
            const endDateKey = normalizeDateKey(candidate.endDateKey);
            return {
              minDateKey:
                startDateKey &&
                (!range.minDateKey || startDateKey < range.minDateKey)
                  ? startDateKey
                  : range.minDateKey,
              maxDateKey:
                endDateKey && (!range.maxDateKey || endDateKey > range.maxDateKey)
                  ? endDateKey
                  : range.maxDateKey,
            };
          },
          { minDateKey: null as string | null, maxDateKey: null as string | null }
        )
      : { minDateKey: null as string | null, maxDateKey: null as string | null };

  let orphanRows: any[] = [];
  try {
    orphanRows = await selectWorkRows({
      where: {
        orgId,
        assignmentPlanId: null,
        quantity: { gt: 0 },
        OR: [
          { styleId: { in: styleLabels } },
          { styleName: { in: styleLabels } },
        ],
        workLog: {
          ...(dateBounds.minDateKey && !dateBounds.maxDateKey
            ? { displayDate: { gte: dateBounds.minDateKey } }
            : {}),
          ...(!dateBounds.minDateKey && dateBounds.maxDateKey
            ? { displayDate: { lte: dateBounds.maxDateKey } }
            : {}),
          ...(dateBounds.minDateKey && dateBounds.maxDateKey
            ? {
                displayDate: {
                  gte: dateBounds.minDateKey,
                  lte: dateBounds.maxDateKey,
                },
              }
            : {}),
        },
      },
      includeCoverage: true,
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    orphanRows = await selectWorkRows({
      where: {
        orgId,
        assignmentPlanId: null,
        quantity: { gt: 0 },
        OR: [
          { styleId: { in: styleLabels } },
          { styleName: { in: styleLabels } },
        ],
        workLog: {
          ...(dateBounds.minDateKey && !dateBounds.maxDateKey
            ? { displayDate: { gte: dateBounds.minDateKey } }
            : {}),
          ...(!dateBounds.minDateKey && dateBounds.maxDateKey
            ? { displayDate: { lte: dateBounds.maxDateKey } }
            : {}),
          ...(dateBounds.minDateKey && dateBounds.maxDateKey
            ? {
                displayDate: {
                  gte: dateBounds.minDateKey,
                  lte: dateBounds.maxDateKey,
                },
              }
            : {}),
        },
      },
      includeCoverage: false,
    });
  }

  let inferredCount = 0;
  let unmatchedCount = 0;
  const inferredRows = orphanRows.reduce((rows, record) => {
    const matchedCandidate = resolveOrphanWorkRecordAssignmentPlanMatch({
      record,
      candidates,
    });
    if (!matchedCandidate) {
      unmatchedCount += 1;
      return rows;
    }
    inferredCount += 1;
    rows.push({
      ...record,
      assignmentPlanId: matchedCandidate.planId,
      _inferredAssignmentPlanId: matchedCandidate.planId,
    });
    return rows;
  }, [] as any[]);

  if (inferredCount > 0 || unmatchedCount > 0) {
    console.info(
      `[assignment-plan-progress] orgId=${orgId} ${context}: directRows=${directRows.length} inferredRows=${inferredCount} unmatchedOrphans=${unmatchedCount}`
    );
  }

  return [...directRows, ...inferredRows];
};

const resolveProducedQtyFromProcessKeyTotals = ({
  processTotalsByKey,
  processKeyGroups = [],
}: {
  processTotalsByKey: Map<string, number>;
  processKeyGroups?: string[][];
}): number => {
  const normalizedGroups = ensureArray(processKeyGroups).filter(
    (group): group is string[] => Array.isArray(group) && group.length > 0
  );
  const processTotals =
    normalizedGroups.length > 0
      ? normalizedGroups.map((group) =>
          group.reduce(
            (max, key) => Math.max(max, Math.max(0, Math.round(Number(processTotalsByKey.get(key) || 0)))),
            0
          )
        )
      : Array.from(processTotalsByKey.values()).map((value) =>
          Math.max(0, Math.round(Number(value) || 0))
        );

  return resolveAssignmentProducedQuantityFromProcessTotals({
    processTotals,
    baselineQuantity: null,
  });
};

const resolveWorklogRatioConfidence = ({
  producedQty,
  planQty,
  elapsedDays,
  isProxy = false,
}: {
  producedQty: number;
  planQty: number | null;
  elapsedDays: number | null;
  isProxy?: boolean;
}): "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE" => {
  const normalizedProducedQty = Math.max(0, Math.round(Number(producedQty) || 0));
  if (normalizedProducedQty <= 0) return ASSIGNMENT_CONFIDENCE_UNAVAILABLE;

  const normalizedPlanQty =
    planQty != null && Number.isFinite(planQty) && planQty > 0
      ? Math.round(planQty)
      : null;
  const normalizedElapsedDays =
    elapsedDays != null && Number.isFinite(elapsedDays) && elapsedDays > 0
      ? Math.round(elapsedDays)
      : 1;

  let confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE" =
    ASSIGNMENT_CONFIDENCE_LOW;
  const producedRatio =
    normalizedPlanQty && normalizedPlanQty > 0
      ? normalizedProducedQty / normalizedPlanQty
      : null;

  if (producedRatio != null && producedRatio < 0.1) {
    confidence = ASSIGNMENT_CONFIDENCE_LOW;
  } else if (normalizedElapsedDays >= 7) {
    confidence =
      producedRatio != null && producedRatio >= 0.3
        ? ASSIGNMENT_CONFIDENCE_HIGH
        : ASSIGNMENT_CONFIDENCE_MEDIUM;
  } else if (normalizedElapsedDays >= 3) {
    confidence = ASSIGNMENT_CONFIDENCE_MEDIUM;
  } else {
    confidence = ASSIGNMENT_CONFIDENCE_LOW;
  }

  if (isProxy) {
    return ASSIGNMENT_CONFIDENCE_LOW;
  }
  return confidence;
};

const resolveNextWorkingDateKeyForAssignmentSchedule = ({
  fromDateKey,
  holidaySet,
}: {
  fromDateKey: string;
  holidaySet: Set<string>;
}): string => {
  let cursor = normalizeDateKey(fromDateKey) || fromDateKey;
  for (let i = 0; i < 366 * 3; i += 1) {
    const shifted = shiftDateKeyByDaysForAssignmentSchedule(cursor, 1);
    if (!shifted) return cursor;
    const date = toUtcDateFromDateKeyForAssignmentSchedule(shifted);
    if (!date) {
      cursor = shifted;
      continue;
    }
    const isSunday = date.getUTCDay() === 0;
    if (!isSunday && !holidaySet.has(shifted)) return shifted;
    cursor = shifted;
  }
  return cursor;
};

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

  const [plans, boardState] = await Promise.all([
    findAssignmentPlansWithSelectFallback({
      where: {
        orgId,
        ...(normalizedExternalIds.length > 0
          ? { externalId: { in: normalizedExternalIds } }
          : {}),
      },
      orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
      selectAttempts: [
        ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION,
        ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
        ASSIGNMENT_PLAN_SELECT_CORE,
        ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
        ASSIGNMENT_PLAN_SELECT_LEGACY,
      ],
      context: "buildAssignmentPlanProgressRows",
    }),
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { assignments: true },
    }),
  ]);
  if (plans.length === 0) return [];

  const stateAssignmentsByExternalId = normalizeStateAssignments(
    boardState?.assignments
  ).reduce((map, row) => {
    const externalId = resolveAssignmentExternalId(row);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, row);
    return map;
  }, new Map<string, any>());

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

  const holidayModel = (prisma as any).organizationHoliday;
  const holidayRows =
    holidayModel && typeof holidayModel.findMany === "function"
      ? await holidayModel
          .findMany({
            where: { orgId },
            select: { holidayDate: true },
          })
          .catch(() => [])
      : [];
  const holidaySet = new Set<string>(
    ensureArray(holidayRows)
      .map((row) => normalizeDateKey(row?.holidayDate))
      .filter((value): value is string => Boolean(value))
  );

  const workRows = await loadAssignmentPlanProgressWorkRows({
    orgId,
    plans,
    stateAssignmentsByExternalId,
    context: "buildAssignmentPlanProgressRows",
  });

  const statsByPlanId = new Map<number, AssignmentPlanWorkStats>();
  const sumByPlanId = new Map<number, number>();
  const getStats = (planId: number): AssignmentPlanWorkStats => {
    const existing = statsByPlanId.get(planId);
    if (existing) return existing;
    const next: AssignmentPlanWorkStats = {
      processTotalsByKey: new Map<string, number>(),
      dailyProcessTotalsByDate: new Map<string, Map<string, number>>(),
      firstWorkDate: null,
      lastWorkDate: null,
      hasRangeCoverage: false,
    };
    statsByPlanId.set(planId, next);
    return next;
  };

  workRows.forEach((record) => {
    const planId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (!planId) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;
    sumByPlanId.set(planId, (sumByPlanId.get(planId) || 0) + quantity);

    const stats = getStats(planId);
    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    stats.processTotalsByKey.set(
      processKey,
      (stats.processTotalsByKey.get(processKey) || 0) + quantity
    );

    const coverageStartDate = resolveWorkLogCoverageStartDate(
      record?.workLog,
      record?.workLog?.displayDate
    );
    const coverageEndDate = resolveWorkLogCoverageEndDate(
      record?.workLog,
      record?.workLog?.displayDate
    );
    if (coverageStartDate && (!stats.firstWorkDate || coverageStartDate < stats.firstWorkDate)) {
      stats.firstWorkDate = coverageStartDate;
    }
    if (coverageEndDate && (!stats.lastWorkDate || coverageEndDate > stats.lastWorkDate)) {
      stats.lastWorkDate = coverageEndDate;
    }
    if (
      coverageStartDate &&
      coverageEndDate &&
      coverageStartDate !== coverageEndDate
    ) {
      stats.hasRangeCoverage = true;
    }
    const entryMode =
      resolveOptionalString(record?.workLog?.entryMode, "")?.toLowerCase?.() || "";
    if (entryMode === "period_summary") {
      stats.hasRangeCoverage = true;
    }

    const workDateKey = normalizeDateKey(record?.workLog?.displayDate) || coverageEndDate;
    if (!workDateKey) return;
    const byDate =
      stats.dailyProcessTotalsByDate.get(workDateKey) || new Map<string, number>();
    byDate.set(processKey, (byDate.get(processKey) || 0) + quantity);
    stats.dailyProcessTotalsByDate.set(workDateKey, byDate);
  });

  const rows = plans.map((plan) => {
    const planId = Number(plan.id);
    const stats = statsByPlanId.get(planId) || {
      processTotalsByKey: new Map<string, number>(),
      dailyProcessTotalsByDate: new Map<string, Map<string, number>>(),
      firstWorkDate: null,
      lastWorkDate: null,
      hasRangeCoverage: false,
    };
    const requiredProcessGroups = resolveAssignmentPlanRequiredProcessGroups(plan);
    const plannedQuantity = toOptionalNonNegativeInt(plan.quantity, null);
    const baselineQuantityRaw =
      plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
    const ctSnapshotRaw = resolveAssignmentCtSnapshotInput(plan);
    const ctSnapshot = (() => {
      if (!ctSnapshotRaw) return null;
      if (typeof ctSnapshotRaw === "string") {
        try {
          const parsed = JSON.parse(ctSnapshotRaw);
          return normalizeAssignmentCtSnapshot(parsed);
        } catch {
          return null;
        }
      }
      return normalizeAssignmentCtSnapshot(ctSnapshotRaw);
    })();
    const processCountFromSnapshot =
      Array.isArray(ctSnapshot?.processes) && ctSnapshot.processes.length > 0
        ? ctSnapshot.processes.length
        : null;
    const processCountFromRecords =
      stats.processTotalsByKey.size > 0 ? stats.processTotalsByKey.size : null;
    const processCount = processCountFromSnapshot ?? processCountFromRecords;
    const totalExpected =
      baselineQuantityRaw != null && processCount != null && processCount > 0
        ? baselineQuantityRaw * processCount
        : null;
    const totalDone = sumByPlanId.get(planId) || 0;
    const isMarkedCompleted = plan?.isCompleted === true;
    const producedQuantity = resolveProducedQtyFromProcessKeyTotals({
      processTotalsByKey: stats.processTotalsByKey,
      processKeyGroups: requiredProcessGroups,
    });
    const remainingQty =
      baselineQuantityRaw == null
        ? null
        : Math.max(0, baselineQuantityRaw - producedQuantity);
    const overflowQuantity =
      baselineQuantityRaw == null ? 0 : Math.max(0, producedQuantity - baselineQuantityRaw);
    const progressPercent = isMarkedCompleted
      ? 100
      : totalExpected != null && totalExpected > 0
        ? Math.min(100, Math.round((totalDone / totalExpected) * 100))
        : null;

    const firstWorkDate = stats.firstWorkDate;
    const lastWorkDate = stats.lastWorkDate;
    const elapsedDays =
      firstWorkDate && lastWorkDate
        ? countDateRangeDaysInclusiveForAssignmentSchedule(firstWorkDate, lastWorkDate)
        : null;

    const canForecast =
      producedQuantity > 0 &&
      remainingQty != null &&
      firstWorkDate != null &&
      lastWorkDate != null &&
      elapsedDays != null &&
      elapsedDays > 0;
    const forecastDays =
      canForecast && remainingQty != null
        ? Math.max(
            0,
            Math.ceil((elapsedDays! * Math.max(0, remainingQty)) / Math.max(1, producedQuantity))
          )
        : null;
    const forecastCompletedDateKey =
      canForecast && forecastDays != null
        ? shiftDateKeyByDaysForAssignmentSchedule(lastWorkDate, forecastDays)
        : null;
    const forecastBasis = canForecast
      ? ASSIGNMENT_FORECAST_BASIS_WORKLOG_RATIO
      : ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE;

    let actualProducedCompletedDateKey: string | null = null;
    let actualProducedCompletedIsProxy = false;
    if (
      baselineQuantityRaw != null &&
      baselineQuantityRaw > 0 &&
      producedQuantity >= baselineQuantityRaw
    ) {
      if (stats.hasRangeCoverage) {
        actualProducedCompletedDateKey = lastWorkDate;
        actualProducedCompletedIsProxy = Boolean(actualProducedCompletedDateKey);
      } else {
        const cumulativeProcessTotalsByKey = new Map<string, number>();
        const sortedDateKeys = Array.from(stats.dailyProcessTotalsByDate.keys()).sort((a, b) =>
          a.localeCompare(b)
        );
        for (const dateKey of sortedDateKeys) {
          const dailyTotals = stats.dailyProcessTotalsByDate.get(dateKey);
          if (!dailyTotals) continue;
          dailyTotals.forEach((value, processKey) => {
            cumulativeProcessTotalsByKey.set(
              processKey,
              (cumulativeProcessTotalsByKey.get(processKey) || 0) +
                Math.max(0, Math.round(Number(value) || 0))
            );
          });
          const producedAtDate = resolveProducedQtyFromProcessKeyTotals({
            processTotalsByKey: cumulativeProcessTotalsByKey,
            processKeyGroups: requiredProcessGroups,
          });
          if (producedAtDate >= baselineQuantityRaw) {
            actualProducedCompletedDateKey = dateKey;
            break;
          }
        }
        if (!actualProducedCompletedDateKey) {
          actualProducedCompletedDateKey = lastWorkDate;
          actualProducedCompletedIsProxy = Boolean(actualProducedCompletedDateKey);
        }
      }
    }

    const persistedProductionCompletedAt =
      toOptionalDateValue(plan?.productionCompletedAt, null) ??
      resolveAssignmentPlanClosedAtValue(plan);
    const productionCompletedAtIso =
      toIsoDateStringOrNull(persistedProductionCompletedAt?.toISOString?.() || null) ||
      null;
    const productionCompletedDateKey = persistedProductionCompletedAt
      ? toDateKeyInTimeZone(persistedProductionCompletedAt, BUSINESS_TIME_ZONE)
      : null;

    const scheduleStatus: "IN_PROGRESS" | "READY_TO_COMPLETE" | "PRODUCTION_COMPLETED" =
      productionCompletedDateKey
        ? ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
        : baselineQuantityRaw != null &&
            baselineQuantityRaw > 0 &&
            producedQuantity >= baselineQuantityRaw
          ? ASSIGNMENT_STATUS_READY_TO_COMPLETE
          : ASSIGNMENT_STATUS_IN_PROGRESS;

    const stateAssignment = stateAssignmentsByExternalId.get(plan.externalId) || null;
    const snapshotSchedule = resolveNormalizedAssignmentCtSnapshot(plan)?.schedule || null;
    const factualStartDateKey =
      normalizeDateKey(stateAssignment?.startDateKey) ||
      normalizeDateKey(snapshotSchedule?.startDateKey) ||
      null;
    const durationDays = Math.max(
      1,
      Math.max(
        0,
        toSignedInt(plan?.endIndex, toSignedInt(plan?.startIndex, 0)) -
          toSignedInt(plan?.startIndex, 0)
      ) + 1
    );
    const originalEndDateKey =
      normalizeDateKey(stateAssignment?.endDateKey) ||
      normalizeDateKey(snapshotSchedule?.endDateKey) ||
      null;

    const candidateEndDateKey =
      productionCompletedDateKey ||
      actualProducedCompletedDateKey ||
      forecastCompletedDateKey ||
      originalEndDateKey;
    const renderEndDateKey =
      scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
        ? candidateEndDateKey
        : originalEndDateKey;

    const confidence = resolveWorklogRatioConfidence({
      producedQty: producedQuantity,
      planQty: baselineQuantityRaw,
      elapsedDays,
      isProxy: actualProducedCompletedIsProxy,
    });

    const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
    const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
    const finalQuantity = toOptionalNonNegativeInt(plan.finalQuantity, null);
    const closedQty = resolveAssignmentPlanClosedQty(plan);
    const closeMode =
      resolveOptionalString(plan?.closeMode, null) ??
      resolveAssignmentPlanCloseMode({
        closedQty,
        targetQty: plannedQuantity,
      });
    const closeBasis = resolveAssignmentPlanCloseBasis(plan);

    return {
      id: plan.externalId,
      dbId: planId,
      lineId: String(plan.lineId),
      lineName: lineNameById.get(Number(plan.lineId)) || "",
      orderNo: resolveOptionalString(plan.orderNo, "") || "",
      customer: resolveOptionalString(plan.customer, "") || "",
      label: resolveOptionalString(plan.label, "") || "",
      colorId: toPositiveIntOrNull(plan.colorId),
      colorName: resolveAssignmentPlanColorName(plan),
      plannedQuantity,
      finalQuantity,
      qcPassedTotal,
      latestQcDate,
      baselineQuantity: baselineQuantityRaw,
      producedQuantity,
      producedQty: producedQuantity,
      remainingQty,
      overflowQuantity,
      isOverflow: overflowQuantity > 0,
      progressPercent,
      operationalProgressPercent: progressPercent,
      officialProgressPercent:
        scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 100 : null,
      isCompleted: scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED,
      completedAt: productionCompletedAtIso,
      productionCompletedAt: productionCompletedAtIso,
      actualProducedCompletedAt: actualProducedCompletedDateKey,
      qcCompletedAt: null,
      closedQty,
      productionConfirmedQty: closedQty,
      closedAt: productionCompletedAtIso,
      closedBy: resolveOptionalString(plan?.closedBy, null),
      closeMode,
      closeBasis,
      firstWorkDate,
      lastWorkDate,
      elapsedDays,
      forecastCompletedAt: forecastCompletedDateKey,
      forecastBasis,
      confidence,
      renderStartDate: factualStartDateKey,
      candidateEndDate: candidateEndDateKey,
      renderEndDate: renderEndDateKey,
      scheduleStatus,
      isQcDone: Boolean(latestQcDate),
      _factualStartDateKey: factualStartDateKey,
      _durationDays: durationDays,
      _sortStartIndex: toSignedInt(plan?.startIndex, 0),
      _sortEndIndex: Math.max(
        toSignedInt(plan?.startIndex, 0),
        toSignedInt(plan?.endIndex, toSignedInt(plan?.startIndex, 0))
      ),
      _originalEndDateKey: originalEndDateKey,
    };
  });

  const rowsByLine = rows.reduce((map, row) => {
    const lineId = String(row.lineId || "");
    if (!lineId) return map;
    const bucket = map.get(lineId) || [];
    bucket.push(row);
    map.set(lineId, bucket);
    return map;
  }, new Map<string, any[]>());

  rowsByLine.forEach((lineRows) => {
    lineRows.sort((left, right) => {
      const leftCompleted =
        String(left?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 0 : 1;
      const rightCompleted =
        String(right?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 0 : 1;
      if (leftCompleted !== rightCompleted) {
        return leftCompleted - rightCompleted;
      }
      if (left._sortStartIndex !== right._sortStartIndex) {
        return left._sortStartIndex - right._sortStartIndex;
      }
      if (left._sortEndIndex !== right._sortEndIndex) {
        return left._sortEndIndex - right._sortEndIndex;
      }
      return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
    });

    let cursorEndDateKey: string | null = null;
    lineRows.forEach((row) => {
      const isCompleted =
        String(row?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED;
      // Only compute render coords for completed cards.
      // Incomplete cards already have renderStartDate/renderEndDate set from planned positions
      // in the main loop above; overwriting them here causes plan drift on every fetch.
      if (!isCompleted) return;
      const plannedDurationDays = Math.max(1, toSignedInt(row?._durationDays, 1));
      const baselineQuantity = toOptionalNonNegativeInt(row?.baselineQuantity, null);
      const producedQuantity = Math.max(0, Math.round(Number(row?.producedQuantity ?? 0) || 0));
      const elapsedDays = Math.max(0, toSignedInt(row?.elapsedDays, 0));
      let durationDays = plannedDurationDays;
      if (!isCompleted) {
        // For in-progress cards, derive a deterministic forecast duration from
        // current work-log velocity. This re-computes from full history each time,
        // so add/delete edits do not leave cumulative schedule drift behind.
        if (
          baselineQuantity != null &&
          baselineQuantity > 0 &&
          producedQuantity > 0 &&
          elapsedDays > 0
        ) {
          const forecastTotalDays = Math.max(
            1,
            Math.ceil((elapsedDays * baselineQuantity) / Math.max(1, producedQuantity))
          );
          durationDays = Math.max(plannedDurationDays, forecastTotalDays);
        }
      }
      const candidate =
        normalizeDateKey(row?.candidateEndDate) ||
        normalizeDateKey(row?._originalEndDateKey) ||
        normalizeDateKey(row?.lastWorkDate) ||
        normalizeDateKey(row?.firstWorkDate) ||
        null;

      let renderStartDateKey: string | null = null;
      if (isCompleted) {
        renderStartDateKey = normalizeDateKey(row?._factualStartDateKey);
        if (!renderStartDateKey && candidate) {
          renderStartDateKey =
            shiftDateKeyByDaysForAssignmentSchedule(candidate, -(durationDays - 1)) || candidate;
        }
      } else if (cursorEndDateKey) {
        renderStartDateKey = resolveNextWorkingDateKeyForAssignmentSchedule({
          fromDateKey: cursorEndDateKey,
          holidaySet,
        });
      } else {
        renderStartDateKey =
          normalizeDateKey(row?._factualStartDateKey) || normalizeDateKey(row?.candidateEndDate);
      }

      if (!renderStartDateKey) return;

      let renderEndDateKey = isCompleted
        ? normalizeDateKey(row?.candidateEndDate) || renderStartDateKey
        : shiftDateKeyByDaysForAssignmentSchedule(renderStartDateKey, durationDays - 1) ||
          renderStartDateKey;
      if (!isCompleted && candidate && candidate > renderEndDateKey) {
        renderEndDateKey = candidate;
      }

      row.renderStartDate = renderStartDateKey;
      row.renderEndDate = renderEndDateKey;
      cursorEndDateKey = renderEndDateKey;
    });
  });

  return rows.map((row) => {
    const {
      _factualStartDateKey: _factualStartDateKey,
      _durationDays: _durationDays,
      _sortStartIndex: _sortStartIndex,
      _sortEndIndex: _sortEndIndex,
      _originalEndDateKey: _originalEndDateKey,
      ...rest
    } = row;
    return rest;
  });
};

const persistAssignmentPlanProgressSnapshot = async ({
  orgId,
  assignmentPlanIds = [],
  externalIds = [],
}: {
  orgId: number;
  assignmentPlanIds?: any;
  externalIds?: any;
}): Promise<{ updatedPlanCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(assignmentPlanIds);
  const normalizedExternalIds = Array.from(
    new Set(
      ensureArray(externalIds)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (normalizedPlanIds.length === 0 && normalizedExternalIds.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const targetPlans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      OR: [
        ...(normalizedPlanIds.length > 0 ? [{ id: { in: normalizedPlanIds } }] : []),
        ...(normalizedExternalIds.length > 0
          ? [{ externalId: { in: normalizedExternalIds } }]
          : []),
      ],
    },
    select: { id: true, externalId: true },
  });
  if (targetPlans.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const targetExternalIds = Array.from(
    new Set(
      targetPlans
        .map((plan) => resolveOptionalString(plan?.externalId, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (targetExternalIds.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const progressRows = await buildAssignmentPlanProgressRows(orgId, targetExternalIds);
  const rowByExternalId = progressRows.reduce((map, row) => {
    const externalId = resolveOptionalString(row?.id, null);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, row);
    return map;
  }, new Map<string, any>());

  const updates = targetPlans
    .map((plan) => {
      const row = rowByExternalId.get(plan.externalId);
      if (!row) return null;
      const productionCompletedAt = toOptionalDateValue(
        row?.productionCompletedAt,
        null
      );
      const actualProducedCompletedAt = toDateValueFromDateKeyForAssignmentSchedule(
        row?.actualProducedCompletedAt
      );
      const candidateEndDate = toDateValueFromDateKeyForAssignmentSchedule(
        row?.candidateEndDate
      );
      const renderEndDate = toDateValueFromDateKeyForAssignmentSchedule(
        row?.renderEndDate
      );
      const forecastCompletedAt = toDateValueFromDateKeyForAssignmentSchedule(
        row?.forecastCompletedAt
      );

      return {
        id: plan.id,
        data: {
          productionCompletedAt,
          actualProducedCompletedAt,
          candidateEndDate,
          renderEndDate,
          forecastCompletedAt,
          forecastBasis: resolveOptionalString(row?.forecastBasis, null),
          confidence: resolveOptionalString(row?.confidence, null),
          scheduleStatus: resolveOptionalString(row?.scheduleStatus, null),
          updatedAt: new Date(),
        } as Prisma.AssignmentPlanUncheckedUpdateInput,
      };
    })
    .filter((row): row is { id: number; data: Prisma.AssignmentPlanUncheckedUpdateInput } =>
      Boolean(row)
    );

  if (updates.length === 0) {
    return { updatedPlanCount: 0 };
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.assignmentPlan.update({
        where: { id: update.id },
        data: update.data,
      })
    )
  );

  return { updatedPlanCount: updates.length };
};

const resolveAssignmentPlanProducedQuantity = async ({
  orgId,
  planId,
  baselineQuantity = null,
}: {
  orgId: number;
  planId: number;
  baselineQuantity?: number | null;
}): Promise<number> => {
  const normalizedPlanId = toPositiveIntOrNull(planId);
  if (normalizedPlanId === null) return 0;

  const [plans, boardState] = await Promise.all([
    findAssignmentPlansWithSelectFallback({
      where: { orgId, id: normalizedPlanId },
      orderBy: [{ id: "asc" }],
      selectAttempts: [
        ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION,
        ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
        ASSIGNMENT_PLAN_SELECT_CORE,
        ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
        ASSIGNMENT_PLAN_SELECT_LEGACY,
      ],
      context: "resolveAssignmentPlanProducedQuantity",
    }),
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { assignments: true },
    }),
  ]);
  const plan = ensureArray(plans)[0];
  if (!plan) return 0;

  const stateAssignmentsByExternalId = normalizeStateAssignments(
    boardState?.assignments
  ).reduce((map, row) => {
    const externalId = resolveAssignmentExternalId(row);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, row);
    return map;
  }, new Map<string, any>());

  const workRows = await loadAssignmentPlanProgressWorkRows({
    orgId,
    plans: [plan],
    stateAssignmentsByExternalId,
    context: "resolveAssignmentPlanProducedQuantity",
  });
  const processTotalsByKey = new Map<string, number>();
  workRows.forEach((record) => {
    const matchedPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (matchedPlanId !== normalizedPlanId) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;
    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    processTotalsByKey.set(
      processKey,
      (processTotalsByKey.get(processKey) || 0) + quantity
    );
  });

  const processKeyGroups = resolveAssignmentPlanRequiredProcessGroups(plan);
  return resolveProducedQtyFromProcessKeyTotals({
    processTotalsByKey,
    processKeyGroups,
  });
};

const buildAssignmentPlanCloseResponse = (plan: any) => {
  const quantity = toOptionalNonNegativeInt(plan?.quantity, null);
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
  const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const completedAt = resolveAssignmentPlanClosedAt(plan);
  const productionCompletedAtDate = toOptionalDateValue(
    plan?.productionCompletedAt,
    null
  );
  const productionCompletedAt =
    toIsoDateStringOrNull(productionCompletedAtDate?.toISOString?.() || null) ||
    completedAt;
  const isCompleted = plan?.isCompleted === true;
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: quantity,
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);

  return {
    id: plan?.externalId,
    dbId: plan?.id ?? null,
    lineId: String(plan?.lineId ?? ""),
    orderNo: resolveOptionalString(plan?.orderNo, "") ?? "",
    label: resolveOptionalString(plan?.label, "") ?? "",
    colorName: resolveAssignmentPlanColorName(plan),
    quantity,
    isCompleted,
    finalQuantity,
    qcPassedTotal,
    latestQcDate,
    completedAt,
    productionCompletedAt,
    scheduleStatus: isCompleted
      ? ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
      : ASSIGNMENT_STATUS_IN_PROGRESS,
    closedQty,
    productionConfirmedQty: closedQty,
    closedAt: completedAt,
    closedBy: resolveOptionalString(plan?.closedBy, null),
    closeMode,
    closeBasis,
  };
};

const resolveLegacyCompletionQtyInput = ({
  body,
  keys,
}: {
  body: any;
  keys: string[];
}): { provided: boolean; value: number | null } => {
  const payload = body && typeof body === "object" ? body : {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    return {
      provided: true,
      value: toOptionalNonNegativeInt(payload[key], null),
    };
  }
  return { provided: false, value: null };
};

const completeAssignmentPlanProduction = async ({
  orgId,
  externalId,
  confirmedQty,
  completedAt,
  closeBasis = "MANUAL",
}: {
  orgId: number;
  externalId: string;
  confirmedQty: number | null;
  completedAt: Date;
  closeBasis?: "QC_BASED" | "MANUAL";
}) => {
  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId, externalId },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      quantity: true,
      finalQuantity: true,
      isCompleted: true,
      completedAt: true,
      closedAt: true,
      closedQty: true,
      closeMode: true,
      closeBasis: true,
      closedBy: true,
      orderNo: true,
      label: true,
      colorName: true,
      productionCompletedAt: true,
    },
  });
  if (!plan) {
    return { ok: false as const, status: 404, error: "assignment plan not found" };
  }
  if (
    toOptionalDateValue(plan.productionCompletedAt, null) ||
    plan.isCompleted === true ||
    resolveAssignmentPlanClosedAtValue(plan)
  ) {
    return {
      ok: false as const,
      status: 409,
      error: "assignment plan already production-completed",
    };
  }

  const plannedQuantity = toOptionalNonNegativeInt(plan.quantity, null);
  const baselineQuantity =
    plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
  const producedQuantity = await resolveAssignmentPlanProducedQuantity({
    orgId,
    planId: plan.id,
    baselineQuantity,
  });
  const resolvedClosedQtyRaw =
    confirmedQty ??
    toOptionalNonNegativeInt(plan.closedQty, null) ??
    toOptionalNonNegativeInt(plan.finalQuantity, null) ??
    producedQuantity;
  const resolvedClosedQty = Math.max(0, Math.round(Number(resolvedClosedQtyRaw) || 0));
  const closeMode =
    resolveAssignmentPlanCloseMode({
      closedQty: resolvedClosedQty,
      targetQty: plannedQuantity,
    }) ?? "FULL";
  const completionDateKey = toDateKeyInTimeZone(completedAt, BUSINESS_TIME_ZONE);
  const completionDate =
    toDateValueFromDateKeyForAssignmentSchedule(completionDateKey) || completedAt;
  const actor = getCurrentRequestActor();

  const updatedPlan = await prisma.assignmentPlan.update({
    where: { id: plan.id },
    data: {
      productionCompletedAt: completedAt,
      isCompleted: true,
      completedAt,
      finalQuantity: resolvedClosedQty,
      closedQty: resolvedClosedQty,
      closedAt: completedAt,
      closedBy: actor,
      closeMode,
      closeBasis,
      candidateEndDate: completionDate,
      renderEndDate: completionDate,
      scheduleStatus: ASSIGNMENT_STATUS_PRODUCTION_COMPLETED,
      forecastCompletedAt: null,
      forecastBasis: ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE,
      updatedAt: new Date(),
    },
  });

  const shouldMutateScheduleFromProductionComplete =
    resolveOptionalString(process.env.ENABLE_PRODUCTION_COMPLETE_SCHEDULE_SYNC, "")?.toLowerCase?.() ===
    "true";
  if (shouldMutateScheduleFromProductionComplete) {
    await syncAssignmentSchedulesFromWorkRecordPlans({
      orgId,
      assignmentPlanIds: [updatedPlan.id],
    });
  }
  await persistAssignmentPlanProgressSnapshot({
    orgId,
    assignmentPlanIds: [updatedPlan.id],
  });
  await syncOrderProgressStatusesForOrg({ orgId });

  return {
    ok: true as const,
    status: 200,
    updatedPlan,
    producedQuantity,
    resolvedClosedQty,
  };
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

app.get("/assignment-plans/:externalId/qc-history", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId: organization.id, externalId },
    select: {
      id: true,
      externalId: true,
    },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const history = await prisma.qcPassEvent.findMany({
    where: {
      orgId: organization.id,
      assignmentPlanId: plan.id,
    },
    include: {
      attrColor: {
        select: { id: true, code: true, name: true, nameKo: true },
      },
    },
    orderBy: [{ inspectedOn: "desc" }, { id: "desc" }],
  });

  return res.json({
    ok: true,
    plan: {
      id: plan.externalId,
      qcPassedTotal: Math.max(
        0,
        history.reduce(
          (sum, event) => sum + Math.max(0, Math.round(Number(event?.passedQuantity ?? 0) || 0)),
          0
        )
      ),
      latestQcDate:
        normalizeDateKey(history[0]?.inspectedOn) ||
        null,
    },
    history: history.map((event) => buildQcPassEventResponse(event)),
  });
});

app.post("/qc-pass-events", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const plan =
    (await findAssignmentPlanForQcEvent({
      orgId: organization.id,
      assignmentPlanRef:
        req.body?.assignmentPlanExternalId ?? req.body?.assignmentPlanId ?? null,
    })) ?? null;
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const inspectedOn = normalizeDateKey(req.body?.inspectedOn);
  if (!inspectedOn) {
    return res.status(400).json({ ok: false, error: "inspectedOn is required" });
  }

  const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const normalizedEntries = (rawEntries.length > 0
    ? rawEntries
    : [
        {
          passedQuantity: req.body?.passedQuantity,
          colorId: req.body?.colorId,
          sizeKey: req.body?.sizeKey,
          note: req.body?.note,
        },
      ]
  )
    .map((entry: any) => ({
      passedQuantity: toOptionalNonNegativeInt(entry?.passedQuantity, null),
      colorId: toPositiveIntOrNull(entry?.colorId),
      sizeKey: normalizeQcPassEventSizeKey(entry?.sizeKey),
      note: resolveOptionalString(entry?.note, null),
    }))
    .filter(
      (
        entry: {
          passedQuantity: number | null;
          colorId: number | null;
          sizeKey: string | null;
          note: string | null;
        }
      ): entry is {
        passedQuantity: number;
        colorId: number | null;
        sizeKey: string | null;
        note: string | null;
      } => entry.passedQuantity != null && entry.passedQuantity > 0
    );

  if (normalizedEntries.length === 0) {
    return res.status(400).json({ ok: false, error: "passedQuantity is required" });
  }

  const actor = getCurrentRequestActor();
  const result = await prisma.$transaction(async (tx) => {
    const createdEvents = [];
    for (const entry of normalizedEntries) {
      const createdEvent = await tx.qcPassEvent.create({
        data: {
          orgId: organization.id,
          assignmentPlanId: plan.id,
          inspectedOn,
          passedQuantity: entry.passedQuantity!,
          colorId: entry.colorId,
          sizeKey: entry.sizeKey,
          note: entry.note,
          sourceType: "MANUAL",
          createdBy: actor,
        },
        include: {
          attrColor: {
            select: { id: true, code: true, name: true, nameKo: true },
          },
        },
      });
      createdEvents.push(createdEvent);
    }

    const aggregate = await syncAssignmentPlanQcAggregate({
      orgId: organization.id,
      planId: plan.id,
      db: tx,
    });

    return { createdEvents, aggregate };
  });

  return res.json({
    ok: true,
    plan: {
      id: plan.externalId,
      qcPassedTotal: result.aggregate.qcPassedTotal,
      latestQcDate: result.aggregate.latestQcDate,
    },
    events: result.createdEvents.map((event) => buildQcPassEventResponse(event)),
  });
});

app.patch("/qc-pass-events/:id/cancel", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const eventId = toPositiveIntOrNull(req.params.id);
  if (eventId == null) {
    return res.status(400).json({ ok: false, error: "invalid event id" });
  }

  const existingEvent = await prisma.qcPassEvent.findFirst({
    where: { id: eventId, orgId: organization.id },
    include: {
      attrColor: {
        select: { id: true, code: true, name: true, nameKo: true },
      },
    },
  });
  if (!existingEvent) {
    return res.status(404).json({ ok: false, error: "qc pass event not found" });
  }
  if (toOptionalDateValue(existingEvent.cancelledAt, null)) {
    return res.status(409).json({ ok: false, error: "qc pass event already cancelled" });
  }

  const actor = getCurrentRequestActor();
  const result = await prisma.$transaction(async (tx) => {
    const cancelledEvent = await tx.qcPassEvent.update({
      where: { id: existingEvent.id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: actor,
      },
      include: {
        attrColor: {
          select: { id: true, code: true, name: true, nameKo: true },
        },
      },
    });
    const aggregate = await syncAssignmentPlanQcAggregate({
      orgId: organization.id,
      planId: existingEvent.assignmentPlanId,
      db: tx,
    });
    return { cancelledEvent, aggregate };
  });

  return res.json({
    ok: true,
    event: buildQcPassEventResponse(result.cancelledEvent),
    plan: {
      assignmentPlanId: existingEvent.assignmentPlanId,
      qcPassedTotal: result.aggregate.qcPassedTotal,
      latestQcDate: result.aggregate.latestQcDate,
    },
  });
});

app.patch("/assignment-plans/:externalId/final-quantity", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId: organization.id, externalId },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      isCompleted: true,
      completedAt: true,
      quantity: true,
      finalQuantity: true,
      orderNo: true,
      label: true,
      colorName: true,
    },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  if (plan.isCompleted === true) {
    return res.status(409).json({
      ok: false,
      error: "assignment plan already completed",
    });
  }

  const finalQuantity = toOptionalNonNegativeInt(req.body?.finalQuantity, null);
  if (finalQuantity === null) {
    return res.status(400).json({ ok: false, error: "finalQuantity is required" });
  }

  const updatedPlan = await prisma.assignmentPlan.update({
    where: { id: plan.id },
    data: {
      finalQuantity,
      updatedAt: new Date(),
    },
  });

  const plannedQuantity = toOptionalNonNegativeInt(updatedPlan.quantity, null);
  const baselineQuantity =
    plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
  const producedQuantity = await resolveAssignmentPlanProducedQuantity({
    orgId: organization.id,
    planId: updatedPlan.id,
    baselineQuantity,
  });

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(updatedPlan),
      producedQuantity,
    },
  });
});

app.post("/assignment-plans/:externalId/close", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const qtyInput = resolveLegacyCompletionQtyInput({
    body: req.body,
    keys: ["closedQty", "finalQuantity", "confirmedQty"],
  });
  if (!qtyInput.provided || qtyInput.value === null) {
    return res.status(400).json({ ok: false, error: "closedQty is required" });
  }

  const requestedBasis = resolveOptionalString(req.body?.closeBasis, null);
  const closeBasis =
    requestedBasis === "QC_BASED" || requestedBasis === "MANUAL"
      ? requestedBasis
      : "MANUAL";
  const closedAt = toOptionalDateValue(req.body?.closedAt, null) ?? new Date();
  const completion = await completeAssignmentPlanProduction({
    orgId: organization.id,
    externalId,
    confirmedQty: qtyInput.value,
    completedAt: closedAt,
    closeBasis,
  });
  if (!completion.ok) {
    return res.status(completion.status).json({ ok: false, error: completion.error });
  }

  console.warn(
    `[deprecated-endpoint] POST /assignment-plans/:externalId/close used (orgId=${organization.id}, externalId=${externalId})`
  );
  res.set("Deprecation", "true");
  res.set("Link", '</assignment-plans/{externalId}/production-complete>; rel="successor-version"');

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(completion.updatedPlan),
      producedQuantity: completion.producedQuantity,
      productionConfirmedQty: completion.resolvedClosedQty,
    },
    reorderedAssignments: 0,
    deprecated: true,
  });
});

app.patch("/assignment-plans/:externalId/production-complete", async (req, res) => {
  const MAX_CONFIRMED_QTY = 100_000;
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const qtyInput = resolveLegacyCompletionQtyInput({
    body: req.body,
    keys: ["confirmedQty", "closedQty", "finalQuantity"],
  });
  if (qtyInput.provided && qtyInput.value === null) {
    return res.status(400).json({
      ok: false,
      error: "confirmedQty must be a non-negative integer",
    });
  }
  if (qtyInput.provided && qtyInput.value !== null && qtyInput.value > MAX_CONFIRMED_QTY) {
    return res.status(400).json({
      ok: false,
      error: `confirmedQty exceeds maximum allowed value (${MAX_CONFIRMED_QTY})`,
    });
  }
  const completedAt = toOptionalDateValue(req.body?.completedAt, null) ?? new Date();
  const completion = await completeAssignmentPlanProduction({
    orgId: organization.id,
    externalId,
    confirmedQty: qtyInput.value,
    completedAt,
    closeBasis: "MANUAL",
  });
  if (!completion.ok) {
    return res.status(completion.status).json({ ok: false, error: completion.error });
  }

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(completion.updatedPlan),
      producedQuantity: completion.producedQuantity,
      productionConfirmedQty: completion.resolvedClosedQty,
      productionCompletedAt: toIsoDateStringOrNull(
        completion.updatedPlan.productionCompletedAt
      ),
      scheduleStatus: ASSIGNMENT_STATUS_PRODUCTION_COMPLETED,
    },
    reorderedAssignments: 0,
  });
});

app.get("/holidays", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_ACCESS_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  try {
    await ensureOrganizationHolidayStorageReady();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error, "failed to initialize holiday storage"),
    });
  }

  const holidayModel = (prisma as any).organizationHoliday;

  let rows: Array<{ holidayDate: string }> = [];
  try {
    rows = await holidayModel.findMany({
      where: { orgId: organization.id },
      select: { holidayDate: true },
      orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    if (getErrorCode(error) === "P2021") {
      organizationHolidayStorageReadyPromise = null;
      await ensureOrganizationHolidayStorageReady();
      rows = await holidayModel.findMany({
        where: { orgId: organization.id },
        select: { holidayDate: true },
        orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
      });
    } else {
      throw error;
    }
  }

  return res.json(toHolidayDateKeyResponse(rows));
});

app.put("/holidays", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  try {
    await ensureOrganizationHolidayStorageReady();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error, "failed to initialize holiday storage"),
    });
  }

  const holidayModel = (prisma as any).organizationHoliday;

  const holidayDateKeys = normalizeHolidayDateKeyList(req.body?.holidays);
  let savedRows: Array<{ holidayDate: string }> = [];
  try {
    savedRows = await prisma.$transaction(async (tx) => {
      const holidayTx = (tx as any).organizationHoliday;
      await holidayTx.deleteMany({
        where: { orgId: organization.id },
      });

      if (holidayDateKeys.length > 0) {
        await holidayTx.createMany({
          data: holidayDateKeys.map((holidayDate) => ({
            orgId: organization.id,
            holidayDate,
          })),
          skipDuplicates: true,
        });
      }

      return holidayTx.findMany({
        where: { orgId: organization.id },
        select: { holidayDate: true },
        orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
      });
    });
  } catch (error) {
    if (getErrorCode(error) === "P2021") {
      organizationHolidayStorageReadyPromise = null;
      await ensureOrganizationHolidayStorageReady();
      savedRows = await prisma.$transaction(async (tx) => {
        const holidayTx = (tx as any).organizationHoliday;
        await holidayTx.deleteMany({
          where: { orgId: organization.id },
        });

        if (holidayDateKeys.length > 0) {
          await holidayTx.createMany({
            data: holidayDateKeys.map((holidayDate) => ({
              orgId: organization.id,
              holidayDate,
            })),
            skipDuplicates: true,
          });
        }

        return holidayTx.findMany({
          where: { orgId: organization.id },
          select: { holidayDate: true },
          orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
        });
      });
    } else {
      throw error;
    }
  }

  return res.json(toHolidayDateKeyResponse(savedRows));
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
  let writableRows = normalized.rows;
  if (workerIds.length > 0) {
    const workers = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        id: { in: workerIds },
      },
      select: {
        id: true,
        leftAt: true,
        membership: {
          select: {
            role: true,
            status: true,
          },
        },
      },
    });
    const workersById = new Map<
      number,
      {
        membershipRole: string;
        membershipStatus: string;
        leftDateKey: string;
      }
    >();
    workers.forEach((worker) => {
      const workerId = toPositiveIntOrNull(worker.id);
      if (workerId === null) return;
      workersById.set(workerId, {
        membershipRole: String(worker.membership?.role ?? "")
          .trim()
          .toUpperCase(),
        membershipStatus: String(worker.membership?.status ?? "")
          .trim()
          .toUpperCase(),
        leftDateKey: toDateKeyInTimeZone(worker.leftAt, BUSINESS_TIME_ZONE),
      });
    });

    const validIds = new Set(workersById.keys());
    const invalidWorkerId = workerIds.find((workerId) => !validIds.has(workerId));
    if (invalidWorkerId !== undefined) {
      return res.status(400).json({
        ok: false,
        error: `entries has invalid workerId (${invalidWorkerId})`,
      });
    }

    const blockedWorkerIds = new Set<number>();
    workersById.forEach((worker, workerId) => {
      if (worker.membershipStatus !== "TERMINATED") return;
      if (!worker.leftDateKey) return;
      if (workDate > worker.leftDateKey) {
        blockedWorkerIds.add(workerId);
      }
    });
    if (blockedWorkerIds.size > 0) {
      writableRows = normalized.rows.filter(
        (row) => !blockedWorkerIds.has(row.workerId)
      );
    }

    const adminWorkerIds = new Set<number>();
    workersById.forEach((worker, workerId) => {
      if (worker.membershipRole === "ADMIN") {
        adminWorkerIds.add(workerId);
      }
    });
    if (adminWorkerIds.size > 0) {
      writableRows = writableRows.filter((row) => !adminWorkerIds.has(row.workerId));
    }
  }

  const savedRows = await prisma.$transaction(async (tx) => {
    if (normalized.rows.length === 0) {
      await tx.attendanceEntry.deleteMany({
        where: {
          orgId: organization.id,
          factoryId,
          workDate,
        },
      });
      return [];
    }

    if (writableRows.length > 0) {
      await Promise.all(
        writableRows.map((row) =>
          tx.attendanceEntry.upsert({
            where: {
              orgId_factoryId_workerId_workDate: {
                orgId: organization.id,
                factoryId,
                workerId: row.workerId,
                workDate,
              },
            },
            create: {
              orgId: organization.id,
              factoryId,
              workerId: row.workerId,
              workDate,
              clockIn: row.clockIn,
              clockOut: row.clockOut,
              workedSeconds: row.workedSeconds,
              note: row.note,
            },
            update: {
              clockIn: row.clockIn,
              clockOut: row.clockOut,
              workedSeconds: row.workedSeconds,
              note: row.note,
            },
          })
        )
      );
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
});

app.get("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeRecords = !(
    req.query.includeRecords === "0" || req.query.includeRecords === "false"
  );

  const factoryId = Number(req.query.factoryId);
  const hasFactoryFilter = Number.isFinite(factoryId);
  const workDateInput = req.query.workDate;
  const hasWorkDateFilter =
    workDateInput !== undefined &&
    workDateInput !== null &&
    String(workDateInput).trim() !== "";
  const workDate = normalizeDateKey(workDateInput);
  if (hasWorkDateFilter && !workDate) {
    return res.status(400).json({ ok: false, error: "invalid workDate" });
  }
  const dateFrom = normalizeDateKey(req.query.dateFrom);
  const dateTo = normalizeDateKey(req.query.dateTo);
  if (hasFactoryFilter) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  const workDateFilter = workDate
    ? { displayDate: workDate }
    : dateFrom || dateTo
      ? { displayDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {};

  let workLogs: any[] = [];
  try {
    workLogs = await prisma.workLog.findMany({
      where: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
        ...workDateFilter,
      },
      select: buildWorkLogSelectWithOptionalCoverage({
        includeCoverage: true,
        includeRecords,
      }),
      orderBy: [{ displayDate: "desc" }, { id: "desc" }],
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    workLogs = await prisma.workLog.findMany({
      where: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
        ...workDateFilter,
      },
      select: buildWorkLogSelectWithOptionalCoverage({
        includeCoverage: false,
        includeRecords,
      }),
      orderBy: [{ displayDate: "desc" }, { id: "desc" }],
    });
    console.warn(
      `[work-logs] orgId=${organization.id} missing work-log coverage columns; fallback list query activated`
    );
  }

  res.json(workLogs.map(toWorkLogResponse));
});

app.get("/work-log-context", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const lineId = toPositiveIntOrNull(req.query.lineId);
  const factoryId = toPositiveIntOrNull(req.query.factoryId);
  const workDate = normalizeDateKey(req.query.workDate);
  const coverageStartDate = normalizeDateKey(req.query.coverageStartDate);
  const debug =
    String(req.query.debug || "").trim() === "1" ||
    String(req.query.debug || "").trim().toLowerCase() === "true";
  if (!lineId) {
    return res.status(400).json({ ok: false, error: "lineId is required" });
  }
  if (!workDate) {
    return res.status(400).json({ ok: false, error: "invalid workDate" });
  }

  const context = await buildWorkLogContextResponse({
    orgId: organization.id,
    factoryId,
    lineId,
    workDate,
    coverageStartDate: coverageStartDate || null,
    debug,
  });

  res.json(context);
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

  const includeContext =
    req.query.includeContext === "1" || req.query.includeContext === "true";

  let baseWorkLog: any = null;
  try {
    baseWorkLog = await prisma.workLog.findFirst({
      where: { id, orgId: organization.id },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: true,
          includeRecords: false,
        }),
        workRecords: WORK_LOG_DETAIL_RECORD_SELECT,
      },
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    baseWorkLog = await prisma.workLog.findFirst({
      where: { id, orgId: organization.id },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: false,
          includeRecords: false,
        }),
        workRecords: WORK_LOG_DETAIL_RECORD_SELECT,
      },
    });
    console.warn(
      `[work-logs/:id] orgId=${organization.id} workLogId=${id} missing work-log coverage columns; fallback detail query activated`
    );
  }
  if (!baseWorkLog) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }

  const lineMeta = resolveWorkLogLineMeta(baseWorkLog?.records);
  const context = includeContext
    ? await buildWorkLogContextResponse({
        orgId: organization.id,
        factoryId: toPositiveIntOrNull(baseWorkLog.factoryId),
        lineId: toPositiveIntOrNull(lineMeta.lineId),
        lineName: resolveOptionalString(lineMeta.lineName, null),
        workDate: baseWorkLog.displayDate,
        coverageStartDate: resolveWorkLogCoverageStartDate(
          baseWorkLog,
          resolveWorkLogCoverageEndDate(baseWorkLog, baseWorkLog.displayDate)
        ),
      })
    : null;

  const response = toWorkLogResponse({
    ...baseWorkLog,
  });
  if (!includeContext) {
    return res.json(response);
  }

  res.json({
    ...response,
    context,
  });
});

app.post("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const trace = createWorkLogMutationTrace({
    req,
    mode: "create",
    payload: req.body ?? {},
  });
  const normalized = normalizeWorkLogPayload(req.body ?? {});
  updateWorkLogMutationTrace(trace, "normalized", summarizeWorkLogPayloadForDebug(normalized));
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
  updateWorkLogMutationTrace(trace, "factory-validated", {
    factoryId: normalized.factoryId,
  });
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const workerFilterDateKey = normalizeDateKey(normalized.coverageStartDate) || normalized.displayDate;
  const employmentValidation = await validateWorkLogWorkerEmploymentWindow({
    orgId: organization.id,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
    workerIds,
  });
  if (employmentValidation.error) {
    return res
      .status(employmentValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(employmentValidation.error) });
  }
  if (employmentValidation.invalidWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `worker employment mismatch for workDate (${employmentValidation.invalidWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "employment-validated", {
    workerIds,
    workerFilterDateKey,
  });
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
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
  updateWorkLogMutationTrace(trace, "line-validated", {
    lineId: lineValidation.line?.id ?? normalized.lineId ?? null,
    lineName: lineValidation.line?.name ?? null,
  });
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "refs-synced", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  const duplicateValidation = await validateWorkLogWorkerStyleProcessDuplicates({
    orgId: organization.id,
    workDate: normalized.displayDate,
    records: normalized.records,
  });
  if (duplicateValidation.error) {
    return res
      .status(duplicateValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(duplicateValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "duplicates-validated");
  const ctSnapshotValidation = await validateWorkLogAssignmentPlanCtSnapshot({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  if (ctSnapshotValidation.error) {
    return res
      .status(ctSnapshotValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctSnapshotValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "ct-snapshot-validated");
  normalized.records = await attachCanonicalFieldsToWorkRecords({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "canonical-fields-attached", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  logWorkLogRecordTrace(
    `[work-logs:create] req=${trace.requestId} step=canonical-fields-attached`,
    normalized.records
  );
  const updatedBy = await resolveWorkLogUpdatedBy(organization.id, req);
  updateWorkLogMutationTrace(trace, "updated-by-resolved", {
    updatedBy,
  });

  const {
    records,
    invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
    lineId: _lineId,
    lineName: _lineName,
    ...workLogData
  } = normalized;
  const createWorkLogTransaction = async (includeCoverage: boolean) =>
    prisma.$transaction(async (tx) => {
      const next = await tx.workLog.create({
        data: {
          orgId: organization.id,
          ...buildWorkLogWriteDataWithOptionalCoverage(workLogData, { includeCoverage }),
          updatedBy,
          records: {
            lineId: lineValidation.line?.id ?? null,
            lineName: lineValidation.line?.name ?? null,
          },
        },
        select: { id: true },
      });

      if (records.length > 0) {
        await tx.workRecord.createMany({
          data: records.map((record: any) => ({
            orgId: organization.id,
            workLogId: next.id,
            workerId: record.workerId,
            workerName: record.workerName ?? null,
            customerName: record.customerName ?? null,
            orderNo: record.orderNo ?? null,
            lineId: record.lineId ?? null,
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
  let created: any;
  try {
    created = await createWorkLogTransaction(true);
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    console.warn(
      `[work-logs:create] orgId=${organization.id} missing work-log coverage columns; retrying create without coverage fields`
    );
    created = await createWorkLogTransaction(false);
  }
  trace.workLogId = created.id;
  updateWorkLogMutationTrace(trace, "transaction-committed", {
    workLogId: created.id,
  });
  const createdWithRecords = await fetchWorkLogByIdWithRecordsSafe({
    orgId: organization.id,
    workLogId: created.id,
    recordSelect: WORK_RECORD_WITH_REFS_INCLUDE,
    warnLabel: "work-logs:create:readback",
  });
  updateWorkLogMutationTrace(trace, "readback-loaded", {
    workLogId: created.id,
    hasReadback: Boolean(createdWithRecords),
  });
  await trySyncConfirmedOrdersToInProgressFromWorkRecords({
    orgId: organization.id,
    records: normalized.records,
    mode: "create",
  });
  updateWorkLogMutationTrace(trace, "order-sync-finished");
  const createdPlanIds = collectWorkRecordAssignmentPlanIds(normalized.records);
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: createdPlanIds,
    mode: "create",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: createdPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: created.id,
  });
  res.status(201).json(toWorkLogResponse(createdWithRecords ?? created));
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

  const trace = createWorkLogMutationTrace({
    req,
    mode: "update",
    payload: req.body ?? {},
    workLogId: id,
  });
  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    select: {
      id: true,
      displayDate: true,
      workRecords: {
        select: {
          assignmentPlanId: true,
        },
      },
    },
  });
  if (!existing) {
    return res
      .status(404)
      .json({ ok: false, error: translateWorkLogErrorMessage("work log not found") });
  }
  const normalized = normalizeWorkLogPayload(req.body ?? {}, existing);
  updateWorkLogMutationTrace(trace, "normalized", summarizeWorkLogPayloadForDebug(normalized));
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
  updateWorkLogMutationTrace(trace, "factory-validated", {
    factoryId: normalized.factoryId,
  });
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const workerFilterDateKey = normalizeDateKey(normalized.coverageStartDate) || normalized.displayDate;
  const employmentValidation = await validateWorkLogWorkerEmploymentWindow({
    orgId: organization.id,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
    workerIds,
  });
  if (employmentValidation.error) {
    return res
      .status(employmentValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(employmentValidation.error) });
  }
  if (employmentValidation.invalidWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `worker employment mismatch for workDate (${employmentValidation.invalidWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "employment-validated", {
    workerIds,
    workerFilterDateKey,
  });
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
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
  updateWorkLogMutationTrace(trace, "line-validated", {
    lineId: lineValidation.line?.id ?? normalized.lineId ?? null,
    lineName: lineValidation.line?.name ?? null,
  });
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "refs-synced", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  const duplicateValidation = await validateWorkLogWorkerStyleProcessDuplicates({
    orgId: organization.id,
    workDate: normalized.displayDate,
    records: normalized.records,
    excludedWorkLogId: existing.id,
  });
  if (duplicateValidation.error) {
    return res
      .status(duplicateValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(duplicateValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "duplicates-validated");
  const ctSnapshotValidation = await validateWorkLogAssignmentPlanCtSnapshot({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  if (ctSnapshotValidation.error) {
    return res
      .status(ctSnapshotValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctSnapshotValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "ct-snapshot-validated");
  normalized.records = await attachCanonicalFieldsToWorkRecords({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "canonical-fields-attached", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  logWorkLogRecordTrace(
    `[work-logs:update] req=${trace.requestId} step=canonical-fields-attached`,
    normalized.records
  );
  const updatedBy = await resolveWorkLogUpdatedBy(organization.id, req);
  updateWorkLogMutationTrace(trace, "updated-by-resolved", {
    updatedBy,
  });

  const {
    records,
    invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
    lineId: _lineId,
    lineName: _lineName,
    ...workLogData
  } = normalized;
  const updateWorkLogTransaction = async (includeCoverage: boolean) =>
    prisma.$transaction(async (tx) => {
      const next = await tx.workLog.update({
        where: { id: existing.id },
        data: {
          ...buildWorkLogWriteDataWithOptionalCoverage(workLogData, { includeCoverage }),
          updatedBy,
          records: {
            lineId: lineValidation.line?.id ?? null,
            lineName: lineValidation.line?.name ?? null,
          },
        },
        select: { id: true },
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
            orderNo: record.orderNo ?? null,
            lineId: record.lineId ?? null,
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
  let updated: any;
  try {
    updated = await updateWorkLogTransaction(true);
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    console.warn(
      `[work-logs:update] orgId=${organization.id} workLogId=${existing.id} missing work-log coverage columns; retrying update without coverage fields`
    );
    updated = await updateWorkLogTransaction(false);
  }
  trace.workLogId = updated.id;
  updateWorkLogMutationTrace(trace, "transaction-committed", {
    workLogId: updated.id,
  });
  const updatedWithRecords = await fetchWorkLogByIdWithRecordsSafe({
    orgId: organization.id,
    workLogId: updated.id,
    recordSelect: WORK_RECORD_WITH_REFS_INCLUDE,
    warnLabel: "work-logs:update:readback",
  });
  updateWorkLogMutationTrace(trace, "readback-loaded", {
    workLogId: updated.id,
    hasReadback: Boolean(updatedWithRecords),
  });
  await trySyncConfirmedOrdersToInProgressFromWorkRecords({
    orgId: organization.id,
    records: normalized.records,
    mode: "update",
  });
  updateWorkLogMutationTrace(trace, "order-sync-finished");
  const previousPlanIds = normalizePlanIdList(
    ensureArray(existing?.workRecords).map((row) => row?.assignmentPlanId)
  );
  const nextPlanIds = collectWorkRecordAssignmentPlanIds(normalized.records);
  const touchedPlanIds = normalizePlanIdList([...previousPlanIds, ...nextPlanIds]);
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: touchedPlanIds,
    mode: "update",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: touchedPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: updated.id,
  });
  res.json(toWorkLogResponse(updatedWithRecords ?? updated));
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

  const trace = createWorkLogMutationTrace({
    req,
    mode: "delete",
    payload: { workLogId: id },
    workLogId: id,
  });
  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    select: {
      id: true,
      displayDate: true,
      workRecords: {
        select: {
          assignmentPlanId: true,
        },
      },
    },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }
  updateWorkLogMutationTrace(trace, "work-log-found", {
    workLogId: existing.id,
    assignmentPlanIds: normalizePlanIdList(
      ensureArray(existing?.workRecords).map((row) => row?.assignmentPlanId)
    ),
  });
  const deleteResult = await prisma.workLog.deleteMany({
    where: { id: existing.id, orgId: organization.id },
  });
  if (deleteResult.count < 1) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }
  updateWorkLogMutationTrace(trace, "deleted", {
    workLogId: existing.id,
    deletedCount: deleteResult.count,
  });
  const deletedPlanIds = normalizePlanIdList(
    ensureArray(existing?.workRecords).map((row) => row?.assignmentPlanId)
  );
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: deletedPlanIds,
    mode: "delete",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: deletedPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: existing.id,
  });
  res.status(204).send();
});

app.get("/assignment-board-view", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeCards = !(
    req.query.includeCards === "0" || req.query.includeCards === "false"
  );
  const state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
  });
  const response = await buildReadOnlyAssignmentBoardStateResponse(
    organization.id,
    state,
    { includeCards }
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
  const escalatedAssignments = applySentTimeoutEscalation(state?.assignments).assignments;

  res.json({
    assignments: normalizeStateAssignments(escalatedAssignments),
    createdAt: state?.createdAt ?? null,
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  });
});

app.get("/assignment-cards", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const includeProcesses = isManufacturerOrg(organization) && !(
    req.query.includeProcesses === "0" || req.query.includeProcesses === "false"
  );
  const [accessibleOwnerOrgIds, state, cards] = await Promise.all([
    getAccessibleStyleOwnerOrgIds(organization),
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { updatedAt: true },
    }),
    loadAssignmentCardsForOrg({ orgId: organization.id }),
  ]);
  const cardStyleIds = Array.from(
    new Set(
      cards
        .map((card) => resolveOptionalString(card?.styleId, null))
        .filter((styleId): styleId is string => Boolean(styleId))
    )
  );
  const orderManualLockRows = await prisma.workOrder.findMany({
    where: { OR: getOrderAccessWhere(organization.id) },
    select: {
      orderId: true,
      modificationLockedAt: true,
    },
  });
  const manualLockByOrderId = orderManualLockRows.reduce((map, row) => {
    const orderId = resolveOptionalString(row?.orderId, null);
    if (!orderId) return map;
    map.set(orderId, Boolean(row?.modificationLockedAt));
    return map;
  }, new Map<string, boolean>());
  const cardsWithOrderLock = cards.map((card) => {
    const cardIdentity =
      resolveOptionalString(card?.originOrderId, null) ??
      resolveOptionalString(card?.id, null);
    const orderId = cardIdentity
      ? extractOrderIdFromAssignmentCardText(cardIdentity)
      : null;
    const isManualOrderLocked =
      orderId == null ? true : Boolean(manualLockByOrderId.get(orderId));
    return {
      ...card,
      isManualOrderLocked,
    };
  });
  const styleSelect = {
    uid: true,
    orgId: true,
    styleId: true,
    styleCode: true,
    name: true,
    customer: true,
    ...(includeProcesses ? { processes: true } : {}),
  };
  const styles =
    cardStyleIds.length > 0
      ? await prisma.style.findMany({
          where: {
            orgId: { in: accessibleOwnerOrgIds },
            styleId: { in: cardStyleIds },
          },
          orderBy: { uid: "asc" },
          select: styleSelect,
        })
      : [];
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(styles, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  res.json({
    cards: cardsWithOrderLock,
    styles: styles.map((style) =>
      toStyleResponse(style, {
        includeProcesses,
        processMirrorMap,
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
  let cards = await loadAssignmentCardsForOrg({ orgId: organization.id });
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
    const repairedState = await safelyRepairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards,
      assignments: state.assignments,
      context: "GET /assignment-board-state",
    });
    if (repairedState.changed) {
      const nextCards = repairedState.cards;
      const nextAssignments = repairedState.assignments;
      const updated = await prisma.$transaction(async (tx) => {
        await syncAssignmentCardsForOrg({
          orgId: organization.id,
          cards: nextCards,
          db: tx,
        });
        const nextState = await tx.assignmentBoardState.update({
          where: { id: state!.id },
          data: {
            assignments: nextAssignments,
          },
        });
        return { nextState, nextCards };
      });
      state = updated.nextState;
      cards = updated.nextCards;
    } else {
      state = {
        ...state,
        assignments: repairedState.assignments,
      };
      cards = repairedState.cards;
    }
  }
  const activeExternalIds = resolveAssignmentPlanExternalIds(state?.assignments);
  const hasBoardAssignments = Array.isArray(state?.assignments);
  let assignmentPlans =
    hasBoardAssignments && activeExternalIds.length === 0
      ? []
      : await findAssignmentPlansWithSelectFallback({
          where: {
            orgId: organization.id,
            ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
          },
          orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
          selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
          context: "GET /assignment-board-state",
        });
  if (assignmentPlans.length > 0 && assignmentPlans.some(assignmentPlanNeedsDisplayRepair)) {
    const repairedPlans = await repairAssignmentPlanDisplayRows({
      orgId: organization.id,
      plans: assignmentPlans,
    });
    assignmentPlans = repairedPlans.plans;
  }

  res.json(toAssignmentBoardStateResponse(state, assignmentPlans, cards));
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
    select: { id: true, assignments: true },
  });
  if (!existingState) {
    return res.status(404).json({ ok: false, error: "board state not found" });
  }

  let currentCards = await loadAssignmentCardsForOrg({
    orgId: organization.id,
  });
  const currentAssignments = normalizeStateAssignments(existingState.assignments);
  const targetAssignment = currentAssignments.find(
    (a: any) => String(a?.id) === assignmentId
  );
  if (!targetAssignment) {
    return res.status(404).json({ ok: false, error: "assignment not found" });
  }

  const targetExternalId = resolveAssignmentExternalId(targetAssignment);
  const completedPlan = targetExternalId
    ? await prisma.assignmentPlan.findFirst({
        where: {
          orgId: organization.id,
          externalId: targetExternalId,
          isCompleted: true,
        },
        select: { id: true },
      })
    : null;
  if (Boolean(targetAssignment?.isCompleted) || completedPlan) {
    return res.status(409).json({
      ok: false,
      error: "completed assignment cannot be cancelled",
    });
  }

  const nextAssignments = currentAssignments.filter(
    (a: any) => String(a?.id) !== assignmentId
  );

  let patchedCard: any = null;
  if (cardId && cardPatch) {
    currentCards = currentCards.map((card: any) => {
      if (String(card?.id) !== cardId) return card;
      patchedCard = { ...card, ...cardPatch };
      return patchedCard;
    });
  }

  await prisma.$transaction(async (tx) => {
    if (cardId && cardPatch) {
      await syncAssignmentCardsForOrg({
        orgId: organization.id,
        cards: currentCards,
        db: tx,
      });
    }
    await tx.assignmentBoardState.update({
      where: { id: existingState.id },
      data: { assignments: nextAssignments },
    });
  });

  // 해당 assignment의 plan 레코드 제거
  const externalId = targetExternalId;
  if (externalId) {
    const planRows = await prisma.assignmentPlan.findMany({
      where: { orgId: organization.id, externalId },
      select: { id: true },
    });
    await detachWorkRecordsAndDeleteAssignmentPlans({
      planIds: planRows.map((plan) => plan.id),
    });
  }
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: currentCards,
    assignments: nextAssignments,
  });

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
    await tx.assignmentCard.deleteMany({ where: { orgId: organization.id } });
    const planRows = await tx.assignmentPlan.findMany({
      where: { orgId: organization.id },
      select: { id: true },
    });
    await detachWorkRecordsAndDeleteAssignmentPlans({
      planIds: planRows.map((plan) => plan.id),
      db: tx,
    });
  });
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: [],
    assignments: [],
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
  const stDraftsByExternalId = normalizeAssignmentStDraftsPayload(req.body?.stDrafts);
  const accessibleStyleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  let cardsForSave = cards;
  let incomingAssignmentsForSave = incomingAssignments;
  if (
    shouldRepairAssignmentBoardDisplayPayloadOnWrite({
      cards: cardsForSave,
      assignments: incomingAssignmentsForSave,
    })
  ) {
    const repairedIncomingPayload = await safelyRepairAssignmentBoardDisplayState({
      orgId: organization.id,
      cards: cardsForSave,
      assignments: incomingAssignmentsForSave,
      context: "PUT /assignment-board-state",
    });
    cardsForSave = repairedIncomingPayload.cards;
    incomingAssignmentsForSave = repairedIncomingPayload.assignments;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existingState = await tx.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { id: true, assignments: true },
    });
    const {
      assignments: currentAssignments,
    } = applySentTimeoutEscalation(existingState?.assignments);
    const currentAssignmentsNormalized = normalizeStateAssignments(currentAssignments);
    const currentAssignmentsByExternalId =
      buildAssignmentByExternalId(currentAssignmentsNormalized);
    let nextAssignmentsNormalized = normalizeStateAssignments(
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

    const completedGuardExternalIds = Array.from(
      new Set(
        [
          ...Array.from(nextAssignmentsByExternalId.keys()),
          ...Array.from(removedExternalIds.values()),
        ]
          .map((value) => resolveOptionalString(value, null))
          .filter((value): value is string => Boolean(value))
      )
    );
    const completedPlanRows =
      completedGuardExternalIds.length > 0
        ? await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: completedGuardExternalIds },
              isCompleted: true,
            },
            select: COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT,
          })
        : [];
    const completedPlanByExternalId = new Map(
      completedPlanRows
        .map((plan: any) => [resolveOptionalString(plan?.externalId, null), plan])
        .filter((entry): entry is [string, any] => Boolean(entry[0]))
    );
    for (const plan of completedPlanRows) {
      const externalId = resolveOptionalString(plan?.externalId, null);
      if (!externalId) continue;
      const nextItem = nextAssignmentsByExternalId.get(externalId);
      if (!nextItem) {
        throw createHttpError(
          409,
          `completed assignment cannot be removed: ${externalId}`
        );
      }
      if (stDraftsByExternalId.has(externalId)) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (stDrafts)`
        );
      }
      const changedFields = listCompletedAssignmentWriteDiffFields(plan, nextItem);
      if (changedFields.length > 0) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (${changedFields
            .slice(0, 6)
            .join(", ")})`
        );
      }
    }
    for (const [externalId, currentItem] of currentAssignmentsByExternalId.entries()) {
      if (!Boolean(currentItem?.isCompleted)) continue;
      if (completedPlanByExternalId.has(externalId)) continue;
      const nextItem = nextAssignmentsByExternalId.get(externalId);
      if (!nextItem) {
        throw createHttpError(
          409,
          `completed assignment cannot be removed: ${externalId}`
        );
      }
      if (stDraftsByExternalId.has(externalId)) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (stDrafts)`
        );
      }
      const changedFields = listCompletedAssignmentWriteDiffFields(currentItem, nextItem);
      if (changedFields.length > 0) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (${changedFields
            .slice(0, 6)
            .join(", ")})`
        );
      }
    }
    stDraftsByExternalId.forEach((_drafts, externalId) => {
      if (nextAssignmentsByExternalId.has(externalId)) {
        changedIncomingExternalIds.add(externalId);
      }
    });

    const currentVersionByExternalId =
      buildAssignmentVersionMap(currentAssignmentsNormalized);
    const changedIncomingAssignments = nextAssignmentsNormalized.filter((item) => {
      const externalId = resolveAssignmentExternalId(item);
      return Boolean(externalId && changedIncomingExternalIds.has(externalId));
    });
    const changedOrderIds = Array.from(
      new Set(
        changedIncomingAssignments
          .map((item) => resolveOrderIdFromAssignmentBoardItem(item))
          .filter((value): value is string => Boolean(value))
      )
    );
    if (changedOrderIds.length > 0) {
      const orderRows = await tx.workOrder.findMany({
        where: {
          orderId: { in: changedOrderIds },
          OR: getOrderAccessWhere(organization.id),
        },
        select: {
          orderId: true,
          modificationLockedAt: true,
        },
      });
      const manualLockByOrderId = orderRows.reduce((map, row) => {
        const orderId = resolveOptionalString(row?.orderId, null);
        if (!orderId) return map;
        map.set(orderId, Boolean(row?.modificationLockedAt));
        return map;
      }, new Map<string, boolean>());
      const unlockedOrderIds = changedOrderIds.filter(
        (orderId) => !Boolean(manualLockByOrderId.get(orderId))
      );
      if (unlockedOrderIds.length > 0) {
        throw createHttpError(
          409,
          `order manual lock required before scheduling assignment: ` +
            unlockedOrderIds.slice(0, 5).join(", ")
        );
      }
    }
    const versionConflicts = findAssignmentVersionConflicts(
      changedIncomingAssignments,
      currentVersionByExternalId
    );
    // Last-write-wins for assignment board saves:
    // when versions diverge (often due background/system sync), accept the user's
    // incoming board payload and rebase version counters from current server values.
    // We still increment from currentVersion below, so version history remains monotonic.
    void versionConflicts;

    const nextAssignmentExternalIds = Array.from(nextAssignmentsByExternalId.keys()).map(
      (externalId) => String(externalId)
    );
    const existingPlanRowsForStTotals =
      nextAssignmentExternalIds.length > 0
        ? await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: nextAssignmentExternalIds },
            },
            select: {
              id: true,
              externalId: true,
              lineId: true,
              quantity: true,
              startIndex: true,
              endIndex: true,
              stTotalSeconds: true,
              cardId: true,
              originOrderId: true,
              isCompleted: true,
            } as any,
          })
        : [];
    const existingPlanByExternalIdForStTotals = new Map(
      existingPlanRowsForStTotals
        .map((plan: any) => [resolveOptionalString(plan?.externalId, null), plan])
        .filter((entry): entry is [string, any] => Boolean(entry[0]))
    );
    const stTotalPreparation = await prepareAssignmentBoardStTotalsForSave({
      organization,
      accessibleStyleOwnerOrgIds,
      cards: cardsForSave,
      assignments: nextAssignmentsNormalized,
      existingPlanByExternalId: existingPlanByExternalIdForStTotals,
      stDraftsByExternalId,
      db: tx,
    });
    nextAssignmentsNormalized = stTotalPreparation.assignments;
    stTotalPreparation.changedExternalIds.forEach((externalId) => {
      changedIncomingExternalIds.add(externalId);
    });

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
      return normalizeStateAssignmentItem({
        ...item,
        id: externalId,
        version: currentVersion + 1,
        versionUpdatedAt: nowIso,
      });
    });
    const {
      assignments: assignmentsForState,
    } = applySentTimeoutEscalation(versionedAssignments);
    const savedCards = await syncAssignmentCardsForOrg({
      orgId: organization.id,
      cards: cardsForSave,
      db: tx,
    });

    let state: any = null;
    if (!existingState) {
      state = await tx.assignmentBoardState.create({
        data: {
          orgId: organization.id,
          assignments: assignmentsForState,
        },
      });
    } else {
      state = await tx.assignmentBoardState.update({
        where: { id: existingState.id },
        data: {
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
      savedCards,
      changedPlanTargetAssignments,
      removedExternalIdList,
      stDraftWarnings: stTotalPreparation.warnings,
    };
  }, { timeout: 90000 });
  const updatedState = updated?.state ?? null;
  const updatedCards = ensureArray(updated?.savedCards);
  const changedPlanTargetAssignments = ensureArray(
    updated?.changedPlanTargetAssignments
  );
  const removedExternalIdList = ensureArray(updated?.removedExternalIdList).map((value) =>
    String(value)
  );
  const stDraftWarnings = ensureArray(updated?.stDraftWarnings);
  const removedExternalIdSet = new Set(removedExternalIdList);
  const changedPlanTargetExternalIds = new Set(
    changedPlanTargetAssignments
      .map((item) => resolveAssignmentExternalId(item))
      .filter((value): value is string => Boolean(value))
  );
  const stateAssignmentsForPlanSync = normalizeStateAssignments(updatedState?.assignments).filter(
    (item) => {
      const externalId = resolveAssignmentExternalId(item);
      if (!externalId) return false;
      if (removedExternalIdSet.has(externalId)) return false;
      return true;
    }
  );
  const stateAssignmentByExternalId = buildAssignmentByExternalId(stateAssignmentsForPlanSync);
  const stateAssignmentExternalIds: string[] = Array.from(
    stateAssignmentByExternalId.keys()
  ).map((externalId) => String(externalId));
  const existingStatePlanRows =
    stateAssignmentExternalIds.length > 0
      ? await prisma.assignmentPlan.findMany({
          where: {
            orgId: organization.id,
            externalId: { in: stateAssignmentExternalIds },
          },
          select: { externalId: true },
        })
      : [];
  const existingStatePlanExternalIdSet = new Set(
    existingStatePlanRows
      .map((row) => resolveOptionalString(row?.externalId, null))
      .filter((value): value is string => Boolean(value))
  );
  const missingStateAssignmentsForPlanSync = stateAssignmentExternalIds
    .filter((externalId) => !existingStatePlanExternalIdSet.has(externalId))
    .map((externalId) => stateAssignmentByExternalId.get(externalId))
    .filter((item): item is any => Boolean(item));
  const planSyncTargetAssignments = normalizeStateAssignments([
    ...changedPlanTargetAssignments,
    ...missingStateAssignmentsForPlanSync,
  ]).filter((item, index, self) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId) return false;
    return (
      index ===
      self.findIndex((candidate) => resolveAssignmentExternalId(candidate) === externalId)
    );
  });
  console.log(
    `[assignment-board] changedPlanTargetAssignments: org=${organization.id} count=${changedPlanTargetAssignments.length} sample=${JSON.stringify(
      changedPlanTargetAssignments.slice(0, 2).map((item) => ({
        id: resolveAssignmentExternalId(item),
        lineId: item?.lineId,
        startIndex: item?.startIndex,
        endIndex: item?.endIndex,
      }))
    )}`
  );
  const shouldSyncPlans =
    planSyncTargetAssignments.length > 0 || removedExternalIdList.length > 0;
  console.log(
    `[assignment-board] plan sync check: org=${organization.id} shouldSync=${shouldSyncPlans} changed=${changedPlanTargetAssignments.length} missingRecovered=${missingStateAssignmentsForPlanSync.length} removed=${removedExternalIdList.length} totalIncoming=${stateAssignmentsForPlanSync.length} changedIds=${JSON.stringify(
      Array.from(changedPlanTargetExternalIds).slice(0, 10)
    )}`
  );
  if (shouldSyncPlans) {
    try {
      const lineIdSet =
        planSyncTargetAssignments.length > 0
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
        planSyncTargetAssignments.length > 0
          ? await syncAssignmentPlanColorRefs(
              organization.id,
              normalizeAssignmentPlanPayload(planSyncTargetAssignments, lineIdSet)
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
        console.log(
          `[assignment-board] plan createMany: org=${organization.id} count=${createPlanRows.length} externalIds=${createPlanRows
            .map((item: any) => resolveOptionalString(item?.externalId, ""))
            .filter(Boolean)
            .slice(0, 10)
            .join(",")}`
        );
        await prisma.assignmentPlan.createMany({
          data: createPlanRows.map((item: any) => ({
            orgId: organization.id,
            externalId: item.externalId,
            ...toAssignmentPlanWriteData(item),
          })) as Prisma.AssignmentPlanCreateManyInput[],
        });
      }

      if (updatePlanRows.length > 0) {
        console.log(
          `[assignment-board] plan updateMany: org=${organization.id} count=${updatePlanRows.length}`
        );
        await Promise.all(
          updatePlanRows.map((row) =>
            prisma.assignmentPlan.update({
              where: { id: row.id },
              data: toAssignmentPlanWriteData(row.item) as Prisma.AssignmentPlanUncheckedUpdateInput,
              select: { id: true },
            })
          )
        );
      }

      const removedExternalIdSet = new Set(removedExternalIdList);
      const removedPlanRows = existingPlanRows.filter((plan) =>
        removedExternalIdSet.has(plan.externalId)
      );
      if (removedPlanRows.length > 0) {
        await detachWorkRecordsAndDeleteAssignmentPlans({
          planIds: removedPlanRows.map((plan) => plan.id),
        });
      }
    } catch (error) {
      const errCode = (error as any)?.code || "unknown";
      const errMsg = (error as any)?.message || String(error || "");
      const isMissingCol = isAssignmentPlanMissingColumnError(error);
      console.warn(
        `[assignment-board] plan sync error: org=${organization.id} code=${errCode} isMissingColumn=${isMissingCol} message=${String(
          errMsg
        ).slice(0, 200)}`
      );
      if (!isMissingCol) {
        throw error;
      }
      console.warn(
        `[assignment-board] SKIPPED plan sync due to schema drift: org=${organization.id} — run additive SQL to add missing columns`
      );
    }
  }
  // Board save ST reverse propagation is driven only by explicit write-only stDrafts.
  // assignmentCtSnapshot is CT-only and must not be used as an ST source.
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: updatedCards,
    assignments: updatedState?.assignments,
  });
  res.json({
    ...toAssignmentBoardStateResponse(updatedState, null, updatedCards),
    warnings: stDraftWarnings,
  });
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
  const assignmentLockMap = await loadOrderAssignmentModificationLockMap(orders);
  res.json(
    orders.map((order) =>
      {
        const orderKey = resolveOptionalString(order?.orderId ?? order?.id, null) ?? "";
        return toOrderResponse(order, {
          isAssignmentModificationLocked: Boolean(assignmentLockMap.get(orderKey)),
        });
      }
    )
  );
});

app.post("/orders", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
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
  const { order, created } = await createOrReuseSharedOrder({
    normalized,
  });
  await rebuildAssignmentCardsForOrgIds([buyer.id, seller.id]);
  const orderLockState = await getOrderModificationLockState(order);
  res.status(created ? 201 : 200).json(
    toOrderResponse(order, {
      isAssignmentModificationLocked: orderLockState.isAssignmentLocked,
    })
  );
});

app.put("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
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
  if (await isOrderModificationLocked(existing)) {
    return res.status(409).json({
      ok: false,
      error: ORDER_MODIFICATION_LOCK_ERROR,
    });
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

  await rebuildAssignmentCardsForOrgIds([
    existing.buyerOrgId,
    existing.sellerOrgId,
    buyer.id,
    seller.id,
  ]);
  const updatedLockState = await getOrderModificationLockState(updated);
  res.json(
    toOrderResponse(updated, {
      isAssignmentModificationLocked: updatedLockState.isAssignmentLocked,
    })
  );
});

app.post("/orders/:orderId/modification-lock", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }
  if (typeof req.body?.locked !== "boolean") {
    return res.status(400).json({ ok: false, error: "locked boolean is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
    include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }

  const currentLockState = await getOrderModificationLockState(existing);
  const requestedLocked = Boolean(req.body.locked);

  if (
    requestedLocked === currentLockState.isManualLocked
  ) {
    const refreshedLockState = await getOrderModificationLockState(existing);
    return res.json(
      toOrderResponse(existing, {
        isAssignmentModificationLocked: refreshedLockState.isAssignmentLocked,
      })
    );
  }

  const lockedBy =
    resolveOptionalString(req.body?.lockedBy, null) ??
    getRequesterEmail(req) ??
    "unknown";
  let orderForResponse = existing;
  if (requestedLocked !== currentLockState.isManualLocked) {
    const previousManualLockData = {
      modificationLockedAt: existing.modificationLockedAt ?? null,
      modificationLockedBy: existing.modificationLockedBy ?? null,
    };
    let updated: any = null;
    try {
      updated = await prisma.workOrder.update({
        where: { id: existing.id },
        data: requestedLocked
          ? {
              modificationLockedAt: new Date(),
              modificationLockedBy: lockedBy,
            }
          : {
              modificationLockedAt: null,
              modificationLockedBy: null,
            },
        include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
      });
      await syncOrderProgressStatusesForOrg({
        orgId: organization.id,
        orderIds: [updated.orderId],
        includeTerminalStages: true,
      });
      const refreshed = await prisma.workOrder.findUnique({
        where: { id: updated.id },
        include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
      });
      orderForResponse = refreshed ?? updated;
    } catch (error) {
      if (updated) {
        await prisma.workOrder
          .update({
            where: { id: existing.id },
            data: previousManualLockData,
          })
          .catch(() => null);
      }
      throw error;
    }
  } else {
    const refreshed = await prisma.workOrder.findUnique({
      where: { id: existing.id },
      include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
    });
    orderForResponse = refreshed ?? existing;
  }

  const refreshedLockState = await getOrderModificationLockState(orderForResponse);
  return res.json(
    toOrderResponse(orderForResponse, {
      isAssignmentModificationLocked: refreshedLockState.isAssignmentLocked,
    })
  );
});

app.delete("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
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
  if (await isOrderModificationLocked(existing)) {
    return res.status(409).json({
      ok: false,
      error: ORDER_MODIFICATION_LOCK_ERROR,
    });
  }

  await prisma.workOrder.delete({ where: { id: existing.id } });
  await rebuildAssignmentCardsForOrgIds([
    existing.buyerOrgId,
    existing.sellerOrgId,
  ]);
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
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const { brandOrgId, customerOrgId, memo } = req.body ?? {};
  const sharedOrganizationData = buildSharedCustomerOrganizationData(req.body ?? {});
  const normalizedCode = sharedOrganizationData.code;
  if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
    return res.status(400).json({
      ok: false,
      error: "code must be 4 uppercase letters",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const targetType = isManufacturerPerspective
    ? ORGANIZATION_TYPE_KEYS.BRAND
    : ORGANIZATION_TYPE_KEYS.MANUFACTURER;

  let targetOrganization: any = null;
  const targetOrgIdNum = toPositiveIntOrNull(customerOrgId ?? brandOrgId);
  if (targetOrgIdNum) {
    targetOrganization = await prisma.organization.findUnique({
      where: { id: targetOrgIdNum },
    });
    if (!targetOrganization) {
      return res.status(404).json({ ok: false, error: "customer organization not found" });
    }
    if (targetOrganization.type !== targetType) {
      return res.status(400).json({
        ok: false,
        error: "invalid customer organization type",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: targetOrganization.id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    const nextTargetData = buildSharedCustomerOrganizationData(req.body ?? {}, targetOrganization);
    if (!nextTargetData.name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    targetOrganization = await prisma.organization.update({
      where: { id: targetOrganization.id },
      data: {
        name: nextTargetData.name,
        code: normalizedCode,
        address: nextTargetData.address,
        country: nextTargetData.country,
        countryCode: nextTargetData.countryCode,
        phone: nextTargetData.phone,
        representative: nextTargetData.representative,
        email: nextTargetData.email,
      },
    });
  } else {
    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner && existingCodeOwner.type !== targetType) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    const nextTargetData = buildSharedCustomerOrganizationData(
      req.body ?? {},
      existingCodeOwner ?? null
    );
    if (!nextTargetData.name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    if (existingCodeOwner && existingCodeOwner.type === targetType) {
      targetOrganization = await prisma.organization.update({
        where: { id: existingCodeOwner.id },
        data: {
          name: nextTargetData.name,
          code: normalizedCode,
          address: nextTargetData.address,
          country: nextTargetData.country,
          countryCode: nextTargetData.countryCode,
          phone: nextTargetData.phone,
          representative: nextTargetData.representative,
          email: nextTargetData.email,
        },
      });
    } else {
      targetOrganization = await prisma.organization.create({
        data: {
          name: nextTargetData.name,
          code: normalizedCode,
          address: nextTargetData.address,
          country: nextTargetData.country,
          countryCode: nextTargetData.countryCode,
          phone: nextTargetData.phone,
          representative: nextTargetData.representative,
          email: nextTargetData.email,
          type: targetType,
        },
      });
    }
  }

  if (!targetOrganization || targetOrganization.type !== targetType) {
    return res.status(400).json({ ok: false, error: "invalid customer organization type" });
  }

  if (targetOrganization.id === organization.id) {
    return res.status(400).json({
      ok: false,
      error: "cannot link organization to itself",
    });
  }

  const manufacturerOrgId = isManufacturerPerspective
    ? organization.id
    : targetOrganization.id;
  const brandOrgIdForRelationship = isManufacturerPerspective
    ? targetOrganization.id
    : organization.id;

  const relationship = await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId,
        brandOrgId: brandOrgIdForRelationship,
      },
    },
    update: {
      customerCode: normalizedCode,
      managerName: resolveOptionalString(sharedOrganizationData.representative, null),
      managerPhone: resolveOptionalString(sharedOrganizationData.phone, null),
      managerEmail: resolveOptionalString(sharedOrganizationData.email, null),
      memo: resolveOptionalString(memo, null),
    },
    create: {
      manufacturerOrgId,
      brandOrgId: brandOrgIdForRelationship,
      customerCode: normalizedCode,
      managerName: resolveOptionalString(sharedOrganizationData.representative, null),
      managerPhone: resolveOptionalString(sharedOrganizationData.phone, null),
      managerEmail: resolveOptionalString(sharedOrganizationData.email, null),
      memo: resolveOptionalString(memo, null),
    },
    include: { brand: true, manufacturer: true },
  });

  res.status(201).json(toCustomerResponse(relationship, perspective));
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
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const existing = await prisma.orgRelationship.findFirst({
    where: isManufacturerPerspective
      ? { id, manufacturerOrgId: organization.id }
      : { id, brandOrgId: organization.id },
    include: { brand: true, manufacturer: true },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  const { name, code, memo } = req.body ?? {};
  const targetOrganization = isManufacturerPerspective
    ? existing.brand
    : existing.manufacturer;
  const targetOrganizationId = isManufacturerPerspective
    ? existing.brandOrgId
    : existing.manufacturerOrgId;
  const nextTargetData = buildSharedCustomerOrganizationData(req.body ?? {}, targetOrganization);
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
        NOT: { id: targetOrganizationId },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  await prisma.organization.update({
    where: { id: targetOrganizationId },
    data: {
      name: nextTargetData.name ?? targetOrganization?.name ?? "",
      ...(normalizedCode ? { code: normalizedCode } : {}),
      address: nextTargetData.address,
      country: nextTargetData.country,
      countryCode: nextTargetData.countryCode,
      phone: nextTargetData.phone,
      representative: nextTargetData.representative,
      email: nextTargetData.email,
    },
  });

  const relationshipUpdateData: any = {
    managerName: resolveOptionalString(nextTargetData.representative, existing.managerName),
    managerPhone: resolveOptionalString(nextTargetData.phone, existing.managerPhone),
    managerEmail: resolveOptionalString(nextTargetData.email, existing.managerEmail),
    memo: resolveOptionalString(memo, existing.memo),
    ...(code !== undefined ? { customerCode: normalizedCode } : {}),
  };
  await prisma.orgRelationship.update({
    where: { id: existing.id },
    data: relationshipUpdateData,
  });

  const refreshed = await prisma.orgRelationship.findUnique({
    where: { id: existing.id },
    include: { brand: true, manufacturer: true },
  });

  res.json(toCustomerResponse(refreshed, perspective));
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
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const existing = await prisma.orgRelationship.findFirst({
    where: isManufacturerPerspective
      ? { id, manufacturerOrgId: organization.id }
      : { id, brandOrgId: organization.id },
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
            uid: true,
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
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(styles, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  res.json(
    styles.map((style) =>
      toStyleResponse(style, { includeProcesses, processMirrorMap })
    )
  );
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

  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([style], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  res.json(toStyleResponse(style, { includeProcesses, processMirrorMap }));
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

  const created = await prisma.$transaction(async (tx) => {
    const syncedProcesses = includeProcesses
      ? await syncProcessMasterFromStyleProcesses({
          processes: payload.processes,
          db: tx,
        })
      : payload.processes;
    const syncedDuplicateProcess = includeProcesses
      ? findStyleProcessDuplicateIdentity(syncedProcesses)
      : null;
    if (syncedDuplicateProcess) {
      throw createHttpError(
        400,
        createStyleProcessDuplicateError(syncedDuplicateProcess)
      );
    }

    const createdStyle = await tx.style.create({
      data: {
        orgId: owner.ownerOrgId,
        ...payload,
        processes: syncedProcesses,
      },
    });
    if (includeProcesses) {
      await syncStyleProcessStorageForStyle({
        styleUid: createdStyle.uid,
        orgId: organization.id,
        processes: syncedProcesses,
        db: tx,
      });
    }
    return tx.style.findUniqueOrThrow({
      where: { uid: createdStyle.uid },
    });
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([created], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  await rebuildAssignmentCardsForOrgIds(
    await resolveStyleSyncTargetOrgIds(owner.ownerOrgId)
  );
  res
    .status(201)
    .json(toStyleResponse(created, { includeProcesses, processMirrorMap }));
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

  const updated = await prisma.$transaction(async (tx) => {
    const syncedProcesses = includeProcesses
      ? await syncProcessMasterFromStyleProcesses({
          processes: normalized.processes,
          db: tx,
        })
      : normalized.processes;
    const syncedDuplicateProcess = includeProcesses
      ? findStyleProcessDuplicateIdentity(syncedProcesses)
      : null;
    if (syncedDuplicateProcess) {
      throw createHttpError(
        400,
        createStyleProcessDuplicateError(syncedDuplicateProcess)
      );
    }

    const updatedStyle = await tx.style.update({
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
        processes: syncedProcesses,
        bom: normalized.bom,
        bomNotes: normalized.bomNotes,
      },
    });
    if (includeProcesses) {
      await syncStyleProcessStorageForStyle({
        styleUid: existing.uid,
        orgId: organization.id,
        processes: syncedProcesses,
        db: tx,
      });
    }
    return tx.style.findUniqueOrThrow({
      where: { uid: updatedStyle.uid },
    });
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([updated], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  await rebuildAssignmentCardsForOrgIds(
    await resolveStyleSyncTargetOrgIds(existing.orgId)
  );
  res.json(toStyleResponse(updated, { includeProcesses, processMirrorMap }));
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

  await prisma.$transaction(async (tx) => {
    for (const item of rowsWithOwner) {
      const { ownerOrgId, ...stylePayload } = item;
      const syncedProcesses = includeProcesses
        ? await syncProcessMasterFromStyleProcesses({
            processes: stylePayload.processes,
            db: tx,
          })
        : stylePayload.processes;
      const syncedDuplicateProcess = includeProcesses
        ? findStyleProcessDuplicateIdentity(syncedProcesses)
        : null;
      if (syncedDuplicateProcess) {
        throw createHttpError(
          400,
          createStyleProcessDuplicateError(
            syncedDuplicateProcess,
            `styles[${stylePayload.styleId}].processes`
          )
        );
      }

      const upserted = await tx.style.upsert({
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
          processes: syncedProcesses,
          bom: stylePayload.bom,
          bomNotes: stylePayload.bomNotes,
        },
        create: {
          orgId: ownerOrgId,
          ...stylePayload,
          processes: syncedProcesses,
        },
      });
      if (includeProcesses) {
        await syncStyleProcessStorageForStyle({
          styleUid: upserted.uid,
          orgId: organization.id,
          processes: syncedProcesses,
          db: tx,
        });
      }
    }
  });

  const imported = await prisma.style.findMany({
    where: { orgId: { in: uniqueOwnerOrgIds } },
    orderBy: { uid: "asc" },
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(imported, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  const syncTargetOrgIds = (
    await Promise.all(uniqueOwnerOrgIds.map((orgId) => resolveStyleSyncTargetOrgIds(orgId)))
  ).flat();
  await rebuildAssignmentCardsForOrgIds(syncTargetOrgIds);
  res.status(201).json(
    imported.map((style) =>
      toStyleResponse(style, { includeProcesses, processMirrorMap })
    )
  );
});

app.get("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const canManageProcesses = isManufacturerOrg(organization);
  const includeColors =
    !["0", "false"].includes(String(req.query.includeColors ?? "").trim().toLowerCase());
  const includeCategories =
    !["0", "false"].includes(String(req.query.includeCategories ?? "").trim().toLowerCase());
  const includeRoles =
    !["0", "false"].includes(String(req.query.includeRoles ?? "").trim().toLowerCase());
  const includeProcesses =
    canManageProcesses &&
    !["0", "false"].includes(String(req.query.includeProcesses ?? "").trim().toLowerCase());
  await seedAttributesIfEmpty(organization.id, {
    includeColors,
    includeCategories,
    // Keep process master deletion persistent; do not auto-reseed processes on read.
    includeProcesses: false,
  });

  const [colors, categories, roles, processes] = await Promise.all([
    includeColors
      ? prisma.attrColor.findMany({
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    includeCategories
      ? listGlobalCategorySection(organization.id)
      : Promise.resolve([]),
    includeRoles
      ? ensureDefaultEmployeeRoles(organization.id).then((items) =>
          items.filter((item) => isWorkerEmployeeRoleCode(item.code)).map(toAttrRoleResponse)
        )
      : Promise.resolve([]),
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
    canManageProcesses,
  });
});

app.get("/process-master-options", async (req, res) => {
  const requesterEmail = getRequesterEmail(req);
  if (!requesterEmail) {
    return res.status(401).json({ ok: false, error: "request user email is required" });
  }

  const systemUser = await prisma.systemUser.findUnique({
    where: { email: requesterEmail },
    select: { systemRole: true },
  });
  const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
  if (!isSystemAdmin) {
    const accessContext = await requireOrgRole(req, res, {
      allowedRoles: ORG_MANAGEMENT_ROLES,
      allowSystemAdmin: false,
    });
    if (!accessContext) return;
  }

  await ensureProcessMasterOptionTypeSchemaReady();
  await ensureProcessMasterOptionRelationSchemaReady();
  const rows = await listProcessMasterOptions();
  const relations = await listProcessMasterOptionRelations();
  const usageConflicts = await findProcessMasterDeletionUsageConflicts(rows);
  return res.json(
    buildProcessMasterOptionsResponse(rows, relations, usageConflicts)
  );
});

app.put("/process-master-options", async (req, res, next) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  try {
    await ensureProcessMasterOptionTypeSchemaReady();
    await ensureProcessMasterOptionRelationSchemaReady();
    const payload = req.body ?? {};
    const rows = await syncProcessMasterOptions(payload);
    const relations = await syncProcessMasterRelations({
      payload,
      processMasterRows: rows,
    });
    const usageConflicts = await findProcessMasterDeletionUsageConflicts(rows);
    await syncStyleProcessCompositionNamesWithMasterOptions({
      processMasterRows: rows,
    });
    return res.json(
      buildProcessMasterOptionsResponse(rows, relations, usageConflicts)
    );
  } catch (error) {
    if (isProcessMasterOptionInUseError(error)) {
      const usageCount = Number(error.usageCount || 0);
      const conflicts = Array.isArray(error.conflicts)
        ? error.conflicts.map((item) => ({
            id: toPositiveIntOrNull(item?.id),
            type: normalizeProcessMasterType(item?.type),
            code: normalizeProcessMasterCode(item?.code),
            label: normalizeProcessMasterLabel(item?.label),
            nameKo: normalizeProcessMasterLabel(item?.nameKo),
            nameEn: normalizeProcessMasterLabel(item?.nameEn),
            nameVi: normalizeProcessMasterLabel(item?.nameVi),
            styleProcessCount: Number(item?.styleProcessCount || 0),
            referenceCount: Number(item?.referenceCount || 0),
            sampleStyleProcessIds: ensureArray(item?.sampleStyleProcessIds)
              .map((id) => toPositiveIntOrNull(id))
              .filter((id): id is number => id !== null),
          }))
        : [];

      return res.status(409).json({
        ok: false,
        reason: "PROCESS_MASTER_OPTION_IN_USE",
        usageCount,
        conflicts,
        error: getErrorMessage(
          error,
          "사용 중인 공정 항목은 삭제할 수 없습니다."
        ),
      });
    }
    return next(error);
  }
});

app.post("/attributes/colors", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const { name, nameKo, nameEn, nameVi } = resolveManagedColorNameData(req.body ?? {});
  const code = resolveOptionalString(req.body?.code, null);
  if (!name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const existingCodes = await prisma.attrColor.findMany({
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
      code: nextCode,
      name,
      nameKo,
      nameEn,
      nameVi,
    },
  });

  res.status(201).json(created);
});

app.put("/attributes", async (req, res) => {
  const payload = req.body ?? {};
  const includesColors = payload.colors !== undefined;
  const includesCategories = payload.categories !== undefined;
  const includesRoles = payload.roles !== undefined;
  const includesProcesses = payload.processes !== undefined;
  const isProcessOnlyPayload =
    includesProcesses && !includesColors && !includesCategories && !includesRoles;

  let accessContext: Awaited<ReturnType<typeof requireOrgRole>> | null = null;
  if (isProcessOnlyPayload) {
    accessContext = await requireOrgRole(req, res, {
      allowedRoles: ORG_MANAGEMENT_ROLES,
      allowSystemAdmin: true,
    });
    if (!accessContext) return;
  } else {
    const systemAdmin = await requireSystemAdmin(req, res);
    if (!systemAdmin) return;
  }

  const organization =
    accessContext?.organization ??
    (await getOrganizationByQuery(req));
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const tasks = [];
  const response: {
    colors?: any[];
    categories?: any[];
    roles?: any[];
    processes?: any[];
  } = {};

  if (payload.colors) {
    tasks.push(
      syncGlobalColorSection(payload.colors).then(async (data) => {
        response.colors = data;
        const assignmentOrgIds = (
          await prisma.organization.findMany({
            where: {
              type: { in: ["MANUFACTURER", "BRAND"] },
            },
            select: { id: true },
          })
        ).map((item) => item.id);
        await rebuildAssignmentCardsForOrgIds(assignmentOrgIds);
      })
    );
  }
  if (payload.categories) {
    tasks.push(
      syncGlobalCategorySection(payload.categories, { fallbackOrgId: organization.id }).then(
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
      syncSection(prisma.attrProcess, organization.id, payload.processes, {
        resolveNameData: resolveManagedProcessNameData,
      }).then(
        async (data) => {
          response.processes = data;
          await syncStyleProcessNamesFromMaster({
            orgId: organization.id,
            processes: data,
          });
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
app.use(quantitySettlementRouter);

// ───────────────────────────────────────────────────────────────────────────

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
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
  const prismaConstraint = String(prismaMeta?.constraint || "");
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
  const hasGlobalColorCodeTargetField =
    prismaErrorTarget.includes("code") &&
    !prismaErrorTarget.includes("orgId");
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
  const isGlobalColorCodeUniqueError =
    prismaErrorCode === "P2002" &&
    (hasGlobalColorCodeTargetField ||
      prismaErrorTarget.some((item) => /AttrColor_code_key/i.test(item)));
  if (isGlobalColorCodeUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "color code already exists",
    });
  }
  const isAttributeCodeUniqueError =
    prismaErrorCode === "P2002" &&
    (hasAttributeCodeTargetFields ||
      prismaErrorTarget.some((item) =>
        /Attr(Category|Role|Process)_orgId_code_key/i.test(item)
      ));
  if (isAttributeCodeUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "attribute code already exists in this organization",
    });
  }
  if (prismaErrorCode === "P2002") {
    return res.status(409).json({
      ok: false,
      error: "same data already exists. Refresh and try again",
    });
  }
  const isForeignKeyConstraintError = prismaErrorCode === "P2003";
  if (isForeignKeyConstraintError) {
    if (/WorkOrderItem_styleUid_fkey/i.test(prismaConstraint)) {
      return res.status(409).json({
        ok: false,
        error:
          "one or more selected styles are out of date. Re-select the style and save again",
      });
    }
    if (/WorkOrderItem_colorId_fkey/i.test(prismaConstraint)) {
      return res.status(409).json({
        ok: false,
        error:
          "one or more selected colors are out of date. Re-select the color and save again",
      });
    }
    if (
      /WorkOrder_(buyerOrgId|sellerOrgId|customerId)_fkey/i.test(prismaConstraint)
    ) {
      return res.status(409).json({
        ok: false,
        error:
          "linked buyer or seller information is out of date. Refresh and try again",
      });
    }
    return res.status(409).json({
      ok: false,
      error: "linked data is out of date. Refresh and try again",
    });
  }
  if (prismaErrorCode === "P2025") {
    return res.status(404).json({
      ok: false,
      error: "the requested record no longer exists. Refresh and try again",
    });
  }
  if (prismaErrorCode === "P2034") {
    return res.status(409).json({
      ok: false,
      error: "another update completed first. Refresh and try again",
    });
  }
  const rawErrorMessage = getErrorMessage(error, String(error));
  const workLogTrace = (req as any)?.__workLogTrace;
  const workLogRequestId = resolveOptionalString(workLogTrace?.requestId, null);
  if (workLogRequestId) {
    res.setHeader("X-WorkLog-Request-Id", workLogRequestId);
  }
  const respondWithTrackedError = (
    statusCode: number,
    body: Record<string, unknown>
  ) => {
    if (workLogRequestId && body.requestId === undefined) {
      return res.status(statusCode).json({
        ...body,
        requestId: workLogRequestId,
      });
    }
    return res.status(statusCode).json(body);
  };
  if (workLogTrace && typeof workLogTrace === "object") {
    console.error(
      `[work-logs:${String(workLogTrace.mode || "unknown")}] req=${String(
        workLogTrace.requestId || "unknown"
      )} failed at step=${String(workLogTrace.step || "unknown")}`,
      {
        method: req.method,
        path: req.originalUrl,
        workLogId: workLogTrace.workLogId ?? null,
        status: getErrorStatus(error),
        code: getErrorCode(error),
        message: rawErrorMessage,
        payloadSummary: workLogTrace.payloadSummary ?? null,
      }
    );
  }
  if (prismaErrorCode === "P2022") {
    const missingColumn = resolveOptionalString((error as any)?.meta?.column, null);
    const suffix = missingColumn ? ` (missing column: ${missingColumn})` : "";
    return res.status(503).json({
      ok: false,
      error:
        `server database schema is out of sync with backend code${suffix}. ` +
        `Apply migration_fix.sql and redeploy backend, then retry`,
    });
  }
  if (prismaErrorCode === "P2021") {
    const missingTableMessage =
      /QuantitySettlementSnapshot/i.test(rawErrorMessage)
        ? "quantity settlement storage is not ready on server. Apply the backend database update first"
        : "server database schema is missing a required table. Update the backend and database schema, then try again";
    return res.status(503).json({
      ok: false,
      error: missingTableMessage,
    });
  }
  if (prismaErrorCode === "P2011") {
    return res.status(400).json({
      ok: false,
      error: "required data is missing. Check the form and try again",
    });
  }
  if (
    /invalid input value for enum\s+"?WorkOrderStatus"?/i.test(rawErrorMessage) &&
    /EDITING/i.test(rawErrorMessage)
  ) {
    return res.status(409).json({
      ok: false,
      error:
        "order status schema is out of date on the server. Retry after backend migration/deploy sync",
    });
  }

  const normalizedRequestPath = String(
    String(req.originalUrl || "").split("?")[0] || ""
  ).trim();
  if (
    normalizedRequestPath === "/assignment-plans" ||
    normalizedRequestPath === "/assignment-plan-progress"
  ) {
    if (/WorkRecord|work record|work log/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked work log rows. Check work log and assignment connections first",
      });
    }
    if (/WorkOrder|order|Style|style/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked order or style rows. Check order and style setup first",
      });
    }
    if (/Line|Factory|lineId|factoryId/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked line or factory rows. Check organization setup first",
      });
    }
    if (/AssignmentPlan|AssignmentBoardState|assignment plan|assignment board|cardId|externalId/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is incomplete. Check assignment plan and board source data first",
      });
    }
  }
  if (/^\/assignment-plans\/[^/]+\/qc-history$/i.test(normalizedRequestPath)) {
    return res.status(409).json({
      ok: false,
      error:
        "qc history data is incomplete. Check batch, color, and qc event references first",
    });
  }
  if (
    normalizedRequestPath === "/qc-pass-events" ||
    /^\/qc-pass-events\/[^/]+\/cancel$/i.test(normalizedRequestPath)
  ) {
    return res.status(409).json({
      ok: false,
      error:
        "qc event could not be processed because linked batch or reference data is missing",
    });
  }

  const status = getErrorStatus(error);
  if (status !== null) {
    return respondWithTrackedError(status, {
      ok: false,
      error: getErrorMessage(error, "request failed"),
    });
  }
  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  return respondWithTrackedError(500, {
    ok: false,
    error: "internal server error",
  });
});

const port = Number(process.env.PORT) || 4000;
const host = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const AT_AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const AT_AUTO_SYNC_DB_LOCK_NAMESPACE = 20260223;
const AT_AUTO_SYNC_DB_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const AT_AUTO_SYNC_JOB_KEY = "AT_SYNC";
let atAutoSyncTimer: NodeJS.Timeout | null = null;
let atAutoSyncInProgress = false;
let atAutoSyncLastTrainingMonthKey: string | null = null;
let atAutoSyncRunHistoryTableReady = false;
let atAutoSyncRunHistoryTableUnsupported = false;
let workRecordCanonicalSchemaReady = false;

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

const ensureWorkRecordCanonicalSchemaReady = async () => {
  if (workRecordCanonicalSchemaReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "WorkRecord"
      ADD COLUMN IF NOT EXISTS "orderNo" TEXT,
      ADD COLUMN IF NOT EXISTS "lineId" INTEGER;

    CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_orderNo_idx"
      ON "WorkRecord"("orgId", "orderNo");

    CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
      ON "WorkRecord"("orgId", "lineId");
  `);
  workRecordCanonicalSchemaReady = true;
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
  if (!AT_AUTO_SYNC_ENABLED) {
    console.log("[AT sync][scheduler] disabled (manual trigger only)");
    return;
  }
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

const ensureWorkOrderStatusSchemaReady = async () => {
  const enumRows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'WorkOrderStatus'
    ORDER BY enumsortorder
  `;
  const availableStatusCodes = new Set(
    enumRows
      .map((row) => resolveOptionalString(row?.enumlabel, null))
      .filter((value): value is string => Boolean(value))
  );
  supportsWorkOrderEditingStatus = availableStatusCodes.has("EDITING");
  const missingStatusCodes = Array.from(WORK_ORDER_STATUS_CODES).filter(
    (statusCode) =>
      statusCode !== "EDITING" && !availableStatusCodes.has(statusCode)
  );
  if (missingStatusCodes.length > 0) {
    throw new Error(
      `[startup] WorkOrderStatus enum is missing DB values: ${missingStatusCodes.join(
        ", "
      )}. Apply the latest schema sync before starting the API.`
    );
  }
  if (!supportsWorkOrderEditingStatus) {
    console.warn(
      "[startup] WorkOrderStatus enum is missing EDITING. Compatibility mode is enabled (unlocked orders use ORDER_RECEIVED in DB)."
    );
  }

  const defaultRows = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrder'
      AND column_name = 'status'
  `;
  const statusColumnDefault =
    resolveOptionalString(defaultRows[0]?.column_default, null) ?? "";
  if (!statusColumnDefault.includes("'EDITING'")) {
    console.warn(
      `[startup] WorkOrder.status default is not EDITING (current: ${
        statusColumnDefault || "missing"
      }).`
    );
  }
};

const ensureProcessMasterOptionTypeSchemaReady = async () => {
  const requiredEnumValues = [
    "LOCATION",
    "TARGET_SPEC",
    "ACTION_SPEC",
  ];

  for (const enumValue of requiredEnumValues) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'ProcessMasterOptionType'
            AND e.enumlabel = '${enumValue}'
        ) THEN
          ALTER TYPE "ProcessMasterOptionType" ADD VALUE '${enumValue}';
        END IF;
      END
      $$;
    `);
  }
};

const ensureProcessMasterOptionRelationSchemaReady = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProcessMasterOptionRelation" (
      "id" SERIAL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "parentOptionId" INTEGER NOT NULL,
      "childOptionId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      CONSTRAINT "ProcessMasterOptionRelation_parentOptionId_fkey"
        FOREIGN KEY ("parentOptionId")
        REFERENCES "ProcessMasterOption"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "ProcessMasterOptionRelation_childOptionId_fkey"
        FOREIGN KEY ("childOptionId")
        REFERENCES "ProcessMasterOption"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_type_parent_child_key"
      ON "ProcessMasterOptionRelation" ("type", "parentOptionId", "childOptionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_parentOptionId_idx"
      ON "ProcessMasterOptionRelation" ("parentOptionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_childOptionId_idx"
      ON "ProcessMasterOptionRelation" ("childOptionId");
  `);

  const allowedTypesSql = PROCESS_MASTER_RELATION_TYPE_KEYS.map(
    (type) => `'${type}'`
  ).join(", ");
  await prisma.$executeRawUnsafe(`
    DELETE FROM "ProcessMasterOptionRelation"
    WHERE "type" NOT IN (${allowedTypesSql});
  `);
};

type StartupLifecycleState = "booting" | "ready" | "error";

let startupLifecycleState: StartupLifecycleState = "booting";
let startupBootstrapAttempt = 0;
let startupBootstrapRetryTimer: NodeJS.Timeout | null = null;

const scheduleStartupBootstrapRetry = () => {
  if (startupBootstrapRetryTimer) return;
  startupBootstrapRetryTimer = setTimeout(() => {
    startupBootstrapRetryTimer = null;
    void bootstrapApplicationServices();
  }, STARTUP_BOOTSTRAP_RETRY_DELAY_MS);
  if (typeof startupBootstrapRetryTimer.unref === "function") {
    startupBootstrapRetryTimer.unref();
  }
};

const bootstrapApplicationServices = async () => {
  startupBootstrapAttempt += 1;
  startupLifecycleState = "booting";

  try {
    await ensureDatabaseReady();
    await ensureWorkRecordCanonicalSchemaReady();
    await ensureWorkOrderStatusSchemaReady();
    await ensureProcessMasterOptionTypeSchemaReady();
    await ensureProcessMasterOptionRelationSchemaReady();
    await ensureHardcodedSystemAdmin();
    await ensureAtAutoSyncRunHistoryTable();
    startAutoAtSyncScheduler();
    startupLifecycleState = "ready";
    console.log(
      `[startup] Background bootstrap completed on attempt ${startupBootstrapAttempt}.`
    );
  } catch (error) {
    startupLifecycleState = "error";
    supportsWorkOrderEditingStatus = false;

    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error(
        `[startup] Unable to connect to database at ${resolveDatabaseEndpoint()}. Check DATABASE_URL/network access and retry.`
      );
    }

    console.error(
      `[startup] Background bootstrap attempt ${startupBootstrapAttempt} failed. Retrying in ${STARTUP_BOOTSTRAP_RETRY_DELAY_MS}ms.`
    );
    console.error(error);
    scheduleStartupBootstrapRetry();
  }
};

const startServer = async () => {
  app.listen(port, host, () => {
    console.log(`API running on http://${host}:${port}`);
  });
  void bootstrapApplicationServices();
};

startServer().catch((error) => {
  console.error("failed to start API server", error);
  process.exit(1);
});



