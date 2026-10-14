import { resolveCurrentPayrollMonthKey } from './payrollMonth';
import { createHttpError } from './http';

export const defaultVersionStartMonth = () => resolveCurrentPayrollMonthKey({ timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Seoul' });

export const resolveVersionStartMonth = (input?: unknown) => {
  if (input == null || input === '') return defaultVersionStartMonth();
  const month = String(input).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw createHttpError(400, 'effectiveMonth must be YYYY-MM');
  return month;
};

// Several revisions can start in the same month; the highest version wins.
export const compareVersionStarts = (a: any, b: any, versions: Map<number, any>) =>
  String(a.startMonth).localeCompare(String(b.startMonth)) ||
  Number(versions.get(Number(a.versionId))?.versionNumber) - Number(versions.get(Number(b.versionId))?.versionNumber);
