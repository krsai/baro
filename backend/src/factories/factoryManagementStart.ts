const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY = "2026-04-01";

const isValidDateKey = (value: string): boolean => {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const normalizeFactoryManagementStartDateKey = (
  value: unknown
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || !isValidDateKey(normalized)) return null;
  return normalized;
};

export const resolveFactoryManagementStartDateKey = (
  factory: { managementStartDate?: unknown } | null | undefined
): string =>
  normalizeFactoryManagementStartDateKey(factory?.managementStartDate) ||
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;

export const parseFactoryManagementStartDateInput = (
  value: unknown,
  fallback: string | null = null
): { value: string | null; error: string | null } => {
  if (value === undefined) {
    return {
      value: fallback,
      error: null,
    };
  }

  if (value === null || (typeof value === "string" && !value.trim())) {
    return {
      value: null,
      error: null,
    };
  }

  const normalized = normalizeFactoryManagementStartDateKey(value);
  if (!normalized) {
    return {
      value: fallback,
      error: "managementStartDate must be YYYY-MM-DD",
    };
  }

  return {
    value: normalized,
    error: null,
  };
};
