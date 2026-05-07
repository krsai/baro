import { prisma } from "../db";
import {
  normalizePayType,
  resolveEmployeeEffectivePayType,
  resolveOrgRoleLabel,
} from "../employees/employeeCompensation";
import {
  ensureArray,
  normalizeComparableText,
  resolveOptionalString,
  toPositiveIntOrNull,
} from "../utils/common";
import { createHttpError } from "../utils/http";
import {
  resolveWorkRecordProcessName,
  WORK_RECORD_WITH_REFS_INCLUDE,
} from "../work-records/workRecord.shared";

const toPayrollAmountOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPayrollAmount = (value: unknown, fallback = 0): number =>
  toPayrollAmountOrNull(value) ?? fallback;

const buildPayrollEmployeeKey = (workerId: unknown, fallbackName: unknown): string => {
  const normalizedWorkerId = toPositiveIntOrNull(workerId);
  if (normalizedWorkerId !== null) return `w-${normalizedWorkerId}`;
  const fallbackKey = normalizeComparableText(fallbackName);
  return `n-${fallbackKey || "unknown"}`;
};

const assertPayrollMonth = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw createHttpError(400, "month is required (format: YYYY-MM)");
  }
};

const getPayrollMonthRange = (month: string) => {
  const [yearText, monthText] = String(month || "").split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  return { start, endExclusive };
};

const isPayrollMonthClosed = (month: string, now = new Date()) => {
  const [yearText, monthText] = String(month || "").split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return false;
  if (monthNumber < 1 || monthNumber > 12) return false;
  const nextMonthStartUtc = new Date(Date.UTC(year, monthNumber, 1));
  return now.getTime() >= nextMonthStartUtc.getTime();
};

const resolvePayrollEmployeeName = (employee: any, fallback: unknown = null): string =>
  resolveOptionalString(
    employee?.name ?? fallback ?? employee?.membership?.email ?? null,
    null
  ) || "이름없음";

const resolvePayrollRoleName = (employee: any): string =>
  resolveOptionalString(employee?.role?.name, null) ??
  resolveOrgRoleLabel(employee?.membership?.role) ??
  "";

const isPayrollEmployeeRelevantForMonth = (
  employee: any,
  range: { start: Date; endExclusive: Date }
) => {
  const membershipStatus = String(employee?.membership?.status || "")
    .trim()
    .toUpperCase();
  if (membershipStatus === "PENDING" || membershipStatus === "REJECTED") {
    return false;
  }

  const effectiveStart =
    employee?.joinedAt ?? employee?.membership?.approvedAt ?? employee?.createdAt ?? null;
  const effectiveEnd = employee?.leftAt ?? null;

  if (effectiveStart) {
    const startedAt = new Date(effectiveStart);
    if (!Number.isNaN(startedAt.getTime()) && startedAt >= range.endExclusive) {
      return false;
    }
  }

  if (effectiveEnd) {
    const endedAt = new Date(effectiveEnd);
    if (!Number.isNaN(endedAt.getTime()) && endedAt < range.start) {
      return false;
    }
  }

  return true;
};

const normalizePayrollProcessSnapshot = (process: any) => {
  const totalCtSeconds = toPayrollAmount(process?.totalCtSeconds, 0);
  const totalEarnings = toPayrollAmount(process?.totalEarnings, 0);
  const providedWagePerSecond = toPayrollAmountOrNull(process?.wagePerSecond);

  return {
    processCode: resolveOptionalString(process?.processCode, "") || "",
    processName:
      resolveOptionalString(process?.processName, null) ??
      resolveOptionalString(process?.processCode, null) ??
      "-",
    totalQuantity: toPayrollAmount(process?.totalQuantity, 0),
    totalCtSeconds,
    wagePerSecond:
      providedWagePerSecond !== null
        ? providedWagePerSecond
        : totalCtSeconds > 0
          ? totalEarnings / totalCtSeconds
          : 0,
    totalEarnings,
  };
};

