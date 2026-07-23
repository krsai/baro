export const WORK_LOG_CROSS_MONTH_ERROR =
  "Work log coverage cannot cross calendar months. Split it into one work log per month.";

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
