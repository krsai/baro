import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient, Prisma, type OrgUserRole } from "@prisma/client";
import {
  parseDateKeyParts,
  resolveAtTrainingMonthKey,
} from "./utils/atTrainingMonthKey";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

const DEFAULT_ORG = {
  name: "BARO",
  businessNumber: "",
  representative: "관리자",
  industry: "봉제",
  address: "",
  phone: "",
  email: "baro.garment@gmail.com",
  type: "MANUFACTURER" as const,
};

const DEFAULT_ATTRIBUTES = {
  colors: [
    { code: "BLK", name: "Black" },
    { code: "WHT", name: "White" },
    { code: "RED", name: "Red" },
    { code: "BLU", name: "Blue" },
  ],
  categories: [
    { code: "OUT", name: "Outer" },
    { code: "TOP", name: "Top" },
    { code: "BTM", name: "Bottom" },
    { code: "DRS", name: "Dress" },
    { code: "ACC", name: "Accessory" },
  ],
  roles: [
    { code: "ADMIN", name: "관리자" },
    { code: "MGR", name: "공장장" },
    { code: "WORKER", name: "작업자" },
  ],
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

const isNumericId = (value: unknown): boolean => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return /^\d+$/.test(value);
  return false;
};

const toId = (value: unknown): number => Number(value);
const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};
const normalizeOrgCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
};
const isValidOrgCode = (value: string): boolean => /^[A-Z]{4}$/.test(value);
const toNumberOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const FACTORY_WORK_DAYS_PER_MONTH = 26;
const FACTORY_WORK_HOURS_PER_DAY = 8;
const ATTENDANCE_DEFAULT_WORK_SECONDS = FACTORY_WORK_HOURS_PER_DAY * 60 * 60;
const AT_TRAINING_CUTOFF_DAY = 5;
// 출퇴근 입력값을 AT 계산에 반영한다.
// 입력이 없거나 불완전한 경우 8시간(ATTENDANCE_DEFAULT_WORK_SECONDS)으로 폴백한다.
const USE_ATTENDANCE_INPUT_FOR_AT = true;
const FACTORY_WORK_SECONDS_PER_MONTH =
  FACTORY_WORK_DAYS_PER_MONTH * FACTORY_WORK_HOURS_PER_DAY * 60 * 60;
const roundToScale = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const resolveFactoryWageFields = (
  targetMonthlyWageInput: unknown,
  wagePerSecondInput: unknown
): { targetMonthlyWage: number | null; wagePerSecond: number | null } => {
  const targetMonthlyWage = toNumberOrNull(targetMonthlyWageInput);
  if (targetMonthlyWage === null) {
    return {
      targetMonthlyWage: null,
      wagePerSecond: toNumberOrNull(wagePerSecondInput),
    };
  }
  return {
    targetMonthlyWage,
    wagePerSecond: roundToScale(targetMonthlyWage / FACTORY_WORK_SECONDS_PER_MONTH, 2),
  };
};
const toPositiveIntOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
};
const toPositiveInt = (value: unknown, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : fallback;
};
const resolveOptionalString = (
  value: unknown,
  fallback: string | null = null
): string | null => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return fallback;
};
const ROLE_OPTIONS = new Set(["ADMIN", "OPERATOR", "ACCOUNTANT", "WORKER"]);
const ORG_ACCESS_ROLES: OrgUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "ACCOUNTANT",
  "WORKER",
];
const ORG_MANAGEMENT_ROLES: OrgUserRole[] = ["ADMIN", "OPERATOR"];
const LINE_ELIGIBLE_ROLES: OrgUserRole[] = ["WORKER"];
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
const BARO_SUBSCRIPTION_EMAIL = "baro.garment@gmail.com";
const HARD_CODED_SYSTEM_ADMIN_EMAIL = "krsailer82@gmail.com";
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

