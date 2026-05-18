import React, { useCallback, useEffect, useState } from 'react';
import { CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import WorkDetail from './WorkDetail';
import { appendWorkLog, findWorkLogById, updateWorkLog } from './workLogStorage';

const TEXT = {
  detailTitle: {
    ko: '작업 기록 상세',
    en: 'Work Log Detail',
    vi: 'Chi tiet nhat ky cong viec',
  },
  notFound: {
    ko: '기록을 찾을 수 없습니다.',
    en: 'Log not found.',
    vi: 'Khong tim thay ghi chep.',
  },
  loadError: {
    ko: '기록을 불러오지 못했습니다.',
    en: 'Failed to load the log.',
    vi: 'Khong the tai ghi chep.',
  },
  saveSuccess: {
    ko: '작업 기록을 저장했습니다. 다음 단계에서 수량 정산을 진행하세요.',
    en: 'Work log saved. Next, continue in Quantity Settlement.',
    vi: 'Da luu ghi chep cong viec. Tiep theo, hay thuc hien doi chieu so luong.',
  },
  updateSuccess: {
    ko: '작업 기록을 수정했습니다. 다음 단계에서 수량 정산을 다시 확인하세요.',
    en: 'Work log updated. Next, review Quantity Settlement again.',
    vi: 'Da cap nhat ghi chep cong viec. Tiep theo, hay kiem tra lai doi chieu so luong.',
  },
  saveError: {
    ko: '기록 저장에 실패했습니다.',
    en: 'Failed to save the log.',
    vi: 'Khong the luu ghi chep.',
  },
  loading: {
    ko: '기록 상세를 불러오는 중입니다.',
    en: 'Loading log detail...',
    vi: 'Dang tai chi tiet ghi chep.',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const normalizeWorkLogId = (value) => String(value || '').trim();
const buildWorkListTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'Work Logs';
  if (languageCode === 'vi') return 'Nhat ky cong viec';
  return '작업 기록';
};
const buildWorkDetailTabLabel = (workDateKey, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiet nhat ky cong viec'
      : languageCode === 'en'
        ? 'Work Log Detail'
        : '작업 기록 상세';
  return workDateKey ? `${title}: ${workDateKey}` : title;
};

const WorkEntry = () => {
  const { workLogId } = useParams();
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();

  const routeWorkLogId = normalizeWorkLogId(workLogId);
  const isEditMode = Boolean(routeWorkLogId) && routeWorkLogId !== 'new';

  const [loading, setLoading] = useState(Boolean(isEditMode));
  const [saving, setSaving] = useState(false);
  const [existingLog, setExistingLog] = useState(null);
  const [existingContext, setExistingContext] = useState(null);

  const closeEntry = useCallback(() => {
    const closeTabId = isEditMode && routeWorkLogId
      ? `/work-history/${routeWorkLogId}`
      : '/work-history/new';

    navigateToPath('/work-history', {
      label: buildWorkListTabLabel(languageCode),
      closeTabId,
    });
  }, [isEditMode, languageCode, navigateToPath, routeWorkLogId]);

  useEffect(() => {
    if (!isEditMode) {
      setExistingLog(null);
      setExistingContext(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const record = await findWorkLogById(routeWorkLogId, {
          orgId: activeOrgId,
          skipGlobalLoading: true,
          requestTimeoutMs: 15000,
        });

        if (cancelled) return;
        if (!record) {
          showNotification(resolveText(TEXT.notFound, languageCode, '기록을 찾을 수 없습니다.'), 'error');
          closeEntry();
          return;
        }

        setExistingLog(record);
        setExistingContext(null);
      } catch (_error) {
        if (!cancelled) {
          showNotification(resolveText(TEXT.loadError, languageCode, '기록을 불러오지 못했습니다.'), 'error');
          closeEntry();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, closeEntry, isEditMode, languageCode, routeWorkLogId, showNotification]);

  const handleSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        if (isEditMode && routeWorkLogId) {
          const updated = await updateWorkLog(routeWorkLogId, payload, { orgId: activeOrgId });
          if (!updated) {
            showNotification(resolveText(TEXT.saveError, languageCode, '기록 저장에 실패했습니다.'), 'error');
            return;
          }
          showNotification(resolveText(TEXT.updateSuccess, languageCode, '기록을 수정했습니다.'), 'success');
          setExistingLog(updated);
          return;
        }

        const created = await appendWorkLog(payload, { orgId: activeOrgId });
        if (!created?.id) {
          showNotification(resolveText(TEXT.saveError, languageCode, '기록 저장에 실패했습니다.'), 'error');
          return;
        }

        showNotification(resolveText(TEXT.saveSuccess, languageCode, '기록을 저장했습니다.'), 'success');
        navigateToPath(`/work-history/${created.id}`, {
          label: buildWorkDetailTabLabel(payload?.workDate, languageCode),
        });
      } catch (error) {
        showNotification(
          error?.message || resolveText(TEXT.saveError, languageCode, '기록 저장에 실패했습니다.'),
          'error'
        );
      } finally {
        setSaving(false);
      }
    },
    [activeOrgId, isEditMode, languageCode, navigateToPath, routeWorkLogId, showNotification]
  );

  if (loading) {
    return (
      <AppPageContainer title={resolveText(TEXT.detailTitle, languageCode, '기록 상세')}>
        <Paper
          variant="outlined"
          sx={{
            minHeight: 280,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              {resolveText(TEXT.loading, languageCode, '기록 상세를 불러오는 중입니다.')}
            </Typography>
          </Stack>
        </Paper>
      </AppPageContainer>
    );
  }

  return (
    <WorkDetail
      initialLog={existingLog}
      initialContext={existingContext}
      loading={loading}
      saving={saving}
      onSave={handleSave}
    />
  );
};

export default WorkEntry;
