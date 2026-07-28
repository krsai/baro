import {
  normalizeMonthKey,
  shiftMonthKey,
  toDateKeyInTimeZone,
} from "./atTrainingMonthKey";

const DEFAULT_BUSINESS_TIME_ZONE = "Asia/Seoul";

export const assertValidBusinessTimeZone = (input: unknown): string => {
  const timeZone = String(input || "").trim() || DEFAULT_BUSINESS_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch (_error) {
    throw new Error(`Invalid BUSINESS_TIME_ZONE: ${timeZone}`);
  }
  return timeZone;
};

export const resolveCurrentPayrollMonthKey = ({
  now = new Date(),
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
}: {
  now?: Date;
  timeZone?: string;
} = {}): string => {
  const dateKey = toDateKeyInTimeZone(now, timeZone);
  return normalizeMonthKey(dateKey.slice(0, 7));
};

export const resolveLatestCompletedPayrollMonthKey = ({
  now = new Date(),
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
}: {
  now?: Date;
  timeZone?: string;
} = {}): string => {
  const currentMonth = resolveCurrentPayrollMonthKey({ now, timeZone });
  return shiftMonthKey(currentMonth, -1);
};

export const isPayrollMonthReady = (
  monthInput: unknown,
  {
    now = new Date(),
    timeZone = DEFAULT_BUSINESS_TIME_ZONE,
  }: {
    now?: Date;
    timeZone?: string;
  } = {}
): boolean => {
  const month = normalizeMonthKey(monthInput);
  const monthNumber = Number(month.slice(5, 7));
  if (!month || monthNumber < 1 || monthNumber > 12) return false;
  const currentMonth = resolveCurrentPayrollMonthKey({ now, timeZone });
  return Boolean(currentMonth && month < currentMonth);
};
