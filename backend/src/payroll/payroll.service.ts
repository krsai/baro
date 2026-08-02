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
  isPayrollMonthReady,
  resolveCurrentPayrollMonthKey,
} from "../utils/payrollMonth";
import {
  resolveWorkRecordProcessCode,
  resolveWorkRecordProcessName,
  WORK_RECORD_WITH_REFS_INCLUDE,
} from "../work-records/workRecord.shared";
import { resolveFactoryManagementStartDateKey } from "../factories/factoryManagementStart";

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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
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

const resolvePayrollEmployeeName = (employee: any, fallback: unknown = null): string =>
  resolveOptionalString(
    employee?.name ?? fallback ?? employee?.email ?? null,
    null
  ) || "이름없음";

const resolvePayrollRoleName = (employee: any): string =>
  resolveOptionalString(employee?.role?.name, null) ??
  resolveOrgRoleLabel(employee?.orgRole) ??
  "";

const isPayrollEmployeeRelevantForMonth = (
  employee: any,
  range: { start: Date; endExclusive: Date }
) => {
  const membershipStatus = String(employee?.status || "")
    .trim()
    .toUpperCase();
  if (membershipStatus === "PENDING" || membershipStatus === "REJECTED") {
    return false;
  }

  const effectiveStart =
    employee?.joinedAt ?? employee?.approvedAt ?? employee?.createdAt ?? null;
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
  const styleProcessId = toPositiveIntOrNull(process?.styleProcessId);

  return {
    factoryId: toPositiveIntOrNull(process?.factoryId),
    factoryName: resolveOptionalString(process?.factoryName, null),
    lineId: toPositiveIntOrNull(process?.lineId),
    lineName: resolveOptionalString(process?.lineName, null),
    styleProcessId,
    processCode: resolveOptionalString(process?.processCode, "") || "",
    processName:
      resolveOptionalString(process?.processName, null) ??
      (styleProcessId === null ? "미계산 공정" : "-"),
    unresolved: Boolean(process?.unresolved),
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
  const productionEarnings =
    payType === "CT"
      ? toPayrollAmountOrNull(employee?.productionEarnings) ??
        toPayrollAmountOrNull(employee?.productionAllowance) ??
        0
      : 0;

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
    productionAllowance: productionEarnings,
    productionEarnings,
    totalEarnings: productionEarnings,
    processes,
  };
};

const toDateKey = (value: unknown): string => {
  if (!value) return "";
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const enumerateMonthWorkingDateKeys = (month: string, holidayDateKeys: Set<string>) => {
  const { start, endExclusive } = getPayrollMonthRange(month);
  const result: string[] = [];
  for (let cursor = new Date(start); cursor < endExclusive; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() !== 0 && !holidayDateKeys.has(key)) result.push(key);
  }
  return result;
};

const employeeExpectedOnDate = (employee: any, dateKey: string) => {
  const joined = toDateKey(employee?.joinedAt ?? employee?.approvedAt ?? employee?.createdAt);
  const left = toDateKey(employee?.leftAt);
  const leaveStart = toDateKey(employee?.leaveStartAt);
  const leaveEnd = toDateKey(employee?.leaveEndAt);
  if (joined && dateKey < joined) return false;
  if (left && dateKey > left) return false;
  if (leaveStart && dateKey >= leaveStart && (!leaveEnd || dateKey <= leaveEnd)) return false;
  return true;
};