const isBaroOrganization = (organization: any) => {
  const normalizedName =
    typeof organization?.name === "string"
      ? organization.name.trim().toLowerCase()
      : "";
  const normalizedCode =
    typeof organization?.code === "string"
      ? organization.code.trim().toUpperCase()
      : "";
  return normalizedName === "baro" || normalizedCode === "BARO";
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
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldName} is invalid` };
  }
  return { value: date };
};

const ensureOrganizationSubscription = async (organization: any) => {
  if (!organization) return null;

  const existing = await prisma.organizationSubscription.findUnique({
    where: { orgId: organization.id },
  });
  if (existing) {
    if (!isBaroOrganization(organization)) return existing;

    const patch: any = {};
    if (!existing.membershipEmail) {
      patch.membershipEmail = BARO_SUBSCRIPTION_EMAIL;
    }
    if (!existing.billingEmail) {
      patch.billingEmail = BARO_SUBSCRIPTION_EMAIL;
    }
    if (existing.status === "ACTIVE" && !existing.activatedAt) {
      patch.activatedAt = new Date();
    }

    if (Object.keys(patch).length === 0) return existing;
    return prisma.organizationSubscription.update({
      where: { id: existing.id },
      data: patch,
    });
  }

  if (isBaroOrganization(organization)) {
    return prisma.organizationSubscription.create({
      data: {
        orgId: organization.id,
        status: "ACTIVE",
        membershipEmail: BARO_SUBSCRIPTION_EMAIL,
        billingEmail: BARO_SUBSCRIPTION_EMAIL,
        activatedAt: new Date(),
      },
    });
  }

  return prisma.organizationSubscription.create({
    data: {
      orgId: organization.id,
      status: "NOT_SUBSCRIBED",
    },
  });
};

const attachOrganizationSubscription = async (organization: any) => {
  if (!organization) return null;
  const subscription = await ensureOrganizationSubscription(organization);
  return { ...organization, subscription };
};

const ensureOrganizationAccessible = (organization: any, options: any = {}) => {
  if (!organization) return organization;
  if (options.allowSuspended) return organization;
  if (organization.subscription?.status === "SUSPENDED") {
    throw createHttpError(403, "organization is suspended");
  }
  return organization;
};
const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
};

const readRequestHeader = (req: Request, name: string): string => {
  const raw = req.header(name);
  return typeof raw === "string" ? raw.trim() : "";
};

const getRequesterEmail = (req: Request): string => {
  const headerEmail = normalizeEmail(readRequestHeader(req, "x-user-email"));
  return headerEmail;
};

const getRequestedOrgIdText = (req: Request): string => {
  const rawFromQuery =
    req.query.orgId === undefined || req.query.orgId === null
      ? ""
      : String(req.query.orgId).trim();
  if (rawFromQuery) return rawFromQuery;
  return readRequestHeader(req, "x-org-id");
};

const getPrimaryOrganization = async (options = {}) => {
  let organization = await prisma.organization.findFirst({
    orderBy: { id: "asc" },
  });

  if (!organization) {
    organization = await prisma.organization.create({ data: DEFAULT_ORG });
  }

  const withSubscription = await attachOrganizationSubscription(organization);
  return ensureOrganizationAccessible(withSubscription, options);
};

const getOrganizationByQuery = async (req: Request, options = {}) => {
  const rawOrgId = getRequestedOrgIdText(req);
  const requesterEmail = getRequesterEmail(req);
  if (rawOrgId !== "") {
    if (!/^\d+$/.test(rawOrgId)) {
      throw createHttpError(400, "invalid orgId");
    }
    const orgId = Number(rawOrgId);
    if (!Number.isSafeInteger(orgId) || orgId <= 0) {
      throw createHttpError(400, "invalid orgId");
    }
    const organization = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!organization) return null;

    if (requesterEmail) {
      const [systemUser, membership] = await Promise.all([
        prisma.systemUser.findUnique({
          where: { email: requesterEmail },
          select: { systemRole: true },
        }),
        prisma.orgMembership.findUnique({
          where: { orgId_email: { orgId, email: requesterEmail } },
          select: { status: true },
        }),
      ]);

      const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
      const isActiveMember = membership?.status === "ACTIVE";
      if (!isSystemAdmin && !isActiveMember) {
        throw createHttpError(403, "organization access denied");
      }
    }

    const withSubscription = await attachOrganizationSubscription(organization);
    return ensureOrganizationAccessible(withSubscription, options);
  }

  if (requesterEmail) {
    const [systemUser, membership] = await Promise.all([
      prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      }),
      prisma.orgMembership.findFirst({
        where: {
          email: requesterEmail,
          status: "ACTIVE",
        },
        include: { organization: true },
        orderBy: { id: "asc" },
      }),
    ]);

    if (membership?.organization) {
      const withSubscription = await attachOrganizationSubscription(
        membership.organization
      );
      return ensureOrganizationAccessible(withSubscription, options);
    }

    if (systemUser?.systemRole === "SYSTEM_ADMIN") {
      return getPrimaryOrganization(options);
    }
  }

  return getPrimaryOrganization(options);
};

const getRequestAccessContext = async (req: Request, options: any = {}) => {
  const organization = await getOrganizationByQuery(req, options);
  if (!organization) return null;

  const requesterEmail = getRequesterEmail(req);
  if (!requesterEmail) {
    return {
      organization,
      requesterEmail: "",
      systemUser: null,
      orgMembership: null,
    };
  }

  const [systemUser, orgMembership] = await Promise.all([
    prisma.systemUser.findUnique({
      where: { email: requesterEmail },
      select: { systemRole: true },
    }),
    prisma.orgMembership.findUnique({
      where: {
        orgId_email: {
          orgId: organization.id,
          email: requesterEmail,
        },
      },
      select: { role: true, status: true },
    }),
  ]);

  return {
    organization,
    requesterEmail,
    systemUser,
    orgMembership,
  };
};

const requireOrgRole = async (
  req: Request,
  res: Response,
  options: {
    allowedRoles?: OrgUserRole[];
    allowSystemAdmin?: boolean;
    allowSuspended?: boolean;
  } = {}
) => {
  const {
    allowedRoles = ORG_ACCESS_ROLES,
    allowSystemAdmin = true,
    allowSuspended = false,
  } = options;
  let context = null;
  try {
    context = await getRequestAccessContext(req, { allowSuspended });
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    const message =
      typeof (error as any)?.message === "string"
        ? (error as any).message
        : "failed to resolve access context";
    res.status(status).json({ ok: false, error: message });
    return null;
  }
  if (!context?.organization) {
    res.status(404).json({ ok: false, error: "organization not found" });
    return null;
  }

  if (!context.requesterEmail) {
    res.status(401).json({ ok: false, error: "request user email is required" });
    return null;
  }

  const isSystemAdmin = context.systemUser?.systemRole === "SYSTEM_ADMIN";
  if (allowSystemAdmin && isSystemAdmin) return context;

  if (!context.orgMembership || context.orgMembership.status !== "ACTIVE") {
    res.status(403).json({ ok: false, error: "active org membership is required" });
    return null;
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(context.orgMembership.role as OrgUserRole)
  ) {
    res.status(403).json({ ok: false, error: "insufficient org role" });
    return null;
  }

  return context;
};

const requireSystemAdmin = async (req: Request, res: Response) => {
  const requesterEmail = getRequesterEmail(req);
  if (!requesterEmail) {
    res.status(401).json({ ok: false, error: "request user email is required" });
    return null;
  }

  const systemUser = await prisma.systemUser.findUnique({
    where: { email: requesterEmail },
    select: { systemRole: true },
  });
  if (systemUser?.systemRole !== "SYSTEM_ADMIN") {
    res.status(403).json({ ok: false, error: "system admin access required" });
    return null;
  }

  return { requesterEmail };
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
  const email = normalizeEmail(HARD_CODED_SYSTEM_ADMIN_EMAIL);
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

const ensureArray = (value: any): any[] => (Array.isArray(value) ? value : []);
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

  return { a, b, version, updatedAt, trainedPeriod };
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
    left.trainedPeriod === right.trainedPeriod
  );
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
    1
  );
  const hasCt = next.ct !== null && next.ct !== undefined;
  const hasAt = next.at !== null && next.at !== undefined;
  const isLikelyAutoCt =
    hasCt &&
    hasAt &&
    Math.abs(Number(next.ct) - Number(next.at)) < 1e-4;
  next.stManual =
    typeof next.stManual === "boolean" ? next.stManual : hasCt && !isLikelyAutoCt;
  if (next.stManual !== true && next.ct == null && next.at != null) {
    next.ct = next.at;
  }
  if ("referenceQuantity" in next) {
    delete (next as any).referenceQuantity;
  }
  return next;
};

const normalizeStyleProcesses = (value: any) =>
  ensureArray(value).map((process) => normalizeStyleProcess(process));

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

const normalizeComparableText = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

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

const syncStyleProcessActualTimesFromWorkRecords = async (orgId: number) => {
  const trainingMonthKey = resolveAtTrainingMonthKey({
    now: new Date(),
    timeZone: BUSINESS_TIME_ZONE,
    cutoffDay: AT_TRAINING_CUTOFF_DAY,
  });
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
          processName: true,
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

  const weightedByKey = new Map<string, { totalSeconds: number; totalQuantity: number }>();
  const matchedStyleUids = new Set<number>();
  const attendanceSecondsByWorkerDate = new Map<string, number>();

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

  workLogs.forEach((workLog) => {
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
        const processNameKey = normalizeProcessNameKey(record.processName);
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

    // AT 계산: 공정별로 그룹핑하여 공정별 투입 작업자 수 × 근무시간 / 생산수량
    // (전체 workerCount를 수량 비율로 배분하면 모든 공정 AT가 동일해지는 버그 발생)
    const perProcessGroups = new Map<
      string,
      { resolvedStyle: any; workerIds: Set<number>; totalQuantity: number }
    >();

    resolvedRows.forEach((row) => {
      const metricKey = row.processCodeKey
        ? toStyleProcessMetricKey(String(row.resolvedStyle.uid), "code", row.processCodeKey)
        : toStyleProcessMetricKey(String(row.resolvedStyle.uid), "name", row.processNameKey);

      const current = perProcessGroups.get(metricKey) || {
        resolvedStyle: row.resolvedStyle,
        workerIds: new Set<number>(),
        totalQuantity: 0,
      };
      if (row.workerId !== null) current.workerIds.add(row.workerId);
      current.totalQuantity += row.quantity;
      perProcessGroups.set(metricKey, current);
    });

    perProcessGroups.forEach((group, metricKey) => {
      if (group.totalQuantity <= 0) return;
      matchedStyleUids.add(group.resolvedStyle.uid);

      const workerSecondsForProcess =
        group.workerIds.size > 0
          ? Array.from(group.workerIds.values()).reduce(
              (sum, workerId) =>
                sum + resolveWorkerSecondsForDate(workDate, workerId, workLogFactoryId),
              0
            )
          : resolveWorkerSecondsForDate(workDate, null, workLogFactoryId);

      const current = weightedByKey.get(metricKey) || { totalSeconds: 0, totalQuantity: 0 };
      current.totalSeconds += workerSecondsForProcess;
      current.totalQuantity += group.totalQuantity;
      weightedByKey.set(metricKey, current);
    });
  });

  if (weightedByKey.size === 0) {
    return finish(0, 0, "no_weighted_metrics");
  }

  const styles = styleCandidates.filter((style) => matchedStyleUids.has(style.uid));

  let updatedStyles = 0;
  let updatedProcesses = 0;
  for (const style of styles) {
    const normalizedProcesses = normalizeStyleProcesses(style.processes);
    let changed = false;
    const nextProcesses = normalizedProcesses.map((process) => {
      if (!process || typeof process !== "object" || Array.isArray(process)) {
        return process;
      }

      const codeKey = normalizeProcessCodeKey((process as any).code);
      const nameKey = normalizeProcessNameKey((process as any).name);
      const metric =
        (codeKey
          ? weightedByKey.get(
              toStyleProcessMetricKey(String(style.uid), "code", codeKey)
            )
          : null) ||
        (nameKey
          ? weightedByKey.get(
              toStyleProcessMetricKey(String(style.uid), "name", nameKey)
            )
          : null);
      if (!metric || metric.totalQuantity <= 0) return process;

      const nextAt = toOptionalSeconds(metric.totalSeconds / metric.totalQuantity);
      const currentAt = toOptionalSeconds((process as any).at);
      if (nextAt === null) return process;
      const currentAtParams = toStyleAtParams((process as any).atParams);
      const shouldRefreshAtParams =
        currentAtParams === null ||
        currentAtParams.a !== nextAt ||
        currentAtParams.b !== 0 ||
        currentAtParams.trainedPeriod !== trainingMonthKey;
      const nextAtParams = shouldRefreshAtParams
        ? {
            a: nextAt,
            b: 0,
            version: (currentAtParams?.version ?? 0) + 1,
            updatedAt: new Date().toISOString(),
            trainedPeriod: trainingMonthKey,
          }
        : currentAtParams;
      const atParamsChanged = !isSameStyleAtParams(currentAtParams, nextAtParams);

      const isStManual = (process as any).stManual === true;
      const currentCt = toOptionalSeconds((process as any).ct);
      const nextCt = !isStManual ? nextAt : currentCt;
      const ctChanged =
        (currentCt ?? null) !== (nextCt ?? null);
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

  return finish(updatedStyles, updatedProcesses);
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
      totalQuantity: sumOrderItemQuantity(item),
    }));

const buildOrderId = () =>
  `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_CREATE_SERIALIZABLE_RETRIES = 2;

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
    status:
      resolveOptionalString(payload?.status, fallback?.status ?? "주문접수") ??
      "주문접수",
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
          return { order: created, created: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }
      );
    } catch (error) {
      const code = String((error as any)?.code || "");
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

const toOrderResponse = (order: any) => {
  const items = normalizeOrderItems(order?.items);
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
    status: order.status ?? "",
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
      styleName: resolveOptionalString(record.styleName, null),
      processCode: resolveOptionalString(record.processCode, null),
      processName: resolveOptionalString(record.processName, null),
      colorId: toNumberOrNull(record.colorId),
      colorCode: resolveOptionalString(record.colorCode, null),
      colorName: resolveOptionalString(record.colorName, null),
      ctSeconds: toNonNegativeInt(record.ctSeconds, 0),
      quantity,
      assignmentPlanId: toPositiveIntOrNull(record.assignmentPlanId),
    });
  });

  return { rows, invalidWorkerRecordIndex };
};
const toWorkRecordResponse = (record: any) => ({
  workerId: record?.workerId ?? null,
  workerName: record?.workerName ?? "",
  customerName: record?.customerName ?? "",
  styleId: record?.styleId ?? "",
  styleName: record?.styleName ?? "",
  processCode: record?.processCode ?? "",
  processName: record?.processName ?? "",
  colorId: record?.colorId ?? null,
  colorCode: record?.colorCode ?? "",
  colorName: record?.colorName ?? "",
  ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
  quantity: toNonNegativeInt(record?.quantity, 0),
  assignmentPlanId: record?.assignmentPlanId ?? null,
});
const normalizeWorkLogPayload = (payload: any = {}, fallback: any = null) => {
  const workDateInput =
    payload?.workDate !== undefined ? payload.workDate : fallback?.workDate;
  const normalizedWorkDate = normalizeDateKey(workDateInput) || todayDateKey();
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
const toWorkLogResponse = (workLog: any) => ({
  id: workLog.id,
  workDate: workLog.workDate,
  factoryId: workLog.factoryId ?? null,
  factoryName: workLog.factoryName ?? "",
  factoryWagePerSecond: workLog.factoryWagePerSecond ?? null,
  ctBasis: workLog.ctBasis ?? "CT",
  workerCount: workLog.workerCount ?? 0,
  itemCount: workLog.itemCount ?? 0,
  totalContractedSeconds: workLog.totalContractedSeconds ?? 0,
  note: workLog.note ?? "",
  records:
    Array.isArray(workLog?.workRecords) && workLog.workRecords.length > 0
      ? workLog.workRecords.map(toWorkRecordResponse)
      : ensureArray(workLog.records),
  createdAt: workLog.createdAt,
  updatedAt: workLog.updatedAt,
});
const ASSIGNMENT_CT_STATUSES = new Set(["PENDING", "AGREED", "REJECTED"]);
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
const resolveAssignmentPlanExternalIds = (items: any) =>
  ensureArray(items)
    .map((item) => resolveOptionalString(item?.id ?? item?.externalId, null))
    .filter((value): value is string => Boolean(value));
const mergeAssignmentPlanResponsesWithState = (plans: any[], stateAssignments: any[]) => {
  const stateByExternalId = ensureArray(stateAssignments).reduce((map, item) => {
    if (!item || typeof item !== "object") return map;
    const externalId = resolveOptionalString(item.id ?? item.externalId, null);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());

  return ensureArray(plans).map((plan) => {
    const base = toAssignmentPlanResponse(plan);
    const stateItem = stateByExternalId.get(base.id);
    if (!stateItem || typeof stateItem !== "object") return base;
    return {
      ...stateItem,
      ...base,
      id: base.id,
      lineId: String(base.lineId),
      ctOverride: Boolean(stateItem.ctOverride),
    };
  });
};
const toAssignmentPlanResponse = (plan: any) => ({
  id: plan.externalId,
  lineId: String(plan.lineId),
  cardId: plan.cardId ?? "",
  orderNo: plan.orderNo ?? "",
  customer: plan.customer ?? "",
  label: plan.label ?? "",
  colorName: plan.colorName ?? "",
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

      const startIndex = toNonNegativeInt(item.startIndex, 0);
      const endIndex = Math.max(startIndex, toNonNegativeInt(item.endIndex, startIndex));
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
const toAssignmentBoardStateResponse = (state: any, assignmentPlans: any[] | null = null) => ({
  cards: ensureArray(state?.cards),
  assignments: Array.isArray(assignmentPlans) && assignmentPlans.length > 0
    ? mergeAssignmentPlanResponsesWithState(assignmentPlans, ensureArray(state?.assignments))
    : ensureArray(state?.assignments),
  createdAt: state?.createdAt ?? null,
  updatedAt: state?.updatedAt ?? null,
});

const updateLineHeadcounts = async (lineIds: number[]): Promise<Record<number, number>> => {
  if (lineIds.length === 0) return {};
  const uniqueIds = [...new Set(lineIds)];
  const result: Record<number, number> = {};
  await Promise.all(
    uniqueIds.map(async (lineId) => {
      const count = await prisma.lineAssignment.count({
        where: { lineId, endAt: null },
      });
      result[lineId] = count;
    })
  );
  return result;
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
    prisma.attrRole.createMany({
      data: DEFAULT_ATTRIBUTES.roles.map((item) => ({ ...item, orgId })),
      skipDuplicates: true,
    }),
    prisma.attrProcess.createMany({
      data: DEFAULT_ATTRIBUTES.processes.map((item) => ({ ...item, orgId })),
      skipDuplicates: true,
    }),
  ]);
};

const syncSection = async (model: any, orgId: number, items: any, options: any = {}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await model.findMany({
    where: { orgId },
    select: { id: true },
  });
  const existingIds = existing.map((item: any) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id: any) => !incomingIdSet.has(id));
  if (deleteIds.length > 0 && typeof options.beforeDeleteIds === "function") {
    await options.beforeDeleteIds(deleteIds);
  }
  if (deleteIds.length > 0) {
    await model.deleteMany({ where: { orgId, id: { in: deleteIds } } });
  }

  const creates = [];
  const updates = [];

  for (const item of safeItems) {
    const code = (item.code ?? "").trim();
    const name = (item.name ?? "").trim();

    if (!code && !name) {
      continue;
    }

    if (isNumericId(item.id)) {
      updates.push(
        model.updateMany({
          where: { id: toId(item.id), orgId },
          data: { code, name },
        })
      );
    } else {
      creates.push({ orgId, code, name });
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/context", async (req, res) => {
  const requesterEmail = normalizeEmail(req.query.email) || getRequesterEmail(req);
  if (!requesterEmail || !requesterEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  // Auto-provision system admin on first login
  if (requesterEmail === HARD_CODED_SYSTEM_ADMIN_EMAIL) {
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
    return res.json({
      email: requesterEmail,
      entryType: "SYSTEM",
      systemRole: systemUser.systemRole,
      orgId: null,
      orgName: null,
      orgType: null,
      orgRole: null,
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
  });
});

app.get("/organizations", async (_req, res) => {
  const organizations = await prisma.organization.findMany({
    orderBy: { id: "asc" },
  });
  const withSubscriptions = await Promise.all(
    organizations.map((organization) => attachOrganizationSubscription(organization))
  );
  res.json(withSubscriptions.map(toOrganizationResponse));
});

app.get("/organizations/primary", async (_req, res) => {
  const organization = await getPrimaryOrganization({ allowSuspended: true });
  res.json(toOrganizationResponse(organization));
});

const listOrgMemberships = async (req: Request, res: Response) => {
  let organization = null;
  try {
    organization = await getOrganizationByQuery(req);
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    const message =
      typeof (error as any)?.message === "string"
        ? (error as any).message
        : "failed to resolve organization";
    return res.status(status).json({ ok: false, error: message });
  }
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const status = resolveStatus(req.query.status);
  const email = normalizeEmail(req.query.email);
  const where = {
    orgId: organization.id,
    ...(status ? { status } : {}),
    ...(email ? { email } : {}),
  };
  const members = await prisma.orgMembership.findMany({
    where,
    orderBy: { id: "asc" },
  });
  res.json(members);
};

app.get("/org-memberships", listOrgMemberships);

app.post("/org-memberships/apply", async (req, res) => {
  const { orgId, email, role } = req.body ?? {};
  const orgIdNum = Number(orgId);
  const normalizedEmail = normalizeEmail(email);

  if (!Number.isFinite(orgIdNum)) {
    return res.status(400).json({ ok: false, error: "orgId is required" });
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgIdNum },
  });

  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const safeRole = resolveRole(role, "WORKER");
  const existing = await prisma.orgMembership.findUnique({
    where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      return res.json(existing);
    }

    const updated = await prisma.orgMembership.update({
      where: { id: existing.id },
      data: {
        role: safeRole,
        status: "PENDING",
        requestedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
      },
    });
    return res.json(updated);
  }

  const record = await prisma.orgMembership.create({
    data: {
      orgId: orgIdNum,
      email: normalizedEmail,
      role: safeRole,
      status: "PENDING",
      requestedAt: new Date(),
    },
  });

  res.status(201).json(record);
});

app.patch("/org-memberships/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { role, approvedBy, factoryId, employeeRoleId } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  const nextRole = resolveRole(role, membership.role);
  let factoryIdNum = null;
  if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
    const parsedFactoryId = Number(factoryId);
    if (!Number.isFinite(parsedFactoryId)) {
      return res.status(400).json({ ok: false, error: "invalid factoryId" });
    }
    factoryIdNum = parsedFactoryId;
  }
  let employeeRoleIdNum = null;
  if (employeeRoleId !== "" && employeeRoleId !== null && employeeRoleId !== undefined) {
    const parsedRoleId = Number(employeeRoleId);
    if (!Number.isFinite(parsedRoleId)) {
      return res.status(400).json({ ok: false, error: "invalid employeeRoleId" });
    }
    employeeRoleIdNum = parsedRoleId;
  }
  if (!isManufacturerOrg(membership.organization) && factoryIdNum) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  if (isManufacturerOrg(membership.organization) && factoryIdNum) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: membership.orgId },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }
  if (employeeRoleIdNum) {
    const attrRole = await prisma.attrRole.findFirst({
      where: { id: employeeRoleIdNum, orgId: membership.orgId },
    });
    if (!attrRole) {
      return res.status(404).json({ ok: false, error: "role not found" });
    }
  }
  const updated = await prisma.orgMembership.update({
    where: { id },
    data: {
      role: nextRole,
      status: "ACTIVE",
      approvedAt: new Date(),
      approvedBy: normalizedApprovedBy || membership.approvedBy || null,
    },
  });

  if (isManufacturerOrg(membership.organization)) {
    const now = new Date();
    const existingEmployee = await prisma.employee.findUnique({
      where: { orgMembershipId: membership.id },
    });
    await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: {
        orgId: membership.orgId,
        factoryId: factoryIdNum,
        roleId: employeeRoleIdNum,
        joinedAt: existingEmployee?.joinedAt ?? now,
        leftAt: null,
        leaveStartAt: null,
        leaveEndAt: null,
      },
      create: {
        orgId: membership.orgId,
        orgMembershipId: membership.id,
        factoryId: factoryIdNum,
        roleId: employeeRoleIdNum,
        joinedAt: now,
      },
    });
  }

  res.json(updated);
});

