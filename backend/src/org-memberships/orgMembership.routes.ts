import { Prisma, type OrgUserRole } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, requireSystemAdmin } from "../middleware/access";
import { normalizeEmail } from "../utils/common";

type OrgMembershipRoutesDeps = {
  closeActiveLineAssignments: (employeeId: number, endedAt?: Date) => Promise<number[]>;
  ensureDefaultEmployeeRoles: (orgId: number) => Promise<any>;
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
  ensureDefaultEmployeeRoles,
  isManufacturerOrg,
  resolveDefaultEmployeeRoleId,
  resolveEmployeeStoredPayType,
  resolveRole,
  resolveStatus,
}: OrgMembershipRoutesDeps) => {
  const orgMembershipRouter = Router();

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
    const where: Prisma.OrgMembershipWhereInput = {
      orgId: organization.id,
      ...(status ? { status: status as any } : {}),
      ...(email ? { email } : {}),
    };
    const members = await prisma.orgMembership.findMany({
      where,
      orderBy: { id: "asc" },
    });
    return res.json(members);
  };

  orgMembershipRouter.get("/org-memberships", listOrgMemberships);

  orgMembershipRouter.post("/org-memberships/apply", async (req, res) => {
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
    if (isManufacturerOrg(membership.organization)) {
      await ensureDefaultEmployeeRoles(membership.orgId);
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

    return res.json(updated);
  });

  orgMembershipRouter.patch("/org-memberships/:id", async (req, res) => {
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
      await ensureDefaultEmployeeRoles(membership.orgId);
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

      if (currentStatus !== "ACTIVE") {
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
