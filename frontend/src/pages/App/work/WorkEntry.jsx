import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import WorkDetail from './WorkDetail';
import { appendWorkLog, findWorkLogById, updateWorkLog } from './workLogStorage';

const WorkEntry = () => {
  const { workLogId } = useParams();
  const { navigateToPath, closeTab, showNotification } = useApp();

  const isEditMode = Boolean(workLogId) && workLogId !== 'new';
  const [loading, setLoading] = useState(Boolean(isEditMode));
  const [existingLog, setExistingLog] = useState(null);

  const closeEntry = useCallback(() => {
    navigateToPath('/work-history', { label: '작업 기록' });
    if (isEditMode && workLogId) {
      closeTab(`/work-history/${workLogId}`);
      return;
    }
    closeTab('/work-history/new');
  }, [closeTab, isEditMode, navigateToPath, workLogId]);

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
        const record = await findWorkLogById(workLogId);
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
  }, [isEditMode, workLogId]);

  const handleSave = useCallback(
    async (payload) => {
      try {
        if (isEditMode && workLogId) {
          const updated = await updateWorkLog(workLogId, payload);
          if (!updated) {
            showNotification('작업 기록 수정에 실패했습니다.', 'error');
            return;
          }
          showNotification('작업 기록이 수정되었습니다.', 'success');
          closeEntry();
          return;
        }

        await appendWorkLog(payload);
        showNotification('작업 기록이 저장되었습니다.', 'success');
        closeEntry();
      } catch (_error) {
        showNotification('작업 기록 저장에 실패했습니다.', 'error');
      }
    },
    [closeEntry, isEditMode, showNotification, workLogId]
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