export const getPayrollMonthReadiness = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const timeZone = process.env.BUSINESS_TIME_ZONE || "Asia/Seoul";
  const currentMonth = resolveCurrentPayrollMonthKey({ timeZone });
  const completedMonth = month < currentMonth;
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString().slice(0, 10);

  const [lines, holidays, attendanceEntries, workLogs, snapshot] = await Promise.all([
    prisma.line.findMany({
      where: { orgId, isActive: true },
      include: {
        factory: { select: { id: true, name: true, nameKo: true, nameVi: true, managementStartDate: true } },
        employees: { include: { role: true } },
      },
      orderBy: [{ factoryId: "asc" }, { name: "asc" }],
    }),
    prisma.organizationHoliday.findMany({
      where: { orgId, holidayDate: { gte: monthStart, lte: monthEnd } },
      select: { holidayDate: true },
    }),
    prisma.attendanceEntry.findMany({
      where: { orgId, workDate: { gte: monthStart, lte: monthEnd } },
      select: { workerId: true, factoryId: true, workDate: true, createdAt: true, updatedAt: true },
    }),
    prisma.workLog.findMany({
      where: { orgId, displayDate: { startsWith: month } },
      select: {
        displayDate: true,
        createdAt: true,
        updatedAt: true,
        coverageStartDate: true,
        coverageEndDate: true,
        factoryId: true,
        factoryWagePerSecond: true,
        workRecords: {
          select: {
            lineId: true, workerId: true, quantity: true, ctSeconds: true,
            createdAt: true, updatedAt: true,
            effectiveCoverageStartDate: true, effectiveCoverageEndDate: true,
            worker: { include: { role: true } },
          },
        },
      },
    }),
    prisma.payrollSnapshot.findUnique({
      where: { orgId_month: { orgId, month } },
      select: { id: true, isProvisional: true, lockedAt: true, data: true },
    }),
  ]);

  const holidayDateKeys = new Set(holidays.map((row) => String(row.holidayDate)));
  const monthWorkingDates = enumerateMonthWorkingDateKeys(month, holidayDateKeys);
  const attendanceKeys = new Set(
    attendanceEntries.map((row) => `${row.factoryId}:${row.workerId}:${row.workDate}`)
  );
  const employeeById = new Map<number, any>();
  for (const line of lines) for (const employee of line.employees) employeeById.set(employee.id, employee);
  for (const workLog of workLogs) {
    for (const record of workLog.workRecords) {
      if (record.worker) employeeById.set(record.worker.id, record.worker);
    }
  }

  const groups = lines
    .map((line) => {
      const employeesForLine = new Map(line.employees.map((employee) => [employee.id, employee]));
      for (const workLog of workLogs) {
        for (const record of workLog.workRecords) {
          if (record.lineId === line.id && record.worker) {
            employeesForLine.set(record.worker.id, record.worker);
          }
        }
      }
      const employees = Array.from(employeesForLine.values()).filter(
        (employee) =>
          isPayrollEmployeeRelevantForMonth(employee, getPayrollMonthRange(month)) &&
          resolveEmployeeEffectivePayType(employee) === "CT"
      );
      if (employees.length === 0) return null;
      const factoryStart = resolveFactoryManagementStartDateKey(line.factory);
      const expectedDates = monthWorkingDates.filter((dateKey) => dateKey >= factoryStart);
      const workDateKeys = new Set<string>();
      let productionAllowance = 0;
      for (const workLog of workLogs) {
        for (const record of workLog.workRecords) {
          if (record.lineId !== line.id) continue;
          const coverageStart = String(record.effectiveCoverageStartDate || workLog.coverageStartDate || workLog.displayDate || "");
          const coverageEnd = String(record.effectiveCoverageEndDate || workLog.coverageEndDate || workLog.displayDate || coverageStart);
          expectedDates.forEach((dateKey) => {
            if (dateKey >= coverageStart && dateKey <= coverageEnd) workDateKeys.add(dateKey);
          });
          const employee = record.workerId ? employeeById.get(record.workerId) : null;
          if (employee && resolveEmployeeEffectivePayType(employee) === "CT") {
            const quantity = Number(record.quantity);
            const ctSeconds = Number(record.ctSeconds);
            const rate = Number(workLog.factoryWagePerSecond);
            if (quantity > 0 && ctSeconds > 0 && rate > 0) productionAllowance += quantity * ctSeconds * rate;
          }
        }
      }
      const missingWorkDates = expectedDates.filter((dateKey) => !workDateKeys.has(dateKey));
      const missingAttendance = employees.flatMap((employee) =>
        expectedDates
          .filter((dateKey) => employeeExpectedOnDate(employee, dateKey))
          .filter((dateKey) => !attendanceKeys.has(`${line.factoryId}:${employee.id}:${dateKey}`))
          .map((dateKey) => ({ workerId: employee.id, workerName: resolvePayrollEmployeeName(employee), date: dateKey }))
      );
      return {
        factoryId: line.factoryId,
        factoryName: line.factory.name,
        factoryNameKo: line.factory.nameKo,
        factoryNameVi: line.factory.nameVi,
        lineId: line.id,
        lineName: line.name,
        employeeCount: employees.length,
        expectedWorkingDayCount: expectedDates.length,
        workRecordedDayCount: workDateKeys.size,
        attendanceRequiredCount: employees.reduce(
          (sum, employee) => sum + expectedDates.filter((dateKey) => employeeExpectedOnDate(employee, dateKey)).length, 0
        ),
        attendanceRecordedCount: employees.reduce(
          (sum, employee) => sum + expectedDates.filter(
            (dateKey) => employeeExpectedOnDate(employee, dateKey) && attendanceKeys.has(`${line.factoryId}:${employee.id}:${dateKey}`)
          ).length, 0
        ),
        missingWorkDates,
        missingAttendance,
        productionAllowance: toPayrollAmount(productionAllowance, 0),
        ready: expectedDates.length > 0 && missingWorkDates.length === 0,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const sourceChangedAfterCalculation = Boolean(snapshot && [
    ...attendanceEntries.flatMap((row) => [row.createdAt, row.updatedAt]),
    ...workLogs.flatMap((workLog) => [
      workLog.createdAt,
      workLog.updatedAt,
      ...workLog.workRecords.flatMap((record) => [record.createdAt, record.updatedAt]),
    ]),
  ].some((changedAt) => new Date(changedAt).getTime() > snapshot.lockedAt.getTime()));
  const groupsComplete = groups.length > 0 && groups.every((group) => group.ready);
  const currentProductionAllowance = groups.reduce(
    (sum, group) => sum + Number(group.productionAllowance || 0), 0
  );
  const snapshotProductionAllowance = snapshot
    ? ensureArray(snapshot.data)
        .map(normalizePayrollSnapshotEmployee)
        .reduce((sum, employee) => sum + Number(employee.productionAllowance || 0), 0)
    : 0;
  const calculatedBasisChanged = Boolean(
    snapshot && Math.abs(currentProductionAllowance - snapshotProductionAllowance) > 0.000001
  );
  const needsRecalculation = Boolean(
    snapshot &&
    !snapshot.isProvisional &&
    (sourceChangedAfterCalculation || calculatedBasisChanged || !groupsComplete)
  );

  return {
    month,
    completedMonth,
    snapshotExists: Boolean(snapshot && !snapshot.isProvisional),
    needsRecalculation,
    ready: completedMonth && groupsComplete,
    groups,
  };
};

export const listPayrollSnapshots = async (orgId: number) => {
  const snapshots = await prisma.payrollSnapshot.findMany({
    where: { orgId },
    orderBy: { month: "desc" },
    select: {
      id: true,
      month: true,
      data: true,
      lockedAt: true,
      lockedBy: true,
      isProvisional: true,
      createdAt: true,
    },
  });
  return snapshots.map((snapshot) => ({
    ...snapshot,
    data: ensureArray(snapshot.data)
      .map(normalizePayrollSnapshotEmployee)
      .filter((employee) => employee.payType === "CT"),
  }));
};

export const getPayrollByMonth = async (
  orgId: number,
  monthInput: string,
  { ignoreSnapshot = false }: { ignoreSnapshot?: boolean } = {}
) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const monthReady = isPayrollMonthReady(month, {
    timeZone: process.env.BUSINESS_TIME_ZONE || "Asia/Seoul",
  });

  const snapshot = ignoreSnapshot
    ? null
    : await prisma.payrollSnapshot.findUnique({
        where: { orgId_month: { orgId, month } },
      });
  if (snapshot) {
    return {
      locked: false,
      snapshotExists: true,
      monthReady,
      lockedAt: snapshot.lockedAt,
      lockedBy: snapshot.lockedBy,
      isProvisional: snapshot.isProvisional,
      month,
      employees: ensureArray(snapshot.data)
        .map(normalizePayrollSnapshotEmployee)
        .filter((employee) => employee.payType === "CT"),
    };
  }

  const [workLogRows, payrollLines] = await Promise.all([
    prisma.workLog.findMany({
      where: { orgId, displayDate: { startsWith: month } },
      include: {
        factory: { select: { id: true, name: true, managementStartDate: true } },
        workRecords: WORK_RECORD_WITH_REFS_INCLUDE,
      },
    }),
    prisma.line.findMany({ where: { orgId }, select: { id: true, name: true } }),
  ]);
  const payrollLinesById = new Map(payrollLines.map((line) => [line.id, line]));
  const workLogs = workLogRows.filter(
    (workLog) =>
      String(workLog.displayDate || "") >= resolveFactoryManagementStartDateKey(workLog.factory)
  );
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
              { status: { notIn: ["PENDING", "REJECTED"] } },
              { id: { in: workerIds } },
            ],
          }
        : { status: { notIn: ["PENDING", "REJECTED"] } }),
    },
    include: {
      role: true,
    },
  });
  const employeesById = new Map(employeeRows.map((employee) => [employee.id, employee]));
  const payrollEmployees = employeeRows.filter(
    (employee) =>
      isPayrollEmployeeRelevantForMonth(employee, payrollMonthRange) &&
      resolveEmployeeEffectivePayType(employee) === "CT"
  );

  const employeeMap = new Map<
    string,
    {
      employeeKey: string;
      workerId: number | null;
      workerName: string;
      orgRole: string;
      roleName: string;
      payType: "CT";
      bankName: string | null;
      bankAccountNumber: string | null;
      productionEarnings: number;
      processes: Map<
        string,
        {
          factoryId: number | null;
          factoryName: string | null;
          lineId: number | null;
          lineName: string | null;
          styleProcessId: number | null;
          processCode: string;
          processName: string;
          unresolved: boolean;
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
    employeeMap.set(employeeKey, {
      employeeKey,
      workerId: employee?.id ?? null,
      workerName,
      orgRole: String(employee?.orgRole || "").trim().toUpperCase(),
      roleName: resolvePayrollRoleName(employee),
      payType: "CT",
      bankName: resolveOptionalString(employee?.bankName, null),
      bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
      productionEarnings: 0,
      processes: new Map(),
    });
  });

  let payrollBreakdownMissingStyleProcessCount = 0;
  for (const workLog of workLogs) {
    const wagePerSecond = Number(workLog.factoryWagePerSecond);
    const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;

    for (const record of workLog.workRecords) {
      const employee =
        record.workerId != null ? employeesById.get(Number(record.workerId)) ?? null : null;
      const workerName = resolvePayrollEmployeeName(
        employee,
        record.worker?.name
      );
      const key = buildPayrollEmployeeKey(record.workerId, workerName);
      const effectivePayType = employee
        ? resolveEmployeeEffectivePayType(employee)
        : "CT";
      if (effectivePayType !== "CT") continue;
      const ctSeconds = Number(record.ctSeconds);
      const quantity = Number(record.quantity);
      const totalCtSeconds = ctSeconds > 0 && quantity > 0 ? ctSeconds * quantity : 0;
      const earnings =
        effectivePayType === "CT" && validWage && ctSeconds > 0 && quantity > 0
          ? ctSeconds * quantity * wagePerSecond
          : 0;

      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employeeKey: key,
          workerId: record.workerId ?? null,
          workerName,
          orgRole: String(employee?.orgRole || "").trim().toUpperCase(),
          roleName: resolvePayrollRoleName(employee),
          payType: "CT",
          bankName: resolveOptionalString(employee?.bankName, null),
          bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
          productionEarnings: 0,
          processes: new Map(),
        });
      }

      const emp = employeeMap.get(key)!;
      emp.productionEarnings += earnings;

      const styleProcessId = toPositiveIntOrNull(
        record?.styleProcess?.id ?? record?.styleProcessId
      );
      const hasStyleProcess = styleProcessId !== null;
      const processName = hasStyleProcess ? resolveWorkRecordProcessName(record) ?? "" : "";
      const processCode = hasStyleProcess ? resolveWorkRecordProcessCode(record) ?? "" : "";
      const processKey = hasStyleProcess
        ? `factory:${workLog.factoryId ?? "none"}:line:${record.lineId ?? "none"}:style-process:${styleProcessId}`
        : `factory:${workLog.factoryId ?? "none"}:line:${record.lineId ?? "none"}:missing-style-process`;
      if (!hasStyleProcess) {
        payrollBreakdownMissingStyleProcessCount += 1;
      }
      if (!emp.processes.has(processKey)) {
        emp.processes.set(processKey, {
          factoryId: workLog.factoryId ?? null,
          factoryName: resolveOptionalString(workLog.factory?.name, null),
          lineId: record.lineId ?? null,
          lineName: resolveOptionalString(
            record.lineId ? payrollLinesById.get(record.lineId)?.name : null,
            null
          ),
          styleProcessId,
          processCode,
          processName: hasStyleProcess
            ? processName || `StyleProcess#${styleProcessId}`
            : "미계산 공정",
          unresolved: !hasStyleProcess,
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
  if (payrollBreakdownMissingStyleProcessCount > 0) {
    console.warn(
      `[payroll] orgId=${orgId} month=${month} grouped ${payrollBreakdownMissingStyleProcessCount} work records without WorkRecord.styleProcessId into unresolved payroll breakdown`
    );
  }

  const employees = Array.from(employeeMap.values())
    .map((emp) => {
      const productionAllowance = toPayrollAmount(emp.productionEarnings, 0);
      return {
        employeeKey: emp.employeeKey,
        workerId: emp.workerId,
        workerName: emp.workerName,
        orgRole: emp.orgRole,
        roleName: emp.roleName,
        payType: emp.payType,
        bankName: emp.bankName,
        bankAccountNumber: emp.bankAccountNumber,
        productionAllowance,
        productionEarnings: productionAllowance,
        totalEarnings: productionAllowance,
        processes: Array.from(emp.processes.values()).map((process) => ({
          factoryId: process.factoryId,
          factoryName: process.factoryName,
          lineId: process.lineId,
          lineName: process.lineName,
          styleProcessId: process.styleProcessId,
          processCode: process.processCode,
          processName: process.processName,
          unresolved: process.unresolved,
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
    .sort((a, b) => b.productionAllowance - a.productionAllowance);

  return {
    locked: false,
    snapshotExists: false,
    isProvisional: !monthReady,
    monthReady,
    month,
    employees,
  };
};

export const savePayrollSnapshot = async ({
  orgId,
  month: monthInput,
  savedBy,
  employees: _employees,
}: {
  orgId: number;
  month: string;
  savedBy: string;
  employees?: any;
}) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const timeZone = process.env.BUSINESS_TIME_ZONE || "Asia/Seoul";
  const currentMonth = resolveCurrentPayrollMonthKey({ timeZone });
  if (month >= currentMonth) {
    throw createHttpError(409, "production allowance can only be calculated through the previous month");
  }
  const monthReady = isPayrollMonthReady(month, { timeZone });
  const readiness = await getPayrollMonthReadiness(orgId, month);
  if (!readiness.ready) {
    throw createHttpError(409, "monthly work records are incomplete");
  }
  const unreviewedCtPlans = monthReady ? await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      ctReviewRequired: true,
      ctReviewedAt: null,
      workRecords: {
        some: {
          workLog: {
            displayDate: { startsWith: month },
          },
        },
      },
    },
    select: { externalId: true },
    take: 20,
  }) : [];
  if (unreviewedCtPlans.length > 0) {
    throw createHttpError(
      409,
      `CT review required before payroll lock: ${unreviewedCtPlans
        .map((plan) => plan.externalId)
        .join(", ")}`
    );
  }

  void _employees;
  const calculated = await getPayrollByMonth(orgId, month, { ignoreSnapshot: true });
  const snapshotEmployees = calculated.employees
    .map(normalizePayrollSnapshotEmployee)
    .filter((employee) => employee.payType === "CT");
  const savedAt = new Date();
  const savedByText = String(savedBy || "unknown");

  const snapshot = await prisma.payrollSnapshot.upsert({
    where: { orgId_month: { orgId, month } },
    create: {
      orgId,
      month,
      data: snapshotEmployees,
      lockedAt: savedAt,
      lockedBy: savedByText,
      isProvisional: !monthReady,
    },
    update: {
      data: snapshotEmployees,
      lockedAt: savedAt,
      lockedBy: savedByText,
      isProvisional: !monthReady,
    },
  });
  return snapshot;
};

export const deletePayrollSnapshot = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);

  const existing = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
    select: { id: true, isProvisional: true },
  });
  if (!existing) {
    throw createHttpError(404, "snapshot not found");
  }

  await prisma.payrollSnapshot.delete({
    where: { id: existing.id },
  });

  return { ok: true, month };
};

export const unlockPayrollSnapshot = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);

  const existing = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
    select: { id: true },
  });
  if (!existing) {
    throw createHttpError(404, "snapshot not found");
  }

  await prisma.payrollSnapshot.update({
    where: { id: existing.id },
    data: { isProvisional: true },
  });
  return { ok: true, month };
};
