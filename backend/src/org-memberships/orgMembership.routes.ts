import { Prisma, type OrgUserRole } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { prisma } from "../db";
import {
  generateNextEmployeeNo,
  normalizeEmployeeNo,
} from "../employees/employeeNumber";
import {
  getOrganizationByQuery,
  getRequesterEmail,
  requireSystemAdmin,
} from "../middleware/access";
import { normalizeEmail, resolveOptionalString } from "../utils/common";

type OrgMembershipRoutesDeps = {
  closeActiveLineAssignments: (employeeId: number, endedAt?: Date) => Promise<number[]>;
  hasOrgFeatureAccess: (args: {
    orgType: unknown;
    orgRole: OrgUserRole;
    feature: "EMPLOYEE";
  }) => Promise<boolean>;
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
  hasOrgFeatureAccess,
  isManufacturerOrg,
  resolveDefaultEmployeeRoleId,
  resolveEmployeeStoredPayType,
  resolveRole,
  resolveStatus,
}: OrgMembershipRoutesDeps) => {
  const orgMembershipRouter = Router();
  const LOGIN_REQUIRED_ROLES = new Set<OrgUserRole>(["ADMIN", "OPERATOR", "ACCOUNTANT"]);
  const REQUESTED_NAME_MAX_LENGTH = 80;

  const isRoleRequiringLoginEmail = (role: OrgUserRole) =>
    LOGIN_REQUIRED_ROLES.has(role);
  const isValidEmail = (value: string) => value.includes("@");
  const normalizeRequestedName = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
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
  const toOptionalDateOrNull = (
    value: unknown
  ):
    | { ok: true; hasInput: false; value: null }
    | { ok: true; hasInput: true; value: Date | null }
    | { ok: false } => {
    if (value === undefined) {
      return { ok: true, hasInput: false, value: null };
    }
    if (value === null || value === "") {
      return { ok: true, hasInput: true, value: null };
    }

    const normalizedText = String(value).trim();
    if (!normalizedText) {
      return { ok: true, hasInput: true, value: null };
    }

    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedText)
      ? new Date(`${normalizedText}T00:00:00.000Z`)
      : new Date(normalizedText);
    if (Number.isNaN(parsedDate.getTime())) {
      return { ok: false };
    }
    return { ok: true, hasInput: true, value: parsedDate };
  };
  const isEmptyEmployeeDraft = (employee: any) =>
    !employee ||
    (
      !resolveOptionalString(employee?.name, null) &&
      !resolveOptionalString(employee?.bankName, null) &&
      !resolveOptionalString(employee?.bankAccountNumber, null) &&
      !resolveOptionalString(employee?.phone, null) &&
      !resolveOptionalString(employee?.position, null)
    );

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
        organization: {
          select: {
            type: true,
          },
        },
      },
    });

    const hasEmployeeAccess =
      requesterMembership?.status === "ACTIVE" &&
      (await hasOrgFeatureAccess({
        orgType: requesterMembership.organization?.type,
        orgRole: requesterMembership.role,
        feature: "EMPLOYEE",
      }));
    if (
      !hasEmployeeAccess
    ) {
      const systemUser = await prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      });
      if (systemUser?.systemRole !== "SYSTEM_ADMIN") {
        res.status(403).json({
          ok: false,
          error: "employee access required",
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
    const {
      orgId,
      email,
      role,
      status,
      factoryId,
      name,
      bankName,
      bankAccountNumber,
      position,
      employeeRoleId,
      payType,
      fixedSalary,
      employeeNo,
      joinedAt,
      leftAt,
    } = req.body ?? {};
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
    const requestedStatus = status === undefined ? "ACTIVE" : resolveStatus(status);
    const requestedName = normalizeRequestedName(name);
    if (
      !requestedStatus ||
      requestedStatus === "PENDING" ||
      requestedStatus === "REJECTED"
    ) {
      return res.status(400).json({ ok: false, error: "invalid status" });
    }
    const normalizedEmailInput = normalizeEmail(email);
    if (normalizedEmailInput && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({ ok: false, error: "invalid email" });
    }
    if (isRoleRequiringLoginEmail(safeRole) && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({
        ok: false,
        error: "email is required for admin/operator/accountant",
      });
    }
    if (requestedName.length > REQUESTED_NAME_MAX_LENGTH) {
      return res.status(400).json({ ok: false, error: "name is too long" });
    }

    const resolvedMembershipEmail = normalizedEmailInput || null;
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
    let employeeRoleIdNum = null;
    if (
      employeeRoleId !== "" &&
      employeeRoleId !== null &&
      employeeRoleId !== undefined
    ) {
      const parsedRoleId = Number(employeeRoleId);
      if (!Number.isFinite(parsedRoleId)) {
        return res.status(400).json({ ok: false, error: "invalid employeeRoleId" });
      }
      const attrRole = await prisma.attrRole.findFirst({
        where: { id: parsedRoleId, orgId: orgIdNum },
      });
      if (!attrRole) {
        return res.status(404).json({ ok: false, error: "role not found" });
      }
      employeeRoleIdNum = parsedRoleId;
    }
    let payTypeValue = null;
    if (payType !== undefined) {
      if (payType === "" || payType === null) {
        payTypeValue = null;
      } else {
        const normalizedPayType = String(payType).trim().toUpperCase();
        if (normalizedPayType !== "CT" && normalizedPayType !== "FIXED") {
          return res.status(400).json({ ok: false, error: "invalid payType" });
        }
        payTypeValue = normalizedPayType as "CT" | "FIXED";
      }
    }
    const fixedSalaryParseResult = toFixedSalaryOrNull(fixedSalary);
    if (!fixedSalaryParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid fixedSalary" });
    }
    const hasFixedSalaryInput = fixedSalary !== undefined;
    const joinedAtParseResult = toOptionalDateOrNull(joinedAt);
    if (!joinedAtParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid joinedAt" });
    }
    const leftAtParseResult = toOptionalDateOrNull(leftAt);
    if (!leftAtParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid leftAt" });
    }
    const now = new Date();
    const existingMembership = resolvedMembershipEmail
      ? await prisma.orgMembership.findUnique({
          where: { orgId_email: { orgId: orgIdNum, email: resolvedMembershipEmail } },
        })
      : null;

    const existingEmployee =
      isManufacturer && existingMembership
        ? await prisma.employee.findUnique({
            where: { orgMembershipId: existingMembership.id },
          })
        : null;
    let resolvedRoleId: number | null = null;
    let resolvedPayType: "CT" | "FIXED" = "FIXED";
    let resolvedFactoryId: number | null = null;
    let resolvedFixedSalary: number | null = null;
    let resolvedEmployeeNo: string | null | undefined = undefined;
    if (isManufacturer) {
      resolvedRoleId =
        safeRole === "WORKER"
          ? employeeRoleIdNum !== null && employeeRoleIdNum !== undefined
            ? employeeRoleIdNum
            : existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(orgIdNum))
          : null;
      resolvedPayType = await resolveEmployeeStoredPayType({
        orgId: orgIdNum,
        membershipRole: safeRole,
        roleId: resolvedRoleId,
        payType: payType !== undefined ? payTypeValue : existingEmployee?.payType,
      });
      resolvedFactoryId =
        factoryIdNum !== null && factoryIdNum !== undefined
          ? factoryIdNum
          : existingEmployee?.factoryId ?? null;
      resolvedFixedSalary = hasFixedSalaryInput
        ? fixedSalaryParseResult.value
        : existingEmployee?.fixedSalary ?? null;
      if (
        safeRole === "WORKER" &&
        (resolvedFactoryId === null || resolvedFactoryId === undefined)
      ) {
        return res.status(400).json({
          ok: false,
          error: "factoryId is required for worker employees",
        });
      }
      if (employeeNo !== undefined) {
        const normalizedEmployeeNo = normalizeEmployeeNo(employeeNo);
        if (normalizedEmployeeNo) {
          const conflict = await prisma.employee.findFirst({
            where: {
              orgId: orgIdNum,
              employeeNo: normalizedEmployeeNo,
              ...(existingEmployee ? { id: { not: existingEmployee.id } } : {}),
            },
            select: { id: true },
          });
          if (conflict) {
            return res.status(409).json({ ok: false, error: "employeeNo already in use" });
          }
          resolvedEmployeeNo = normalizedEmployeeNo;
        }
      }
    }

    try {
      const membership = await prisma.$transaction(async (tx) => {
        const membership = existingMembership
          ? await tx.orgMembership.update({
              where: { id: existingMembership.id },
              data: {
                role: safeRole,
                status: requestedStatus as any,
                requestedName: requestedName || existingMembership.requestedName || null,
                approvedAt: now,
                approvedBy: requesterEmail,
              },
            })
          : await tx.orgMembership.create({
              data: {
                orgId: orgIdNum,
                email: resolvedMembershipEmail,
                role: safeRole,
                status: requestedStatus as any,
                requestedName: requestedName || null,
                requestedAt: now,
                approvedAt: now,
                approvedBy: requesterEmail,
              },
            });

        if (isManufacturer) {
          const transactionEmployeeNo =
            resolvedEmployeeNo !== undefined
              ? resolvedEmployeeNo
              : normalizeEmployeeNo(existingEmployee?.employeeNo) ||
                (resolvedFactoryId
                  ? await generateNextEmployeeNo(tx, orgIdNum, resolvedFactoryId)
                  : null);

          await tx.employee.upsert({
            where: { orgMembershipId: membership.id },
            update: {
              orgId: orgIdNum,
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
              ...(transactionEmployeeNo ? { employeeNo: transactionEmployeeNo } : {}),
              joinedAt: joinedAtParseResult.hasInput
                ? joinedAtParseResult.value
                : existingEmployee?.joinedAt ?? now,
              leftAt: leftAtParseResult.hasInput ? leftAtParseResult.value : null,
              leaveStartAt: null,
              leaveEndAt: null,
            },
            create: {
              orgId: orgIdNum,
              orgMembershipId: membership.id,
              factoryId: resolvedFactoryId,
              roleId: resolvedRoleId,
              payType: resolvedPayType,
              fixedSalary: resolvedFixedSalary,
              name: resolveOptionalString(name, null),
              bankName: resolveOptionalString(bankName, null),
              bankAccountNumber: resolveOptionalString(bankAccountNumber, null),
              position: resolveOptionalString(position, null),
              employeeNo: transactionEmployeeNo,
              joinedAt: joinedAtParseResult.hasInput ? joinedAtParseResult.value : now,
              leftAt: leftAtParseResult.hasInput ? leftAtParseResult.value : null,
            },
          });
        }

        return membership;
      });

      return res.status(existingMembership ? 200 : 201).json(membership);
    } catch (error) {
      const knownError = error as { code?: string; meta?: { target?: unknown } };
      const targetText = JSON.stringify(knownError.meta?.target ?? "");
      if (knownError.code === "P2002") {
        if (targetText.includes("email")) {
          return res
            .status(409)
            .json({ ok: false, error: "active org membership already exists" });
        }
        return res.status(409).json({ ok: false, error: "employeeNo already in use" });
      }
      if (knownError.code === "P2011" && targetText.includes("email")) {
        return res.status(503).json({
          ok: false,
          error: "worker email optional schema migration is required",
        });
      }
      throw error;
    }
  });

  orgMembershipRouter.delete("/org-memberships/:id/draft-cleanup", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!membership) {
      return res.status(404).json({ ok: false, error: "membership not found" });
    }

    const requesterEmail = await requireOrgMembershipReviewer(req, res, membership.orgId);
    if (!requesterEmail) return;
    if (normalizeEmail(membership.email) === requesterEmail) {
      return res.status(400).json({ ok: false, error: "cannot delete current user membership" });
    }

    if (!isEmptyEmployeeDraft(membership.employee)) {
      return res.status(409).json({
        ok: false,
        error: "only empty draft employees can be deleted",
      });
    }

    const employeeId = membership.employee?.id ?? null;
    if (employeeId) {
      const [attendanceCount, lineAssignmentCount, managedLineCount, workRecordCount] =
        await Promise.all([
          prisma.attendanceEntry.count({
            where: { orgId: membership.orgId, workerId: employeeId },
          }),
          prisma.lineAssignment.count({
            where: { employeeId },
          }),
          prisma.line.count({
            where: { managerEmployeeId: employeeId },
          }),
          prisma.workRecord.count({
            where: { orgId: membership.orgId, workerId: employeeId },
          }),
        ]);

      if (
        attendanceCount > 0 ||
        lineAssignmentCount > 0 ||
        managedLineCount > 0 ||
        workRecordCount > 0
      ) {
        return res.status(409).json({
          ok: false,
          error: "employee has dependent data",
          details: {
            attendanceCount,
            lineAssignmentCount,
            managedLineCount,
            workRecordCount,
          },
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (employeeId) {
        await tx.employee.delete({
          where: { id: employeeId },
        });
      }
      await tx.orgMembership.delete({
        where: { id: membership.id },
      });
    });

    return res.json({
      ok: true,
      deletedMembershipId: membership.id,
      deletedEmployeeId: employeeId,
    });
  });

  orgMembershipRouter.post("/org-memberships/apply", async (req, res) => {
    const { orgId, email, role, name } = req.body ?? {};
    const orgIdNum = Number(orgId);
    const requesterEmail = normalizeEmail(getRequesterEmail(req));
    const normalizedEmail = requesterEmail || normalizeEmail(email);
    const requestedName = normalizeRequestedName(name);

    if (!Number.isFinite(orgIdNum)) {
      return res.status(400).json({ ok: false, error: "orgId is required" });
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ ok: false, error: "email is required" });
    }
    if (!requestedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    if (requestedName.length > REQUESTED_NAME_MAX_LENGTH) {
      return res.status(400).json({ ok: false, error: "name is too long" });
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
          requestedName,
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
        requestedName,
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
      await prisma.$transaction(async (tx) => {
        const employeeNo =
          normalizeEmployeeNo(existingEmployee?.employeeNo) ||
          (factoryIdNum
            ? await generateNextEmployeeNo(tx, membership.orgId, factoryIdNum)
            : null);

        await tx.employee.upsert({
          where: { orgMembershipId: membership.id },
          update: {
            orgId: membership.orgId,
            factoryId: factoryIdNum,
            roleId: resolvedEmployeeRoleId,
            payType: resolvedPayType,
            name: resolveOptionalString(existingEmployee?.name, membership.requestedName ?? null),
            ...(employeeNo ? { employeeNo } : {}),
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
            name: resolveOptionalString(existingEmployee?.name, membership.requestedName ?? null),
            employeeNo,
            joinedAt: now,
          },
        });
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

    let nextEmail = membership.email ?? null;
    if (hasEmailInput) {
      if (isRoleRequiringLoginEmail(nextRole)) {
        if (!isValidEmail(normalizedEmailInput)) {
          return res.status(400).json({
            ok: false,
            error: "email is required for admin/operator/accountant",
          });
        }
        nextEmail = normalizedEmailInput;
      } else {
        nextEmail = normalizedEmailInput || null;
      }
    } else if (
      role &&
      isRoleRequiringLoginEmail(nextRole) &&
      !isValidEmail(nextEmail || "")
    ) {
      return res.status(400).json({
        ok: false,
        error: "admin/operator/accountant role requires login email",
      });
    }

    if (nextEmail !== membership.email && nextEmail) {
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
        name: resolveOptionalString(existingEmployee?.name, membership.requestedName ?? null),
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

      const upsertedEmployee = await prisma.$transaction(async (tx) => {
        const resolvedFactoryId = existingEmployee?.factoryId ?? null;
        const employeeNo =
          normalizeEmployeeNo(existingEmployee?.employeeNo) ||
          (currentStatus === "ACTIVE" && resolvedFactoryId
            ? await generateNextEmployeeNo(
                tx,
                membership.orgId,
                resolvedFactoryId
              )
            : null);

        return tx.employee.upsert({
          where: { orgMembershipId: membership.id },
          update: {
            ...employeeData,
            ...(employeeNo ? { employeeNo } : {}),
          },
          create: {
            orgMembershipId: membership.id,
            factoryId: resolvedFactoryId,
            employeeNo,
            joinedAt: existingEmployee?.joinedAt ?? now,
            ...employeeData,
          },
        });
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
              data: { lineId: latestEndedAssignment.lineId ?? null },
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
