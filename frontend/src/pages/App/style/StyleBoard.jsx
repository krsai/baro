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
  '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem', lineHeight: 1.1 },
};
const ST_AT_GAP_PALETTE = {
  [TIME_DIVERGENCE_SEVERITY.NORMAL]: { bg: '#DCEAF8', text: '#245A95' },
  [TIME_DIVERGENCE_SEVERITY.REVIEW]: { bg: '#F7DCC8', text: '#AC6424' },
  [TIME_DIVERGENCE_SEVERITY.CRITICAL]: { bg: '#F5D0D5', text: '#B42318' },
};
const ST_AT_GAP_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem', lineHeight: 1.1, fontWeight: 700 },
};
const formatAtReliabilityLabel = (reliability) => {
  const percent = Number(reliability?.percent);
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
};
const formatAtReliabilityBadgeLabel = (reliability, languageCode) => {
  const percentLabel = formatAtReliabilityLabel(reliability);
  if (languageCode === 'en') return `Reliability ${percentLabel}`;
  if (languageCode === 'vi') return `Do tin cay ${percentLabel}`;
  return `신뢰도 ${percentLabel}`;
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

const StyleBoard = () => {
  const location = useLocation();
  const { styleId } = useParams();
  if (styleId) {
    return <StyleDetail />;
  }

  const { activeOrgId, activeOrgType } = useAuth();
  const { languageCode } = useLanguage();
  const { navigateToPath, showNotification } = useAppActions();
  const isBrandOrg = activeOrgType === 'BRAND';
  const canViewProcessSummary = !isBrandOrg;
  const isStyleRouteActive = location.pathname === '/style';
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAtSyncRunning, setAtSyncRunning] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState(null);
  const refreshStyles = useCallback(async ({ forceRefresh = false } = {}) => {
    setLoading(true);
    try {
      const items = await fetchStylesFromApi({ orgId: activeOrgId, forceRefresh });
      setStyles(items);
    } catch (error) {
      setStyles([]);
      showNotification(
        error?.message ||
          getUiMessage('styleBoard.fetchError', '스타일 목록을 불러오지 못했습니다.', languageCode),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => {
    refreshStyles();
  }, [refreshStyles]);

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
    if (!activeOrgId || isAtSyncRunning) return;
    setAtSyncRunning(true);
    try {
      const result = await requestJSON(
        `/at-sync/run-now${buildQueryString({ orgId: activeOrgId })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'current' }),
        }
      );
      await refreshStyles({ forceRefresh: true });
      showNotification(
        getUiMessage(
          'styleBoard.atSyncSuccess',
          `AT 갱신 완료 (${result?.updatedProcesses ?? 0}개 공정, 기준월 ${result?.trainingMonthKey || '-'})`,
          languageCode
        ),
        'success'
      );
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
  }, [activeOrgId, isAtSyncRunning, languageCode, refreshStyles, showNotification]);

  const handleDeleteClick = (style, event) => {
    event.stopPropagation();
    setStyleToDelete(style);
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
    setStyleToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!styleToDelete) return;

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
    if (!deferredSearchTerm) {
      return styles;
    }
    const lower = deferredSearchTerm.toLowerCase();
    return styles.filter(
      (style) =>
        (style.name || '').toLowerCase().includes(lower) ||
        (style.customer || '').toLowerCase().includes(lower) ||
        (style.styleCode || '').toLowerCase().includes(lower) ||
        (style.id || '').toLowerCase().includes(lower)
    );
  }, [deferredSearchTerm, styles]);

  const rows = useMemo(
    () =>
      [...filteredStyles].sort(compareStyleDefaultOrder).map((style) => {
        if (!canViewProcessSummary) {
          return {
            ...style,
            totalPT: 0,
            totalAT: 0,
            totalST: 0,
            hasTotalPT: false,
            hasTotalAT: false,
            hasTotalST: false,
          };
        }
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

  return (
    <AppPageContainer
      title={getUiMessage('menu.style', '스타일', languageCode)}
      titleActions={(
        <Box sx={{ display: 'flex', gap: 1 }}>
          {canViewProcessSummary ? (
            <Button
              onClick={handleAtSyncClick}
              variant="outlined"
              color="primary"
              disabled={isAtSyncRunning || !activeOrgId}
            >
              {isAtSyncRunning
                ? getUiMessage('styleBoard.atSyncRunning', 'AT 갱신 중...', languageCode)
                : getUiMessage('styleBoard.atSync', 'AT 갱신', languageCode)}
            </Button>
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
          >
            <TableHead>
              <TableRow>
                <TableCell>{getUiMessage('styleBoard.customer', '고객사', languageCode)}</TableCell>
                <TableCell>{getUiMessage('styleBoard.styleName', '스타일명', languageCode)}</TableCell>
                <TableCell>
                  {getUiMessage('styleBoard.styleCode', '스타일 코드', languageCode)}
                </TableCell>
                {canViewProcessSummary ? <TableCell>{'PT'}</TableCell> : null}
                {canViewProcessSummary ? <TableCell>{'AT'}</TableCell> : null}
                {canViewProcessSummary ? <TableCell>{'ST'}</TableCell> : null}
                <TableCell>
                  {getUiMessage('styleBoard.registrationDate', '등록일', languageCode)}
                </TableCell>
                <TableCell align="center">
                  {getUiMessage('styleBoard.action', '작업', languageCode)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canViewProcessSummary ? 8 : 5}
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
              {rows.map((style) => (
                <TableRow
                  hover
                  key={style.id}
                  onDoubleClick={() => handleRowDoubleClick(style)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{resolveCustomerDisplayName({ name: style.customer, nameKo: style.customerNameKo, nameVi: style.customerNameVi }, languageCode) || '-'}</TableCell>
                  <TableCell>{style.name || '-'}</TableCell>
                  <TableCell>{style.styleCode || style.id || '-'}</TableCell>
                  {canViewProcessSummary ? (
                    <TableCell>
                      {style.hasTotalPT ? formatLocalizedSeconds(style.totalPT, languageCode) : '-'}
                    </TableCell>
                  ) : null}
                  {canViewProcessSummary ? (
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {style.hasTotalAT ? formatLocalizedSeconds(style.totalAT, languageCode) : '-'}
                        {style.styleAtReliability && style.hasTotalAT && (
                          <Chip
                            size="small"
                            label={formatAtReliabilityBadgeLabel(
                              style.styleAtReliability,
                              languageCode
                            )}
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
                  <TableCell>{style.registrationDate || '-'}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      aria-label="delete"
                      size="small"
                      onClick={(e) => handleDeleteClick(style, e)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
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

