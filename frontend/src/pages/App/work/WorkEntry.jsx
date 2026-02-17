import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import WorkDetail from './WorkDetail';
import { appendWorkLog, findWorkLogById, updateWorkLog } from './workLogStorage';

const WorkEntry = () => {
  const { workLogId } = useParams();
  const { navigateToPath, showNotification } = useApp();
  const { devBypass, devProfile } = useAuth();

  const isEditMode = Boolean(workLogId) && workLogId !== 'new';
  const [loading, setLoading] = useState(Boolean(isEditMode));
  const [existingLog, setExistingLog] = useState(null);
  const activeOrgId = useMemo(() => {
    if (!devBypass) return null;
    const parsed = Number(devProfile?.orgId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [devBypass, devProfile?.orgId]);

  const closeEntry = useCallback(() => {
    if (isEditMode && workLogId) {
      navigateToPath('/work-history', {
        label: '작업 기록',
        closeTabId: `/work-history/${workLogId}`,
      });
      return;
    }
    navigateToPath('/work-history', {
      label: '작업 기록',
      closeTabId: '/work-history/new',
    });
  }, [isEditMode, navigateToPath, workLogId]);

  useEffect(() => {
    if (!isEditMode) {
      setLoading(false);
      setExistingLog(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const record = await findWorkLogById(workLogId, { orgId: activeOrgId });
        if (cancelled) return;
        if (!record) {
          showNotification('작업 기록을 찾을 수 없습니다.', 'error');
          closeEntry();
          return;
        }
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
  }, [activeOrgId, closeEntry, isEditMode, showNotification, workLogId]);

  const handleSave = useCallback(
    async (payload) => {
      try {
        if (isEditMode && workLogId) {
          const updated = await updateWorkLog(workLogId, payload, { orgId: activeOrgId });
          if (!updated) {
            showNotification('작업 기록 수정에 실패했습니다.', 'error');
            return;
          }
          showNotification('작업 기록이 수정되었습니다.', 'success');
          closeEntry();
          return;
        }

        await appendWorkLog(payload, { orgId: activeOrgId });
        showNotification('작업 기록이 저장되었습니다.', 'success');
        closeEntry();
      } catch (_error) {
        showNotification('작업 기록 저장에 실패했습니다.', 'error');
      }
    },
    [activeOrgId, closeEntry, isEditMode, showNotification, workLogId]
  );

  if (loading) {
    return <AppPageContainer />;
  }

  return (
    <AppPageContainer>
      <WorkDetail mode="page" initialLog={existingLog} onClose={closeEntry} onSave={handleSave} />
    </AppPageContainer>
  );
};

export default WorkEntry;
