import React, { useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import WorkDetail from './WorkDetail';
import { appendWorkLog, findWorkLogById, updateWorkLog } from './workLogStorage';

const WorkEntry = () => {
  const { workLogId } = useParams();
  const { navigateToPath, closeTab, showNotification } = useApp();

  const isEditMode = Boolean(workLogId) && workLogId !== 'new';
  const existingLog = useMemo(
    () => (isEditMode ? findWorkLogById(workLogId) : null),
    [isEditMode, workLogId]
  );

  const closeEntry = useCallback(() => {
    navigateToPath('/work-history', { label: '작업 기록' });
    if (isEditMode && workLogId) {
      closeTab(`/work-history/${workLogId}`);
      return;
    }
    closeTab('/work-history/new');
  }, [closeTab, isEditMode, navigateToPath, workLogId]);

  useEffect(() => {
    if (!isEditMode) return;
    if (existingLog) return;

    showNotification('작업 기록을 찾을 수 없습니다.', 'error');
    closeEntry();
  }, [closeEntry, existingLog, isEditMode, showNotification]);

  const handleSave = useCallback(
    (payload) => {
      if (isEditMode && workLogId) {
        const updated = updateWorkLog(workLogId, payload);
        if (!updated) {
          showNotification('작업 기록 수정에 실패했습니다.', 'error');
          return;
        }
        showNotification('작업 기록이 수정되었습니다.', 'success');
        closeEntry();
        return;
      }

      appendWorkLog(payload);
      showNotification('작업 기록이 저장되었습니다.', 'success');
      closeEntry();
    },
    [closeEntry, isEditMode, showNotification, workLogId]
  );

  return (
    <AppPageContainer>
      <WorkDetail mode="page" initialLog={existingLog} onClose={closeEntry} onSave={handleSave} />
    </AppPageContainer>
  );
};

export default WorkEntry;
