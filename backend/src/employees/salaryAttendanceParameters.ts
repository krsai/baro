import { EMPLOYEE_PAY_TYPE, normalizePayType } from "./employeeCompensation";
import { isPolicyWorkday, normalizeEmployeePayTypePolicy, type EmployeePayTypePolicyValue } from "./employeePayTypePolicy";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type AttendanceRow = {
  workDate?: unknown;
  workedSeconds?: unknown;
};

export type SalaryAttendanceParameters = {
  ACTUAL_WORKDAYS: number;
  SCHEDULED_WORKDAYS: number;
  HOLIDAY_WORKDAYS: number;
  FULL_ATTENDANCE_FACTOR: 0 | 1;
};

const enumerateMonthDateKeys = (month: string): string[] => {
  if (!MONTH_PATTERN.test(month)) throw new Error("month must be YYYY-MM");
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  const result: string[] = [];
  for (const cursor = new Date(Date.UTC(year, monthIndex, 1)); cursor < endExclusive; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    result.push(cursor.toISOString().slice(0, 10));
  }
  return result;
};

export const resolveSalaryAttendanceParameters = ({
  month,
  payType: payTypeInput,
  holidayDateKeys: holidayDateKeyInput,
  attendanceEntries,
  policy: policyInput,
}: {
  month: string;
  payType: unknown;
  holidayDateKeys: Iterable<string>;
  attendanceEntries: AttendanceRow[];
  policy?: EmployeePayTypePolicyValue;
}): SalaryAttendanceParameters => {
  const payType = normalizePayType(payTypeInput, EMPLOYEE_PAY_TYPE.GENERAL) ?? EMPLOYEE_PAY_TYPE.GENERAL;
  const policy = normalizeEmployeePayTypePolicy(policyInput, payType);
  const holidayDateKeys = new Set(Array.from(holidayDateKeyInput, String));
  const workedSecondsByDate = new Map<string, number>();

  attendanceEntries.forEach((entry) => {
    const dateKey = String(entry?.workDate || "");
    if (!dateKey.startsWith(`${month}-`)) return;
    const workedSeconds = Number(entry?.workedSeconds);
    if (!Number.isFinite(workedSeconds) || workedSeconds <= 0) return;
    workedSecondsByDate.set(dateKey, (workedSecondsByDate.get(dateKey) || 0) + workedSeconds);
  });

  let scheduledWorkdays = 0;
  let actualWorkdays = 0;
  let holidayWorkdays = 0;

  enumerateMonthDateKeys(month).forEach((dateKey) => {
    const holiday = holidayDateKeys.has(dateKey) || !isPolicyWorkday(dateKey, policy);
    const qualifiesAsWorkedDay = (workedSecondsByDate.get(dateKey) || 0) >= policy.workdayMinimumMinutes * 60;
    if (holiday) {
      if (qualifiesAsWorkedDay) holidayWorkdays += 1;
      return;
    }
    scheduledWorkdays += 1;
    if (qualifiesAsWorkedDay) actualWorkdays += 1;
  });

  return {
    ACTUAL_WORKDAYS: actualWorkdays,
    SCHEDULED_WORKDAYS: scheduledWorkdays,
    HOLIDAY_WORKDAYS: holidayWorkdays,
    FULL_ATTENDANCE_FACTOR: scheduledWorkdays > 0 && actualWorkdays >= scheduledWorkdays ? 1 : 0,
  };
};
