import { useEffect, useMemo, useRef } from 'react';
import {
  hasWorkspaceDataTopic,
  subscribeWorkspaceDataChanged,
} from '../utils/workspaceDataEvents';

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const normalizeTopics = (value) => {
  const raw = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      raw
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

const matchesOrgId = (detailOrgId, currentOrgId) => {
  if (detailOrgId == null || currentOrgId == null) return true;
  return Number(detailOrgId) === Number(currentOrgId);
};

const useWorkspaceRefreshOnEvent = ({
  orgId = null,
  topics = [],
  isActive = true,
  isBlocked = false,
  onRefresh,
  shouldHandle = null,
  onBlocked = null,
}) => {
  const normalizedOrgId = useMemo(() => toPositiveIntOrNull(orgId), [orgId]);
  const normalizedTopics = useMemo(() => normalizeTopics(topics), [topics]);
  const topicsKey = normalizedTopics.join('|');
  const pendingRefreshRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const blockedNoticeShownRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const shouldHandleRef = useRef(shouldHandle);
  const onBlockedRef = useRef(onBlocked);
  const isActiveRef = useRef(isActive);
  const isBlockedRef = useRef(isBlocked);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    shouldHandleRef.current = shouldHandle;
  }, [shouldHandle]);

  useEffect(() => {
    onBlockedRef.current = onBlocked;
  }, [onBlocked]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    if (normalizedOrgId == null || normalizedTopics.length === 0) {
      return undefined;
    }

    let cancelled = false;

    const runRefresh = async () => {
      if (cancelled) return;
      if (!pendingRefreshRef.current) return;
      if (!isActiveRef.current || isBlockedRef.current) return;
      if (refreshInFlightRef.current) return;
      if (typeof onRefreshRef.current !== 'function') return;

      refreshInFlightRef.current = true;
      pendingRefreshRef.current = false;
      blockedNoticeShownRef.current = false;

      try {
        await onRefreshRef.current();
      } catch (_error) {
        pendingRefreshRef.current = true;
      } finally {
        refreshInFlightRef.current = false;
        if (pendingRefreshRef.current && isActiveRef.current && !isBlockedRef.current) {
          void runRefresh();
        }
      }
    };

    const unsubscribe = subscribeWorkspaceDataChanged((detail) => {
      if (!detail) return;
      if (!matchesOrgId(detail?.orgId, normalizedOrgId)) return;
      if (!normalizedTopics.some((topic) => hasWorkspaceDataTopic(detail, topic))) return;
      if (typeof shouldHandleRef.current === 'function' && !shouldHandleRef.current(detail)) return;

      pendingRefreshRef.current = true;

      if (isBlockedRef.current) {
        if (!blockedNoticeShownRef.current && typeof onBlockedRef.current === 'function') {
          blockedNoticeShownRef.current = true;
          onBlockedRef.current(detail);
        }
        return;
      }

      if (!isActiveRef.current) return;
      void runRefresh();
    });

    if (pendingRefreshRef.current && isActiveRef.current && !isBlockedRef.current) {
      void runRefresh();
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [normalizedOrgId, normalizedTopics.length, topicsKey]);

  useEffect(() => {
    if (!pendingRefreshRef.current) return;
    if (!isActive) return;
    if (isBlocked) {
      if (!blockedNoticeShownRef.current && typeof onBlockedRef.current === 'function') {
        blockedNoticeShownRef.current = true;
        onBlockedRef.current(null);
      }
      return;
    }
    if (refreshInFlightRef.current) return;
    if (typeof onRefreshRef.current !== 'function') return;

    let cancelled = false;

    const runPendingRefresh = async () => {
      refreshInFlightRef.current = true;
      pendingRefreshRef.current = false;
      blockedNoticeShownRef.current = false;

      try {
        await onRefreshRef.current();
      } catch (_error) {
        pendingRefreshRef.current = true;
      } finally {
        refreshInFlightRef.current = false;
        if (
          !cancelled &&
          pendingRefreshRef.current &&
          isActiveRef.current &&
          !isBlockedRef.current
        ) {
          void runPendingRefresh();
        }
      }
    };

    void runPendingRefresh();

    return () => {
      cancelled = true;
    };
  }, [isActive, isBlocked]);
};

export default useWorkspaceRefreshOnEvent;
