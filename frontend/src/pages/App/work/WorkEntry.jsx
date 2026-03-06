import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import WorkDetail from './WorkDetail';
import { appendWorkLog, findWorkLogById, loadWorkLogs, updateWorkLog } from './workLogStorage';

const normalizeWorkLogId = (value) => String(value || '').trim();
const normalizeWorkDateKey = (value) => {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};
const buildFactoryDateCacheKey = (factoryId, workDate) => {
  const normalizedFactoryId = Number(factoryId);
  const normalizedWorkDate = normalizeWorkDateKey(workDate);
  if (!Number.isFinite(normalizedFactoryId) || normalizedFactoryId <= 0 || !normalizedWorkDate) {
    return '';
  }
  return `${normalizedFactoryId}:${normalizedWorkDate}`;
};

const WorkEntry = () => {
  const { workLogId } = useParams();
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId } = useAuth();

  const routeWorkLogId = normalizeWorkLogId(workLogId);
  const isEditMode = Boolean(routeWorkLogId) && routeWorkLogId !== 'new';

  const [loading, setLoading] = useState(Boolean(isEditMode));
  const [existingLog, setExistingLog] = useState(null);
  const [workLogsByFactoryDateKey, setWorkLogsByFactoryDateKey] = useState({});
  const [workLogDetailsById, setWorkLogDetailsById] = useState({});
  const [switchingLogId, setSwitchingLogId] = useState('');

  const displayedWorkLogId = normalizeWorkLogId(existingLog?.id);
  const currentFactoryId = Number(existingLog?.factoryId);
  const currentWorkDateKey = normalizeWorkDateKey(existingLog?.workDate);
  const currentFactoryDateKey = buildFactoryDateCacheKey(currentFactoryId, currentWorkDateKey);
  const cachedCurrentLog = routeWorkLogId ? workLogDetailsById[routeWorkLogId] || null : null;
  const cachedFactoryDateLogs = currentFactoryDateKey
    ? workLogsByFactoryDateKey[currentFactoryDateKey]
    : undefined;

  const cacheWorkLogDetail = useCallback((record) => {
    const nextWorkLogId = normalizeWorkLogId(record?.id);
    if (!nextWorkLogId) return null;

    setWorkLogDetailsById((prev) => {
      if (prev[nextWorkLogId] === record) return prev;
      return {
        ...prev,
        [nextWorkLogId]: record,
      };
    });

    return record;
  }, []);

  const closeEntry = useCallback(() => {
    if (isEditMode && routeWorkLogId) {
      navigateToPath('/work-history', {
        label: '작업 기록',
        closeTabId: `/work-history/${routeWorkLogId}`,
      });
      return;
    }
    navigateToPath('/work-history', {
      label: '작업 기록',
      closeTabId: '/work-history/new',
    });
  }, [isEditMode, navigateToPath, routeWorkLogId]);

  useEffect(() => {
    if (!isEditMode) {
      setLoading(false);
      setExistingLog(null);
      setWorkLogsByFactoryDateKey({});
      setWorkLogDetailsById({});
      setSwitchingLogId('');
      return;
    }

    if (cachedCurrentLog) {
      setExistingLog((prev) =>
        normalizeWorkLogId(prev?.id) === routeWorkLogId ? prev : cachedCurrentLog
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const record = await findWorkLogById(routeWorkLogId, {
          orgId: activeOrgId,
        });
        if (cancelled) return;
        if (!record) {
          showNotification('작업 기록을 찾을 수 없습니다.', 'error');
          closeEntry();
          return;
        }
        cacheWorkLogDetail(record);
        setExistingLog(record);
      } catch (_error) {
        if (!cancelled) {
          showNotification('작업 기록 조회에 실패했습니다.', 'error');
          closeEntry();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    activeOrgId,
    cacheWorkLogDetail,
    cachedCurrentLog,
    closeEntry,
    isEditMode,
    routeWorkLogId,
    showNotification,
  ]);

  useEffect(() => {
    if (!currentFactoryDateKey) return undefined;
    if (Array.isArray(cachedFactoryDateLogs)) return undefined;

    let cancelled = false;
    loadWorkLogs({
      orgId: activeOrgId,
      factoryId: currentFactoryId,
      workDate: currentWorkDateKey,
    })
      .then((rows) => {
        if (cancelled) return;
        setWorkLogsByFactoryDateKey((prev) => ({
          ...prev,
          [currentFactoryDateKey]: Array.isArray(rows) ? rows : [],
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setWorkLogsByFactoryDateKey((prev) => ({
          ...prev,
          [currentFactoryDateKey]: [],
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, cachedFactoryDateLogs, currentFactoryDateKey, currentFactoryId, currentWorkDateKey]);

  useEffect(() => {
    if (!switchingLogId) return;
    if (switchingLogId !== routeWorkLogId) return;
    if (switchingLogId !== displayedWorkLogId) return;
    if (loading) return;
    setSwitchingLogId('');
  }, [displayedWorkLogId, loading, routeWorkLogId, switchingLogId]);

  const handleSave = useCallback(
    async (payload) => {
      try {
        if (isEditMode && routeWorkLogId) {
          const updated = await updateWorkLog(routeWorkLogId, payload, { orgId: activeOrgId });
          if (!updated) {
            showNotification('작업 기록 수정에 실패했습니다.', 'error');
            return;
          }
          cacheWorkLogDetail(updated);
          showNotification('작업 기록을 수정했습니다.', 'success');
          closeEntry();
          return;
        }

        const created = await appendWorkLog(payload, { orgId: activeOrgId });
        if (created?.id) {
          cacheWorkLogDetail(created);
        }
        showNotification('작업 기록이 저장되었습니다.', 'success');
        closeEntry();
      } catch (error) {
        showNotification(error?.message || '작업 기록 저장에 실패했습니다.', 'error');
      }
    },
    [activeOrgId, cacheWorkLogDetail, closeEntry, isEditMode, routeWorkLogId, showNotification]
  );

  const handleSelectionContextChange = useCallback(
    async ({ factoryId, lineId, workDate, workLogId: activeWorkLogId }) => {
      if (!isEditMode) return;
      const workDateKey = normalizeWorkDateKey(workDate);
      if (!factoryId || !lineId || !workDateKey) return;
      const cacheKey = buildFactoryDateCacheKey(factoryId, workDateKey);
      if (!cacheKey) return;

      const currentVisibleWorkLogId = normalizeWorkLogId(
        activeWorkLogId || displayedWorkLogId || routeWorkLogId
      );
      if (!currentVisibleWorkLogId) return;

      try {
        const cachedLogs = workLogsByFactoryDateKey[cacheKey];
        const logs = Array.isArray(cachedLogs)
          ? cachedLogs
          : await loadWorkLogs({
              orgId: activeOrgId,
              factoryId,
              workDate: workDateKey,
            });

        if (!Array.isArray(cachedLogs)) {
          setWorkLogsByFactoryDateKey((prev) => ({
            ...prev,
            [cacheKey]: Array.isArray(logs) ? logs : [],
          }));
        }

        const matchedLog = logs.find(
          (log) =>
            String(log?.workDate || '').trim() === workDateKey &&
            Number(log?.lineId) === Number(lineId)
        );
        if (!matchedLog?.id) return;

        const matchedLogId = normalizeWorkLogId(matchedLog.id);
        if (
          !matchedLogId ||
          matchedLogId === currentVisibleWorkLogId ||
          matchedLogId === switchingLogId
        ) {
          return;
        }

        setSwitchingLogId(matchedLogId);
        setLoading(true);

        const cachedDetail = workLogDetailsById[matchedLogId];
        const targetRecord =
          cachedDetail ||
          (await findWorkLogById(matchedLogId, {
            orgId: activeOrgId,
          }));

        if (!targetRecord?.id) {
          setSwitchingLogId('');
          return;
        }

        cacheWorkLogDetail(targetRecord);
        setExistingLog(targetRecord);

        navigateToPath(`/work-history/${matchedLogId}`, {
          label: '작업 상세',
        });
      } catch (_error) {
        setSwitchingLogId('');
      } finally {
        setLoading(false);
      }
    },
    [
      activeOrgId,
      cacheWorkLogDetail,
      displayedWorkLogId,
      isEditMode,
      navigateToPath,
      routeWorkLogId,
      switchingLogId,
      workLogDetailsById,
      workLogsByFactoryDateKey,
    ]
  );

  const hasExistingLog = Boolean(existingLog?.id);
  const isInitialLoading = loading && isEditMode && !hasExistingLog;
  const isLogSwitching = useMemo(() => {
    if (switchingLogId) return true;
    if (!loading || !isEditMode || !hasExistingLog) return false;
    return displayedWorkLogId !== routeWorkLogId;
  }, [displayedWorkLogId, hasExistingLog, isEditMode, loading, routeWorkLogId, switchingLogId]);

  if (isInitialLoading) {
    return <AppPageContainer />;
  }

  return (
    <AppPageContainer>
      <WorkDetail
        mode="page"
        initialLog={existingLog}
        isLogSwitching={isLogSwitching}
        onClose={closeEntry}
        onSave={handleSave}
        onSelectionContextChange={handleSelectionContextChange}
      />
    </AppPageContainer>
  );
};

export default WorkEntry;
