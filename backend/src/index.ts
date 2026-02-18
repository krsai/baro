import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient, type OrgUserRole, type Prisma } from "@prisma/client";

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
    { code: "P01", name: "주머니 달기" },
    { code: "P02", name: "소매 달기" },
    { code: "P03", name: "단추 달기" },
    { code: "P04", name: "지퍼 달기" },
    { code: "P05", name: "라벨 부착" },
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
const toPositiveIntOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
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
const HARD_CODED_SYSTEM_ADMIN_EMAIL = "system-admin@test.local";
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
  const rawOrgId =
    req.query.orgId === undefined || req.query.orgId === null
      ? ""
      : String(req.query.orgId).trim();
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
    const withSubscription = await attachOrganizationSubscription(organization);
    return ensureOrganizationAccessible(withSubscription, options);
  }
  return getPrimaryOrganization(options);
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
  return parsed < 0 ? 0 : Math.round(parsed);
};

const normalizeStyleProcess = (process: any) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return process;
  }
  const { st: _legacySt, ...rest } = process;
  const next = { ...rest };
  if ("pt" in next) next.pt = toOptionalSeconds(next.pt);
  if ("at" in next) next.at = toOptionalSeconds(next.at);
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
  styleId: string,
  type: "code" | "name",
  value: string
) => `${styleId}::${type}:${value}`;

const syncStyleProcessActualTimesFromWorkRecords = async (orgId: number) => {
  const records = await prisma.workRecord.findMany({
    where: {
      orgId,
      ctSeconds: { gt: 0 },
      quantity: { gt: 0 },
      styleId: { not: null },
    },
    select: {
      styleId: true,
      processCode: true,
      processName: true,
      ctSeconds: true,
      quantity: true,
    },
  });

  const weightedByKey = new Map<string, { totalSeconds: number; totalQuantity: number }>();
  records.forEach((record) => {
    const styleId = String(record.styleId || "").trim();
    if (!styleId) return;
    const quantity = Number(record.quantity) || 0;
    const ctSeconds = Number(record.ctSeconds) || 0;
    if (quantity <= 0 || ctSeconds <= 0) return;

    const processCodeKey = normalizeProcessCodeKey(record.processCode);
    const processNameKey = normalizeProcessNameKey(record.processName);
    const metricKey = processCodeKey
      ? toStyleProcessMetricKey(styleId, "code", processCodeKey)
      : processNameKey
        ? toStyleProcessMetricKey(styleId, "name", processNameKey)
        : "";
    if (!metricKey) return;

    const current = weightedByKey.get(metricKey) || {
      totalSeconds: 0,
      totalQuantity: 0,
    };
    current.totalSeconds += ctSeconds * quantity;
    current.totalQuantity += quantity;
    weightedByKey.set(metricKey, current);
  });

  if (weightedByKey.size === 0) {
    return { updatedStyles: 0, updatedProcesses: 0 };
  }

  const styles = await prisma.style.findMany({
    where: { orgId },
    select: {
      uid: true,
      styleId: true,
      processes: true,
    },
  });

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
              toStyleProcessMetricKey(style.styleId, "code", codeKey)
            )
          : null) ||
        (nameKey
          ? weightedByKey.get(
              toStyleProcessMetricKey(style.styleId, "name", nameKey)
            )
          : null);
      if (!metric || metric.totalQuantity <= 0) return process;

      const nextAt = toOptionalSeconds(metric.totalSeconds / metric.totalQuantity);
      const currentAt = toOptionalSeconds((process as any).at);
      if (nextAt === null || currentAt === nextAt) return process;

      changed = true;
      updatedProcesses += 1;
      return {
        ...(process as any),
        at: nextAt,
      };
    });

    if (!changed) continue;
    updatedStyles += 1;
    await prisma.style.update({
      where: { uid: style.uid },
      data: { processes: nextProcesses },
    });
  }

  return { updatedStyles, updatedProcesses };
};

