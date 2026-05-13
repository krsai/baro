import { Prisma, type OrgUserRole } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { prisma } from "../db";
import {
  getOrganizationByQuery,
  getRequesterEmail,
  requireSystemAdmin,
} from "../middleware/access";
import { normalizeEmail } from "../utils/common";

type OrgMembershipRoutesDeps = {
  closeActiveLineAssignments: (employeeId: number, endedAt?: Date) => Promise<number[]>;
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
  resolveDefaultEmployeeRoleId: (orgId: number) => Promise<number | null>;
  resolveEmployeeStoredPayType: (args: {
    orgId: number;
    membershipRole: OrgUserRole;
    roleId: number | null;
    payType: unknown;
  }) => Promise<"CT" | "FIXED">;
  resolveRole: (value: any, fallback?: OrgUserRole) => OrgUserRole;
  resolveStatus: (value: any) => string | null;
};

export const createOrgMembershipRouter = ({
  closeActiveLineAssignments,
  isManufacturerOrg,
  resolveDefaultEmployeeRoleId,
  resolveEmployeeStoredPayType,
  resolveRole,
  resolveStatus,
}: OrgMembershipRoutesDeps) => {
  const orgMembershipRouter = Router();
  const REQUEST_REVIEWER_ROLES = new Set<OrgUserRole>(["ADMIN", "OPERATOR"]);
  const LOGIN_REQUIRED_ROLES = new Set<OrgUserRole>(["ADMIN", "OPERATOR"]);
  const INTERNAL_MEMBER_EMAIL_PREFIX = "emp+";
  const INTERNAL_MEMBER_EMAIL_DOMAIN = "baro.local";
  const INTERNAL_MEMBER_EMAIL_MAX_GENERATION_RETRY = 10;

  const isRoleRequiringLoginEmail = (role: OrgUserRole) =>
    LOGIN_REQUIRED_ROLES.has(role);
  const isValidEmail = (value: string) => value.includes("@");
  const isInternalMemberEmail = (value: unknown) => {
    const normalized = normalizeEmail(value);
    return (
      normalized.startsWith(INTERNAL_MEMBER_EMAIL_PREFIX) &&
      normalized.endsWith(`@${INTERNAL_MEMBER_EMAIL_DOMAIN}`)
    );
  };
  const generateInternalMemberEmailCandidate = (orgId: number) => {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${INTERNAL_MEMBER_EMAIL_PREFIX}${orgId}-${token}@${INTERNAL_MEMBER_EMAIL_DOMAIN}`;
  };
  const generateAvailableInternalMemberEmail = async (orgId: number) => {
    for (let attempt = 0; attempt < INTERNAL_MEMBER_EMAIL_MAX_GENERATION_RETRY; attempt += 1) {
      const candidate = generateInternalMemberEmailCandidate(orgId);
      const existing = await prisma.orgMembership.findUnique({
        where: { orgId_email: { orgId, email: candidate } },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new Error("failed to generate unique internal member email");
  };

  const requireOrgMembershipReviewer = async (
    req: Request,
    res: Response,
    orgId: number
  ) => {
    const requesterEmail = normalizeEmail(getRequesterEmail(req));
    if (!requesterEmail) {
      res.status(401).json({ ok: false, error: "request user email is required" });
      return null;
    }

    const requesterMembership = await prisma.orgMembership.findUnique({
      where: {
        orgId_email: {
          orgId,
          email: requesterEmail,
        },
      },
      select: {
        status: true,
        role: true,
      },
    });

    if (
      requesterMembership?.status !== "ACTIVE" ||
      !REQUEST_REVIEWER_ROLES.has(requesterMembership.role)
    ) {
      const systemUser = await prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      });
      if (systemUser?.systemRole !== "SYSTEM_ADMIN") {
        res.status(403).json({
          ok: false,
          error: "org admin/operator access required",
        });
        return null;
      }
    }

    return requesterEmail;
  };

  const listOrgMemberships = async (req: Request, res: Response) => {
    let organization = null;
    try {
      organization = await getOrganizationByQuery(req);
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : "failed to resolve organization";
      return res.status(status).json({ ok: false, error: message });
    }
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const status = resolveStatus(req.query.status);
    const email = normalizeEmail(req.query.email);
    const systemOnly =
      String(req.query.systemOnly ?? "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.systemOnly ?? "")
        .trim()
        .toLowerCase() === "true";
    let systemUserEmails: string[] = [];
    if (systemOnly) {
      const requesterEmail = normalizeEmail(getRequesterEmail(req));
      if (!requesterEmail) {
        return res.status(401).json({ ok: false, error: "request user email is required" });
      }
      const requesterSystemUser = await prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      });
      if (requesterSystemUser?.systemRole !== "SYSTEM_ADMIN") {
        return res.status(403).json({ ok: false, error: "system admin access required" });
      }

      const systemUsers = await prisma.systemUser.findMany({
        select: { email: true },
        orderBy: { id: "asc" },
      });
      systemUserEmails = Array.from(
        new Set(
          systemUsers
            .map((item) => normalizeEmail(item?.email))
            .filter(Boolean)
        )
      );
      if (systemUserEmails.length === 0) {
        return res.json([]);
      }
    }
    const where: Prisma.OrgMembershipWhereInput = {
      orgId: organization.id,
      ...(status ? { status: status as any } : {}),
    };
    if (email && systemOnly) {
      where.AND = [{ email }, { email: { in: systemUserEmails } }];
    } else if (email) {
      where.email = email;
    } else if (systemOnly) {
      where.email = { in: systemUserEmails };
    }
    const members = await prisma.orgMembership.findMany({
      where,
      orderBy: { id: "asc" },
    });
    return res.json(members);
  };

  orgMembershipRouter.get("/org-memberships", listOrgMemberships);

  orgMembershipRouter.post("/org-memberships", async (req, res) => {
    const { orgId, email, role, factoryId } = req.body ?? {};
    const orgIdNum = Number(orgId);

    if (!Number.isFinite(orgIdNum)) {
      return res.status(400).json({ ok: false, error: "orgId is required" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgIdNum },
    });
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const requesterEmail = await requireOrgMembershipReviewer(req, res, orgIdNum);
    if (!requesterEmail) return;

    const safeRole = resolveRole(role, "WORKER");
    const normalizedEmailInput = normalizeEmail(email);
    if (normalizedEmailInput && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({ ok: false, error: "invalid email" });
    }
    if (isRoleRequiringLoginEmail(safeRole) && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({
        ok: false,
        error: "email is required for admin/operator",
      });
    }

    const resolvedMembershipEmail =
      normalizedEmailInput ||
      (await generateAvailableInternalMemberEmail(orgIdNum));
    const isManufacturer = isManufacturerOrg(organization);
    let factoryIdNum = null;
    if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
      const parsedFactoryId = Number(factoryId);
      if (!Number.isFinite(parsedFactoryId)) {
        return res.status(400).json({ ok: false, error: "invalid factoryId" });
      }
      factoryIdNum = parsedFactoryId;
    }
    if (!isManufacturer && factoryIdNum) {
      return res
        .status(400)
        .json({ ok: false, error: "brand organizations have no factories" });
    }
    if (isManufacturer && factoryIdNum) {
      const factory = await prisma.factory.findFirst({
        where: { id: factoryIdNum, orgId: orgIdNum },
      });
      if (!factory) {
        return res.status(404).json({ ok: false, error: "factory not found" });
      }
    }
    const now = new Date();
    const existingMembership = await prisma.orgMembership.findUnique({
      where: { orgId_email: { orgId: orgIdNum, email: resolvedMembershipEmail } },
    });

    const membership = await prisma.orgMembership.upsert({
      where: { orgId_email: { orgId: orgIdNum, email: resolvedMembershipEmail } },
      update: {
        role: safeRole,
        status: "ACTIVE",
        approvedAt: now,
        approvedBy: requesterEmail,
      },
      create: {
        orgId: orgIdNum,
        email: resolvedMembershipEmail,
        role: safeRole,
        status: "ACTIVE",
        requestedAt: now,
        approvedAt: now,
        approvedBy: requesterEmail,
      },
    });

    if (isManufacturer) {
      const existingEmployee = await prisma.employee.findUnique({
        where: { orgMembershipId: membership.id },
      });
      const resolvedRoleId =
        safeRole === "WORKER"
          ? existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(orgIdNum))
          : null;
      const resolvedPayType = await resolveEmployeeStoredPayType({
        orgId: orgIdNum,
        membershipRole: safeRole,
        roleId: resolvedRoleId,
        payType: existingEmployee?.payType,
      });
      const resolvedFactoryId =
        factoryIdNum !== null && factoryIdNum !== undefined
          ? factoryIdNum
          : existingEmployee?.factoryId ?? null;
      await prisma.employee.upsert({
        where: { orgMembershipId: membership.id },
        update: {
          orgId: orgIdNum,
          factoryId: resolvedFactoryId,
          roleId: resolvedRoleId,
          payType: resolvedPayType,
          joinedAt: existingEmployee?.joinedAt ?? now,
          leftAt: null,
          leaveStartAt: null,
          leaveEndAt: null,
        },
        create: {
          orgId: orgIdNum,
          orgMembershipId: membership.id,
          factoryId: resolvedFactoryId,
          roleId: resolvedRoleId,
          payType: resolvedPayType,
          joinedAt: now,
        },
      });
    }

    return res.status(existingMembership ? 200 : 201).json(membership);
  });

  orgMembershipRouter.post("/org-memberships/apply", async (req, res) => {
    const { orgId, email, role } = req.body ?? {};
    const orgIdNum = Number(orgId);
    const requesterEmail = normalizeEmail(getRequesterEmail(req));
    const normalizedEmail = requesterEmail || normalizeEmail(email);

    if (!Number.isFinite(orgIdNum)) {
      return res.status(400).json({ ok: false, error: "orgId is required" });
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ ok: false, error: "email is required" });
    }
    if (requesterEmail && normalizeEmail(email) && normalizeEmail(email) !== requesterEmail) {
      return res.status(403).json({ ok: false, error: "email does not match request user" });
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

    return res.status(201).json(record);
  });

  orgMembershipRouter.patch("/org-memberships/:id/approve", async (req, res) => {
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
    const requesterEmail = await requireOrgMembershipReviewer(req, res, membership.orgId);
    if (!requesterEmail) return;

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
        approvedBy:
          requesterEmail || normalizedApprovedBy || membership.approvedBy || null,
      },
    });

    if (isManufacturerOrg(membership.organization)) {
      const now = new Date();
      const existingEmployee = await prisma.employee.findUnique({
        where: { orgMembershipId: membership.id },
      });
      const resolvedEmployeeRoleId =
        nextRole === "WORKER"
          ? employeeRoleIdNum !== null && employeeRoleIdNum !== undefined
            ? employeeRoleIdNum
            : existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(membership.orgId))
          : null;
      const resolvedPayType = await resolveEmployeeStoredPayType({
        orgId: membership.orgId,
        membershipRole: nextRole,
        roleId: resolvedEmployeeRoleId,
        payType: existingEmployee?.payType,
      });
      await prisma.employee.upsert({
        where: { orgMembershipId: membership.id },
        update: {
          orgId: membership.orgId,
          factoryId: factoryIdNum,
          roleId: resolvedEmployeeRoleId,
          payType: resolvedPayType,
          joinedAt: existingEmployee?.joinedAt ?? now,
          leftAt: null,
          leaveStartAt: null,
          leaveEndAt: null,
        },
        create: {
          orgId: membership.orgId,
          orgMembershipId: membership.id,
          factoryId: factoryIdNum,
          roleId: resolvedEmployeeRoleId,
          payType: resolvedPayType,
          joinedAt: now,
        },
      });
    }

    return res.json(updated);
  });

  orgMembershipRouter.patch("/org-memberships/:id/reject", async (req, res) => {
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
    const requesterEmail = await requireOrgMembershipReviewer(req, res, membership.orgId);
    if (!requesterEmail) return;

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
        approvedBy:
          requesterEmail || normalizedApprovedBy || membership.approvedBy || null,
      },
    });

    return res.json(updated);
  });

  orgMembershipRouter.patch("/org-memberships/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const { role, status, approvedBy, email } = req.body ?? {};
    const normalizedApprovedBy = normalizeEmail(approvedBy);
    const normalizedEmailInput = normalizeEmail(email);
    const hasEmailInput = email !== undefined;

    if (role === undefined && status === undefined && !hasEmailInput) {
      return res
        .status(400)
        .json({ ok: false, error: "role, status or email is required" });
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!membership) {
      return res.status(404).json({ ok: false, error: "membership not found" });
    }
    const requesterEmail = await requireOrgMembershipReviewer(req, res, membership.orgId);
    if (!requesterEmail) return;

    const nextRole = role ? resolveRole(role, membership.role) : membership.role;
    const nextStatus = status ? resolveStatus(status) : null;
    if (status && !nextStatus) {
      return res.status(400).json({ ok: false, error: "invalid status" });
    }
    if (hasEmailInput && normalizedEmailInput && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({ ok: false, error: "invalid email" });
    }

    let nextEmail = membership.email;
    if (hasEmailInput) {
      if (isRoleRequiringLoginEmail(nextRole)) {
        if (!isValidEmail(normalizedEmailInput)) {
          return res.status(400).json({
            ok: false,
            error: "email is required for admin/operator",
          });
        }
        nextEmail = normalizedEmailInput;
      } else {
        nextEmail =
          normalizedEmailInput || (await generateAvailableInternalMemberEmail(membership.orgId));
      }
    } else if (role && isRoleRequiringLoginEmail(nextRole) && isInternalMemberEmail(nextEmail)) {
      return res.status(400).json({
        ok: false,
        error: "admin/operator role requires login email",
      });
    }

    if (nextEmail !== membership.email) {
      const duplicateMembership = await prisma.orgMembership.findUnique({
        where: {
          orgId_email: {
            orgId: membership.orgId,
            email: nextEmail,
          },
        },
        select: { id: true },
      });
      if (duplicateMembership && duplicateMembership.id !== membership.id) {
        return res.status(409).json({ ok: false, error: "email already exists" });
      }
    }

    const data: any = {
      email: nextEmail,
      role: nextRole,
      status: nextStatus ?? membership.status,
    };

    if (nextStatus && nextStatus !== membership.status) {
      data.approvedBy =
        requesterEmail || normalizedApprovedBy || membership.approvedBy || null;
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
      const resolvedRoleId =
        nextRole === "WORKER"
          ? existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(membership.orgId))
          : null;
      const resolvedPayType = await resolveEmployeeStoredPayType({
        orgId: membership.orgId,
        membershipRole: nextRole,
        roleId: resolvedRoleId,
        payType: existingEmployee?.payType,
      });

      const currentStatus = data.status ?? membership.status;
      const employeeData: any = {
        orgId: membership.orgId,
        roleId: resolvedRoleId,
        payType: resolvedPayType,
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

      if (currentStatus === "ACTIVE" && membership.status === "TERMINATED") {
        const hasActiveAssignment = await prisma.lineAssignment.findFirst({
          where: {
            employeeId: upsertedEmployee.id,
            endAt: null,
            line: {
              orgId: membership.orgId,
            },
          },
          select: { id: true },
        });

        if (!hasActiveAssignment) {
          const latestEndedAssignment = await prisma.lineAssignment.findFirst({
            where: {
              employeeId: upsertedEmployee.id,
              endAt: { not: null },
              line: {
                orgId: membership.orgId,
              },
            },
            select: {
              lineId: true,
              line: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: [{ endAt: "desc" }, { id: "desc" }],
          });

          if (latestEndedAssignment?.lineId) {
            await prisma.lineAssignment.create({
              data: {
                employeeId: upsertedEmployee.id,
                lineId: latestEndedAssignment.lineId,
                startAt: now,
              },
            });
            await prisma.employee.update({
              where: { id: upsertedEmployee.id },
              data: { lineName: latestEndedAssignment.line?.name ?? null },
            });
          }
        }
      } else if (currentStatus !== "ACTIVE") {
        await closeActiveLineAssignments(upsertedEmployee.id, now);
      }
    }

    return res.json(updated);
  });

  orgMembershipRouter.post("/org-memberships/assign", async (req, res) => {
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

    return res.status(201).json(record);
  });

  return orgMembershipRouter;
};
