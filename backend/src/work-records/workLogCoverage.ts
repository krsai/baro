export const WORK_LOG_CROSS_MONTH_ERROR =
  "Work log coverage cannot cross calendar months. Split it into one work log per month.";

export const WORK_LOG_DAILY_ONLY_ERROR = "New employee work logs must cover one day only. Existing coverage dates must be preserved.";

export const validateEmployeeWorkLogDailyCoverage = ({ coverageStartDate, coverageEndDate, existing }: {
  coverageStartDate: string; coverageEndDate: string;
  existing?: { coverageStartDate?: string | null; coverageEndDate?: string | null; displayDate: string } | null;
}) => {
  const oldStart = existing?.coverageStartDate || existing?.displayDate;
  const oldEnd = existing?.coverageEndDate || existing?.displayDate;
  if (existing && oldStart !== oldEnd) {
    return coverageStartDate === oldStart && coverageEndDate === oldEnd ? null : WORK_LOG_DAILY_ONLY_ERROR;
  }
  return coverageStartDate === coverageEndDate ? null : WORK_LOG_DAILY_ONLY_ERROR;
};

const normalizeDateKey = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

export const validateWorkLogSingleMonthRange = ({
  coverageStartDate,
  coverageEndDate,
}: {
  coverageStartDate: unknown;
  coverageEndDate: unknown;
}) => {
  const startDate = normalizeDateKey(coverageStartDate);
  const endDate = normalizeDateKey(coverageEndDate);
  if (!startDate || !endDate) return null;
  return startDate.slice(0, 7) === endDate.slice(0, 7)
    ? null
    : WORK_LOG_CROSS_MONTH_ERROR;
};
