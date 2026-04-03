import { type OrgUserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import {
  normalizePayType,
  resolveEmployeeEffectivePayType,
  resolveRoleDefaultPayType,
} from "./employeeCompensation";
import { resolveOptionalString } from "../utils/common";

type EmployeeRoutesDeps = {
  ensureDefaultEmployeeRoles: (orgId: number) => Promise<any>;
  isManufacturerOrg: (org: { type?: string | null } | null | undefined) => boolean;
  resolveDefaultEmployeeRoleId: (orgId: number) => Promise<number | null>;
  resolveEmployeeStoredPayType: (args: {
    orgId: number;
    membershipRole: OrgUserRole;
    roleId: number | null;
    payType: unknown;
  }) => Promise<"CT" | "FIXED">;
};

const toFixedSalaryOrNull = (
  value: unknown
): { ok: true; value: number | null } | { ok: false } => {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  const sanitized =
    typeof value === "string" ? value.replace(/[,\s]/g, "") : value;
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(parsed) };
};

const toEmployeeResponse = (employee: any) => ({
  id: employee?.id ?? null,
  orgId: employee?.orgId ?? null,
  orgMembershipId: employee?.orgMembershipId ?? null,
  factoryId: employee?.factoryId ?? null,
  roleId: employee?.roleId ?? null,
  roleCode: String(employee?.role?.code ?? "").trim(),
  roleName: String(employee?.role?.name ?? "").trim(),
  roleDefaultPayType: resolveRoleDefaultPayType(employee?.role),
  payType: resolveEmployeeEffectivePayType(employee),
  effectivePayType: resolveEmployeeEffectivePayType(employee),
  fixedSalary: employee?.fixedSalary ?? null,
  name: employee?.name ?? null,
  phone: employee?.phone ?? null,
  bankName: employee?.bankName ?? null,
  bankAccountNumber: employee?.bankAccountNumber ?? null,
  lineName: employee?.lineName ?? null,
  position: employee?.position ?? null,
  joinedAt: employee?.joinedAt ?? null,
  leftAt: employee?.leftAt ?? null,
  leaveStartAt: employee?.leaveStartAt ?? null,
  leaveEndAt: employee?.leaveEndAt ?? null,
  createdAt: employee?.createdAt ?? null,
  updatedAt: employee?.updatedAt ?? null,
});

