import { prisma } from "../db";
import { EMPLOYEE_PAY_TYPE, normalizePayType } from "./employeeCompensation";

export type EmployeePayTypePolicyValue = {
  payType: string;
  workWeekdays: number[];
  standardClockIn: string;
  standardClockOut: string;
  breakMinutes: number;
  workdayMinimumMinutes: number;
  standardWorkMinutes: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULTS: Record<string, Omit<EmployeePayTypePolicyValue, "standardWorkMinutes">> = {
  [EMPLOYEE_PAY_TYPE.GENERAL]: { payType: EMPLOYEE_PAY_TYPE.GENERAL, workWeekdays: [1, 2, 3, 4, 5], standardClockIn: "08:00", standardClockOut: "17:00", breakMinutes: 60, workdayMinimumMinutes: 240 },
  [EMPLOYEE_PAY_TYPE.OUTPUT_FIXED]: { payType: EMPLOYEE_PAY_TYPE.OUTPUT_FIXED, workWeekdays: [1, 2, 3, 4, 5, 6], standardClockIn: "08:00", standardClockOut: "17:00", breakMinutes: 60, workdayMinimumMinutes: 240 },
  [EMPLOYEE_PAY_TYPE.OUTPUT]: { payType: EMPLOYEE_PAY_TYPE.OUTPUT, workWeekdays: [1, 2, 3, 4, 5, 6], standardClockIn: "08:00", standardClockOut: "17:00", breakMinutes: 60, workdayMinimumMinutes: 240 },
};

const timeToMinutes = (value: string) => {
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

export const normalizeEmployeePayTypePolicy = (input: any, fallbackPayType?: unknown): EmployeePayTypePolicyValue => {
  const payType = normalizePayType(input?.payType ?? fallbackPayType, EMPLOYEE_PAY_TYPE.GENERAL) || EMPLOYEE_PAY_TYPE.GENERAL;
  const defaults = DEFAULTS[payType] || DEFAULTS[EMPLOYEE_PAY_TYPE.GENERAL]!;
  const weekdays: number[] = Array.isArray(input?.workWeekdays) ? input.workWeekdays.map(Number) : defaults.workWeekdays;
  const workWeekdays = Array.from(new Set<number>(weekdays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort((left, right) => left - right);
  const standardClockIn = TIME_PATTERN.test(String(input?.standardClockIn || "")) ? String(input.standardClockIn) : defaults.standardClockIn;
  const standardClockOut = TIME_PATTERN.test(String(input?.standardClockOut || "")) ? String(input.standardClockOut) : defaults.standardClockOut;
  const breakMinutes = Number.isInteger(Number(input?.breakMinutes)) ? Number(input.breakMinutes) : defaults.breakMinutes;
  const workdayMinimumMinutes = Number.isInteger(Number(input?.workdayMinimumMinutes)) ? Number(input.workdayMinimumMinutes) : defaults.workdayMinimumMinutes;
  let spanMinutes = timeToMinutes(standardClockOut) - timeToMinutes(standardClockIn);
  if (spanMinutes <= 0) spanMinutes += 24 * 60;
  return { payType, workWeekdays, standardClockIn, standardClockOut, breakMinutes, workdayMinimumMinutes, standardWorkMinutes: Math.max(1, spanMinutes - breakMinutes) };
};

export const validateEmployeePayTypePolicy = (input: any) => {
  const normalized = normalizeEmployeePayTypePolicy(input);
  const breakMinutes = Number(input?.breakMinutes);
  const workdayMinimumMinutes = Number(input?.workdayMinimumMinutes);
  return Array.isArray(input?.workWeekdays) && normalized.workWeekdays.length > 0
    && TIME_PATTERN.test(String(input?.standardClockIn || "")) && TIME_PATTERN.test(String(input?.standardClockOut || ""))
    && Number.isInteger(breakMinutes) && breakMinutes >= 0 && breakMinutes <= 720
    && Number.isInteger(workdayMinimumMinutes) && workdayMinimumMinutes >= 1 && workdayMinimumMinutes <= normalized.standardWorkMinutes;
};

export const loadEmployeePayTypePolicies = async (orgId: number) => {
  const rows = await prisma.employeePayTypePolicy.findMany({ where: { orgId } });
  const byType = new Map(rows.map((row) => [row.payType, normalizeEmployeePayTypePolicy(row)]));
  return [EMPLOYEE_PAY_TYPE.GENERAL, EMPLOYEE_PAY_TYPE.OUTPUT_FIXED, EMPLOYEE_PAY_TYPE.OUTPUT].map((payType) => byType.get(payType) || normalizeEmployeePayTypePolicy(DEFAULTS[payType]));
};

export const employeePayTypePolicyMap = (rows: EmployeePayTypePolicyValue[]) => new Map(rows.map((row) => [row.payType, row]));

export const isPolicyWorkday = (dateKey: string, policy: EmployeePayTypePolicyValue) => {
  const utcDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const isoDay = utcDay === 0 ? 7 : utcDay;
  return policy.workWeekdays.includes(isoDay);
};