app.patch("/org-memberships/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { approvedBy } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  const now = new Date();
  const employee = await prisma.employee.findUnique({
    where: { orgMembershipId: membership.id },
  });
  if (employee) {
    await closeActiveLineAssignments(employee.id, now);
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        leftAt: employee.leftAt ?? now,
        leaveStartAt: employee.leaveStartAt ?? now,
        leaveEndAt: employee.leaveEndAt ?? now,
      },
    });
  }

  const updated = await prisma.orgMembership.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedAt: now,
      approvedBy: normalizedApprovedBy || membership.approvedBy || null,
    },
  });

  res.json(updated);
});

app.patch("/org-memberships/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { role, status, approvedBy } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  if (role === undefined && status === undefined) {
    return res
      .status(400)
      .json({ ok: false, error: "role or status is required" });
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  const nextRole = role ? resolveRole(role, membership.role) : membership.role;
  const nextStatus = status ? resolveStatus(status) : null;
  if (status && !nextStatus) {
    return res.status(400).json({ ok: false, error: "invalid status" });
  }

  const data: any = {
    role: nextRole,
    status: nextStatus ?? membership.status,
  };

  if (nextStatus && nextStatus !== membership.status) {
    data.approvedBy = normalizedApprovedBy || membership.approvedBy || null;
    if (nextStatus === "ACTIVE") {
      data.approvedAt = membership.approvedAt || new Date();
    }
  }

  const updated = await prisma.orgMembership.update({
    where: { id },
    data,
  });

  if (isManufacturerOrg(membership.organization)) {
    const now = new Date();
    const existingEmployee = await prisma.employee.findUnique({
      where: { orgMembershipId: membership.id },
    });

    const currentStatus = data.status ?? membership.status;
    const employeeData: any = {
      orgId: membership.orgId,
    };

    if (currentStatus === "ACTIVE") {
      employeeData.joinedAt = existingEmployee?.joinedAt ?? now;
      if (membership.status === "SUSPENDED") {
        employeeData.leaveEndAt = now;
      } else if (membership.status === "TERMINATED") {
        employeeData.leaveStartAt = null;
        employeeData.leaveEndAt = null;
      }
      employeeData.leftAt = null;
    } else if (currentStatus === "SUSPENDED") {
      employeeData.leaveStartAt = existingEmployee?.leaveStartAt ?? now;
      employeeData.leaveEndAt = null;
      employeeData.leftAt = null;
    } else if (currentStatus === "TERMINATED") {
      employeeData.leftAt = now;
    }

    const upsertedEmployee = await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: employeeData,
      create: {
        orgMembershipId: membership.id,
        joinedAt: existingEmployee?.joinedAt ?? now,
        ...employeeData,
      },
    });

    if (currentStatus !== "ACTIVE") {
      await closeActiveLineAssignments(upsertedEmployee.id, now);
    }
  }

  res.json(updated);
});

