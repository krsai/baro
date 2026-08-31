import { prisma } from "../db";
import {
  EMPLOYEE_PAY_TYPE,
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
import { evaluateSalaryFormula } from "../employees/salaryFormula";
import { resolveSalaryAttendanceParameters } from "../employees/salaryAttendanceParameters";

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

const resolveFactoryProductionAllowanceRate = (factory: any): number =>
  Number(ensureArray(factory?.productionAllowanceRates)[0]?.wagePerSecond ?? factory?.wagePerSecond);

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
  const payType =
    normalizePayType(employee?.payType, EMPLOYEE_PAY_TYPE.GENERAL) ??
    EMPLOYEE_PAY_TYPE.GENERAL;
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
    payType === EMPLOYEE_PAY_TYPE.OUTPUT
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
    factoryId: toPositiveIntOrNull(employee?.factoryId),
    gradeId: toPositiveIntOrNull(employee?.gradeId),
    currencyCode: resolveOptionalString(employee?.currencyCode, "VND") || "VND",
    salarySystemVersionId: toPositiveIntOrNull(employee?.salarySystemVersionId),
    salarySystemVersionNumber: toPositiveIntOrNull(employee?.salarySystemVersionNumber),
    parameters: employee?.parameters && typeof employee.parameters === "object" ? employee.parameters : {},
    salaryItems: ensureArray(employee?.salaryItems).map((item) => ({
      code: String(item?.code || ""),
      name: resolveOptionalString(item?.name, null) || String(item?.code || "-"),
      nameKo: resolveOptionalString(item?.nameKo, null),
      nameEn: resolveOptionalString(item?.nameEn, null),
      nameVi: resolveOptionalString(item?.nameVi, null),
      category: String(item?.category || "ALLOWANCE").toUpperCase(),
      amount: toPayrollAmount(item?.amount, 0),
      formula: ensureArray(item?.formula).map(String),
    })),
    grossSalary: toPayrollAmount(employee?.grossSalary ?? employee?.totalSalary, productionEarnings),
    deductions: toPayrollAmount(employee?.deductions, 0),
    netSalary: toPayrollAmount(employee?.netSalary ?? employee?.grossSalary ?? employee?.totalSalary, productionEarnings),
    calculationSignature: resolveOptionalString(employee?.calculationSignature, null),
    productionAllowance: productionEarnings,
    productionEarnings,
    totalEarnings: toPayrollAmount(employee?.totalEarnings ?? employee?.grossSalary, productionEarnings),
    rateOverridden: Boolean(employee?.rateOverridden),
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
        factory: {
          select: {
            id: true, name: true, nameKo: true, nameVi: true, managementStartDate: true, wagePerSecond: true,
            productionAllowanceRates: {
              where: { effectiveMonth: { lte: month } }, orderBy: { effectiveMonth: "desc" }, take: 1,
              select: { wagePerSecond: true },
            },
          },
        },
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
        factory: {
          select: {
            wagePerSecond: true,
            productionAllowanceRates: {
              where: { effectiveMonth: { lte: month } }, orderBy: { effectiveMonth: "desc" }, take: 1,
              select: { wagePerSecond: true },
            },
          },
        },
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
          resolveEmployeeEffectivePayType(employee) === EMPLOYEE_PAY_TYPE.OUTPUT
      );
      if (employees.length === 0) return null;
      const factoryStart = resolveFactoryManagementStartDateKey(line.factory);
      const expectedDates = monthWorkingDates.filter((dateKey) => dateKey >= factoryStart);
      const workDateKeys = new Set<string>();
      let productionAllowance = 0;
      let invalidCalculationBasisCount = 0;
      for (const workLog of workLogs) {
        for (const record of workLog.workRecords) {
          if (record.lineId !== line.id) continue;
          const coverageStart = String(record.effectiveCoverageStartDate || workLog.coverageStartDate || workLog.displayDate || "");
          const coverageEnd = String(record.effectiveCoverageEndDate || workLog.coverageEndDate || workLog.displayDate || coverageStart);
          expectedDates.forEach((dateKey) => {
            if (dateKey >= coverageStart && dateKey <= coverageEnd) workDateKeys.add(dateKey);
          });
          const employee = record.workerId ? employeeById.get(record.workerId) : null;
          if (
            employee &&
            resolveEmployeeEffectivePayType(employee) === EMPLOYEE_PAY_TYPE.OUTPUT
          ) {
            const quantity = Number(record.quantity);
            const ctSeconds = Number(record.ctSeconds);
            const rate = resolveFactoryProductionAllowanceRate(workLog.factory);
            if (quantity > 0 && ctSeconds > 0 && rate > 0) {
              productionAllowance += quantity * ctSeconds * rate;
            } else {
              invalidCalculationBasisCount += 1;
            }
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
        configuredWagePerSecond: resolveFactoryProductionAllowanceRate(line.factory),
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
        invalidCalculationBasisCount,
        productionAllowance: toPayrollAmount(productionAllowance, 0),
        ready:
          expectedDates.length > 0 &&
          missingWorkDates.length === 0 &&
          invalidCalculationBasisCount === 0,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const groupsComplete = groups.length > 0 && groups.every((group) => group.ready);
  const snapshotEmployees = snapshot
    ? ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee)
    : [];
  const currentCalculatedEmployees = snapshot
    ? (await getPayrollByMonth(orgId, month, { ignoreSnapshot: true })).employees
    : [];
  const currentCalculatedByWorkerId = new Map(
    currentCalculatedEmployees.map((employee) => [employee.workerId, employee])
  );
  const groupTotal = (employee: any, factoryId: number, lineId: number) =>
    ensureArray(employee?.processes)
      .filter((process) =>
        Number(process?.factoryId) === factoryId && Number(process?.lineId) === lineId
      )
      .reduce((sum, process) => sum + toPayrollAmount(process?.totalEarnings, 0), 0);
  const snapshotByWorkerId = new Map(
    snapshotEmployees.map((employee) => [employee.workerId, employee])
  );
  const currentSignatureByWorkerId = new Map(
    currentCalculatedEmployees.map((employee) => [employee.workerId, employee.calculationSignature || null])
  );
  const salaryCalculationChanged = Boolean(snapshot && (
    snapshotEmployees.length !== currentCalculatedEmployees.length ||
    snapshotEmployees.some((employee) => currentSignatureByWorkerId.get(employee.workerId) !== (employee.calculationSignature || null))
  ));
  const groupsWithRecalculation = groups.map((group) => {
    const sourceChangedAfterCalculation = Boolean(snapshot && workLogs.some((workLog) => {
      const records = workLog.workRecords.filter((record) => record.lineId === group.lineId);
      if (records.length === 0) return false;
      return [
        workLog.createdAt,
        workLog.updatedAt,
        ...records.flatMap((record) => [record.createdAt, record.updatedAt]),
      ].some((changedAt) => new Date(changedAt).getTime() > snapshot.lockedAt.getTime());
    }));
    const snapshotTotal = snapshotEmployees.reduce(
      (sum, employee) => sum + groupTotal(employee, group.factoryId, group.lineId),
      0
    );
    const workerIds = new Set([
      ...snapshotEmployees.map((employee) => employee.workerId),
      ...currentCalculatedEmployees.map((employee) => employee.workerId),
    ]);
    const expectedTotal = Array.from(workerIds).reduce<number>((sum, workerId) => {
      const stored = snapshotByWorkerId.get(workerId);
      const current = currentCalculatedByWorkerId.get(workerId);
      const source = stored?.rateOverridden ? stored : current;
      return sum + groupTotal(source, group.factoryId, group.lineId);
    }, 0);
    const calculatedBasisChanged = Boolean(
      snapshot && Math.abs(expectedTotal - snapshotTotal) > 0.000001
    );
    const configuredRateChanged = Boolean(snapshot && snapshotEmployees.some((employee) =>
      !employee.rateOverridden && ensureArray(employee.processes).some((process) =>
        Number(process?.factoryId) === group.factoryId &&
        Number(process?.lineId) === group.lineId &&
        Math.abs(
          toPayrollAmount(process?.wagePerSecond, 0) -
          toPayrollAmount(group.configuredWagePerSecond, 0)
        ) > 0.000001
      )
    ));
    return {
      ...group,
      needsRecalculation: Boolean(
        snapshot && snapshot.isProvisional &&
        (salaryCalculationChanged || sourceChangedAfterCalculation || configuredRateChanged || calculatedBasisChanged || !group.ready)
      ),
    };
  });
  const needsRecalculation = salaryCalculationChanged || groupsWithRecalculation.some((group) => group.needsRecalculation);

  return {
    month,
    completedMonth,
    snapshotExists: Boolean(snapshot && !snapshot.isProvisional),
    needsRecalculation,
    ready: completedMonth && groupsComplete,
    groups: groupsWithRecalculation,
  };
};

const buildIntegratedPayrollEmployees = async (
  orgId: number,
  month: string,
  productionEmployeesInput: any[]
) => {
  const range = getPayrollMonthRange(month);
  const monthEndDate = new Date(range.endExclusive.getTime() - 1);
  const monthNumber = Number(month.slice(5, 7));
  const monthStartKey = `${month}-01`;
  const monthEndKey = monthEndDate.toISOString().slice(0, 10);
  const [employees, attendance, holidays, factories] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId, status: { notIn: ["PENDING", "REJECTED"] } },
      include: { role: true },
    }),
    prisma.attendanceEntry.findMany({
      where: { orgId, workDate: { gte: monthStartKey, lte: monthEndKey } },
      orderBy: { workDate: "asc" },
    }),
    prisma.organizationHoliday.findMany({
      where: { orgId, holidayDate: { gte: monthStartKey, lte: monthEndKey } },
      select: { holidayDate: true },
    }),
    prisma.factory.findMany({
      where: { orgId },
      include: {
        salaryCurrency: { select: { code: true } },
        organization: { select: { salaryCurrency: { select: { code: true } } } },
        salarySystemVersions: {
          where: { effectiveMonth: { lte: month } },
          orderBy: [{ effectiveMonth: "desc" }, { versionNumber: "desc" }],
        },
        salaryItems: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { rates: true } },
      },
    }),
  ]);
  const holidayDateKeys = new Set(holidays.map((row) => String(row.holidayDate)));
  const attendanceByWorker = new Map<number, any[]>();
  for (const row of attendance) {
    const rows = attendanceByWorker.get(row.workerId) || [];
    rows.push(row);
    attendanceByWorker.set(row.workerId, rows);
  }
  const productionByWorkerId = new Map(
    productionEmployeesInput.map((employee) => [Number(employee?.workerId), normalizePayrollSnapshotEmployee(employee)])
  );
  const factoryById = new Map(factories.map((factory) => [factory.id, factory]));

  return employees
    .filter((employee) => isPayrollEmployeeRelevantForMonth(employee, range))
    .map((employee) => {
      const payType = resolveEmployeeEffectivePayType(employee);
      const factory = employee.factoryId ? factoryById.get(employee.factoryId) : null;
      if (!factory) {
        throw createHttpError(409, `employee ${employee.id} has no payroll factory`);
      }
      const version = factory?.salarySystemVersions?.[0] || null;
      if (!version) {
        throw createHttpError(409, `factory ${factory.id} has no salary system version for ${month}`);
      }
      const versionSnapshot = version?.snapshot && typeof version.snapshot === "object" && !Array.isArray(version.snapshot)
        ? version.snapshot as any
        : null;
      const items = versionSnapshot && Array.isArray(versionSnapshot.items)
        ? versionSnapshot.items
        : (factory?.salaryItems || []).map((item: any) => ({ ...item, id: item.code }));
      const rates = versionSnapshot && Array.isArray(versionSnapshot.rates)
        ? versionSnapshot.rates
        : (factory?.salaryItems || []).flatMap((item: any) => item.rates.map((rate: any) => ({ ...rate, salaryItemCode: item.code })));
      const currencyCode = resolveOptionalString(versionSnapshot?.currencyCode, null)
        || factory?.salaryCurrency?.code
        || factory?.organization?.salaryCurrency?.code
        || "VND";
      const workerAttendance = attendanceByWorker.get(employee.id) || [];
      const attendanceParameters = resolveSalaryAttendanceParameters({ month, payType, holidayDateKeys, attendanceEntries: workerAttendance });
      let regularSeconds = 0;
      let overtimeSeconds = 0;
      let holidaySeconds = 0;
      for (const entry of workerAttendance) {
        const seconds = Math.max(0, Number(entry.workedSeconds) || 0);
        const dateKey = String(entry.workDate || "");
        const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
        const isHoliday = holidayDateKeys.has(dateKey) || (payType === EMPLOYEE_PAY_TYPE.OUTPUT ? day === 0 : day === 0 || day === 6);
        if (isHoliday) holidaySeconds += seconds;
        else {
          regularSeconds += Math.min(seconds, 8 * 60 * 60);
          overtimeSeconds += Math.max(0, seconds - 8 * 60 * 60);
        }
      }
      const joinedAt = employee.joinedAt ?? employee.approvedAt ?? employee.createdAt;
      const tenureYears = joinedAt
        ? Math.max(0, (monthEndDate.getTime() - new Date(joinedAt).getTime()) / (365.2425 * 24 * 60 * 60 * 1000))
        : 0;
      const production = productionByWorkerId.get(employee.id);
      const productionAllowance = payType === EMPLOYEE_PAY_TYPE.OUTPUT
        ? toPayrollAmount(production?.productionAllowance, 0)
        : 0;
      const parameters: Record<string, number> = {
        GRADE_RATE: 0,
        TENURE_YEARS: tenureYears,
        ...attendanceParameters,
        WORK_HOURS: regularSeconds / 3600,
        OVERTIME_HOURS: overtimeSeconds / 3600,
        HOLIDAY_HOURS: holidaySeconds / 3600,
        PRODUCTION_ALLOWANCE: productionAllowance,
      };
      const applicableItems = ensureArray(items).filter((item) => {
        const payTypes = ensureArray(item?.payTypes).map((value) => String(value).toUpperCase());
        const paymentMonths = ensureArray(item?.paymentMonths).map(Number);
        return payTypes.includes(payType) && (paymentMonths.length === 0 || paymentMonths.includes(monthNumber));
      });
      const salaryItems = applicableItems.map((item) => {
        const code = String(item?.code || item?.id || "");
        const rate = ensureArray(rates).find((row) =>
          String(row?.salaryItemCode || "") === code &&
          String(row?.payType || "").toUpperCase() === payType &&
          Number(row?.gradeId) === employee.gradeId
        );
        if (String(item?.category || "").toUpperCase() !== "INCENTIVE" && !rate) {
          throw createHttpError(409, `salary rate is missing for employee ${employee.id}, item ${code}`);
        }
        const itemParameters = { ...parameters, GRADE_RATE: toPayrollAmount(rate?.amount, 0) };
        const formula = ensureArray(item?.formula).map(String);
        let amount = Number(evaluateSalaryFormula(formula, itemParameters) ?? 0);
        const capValue = toPayrollAmountOrNull(item?.capValue);
        if (capValue !== null) amount = Math.min(amount, capValue);
        amount = Math.max(0, Math.round(amount));
        return {
          code,
          name: resolveOptionalString(item?.name, null) || code,
          nameKo: resolveOptionalString(item?.nameKo, null),
          nameEn: resolveOptionalString(item?.nameEn, null),
          nameVi: resolveOptionalString(item?.nameVi, null),
          category: String(item?.category || "ALLOWANCE").toUpperCase(),
          formula,
          amount,
        };
      });
      const grossSalary = salaryItems.reduce((sum, item) => sum + item.amount, 0);
      const calculationSignature = JSON.stringify({
        workerId: employee.id,
        factoryId: employee.factoryId,
        gradeId: employee.gradeId,
        payType,
        versionId: version?.id || null,
        items: salaryItems.map((item) => [item.code, item.amount]),
        parameters,
      });
      return normalizePayrollSnapshotEmployee({
        ...(production || {}),
        employeeKey: buildPayrollEmployeeKey(employee.id, employee.name),
        workerId: employee.id,
        workerName: resolvePayrollEmployeeName(employee),
        orgRole: employee.orgRole,
        roleName: resolvePayrollRoleName(employee),
        payType,
        bankName: employee.bankName,
        bankAccountNumber: employee.bankAccountNumber,
        factoryId: employee.factoryId,
        gradeId: employee.gradeId,
        currencyCode,
        salarySystemVersionId: version?.id || null,
        salarySystemVersionNumber: version?.versionNumber || null,
        parameters,
        salaryItems,
        productionAllowance,
        productionEarnings: productionAllowance,
        grossSalary,
        deductions: 0,
        netSalary: grossSalary,
        totalEarnings: grossSalary,
        calculationSignature,
        processes: production?.processes || [],
      });
    })
    .sort((left, right) => left.workerName.localeCompare(right.workerName));
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
    data: ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee),
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
      employees: ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee),
    };
  }

  const [workLogRows, payrollLines] = await Promise.all([
    prisma.workLog.findMany({
      where: { orgId, displayDate: { startsWith: month } },
      include: {
        factory: {
          select: {
            id: true, name: true, managementStartDate: true, wagePerSecond: true,
            productionAllowanceRates: {
              where: { effectiveMonth: { lte: month } }, orderBy: { effectiveMonth: "desc" }, take: 1,
              select: { wagePerSecond: true },
            },
          },
        },
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
      resolveEmployeeEffectivePayType(employee) === EMPLOYEE_PAY_TYPE.OUTPUT
  );

  const employeeMap = new Map<
    string,
    {
      employeeKey: string;
      workerId: number | null;
      workerName: string;
      orgRole: string;
      roleName: string;
      payType: "OUTPUT";
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
      payType: EMPLOYEE_PAY_TYPE.OUTPUT,
      bankName: resolveOptionalString(employee?.bankName, null),
      bankAccountNumber: resolveOptionalString(employee?.bankAccountNumber, null),
      productionEarnings: 0,
      processes: new Map(),
    });
  });

  let payrollBreakdownMissingStyleProcessCount = 0;
  for (const workLog of workLogs) {
    const wagePerSecond = resolveFactoryProductionAllowanceRate(workLog.factory);
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
        : EMPLOYEE_PAY_TYPE.OUTPUT;
      if (effectivePayType !== EMPLOYEE_PAY_TYPE.OUTPUT) continue;
      const ctSeconds = Number(record.ctSeconds);
      const quantity = Number(record.quantity);
      const totalCtSeconds = ctSeconds > 0 && quantity > 0 ? ctSeconds * quantity : 0;
      const earnings =
        effectivePayType === EMPLOYEE_PAY_TYPE.OUTPUT &&
        validWage &&
        ctSeconds > 0 &&
        quantity > 0
          ? ctSeconds * quantity * wagePerSecond
          : 0;

      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employeeKey: key,
          workerId: record.workerId ?? null,
          workerName,
          orgRole: String(employee?.orgRole || "").trim().toUpperCase(),
          roleName: resolvePayrollRoleName(employee),
          payType: EMPLOYEE_PAY_TYPE.OUTPUT,
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

  const integratedEmployees = await buildIntegratedPayrollEmployees(orgId, month, employees);
  return {
    locked: false,
    snapshotExists: false,
    isProvisional: !monthReady,
    monthReady,
    month,
    employees: integratedEmployees,
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
  const snapshotEmployees = calculated.employees.map(normalizePayrollSnapshotEmployee);
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
      isProvisional: true,
    },
    update: {
      data: snapshotEmployees,
      lockedAt: savedAt,
      lockedBy: savedByText,
      isProvisional: true,
    },
  });
  return snapshot;
};

