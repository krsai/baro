import { createHttpError } from '../utils/http';
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

export function resolveOrganizationManagementPeriod(factories: { id: number; managementStartDate?: unknown }[]) {
  const configured = factories.map(factory => normalizeFactoryManagementStartDateKey(factory.managementStartDate)).filter((date): date is string => Boolean(date)).sort();
  const startDate = configured[0] || DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  return { startDate, factories: factories.map(factory => ({ id: factory.id, startDate: normalizeFactoryManagementStartDateKey(factory.managementStartDate) || startDate })) };
}

export async function loadManagementPeriod(db: any, orgId: number, factoryId?: number | null) {
  const factories = await db.factory.findMany({ where: { orgId }, select: { id: true, managementStartDate: true } });
  const period = resolveOrganizationManagementPeriod(factories);
  const factory = factoryId ? period.factories.find(factory => factory.id === factoryId) : null;
  if (factoryId && !factory) throw createHttpError(404,'FACTORY_NOT_FOUND');
  return { ...period, organizationStartDate: period.startDate, startDate: factory?.startDate || period.startDate };
}

export function assertManagedDate(value: unknown, startDate: string, monthOnly = false) {
  if (value && String(value) < (monthOnly ? startDate.slice(0,7) : startDate)) throw createHttpError(400,'BEFORE_MANAGEMENT_START');
}

export function managedDateRange(period: { startDate: string }, query: { dateFrom?: unknown; dateTo?: unknown }) {
  const from = normalizeFactoryManagementStartDateKey(query.dateFrom);
  const to = normalizeFactoryManagementStartDateKey(query.dateTo);
  if (query.dateFrom && !from || query.dateTo && !to) throw createHttpError(400,'INVALID_DATE_RANGE');
  if (from && from < period.startDate && (!to || to < period.startDate)) assertManagedDate(from,period.startDate);
  assertManagedDate(to,period.startDate);
  if (from && to && from > to) throw createHttpError(400,'INVALID_DATE_RANGE');
  return { gte: from && from > period.startDate ? from : period.startDate, ...(to ? { lte: to } : {}) };
}

export function managedWorkLogWhere(period: ReturnType<typeof resolveOrganizationManagementPeriod>) {
  return { OR: [
    { factoryId: null, displayDate: { gte: period.startDate } },
    ...period.factories.map(factory => ({ factoryId: factory.id, displayDate: { gte: factory.startDate } })),
  ] };
}

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