const normalizeStylePayload = (payload: any, fallbackStyleId: string | null = null) => {
  const rawId = typeof payload?.id === "string" ? payload.id.trim() : "";
  const styleId = rawId || fallbackStyleId || createStyleId();
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const customer =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";
  const styleCodeInput = resolveOptionalString(payload?.styleCode, null);
  const styleCode = styleCodeInput ?? styleId;

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
    processes: normalizeStyleProcesses(payload?.processes),
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

const toStyleResponse = (style: any) => ({
  id: style.styleId,
  styleCode: style.styleCode ?? "",
  name: style.name ?? "",
  customer: style.customer ?? "",
  registrationDate: style.registrationDate ?? "",
  designer: style.designer ?? "",
  collection: style.collection ?? "",
  season: style.season ?? "",
  imageUrls: ensureArray(style.imageUrls),
  processes: normalizeStyleProcesses(style.processes),
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

const resolveOrderCustomerIdentity = (order: any = {}) => {
  const customerId = toPositiveIntOrNull(
    order?.customerId !== undefined ? order.customerId : order?.buyerOrgId
  );
  const customerName = resolveOptionalString(
    order?.customerName !== undefined ? order.customerName : order?.buyerOrgName,
    null
  );
  return { customerId, customerName };
};

const findOrderNumberConflict = async ({
  orgId,
  orderNumber,
  customerId,
  customerName,
  excludeOrderId = null,
}: {
  orgId: number;
  orderNumber: string;
  customerId?: number | null;
  customerName?: string | null;
  excludeOrderId?: string | null;
}) => {
  const normalizedOrderNumber = String(orderNumber || "").trim();
  if (!normalizedOrderNumber) return null;

  const where: any = {
    orgId,
    orderNumber: normalizedOrderNumber,
  };
  const resolvedCustomerId = toPositiveIntOrNull(customerId);
  if (resolvedCustomerId) {
    where.OR = [{ customerId: resolvedCustomerId }, { buyerOrgId: resolvedCustomerId }];
  } else if (customerName) {
    where.OR = [
      { customerName: { equals: customerName, mode: "insensitive" } },
      { buyerOrgName: { equals: customerName, mode: "insensitive" } },
    ];
  }
  if (excludeOrderId) {
    where.NOT = { orderId: excludeOrderId };
  }

  return prisma.workOrder.findFirst({
    where,
    select: { id: true, orderId: true },
  });
};

const toOrderResponse = (order: any) => {
  const items = normalizeOrderItems(order?.items);
  return {
    id: order.orderId,
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
const todayDateKey = () => new Date().toISOString().slice(0, 10);
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
    ? assignmentPlans.map(toAssignmentPlanResponse)
    : ensureArray(state?.assignments),
  createdAt: state?.createdAt ?? null,
  updatedAt: state?.updatedAt ?? null,
});

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
  const orgId = Number(req.query.orgId);
  const status = resolveStatus(req.query.status);
  const email = normalizeEmail(req.query.email);
  const where = {
    ...(Number.isFinite(orgId) ? { orgId } : {}),
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
  const orgId = Number(req.query.orgId);
  const factoryId = Number(req.query.factoryId);
  const where = {
    ...(Number.isFinite(orgId) ? { orgId } : {}),
    ...(Number.isFinite(factoryId) ? { factoryId } : {}),
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

  const factory = await prisma.factory.create({
    data: {
      orgId: organization.id,
      name: name.trim(),
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      targetMonthlyWage: toNumberOrNull(targetMonthlyWage),
      wagePerSecond: toNumberOrNull(wagePerSecond),
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

  const factory = await prisma.factory.update({
    where: { id },
    data: {
      name: typeof name === "string" ? name.trim() : existing.name,
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      targetMonthlyWage: toNumberOrNull(targetMonthlyWage),
      wagePerSecond: toNumberOrNull(wagePerSecond),
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
  await closeActiveLineAssignments(employee.id, now);

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

  res.status(201).json(assignment);
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

  await closeActiveLineAssignments(employee.id, new Date());

  res.json({ ok: true });
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
  });
  const createdWithRecords = await prisma.workLog.findUnique({
    where: { id: created.id },
    include: {
      workRecords: {
        orderBy: { id: "asc" },
      },
    },
  });
  await syncStyleProcessActualTimesFromWorkRecords(organization.id);

  res.status(201).json(toWorkLogResponse(createdWithRecords ?? created));
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
  });
  const updatedWithRecords = await prisma.workLog.findUnique({
    where: { id: updated.id },
    include: {
      workRecords: {
        orderBy: { id: "asc" },
      },
    },
  });
  await syncStyleProcessActualTimesFromWorkRecords(organization.id);

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
  await syncStyleProcessActualTimesFromWorkRecords(organization.id);

  res.status(204).send();
});

app.get("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const [state, assignmentPlans] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
    }),
    prisma.assignmentPlan.findMany({
      where: { orgId: organization.id },
      orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    }),
  ]);

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

    await tx.assignmentPlan.deleteMany({
      where: { orgId: organization.id },
    });

    if (normalizedPlans.length > 0) {
      await tx.assignmentPlan.createMany({
        data: normalizedPlans.map((item: any) => ({
          orgId: organization.id,
          ...item,
        })),
      });
    }

    return state;
  });
  const persistedPlans = await prisma.assignmentPlan.findMany({
    where: { orgId: organization.id },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });

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
    where: { orgId: organization.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders.map(toOrderResponse));
});

