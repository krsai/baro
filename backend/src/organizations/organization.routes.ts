import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import {
  attachOrganizationSubscription,
  ensureOrganizationSubscription,
  getOrganizationByQuery,
  getRequesterEmail,
  requireSystemAdmin,
} from "../middleware/access";
import {
  isValidOrgCode,
  normalizeOrgCode,
} from "../utils/common";

type OrganizationRoutesDeps = {
  applySubscriptionPayload: (organization: any, payload?: any) => Promise<any>;
  toOrganizationResponse: (organization: any) => any;
};

const normalizeOptionalOrganizationText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

export const createOrganizationRouter = ({
  applySubscriptionPayload,
  toOrganizationResponse,
}: OrganizationRoutesDeps) => {
  const organizationRouter = Router();

  organizationRouter.get("/organizations", async (_req, res) => {
    const organizations = await prisma.organization.findMany({
      orderBy: { id: "asc" },
    });
    const withSubscriptions = await Promise.all(
      organizations.map((organization) => attachOrganizationSubscription(organization))
    );
    res.json(withSubscriptions.map(toOrganizationResponse));
  });

  organizationRouter.get("/organizations/primary", async (req, res) => {
    const organization = await getOrganizationByQuery(req, { allowSuspended: true });
    if (!organization) {
      return res.status(404).json({ error: "organization not found" });
    }
    return res.json(toOrganizationResponse(organization));
  });

  organizationRouter.post("/organizations", async (req, res) => {
    if (!(await requireSystemAdmin(req, res))) return;

    const {
      name,
      nameKo,
      nameVi,
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
        nameKo: normalizeOptionalOrganizationText(nameKo),
        nameVi: normalizeOptionalOrganizationText(nameVi),
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
    return res.status(201).json(toOrganizationResponse(withSubscription));
  });

  organizationRouter.put("/organizations/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }

    const [systemUser, membership] = await Promise.all([
      prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      }),
      prisma.orgMembership.findUnique({
        where: { orgId_email: { orgId: id, email: requesterEmail } },
        select: { status: true, role: true },
      }),
    ]);

    const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
    const isOrgAdmin = membership?.status === "ACTIVE" && membership?.role === "ADMIN";

    if (!isSystemAdmin && !isOrgAdmin) {
      return res.status(403).json({ ok: false, error: "admin access required" });
    }

    const {
      name,
      nameKo,
      nameVi,
      code,
      businessNumber,
      representative,
      industry,
      address,
      phone,
      email,
      type,
    } = req.body ?? {};

    if ((code !== undefined || type !== undefined) && !isSystemAdmin) {
      return res.status(403).json({
        ok: false,
        error: "system admin access required to change code or type",
      });
    }

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
      ...(nameKo !== undefined
        ? { nameKo: normalizeOptionalOrganizationText(nameKo) }
        : {}),
      ...(nameVi !== undefined
        ? { nameVi: normalizeOptionalOrganizationText(nameVi) }
        : {}),
      ...(isSystemAdmin && type !== undefined ? { type } : {}),
      ...(code !== undefined ? { code: normalizedCode } : {}),
    };

    const organization = await prisma.organization.update({
      where: { id },
      data: organizationUpdateData,
    });

    await applySubscriptionPayload(organization, req.body ?? {});
    const withSubscription = await attachOrganizationSubscription(organization);
    return res.json(toOrganizationResponse(withSubscription));
  });

  organizationRouter.get("/organizations/:id/subscription", async (req, res) => {
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
    return res.json(
      toOrganizationResponse({
        ...organization,
        subscription,
      }).subscription
    );
  });

  organizationRouter.patch("/organizations/:id/subscription", async (req, res) => {
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
    return res.json(toOrganizationResponse(withSubscription));
  });

  return organizationRouter;
};