app.get("/employees", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const factoryId = Number(req.query.factoryId);
  const membershipRole = typeof req.query.membershipRole === "string"
    ? req.query.membershipRole.toUpperCase()
    : null;
  const where: any = {
    orgId: organization.id,
    ...(Number.isFinite(factoryId) ? { factoryId } : {}),
    ...(membershipRole
      ? { membership: { role: membershipRole as any } }
      : {}),
  };
  const employees = await prisma.employee.findMany({
    where,
    orderBy: { id: "asc" },
  });
  res.json(employees);
});

app.post("/employees", async (req, res) => {
  const {
    orgMembershipId,
    factoryId,
    position,
    roleId,
    name,
    bankName,
    bankAccountNumber,
  } = req.body ?? {};
  const orgMembershipIdNum = Number(orgMembershipId);

  if (!Number.isFinite(orgMembershipIdNum)) {
    return res
      .status(400)
      .json({ ok: false, error: "orgMembershipId is required" });
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { id: orgMembershipIdNum },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  if (membership.status !== "ACTIVE") {
    return res
      .status(400)
      .json({ ok: false, error: "membership is not active" });
  }

  let factoryIdNum = null;
  if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
    const parsedFactoryId = Number(factoryId);
    if (!Number.isFinite(parsedFactoryId)) {
      return res.status(400).json({ ok: false, error: "invalid factoryId" });
    }
    factoryIdNum = parsedFactoryId;
  }

  if (!isManufacturerOrg(membership.organization) && factoryIdNum) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }

  if (isManufacturerOrg(membership.organization) && factoryIdNum) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: membership.orgId },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  let roleIdNum = null;
  if (roleId !== "" && roleId !== null && roleId !== undefined) {
    const parsedRoleId = Number(roleId);
    if (!Number.isFinite(parsedRoleId)) {
      return res.status(400).json({ ok: false, error: "invalid roleId" });
    }
    const attrRole = await prisma.attrRole.findFirst({
      where: { id: parsedRoleId, orgId: membership.orgId },
    });
    if (!attrRole) {
      return res.status(404).json({ ok: false, error: "role not found" });
    }
    roleIdNum = parsedRoleId;
  }

  const existingEmployee = await prisma.employee.findUnique({
    where: { orgMembershipId: membership.id },
  });
  const resolvedFactoryId = isManufacturerOrg(membership.organization)
    ? factoryIdNum !== null && factoryIdNum !== undefined
      ? factoryIdNum
      : existingEmployee?.factoryId ?? null
    : null;
  const resolvedRoleId =
    roleIdNum !== null && roleIdNum !== undefined
      ? roleIdNum
      : existingEmployee?.roleId ?? null;

  const data = {
    orgId: membership.orgId,
    orgMembershipId: membership.id,
    factoryId: resolvedFactoryId,
    roleId: resolvedRoleId,
    name: resolveOptionalString(name, existingEmployee?.name ?? null),
    bankName: resolveOptionalString(bankName, existingEmployee?.bankName ?? null),
    bankAccountNumber: resolveOptionalString(
      bankAccountNumber,
      existingEmployee?.bankAccountNumber ?? null
    ),
    position: resolveOptionalString(position, existingEmployee?.position ?? null),
  };

  const employee = await prisma.employee.upsert({
    where: { orgMembershipId: membership.id },
    update: data,
    create: data,
  });

  const activeAssignment = await prisma.lineAssignment.findFirst({
    where: {
      employeeId: employee.id,
      endAt: null,
      line: { orgId: membership.orgId },
    },
    include: {
      line: {
        select: { name: true },
      },
    },
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
  });

  const syncedLineName = activeAssignment?.line?.name ?? null;
  const refreshedEmployee = await prisma.employee.update({
    where: { id: employee.id },
    data: { lineName: syncedLineName },
  });

  res.json(refreshedEmployee);
});

