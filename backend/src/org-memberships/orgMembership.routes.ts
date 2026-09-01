import { Prisma, type OrgUserRole } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { prisma } from "../db";
import {
  generateNextEmployeeNo,
  normalizeEmployeeNo,
} from "../employees/employeeNumber";
import {
  type EmployeePayType,
  normalizePayType,
} from "../employees/employeeCompensation";
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
  }) => Promise<EmployeePayType>;
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
  const isValidEmail = (value: string | null | undefined) =>
    Boolean(value && value.includes("@"));
  const normalizeRequestedName = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const resolveMemberName = (employee: any) =>
    resolveOptionalString(employee?.requestedName ?? employee?.name, null);

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

  const toMembershipResponseFromEmployee = (employee: any) => ({
    id: employee?.id ?? null,
    orgId: employee?.orgId ?? null,
    email: employee?.email ?? null,
    role: employee?.orgRole ?? "WORKER",
    status: employee?.status ?? "ACTIVE",
    requestedAt: employee?.requestedAt ?? null,
    requestedName: resolveMemberName(employee),
    approvedAt: employee?.approvedAt ?? null,
    approvedBy: employee?.approvedBy ?? null,
    createdAt: employee?.createdAt ?? null,
    createdBy: employee?.createdBy ?? "system@baro.local",
    updatedAt: employee?.updatedAt ?? null,
  });

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

    const requesterEmployee = await prisma.employee.findUnique({
      where: {
        orgId_email: {
          orgId,
          email: requesterEmail,
        },
      },
      select: {
        status: true,
        orgRole: true,
        organization: {
          select: {
            type: true,
          },
        },
      },
    });

    const hasEmployeeAccess =
      requesterEmployee?.status === "ACTIVE" &&
      (await hasOrgFeatureAccess({
        orgType: requesterEmployee.organization?.type,
        orgRole: requesterEmployee.orgRole,
        feature: "EMPLOYEE",
      }));
    if (!hasEmployeeAccess) {
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

  const findEmployeeAccount = (id: number) =>
    prisma.employee.findUnique({
      where: { id },
      include: { organization: true },
    });

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
    const where: Prisma.EmployeeWhereInput = {
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
    const members = await prisma.employee.findMany({
      where,
      orderBy: { id: "asc" },
    });
    return res.json(members.map(toMembershipResponseFromEmployee));
  };

  const resolveEmployeeAccountPatch = async ({
    orgId,
    organization,
    existingEmployee,
    role,
    factoryId,
    employeeRoleId,
    payType,
    employeeNo,
    joinedAt,
    leftAt,
  }: {
    orgId: number;
    organization: any;
    existingEmployee: any;
    role: OrgUserRole;
    factoryId: unknown;
    employeeRoleId: unknown;
    payType: unknown;
    employeeNo: unknown;
    joinedAt: unknown;
    leftAt: unknown;
  }) => {
    const isManufacturer = isManufacturerOrg(organization);
    const hasFactoryIdInput = factoryId !== undefined;
    let factoryIdNum = null;
    if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
      const parsedFactoryId = Number(factoryId);
      if (!Number.isFinite(parsedFactoryId)) {
        return { ok: false as const, status: 400, error: "invalid factoryId" };
      }
      factoryIdNum = parsedFactoryId;
    }
    if (!isManufacturer && factoryIdNum) {
      return {
        ok: false as const,
        status: 400,
        error: "brand organizations have no factories",
      };
    }
    if (isManufacturer && factoryIdNum) {
      const factory = await prisma.factory.findFirst({
        where: { id: factoryIdNum, orgId },
      });
      if (!factory) {
        return { ok: false as const, status: 404, error: "factory not found" };
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
        return { ok: false as const, status: 400, error: "invalid employeeRoleId" };
      }
      const attrRole = await prisma.attrRole.findFirst({
        where: { id: parsedRoleId, orgId },
      });
      if (!attrRole) {
        return { ok: false as const, status: 404, error: "role not found" };
      }
      employeeRoleIdNum = parsedRoleId;
    }

    let payTypeValue = null;
    if (payType !== undefined) {
      if (payType === "" || payType === null) {
        payTypeValue = null;
      } else {
        const normalizedPayType = normalizePayType(payType, null);
        if (!normalizedPayType) {
          return { ok: false as const, status: 400, error: "invalid payType" };
        }
        payTypeValue = normalizedPayType;
      }
    }

    const joinedAtParseResult = toOptionalDateOrNull(joinedAt);
    if (!joinedAtParseResult.ok) {
      return { ok: false as const, status: 400, error: "invalid joinedAt" };
    }
    const leftAtParseResult = toOptionalDateOrNull(leftAt);
    if (!leftAtParseResult.ok) {
      return { ok: false as const, status: 400, error: "invalid leftAt" };
    }

    let resolvedEmployeeNo: string | null | undefined = undefined;
    if (employeeNo !== undefined) {
      const normalizedEmployeeNo = normalizeEmployeeNo(employeeNo);
      if (normalizedEmployeeNo) {
        const conflict = await prisma.employee.findFirst({
          where: {
            orgId,
            employeeNo: normalizedEmployeeNo,
            ...(existingEmployee ? { id: { not: existingEmployee.id } } : {}),
          },
          select: { id: true },
        });
        if (conflict) {
          return { ok: false as const, status: 409, error: "employeeNo already in use" };
        }
        resolvedEmployeeNo = normalizedEmployeeNo;
      }
    }

    const resolvedRoleId =
      isManufacturer && role === "WORKER"
        ? employeeRoleIdNum !== null && employeeRoleIdNum !== undefined
          ? employeeRoleIdNum
          : existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(orgId))
        : null;
    const resolvedPayType = isManufacturer
      ? await resolveEmployeeStoredPayType({
          orgId,
          membershipRole: role,
          roleId: resolvedRoleId,
          payType: payType !== undefined ? payTypeValue : existingEmployee?.payType,
        })
      : null;
    const resolvedFactoryId = isManufacturer
      ? hasFactoryIdInput
        ? factoryIdNum
        : existingEmployee?.factoryId ?? null
      : null;
    if (
      isManufacturer &&
      (resolvedFactoryId === null || resolvedFactoryId === undefined)
    ) {
      return {
        ok: false as const,
        status: 400,
        error: "factoryId is required for manufacturer employees",
      };
    }

    return {
      ok: true as const,
      value: {
        factoryId: resolvedFactoryId,
        roleId: resolvedRoleId,
        payType: resolvedPayType,
        employeeNo: resolvedEmployeeNo,
        joinedAtParseResult,
        leftAtParseResult,
      },
    };
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

    const existingEmployee = normalizedEmailInput
      ? await prisma.employee.findUnique({
          where: { orgId_email: { orgId: orgIdNum, email: normalizedEmailInput } },
        })
      : null;

    const accountPatch = await resolveEmployeeAccountPatch({
      orgId: orgIdNum,
      organization,
      existingEmployee,
      role: safeRole,
      factoryId,
      employeeRoleId,
      payType,
      employeeNo,
      joinedAt,
      leftAt,
    });
    if (!accountPatch.ok) {
      return res.status(accountPatch.status).json({ ok: false, error: accountPatch.error });
    }

    const now = new Date();
    const shouldMarkTerminated =
      accountPatch.value.leftAtParseResult.hasInput &&
      accountPatch.value.leftAtParseResult.value !== null;
    const data: any = {
      orgId: orgIdNum,
      email: normalizedEmailInput || null,
      orgRole: safeRole,
      status: shouldMarkTerminated ? "TERMINATED" : requestedStatus,
      requestedAt: existingEmployee?.requestedAt ?? now,
      requestedName: requestedName || existingEmployee?.requestedName || null,
      approvedAt: existingEmployee?.approvedAt ?? now,
      approvedBy: requesterEmail,
      factoryId: accountPatch.value.factoryId,
      roleId: accountPatch.value.roleId,
      payType: accountPatch.value.payType,
      name: resolveOptionalString(
        name,
        (existingEmployee?.name ?? requestedName) || null
      ),
      bankName: resolveOptionalString(bankName, existingEmployee?.bankName ?? null),
      bankAccountNumber: resolveOptionalString(
        bankAccountNumber,
        existingEmployee?.bankAccountNumber ?? null
      ),
      position: resolveOptionalString(position, existingEmployee?.position ?? null),
      joinedAt: accountPatch.value.joinedAtParseResult.hasInput
        ? accountPatch.value.joinedAtParseResult.value
        : existingEmployee?.joinedAt ?? now,
      leftAt: accountPatch.value.leftAtParseResult.hasInput
        ? accountPatch.value.leftAtParseResult.value
        : null,
      leaveStartAt: null,
      leaveEndAt: null,
    };
    if (accountPatch.value.employeeNo !== undefined) {
      data.employeeNo = accountPatch.value.employeeNo;
    }

    try {
      const employee = await prisma.$transaction(async (tx) => {
        const transactionData = { ...data };
        if (
          isManufacturerOrg(organization) &&
          transactionData.employeeNo === undefined &&
          !normalizeEmployeeNo(existingEmployee?.employeeNo)
        ) {
          transactionData.employeeNo = await generateNextEmployeeNo(tx, orgIdNum);
        }

        if (existingEmployee) {
          return tx.employee.update({
            where: { id: existingEmployee.id },
            data: transactionData,
          });
        }
        return tx.employee.create({ data: transactionData });
      });

      return res
        .status(existingEmployee ? 200 : 201)
        .json(toMembershipResponseFromEmployee(employee));
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({ ok: false, error: "email or employeeNo already in use" });
      }
      throw error;
    }
  });

  orgMembershipRouter.delete("/org-memberships/:id/draft-cleanup", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const employee = await findEmployeeAccount(id);
    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee account not found" });
    }

    const requesterEmail = await requireOrgMembershipReviewer(req, res, employee.orgId);
    if (!requesterEmail) return;
    if (normalizeEmail(employee.email) === requesterEmail) {
      return res.status(400).json({ ok: false, error: "cannot delete current user account" });
    }

    if (!isEmptyEmployeeDraft(employee)) {
      return res.status(409).json({
        ok: false,
        error: "only empty draft employees can be deleted",
      });
    }

    const [attendanceCount, lineAssignmentCount, managedLineCount, workRecordCount] =
      await Promise.all([
        prisma.attendanceEntry.count({
          where: { orgId: employee.orgId, workerId: employee.id },
        }),
        prisma.lineAssignment.count({
          where: { employeeId: employee.id },
        }),
        prisma.line.count({
          where: { managerEmployeeId: employee.id },
        }),
        prisma.workRecord.count({
          where: { orgId: employee.orgId, workerId: employee.id },
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

    await prisma.employee.delete({ where: { id: employee.id } });

    return res.json({
      ok: true,
      deletedMembershipId: employee.id,
      deletedEmployeeId: employee.id,
    });
  });

  orgMembershipRouter.post("/org-memberships/apply", async (req, res) => {
    const { orgId, email, role, name } = req.body ?? {};
    const orgIdNum = Number(orgId);
    const requesterEmail = normalizeEmail(getRequesterEmail(req));
    const normalizedEmailInput = normalizeEmail(email);
    const requestedName = normalizeRequestedName(name);

    if (!Number.isFinite(orgIdNum)) {
      return res.status(400).json({ ok: false, error: "orgId is required" });
    }
    if (!isValidEmail(requesterEmail)) {
      return res.status(401).json({ ok: false, error: "authentication is required" });
    }
    if (!requestedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    if (requestedName.length > REQUESTED_NAME_MAX_LENGTH) {
      return res.status(400).json({ ok: false, error: "name is too long" });
    }
    if (normalizedEmailInput && normalizedEmailInput !== requesterEmail) {
      return res.status(403).json({ ok: false, error: "email does not match request user" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgIdNum },
    });
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const safeRole = resolveRole(role, "WORKER");
    const existing = await prisma.employee.findUnique({
      where: { orgId_email: { orgId: orgIdNum, email: requesterEmail } },
    });

    if (existing?.status === "ACTIVE") {
      if (!resolveOptionalString(existing.name, null)) {
        const updated = await prisma.employee.update({
          where: { id: existing.id },
          data: {
            name: requestedName,
            requestedName: existing.requestedName ?? requestedName,
          },
        });
        return res.json(toMembershipResponseFromEmployee(updated));
      }
      return res.json(toMembershipResponseFromEmployee(existing));
    }

    const now = new Date();
    const data = {
      orgId: orgIdNum,
      email: requesterEmail,
      orgRole: safeRole,
      requestedName,
      name: requestedName,
      status: "PENDING" as const,
      requestedAt: now,
      approvedAt: null,
      approvedBy: null,
    };
    const record = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.employee.create({
          data,
        });

    return res.status(existing ? 200 : 201).json(toMembershipResponseFromEmployee(record));
  });

  orgMembershipRouter.patch("/org-memberships/:id/approve", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const { role, approvedBy, factoryId, employeeRoleId } = req.body ?? {};
    const normalizedApprovedBy = normalizeEmail(approvedBy);

    const employee = await findEmployeeAccount(id);
    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee account not found" });
    }
    const requesterEmail = await requireOrgMembershipReviewer(req, res, employee.orgId);
    if (!requesterEmail) return;

    const nextRole = resolveRole(role, employee.orgRole);
    const accountPatch = await resolveEmployeeAccountPatch({
      orgId: employee.orgId,
      organization: employee.organization,
      existingEmployee: employee,
      role: nextRole,
      factoryId,
      employeeRoleId,
      payType: employee.payType,
      employeeNo: undefined,
      joinedAt: undefined,
      leftAt: null,
    });
    if (!accountPatch.ok) {
      return res.status(accountPatch.status).json({ ok: false, error: accountPatch.error });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const employeeNo =
        normalizeEmployeeNo(employee.employeeNo) ||
        (isManufacturerOrg(employee.organization)
          ? await generateNextEmployeeNo(tx, employee.orgId)
          : null);
      return tx.employee.update({
        where: { id: employee.id },
        data: {
          orgRole: nextRole,
          status: "ACTIVE",
          approvedAt: now,
          approvedBy: requesterEmail || normalizedApprovedBy || employee.approvedBy || null,
          factoryId: accountPatch.value.factoryId,
          roleId: accountPatch.value.roleId,
          payType: accountPatch.value.payType,
          name: resolveOptionalString(employee.name, employee.requestedName ?? null),
          ...(employeeNo ? { employeeNo } : {}),
          joinedAt: employee.joinedAt ?? now,
          leftAt: null,
          leaveStartAt: null,
          leaveEndAt: null,
        },
      });
    });

    return res.json(toMembershipResponseFromEmployee(updated));
  });

  orgMembershipRouter.patch("/org-memberships/:id/reject", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const { approvedBy } = req.body ?? {};
    const normalizedApprovedBy = normalizeEmail(approvedBy);

    const employee = await findEmployeeAccount(id);
    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee account not found" });
    }
    const requesterEmail = await requireOrgMembershipReviewer(req, res, employee.orgId);
    if (!requesterEmail) return;

    const now = new Date();
    await closeActiveLineAssignments(employee.id, employee.leftAt ?? now);
    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        status: "REJECTED",
        approvedAt: now,
        approvedBy: requesterEmail || normalizedApprovedBy || employee.approvedBy || null,
        leftAt: employee.leftAt ?? now,
        leaveStartAt: employee.leaveStartAt ?? now,
        leaveEndAt: employee.leaveEndAt ?? now,
      },
    });

    return res.json(toMembershipResponseFromEmployee(updated));
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

    const employee = await findEmployeeAccount(id);
    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee account not found" });
    }
    const requesterEmail = await requireOrgMembershipReviewer(req, res, employee.orgId);
    if (!requesterEmail) return;

    const nextRole = role ? resolveRole(role, employee.orgRole) : employee.orgRole;
    const nextStatus = status ? resolveStatus(status) : null;
    if (status && !nextStatus) {
      return res.status(400).json({ ok: false, error: "invalid status" });
    }
    if (hasEmailInput && normalizedEmailInput && !isValidEmail(normalizedEmailInput)) {
      return res.status(400).json({ ok: false, error: "invalid email" });
    }

    let nextEmail = employee.email ?? null;
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

    if (nextEmail !== employee.email && nextEmail) {
      const duplicateEmployee = await prisma.employee.findUnique({
        where: {
          orgId_email: {
            orgId: employee.orgId,
            email: nextEmail,
          },
        },
        select: { id: true },
      });
      if (duplicateEmployee && duplicateEmployee.id !== employee.id) {
        return res.status(409).json({ ok: false, error: "email already exists" });
      }
    }

    const now = new Date();
    const effectiveStatus = (nextStatus ?? employee.status) as string;
    const data: any = {
      email: nextEmail,
      orgRole: nextRole,
      status: effectiveStatus,
    };
    if (nextStatus && nextStatus !== employee.status) {
      data.approvedBy =
        requesterEmail || normalizedApprovedBy || employee.approvedBy || null;
      if (nextStatus === "ACTIVE") {
        data.approvedAt = employee.approvedAt || now;
        data.joinedAt = employee.joinedAt ?? now;
        data.leftAt = null;
        if (employee.status === "SUSPENDED") {
          data.leaveEndAt = now;
        } else if (employee.status === "TERMINATED") {
          data.leaveStartAt = null;
          data.leaveEndAt = null;
        }
      } else if (nextStatus === "SUSPENDED") {
        data.leaveStartAt = employee.leaveStartAt ?? now;
        data.leaveEndAt = null;
        data.leftAt = null;
      } else if (nextStatus === "TERMINATED") {
        data.leftAt = employee.leftAt ?? now;
      } else if (nextStatus === "REJECTED") {
        data.leftAt = employee.leftAt ?? now;
        data.leaveStartAt = employee.leaveStartAt ?? now;
        data.leaveEndAt = employee.leaveEndAt ?? now;
      }
    }

    if (isManufacturerOrg(employee.organization)) {
      const resolvedRoleId =
        nextRole === "WORKER"
          ? employee.roleId ?? (await resolveDefaultEmployeeRoleId(employee.orgId))
          : null;
      data.roleId = resolvedRoleId;
      data.payType = await resolveEmployeeStoredPayType({
        orgId: employee.orgId,
        membershipRole: nextRole,
        roleId: resolvedRoleId,
        payType: employee.payType,
      });
    } else {
      data.factoryId = null;
      data.roleId = null;
      data.payType = null;
      data.employeeNo = null;
    }

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data,
    });

    if (effectiveStatus !== "ACTIVE") {
      await closeActiveLineAssignments(updated.id, updated.leftAt ?? now);
    }

    return res.json(toMembershipResponseFromEmployee(updated));
  });

  orgMembershipRouter.post("/org-memberships/assign", async (req, res) => {
    if (!(await requireSystemAdmin(req, res))) return;

    const { orgId, email, role } = req.body ?? {};
    const orgIdNum = Number(orgId);
    const normalizedEmail = normalizeEmail(email);

    if (!Number.isFinite(orgIdNum)) {
      return res.status(400).json({ ok: false, error: "orgId is required" });
    }
    if (!isValidEmail(normalizedEmail)) {
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
    const existing = await prisma.employee.findUnique({
      where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
    });
    const record = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data: {
            orgRole: safeRole,
            status: "ACTIVE",
            approvedAt: existing.approvedAt ?? now,
            joinedAt: existing.joinedAt ?? now,
            leftAt: null,
          },
        })
      : await prisma.employee.create({
          data: {
            orgId: orgIdNum,
            email: normalizedEmail,
            orgRole: safeRole,
            status: "ACTIVE",
            requestedAt: now,
            approvedAt: now,
            joinedAt: now,
          },
        });

    return res.status(existing ? 200 : 201).json(toMembershipResponseFromEmployee(record));
  });

  return orgMembershipRouter;
};
