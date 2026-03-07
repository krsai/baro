import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleDetail from './StyleDetail';
import {
  fetchStyles as fetchStylesFromApi,
  deleteStyle,
} from '../../../utils/styleApi';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcesses,
  resolveStyleAtReliability,
  resolveProcessStPerPieceSeconds,
} from '../../../utils/processTime';
import {
  TIME_DIVERGENCE_SEVERITY,
  calculateDivergencePercent,
  formatDivergencePercentLabel,
  resolveDivergenceMeta,
} from '../../../utils/timeDivergence';

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
const resolveStAtGapPalette = (meta) =>
  ST_AT_GAP_PALETTE[meta?.severity] || ST_AT_GAP_PALETTE[TIME_DIVERGENCE_SEVERITY.NORMAL];

const toOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toOptionalPositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const resolveFactoryWagePerSecond = (factories = []) => {
  const sorted = [...(Array.isArray(factories) ? factories : [])].sort(
    (left, right) => Number(left?.id || 0) - Number(right?.id || 0)
  );
  for (const factory of sorted) {
    const wagePerSecond = toOptionalPositiveNumber(factory?.wagePerSecond);
    if (wagePerSecond != null) return wagePerSecond;
  }
  return null;
};

const formatCurrencyDong = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '-';
  return `${formatNumberWithCommas(Math.round(parsed), {
    fallback: '0',
    maximumFractionDigits: 0,
  })} \uB3D9`;
};

const StyleBoard = () => {
  const { styleId } = useParams();
  if (styleId) {
    return <StyleDetail />;
  }

  const { activeOrgId, activeOrgType } = useAuth();
  const { navigateToPath, showNotification } = useApp();
  const isBrandOrg = activeOrgType === 'BRAND';
  const canViewProcessSummary = !isBrandOrg;
  const [searchTerm, setSearchTerm] = useState('');
  const [styles, setStyles] = useState([]);
  const [factoryWagePerSecond, setFactoryWagePerSecond] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState(null);

  const refreshStyles = async () => {
    setLoading(true);
    try {
      const [items, factories] = await Promise.all([
        fetchStylesFromApi({ orgId: activeOrgId }),
        canViewProcessSummary
          ? requestJSON(`/factories${buildQueryString({ orgId: activeOrgId })}`)
          : Promise.resolve([]),
      ]);
      setStyles(items);
      setFactoryWagePerSecond(resolveFactoryWagePerSecond(factories));
    } catch (error) {
      setStyles([]);
      setFactoryWagePerSecond(null);
      showNotification(error?.message || '스타일 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStyles();
  }, [activeOrgId, canViewProcessSummary]);

  const handleRowDoubleClick = (style) => {
    const ownerOrgId = toOrgId(style?.ownerOrgId ?? style?.customerOrgId);
    const query = buildQueryString({ ownerOrgId });
    navigateToPath(`/style/${style.id}${query}`, { label: `스타일: ${style.name || style.id}` });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', { label: '신규 스타일' });
  };

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
      showNotification('스타일이 삭제되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '스타일 삭제에 실패했습니다.', 'error');
    } finally {
      handleConfirmClose();
    }
  };

  const filteredStyles = useMemo(() => {
    if (!searchTerm) {
      return styles;
    }
    const lower = searchTerm.toLowerCase();
    return styles.filter(
      (style) =>
        (style.name || '').toLowerCase().includes(lower) ||
        (style.customer || '').toLowerCase().includes(lower) ||
        (style.styleCode || '').toLowerCase().includes(lower) ||
        (style.id || '').toLowerCase().includes(lower)
    );
  }, [styles, searchTerm]);

  const rows = useMemo(
    () =>
      filteredStyles.map((style) => {
        if (!canViewProcessSummary) {
          return {
            ...style,
            totalPT: 0,
            totalAT: 0,
            totalST: 0,
            stPerPieceCost: null,
            hasTotalPT: false,
            hasTotalAT: false,
            hasTotalST: false,
          };
        }
        const processes = normalizeProcesses(style.processes);
        const totalPT = calculateProcessTotal(processes, 'pt');
        const totalAT = calculateProcessTotal(processes, 'at');
        const totalST = processes.reduce((sum, process) => {
          const processQuantity = toPositiveInt(process?.quantity, 1);
          const stPerPieceSeconds = resolveProcessStPerPieceSeconds(
            process,
            DEFAULT_TIME_REF_QUANTITY
          );
          if (stPerPieceSeconds == null) return sum;
          return sum + processQuantity * stPerPieceSeconds;
        }, 0);
        const hasTotalST = processes.some(
          (process) =>
            resolveProcessStPerPieceSeconds(process, DEFAULT_TIME_REF_QUANTITY) != null
        );
        const hasTotalPT = hasAnyProcessTime(processes, 'pt');
        const hasTotalAT = hasAnyProcessTime(processes, 'at');
        const stPerPieceCost =
          hasTotalST && factoryWagePerSecond != null
            ? totalST * factoryWagePerSecond
            : null;
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
          stPerPieceCost,
          hasTotalPT,
          hasTotalAT,
          hasTotalST,
          styleAtReliability,
          stGapPercent,
          stGapMeta: resolveDivergenceMeta(stGapPercent),
        };
      }),
    [canViewProcessSummary, factoryWagePerSecond, filteredStyles]
  );

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="스타일명 또는 고객사 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button onClick={handleAddNewClick} variant="contained" color="primary">
          스타일 추가
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="style list table" size="small">
            <TableHead>
              <TableRow>
                <TableCell>고객사</TableCell>
                <TableCell>스타일명</TableCell>
                <TableCell>스타일 코드</TableCell>
                {canViewProcessSummary ? <TableCell>{'PT'}</TableCell> : null}
                {canViewProcessSummary ? <TableCell>{'AT'}</TableCell> : null}
                {canViewProcessSummary ? <TableCell>{'ST'}</TableCell> : null}
                {canViewProcessSummary ? <TableCell>{'단위 공임'}</TableCell> : null}
                <TableCell>등록일</TableCell>
                <TableCell align="center">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canViewProcessSummary ? 9 : 5}
                    sx={{ textAlign: 'center', color: 'text.secondary' }}
                  >
                    {loading ? '스타일 목록을 불러오는 중입니다.' : '등록된 스타일이 없습니다.'}
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
                  <TableCell>{style.customer || '-'}</TableCell>
                  <TableCell>{style.name || '-'}</TableCell>
                  <TableCell>{style.styleCode || style.id || '-'}</TableCell>
                  {canViewProcessSummary ? (
                    <TableCell>{style.hasTotalPT ? formatSeconds(style.totalPT) : '-'}</TableCell>
                  ) : null}
                  {canViewProcessSummary ? (
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {style.hasTotalAT ? formatSeconds(style.totalAT) : '-'}
                        {style.styleAtReliability && style.hasTotalAT && (
                          <Chip
                            size="small"
                            label={formatAtReliabilityLabel(style.styleAtReliability)}
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
                        {style.hasTotalST ? formatSeconds(style.totalST) : '-'}
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
                      {style.stPerPieceCost == null ? '-' : formatCurrencyDong(style.stPerPieceCost)}
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
        <DialogTitle>스타일 삭제 확인</DialogTitle>
        <DialogContent>
          <DialogContentText>
            정말로 '{styleToDelete?.name}' 스타일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose}>취소</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default StyleBoard;

