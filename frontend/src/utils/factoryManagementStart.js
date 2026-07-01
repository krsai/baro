import dayjs from 'dayjs';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY = '2026-04-01';

export const normalizeFactoryManagementStartDateKey = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || !DATE_KEY_PATTERN.test(normalized)) return '';
  const parsed = dayjs(normalized, 'YYYY-MM-DD', true);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
};

export const resolveFactoryManagementStartDateKey = (factory) =>
  normalizeFactoryManagementStartDateKey(factory?.managementStartDate) ||
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;

export const resolveEarliestFactoryManagementStartDateKey = (factories) => {
  const dateKeys = (Array.isArray(factories) ? factories : [])
    .map((factory) => normalizeFactoryManagementStartDateKey(factory?.managementStartDate))
    .filter(Boolean)
    .sort();
  return dateKeys[0] || DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
};

export const resolveScopedFactoryManagementStartDateKey = ({
  factory = null,
  factories = [],
} = {}) =>
  factory
    ? resolveFactoryManagementStartDateKey(factory)
    : resolveEarliestFactoryManagementStartDateKey(factories);

export const resolveScopedFactoryManagementStartDay = (params) =>
  dayjs(resolveScopedFactoryManagementStartDateKey(params)).startOf('day');

export const resolveScopedFactoryManagementStartMonth = (params) =>
  resolveScopedFactoryManagementStartDay(params).startOf('month');

export const clampDateToFactoryManagementStart = (
  value,
  managementStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) => {
  const minDay = dayjs(
    normalizeFactoryManagementStartDateKey(managementStartDateKey) ||
      DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
  ).startOf('day');
  const parsed = dayjs(value);
  const normalized = parsed.isValid() ? parsed.startOf('day') : dayjs().startOf('day');
  return normalized.isBefore(minDay, 'day') ? minDay : normalized;
};

export const isDateBeforeFactoryManagementStart = (
  value,
  managementStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) => {
  const dateKey = normalizeFactoryManagementStartDateKey(value);
  const startDateKey =
    normalizeFactoryManagementStartDateKey(managementStartDateKey) ||
    DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  return Boolean(dateKey) && dateKey < startDateKey;
};
