import { buildQueryString, requestJSON } from './apiClient';

export const HOLIDAY_UPDATED_EVENT = 'baro:holidays-updated';
export const LEGACY_HOLIDAY_STORAGE_KEY = 'baro_holidays_v1';

const HOLIDAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeHolidayKey = (value) => {
  const key = String(value ?? '').trim();
  return HOLIDAY_KEY_PATTERN.test(key) ? key : '';
};

export const normalizeHolidayList = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((value) => normalizeHolidayKey(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

const readLegacyHolidayKeys = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_HOLIDAY_STORAGE_KEY);
    if (!raw) return [];
    return normalizeHolidayList(JSON.parse(raw));
  } catch (_error) {
    return [];
  }
};

const clearLegacyHolidayKeys = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_HOLIDAY_STORAGE_KEY);
  } catch (_error) {
    // Ignore legacy cleanup failures.
  }
};

const emitHolidayUpdated = (orgId, holidays) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent(HOLIDAY_UPDATED_EVENT, {
      detail: {
        orgId: Number(orgId) || null,
        holidays: normalizeHolidayList(holidays),
      },
    })
  );
};

const normalizeHolidayResponse = (payload) => {
  if (Array.isArray(payload)) return normalizeHolidayList(payload);
  if (Array.isArray(payload?.holidays)) return normalizeHolidayList(payload.holidays);
  return [];
};

const persistHolidayKeys = async ({
  orgId,
  holidays,
  skipGlobalLoading = false,
  signal,
}) => {
  const normalizedOrgId = Number(orgId);
  if (!Number.isFinite(normalizedOrgId) || normalizedOrgId <= 0) return [];

  const response = await requestJSON(
    '/holidays' + buildQueryString({ orgId: normalizedOrgId }),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holidays: normalizeHolidayList(holidays) }),
      skipGlobalLoading,
      signal,
    }
  );
  const saved = normalizeHolidayResponse(response);
  clearLegacyHolidayKeys();
  emitHolidayUpdated(normalizedOrgId, saved);
  return saved;
};

export const fetchHolidayKeys = async ({
  orgId,
  skipGlobalLoading = true,
  signal,
  forceRefresh = false,
  migrateLegacy = true,
} = {}) => {
  const normalizedOrgId = Number(orgId);
  if (!Number.isFinite(normalizedOrgId) || normalizedOrgId <= 0) return [];

  const response = await requestJSON(
    '/holidays' + buildQueryString({ orgId: normalizedOrgId }),
    {
      skipGlobalLoading,
      signal,
      forceRefresh,
    }
  );
  const serverKeys = normalizeHolidayResponse(response);
  if (serverKeys.length > 0) {
    clearLegacyHolidayKeys();
    return serverKeys;
  }

  const legacyKeys = readLegacyHolidayKeys();
  if (!migrateLegacy || legacyKeys.length === 0) {
    return serverKeys;
  }

  try {
    return await persistHolidayKeys({
      orgId: normalizedOrgId,
      holidays: legacyKeys,
      skipGlobalLoading,
      signal,
    });
  } catch (_error) {
    return legacyKeys;
  }
};

export const saveHolidayKeys = async ({
  orgId,
  holidays,
  skipGlobalLoading = false,
  signal,
} = {}) =>
  persistHolidayKeys({
    orgId,
    holidays,
    skipGlobalLoading,
    signal,
  });