export const normalizePayrollSnapshotEmployee = (employee: any) => {
  const payType = normalizePayType(employee?.payType, "FIXED") ?? "FIXED";
  const workerName =
    resolveOptionalString(employee?.workerName, null) ??
    resolveOptionalString(employee?.name, null) ??
    "이름없음";
  const workerId = toPositiveIntOrNull(employee?.workerId);
  const roleName =
    resolveOptionalString(employee?.roleName, null) ??
    resolveOrgRoleLabel(employee?.orgRole) ??
    "";
  const processes = ensureArray(employee?.processes).map(normalizePayrollProcessSnapshot);
  const storedTotalEarnings = toPayrollAmountOrNull(employee?.totalEarnings);
  const bonus = toPayrollAmount(employee?.bonus, 0);
  const deduction = toPayrollAmount(employee?.deduction, 0);
  const fixedSalary =
    payType === "FIXED"
      ? toPayrollAmountOrNull(employee?.fixedSalary) ??
        (toPayrollAmountOrNull(employee?.finalEarnings) ?? storedTotalEarnings ?? 0) -
          bonus +
          deduction
      : 0;
  const productionEarnings =
    payType === "CT"
      ? toPayrollAmountOrNull(employee?.productionEarnings) ??
        toPayrollAmountOrNull(employee?.baseEarnings) ??
        0
      : 0;
  const ctAmount = payType === "CT" ? toPayrollAmount(employee?.ctAmount, 0) : 0;
  const baseEarnings =
    payType === "FIXED"
      ? fixedSalary
      : productionEarnings + ctAmount;
  const finalEarnings =
    toPayrollAmountOrNull(employee?.finalEarnings) ??
    storedTotalEarnings ??
    (baseEarnings + bonus - deduction);

  return {
    employeeKey:
      resolveOptionalString(employee?.employeeKey, null) ??
      buildPayrollEmployeeKey(workerId, workerName),
    workerId,
    workerName,
    orgRole: String(employee?.orgRole || "").trim().toUpperCase(),
    roleName,
    payType,
    bankName: resolveOptionalString(employee?.bankName, null),
    bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
    productionEarnings,
    ctAmount,
    baseEarnings,
    fixedSalary,
    bonus,
    deduction,
    finalEarnings,
    totalEarnings: finalEarnings,
    processes,
  };
};

export const listPayrollSnapshots = async (orgId: number) =>
  prisma.payrollSnapshot.findMany({
    where: { orgId },
    orderBy: { month: "desc" },
    select: { id: true, month: true, data: true, lockedAt: true, lockedBy: true, createdAt: true },
  });

const buildFixedSalaryFallbackIndex = (snapshotData: unknown) => {
  const byWorkerId = new Map<number, number>();
  const byEmployeeKey = new Map<string, number>();

  ensureArray(snapshotData)
    .map(normalizePayrollSnapshotEmployee)
    .forEach((employee) => {
      if (employee.payType !== "FIXED") return;
      const fixedSalary = toPayrollAmount(employee.fixedSalary, 0);
      if (fixedSalary <= 0) return;

      const workerId = toPositiveIntOrNull(employee.workerId);
      if (workerId !== null && !byWorkerId.has(workerId)) {
        byWorkerId.set(workerId, fixedSalary);
      }

      const employeeKey = String(employee.employeeKey || "").trim();
      if (employeeKey && !byEmployeeKey.has(employeeKey)) {
        byEmployeeKey.set(employeeKey, fixedSalary);
      }
    });

  return { byWorkerId, byEmployeeKey };
};

const resolveFixedSalaryWithFallback = ({
  fixedSalary,
  workerId,
  employeeKey,
  fallbackByWorkerId,
  fallbackByEmployeeKey,
}: {
  fixedSalary: unknown;
  workerId: unknown;
  employeeKey: string;
  fallbackByWorkerId: Map<number, number>;
  fallbackByEmployeeKey: Map<string, number>;
}) => {
  const direct = toPayrollAmount(fixedSalary, 0);
  if (direct > 0) return direct;

  const normalizedWorkerId = toPositiveIntOrNull(workerId);
  if (normalizedWorkerId !== null) {
    const workerFallback = toPayrollAmount(
      fallbackByWorkerId.get(normalizedWorkerId),
      0
    );
    if (workerFallback > 0) return workerFallback;
  }

  const keyFallback = toPayrollAmount(fallbackByEmployeeKey.get(employeeKey), 0);
  if (keyFallback > 0) return keyFallback;

  return 0;
};