export const createEmployeeRouter = ({
  ensureDefaultEmployeeRoles,
  isManufacturerOrg,
  resolveDefaultEmployeeRoleId,
  resolveEmployeeStoredPayType,
}: EmployeeRoutesDeps) => {
  const employeeRouter = Router();

  employeeRouter.get("/employees/me", async (req, res) => {
    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }

    const membership = await prisma.orgMembership.findFirst({
      where: { email: requesterEmail, status: "ACTIVE" },
      include: { employee: true },
      orderBy: { id: "asc" },
    });

    if (!membership) {
      return res.status(404).json({ ok: false, error: "membership not found" });
    }

    return res.json({
      email: membership.email,
      name: membership.employee?.name ?? null,
      phone: (membership.employee as any)?.phone ?? null,
      bankName: membership.employee?.bankName ?? null,
      bankAccountNumber: membership.employee?.bankAccountNumber ?? null,
      employeeId: membership.employee?.id ?? null,
    });
  });

  employeeRouter.patch("/employees/me", async (req, res) => {
    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }

    const membership = await prisma.orgMembership.findFirst({
      where: { email: requesterEmail, status: "ACTIVE" },
      include: { employee: { select: { id: true } } },
      orderBy: { id: "asc" },
    });

    if (!membership || !membership.employee) {
      return res.status(404).json({ ok: false, error: "employee record not found" });
    }

    const { name, phone, bankName, bankAccountNumber } = req.body ?? {};
    const trim = (value: any) => (typeof value === "string" ? value.trim() || null : null);

    const updated = await (prisma.employee as any).update({
      where: { id: membership.employee.id },
      data: {
        ...(name !== undefined ? { name: trim(name) } : {}),
        ...(phone !== undefined ? { phone: trim(phone) } : {}),
        ...(bankName !== undefined ? { bankName: trim(bankName) } : {}),
        ...(bankAccountNumber !== undefined ? { bankAccountNumber: trim(bankAccountNumber) } : {}),
      },
    });

    return res.json({
      email: membership.email,
      name: updated.name ?? null,
      phone: updated.phone ?? null,
      bankName: updated.bankName ?? null,
      bankAccountNumber: updated.bankAccountNumber ?? null,
      employeeId: updated.id,
    });
  });

  employeeRouter.get("/employees", async (req, res) => {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }
    const factoryId = Number(req.query.factoryId);
    const membershipRole =
      typeof req.query.membershipRole === "string"
        ? req.query.membershipRole.toUpperCase()
        : null;
    const where: any = {
      orgId: organization.id,
      ...(Number.isFinite(factoryId) ? { factoryId } : {}),
      ...(membershipRole ? { membership: { role: membershipRole as any } } : {}),
    };
    await ensureDefaultEmployeeRoles(organization.id);
    const employees = await prisma.employee.findMany({
      where,
      include: {
        role: true,
      },
      orderBy: { id: "asc" },
    });
    return res.json(employees.map(toEmployeeResponse));
  });

  employeeRouter.post("/employees", async (req, res) => {
    const {
      orgMembershipId,
      factoryId,
      position,
      roleId,
      payType,
      fixedSalary,
      name,
      bankName,
      bankAccountNumber,
    } = req.body ?? {};
    const orgMembershipIdNum = Number(orgMembershipId);

    if (!Number.isFinite(orgMembershipIdNum)) {
      return res.status(400).json({ ok: false, error: "orgMembershipId is required" });
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { id: orgMembershipIdNum },
      include: { organization: true },
    });

    if (!membership) {
      return res.status(404).json({ ok: false, error: "membership not found" });
    }

    if (membership.status === "PENDING" || membership.status === "REJECTED") {
      return res.status(400).json({ ok: false, error: "membership is not editable yet" });
    }

    await ensureDefaultEmployeeRoles(membership.orgId);

    let factoryIdNum = null;
    if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
      const parsedFactoryId = Number(factoryId);
      if (!Number.isFinite(parsedFactoryId)) {
        return res.status(400).json({ ok: false, error: "invalid factoryId" });
      }
      factoryIdNum = parsedFactoryId;
    }

    if (!isManufacturerOrg(membership.organization) && factoryIdNum) {
      return res.status(400).json({ ok: false, error: "brand organizations have no factories" });
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

    let payTypeValue = null;
    if (payType !== undefined) {
      if (payType === "" || payType === null) {
        payTypeValue = null;
      } else {
        const normalizedPayType = normalizePayType(payType, null);
        if (!normalizedPayType) {
          return res.status(400).json({ ok: false, error: "invalid payType" });
        }
        payTypeValue = normalizedPayType;
      }
    }

    const fixedSalaryParseResult = toFixedSalaryOrNull(fixedSalary);
    if (!fixedSalaryParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid fixedSalary" });
    }
    const hasFixedSalaryInput = fixedSalary !== undefined;

    const existingEmployee = await prisma.employee.findUnique({
      where: { orgMembershipId: membership.id },
    });
    const resolvedFactoryId = isManufacturerOrg(membership.organization)
      ? factoryIdNum !== null && factoryIdNum !== undefined
        ? factoryIdNum
        : existingEmployee?.factoryId ?? null
      : null;
    const resolvedRoleId =
      membership.role === "WORKER"
        ? roleIdNum !== null && roleIdNum !== undefined
          ? roleIdNum
          : existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(membership.orgId))
        : null;
    const resolvedPayType = await resolveEmployeeStoredPayType({
      orgId: membership.orgId,
      membershipRole: membership.role,
      roleId: resolvedRoleId,
      payType: payType !== undefined ? payTypeValue : existingEmployee?.payType,
    });
    const resolvedFixedSalary =
      resolvedPayType === "FIXED"
        ? hasFixedSalaryInput
          ? fixedSalaryParseResult.value
          : existingEmployee?.fixedSalary ?? null
        : null;

    const data = {
      orgId: membership.orgId,
      orgMembershipId: membership.id,
      factoryId: resolvedFactoryId,
      roleId: resolvedRoleId,
      payType: resolvedPayType,
      fixedSalary: resolvedFixedSalary,
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
      include: {
        role: true,
      },
    });

    return res.json(toEmployeeResponse(refreshedEmployee));
  });

  return employeeRouter;
};
