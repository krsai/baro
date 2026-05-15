import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from '../../utils/workspaceDataEvents';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const toNonNegativeIntOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^\d]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
};

const formatInt = (value) =>
  formatNumberWithCommas(Number(value), {
    fallback: '0',
    maximumFractionDigits: 0,
  });

const resolveStatusChip = (row) => {
  if (row.isCompleted) {
    return { label: '마감완료', color: 'success', variant: 'filled' };
  }
  return { label: '검수대기', color: 'warning', variant: 'outlined' };
};

const QcReview = () => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const { showNotification } = useAppActions();

  const [factories, setFactories] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState(
    toPositiveIntOrNull(activeFactoryId)
  );
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  const lineNameById = useMemo(() => {
    const map = new Map();
    (Array.isArray(lines) ? lines : []).forEach((line) => {
      const id = toPositiveIntOrNull(line?.id);
      if (!id) return;
      map.set(id, String(line?.name || '').trim());
    });
    return map;
  }, [lines]);

  const loadFactories = useCallback(async () => {
    const query = buildQueryString({ orgId: activeOrgId });
    const response = await requestJSON(`/factories${query}`, { skipGlobalLoading: true }).catch(
      () => []
    );
    const safeRows = Array.isArray(response) ? response : [];
    const visibleRows =
      activeOrgRole === 'ADMIN' || !activeFactoryId
        ? safeRows
        : safeRows.filter((factory) => Number(factory?.id) === Number(activeFactoryId));
    setFactories(visibleRows);
    if (!toPositiveIntOrNull(selectedFactoryId) && visibleRows.length > 0) {
      setSelectedFactoryId(toPositiveIntOrNull(visibleRows[0]?.id));
    }
  }, [activeFactoryId, activeOrgId, activeOrgRole, selectedFactoryId]);

  const loadLines = useCallback(async () => {
    const factoryId = toPositiveIntOrNull(selectedFactoryId);
    if (!factoryId) {
      setLines([]);
      setSelectedLineId(null);
      return;
    }
    const query = buildQueryString({ orgId: activeOrgId, factoryId });
    const response = await requestJSON(`/lines${query}`, { skipGlobalLoading: true }).catch(
      () => []
    );
    const safeRows = Array.isArray(response) ? response : [];
    setLines(safeRows);
    setSelectedLineId((current) => {
      const currentId = toPositiveIntOrNull(current);
      if (!currentId) return null;
      const exists = safeRows.some((line) => Number(line?.id) === currentId);
      return exists ? currentId : null;
    });
  }, [activeOrgId, selectedFactoryId]);

  const loadRows = useCallback(
    async ({ forceRefresh = false } = {}) => {
      const factoryId = toPositiveIntOrNull(selectedFactoryId);
      if (!factoryId) {
        setRows([]);
        return;
      }

      setLoading(true);
      try {
        const plans = await requestJSON(
          '/assignment-plans' +
            buildQueryString({
              orgId: activeOrgId,
              factoryId,
              lineId: toPositiveIntOrNull(selectedLineId),
            }),
          { skipGlobalLoading: true, forceRefresh }
        );
        const safePlans = Array.isArray(plans) ? plans : [];
        const ids = safePlans
          .map((plan) => String(plan?.id || '').trim())
          .filter(Boolean);
        const progressRows =
          ids.length > 0
            ? await requestJSON(
                '/assignment-plan-progress' +
                  buildQueryString({
                    orgId: activeOrgId,
                    ids: ids.join(','),
                  }),
                { skipGlobalLoading: true, forceRefresh }
              ).catch(() => [])
            : [];
        const progressById = new Map(
          (Array.isArray(progressRows) ? progressRows : [])
            .map((row) => [String(row?.id || '').trim(), row])
            .filter((row) => row[0])
        );

        setRows((prevRows) => {
          const draftById = new Map(
            (Array.isArray(prevRows) ? prevRows : [])
              .map((row) => [String(row?.id || '').trim(), String(row?.qcPassQuantity || '')])
              .filter((row) => row[0])
          );
          return safePlans.map((plan) => {
            const id = String(plan?.id || '').trim();
            const progress = progressById.get(id) || {};
            const plannedQuantity = toNonNegativeIntOrNull(
              progress?.plannedQuantity ?? plan?.quantity
            );
            const producedQuantity = toNonNegativeIntOrNull(progress?.producedQuantity) ?? 0;
            const finalQuantity = toNonNegativeIntOrNull(
              progress?.finalQuantity ?? plan?.finalQuantity
            );
            const isCompleted = Boolean(progress?.isCompleted ?? plan?.isCompleted);
            const completedAt = progress?.completedAt || plan?.completedAt || null;
            return {
              id,
              dbId: toPositiveIntOrNull(plan?.dbId),
              lineId: toPositiveIntOrNull(plan?.lineId),
              lineName:
                String(progress?.lineName || '').trim() ||
                lineNameById.get(toPositiveIntOrNull(plan?.lineId)) ||
                '-',
              orderNo: String(plan?.orderNo || progress?.orderNo || '').trim(),
              styleCode: String(plan?.styleCode || plan?.styleId || '').trim(),
              styleLabel: String(plan?.label || progress?.label || '').trim(),
              colorName: String(plan?.colorName || progress?.colorName || '').trim(),
              plannedQuantity: plannedQuantity ?? 0,
              producedQuantity,
              finalQuantity,
              isCompleted,
              completedAt,
              qcPassQuantity:
                draftById.get(id) ??
                String(finalQuantity ?? producedQuantity ?? plannedQuantity ?? 0),
            };
          });
        });
      } catch (error) {
        setRows([]);
        showNotification(error?.message || '검수 데이터를 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, lineNameById, selectedFactoryId, selectedLineId, showNotification]
  );

  useEffect(() => {
    loadFactories();
  }, [loadFactories]);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    onRefresh: () => loadRows({ forceRefresh: true }),
  });

  const handleComplete = useCallback(
    async (row) => {
      const finalQuantity = toNonNegativeIntOrNull(row?.qcPassQuantity);
      if (finalQuantity === null) {
        showNotification('검수 통과 수량을 입력해 주세요.', 'error');
        return;
      }
      if (row?.isCompleted) {
        showNotification('이미 마감완료된 건입니다.', 'warning');
        return;
      }

      setSavingPlanId(row.id);
      try {
        await requestJSON(
          `/assignment-plans/${encodeURIComponent(String(row.id || ''))}/complete` +
            buildQueryString({ orgId: activeOrgId }),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalQuantity }),
          }
        );
        emitWorkspaceDataChanged({
          topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
          orgId: activeOrgId,
          assignmentIds: [row.id],
          source: 'qc-review',
        });
        showNotification('검수 마감이 완료되었습니다.', 'success');
        await loadRows({ forceRefresh: true });
      } catch (error) {
        showNotification(error?.message || '검수 마감 처리에 실패했습니다.', 'error');
      } finally {
        setSavingPlanId(null);
      }
    },
    [activeOrgId, loadRows, showNotification]
  );

  const visibleRows = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'pending' && row.isCompleted) return false;
      if (statusFilter === 'completed' && !row.isCompleted) return false;
      if (!keyword) return true;
      const haystack = [
        row.orderNo,
        row.styleCode,
        row.styleLabel,
        row.colorName,
        row.lineName,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, searchText, statusFilter]);

  return (
    <AppPageContainer
      header={
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            검수
          </Typography>
          <Typography variant="body2" color="text.secondary">
            주문/스타일/색상별 검수 통과 수량을 입력하고 마감완료 처리합니다.
          </Typography>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            justifyContent="space-between"
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                select
                size="small"
                label="공장"
                value={selectedFactoryId || ''}
                onChange={(event) => {
                  setSelectedFactoryId(toPositiveIntOrNull(event.target.value));
                  setSelectedLineId(null);
                }}
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
              >
                {(Array.isArray(factories) ? factories : []).map((factory) => (
                  <MenuItem key={factory.id} value={factory.id}>
                    {factory.name || `공장 ${factory.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="라인"
                value={selectedLineId || ''}
                onChange={(event) => setSelectedLineId(toPositiveIntOrNull(event.target.value))}
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
              >
                <MenuItem value="">전체</MenuItem>
                {(Array.isArray(lines) ? lines : []).map((line) => (
                  <MenuItem key={line.id} value={line.id}>
                    {line.name || `라인 ${line.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="상태"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                sx={{ minWidth: { xs: '100%', sm: 140 } }}
              >
                <MenuItem value="pending">검수대기</MenuItem>
                <MenuItem value="completed">마감완료</MenuItem>
                <MenuItem value="all">전체</MenuItem>
              </TextField>
              <TextField
                size="small"
                label="검색"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="주문/스타일/색상"
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
              />
            </Stack>
          </Stack>
        </Paper>

        <Alert severity="info">
          검수에서 마감완료하면 해당 배정카드는 작업 입력이 차단되고 스케줄 순서가 완료순으로 자동 조정됩니다.
        </Alert>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>상태</TableCell>
                  <TableCell>라인</TableCell>
                  <TableCell>주문</TableCell>
                  <TableCell>스타일/색상</TableCell>
                  <TableCell align="right">주문수량</TableCell>
                  <TableCell align="right">제품생산량(공정최소)</TableCell>
                  <TableCell align="right">검수통과수량</TableCell>
                  <TableCell align="right">처리</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        표시할 검수 대상이 없습니다.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const statusChip = resolveStatusChip(row);
                    const quantityDelta = Number(row.qcPassQuantity || 0) - Number(row.plannedQuantity || 0);
                    const hasOverflow = quantityDelta > 0;
                    const hasShortage = quantityDelta < 0;
                    const isSaving = savingPlanId === row.id;
                    return (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ minWidth: 110 }}>
                          <Chip
                            size="small"
                            label={statusChip.label}
                            color={statusChip.color}
                            variant={statusChip.variant}
                          />
                        </TableCell>
                        <TableCell>{row.lineName || '-'}</TableCell>
                        <TableCell sx={{ minWidth: 140 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {row.orderNo || '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.id}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {row.styleCode || row.styleLabel || '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[row.styleLabel, row.colorName].filter(Boolean).join(' / ') || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatInt(row.plannedQuantity)}</TableCell>
                        <TableCell align="right">{formatInt(row.producedQuantity)}</TableCell>
                        <TableCell align="right" sx={{ minWidth: 130 }}>
                          <TextField
                            size="small"
                            value={row.qcPassQuantity}
                            onChange={(event) => {
                              const nextValue = String(event.target.value || '').replace(/[^\d]/g, '');
                              setRows((prevRows) =>
                                prevRows.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        qcPassQuantity: nextValue,
                                      }
                                    : item
                                )
                              );
                            }}
                            disabled={row.isCompleted}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                            helperText={
                              hasOverflow
                                ? `초과 +${formatInt(quantityDelta)}`
                                : hasShortage
                                  ? `부족 ${formatInt(quantityDelta)}`
                                  : ' '
                            }
                            FormHelperTextProps={{
                              sx: {
                                color: hasOverflow
                                  ? 'warning.main'
                                  : hasShortage
                                    ? 'error.main'
                                    : 'text.secondary',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 140 }}>
                          {row.isCompleted ? (
                            <Typography variant="caption" color="text.secondary">
                              {row.completedAt ? new Date(row.completedAt).toLocaleString() : '-'}
                            </Typography>
                          ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <SaveButton
                                onClick={() => handleComplete(row)}
                                disabled={isSaving}
                                loading={isSaving}
                              >
                                마감완료
                              </SaveButton>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default QcReview;
