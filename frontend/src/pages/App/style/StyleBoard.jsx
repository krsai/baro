import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Paper,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { getUiMessage } from '../../../constants/uiMessages';
import StyleDetail from './StyleDetail';
import {
  fetchStyles as fetchStylesFromApi,
  deleteStyle,
} from '../../../utils/styleApi';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import { WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessTotalForOrderQuantity,
  hasAnyProcessTime,
  normalizeProcesses,
  resolveProcessStTotalSecondsForOrderQuantity,
  resolveStyleAtReliability,
  resolveProcessStPerPieceSeconds,
} from '../../../utils/processTime';
import {
  TIME_DIVERGENCE_SEVERITY,
  calculateDivergencePercent,
  formatDivergencePercentLabel,
  resolveDivergenceMeta,
} from '../../../utils/timeDivergence';

const { useDeferredValue } = React;
const TIME_REFERENCE_QUANTITY_LABEL = formatNumberWithCommas(DEFAULT_TIME_REF_QUANTITY, {
  maximumFractionDigits: 0,
});
const formatTimeReferenceColumnLabel = (label) => `${label}(${TIME_REFERENCE_QUANTITY_LABEL})`;

// 생산계획 카드 상태 라벨과 동일한 커스텀 팔레트 사용 (공유 팔레트 — agent.md 참조)
const AT_RELIABILITY_PALETTE = {
  [AT_RELIABILITY_STATUS.COLLECTING]:     { bg: '#EBEBF0', text: '#747484' },
  [AT_RELIABILITY_STATUS.UNRELIABLE]:     { bg: '#F5D0D5', text: '#B42318' },
  [AT_RELIABILITY_STATUS.INSUFFICIENT]:   { bg: '#F7DCC8', text: '#AC6424' },
  [AT_RELIABILITY_STATUS.USABLE]:         { bg: '#F5E7B2', text: '#8A6100' },
  [AT_RELIABILITY_STATUS.TRUSTED]:        { bg: '#BFEAD0', text: '#268444' },
  [AT_RELIABILITY_STATUS.VERIFIED]:       { bg: '#C8DFF7', text: '#3674B4' },
};
const AT_RELIABILITY_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem', lineHeight: 1.1, fontWeight: 400 },
};
const STYLE_BOARD_AT_SYNC_MARKER = 'style-board-at-sync-2026-06-27-3';
const ST_AT_GAP_PALETTE = {
  [TIME_DIVERGENCE_SEVERITY.NORMAL]: { bg: '#DCEAF8', text: '#245A95' },
  [TIME_DIVERGENCE_SEVERITY.REVIEW]: { bg: '#F7DCC8', text: '#AC6424' },
  [TIME_DIVERGENCE_SEVERITY.CRITICAL]: { bg: '#F5D0D5', text: '#B42318' },
};
const ST_AT_GAP_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem', lineHeight: 1.1, fontWeight: 400 },
};
const formatAtReliabilityLabel = (reliability) => {
  const percent = Number(reliability?.percent);
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
};
const formatAtReliabilityBadgeLabel = (reliability) => formatAtReliabilityLabel(reliability);
const resolveStyleDeleteBlockedByWorkRecordsMessage = (languageCode) => {
  if (languageCode === 'en') {
    return 'Work records exist, so this style cannot be deleted.';
  }
  if (languageCode === 'vi') {
    return 'Style nay da co nhat ky san xuat nen khong the xoa.';
  }
  return '작업기록이 존재해서 삭제할 수 없습니다.';
};
const resolveStAtGapPalette = (meta) =>
  ST_AT_GAP_PALETTE[meta?.severity] || ST_AT_GAP_PALETTE[TIME_DIVERGENCE_SEVERITY.NORMAL];