app.get("/factories", async (req, res) => {
  const organization = await getOrganizationByQuery(req);

  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const factories = await prisma.factory.findMany({
    where: { orgId: organization.id },
    orderBy: { id: "asc" },
  });
  res.json(factories);
});

app.post("/factories", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  const {
    name,
    address,
    countryCode,
    phoneNumber,
    manager,
    targetMonthlyWage,
    wagePerSecond,
  } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);

  const factory = await prisma.factory.create({
    data: {
      orgId: organization.id,
      name: name.trim(),
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      targetMonthlyWage: wageFields.targetMonthlyWage,
      wagePerSecond: wageFields.wagePerSecond,
    },
  });

  res.status(201).json(factory);
});

app.put("/factories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  const existing = await prisma.factory.findFirst({
    where: { id, orgId: organization.id },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const {
    name,
    address,
    countryCode,
    phoneNumber,
    manager,
    targetMonthlyWage,
    wagePerSecond,
  } = req.body ?? {};
  const wageFields = resolveFactoryWageFields(targetMonthlyWage, wagePerSecond);

  const factory = await prisma.factory.update({
    where: { id },
    data: {
      name: typeof name === "string" ? name.trim() : existing.name,
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      targetMonthlyWage: wageFields.targetMonthlyWage,
      wagePerSecond: wageFields.wagePerSecond,
    },
  });

  res.json(factory);
});

app.delete("/factories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }

  const existing = await prisma.factory.findFirst({
    where: { id, orgId: organization.id },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const deleted = await prisma.$transaction(
    async (tx) => {
      const lines = await tx.line.findMany({
        where: { orgId: organization.id, factoryId: existing.id },
        select: { id: true },
      });
      const lineIds = lines.map((line) => line.id);

      const employees = await tx.employee.findMany({
        where: { orgId: organization.id, factoryId: existing.id },
        select: { id: true, orgMembershipId: true },
      });
      const employeeIds = employees.map((employee) => employee.id);
      const membershipIds = employees.map((employee) => employee.orgMembershipId);

      if (employeeIds.length > 0) {
        await tx.line.updateMany({
          where: {
            orgId: organization.id,
            managerEmployeeId: { in: employeeIds },
          },
          data: { managerEmployeeId: null },
        });
      }

      let deletedAssignmentPlans = 0;
      if (lineIds.length > 0) {
        const result = await tx.assignmentPlan.deleteMany({
          where: {
            orgId: organization.id,
            lineId: { in: lineIds },
          },
        });
        deletedAssignmentPlans = result.count;
      }

      let deletedLineAssignments = 0;
      const assignmentWhereOr: any[] = [];
      if (lineIds.length > 0) {
        assignmentWhereOr.push({ lineId: { in: lineIds } });
      }
      if (employeeIds.length > 0) {
        assignmentWhereOr.push({ employeeId: { in: employeeIds } });
      }
      if (assignmentWhereOr.length > 0) {
        const result = await tx.lineAssignment.deleteMany({
          where: { OR: assignmentWhereOr },
        });
        deletedLineAssignments = result.count;
      }

      let deletedLines = 0;
      if (lineIds.length > 0) {
        const result = await tx.line.deleteMany({
          where: {
            orgId: organization.id,
            id: { in: lineIds },
          },
        });
        deletedLines = result.count;
      }

      let deletedEmployees = 0;
      if (employeeIds.length > 0) {
        const result = await tx.employee.deleteMany({
          where: {
            orgId: organization.id,
            id: { in: employeeIds },
          },
        });
        deletedEmployees = result.count;
      }

      let deletedMemberships = 0;
      if (membershipIds.length > 0) {
        const result = await tx.orgMembership.deleteMany({
          where: {
            orgId: organization.id,
            id: { in: membershipIds },
          },
        });
        deletedMemberships = result.count;
      }

      await tx.factory.delete({ where: { id: existing.id } });

      return {
        deletedLineAssignments,
        deletedAssignmentPlans,
        deletedLines,
        deletedEmployees,
        deletedMemberships,
      };
    },
    { maxWait: 20_000, timeout: 120_000 }
  );

  res.json({
    ok: true,
    deletedFactoryId: existing.id,
    deletedFactoryName: existing.name,
    ...deleted,
  });
});

app.get("/lines", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
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

  const lines = await prisma.line.findMany({
    where: {
      orgId: organization.id,
      ...(hasFactoryFilter ? { factoryId } : {}),
    },
    orderBy: [{ factoryId: "asc" }, { id: "asc" }],
  });

  res.json(lines);
});

