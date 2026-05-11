import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchHolidayKeys,
  HOLIDAY_UPDATED_EVENT,
  normalizeHolidayList,
} from '../utils/holidayApi';

const normalizeOrgId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

export default function useHolidayCalendar(
  orgId,
  {
    skipGlobalLoading = true,
  } = {}
) {
  const normalizedOrgId = useMemo(() => normalizeOrgId(orgId), [orgId]);
  const [holidayKeys, setHolidayKeys] = useState([]);
  const [loading, setLoading] = useState(Boolean(normalizedOrgId));
  const [error, setError] = useState(null);

  const refresh = useCallback(
    async ({ forceRefresh = true, silent = false } = {}) => {
      if (!normalizedOrgId) {
        setHolidayKeys([]);
        setError(null);
        setLoading(false);
        return [];
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const nextKeys = await fetchHolidayKeys({
          orgId: normalizedOrgId,
          skipGlobalLoading,
          forceRefresh,
        });
        const normalizedKeys = normalizeHolidayList(nextKeys);
        setHolidayKeys(normalizedKeys);
        setError(null);
        return normalizedKeys;
      } catch (nextError) {
        setError(nextError);
        throw nextError;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [normalizedOrgId, skipGlobalLoading]
  );

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    if (!normalizedOrgId) {
      setHolidayKeys([]);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    setLoading(true);
    fetchHolidayKeys({
      orgId: normalizedOrgId,
      skipGlobalLoading,
      signal: abortController.signal,
    })
      .then((nextKeys) => {
        if (cancelled) return;
        setHolidayKeys(normalizeHolidayList(nextKeys));
        setError(null);
      })
      .catch((nextError) => {
        if (cancelled || abortController.signal.aborted) return;
        setHolidayKeys([]);
        setError(nextError);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [normalizedOrgId, skipGlobalLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleHolidayUpdated = (event) => {
      const eventOrgId = normalizeOrgId(event?.detail?.orgId);
      if (eventOrgId !== null && eventOrgId !== normalizedOrgId) return;

      if (Array.isArray(event?.detail?.holidays)) {
        setHolidayKeys(normalizeHolidayList(event.detail.holidays));
        setError(null);
        return;
      }

      refresh({ forceRefresh: true, silent: true }).catch(() => {});
    };

    const handleWindowFocus = () => {
      refresh({ forceRefresh: true, silent: true }).catch(() => {});
    };

    window.addEventListener(HOLIDAY_UPDATED_EVENT, handleHolidayUpdated);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener(HOLIDAY_UPDATED_EVENT, handleHolidayUpdated);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [normalizedOrgId, refresh]);

  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);

  return {
    holidayKeys,
    holidaySet,
    loading,
    error,
    refresh,
  };
}