app.post("/orders", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const normalized = normalizeOrderPayload(req.body ?? {});
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  if (!normalized.customerId) {
    return res.status(400).json({ ok: false, error: "customerId is required" });
  }
  const customerIdentity = resolveOrderCustomerIdentity(normalized);
  const orderNumberConflict = await findOrderNumberConflict({
    orgId: organization.id,
    orderNumber: normalized.orderNumber,
    customerId: customerIdentity.customerId,
    customerName: customerIdentity.customerName,
  });
  if (orderNumberConflict) {
    return res.status(409).json({
      ok: false,
      error: "order number already exists for this customer",
    });
  }

  const existing = await prisma.workOrder.findFirst({
    where: { orgId: organization.id, orderId: normalized.orderId },
    select: { id: true },
  });
  if (existing) {
    return res.status(409).json({ ok: false, error: "order already exists" });
  }

  const created = await prisma.workOrder.create({
    data: {
      orgId: organization.id,
      ...normalized,
    },
  });

  res.status(201).json(toOrderResponse(created));
});

app.put("/orders/:orderId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: { orgId: organization.id, orderId },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }

  const normalized = normalizeOrderPayload(req.body ?? {}, existing);
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  if (!normalized.customerId) {
    return res.status(400).json({ ok: false, error: "customerId is required" });
  }
  const customerIdentity = resolveOrderCustomerIdentity(normalized);
  const orderNumberConflict = await findOrderNumberConflict({
    orgId: organization.id,
    orderNumber: normalized.orderNumber,
    customerId: customerIdentity.customerId,
    customerName: customerIdentity.customerName,
    excludeOrderId: existing.orderId,
  });
  if (orderNumberConflict) {
    return res.status(409).json({
      ok: false,
      error: "order number already exists for this customer",
    });
  }
  // Route param is source of truth.
  normalized.orderId = existing.orderId;

  const updated = await prisma.workOrder.update({
    where: { id: existing.id },
    data: normalized,
  });

  res.json(toOrderResponse(updated));
});

app.delete("/orders/:orderId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: { orgId: organization.id, orderId },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
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
  const organization = await getOrganizationByQuery(req);
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

  const organization = await getOrganizationByQuery(req);
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

  const organization = await getOrganizationByQuery(req);
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
  const compact = req.query.compact === "1" || req.query.compact === "true";

  const styles = await prisma.style.findMany({
    where: { orgId: organization.id },
    orderBy: { uid: "asc" },
    ...(compact
      ? {
          // Skip heavy BOM payload for list pages that only need summary/process data.
          select: {
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

  res.json(styles.map(toStyleResponse));
});

app.get("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  const style = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId },
  });
  if (!style) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  res.json(toStyleResponse(style));
});

app.post("/styles", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const payload = normalizeStylePayload(req.body ?? {});
  if (!payload.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!payload.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: organization.id,
    customer: payload.customer,
    name: payload.name,
    styleCode: payload.styleCode,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId: payload.styleId },
  });
  if (existing) {
    return res
      .status(409)
      .json({ ok: false, error: "styleId already exists" });
  }

  const created = await prisma.style.create({
    data: {
      orgId: organization.id,
      ...payload,
    },
  });

  res.status(201).json(toStyleResponse(created));
});

