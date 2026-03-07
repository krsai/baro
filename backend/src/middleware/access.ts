import "../config/env";
import { type Request, type Response } from "express";
import { type OrgUserRole } from "@prisma/client";
import { prisma } from "../db";
import { normalizeEmail } from "../utils/common";
import {
  createHttpError,
  getErrorMessage,
  getErrorStatus,
  readRequestHeader,
} from "../utils/http";

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

const ORG_ACCESS_ROLES: OrgUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "ACCOUNTANT",
  "WORKER",
];
const BARO_SUBSCRIPTION_EMAIL = "baro.garment@gmail.com";

type OrganizationAccessOptions = {
  allowSuspended?: boolean;
};

type RequireOrgRoleOptions = OrganizationAccessOptions & {
  allowedRoles?: OrgUserRole[];
  allowSystemAdmin?: boolean;
};

const ORG_ACCESS_CACHE_TTL_MS = 5_000;
const MAX_ORG_ACCESS_CACHE_SIZE = 512;
const organizationAccessCache = new Map<
  string,
  {
    expiresAt: number;
    value: any;
  }
>();
const organizationAccessInFlight = new Map<string, Promise<any>>();
const requestOrganizationAccessCacheKey = Symbol("requestOrganizationAccessCache");

type RequestWithOrganizationAccessCache = Request & {
  [requestOrganizationAccessCacheKey]?: Map<string, any>;
};

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

export const getHardCodedSystemAdminEmail = () =>
  normalizeEmail(process.env.SYSTEM_ADMIN_EMAIL || "krsailer82@gmail.com");

const getRequestOrganizationAccessCache = (req: Request) => {
  const typedRequest = req as RequestWithOrganizationAccessCache;
  if (!typedRequest[requestOrganizationAccessCacheKey]) {
    typedRequest[requestOrganizationAccessCacheKey] = new Map<string, any>();
  }
  return typedRequest[requestOrganizationAccessCacheKey];
};

const purgeExpiredOrganizationAccessCache = () => {
  const now = Date.now();
  for (const [key, entry] of organizationAccessCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      organizationAccessCache.delete(key);
    }
  }
};

const trimOrganizationAccessCache = () => {
  purgeExpiredOrganizationAccessCache();
  while (organizationAccessCache.size > MAX_ORG_ACCESS_CACHE_SIZE) {
    const oldestKey = organizationAccessCache.keys().next().value;
    if (!oldestKey) break;
    organizationAccessCache.delete(oldestKey);
  }
};

const buildOrganizationAccessCacheKey = (
  rawOrgId: string,
  requesterEmail: string,
  options: OrganizationAccessOptions = {}
) =>
  [
    `org:${rawOrgId || "auto"}`,
    `user:${requesterEmail || "anonymous"}`,
    `allowSuspended:${options.allowSuspended ? 1 : 0}`,
  ].join("::");

const cloneOrganizationAccessValue = (value: any) => {
  if (!value || typeof value !== "object") return value;
  return {
    ...value,
    ...(value.subscription && typeof value.subscription === "object"
      ? { subscription: { ...value.subscription } }
      : {}),
  };
};

export const ensureOrganizationSubscription = async (organization: any) => {
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

export const attachOrganizationSubscription = async (organization: any) => {
  if (!organization) return null;
  const subscription = await ensureOrganizationSubscription(organization);
  return { ...organization, subscription };
};

const ensureOrganizationAccessible = (organization: any, options: OrganizationAccessOptions = {}) => {
  if (!organization) return organization;
  if (options.allowSuspended) return organization;
  if (organization.subscription?.status === "SUSPENDED") {
    throw createHttpError(403, "organization is suspended");
  }
  return organization;
};

export const getRequesterEmail = (req: Request): string => {
  const headerEmail = normalizeEmail(readRequestHeader(req, "x-user-email"));
  return headerEmail;
};

export const getRequestedOrgIdText = (req: Request): string => {
  const rawFromQuery =
    req.query.orgId === undefined || req.query.orgId === null
      ? ""
      : String(req.query.orgId).trim();
  if (rawFromQuery) return rawFromQuery;
  return readRequestHeader(req, "x-org-id");
};

const getPrimaryOrganization = async (options: OrganizationAccessOptions = {}) => {
  let organization = await prisma.organization.findFirst({
    orderBy: { id: "asc" },
  });

  if (!organization) {
    organization = await prisma.organization.create({ data: DEFAULT_ORG });
  }

  const withSubscription = await attachOrganizationSubscription(organization);
  return ensureOrganizationAccessible(withSubscription, options);
};

const getSystemAdminDefaultOrganization = async (
  options: OrganizationAccessOptions = {}
) => {
  const organizationWithActiveMembers = await prisma.organization.findFirst({
    where: {
      memberships: {
        some: { status: "ACTIVE" },
      },
    },
    orderBy: { id: "asc" },
  });
  if (organizationWithActiveMembers) {
    const withSubscription = await attachOrganizationSubscription(
      organizationWithActiveMembers
    );
    return ensureOrganizationAccessible(withSubscription, options);
  }

  return getPrimaryOrganization(options);
};

const resolveOrganizationByQuery = async (
  rawOrgId: string,
  requesterEmail: string,
  options: OrganizationAccessOptions = {}
) => {
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
      return getSystemAdminDefaultOrganization(options);
    }
  }

  return getPrimaryOrganization(options);
};

export const getOrganizationByQuery = async (
  req: Request,
  options: OrganizationAccessOptions = {}
) => {
  const rawOrgId = getRequestedOrgIdText(req);
  const requesterEmail = getRequesterEmail(req);
  const cacheKey = buildOrganizationAccessCacheKey(rawOrgId, requesterEmail, options);
  const requestCache = getRequestOrganizationAccessCache(req);

  if (requestCache.has(cacheKey)) {
    return cloneOrganizationAccessValue(requestCache.get(cacheKey));
  }

  purgeExpiredOrganizationAccessCache();
  const cached = organizationAccessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    requestCache.set(cacheKey, cached.value);
    return cloneOrganizationAccessValue(cached.value);
  }

  let inFlight = organizationAccessInFlight.get(cacheKey);
  if (!inFlight) {
    inFlight = resolveOrganizationByQuery(rawOrgId, requesterEmail, options).then((value) => {
      organizationAccessCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + ORG_ACCESS_CACHE_TTL_MS,
      });
      trimOrganizationAccessCache();
      return value;
    });
    organizationAccessInFlight.set(cacheKey, inFlight);
  }

  try {
    const value = await inFlight;
    requestCache.set(cacheKey, value);
    return cloneOrganizationAccessValue(value);
  } finally {
    if (organizationAccessInFlight.get(cacheKey) === inFlight) {
      organizationAccessInFlight.delete(cacheKey);
    }
  }
};

export const getRequestAccessContext = async (
  req: Request,
  options: OrganizationAccessOptions = {}
) => {
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

export const requireOrgRole = async (
  req: Request,
  res: Response,
  options: RequireOrgRoleOptions = {}
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
    const status = getErrorStatus(error) ?? 500;
    const message = getErrorMessage(error, "failed to resolve access context");
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

export const requireSystemAdmin = async (req: Request, res: Response) => {
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
