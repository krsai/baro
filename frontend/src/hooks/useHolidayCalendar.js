import useWorkspaceRefreshOnEvent from './useWorkspaceRefreshOnEvent';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchHolidayKeys,
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
    isBlocked = () => false,
  } = {}
) {
  const normalizedOrgId = useMemo(() => normalizeOrgId(orgId), [orgId]);
  const blocked = useRef(isBlocked); blocked.current = isBlocked;
  const currentOrg = useRef(normalizedOrgId); currentOrg.current = normalizedOrgId;
  const [holidayKeys, setHolidayKeys] = useState([]);
  const [holidayOrg, setHolidayOrg] = useState(null);
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
        if (currentOrg.current !== normalizedOrgId || blocked.current()) return false;
        const normalizedKeys = normalizeHolidayList(nextKeys);
        setHolidayKeys(normalizedKeys);
        setHolidayOrg(normalizedOrgId);
        setError(null);
        return normalizedKeys;
      } catch (nextError) {
        if (currentOrg.current !== normalizedOrgId) return false;
        setError(nextError);
        throw nextError;
      } finally {
        if (!silent && currentOrg.current === normalizedOrgId) {
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
        setHolidayOrg(normalizedOrgId);
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

  const retryPending = useWorkspaceRefreshOnEvent({
    orgId: normalizedOrgId, topics: ['holidays'],
    onRefresh: () => blocked.current() ? false : refresh({forceRefresh:true,silent:true}),
  });
  const previouslyBlocked = useRef(false);
  useEffect(() => {
    const next = blocked.current();
    if (previouslyBlocked.current && !next) void retryPending();
    previouslyBlocked.current = next;
  });

  const visibleKeys = useMemo(() => holidayOrg === normalizedOrgId ? holidayKeys : [], [holidayKeys, holidayOrg, normalizedOrgId]);
  const holidaySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);

  return {
    holidayKeys: visibleKeys,
    holidaySet,
    loading,
    error,
    refresh,
  };
}