app.put("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  const normalized = normalizeStylePayload(
    {
      id: existing.styleId,
      styleCode: req.body?.styleCode ?? existing.styleCode,
      name: req.body?.name ?? existing.name,
      customer: req.body?.customer ?? existing.customer,
      registrationDate: req.body?.registrationDate ?? existing.registrationDate,
      designer: req.body?.designer ?? existing.designer,
      collection: req.body?.collection ?? existing.collection,
      season: req.body?.season ?? existing.season,
      imageUrls: req.body?.imageUrls ?? existing.imageUrls,
      processes: req.body?.processes ?? existing.processes,
      bom: req.body?.bom ?? existing.bom,
      bomNotes: req.body?.bomNotes ?? existing.bomNotes,
    },
    existing.styleId
  );

  if (!normalized.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!normalized.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: organization.id,
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
      processes: normalized.processes,
      bom: normalized.bom,
      bomNotes: normalized.bomNotes,
    },
  });

  res.json(toStyleResponse(updated));
});

app.delete("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  const relatedOrders = await prisma.workOrder.findMany({
    where: { orgId: organization.id },
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
      where: {
        orgId_styleId: {
          orgId: organization.id,
          styleId,
        },
      },
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
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const rows = Array.isArray(req.body?.styles) ? req.body.styles : [];
  if (rows.length === 0) {
    return res.status(400).json({ ok: false, error: "styles is required" });
  }

  const normalizedRows = rows
    .map((item: any) => normalizeStylePayload(item))
    .filter((item: any) => item.name && item.customer);

  if (normalizedRows.length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "no valid styles to import" });
  }

  const seenNameKeys = new Set();
  const seenCodeKeys = new Set();
  for (const item of normalizedRows) {
    const nameKey = toStyleIdentityKey(item.customer, item.name);
    if (seenNameKeys.has(nameKey)) {
      return res.status(409).json({
        ok: false,
        error: "style name already exists for this customer",
      });
    }
    seenNameKeys.add(nameKey);

    const codeKey = toStyleIdentityKey(item.customer, item.styleCode);
    if (seenCodeKeys.has(codeKey)) {
      return res.status(409).json({
        ok: false,
        error: "style code already exists for this customer",
      });
    }
    seenCodeKeys.add(codeKey);
  }

  const existingStyleRows = await prisma.style.findMany({
    where: {
      orgId: organization.id,
      styleId: { in: normalizedRows.map((item: any) => item.styleId) },
    },
    select: { uid: true, styleId: true },
  });
  const existingStyleUidByStyleId = new Map(
    existingStyleRows.map((row) => [row.styleId, row.uid])
  );

  for (const item of normalizedRows) {
    const conflictMessage = await findStyleConflict({
      orgId: organization.id,
      customer: item.customer,
      name: item.name,
      styleCode: item.styleCode,
      excludeUid: existingStyleUidByStyleId.get(item.styleId) ?? null,
    });
    if (conflictMessage) {
      return res.status(409).json({ ok: false, error: conflictMessage });
    }
  }

  await prisma.$transaction(
    normalizedRows.map((item: any) =>
      prisma.style.upsert({
        where: {
          orgId_styleId: {
            orgId: organization.id,
            styleId: item.styleId,
          },
        },
        update: {
          styleCode: item.styleCode,
          name: item.name,
          customer: item.customer,
          registrationDate: item.registrationDate,
          designer: item.designer,
          collection: item.collection,
          season: item.season,
          imageUrls: item.imageUrls,
          processes: item.processes,
          bom: item.bom,
          bomNotes: item.bomNotes,
        },
        create: {
          orgId: organization.id,
          ...item,
        },
      })
    )
  );

  const imported = await prisma.style.findMany({
    where: { orgId: organization.id },
    orderBy: { uid: "asc" },
  });

  res.status(201).json(imported.map(toStyleResponse));
});

app.get("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
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
      prisma.attrProcess.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
    ]);

  res.json({
    colors,
    categories,
    roles,
    processes,
  });
});

app.put("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
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

const startServer = async () => {
  await ensureHardcodedSystemAdmin();
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("failed to start API server", error);
  process.exit(1);
});