const recalculatePayrollEmployeeTotals = (employee: any) => {
  const processes = ensureArray(employee?.processes).map(normalizePayrollProcessSnapshot);
  const productionAllowance = processes.reduce(
    (sum, process) => sum + toPayrollAmount(process.totalEarnings, 0),
    0
  );
  return {
    ...normalizePayrollSnapshotEmployee(employee),
    processes,
    productionAllowance,
    productionEarnings: productionAllowance,
    totalEarnings: productionAllowance,
  };
};

export const recalculatePayrollSnapshotLine = async ({
  orgId,
  month: monthInput,
  factoryId,
  lineId,
  updatedBy,
}: {
  orgId: number;
  month: string;
  factoryId: number;
  lineId: number;
  updatedBy: string;
}) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const normalizedFactoryId = toPositiveIntOrNull(factoryId);
  const normalizedLineId = toPositiveIntOrNull(lineId);
  if (normalizedFactoryId === null || normalizedLineId === null) {
    throw createHttpError(400, "valid factoryId and lineId are required");
  }

  const snapshot = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
  });
  if (!snapshot) throw createHttpError(404, "snapshot not found");
  if (!snapshot.isProvisional) {
    throw createHttpError(409, "unlock production allowance before recalculation");
  }

  const readiness = await getPayrollMonthReadiness(orgId, month);
  const targetGroup = readiness.groups.find(
    (group) => group.factoryId === normalizedFactoryId && group.lineId === normalizedLineId
  );
  if (!targetGroup) throw createHttpError(404, "payroll line not found");
  if (!targetGroup.ready) throw createHttpError(409, "line work records are incomplete");

  const calculated = await getPayrollByMonth(orgId, month, { ignoreSnapshot: true });
  const storedEmployees = ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee);
  const freshEmployees = calculated.employees.map(normalizePayrollSnapshotEmployee);
  const storedByKey = new Map(storedEmployees.map((employee) => [employee.employeeKey, employee]));
  const freshByKey = new Map(freshEmployees.map((employee) => [employee.employeeKey, employee]));
  const employeeKeys = new Set([...storedByKey.keys(), ...freshByKey.keys()]);
  const isTargetProcess = (process: any) =>
    Number(process?.factoryId) === normalizedFactoryId &&
    Number(process?.lineId) === normalizedLineId;

  const mergedEmployees = Array.from(employeeKeys).map((employeeKey) => {
    const stored = storedByKey.get(employeeKey);
    const fresh = freshByKey.get(employeeKey);
    const retainedProcesses = ensureArray(stored?.processes).filter(
      (process) => !isTargetProcess(process)
    );
    let refreshedProcesses = ensureArray(fresh?.processes).filter(isTargetProcess);

    if (stored?.rateOverridden) {
      const storedCtSeconds = ensureArray(stored.processes).reduce(
        (sum, process) => sum + toPayrollAmount(process?.totalCtSeconds, 0),
        0
      );
      const manualRate = storedCtSeconds > 0
        ? ensureArray(stored.processes).reduce(
            (sum, process) => sum + toPayrollAmount(process?.totalEarnings, 0),
            0
          ) / storedCtSeconds
        : 0;
      refreshedProcesses = refreshedProcesses.map((process) => ({
        ...process,
        wagePerSecond: manualRate,
        totalEarnings: toPayrollAmount(process?.totalCtSeconds, 0) * manualRate,
      }));
    }

    return recalculatePayrollEmployeeTotals({
      ...(fresh ?? stored),
      rateOverridden: Boolean(stored?.rateOverridden),
      processes: [...retainedProcesses, ...refreshedProcesses],
    });
  }).filter((employee) => employee.payType === EMPLOYEE_PAY_TYPE.OUTPUT);

  return prisma.payrollSnapshot.update({
    where: { id: snapshot.id },
    data: {
      data: mergedEmployees,
      lockedAt: new Date(),
      lockedBy: String(updatedBy || "unknown"),
    },
  });
};