app.post("/lines", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { factoryId, name } = req.body ?? {};
  const factoryIdNum = Number(factoryId);
  if (!Number.isFinite(factoryIdNum)) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryIdNum, orgId: organization.id },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const existingLine = await prisma.line.findFirst({
    where: { factoryId: factoryIdNum, orgId: organization.id, name: trimmedName },
  });
  if (existingLine) {
    return res.status(409).json({ ok: false, error: "line already exists" });
  }

  const line = await prisma.line.create({
    data: {
      orgId: organization.id,
      factoryId: factoryIdNum,
      name: trimmedName,
    },
  });

  res.status(201).json(line);
});

app.patch("/lines/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const existing = await prisma.line.findFirst({
    where: { id, orgId: organization.id },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "line not found" });
  }

  const { name, isActive, managerEmployeeId } = req.body ?? {};
  const data: any = {};

  if (typeof name === "string") {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const nameConflict = await prisma.line.findFirst({
      where: {
        factoryId: existing.factoryId,
        orgId: organization.id,
        name: trimmedName,
        NOT: { id: existing.id },
      },
    });
    if (nameConflict) {
      return res.status(409).json({ ok: false, error: "line already exists" });
    }
    data.name = trimmedName;
  }

  if (isActive !== undefined) {
    data.isActive = Boolean(isActive);
  }

  if (managerEmployeeId !== undefined) {
    if (managerEmployeeId === null || managerEmployeeId === "") {
      data.managerEmployeeId = null;
    } else {
      const managerIdNum = Number(managerEmployeeId);
      if (!Number.isFinite(managerIdNum)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid managerEmployeeId" });
      }

      const manager = await prisma.employee.findFirst({
        where: {
          id: managerIdNum,
          orgId: organization.id,
          factoryId: existing.factoryId,
          membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
        },
        include: { membership: true },
      });
      if (!manager) {
        return res
          .status(404)
          .json({ ok: false, error: "manager not found" });
      }

      const activeAssignment = await prisma.lineAssignment.findFirst({
        where: { lineId: existing.id, employeeId: manager.id, endAt: null },
      });
      if (!activeAssignment) {
        return res.status(400).json({
          ok: false,
          error: "manager must be assigned to the line first",
        });
      }

      data.managerEmployeeId = manager.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, error: "no changes provided" });
  }

  const updated = await prisma.line.update({
    where: { id: existing.id },
    data,
  });

  if (typeof data.name === "string" && data.name.trim()) {
    await prisma.employee.updateMany({
      where: {
        orgId: organization.id,
        lineAssignments: {
          some: {
            lineId: updated.id,
            endAt: null,
          },
        },
      },
      data: { lineName: updated.name },
    });
  }

  res.json(updated);
});

app.get("/line-workers", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
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

  const [workers, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
        membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
      },
      include: { membership: true },
      orderBy: [{ factoryId: "asc" }, { id: "asc" }],
    }),
    prisma.lineAssignment.findMany({
      where: {
        line: {
          orgId: organization.id,
          ...(hasFactoryFilter ? { factoryId } : {}),
        },
        endAt: null,
      },
      select: { employeeId: true, lineId: true },
    }),
  ]);

  const assignmentByEmployee = new Map();
  assignments.forEach((assignment) => {
    assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
  });

  res.json(
    workers.map((worker) => ({
      id: worker.id,
      orgMembershipId: worker.orgMembershipId,
      name: worker.name,
      email: worker.membership?.email ?? "",
      factoryId: worker.factoryId,
      currentLineId: assignmentByEmployee.get(worker.id) ?? null,
    }))
  );
});

app.post("/line-assignments/assign", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { lineId, employeeId } = req.body ?? {};
  const lineIdNum = Number(lineId);
  const employeeIdNum = Number(employeeId);
  if (!Number.isFinite(lineIdNum) || !Number.isFinite(employeeIdNum)) {
    return res.status(400).json({
      ok: false,
      error: "lineId and employeeId are required",
    });
  }

  const line = await prisma.line.findFirst({
    where: { id: lineIdNum, orgId: organization.id },
  });
  if (!line) {
    return res.status(404).json({ ok: false, error: "line not found" });
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeIdNum,
      orgId: organization.id,
      factoryId: line.factoryId,
      membership: { role: { in: LINE_ELIGIBLE_ROLES }, status: "ACTIVE" },
    },
    include: { membership: true },
  });
  if (!employee) {
    return res.status(404).json({ ok: false, error: "worker not found" });
  }

  const now = new Date();
  const previousLineIds = await closeActiveLineAssignments(employee.id, now);

  const assignment = await prisma.lineAssignment.create({
    data: {
      lineId: line.id,
      employeeId: employee.id,
      startAt: now,
    },
  });

  await prisma.employee.update({
    where: { id: employee.id },
    data: { lineName: line.name },
  });

  const affectedLineIds = [...new Set([...previousLineIds, line.id])];
  const lineHeadcounts = await updateLineHeadcounts(affectedLineIds);

  res.status(201).json({ ...assignment, lineHeadcounts });
});

app.post("/line-assignments/unassign", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { employeeId } = req.body ?? {};
  const employeeIdNum = Number(employeeId);
  if (!Number.isFinite(employeeIdNum)) {
    return res
      .status(400)
      .json({ ok: false, error: "employeeId is required" });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeIdNum, orgId: organization.id },
  });
  if (!employee) {
    return res.status(404).json({ ok: false, error: "worker not found" });
  }

  const affectedLineIds = await closeActiveLineAssignments(employee.id, new Date());
  const lineHeadcounts = await updateLineHeadcounts(affectedLineIds);

  res.json({ ok: true, lineHeadcounts });
});

