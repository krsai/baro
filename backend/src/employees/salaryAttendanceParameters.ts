import { EMPLOYEE_PAY_TYPE, normalizePayType } from "./employeeCompensation";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const SALARY_WORKDAY_MINIMUM_SECONDS = 4 * 60 * 60;

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

const isWeeklyRestDay = (dateKey: string, payType: string): boolean => {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  if (payType === EMPLOYEE_PAY_TYPE.OUTPUT) return day === 0;
  return day === 0 || day === 6;
};

export const resolveSalaryAttendanceParameters = ({
  month,
  payType: payTypeInput,
  holidayDateKeys: holidayDateKeyInput,
  attendanceEntries,
}: {
  month: string;
  payType: unknown;
  holidayDateKeys: Iterable<string>;
  attendanceEntries: AttendanceRow[];
}): SalaryAttendanceParameters => {
  const payType = normalizePayType(payTypeInput, EMPLOYEE_PAY_TYPE.GENERAL) ?? EMPLOYEE_PAY_TYPE.GENERAL;
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
    const holiday = holidayDateKeys.has(dateKey) || isWeeklyRestDay(dateKey, payType);
    const qualifiesAsWorkedDay = (workedSecondsByDate.get(dateKey) || 0) >= SALARY_WORKDAY_MINIMUM_SECONDS;
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
