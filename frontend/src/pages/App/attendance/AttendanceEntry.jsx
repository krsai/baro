import React, { useCallback } from 'react';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import AttendanceBoard from './AttendanceBoard';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeFactoryId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return String(Math.trunc(parsed));
};

const normalizeWorkDate = (value) => {
  const text = String(value || '').trim();
  return DATE_KEY_PATTERN.test(text) ? text : '';
};

const buildAttendanceListTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'Attendance List';
  if (languageCode === 'vi') return 'Danh sach cham cong';
  return '출퇴근 목록';
};

const AttendanceEntry = () => {
  const { factoryId, workDate } = useParams();
  const { navigateToPath } = useAppActions();
  const { languageCode } = useLanguage();

  const normalizedFactoryId = normalizeFactoryId(factoryId);
  const normalizedWorkDate = normalizeWorkDate(workDate);
  const isEditMode = Boolean(normalizedFactoryId && normalizedWorkDate);
  const effectiveWorkDate = normalizedWorkDate || dayjs().format('YYYY-MM-DD');

  const closeEntry = useCallback(() => {
    const closeTabId =
      isEditMode && normalizedFactoryId && normalizedWorkDate
        ? `/attendance/${normalizedFactoryId}/${normalizedWorkDate}`
        : '/attendance/new';

    navigateToPath('/attendance', {
      label: buildAttendanceListTabLabel(languageCode),
      closeTabId,
    });
  }, [
    isEditMode,
    languageCode,
    navigateToPath,
    normalizedFactoryId,
    normalizedWorkDate,
  ]);

  return (
    <AttendanceBoard
      initialFactoryId={normalizedFactoryId}
      initialWorkDate={effectiveWorkDate}
      onClose={closeEntry}
      closeOnSave
    />
  );
};

export default AttendanceEntry;