export const updatePayrollEmployeeRates = async ({
  orgId,
  month: monthInput,
  overrides,
  updatedBy,
}: {
  orgId: number;
  month: string;
  overrides: unknown;
  updatedBy: string;
}) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const snapshot = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
  });
  if (!snapshot) throw createHttpError(404, "snapshot not found");
  if (!snapshot.isProvisional) {
    throw createHttpError(409, "unlock production allowance before editing rates");
  }

  const rateByWorkerId = new Map<number, number>();
  for (const row of ensureArray(overrides)) {
    const workerId = toPositiveIntOrNull(row?.workerId);
    const rate = Number(row?.wagePerSecond);
    if (workerId === null || !Number.isFinite(rate) || rate < 0) {
      throw createHttpError(400, "valid workerId and non-negative wagePerSecond are required");
    }
    rateByWorkerId.set(workerId, rate);
  }
  if (rateByWorkerId.size === 0) {
    throw createHttpError(400, "employee rate overrides are required");
  }

  const employees = ensureArray(snapshot.data).map(normalizePayrollSnapshotEmployee);
  const knownWorkerIds = new Set(
    employees
      .map((employee) => employee.workerId)
      .filter((workerId): workerId is number => workerId !== null)
  );
  for (const workerId of rateByWorkerId.keys()) {
    if (!knownWorkerIds.has(workerId)) {
      throw createHttpError(400, `worker ${workerId} is not in the payroll snapshot`);
    }
  }

  const updatedEmployees = employees.map((employee) => {
    const overrideRate = employee.workerId === null
      ? undefined
      : rateByWorkerId.get(employee.workerId);
    if (overrideRate === undefined) return employee;
    const processes = employee.processes.map((process) => ({
      ...process,
      wagePerSecond: overrideRate,
      totalEarnings: toPayrollAmount(process.totalCtSeconds, 0) * overrideRate,
    }));
    const productionAllowance = processes.reduce(
      (sum, process) => sum + toPayrollAmount(process.totalEarnings, 0),
      0
    );
    const salaryItems = ensureArray(employee.salaryItems).map((item) => {
      const formula = ensureArray(item?.formula).map(String);
      return item?.category === "INCENTIVE" || formula.includes("PRODUCTION_ALLOWANCE")
        ? { ...item, amount: Math.round(productionAllowance) }
        : item;
    });
    const grossSalary = salaryItems.reduce((sum, item) => sum + toPayrollAmount(item?.amount, 0), 0);
    return {
      ...employee,
      salaryItems,
      productionAllowance,
      productionEarnings: productionAllowance,
      grossSalary,
      netSalary: grossSalary - toPayrollAmount(employee.deductions, 0),
      totalEarnings: grossSalary,
      rateOverridden: true,
      processes,
    };
  });

  return prisma.payrollSnapshot.update({
    where: { id: snapshot.id },
    data: {
      data: updatedEmployees,
      lockedAt: new Date(),
      lockedBy: String(updatedBy || "unknown"),
    },
  });
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
  if (!existing.isProvisional) {
    throw createHttpError(409, "unlock production allowance before deletion");
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

export const lockPayrollSnapshot = async ({
  orgId,
  month: monthInput,
  lockedBy,
}: {
  orgId: number;
  month: string;
  lockedBy: string;
}) => {
  const month = String(monthInput || "");
  assertPayrollMonth(month);
  const existing = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
    select: { id: true },
  });
  if (!existing) throw createHttpError(404, "calculate production allowance before locking");

  const readiness = await getPayrollMonthReadiness(orgId, month);
  if (!readiness.ready) throw createHttpError(409, "monthly work records are incomplete");
  if (readiness.needsRecalculation) throw createHttpError(409, "payroll must be recalculated before locking");

  await prisma.payrollSnapshot.update({
    where: { id: existing.id },
    data: {
      isProvisional: false,
      lockedAt: new Date(),
      lockedBy: String(lockedBy || "unknown"),
    },
  });
  return { ok: true, month };
};