export const getPayrollByMonth = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const monthClosed = isPayrollMonthClosed(month);

  const snapshot = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
  });
  if (snapshot) {
    return {
      locked: false,
      snapshotExists: true,
      monthClosed,
      lockedAt: snapshot.lockedAt,
      lockedBy: snapshot.lockedBy,
      month,
      employees: ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee),
    };
  }

  const previousSnapshot = await prisma.payrollSnapshot.findFirst({
    where: {
      orgId,
      month: { lt: month },
    },
    orderBy: { month: "desc" },
    select: { data: true },
  });
  const fixedSalaryFallback = buildFixedSalaryFallbackIndex(previousSnapshot?.data);

  const workLogs = await prisma.workLog.findMany({
    where: {
      orgId,
      workDate: { startsWith: month },
    },
    include: {
      workRecords: WORK_RECORD_WITH_REFS_INCLUDE,
    },
  });
  const payrollMonthRange = getPayrollMonthRange(month);
  const workerIds = Array.from(
    new Set(
      workLogs
        .flatMap((workLog) => workLog.workRecords)
        .map((record) => Number(record.workerId))
        .filter((workerId) => Number.isSafeInteger(workerId) && workerId > 0)
    )
  );
  const employeeRows = await prisma.employee.findMany({
    where: {
      orgId,
      ...(workerIds.length > 0
        ? {
            OR: [
              { membership: { status: { notIn: ["PENDING", "REJECTED"] } } },
              { id: { in: workerIds } },
            ],
          }
        : { membership: { status: { notIn: ["PENDING", "REJECTED"] } } }),
    },
    include: {
      role: true,
      membership: {
        select: {
          role: true,
          status: true,
          email: true,
          approvedAt: true,
        },
      },
    },
  });
  const employeesById = new Map(employeeRows.map((employee) => [employee.id, employee]));
  const payrollEmployees = employeeRows.filter((employee) =>
    isPayrollEmployeeRelevantForMonth(employee, payrollMonthRange)
  );

  const employeeMap = new Map<
    string,
    {
      employeeKey: string;
      workerId: number | null;
      workerName: string;
      orgRole: string;
      roleName: string;
      payType: "CT" | "FIXED";
      bankName: string | null;
      bankAccountNumber: string | null;
      productionEarnings: number;
      ctAmount: number;
      fixedSalary: number;
      processes: Map<
        string,
        {
          processCode: string;
          processName: string;
          totalQuantity: number;
          totalCtSeconds: number;
          totalEarnings: number;
        }
      >;
    }
  >();

  payrollEmployees.forEach((employee) => {
    const workerName = resolvePayrollEmployeeName(employee);
    const employeeKey = buildPayrollEmployeeKey(employee?.id, workerName);
    const payType = resolveEmployeeEffectivePayType(employee);
    const resolvedFixedSalary = resolveFixedSalaryWithFallback({
      fixedSalary: employee?.fixedSalary,
      workerId: employee?.id,
      employeeKey,
      fallbackByWorkerId: fixedSalaryFallback.byWorkerId,
      fallbackByEmployeeKey: fixedSalaryFallback.byEmployeeKey,
    });
    employeeMap.set(employeeKey, {
      employeeKey,
      workerId: employee?.id ?? null,
      workerName,
      orgRole: String(employee?.membership?.role || "").trim().toUpperCase(),
      roleName: resolvePayrollRoleName(employee),
      payType,
      bankName: resolveOptionalString(employee?.bankName, null),
      bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
      productionEarnings: 0,
      ctAmount: 0,
      fixedSalary: payType === "FIXED" ? resolvedFixedSalary : 0,
      processes: new Map(),
    });
  });

  for (const workLog of workLogs) {
    const wagePerSecond = Number(workLog.factoryWagePerSecond);
    const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;

    for (const record of workLog.workRecords) {
      const employee =
        record.workerId != null ? employeesById.get(Number(record.workerId)) ?? null : null;
      const workerName = resolvePayrollEmployeeName(employee, record.workerName);
      const key = buildPayrollEmployeeKey(record.workerId, workerName);
      const effectivePayType = employee
        ? resolveEmployeeEffectivePayType(employee)
        : "CT";
      const ctSeconds = Number(record.ctSeconds);
      const quantity = Number(record.quantity);
      const totalCtSeconds = ctSeconds > 0 && quantity > 0 ? ctSeconds * quantity : 0;
      const earnings =
        effectivePayType === "CT" && validWage && ctSeconds > 0 && quantity > 0
          ? ctSeconds * quantity * wagePerSecond
          : 0;

      if (!employeeMap.has(key)) {
        const employeeFixedSalary =
          effectivePayType === "FIXED"
            ? resolveFixedSalaryWithFallback({
                fixedSalary: employee?.fixedSalary,
                workerId: record.workerId ?? employee?.id,
                employeeKey: key,
                fallbackByWorkerId: fixedSalaryFallback.byWorkerId,
                fallbackByEmployeeKey: fixedSalaryFallback.byEmployeeKey,
              })
            : 0;
        employeeMap.set(key, {
          employeeKey: key,
          workerId: record.workerId ?? null,
          workerName,
          orgRole: String(employee?.membership?.role || "").trim().toUpperCase(),
          roleName: resolvePayrollRoleName(employee),
          payType: effectivePayType,
          bankName: resolveOptionalString(employee?.bankName, null),
          bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
          productionEarnings: 0,
          ctAmount: 0,
          fixedSalary: employeeFixedSalary,
          processes: new Map(),
        });
      }

      const emp = employeeMap.get(key)!;
      emp.productionEarnings += earnings;

      const processName = resolveWorkRecordProcessName(record) ?? "";
      const processKey = record.processCode || processName || "unknown";
      if (!emp.processes.has(processKey)) {
        emp.processes.set(processKey, {
          processCode: record.processCode || "",
          processName: processName || processKey,
          totalQuantity: 0,
          totalCtSeconds: 0,
          totalEarnings: 0,
        });
      }
      const proc = emp.processes.get(processKey)!;
      proc.totalQuantity += quantity;
      proc.totalCtSeconds += totalCtSeconds;
      proc.totalEarnings += earnings;
    }
  }

  const employees = Array.from(employeeMap.values())
    .map((emp) => {
      const resolvedBaseEarnings =
        emp.payType === "FIXED"
          ? toPayrollAmount(emp.fixedSalary, 0)
          : toPayrollAmount(emp.productionEarnings, 0) + toPayrollAmount(emp.ctAmount, 0);
      return {
        employeeKey: emp.employeeKey,
        workerId: emp.workerId,
        workerName: emp.workerName,
        orgRole: emp.orgRole,
        roleName: emp.roleName,
        payType: emp.payType,
        bankName: emp.bankName,
        bankAccountNumber: emp.bankAccountNumber,
        productionEarnings: emp.payType === "CT" ? toPayrollAmount(emp.productionEarnings, 0) : 0,
        ctAmount: emp.payType === "CT" ? toPayrollAmount(emp.ctAmount, 0) : 0,
        baseEarnings: resolvedBaseEarnings,
        fixedSalary: emp.payType === "FIXED" ? toPayrollAmount(emp.fixedSalary, 0) : 0,
        bonus: 0,
        deduction: 0,
        finalEarnings: resolvedBaseEarnings,
        totalEarnings: resolvedBaseEarnings,
        processes: Array.from(emp.processes.values()).map((process) => ({
          processCode: process.processCode,
          processName: process.processName,
          totalQuantity: process.totalQuantity,
          totalCtSeconds: process.totalCtSeconds,
          wagePerSecond:
            process.totalCtSeconds > 0
              ? process.totalEarnings / process.totalCtSeconds
              : 0,
          totalEarnings: process.totalEarnings,
        })),
      };
    })
    .sort((a, b) => b.finalEarnings - a.finalEarnings);

  return {
    locked: false,
    snapshotExists: false,
    monthClosed,
    month,
    employees,
  };
};