app.get("/assignment-plans", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const lineId = Number(req.query.lineId);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return res.status(400).json({ ok: false, error: "lineId is required" });
  }

  const boardState = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
    select: { assignments: true },
  });
  const activeExternalIds = resolveAssignmentPlanExternalIds(boardState?.assignments);
  const hasBoardAssignments = Array.isArray(boardState?.assignments);
  if (hasBoardAssignments && activeExternalIds.length === 0) {
    return res.json([]);
  }

  const plans = await prisma.assignmentPlan.findMany({
    where: {
      orgId: organization.id,
      lineId,
      ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
    },
    orderBy: [{ startIndex: "asc" }, { id: "asc" }],
  });

  res.json(
    plans.map((plan) => ({
      dbId: plan.id,
      id: plan.externalId,
      lineId: String(plan.lineId),
      orderNo: plan.orderNo ?? "",
      label: plan.label ?? "",
      customer: plan.customer ?? "",
      colorName: plan.colorName ?? "",
      color: plan.color ?? "",
      quantity: plan.quantity ?? null,
      contractedSeconds: plan.contractedSeconds ?? null,
      ctStatus: resolveAssignmentCtStatus(plan.ctStatus),
      startIndex: plan.startIndex,
      endIndex: plan.endIndex,
      isCompleted: plan.isCompleted,
      finalQuantity: plan.finalQuantity ?? null,
      completedAt: plan.completedAt ?? null,
    }))
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
  const aggregates =
    planIds.length > 0
      ? await prisma.workRecord.groupBy({
          by: ["assignmentPlanId"],
          where: {
            orgId,
            assignmentPlanId: { in: planIds },
          },
          _sum: { quantity: true },
        })
      : [];
  const producedByPlanId = new Map(
    aggregates.map((row) => [Number(row.assignmentPlanId), Number(row._sum.quantity ?? 0)])
  );

  return plans.map((plan) => {
    const planId = Number(plan.id);
    const producedQuantity = Math.max(0, Math.round(Number(producedByPlanId.get(planId) ?? 0)));
    const plannedQuantity = toOptionalNonNegativeInt(plan.quantity, null);
    const finalQuantity = toOptionalNonNegativeInt(plan.finalQuantity, null);
    const baselineQuantityRaw =
      finalQuantity != null && finalQuantity > 0
        ? finalQuantity
        : plannedQuantity != null && plannedQuantity > 0
          ? plannedQuantity
          : null;
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

app.get("/assignment-overruns", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const rows = await buildAssignmentPlanProgressRows(organization.id);
  res.json(rows.filter((row) => row.isOverflow));
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
  syncStyleProcessActualTimesFromWorkRecords(organization.id).catch((err) => {
    console.error("[AT sync] Attendance PUT 후 실패:", err?.message);
  });
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
      workRecords: {
        orderBy: { id: "asc" },
      },
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
      error: `records[${normalized.invalidWorkerRecordIndex}].workerId is required`,
    });
  }
  if (normalized.factoryId !== null) {
    const factory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const { records, invalidWorkerRecordIndex: _invalidWorkerRecordIndex, ...workLogData } =
      normalized;
    const next = await tx.workLog.create({
      data: {
        orgId: organization.id,
        ...workLogData,
        // Keep the legacy JSON column empty and persist normalized rows in WorkRecord.
        records: [],
      },
    });

    if (records.length > 0) {
      await tx.workRecord.createMany({
        data: records.map((record) => ({
          orgId: organization.id,
          workLogId: next.id,
          ...record,
        })),
      });
    }

    return next;
  }, { timeout: 30000 });
  const createdWithRecords = await prisma.workLog.findUnique({
    where: { id: created.id },
    include: {
      workRecords: {
        orderBy: { id: "asc" },
      },
    },
  });
  res.status(201).json(toWorkLogResponse(createdWithRecords ?? created));
  // AT는 참고값이므로 응답 후 백그라운드에서 동기화
  syncStyleProcessActualTimesFromWorkRecords(organization.id).catch((err) => {
    console.error("[AT sync] WorkLog POST 후 실패:", err?.message);
  });
});

app.put("/work-logs/:id", async (req, res) => {
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
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }

  const normalized = normalizeWorkLogPayload(req.body ?? {}, existing);
  if (normalized.invalidWorkerRecordIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `records[${normalized.invalidWorkerRecordIndex}].workerId is required`,
    });
  }
  if (normalized.factoryId !== null) {
    const factory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { records, invalidWorkerRecordIndex: _invalidWorkerRecordIndex, ...workLogData } =
      normalized;
    const next = await tx.workLog.update({
      where: { id: existing.id },
      data: {
        ...workLogData,
        records: [],
      },
    });

    await tx.workRecord.deleteMany({
      where: { orgId: organization.id, workLogId: existing.id },
    });

    if (records.length > 0) {
      await tx.workRecord.createMany({
        data: records.map((record) => ({
          orgId: organization.id,
          workLogId: existing.id,
          ...record,
        })),
      });
    }

    return next;
  }, { timeout: 30000 });
  const updatedWithRecords = await prisma.workLog.findUnique({
    where: { id: updated.id },
    include: {
      workRecords: {
        orderBy: { id: "asc" },
      },
    },
  });
  res.json(toWorkLogResponse(updatedWithRecords ?? updated));
  syncStyleProcessActualTimesFromWorkRecords(organization.id).catch((err) => {
    console.error("[AT sync] WorkLog PUT 후 실패:", err?.message);
  });
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
  syncStyleProcessActualTimesFromWorkRecords(organization.id).catch((err) => {
    console.error("[AT sync] WorkLog DELETE 후 실패:", err?.message);
  });
});

app.get("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
  });
  const activeExternalIds = resolveAssignmentPlanExternalIds(state?.assignments);
  const hasBoardAssignments = Array.isArray(state?.assignments);
  const assignmentPlans =
    hasBoardAssignments && activeExternalIds.length === 0
      ? []
      : await prisma.assignmentPlan.findMany({
          where: {
            orgId: organization.id,
            ...(hasBoardAssignments ? { externalId: { in: activeExternalIds } } : {}),
          },
          orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
        });

  res.json(toAssignmentBoardStateResponse(state, assignmentPlans));
});

app.put("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const cards = ensureArray(req.body?.cards);
  const assignments = ensureArray(req.body?.assignments);
  const lineRows = await prisma.line.findMany({
    where: { orgId: organization.id },
    select: { id: true },
  });
  const lineIdSet = new Set(lineRows.map((line) => line.id));
  const normalizedPlans = normalizeAssignmentPlanPayload(assignments, lineIdSet);

  const updated = await prisma.$transaction(async (tx) => {
    const state = await tx.assignmentBoardState.upsert({
      where: { orgId: organization.id },
      update: { cards, assignments },
      create: {
        orgId: organization.id,
        cards,
        assignments,
      },
    });

    const existingPlans = await tx.assignmentPlan.findMany({
      where: { orgId: organization.id },
      select: { id: true, externalId: true },
    });
    const existingByExternalId = new Map(
      existingPlans.map((plan) => [plan.externalId, plan])
    );
    const incomingExternalIdSet = new Set(
      normalizedPlans.map((item: any) => item.externalId)
    );

    for (const item of normalizedPlans) {
      const existing = existingByExternalId.get(item.externalId);
      if (existing) {
        await tx.assignmentPlan.update({
          where: { id: existing.id },
          data: {
            lineId: item.lineId,
            cardId: item.cardId ?? null,
            orderNo: item.orderNo ?? null,
            customer: item.customer ?? null,
            label: item.label ?? null,
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
          },
        });
        continue;
      }

      await tx.assignmentPlan.create({
        data: {
          orgId: organization.id,
          ...item,
        },
      });
    }

    const obsoletePlans = existingPlans.filter(
      (plan) => !incomingExternalIdSet.has(plan.externalId)
    );
    for (const obsolete of obsoletePlans) {
      const linkedWorkRecord = await tx.workRecord.findFirst({
        where: { assignmentPlanId: obsolete.id },
        select: { id: true },
      });
      if (linkedWorkRecord) continue;
      await tx.assignmentPlan.delete({
        where: { id: obsolete.id },
      });
    }

    return state;
  }, { timeout: 30000 });
  const persistedPlans =
    normalizedPlans.length > 0
      ? await prisma.assignmentPlan.findMany({
          where: {
            orgId: organization.id,
            externalId: { in: normalizedPlans.map((item: any) => item.externalId) },
          },
          orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
        })
      : [];

  res.json(toAssignmentBoardStateResponse(updated, persistedPlans));
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

  const updated = await prisma.workOrder.update({
    where: { id: existing.id },
    data: {
      ...normalized,
      orgId: buyer.id,
    },
  });

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
  if ((existing.status || "").replace(/\s+/g, "").trim() !== "주문접수") {
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

  const relatedOrders = await prisma.workOrder.findMany({
    where: {
      OR: [{ orgId: existing.orgId }, { buyerOrgId: existing.orgId }],
    },
    select: { orderId: true, orderNumber: true, items: true },
  });
  const inUseOrder = relatedOrders.find((order) =>
    ensureArray(order.items).some(
      (item) => String(item?.styleId || "").trim() === styleId
    )
  );
  if (inUseOrder) {
    const orderLabel = inUseOrder.orderNumber || inUseOrder.orderId;
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
    if ((error as any)?.code === "P2025") {
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
    .map((item: any) => ({
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
    prisma.attrRole.findMany({
      where: { orgId: organization.id },
      orderBy: { id: "asc" },
    }),
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
      syncSection(prisma.attrColor, organization.id, payload.colors).then(
        (data) => {
          response.colors = data;
        }
      )
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
      syncSection(prisma.attrRole, organization.id, payload.roles, {
        beforeDeleteIds: async (deleteIds: number[]) => {
          await prisma.employee.updateMany({
            where: {
              orgId: organization.id,
              roleId: { in: deleteIds },
            },
            data: { roleId: null },
          });
        },
      }).then(
        (data) => {
          response.roles = data;
        }
      )
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

app.post("/organizations", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const {
    name,
    code,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  const organization = await prisma.organization.create({
    data: {
      name,
      code: normalizedCode,
      businessNumber,
      representative,
      industry,
      address,
      phone,
      email,
      type,
    },
  });

  await applySubscriptionPayload(organization, req.body ?? {});
  const withSubscription = await attachOrganizationSubscription(organization);
  res.status(201).json(toOrganizationResponse(withSubscription));
});

app.put("/organizations/:id", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const {
    name,
    code,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);

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
        NOT: { id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  const organizationUpdateData: Prisma.OrganizationUpdateInput = {
    name,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
    ...(code !== undefined ? { code: normalizedCode } : {}),
  };

  const organization = await prisma.organization.update({
    where: { id },
    data: organizationUpdateData,
  });

  await applySubscriptionPayload(organization, req.body ?? {});
  const withSubscription = await attachOrganizationSubscription(organization);
  res.json(toOrganizationResponse(withSubscription));
});

app.get("/organizations/:id/subscription", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
  });
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const subscription = await ensureOrganizationSubscription(organization);
  res.json(subscription);
});

app.patch("/organizations/:id/subscription", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
  });
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  await applySubscriptionPayload(organization, req.body ?? {});
  const withSubscription = await attachOrganizationSubscription(organization);
  res.json(toOrganizationResponse(withSubscription));
});

const assignOrgMembership = async (req: Request, res: Response) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const { orgId, email, role } = req.body ?? {};
  const orgIdNum = Number(orgId);
  const normalizedEmail = normalizeEmail(email);

  if (!Number.isFinite(orgIdNum)) {
    return res.status(400).json({ ok: false, error: "orgId is required" });
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgIdNum },
  });

  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const safeRole = resolveRole(role, "OPERATOR");
  const now = new Date();

  const record = await prisma.orgMembership.upsert({
    where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
    update: { role: safeRole, status: "ACTIVE", approvedAt: now },
    create: {
      orgId: orgIdNum,
      email: normalizedEmail,
      role: safeRole,
      status: "ACTIVE",
      approvedAt: now,
    },
  });

  res.status(201).json(record);
};

