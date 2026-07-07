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

const normalizePositiveIdOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const ORGANIZATION_REPRESENTATIVE_INCLUDE = {
  representativeEmployee: {
    include: {
      membership: {
        select: { email: true },
      },
    },
  },
};

const findOrganizationWithRepresentativeById = (id: number) =>
  prisma.organization.findUnique({
    where: { id },
    include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
  });

const resolveOrganizationRepresentativeEmployeeInput = async (params: {
  organizationId: number | null;
  representativeEmployeeIdInput: unknown;
}): Promise<
  | { ok: true; hasInput: false; representativeEmployeeId: null; representativeEmployee: null }
  | { ok: true; hasInput: true; representativeEmployeeId: number | null; representativeEmployee: any | null }
  | { ok: false; status: number; error: string }
> => {
  const { organizationId, representativeEmployeeIdInput } = params;
  if (representativeEmployeeIdInput === undefined) {
    return {
      ok: true,
      hasInput: false,
      representativeEmployeeId: null,
      representativeEmployee: null,
    };
  }
  if (representativeEmployeeIdInput === null || representativeEmployeeIdInput === "") {
    return {
      ok: true,
      hasInput: true,
      representativeEmployeeId: null,
      representativeEmployee: null,
    };
  }

  const representativeEmployeeId = normalizePositiveIdOrNull(representativeEmployeeIdInput);
  if (representativeEmployeeId === null) {
    return { ok: false, status: 400, error: "invalid representativeEmployeeId" };
  }
  if (organizationId === null) {
    return {
      ok: false,
      status: 400,
      error: "representativeEmployeeId can be set only after the organization has been created",
    };
  }

  const representativeEmployee = await prisma.employee.findFirst({
    where: {
      id: representativeEmployeeId,
      orgId: organizationId,
    },
    include: {
      membership: {
        select: { email: true },
      },
    },
  });
  if (!representativeEmployee) {
    return {
      ok: false,
      status: 400,
      error: "representative must belong to the organization",
    };
  }

  return {
    ok: true,
    hasInput: true,
    representativeEmployeeId: representativeEmployee.id,
    representativeEmployee,
  };
};

export const createOrganizationRouter = ({
  applySubscriptionPayload,
  toOrganizationResponse,
}: OrganizationRoutesDeps) => {
  const organizationRouter = Router();

  organizationRouter.get("/organizations", async (_req, res) => {
    const organizations = await prisma.organization.findMany({
      include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
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
    const organizationWithRepresentative =
      (await findOrganizationWithRepresentativeById(organization.id)) ?? organization;
    return res.json(toOrganizationResponse(organizationWithRepresentative));
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
      representativeEmployeeId,
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

    const representativeEmployeeResolved =
      await resolveOrganizationRepresentativeEmployeeInput({
        organizationId: null,
        representativeEmployeeIdInput: representativeEmployeeId,
      });
    if (!representativeEmployeeResolved.ok) {
      return res
        .status(representativeEmployeeResolved.status)
        .json({ ok: false, error: representativeEmployeeResolved.error });
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
      include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
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

    const [systemUser, employee] = await Promise.all([
      prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      }),
      prisma.employee.findUnique({
        where: { orgId_email: { orgId: id, email: requesterEmail } },
        select: { status: true, orgRole: true },
      }),
    ]);

    const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
    const isOrgAdmin = employee?.status === "ACTIVE" && employee?.orgRole === "ADMIN";

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
      representativeEmployeeId,
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

    const representativeEmployeeResolved =
      await resolveOrganizationRepresentativeEmployeeInput({
        organizationId: id,
        representativeEmployeeIdInput: representativeEmployeeId,
      });
    if (!representativeEmployeeResolved.ok) {
      return res
        .status(representativeEmployeeResolved.status)
        .json({ ok: false, error: representativeEmployeeResolved.error });
    }
    const representativeEmployee = representativeEmployeeResolved.representativeEmployee;
    const representativeEmployeeName = normalizeOptionalOrganizationText(
      representativeEmployee?.name
    );
    const representativeEmployeePhone = normalizeOptionalOrganizationText(
      representativeEmployee?.phone
    );
    const representativeEmployeeEmail = normalizeOptionalOrganizationText(
      representativeEmployee?.email ?? representativeEmployee?.membership?.email
    );

    const organizationUpdateData: Prisma.OrganizationUpdateInput = {
      name,
      businessNumber,
      representative: representativeEmployeeResolved.hasInput
        ? representativeEmployeeName
        : representative,
      industry,
      address,
      phone: representativeEmployeeResolved.hasInput ? representativeEmployeePhone : phone,
      email: representativeEmployeeResolved.hasInput ? representativeEmployeeEmail : email,
      ...(representativeEmployeeResolved.hasInput
        ? {
            representativeEmployee: representativeEmployeeResolved.representativeEmployeeId
              ? { connect: { id: representativeEmployeeResolved.representativeEmployeeId } }
              : { disconnect: true },
          }
        : {}),
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
      include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
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
      include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
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
      include: ORGANIZATION_REPRESENTATIVE_INCLUDE,
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
