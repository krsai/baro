import { type OrgUserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import {
  normalizePayType,
  resolveEmployeeEffectivePayType,
  resolveRoleDefaultPayType,
} from "./employeeCompensation";
import {
  generateNextEmployeeNo,
  normalizeEmployeeNo,
} from "./employeeNumber";
import { resolveOptionalString } from "../utils/common";

type EmployeeRoutesDeps = {
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

const toEmployeeResponse = (employee: any) => ({
  id: employee?.id ?? null,
  orgId: employee?.orgId ?? null,
  orgMembershipId: employee?.id ?? null,
  factoryId: employee?.factoryId ?? null,
  lineId: employee?.lineId ?? null,
  roleId: employee?.roleId ?? null,
  employeeNo: normalizeEmployeeNo(employee?.employeeNo) ?? null,
  roleCode: String(employee?.role?.code ?? "").trim(),
  roleName: String(employee?.role?.name ?? "").trim(),
  roleDefaultPayType: resolveRoleDefaultPayType(employee?.role),
  payType: resolveEmployeeEffectivePayType(employee),
  effectivePayType: resolveEmployeeEffectivePayType(employee),
  fixedSalary: employee?.fixedSalary ?? null,
  name: employee?.name ?? null,
  email: employee?.email ?? null,
  orgRole: employee?.orgRole ?? null,
  status: employee?.status ?? null,
  requestedAt: employee?.requestedAt ?? null,
  requestedName: employee?.requestedName ?? null,
  approvedAt: employee?.approvedAt ?? null,
  approvedBy: employee?.approvedBy ?? null,
  phone: employee?.phone ?? null,
  bankName: employee?.bankName ?? null,
  bankAccountNumber: employee?.bankAccountNumber ?? null,
  lineName: employee?.line?.name ?? null,
  position: employee?.position ?? null,
  joinedAt: employee?.joinedAt ?? null,
  leftAt: employee?.leftAt ?? null,
  leaveStartAt: employee?.leaveStartAt ?? null,
  leaveEndAt: employee?.leaveEndAt ?? null,
  createdAt: employee?.createdAt ?? null,
  updatedAt: employee?.updatedAt ?? null,
});

export const createEmployeeRouter = ({
  hasOrgFeatureAccess,
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

    const employee = await prisma.employee.findFirst({
      where: { email: requesterEmail, status: "ACTIVE" },
      orderBy: { id: "asc" },
    });

    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee record not found" });
    }

    return res.json({
      email: employee.email,
      name: employee.name ?? null,
      phone: (employee as any)?.phone ?? null,
      bankName: employee.bankName ?? null,
      bankAccountNumber: employee.bankAccountNumber ?? null,
      employeeId: employee.id ?? null,
    });
  });

  employeeRouter.patch("/employees/me", async (req, res) => {
    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }

    const employee = await prisma.employee.findFirst({
      where: { email: requesterEmail, status: "ACTIVE" },
      select: { id: true, email: true },
      orderBy: { id: "asc" },
    });

    if (!employee) {
      return res.status(404).json({ ok: false, error: "employee record not found" });
    }

    const { name, phone, bankName, bankAccountNumber } = req.body ?? {};
    const trim = (value: any) => (typeof value === "string" ? value.trim() || null : null);

    const updated = await (prisma.employee as any).update({
      where: { id: employee.id },
      data: {
        ...(name !== undefined ? { name: trim(name) } : {}),
        ...(phone !== undefined ? { phone: trim(phone) } : {}),
        ...(bankName !== undefined ? { bankName: trim(bankName) } : {}),
        ...(bankAccountNumber !== undefined ? { bankAccountNumber: trim(bankAccountNumber) } : {}),
      },
    });

    return res.json({
      email: employee.email,
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
    const systemOnly =
      String(req.query.systemOnly ?? "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.systemOnly ?? "")
        .trim()
        .toLowerCase() === "true";
    let systemUserEmails: string[] = [];
    if (systemOnly) {
      const requesterEmail = getRequesterEmail(req);
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
            .map((item) => String(item?.email || "").trim().toLowerCase())
            .filter(Boolean)
        )
      );
      if (systemUserEmails.length === 0) {
        return res.json([]);
      }
    }
    const factoryId = Number(req.query.factoryId);
    const membershipRole =
      typeof req.query.membershipRole === "string"
        ? req.query.membershipRole.toUpperCase()
        : null;
    const excludeMembershipRole =
      typeof req.query.excludeMembershipRole === "string"
        ? req.query.excludeMembershipRole.toUpperCase()
        : null;
    const orgRoleFilter =
      membershipRole && excludeMembershipRole
        ? membershipRole === excludeMembershipRole
          ? null
          : {
              AND: [
                { orgRole: membershipRole as any },
                { orgRole: { not: excludeMembershipRole as any } },
              ],
            }
        : membershipRole
          ? { orgRole: membershipRole as any }
          : excludeMembershipRole
            ? { orgRole: { not: excludeMembershipRole as any } }
            : null;
    if (membershipRole && excludeMembershipRole && membershipRole === excludeMembershipRole) {
      return res.json([]);
    }
    const employeeAccountWhere: any = orgRoleFilter
      ? {
          ...orgRoleFilter,
        }
      : {};
    if (systemOnly) {
      employeeAccountWhere.email = { in: systemUserEmails };
    }

    const where: any = {
      orgId: organization.id,
      ...(Number.isFinite(factoryId) ? { factoryId } : {}),
      ...(Object.keys(employeeAccountWhere).length > 0
        ? employeeAccountWhere
        : {}),
    };
    const employees = await prisma.employee.findMany({
      where,
      include: {
        role: true,
        line: true,
      },
      orderBy: { id: "asc" },
    });
    return res.json(employees.map(toEmployeeResponse));
  });

  employeeRouter.post("/employees", async (req, res) => {
    const {
      orgMembershipId,
      employeeId,
      factoryId,
      position,
      roleId,
      payType,
      fixedSalary,
      name,
      bankName,
      bankAccountNumber,
      employeeNo,
      joinedAt,
      leftAt,
    } = req.body ?? {};
    const employeeIdNum = Number(employeeId ?? orgMembershipId);

    if (!Number.isFinite(employeeIdNum)) {
      return res.status(400).json({ ok: false, error: "employeeId is required" });
    }

    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeIdNum },
      include: { organization: true },
    });

    if (!existingEmployee) {
      return res.status(404).json({ ok: false, error: "employee account not found" });
    }

    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }
    const [requesterSystemUser, requesterEmployee] = await Promise.all([
      prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      }),
      prisma.employee.findUnique({
        where: {
          orgId_email: {
            orgId: existingEmployee.orgId,
            email: requesterEmail,
          },
        },
        select: {
          status: true,
          orgRole: true,
        },
      }),
    ]);
    const hasEmployeeAccess =
      requesterSystemUser?.systemRole === "SYSTEM_ADMIN" ||
      (
        requesterEmployee?.status === "ACTIVE" &&
        await hasOrgFeatureAccess({
          orgType: existingEmployee.organization?.type,
          orgRole: requesterEmployee.orgRole,
          feature: "EMPLOYEE",
        })
      );
    if (!hasEmployeeAccess) {
      return res.status(403).json({ ok: false, error: "employee access required" });
    }

    if (existingEmployee.status === "PENDING" || existingEmployee.status === "REJECTED") {
      return res.status(400).json({ ok: false, error: "employee account is not editable yet" });
    }

    const hasFactoryIdInput = factoryId !== undefined;
    let factoryIdNum = null;
    if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
      const parsedFactoryId = Number(factoryId);
      if (!Number.isFinite(parsedFactoryId)) {
        return res.status(400).json({ ok: false, error: "invalid factoryId" });
      }
      factoryIdNum = parsedFactoryId;
    }

    if (!isManufacturerOrg(existingEmployee.organization) && factoryIdNum) {
      return res.status(400).json({ ok: false, error: "brand organizations have no factories" });
    }

    if (isManufacturerOrg(existingEmployee.organization) && factoryIdNum) {
      const factory = await prisma.factory.findFirst({
        where: { id: factoryIdNum, orgId: existingEmployee.orgId },
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
        where: { id: parsedRoleId, orgId: existingEmployee.orgId },
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
    const joinedAtParseResult = toOptionalDateOrNull(joinedAt);
    if (!joinedAtParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid joinedAt" });
    }
    const leftAtParseResult = toOptionalDateOrNull(leftAt);
    if (!leftAtParseResult.ok) {
      return res.status(400).json({ ok: false, error: "invalid leftAt" });
    }
    const shouldMarkMembershipTerminated =
      leftAtParseResult.hasInput && leftAtParseResult.value !== null;

    const resolvedFactoryId = isManufacturerOrg(existingEmployee.organization)
      ? hasFactoryIdInput
        ? factoryIdNum
        : existingEmployee?.factoryId ?? null
      : null;
    const resolvedRoleId =
      existingEmployee.orgRole === "WORKER"
        ? roleIdNum !== null && roleIdNum !== undefined
          ? roleIdNum
          : existingEmployee?.roleId ?? (await resolveDefaultEmployeeRoleId(existingEmployee.orgId))
        : null;
    const resolvedPayType = await resolveEmployeeStoredPayType({
      orgId: existingEmployee.orgId,
      membershipRole: existingEmployee.orgRole,
      roleId: resolvedRoleId,
      payType: payType !== undefined ? payTypeValue : existingEmployee?.payType,
    });
    const resolvedFixedSalary = hasFixedSalaryInput
      ? fixedSalaryParseResult.value
      : existingEmployee?.fixedSalary ?? null;

    if (
      isManufacturerOrg(existingEmployee.organization) &&
      existingEmployee.orgRole === "WORKER" &&
      (resolvedFactoryId === null || resolvedFactoryId === undefined)
    ) {
      return res.status(400).json({
        ok: false,
        error: "factoryId is required for worker employees",
      });
    }

    // employeeNo 처리: 명시적으로 전달된 값 우선, 없거나 비어 있으면 자동 채번
    let resolvedEmployeeNo: string | null | undefined = undefined; // undefined = 변경 없음
    if (employeeNo !== undefined) {
      const normalized = normalizeEmployeeNo(employeeNo);
      if (normalized) {
        // 중복 체크 (같은 orgId에서 다른 직원이 이미 사용 중인지)
        const conflict = await prisma.employee.findFirst({
          where: {
            orgId: existingEmployee.orgId,
            employeeNo: normalized,
            ...(existingEmployee ? { id: { not: existingEmployee.id } } : {}),
          },
        });
        if (conflict) {
          return res.status(409).json({ ok: false, error: "employeeNo already in use" });
        }
        resolvedEmployeeNo = normalized;
      } else {
        resolvedEmployeeNo = undefined;
      }
    }
    const shouldGenerateEmployeeNo =
      resolvedEmployeeNo === undefined &&
      isManufacturerOrg(existingEmployee.organization) &&
      !normalizeEmployeeNo(existingEmployee?.employeeNo);

    const data: any = {
      status: shouldMarkMembershipTerminated ? "TERMINATED" : existingEmployee.status,
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
      ...(resolvedEmployeeNo !== undefined ? { employeeNo: resolvedEmployeeNo } : {}),
      ...(joinedAtParseResult.hasInput ? { joinedAt: joinedAtParseResult.value } : {}),
      ...(leftAtParseResult.hasInput ? { leftAt: leftAtParseResult.value } : {}),
    };

    let employee;
    try {
      employee = await prisma.$transaction(async (tx) => {
        const transactionData = { ...data };
        if (shouldGenerateEmployeeNo) {
          transactionData.employeeNo = await generateNextEmployeeNo(
            tx,
            existingEmployee.orgId
          );
        }

        const upsertedEmployee = await tx.employee.update({
          where: { id: existingEmployee.id },
          data: transactionData,
        });

        if (leftAtParseResult.hasInput && leftAtParseResult.value !== null) {
          await tx.lineAssignment.updateMany({
            where: {
              employeeId: upsertedEmployee.id,
              OR: [
                { endAt: null },
                { endAt: { gt: leftAtParseResult.value } },
              ],
            },
            data: { endAt: leftAtParseResult.value },
          });
        }

        await tx.factory.updateMany({
          where: {
            orgId: existingEmployee.orgId,
            managerEmployeeId: upsertedEmployee.id,
            ...(upsertedEmployee.factoryId
              ? { id: { not: upsertedEmployee.factoryId } }
              : {}),
          },
          data: { managerEmployeeId: null },
        });

        return upsertedEmployee;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return res.status(409).json({ ok: false, error: "employeeNo already in use" });
      }
      throw error;
    }

    const activeAssignment = await prisma.lineAssignment.findFirst({
      where: {
        employeeId: employee.id,
        endAt: null,
        line: { orgId: existingEmployee.orgId },
      },
      include: {
        line: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
    });

    const syncedLineId = activeAssignment?.line?.id ?? null;
    const refreshedEmployee = await prisma.employee.update({
      where: { id: employee.id },
      data: { lineId: syncedLineId },
      include: {
        role: true,
        line: true,
      },
    });

    return res.json(toEmployeeResponse(refreshedEmployee));
  });

  return employeeRouter;
};