app.post("/org-memberships/assign", assignOrgMembership);

// ─── Payroll ───────────────────────────────────────────────────────────────

app.get("/payroll/snapshots", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const snapshots = await prisma.payrollSnapshot.findMany({
    where: { orgId: organization.id },
    orderBy: { month: "desc" },
    select: { id: true, month: true, lockedAt: true, lockedBy: true, createdAt: true },
  });
  return res.json(snapshots);
});

app.get("/payroll", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const month = String(req.query.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res
      .status(400)
      .json({ ok: false, error: "month is required (format: YYYY-MM)" });
  }

  // 확정된 스냅샷이 있으면 스냅샷 데이터 반환
  const snapshot = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId: organization.id, month } },
  });
  if (snapshot) {
    return res.json({
      locked: true,
      lockedAt: snapshot.lockedAt,
      lockedBy: snapshot.lockedBy,
      month,
      employees: snapshot.data,
    });
  }

  // 실시간 집계: 해당 월의 WorkLog + WorkRecord 조회
  const workLogs = await prisma.workLog.findMany({
    where: {
      orgId: organization.id,
      workDate: { startsWith: month },
    },
    include: {
      workRecords: { orderBy: { id: "asc" } },
    },
  });

  // 직원별 집계
  const employeeMap = new Map<
    string,
    {
      workerId: number | null;
      workerName: string;
      totalEarnings: number;
      processes: Map<
        string,
        {
          processCode: string;
          processName: string;
          totalQuantity: number;
          totalEarnings: number;
        }
      >;
    }
  >();

  for (const workLog of workLogs) {
    const wagePerSecond = Number(workLog.factoryWagePerSecond);
    const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;

    for (const record of workLog.workRecords) {
      const key =
        record.workerId != null
          ? `w-${record.workerId}`
          : `n-${record.workerName || "unknown"}`;

      const ctSeconds = Number(record.ctSeconds);
      const quantity = Number(record.quantity);
      const earnings =
        validWage && ctSeconds > 0 && quantity > 0
          ? ctSeconds * quantity * wagePerSecond
          : 0;

      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          workerId: record.workerId ?? null,
          workerName: record.workerName || "이름없음",
          totalEarnings: 0,
          processes: new Map(),
        });
      }

      const emp = employeeMap.get(key)!;
      emp.totalEarnings += earnings;

      const processKey = record.processCode || record.processName || "unknown";
      if (!emp.processes.has(processKey)) {
        emp.processes.set(processKey, {
          processCode: record.processCode || "",
          processName: record.processName || processKey,
          totalQuantity: 0,
          totalEarnings: 0,
        });
      }
      const proc = emp.processes.get(processKey)!;
      proc.totalQuantity += quantity;
      proc.totalEarnings += earnings;
    }
  }

  const employees = Array.from(employeeMap.values())
    .map((emp) => ({
      workerId: emp.workerId,
      workerName: emp.workerName,
      totalEarnings: emp.totalEarnings,
      processes: Array.from(emp.processes.values()),
    }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings);

  return res.json({ locked: false, month, employees });
});

app.post("/payroll/lock", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const { month, lockedBy, employees } = req.body ?? {};
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    return res
      .status(400)
      .json({ ok: false, error: "month is required (format: YYYY-MM)" });
  }

  const existing = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId: organization.id, month } },
  });
  if (existing) {
    return res.status(409).json({ ok: false, error: "already locked" });
  }

  const snapshot = await prisma.payrollSnapshot.create({
    data: {
      orgId: organization.id,
      month: String(month),
      data: employees ?? [],
      lockedAt: new Date(),
      lockedBy: String(lockedBy || "unknown"),
    },
  });

  return res.status(201).json(snapshot);
});

// ───────────────────────────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const prismaErrorCode = String((error as any)?.code || "");
  const prismaErrorTargetRaw = (error as any)?.meta?.target;
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

  const status = Number((error as any)?.status);
  if (Number.isFinite(status)) {
    return res.status(status).json({
      ok: false,
      error: (error as any)?.message || "request failed",
    });
  }
  console.error(error);
  return res.status(500).json({ ok: false, error: "internal server error" });
});

const port = process.env.PORT || 4000;
const AT_AUTO_SYNC_INTERVAL_MS = 60 * 1000;
let atAutoSyncTimer: NodeJS.Timeout | null = null;
let atAutoSyncInProgress = false;
let atAutoSyncLastTrainingMonthKey: string | null = null;

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

    atAutoSyncLastTrainingMonthKey = trainingMonthKey;
    console.log(
      `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} manufacturers=${manufacturerRows.length} updatedStyles=${totalUpdatedStyles} updatedProcesses=${totalUpdatedProcesses}`
    );
  } catch (err: any) {
    console.error(
      `[AT sync][scheduler:${trigger}] failed:`,
      err?.message || err
    );
  } finally {
    atAutoSyncInProgress = false;
  }
};

const startAutoAtSyncScheduler = () => {
  if (atAutoSyncTimer) return;
  runAutoAtSyncIfDue("startup").catch((err) => {
    console.error("[AT sync][scheduler:startup] failed:", err?.message || err);
  });
  atAutoSyncTimer = setInterval(() => {
    runAutoAtSyncIfDue("interval").catch((err) => {
      console.error(
        "[AT sync][scheduler:interval] failed:",
        err?.message || err
      );
    });
  }, AT_AUTO_SYNC_INTERVAL_MS);
  if (typeof atAutoSyncTimer.unref === "function") {
    atAutoSyncTimer.unref();
  }
};

const startServer = async () => {
  await ensureHardcodedSystemAdmin();
  startAutoAtSyncScheduler();
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("failed to start API server", error);
  process.exit(1);
});

