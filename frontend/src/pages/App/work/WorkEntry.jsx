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
    vi: 'Chi tiết nhật ký công việc',
  },
  notFound: {
    ko: '기록을 찾을 수 없습니다.',
    en: 'Log not found.',
    vi: 'Không tìm thấy nhật ký.',
  },
  loadError: {
    ko: '기록을 불러오지 못했습니다.',
    en: 'Failed to load the log.',
    vi: 'Không thể tải nhật ký.',
  },
  saveSuccess: {
    ko: '작업 기록을 저장했습니다. 다음 단계에서 수량 정산을 진행하세요.',
    en: 'Work log saved. Next, continue in Quantity Settlement.',
    vi: 'Đã lưu nhật ký công việc. Tiếp theo, hãy thực hiện đối chiếu số lượng.',
  },
  updateSuccess: {
    ko: '작업 기록을 수정했습니다. 다음 단계에서 수량 정산을 다시 확인하세요.',
    en: 'Work log updated. Next, review Quantity Settlement again.',
    vi: 'Đã cập nhật nhật ký công việc. Tiếp theo, hãy kiểm tra lại đối chiếu số lượng.',
  },
  saveError: {
    ko: '기록 저장에 실패했습니다.',
    en: 'Failed to save the log.',
    vi: 'Không thể lưu nhật ký.',
  },
  loading: {
    ko: '기록 상세를 불러오는 중입니다.',
    en: 'Loading log detail...',
    vi: 'Đang tải chi tiết nhật ký.',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;
const getCrossLineAssignmentWarning = (payload) =>
  payload?.warnings?.crossLineAssignment || null;
const buildCrossLineAssignmentSaveMessage = ({
  languageCode,
  rowCount,
  isUpdate,
}) => {
  if (languageCode === 'en') {
    return isUpdate
      ? `Work log updated. ${rowCount} cross-line assignment row${rowCount === 1 ? '' : 's'} were noted in the remark.`
      : `Work log saved. ${rowCount} cross-line assignment row${rowCount === 1 ? '' : 's'} were noted in the remark.`;
  }
  if (languageCode === 'vi') {
    return isUpdate
      ? `Đã cập nhật nhật ký công việc. Đã ghi chú ${rowCount} dòng được phân công ở chuyền khác.`
      : `Đã lưu nhật ký công việc. Đã ghi chú ${rowCount} dòng được phân công ở chuyền khác.`;
  }
  return isUpdate
    ? `작업 기록을 수정했습니다. 다른 라인 배정 작업 ${rowCount}건을 비고에 남겼습니다.`
    : `작업 기록을 저장했습니다. 다른 라인 배정 작업 ${rowCount}건을 비고에 남겼습니다.`;
};

const normalizeWorkLogId = (value) => String(value || '').trim();
const buildWorkListTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'Work Logs';
  if (languageCode === 'vi') return 'Nhật ký công việc';
  return '작업 기록';
};
const buildWorkDetailTabLabel = (workDateKey, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiết nhật ký công việc'
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
          const crossLineWarning = getCrossLineAssignmentWarning(updated);
          showNotification(
            crossLineWarning?.rowCount
              ? buildCrossLineAssignmentSaveMessage({
                  languageCode,
                  rowCount: crossLineWarning.rowCount,
                  isUpdate: true,
                })
              : resolveText(TEXT.updateSuccess, languageCode, '기록을 수정했습니다.'),
            crossLineWarning?.rowCount ? 'warning' : 'success'
          );
          setExistingLog(updated);
          return;
        }

        const created = await appendWorkLog(payload, { orgId: activeOrgId });
        if (!created?.id) {
          showNotification(resolveText(TEXT.saveError, languageCode, '기록 저장에 실패했습니다.'), 'error');
          return;
        }

        const crossLineWarning = getCrossLineAssignmentWarning(created);
        showNotification(
          crossLineWarning?.rowCount
            ? buildCrossLineAssignmentSaveMessage({
                languageCode,
                rowCount: crossLineWarning.rowCount,
                isUpdate: false,
              })
            : resolveText(TEXT.saveSuccess, languageCode, '기록을 저장했습니다.'),
          crossLineWarning?.rowCount ? 'warning' : 'success'
        );
        navigateToPath(`/work-history/${created.id}`, {
          label: buildWorkDetailTabLabel(payload?.workDate, languageCode),
        });
      } catch (error) {
        console.error('[WorkEntry.handleSave] error', {
          mode: isEditMode ? 'update' : 'create',
          workLogId: routeWorkLogId ?? null,
          orgId: activeOrgId ?? null,
          status: error?.status ?? null,
          message: error?.message || String(error || ''),
          details: error?.details ?? null,
        });
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