export const savePayrollSnapshot = async ({
  orgId,
  month: monthInput,
  savedBy,
  employees,
}: {
  orgId: number;
  month: string;
  savedBy: string;
  employees?: any;
}) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  if (isPayrollMonthClosed(month)) {
    throw createHttpError(409, "payroll month closed");
  }

  const normalizedInputEmployees = ensureArray(employees).map(normalizePayrollSnapshotEmployee);
  const snapshotEmployees =
    normalizedInputEmployees.length > 0
      ? normalizedInputEmployees
      : (await getPayrollByMonth(orgId, month)).employees.map(normalizePayrollSnapshotEmployee);
  const savedAt = new Date();
  const savedByText = String(savedBy || "unknown");

  return prisma.payrollSnapshot.upsert({
    where: { orgId_month: { orgId, month } },
    create: {
      orgId,
      month,
      data: snapshotEmployees,
      lockedAt: savedAt,
      lockedBy: savedByText,
    },
    update: {
      data: snapshotEmployees,
      lockedAt: savedAt,
      lockedBy: savedByText,
    },
  });
};

export const deletePayrollSnapshot = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  if (isPayrollMonthClosed(month)) {
    throw createHttpError(409, "payroll month closed");
  }

  const existing = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
    select: { id: true },
  });
  if (!existing) {
    throw createHttpError(404, "snapshot not found");
  }

  await prisma.payrollSnapshot.delete({
    where: { id: existing.id },
  });

  return { ok: true, month };
};