const toTimestamp = (value) => {
  const timestamp = Date.parse(String(value || '').trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
};
const compareStyleDefaultOrder = (left, right) => {
  const registrationDiff =
    toTimestamp(right?.registrationDate) - toTimestamp(left?.registrationDate);
  if (registrationDiff !== 0) return registrationDiff;

  const lifecycleDiff =
    toTimestamp(right?.updatedAt || right?.createdAt) -
    toTimestamp(left?.updatedAt || left?.createdAt);
  if (lifecycleDiff !== 0) return lifecycleDiff;

  const codeDiff = String(left?.styleCode || '').localeCompare(
    String(right?.styleCode || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
  if (codeDiff !== 0) return codeDiff;

  return String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const toOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeStyleSearchText = (value) => String(value ?? '').trim().toLowerCase();

const resolveSecondsUnitLabel = (languageCode) => {
  if (languageCode === 'en') return 'sec';
  if (languageCode === 'vi') return 'giay';
  return '초';
};

const formatLocalizedSeconds = (value, languageCode) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '-';
  return `${formatNumberWithCommas(Math.round(parsed))}${resolveSecondsUnitLabel(languageCode)}`;
};

const resolveStyleWorkspaceTabLabel = (languageCode, name) => {
  const resolvedName = String(name || '').trim() || '-';
  if (languageCode === 'ko') return `스타일: ${resolvedName}`;
  if (languageCode === 'vi') return `Style: ${resolvedName}`;
  return `Style: ${resolvedName}`;
};

const isAtSyncSuccessReason = (reason) => {
  const normalized = String(reason || 'done').trim().toLowerCase();
  return normalized === 'done' || normalized.startsWith('done+backfilled_');
};

const resolveAtSyncNonSuccessMessage = (languageCode, result) => {
  const monthKey =
    String(result?.trainingMonthKey || result?.diagnostics?.trainingMonthKey || '').trim() || '-';
  const reason = String(result?.reason || '').trim() || 'unknown';
  if (languageCode === 'ko') {
    if (reason === 'no_fitted_metrics') {
      return `AT 갱신 미완료 (회귀식 생성 실패, 기준월 ${monthKey})`;
    }
    if (reason === 'no_initial_st_seeds') {
      return `AT 갱신 미완료 (초기 ST 시드 없음, 기준월 ${monthKey})`;
    }
    if (reason === 'no_metric_observations') {
      return `AT 갱신 미완료 (학습 관측치 없음, 기준월 ${monthKey})`;
    }
    return `AT 갱신 미완료 (${reason}, 기준월 ${monthKey})`;
  }
  if (languageCode === 'vi') {
    return `AT update incomplete (${reason}, thang ${monthKey})`;
  }
  return `AT update incomplete (${reason}, month ${monthKey})`;
};
const resolveAtSyncStatusTooltip = (languageCode, status, isLoading) => {
  const monthKey = status?.trainingMonthKey || '-';
  if (isLoading) {
    if (languageCode === 'en') return 'Checking whether AT needs an update.';
    if (languageCode === 'vi') return 'Dang kiem tra trang thai cap nhat AT.';
    return 'AT 갱신 필요 여부를 확인하는 중입니다.';
  }
  if (!status) {
    if (languageCode === 'en') return 'AT update status is not available.';
    if (languageCode === 'vi') return 'Chua co trang thai cap nhat AT.';
    return 'AT 갱신 상태를 확인하지 못했습니다.';
  }
  if (status.needsUpdate) {
    if (languageCode === 'en') return `Refresh AT through ${monthKey}.`;
    if (languageCode === 'vi') return `Cap nhat AT den thang ${monthKey}.`;
    return `${monthKey} 기준 AT를 갱신합니다.`;
  }
  if (status.reason === 'no_source_work_logs') {
    if (languageCode === 'en') return `No work logs exist through ${monthKey}.`;
    if (languageCode === 'vi') return `Chua co nhat ky san xuat den thang ${monthKey}.`;
    return `${monthKey}까지 갱신할 작업기록이 없습니다.`;
  }
  if (languageCode === 'en') return `AT is already up to date through ${monthKey}.`;
  if (languageCode === 'vi') return `AT da moi nhat den thang ${monthKey}.`;
  return `${monthKey} 기준 AT가 이미 최신입니다.`;
};

const StyleBoard = () => {
  const location = useLocation();
  const { styleId } = useParams();
  if (styleId) {
    return <StyleDetail />;
  }

  const { activeOrgId, activeOrgType } = useAuth();
  const { languageCode } = useLanguage();
  const { navigateToPath, showNotification } = useAppActions();
  const canViewProcessSummary = true;
  const isStyleRouteActive = location.pathname === '/style';
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAtSyncRunning, setAtSyncRunning] = useState(false);
  const [isAtResetRunning, setAtResetRunning] = useState(false);
  const [atSyncStatus, setAtSyncStatus] = useState(null);
  const [isAtSyncStatusLoading, setAtSyncStatusLoading] = useState(false);
  const [isAtResetConfirmOpen, setAtResetConfirmOpen] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState(null);
  const refreshStyles = useCallback(async ({ forceRefresh = false } = {}) => {
    setLoading(true);
    try {
      const items = await fetchStylesFromApi({ orgId: activeOrgId, forceRefresh });
      setStyles(items);
      return items;
    } catch (error) {
      setStyles([]);
      showNotification(
        error?.message ||
          getUiMessage('styleBoard.fetchError', '스타일 목록을 불러오지 못했습니다.', languageCode),
        'error'
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => {
    refreshStyles();
  }, [refreshStyles]);

  const refreshAtSyncStatus = useCallback(async () => {
    if (!activeOrgId || !canViewProcessSummary) {
      setAtSyncStatus(null);
      return null;
    }
    setAtSyncStatusLoading(true);
    try {
      const status = await requestJSON(
        `/at-sync/status${buildQueryString({ orgId: activeOrgId, mode: 'previous' })}`
      );
      setAtSyncStatus(status);
      return status;
    } catch (error) {
      console.warn('[at-sync] status failed', error);
      setAtSyncStatus(null);
      return null;
    } finally {
      setAtSyncStatusLoading(false);
    }
  }, [activeOrgId, canViewProcessSummary]);

  useEffect(() => {
    refreshAtSyncStatus();
  }, [refreshAtSyncStatus]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.STYLES],
    isActive: isStyleRouteActive,
    isBlocked: loading,
    onRefresh: () => refreshStyles({ forceRefresh: true }),
  });

  const handleRowDoubleClick = (style) => {
    const ownerOrgId = toOrgId(style?.ownerOrgId ?? style?.customerOrgId);
    const query = buildQueryString({ ownerOrgId });
    navigateToPath(`/style/${style.id}${query}`, {
      label: resolveStyleWorkspaceTabLabel(languageCode, style?.name || style?.id),
    });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', {
      label: getUiMessage('styleBoard.addStyle', '스타일 추가', languageCode),
    });
  };

  const handleAtSyncClick = useCallback(async () => {
    if (!activeOrgId || isAtSyncRunning || atSyncStatus?.needsUpdate !== true) return;
    setAtSyncRunning(true);
    try {
      console.log('[at-sync] request', {
        clientMarker: STYLE_BOARD_AT_SYNC_MARKER,
        orgId: activeOrgId,
        mode: 'previous',
        debug: true,
      });
      const result = await requestJSON(
        `/at-sync/run-now${buildQueryString({ orgId: activeOrgId })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'previous', debug: true }),
        }
      );
      console.log('[at-sync] response', result);
      if (!isAtSyncSuccessReason(result?.reason)) {
        console.warn('[at-sync] non-success reason', {
          clientMarker: STYLE_BOARD_AT_SYNC_MARKER,
          runtimeMarker: result?.runtimeMarker ?? null,
          reason: result.reason,
          earlyExitStage: result?.diagnostics?.source?.earlyExitStage ?? null,
          rawStyleIdCount: result?.diagnostics?.source?.rawStyleIdCount ?? 0,
          styleCandidateCount: result?.diagnostics?.source?.styleCandidateCount ?? 0,
          fittingStatusCounts: result?.diagnostics?.fitting?.statusCounts ?? {},
        });
      }
      if (result?.diagnostics) {
        console.groupCollapsed('[at-sync] diagnostics');
        console.log('summary', result.diagnostics);
        if (result?.diagnostics?.source) {
          console.table([
            {
              trainingMonthKey: result.diagnostics.trainingMonthKey,
              sourceWorkLogs: result.diagnostics.source.sourceWorkLogCount,
              filteredWorkLogs: result.diagnostics.source.filteredWorkLogCount,
              includedWorkLogs: result.diagnostics.source.includedWorkLogCount,
              sourceWorkRecords: result.diagnostics.source.sourceWorkRecordCount,
              filteredWorkRecords: result.diagnostics.source.filteredWorkRecordCount,
              includedWorkRecords: result.diagnostics.source.includedWorkRecordCount,
              eligibleWorkers: result.diagnostics.source.eligibleWorkerCount,
              attendanceRows: result.diagnostics.source.attendanceRowCount,
              skippedBeforeAttendanceCoverage:
                result.diagnostics.source.skippedBeforeAttendanceCoverageWorkLogCount,
              skippedNoUsableRows:
                result.diagnostics.source.skippedNoUsableRowsWorkLogCount,
              skippedNoLaborInput:
                result.diagnostics.source.skippedNoLaborInputWorkLogCount,
              earlyExitStage: result.diagnostics.source.earlyExitStage ?? null,
              rawStyleIdCount: result.diagnostics.source.rawStyleIdCount ?? 0,
              styleCandidateCount: result.diagnostics.source.styleCandidateCount ?? 0,
              excludedMissingWorker:
                result.diagnostics.source.excludedMissingWorkerRecordCount,
              excludedMissingAttendance:
                result.diagnostics.source.excludedMissingAttendanceRecordCount,
              excludedStyleNotResolved:
                result.diagnostics.source.excludedStyleNotResolvedRecordCount,
              excludedProcessNotResolved:
                result.diagnostics.source.excludedProcessNotResolvedRecordCount,
              excludedCoverageInvalid:
                result.diagnostics.source.excludedCoverageInvalidRecordCount,
              excludedIneligibleWorker:
                result.diagnostics.source.excludedIneligibleWorkerRecordCount,
              bucketDraftCount: result.diagnostics.bucketDraftCount,
              trainingDayBucketCount: result.diagnostics.trainingDayBucketCount,
              reason: result.reason ?? 'done',
              initialSeedMetricCount: result.diagnostics.initialSeedMetricCount ?? 0,
              initialSeedMetricCountFromSt:
                result.diagnostics.initialSeedMetricCountFromSt ?? 0,
              missingInitialSeedMetricCount:
                result.diagnostics.missingInitialSeedMetricCount ?? 0,
              fittedMetricCount: result.diagnostics.fittedMetricCount ?? 0,
              fittingMetricCount: result.diagnostics.fitting?.metricCount ?? 0,
              fittingWeightedPointMetricCount:
                result.diagnostics.fitting?.weightedPointMetricCount ?? 0,
              fittingProvisionalMetricCount:
                result.diagnostics.fitting?.provisionalMetricCount ?? 0,
            },
          ]);
          if (Array.isArray(result.diagnostics.source.sampleExcludedRecords)) {
            console.log(
              '[at-sync] excluded record samples',
              result.diagnostics.source.sampleExcludedRecords
            );
          }
          if (Array.isArray(result.diagnostics.source.rawStyleIdSamples)) {
            console.log(
              '[at-sync] raw style id samples',
              result.diagnostics.source.rawStyleIdSamples
            );
          }
          if (Array.isArray(result.diagnostics.source.styleCandidateSamples)) {
            console.log(
              '[at-sync] style candidate samples',
              result.diagnostics.source.styleCandidateSamples
            );
          }
          if (Array.isArray(result.diagnostics.missingInitialSeedSamples)) {
            console.log(
              '[at-sync] missing initial ST seed samples',
              result.diagnostics.missingInitialSeedSamples
            );
          }
          if (Array.isArray(result.diagnostics?.fitting?.metricSamples)) {
            console.table(result.diagnostics.fitting.metricSamples);
          }
        }
        console.groupEnd();
      }
      const refreshedStyles = await refreshStyles({ forceRefresh: true });
      await refreshAtSyncStatus();
      console.log('[at-sync] styles refreshed', {
        styleCount: Array.isArray(refreshedStyles) ? refreshedStyles.length : 0,
      });
      if (isAtSyncSuccessReason(result?.reason)) {
        showNotification(
          getUiMessage(
            'styleBoard.atSyncSuccess',
            `AT 갱신 완료 (${result?.updatedProcesses ?? 0}개 공정, 기준월 ${result?.trainingMonthKey || '-'})`,
            languageCode
          ),
          'success'
        );
      } else {
        showNotification(resolveAtSyncNonSuccessMessage(languageCode, result), 'warning');
      }
    } catch (error) {
      showNotification(
        error?.message ||
          getUiMessage(
            'styleBoard.atSyncError',
            'AT 갱신에 실패했습니다.',
            languageCode
          ),
        'error'
      );
    } finally {
      setAtSyncRunning(false);
    }
  }, [
    activeOrgId,
    atSyncStatus?.needsUpdate,
    isAtSyncRunning,
    languageCode,
    refreshAtSyncStatus,
    refreshStyles,
    showNotification,
  ]);

  const handleAtResetClick = useCallback(() => {
    if (!activeOrgId || isAtSyncRunning || isAtResetRunning) return;
    setAtResetConfirmOpen(true);
  }, [activeOrgId, isAtResetRunning, isAtSyncRunning]);

  const handleAtResetConfirmClose = useCallback(() => {
    if (isAtResetRunning) return;
    setAtResetConfirmOpen(false);
  }, [isAtResetRunning]);

  const handleAtResetConfirm = useCallback(async () => {
    if (!activeOrgId || isAtResetRunning) return;
    setAtResetRunning(true);
    try {
      const result = await requestJSON(
        `/at-sync/reset${buildQueryString({ orgId: activeOrgId })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      setAtSyncStatus(result?.status ?? null);
      await refreshStyles({ forceRefresh: true });
      await refreshAtSyncStatus();
      showNotification(
        getUiMessage(
          'styleBoard.atResetSuccess',
          `AT 추정 초기화 완료 (공정 ${result?.styleProcessAtParamsReset ?? 0}개, 학습 버킷 ${result?.trainingBucketsDeleted ?? 0}개)`,
          languageCode
        ),
        'success'
      );
    } catch (error) {
      showNotification(
        error?.message ||
          getUiMessage(
            'styleBoard.atResetError',
            'AT 추정 초기화에 실패했습니다.',
            languageCode
          ),
        'error'
      );
    } finally {
      setAtResetRunning(false);
      setAtResetConfirmOpen(false);
    }
  }, [
    activeOrgId,
    isAtResetRunning,
    languageCode,
    refreshAtSyncStatus,
    refreshStyles,
    showNotification,
  ]);

  const handleDeleteClick = (style, event) => {
    event.stopPropagation();
    if (style?.hasWorkRecords) {
      showNotification(resolveStyleDeleteBlockedByWorkRecordsMessage(languageCode), 'warning');
      return;
    }
    setStyleToDelete(style);
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
    setStyleToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!styleToDelete) return;
    if (styleToDelete.hasWorkRecords) {
      showNotification(resolveStyleDeleteBlockedByWorkRecordsMessage(languageCode), 'warning');
      handleConfirmClose();
      return;
    }

    try {
      await deleteStyle(styleToDelete.id, {
        orgId: activeOrgId,
        ownerOrgId: toOrgId(styleToDelete?.ownerOrgId ?? styleToDelete?.customerOrgId),
      });
      setStyles((prevStyles) => prevStyles.filter((s) => s.id !== styleToDelete.id));
      showNotification(
        getUiMessage('styleBoard.deleteSuccess', '스타일이 삭제되었습니다.', languageCode),
        'success'
      );
    } catch (error) {
      showNotification(
        error?.message ||
          getUiMessage('styleBoard.deleteError', '스타일 삭제에 실패했습니다.', languageCode),
        'error'
      );
    } finally {
      handleConfirmClose();
    }
  };

  const filteredStyles = useMemo(() => {
    const lower = normalizeStyleSearchText(deferredSearchTerm);
    if (!lower) {
      return styles;
    }
    return styles.filter((style) =>
      [
        style.name,
        style.customer,
        style.customerNameKo,
        style.customerNameVi,
        style.styleCode,
        style.id,
      ].some((value) => normalizeStyleSearchText(value).includes(lower))
    );
  }, [deferredSearchTerm, styles]);

  const rows = useMemo(
    () =>
      [...filteredStyles].sort(compareStyleDefaultOrder).map((style) => {
        const processes = normalizeProcesses(style.processes);
        const totalPT =
          calculateProcessTotalForOrderQuantity(
            processes,
            'pt',
            DEFAULT_TIME_REF_QUANTITY
          ) / DEFAULT_TIME_REF_QUANTITY;
        const totalAT =
          calculateProcessTotalForOrderQuantity(
            processes,
            'at',
            DEFAULT_TIME_REF_QUANTITY
          ) / DEFAULT_TIME_REF_QUANTITY;
        const totalST =
          processes.reduce((sum, process) => {
            const stTotalSeconds = resolveProcessStTotalSecondsForOrderQuantity(
              process,
              DEFAULT_TIME_REF_QUANTITY
            );
            if (stTotalSeconds == null) return sum;
            return sum + stTotalSeconds;
          }, 0) / DEFAULT_TIME_REF_QUANTITY;
        const hasTotalST = processes.some(
          (process) =>
            resolveProcessStPerPieceSeconds(process, DEFAULT_TIME_REF_QUANTITY) != null
        );
        const hasTotalPT = hasAnyProcessTime(processes, 'pt');
        const hasTotalAT = hasAnyProcessTime(processes, 'at');
        const styleAtReliability = resolveStyleAtReliability(processes);
        const stGapPercent =
          hasTotalAT && hasTotalST
            ? calculateDivergencePercent(totalAT, totalST)
            : null;
        return {
          ...style,
          totalPT,
          totalAT,
          totalST,
          hasTotalPT,
          hasTotalAT,
          hasTotalST,
          styleAtReliability,
          stGapPercent,
          stGapMeta: resolveDivergenceMeta(stGapPercent),
        };
      }),
    [canViewProcessSummary, filteredStyles]
  );

  const atSyncNeedsUpdate = atSyncStatus?.needsUpdate === true;
  const atSyncButtonDisabled =
    isAtSyncRunning || isAtSyncStatusLoading || !activeOrgId || !atSyncNeedsUpdate;
  const atSyncButtonTooltip = resolveAtSyncStatusTooltip(
    languageCode,
    atSyncStatus,
    isAtSyncStatusLoading
  );
  const atResetButtonDisabled = isAtSyncRunning || isAtResetRunning || !activeOrgId;
  const atResetButtonTooltip =
    languageCode === 'en'
      ? 'Clear learned AT values and training buckets so AT can be recalculated.'
      : languageCode === 'vi'
        ? 'Xoa gia tri AT da hoc va bucket hoc de tinh lai AT.'
        : '학습된 AT 값과 학습 버킷을 비워 AT를 다시 계산할 수 있게 합니다.';

  return (
    <AppPageContainer
      title={getUiMessage('menu.style', '스타일', languageCode)}
      titleActions={(
        <Box sx={{ display: 'flex', gap: 1 }}>
          {canViewProcessSummary ? (
            <Tooltip title={atSyncButtonTooltip}>
              <span>
                <Button
                  onClick={handleAtSyncClick}
                  variant="outlined"
                  color="primary"
                  disabled={atSyncButtonDisabled}
                >
                  {isAtSyncRunning
                    ? getUiMessage('styleBoard.atSyncRunning', 'AT 갱신 중...', languageCode)
                    : isAtSyncStatusLoading
                      ? getUiMessage('styleBoard.atSyncChecking', 'AT 확인 중...', languageCode)
                      : getUiMessage('styleBoard.atSync', 'AT 갱신', languageCode)}
                </Button>
              </span>
            </Tooltip>
          ) : null}
          {canViewProcessSummary ? (
            <Tooltip title={atResetButtonTooltip}>
              <span>
                <Button
                  onClick={handleAtResetClick}
                  variant="outlined"
                  color="warning"
                  disabled={atResetButtonDisabled}
                >
                  {isAtResetRunning
                    ? getUiMessage('styleBoard.atResetRunning', 'AT 초기화 중...', languageCode)
                    : getUiMessage('styleBoard.atReset', 'AT 초기화', languageCode)}
                </Button>
              </span>
            </Tooltip>
          ) : null}
          <Button onClick={handleAddNewClick} variant="contained" color="primary">
            {getUiMessage('styleBoard.addStyle', '스타일 추가', languageCode)}
          </Button>
        </Box>
      )}
      toolbar={(
        <PageToolbar
          left={(
            <SearchInput
              placeholder={getUiMessage(
                'styleBoard.searchPlaceholder',
                '스타일명 또는 고객사 검색...',
                languageCode
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          )}
        />
      )}
    >
      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table
            stickyHeader
            aria-label={getUiMessage('styleBoard.tableAriaLabel', 'Style list table', languageCode)}
            size="small"
            sx={{ tableLayout: 'fixed' }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '12%' }}>
                  {getUiMessage('styleBoard.customer', '고객사', languageCode)}
                </TableCell>
                <TableCell sx={{ width: '18%' }}>
                  {getUiMessage('styleBoard.styleName', '스타일명', languageCode)}
                </TableCell>
                <TableCell sx={{ width: '14%' }}>
                  {getUiMessage('styleBoard.styleCode', '스타일 코드', languageCode)}
                </TableCell>
                {canViewProcessSummary ? (
                  <TableCell sx={{ width: '15%' }}>{formatTimeReferenceColumnLabel('PT')}</TableCell>
                ) : null}
                {canViewProcessSummary ? (
                  <TableCell sx={{ width: '15%' }}>{formatTimeReferenceColumnLabel('ST')}</TableCell>
                ) : null}
                {canViewProcessSummary ? (
                  <TableCell sx={{ width: '15%' }}>{formatTimeReferenceColumnLabel('AT')}</TableCell>
                ) : null}
                <TableCell sx={{ width: '11%' }}>
                  {getUiMessage('styleBoard.registrationDate', '등록일', languageCode)}
                </TableCell>
                <TableCell align="center" sx={{ width: '6%' }}>
                  {getUiMessage('styleBoard.action', '작업', languageCode)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    sx={{ textAlign: 'center', color: 'text.secondary' }}
                  >
                    {loading
                      ? getUiMessage(
                          'styleBoard.loadingMessage',
                          '스타일 목록을 불러오는 중입니다.',
                          languageCode
                        )
                      : getUiMessage(
                          'styleBoard.emptyMessage',
                          '등록된 스타일이 없습니다.',
                          languageCode
                        )}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((style) => {
                const deleteBlocked = Boolean(style.hasWorkRecords);
                const deleteTooltipTitle = deleteBlocked
                  ? resolveStyleDeleteBlockedByWorkRecordsMessage(languageCode)
                  : getUiMessage('common.delete', '삭제', languageCode);
                return (
                  <TableRow
                    hover
                    key={style.id}
                    onDoubleClick={() => handleRowDoubleClick(style)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={resolveCustomerDisplayName({ name: style.customer, nameKo: style.customerNameKo, nameVi: style.customerNameVi }, languageCode) || ''}>
                      {resolveCustomerDisplayName({ name: style.customer, nameKo: style.customerNameKo, nameVi: style.customerNameVi }, languageCode) || '-'}
                    </TableCell>
                    <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={style.name || ''}>
                      {style.name || '-'}
                    </TableCell>
                    <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={style.styleCode || ''}>
                      {style.styleCode || style.id || '-'}
                    </TableCell>
                    {canViewProcessSummary ? (
                      <TableCell>
                        {style.hasTotalPT ? formatLocalizedSeconds(style.totalPT, languageCode) : '-'}
                      </TableCell>
                    ) : null}
                    {canViewProcessSummary ? (
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {style.hasTotalST ? formatLocalizedSeconds(style.totalST, languageCode) : '-'}
                          {style.hasTotalAT && style.hasTotalST && style.stGapPercent != null && (
                            <Tooltip
                              title={
                                style.stGapMeta?.needsReview
                                  ? `AT와 ST 차이가 ${formatDivergencePercentLabel(style.stGapPercent)}로 커서 ST 조정 검토가 필요합니다.`
                                  : `AT와 ST 차이율 ${formatDivergencePercentLabel(style.stGapPercent)}`
                              }
                            >
                              <Chip
                                size="small"
                                label={formatDivergencePercentLabel(style.stGapPercent)}
                                sx={{
                                  ...ST_AT_GAP_CHIP_SX,
                                  backgroundColor: resolveStAtGapPalette(style.stGapMeta).bg,
                                  color: resolveStAtGapPalette(style.stGapMeta).text,
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    ) : null}
                    {canViewProcessSummary ? (
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {style.hasTotalAT ? formatLocalizedSeconds(style.totalAT, languageCode) : '-'}
                          {style.styleAtReliability && style.hasTotalAT && (
                            <Chip
                              size="small"
                              label={formatAtReliabilityBadgeLabel(style.styleAtReliability)}
                              sx={{
                                ...AT_RELIABILITY_CHIP_SX,
                                backgroundColor: (AT_RELIABILITY_PALETTE[style.styleAtReliability.status] || AT_RELIABILITY_PALETTE[AT_RELIABILITY_STATUS.COLLECTING]).bg,
                                color: (AT_RELIABILITY_PALETTE[style.styleAtReliability.status] || AT_RELIABILITY_PALETTE[AT_RELIABILITY_STATUS.COLLECTING]).text,
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                    ) : null}
                    <TableCell>{style.registrationDate || '-'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title={deleteTooltipTitle}>
                        <span
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          style={{ display: 'inline-flex' }}
                        >
                          <IconButton
                            aria-label="delete"
                            size="small"
                            color={deleteBlocked ? 'default' : 'error'}
                            disabled={deleteBlocked}
                            onClick={(event) => handleDeleteClick(style, event)}
                            sx={{
                              color: deleteBlocked ? 'action.disabled' : 'error.main',
                              '&.Mui-disabled': {
                                color: 'action.disabled',
                              },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog open={isAtResetConfirmOpen} onClose={handleAtResetConfirmClose}>
        <DialogTitle>
          {getUiMessage('styleBoard.atResetDialogTitle', 'AT 추정 초기화 확인', languageCode)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {getUiMessage(
              'styleBoard.atResetDialogDescription',
              '학습된 AT 값과 AT 학습 버킷을 비웁니다. 작업기록과 출퇴근 원본 데이터는 삭제하지 않습니다. 초기화 후 AT 갱신을 다시 실행할 수 있습니다.',
              languageCode
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAtResetConfirmClose} disabled={isAtResetRunning}>
            {getUiMessage('common.cancel', '취소', languageCode)}
          </Button>
          <Button onClick={handleAtResetConfirm} color="warning" disabled={isAtResetRunning}>
            {isAtResetRunning
              ? getUiMessage('styleBoard.atResetRunning', 'AT 초기화 중...', languageCode)
              : getUiMessage('styleBoard.atReset', 'AT 초기화', languageCode)}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={isConfirmOpen} onClose={handleConfirmClose}>
        <DialogTitle>
          {getUiMessage('styleBoard.deleteDialogTitle', '스타일 삭제 확인', languageCode)}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {getUiMessage(
              'styleBoard.deleteDialogDescription',
              `정말로 '${styleToDelete?.name || ''}' 스타일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
              languageCode,
              { name: styleToDelete?.name || '-' }
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose}>
            {getUiMessage('common.cancel', '취소', languageCode)}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error">
            {getUiMessage('common.delete', '삭제', languageCode)}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default StyleBoard;

