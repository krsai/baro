import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import AppPageContainer from '../../components/AppPageContainer';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from '../../utils/workspaceDataEvents';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { todayDateKey } from '../../utils/dateKey.mjs';

const STATUS_META = {
  overdue: {
    label: '지연',
    color: 'warning',
    icon: WarningAmberIcon,
    background: 'rgba(245, 124, 0, 0.06)',
    overlay: 'rgba(245, 124, 0, 0.12)',
    border: 'warning.light',
  },
  active: {
    label: '진행중',
    color: 'primary',
    icon: PlayCircleOutlineIcon,
    background: 'rgba(2, 136, 209, 0.05)',
    overlay: 'rgba(2, 136, 209, 0.14)',
    border: 'primary.light',
  },
  pending: {
    label: '대기',
    color: 'default',
    icon: PauseCircleOutlineIcon,
    background: 'rgba(158, 158, 158, 0.05)',
    overlay: 'rgba(158, 158, 158, 0.08)',
    border: 'divider',
  },
  completed: {
    label: '완료',
    color: 'success',
    icon: CheckCircleOutlineIcon,
    background: 'rgba(117, 117, 117, 0.12)',
    overlay: 'rgba(117, 117, 117, 0.22)',
    border: 'grey.400',
  },
};

const STATUS_ORDER = {
  overdue: 0,
  active: 1,
  pending: 2,
  completed: 3,
};

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const toNonNegativeIntOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
};

const formatInt = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(number));
};

const getProgressPercent = (producedQty, orderQty) => {
  const produced = Number(producedQty) || 0;
  const order = Number(orderQty) || 0;
  if (order <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((produced / order) * 100)));
};

const getCloseMode = (closedQty, orderQty) => {
  const closed = Number(closedQty) || 0;
  const order = Number(orderQty) || 0;
  if (closed === order) return 'FULL';
  if (closed < order) return 'SHORT';
  return 'OVER';
};

const getCloseModeLabel = (closeMode) => {
  switch (closeMode) {
    case 'FULL':
      return '정량 완료';
    case 'SHORT':
      return '미달 완료';
    case 'OVER':
      return '초과 완료';
    default:
      return '-';
  }
};

const getStatus = (batch, todayKey) => {
  if (batch.isCompleted) return 'completed';
  if (batch.plannedStart && batch.plannedStart > todayKey) return 'pending';
  if (batch.plannedEnd && batch.plannedEnd < todayKey) return 'overdue';
  return 'active';
};

const MetricBlock = ({ label, value, helper, align = 'left' }) => (
  <Stack spacing={0.35} sx={{ minWidth: 132, textAlign: align }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
      {value}
    </Typography>
    {helper ? (
      <Typography variant="caption" color="text.secondary">
        {helper}
      </Typography>
    ) : null}
  </Stack>
);

const ClosePanel = ({ batch, submitting, onConfirm, onCancel }) => {
  const [qty, setQty] = useState(String(batch.closedQty ?? batch.producedQty ?? 0));
  const parsedQty = Math.max(0, Number(qty) || 0);
  const closeMode = getCloseMode(parsedQty, batch.orderQty);

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          제작 완료 확정
        </Typography>
        <Typography variant="body2" color="text.secondary">
          작업기록 생산수량을 검토한 뒤, 이 배치의 제작 완료 수량을 확정합니다.
        </Typography>
        {parsedQty === 0 ? (
          <Typography variant="caption" color="warning.main">
            작업기록이 없는 경우 수량을 직접 입력하세요.
          </Typography>
        ) : null}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <TextField
            label="확정 수량"
            size="small"
            type="number"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            sx={{ width: { xs: '100%', sm: 140 } }}
          />
          <Typography variant="body2" color="text.secondary">
            주문 {formatInt(batch.orderQty)}장 기준
          </Typography>
          <Chip
            size="small"
            color={closeMode === 'FULL' ? 'success' : closeMode === 'OVER' ? 'info' : 'warning'}
            label={getCloseModeLabel(closeMode)}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="success"
            disabled={submitting}
            startIcon={<CheckCircleOutlineIcon />}
            onClick={() => onConfirm(parsedQty)}
          >
            제작 완료 확정
          </Button>
          <Button variant="outlined" disabled={submitting} onClick={onCancel}>
            닫기
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const BatchProgress = () => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const { showNotification } = useAppActions();
  const todayKey = useMemo(() => todayDateKey(), []);

  const [factories, setFactories] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState(toPositiveIntOrNull(activeFactoryId));
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState(null);
  const [submittingCloseId, setSubmittingCloseId] = useState(null);

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
    if (!toPositiveIntOrNull(activeOrgId)) {
      setFactories([]);
      return;
    }
    const query = buildQueryString({ orgId: activeOrgId });
    const response = await requestJSON(`/factories${query}`, { skipGlobalLoading: true }).catch(() => []);
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
    if (!factoryId || !toPositiveIntOrNull(activeOrgId)) {
      setLines([]);
      setSelectedLineId(null);
      return;
    }
    const query = buildQueryString({ orgId: activeOrgId, factoryId });
    const response = await requestJSON(`/lines${query}`, { skipGlobalLoading: true }).catch(() => []);
    const safeRows = Array.isArray(response) ? response : [];
    setLines(safeRows);
    setSelectedLineId((current) => {
      const currentId = toPositiveIntOrNull(current);
      if (!currentId) return null;
      const exists = safeRows.some((line) => Number(line?.id) === currentId);
      return exists ? currentId : null;
    });
  }, [activeOrgId, selectedFactoryId]);

  const loadBatches = useCallback(
    async ({ forceRefresh = false } = {}) => {
      const factoryId = toPositiveIntOrNull(selectedFactoryId);
      if (!factoryId || !toPositiveIntOrNull(activeOrgId)) {
        setBatches([]);
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
        const ids = safePlans.map((plan) => String(plan?.id || '').trim()).filter(Boolean);
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
            .filter((entry) => entry[0])
        );

        const nextRows = safePlans.map((plan) => {
          const id = String(plan?.id || '').trim();
          const progress = progressById.get(id) || {};
          const orderQty =
            toNonNegativeIntOrNull(progress?.plannedQuantity ?? plan?.quantity) ?? 0;
          const producedQty = toNonNegativeIntOrNull(progress?.producedQuantity) ?? 0;
          const progressPercentRaw = Number(progress?.progressPercent);
          const progressPercent = Number.isFinite(progressPercentRaw)
            ? Math.max(0, Math.min(100, Math.round(progressPercentRaw)))
            : getProgressPercent(producedQty, orderQty);
          const lineId = toPositiveIntOrNull(progress?.lineId ?? plan?.lineId);
          const closedQty =
            toNonNegativeIntOrNull(
              progress?.closedQty ??
                plan?.closedQty ??
                progress?.finalQuantity ??
                plan?.finalQuantity
            ) ?? null;
          const completedAt =
            String(
              progress?.closedAt ||
                progress?.completedAt ||
                plan?.closedAt ||
                plan?.completedAt ||
                ''
            ).trim() || null;
          const isCompleted = Boolean(progress?.isCompleted ?? plan?.isCompleted ?? completedAt);
          const closeMode =
            String(progress?.closeMode || plan?.closeMode || '').trim() ||
            (closedQty !== null ? getCloseMode(closedQty, orderQty) : null);
          const isCompletionInconsistent = Boolean(progress?.isCompletionInconsistent);
          const completionGapQuantity =
            toNonNegativeIntOrNull(progress?.completionGapQuantity) ?? 0;
          const closedBy = String(progress?.closedBy || plan?.closedBy || '').trim() || null;
          const isAutoCompleted = closedBy === 'system:auto-worklog';

          return {
            id,
            dbId: toPositiveIntOrNull(plan?.dbId),
            lineId,
            lineName:
              String(progress?.lineName || '').trim() ||
              lineNameById.get(lineId) ||
              '-',
            orderNo: String(plan?.orderNo || progress?.orderNo || '').trim(),
            styleName: String(plan?.label || progress?.label || '').trim(),
            plannedStart: String(plan?.startDateKey || '').trim() || null,
            plannedEnd: String(plan?.endDateKey || '').trim() || null,
            orderQty,
            producedQty,
            progressPercent,
            qcPassedTotal:
              toNonNegativeIntOrNull(progress?.qcPassedTotal ?? plan?.qcPassedTotal) ??
              (isCompleted ? closedQty ?? toNonNegativeIntOrNull(plan?.finalQuantity) ?? 0 : 0),
            qcReady:
              toNonNegativeIntOrNull(progress?.qcPassedTotal ?? plan?.qcPassedTotal) !== null ||
              (isCompleted && (closedQty !== null || toNonNegativeIntOrNull(plan?.finalQuantity) !== null)),
            isCompleted,
            completedAt,
            closedQty,
            closeMode,
            closeBasis: String(progress?.closeBasis || plan?.closeBasis || '').trim() || null,
            closedBy,
            isAutoCompleted,
            isCompletionInconsistent,
            completionGapQuantity,
          };
        });

        setBatches(nextRows);
      } catch (error) {
        setBatches([]);
        showNotification(error?.message || '배치 진행 데이터를 불러오지 못했습니다.', 'error');
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
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    setClosingId(null);
    setSubmittingCloseId(null);
  }, [selectedFactoryId, selectedLineId, activeOrgId]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    onRefresh: () => loadBatches({ forceRefresh: true }),
  });

  const filteredBatches = useMemo(() => {
    const next = batches.filter(
      (batch) =>
        !toPositiveIntOrNull(selectedLineId) ||
        String(batch.lineId || '') === String(selectedLineId)
    );

    next.sort((left, right) => {
      const leftStatus = getStatus(left, todayKey);
      const rightStatus = getStatus(right, todayKey);
      const statusDiff = STATUS_ORDER[leftStatus] - STATUS_ORDER[rightStatus];
      if (statusDiff !== 0) return statusDiff;
      if ((left.lineId || 0) !== (right.lineId || 0)) {
        return (left.lineId || 0) - (right.lineId || 0);
      }
      const leftStart = String(left.plannedStart || '');
      const rightStart = String(right.plannedStart || '');
      if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
      return String(left.orderNo || '').localeCompare(String(right.orderNo || ''));
    });

    return next;
  }, [batches, selectedLineId, todayKey]);

  const summary = useMemo(
    () =>
      filteredBatches.reduce(
        (acc, batch) => {
          const status = getStatus(batch, todayKey);
          acc[status] += 1;
          return acc;
        },
        { overdue: 0, active: 0, pending: 0, completed: 0 }
      ),
    [filteredBatches, todayKey]
  );

  const handleConfirmClose = useCallback(
    async (batch, closedQty) => {
      if (!batch?.id) return;
      setSubmittingCloseId(batch.id);
      try {
        await requestJSON(
          `/assignment-plans/${encodeURIComponent(String(batch.id))}/production-complete` +
            buildQueryString({ orgId: activeOrgId }),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              confirmedQty: closedQty,
            }),
          }
        );
        emitWorkspaceDataChanged({
          topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
          orgId: activeOrgId,
          assignmentIds: [batch.id],
          source: 'batch-progress',
        });
        showNotification('제작 완료를 확정했습니다.', 'success');
        setClosingId(null);
        await loadBatches({ forceRefresh: true });
      } catch (error) {
        showNotification(error?.message || '제작 완료 확정에 실패했습니다.', 'error');
      } finally {
        setSubmittingCloseId(null);
      }
    },
    [activeOrgId, loadBatches, showNotification]
  );

  return (
    <AppPageContainer
      header={
        <Stack spacing={0.6}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            배치 진행 / 제작 완료
          </Typography>
          <Typography variant="body2" color="text.secondary">
            배정 카드별 작업기록 생산수량을 검토하고, 제작 완료 수량을 최종 확정하는 화면입니다.
          </Typography>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Alert severity="info">
          이 화면의 계획 기간은 배정 시점의 계획을 그대로 보여줍니다. 작업기록은 참고 정보이며, 제작 완료는 사람이 별도로
          확정합니다.
        </Alert>
        <Alert severity="warning">
          검수 누적은 QC 이력 기능 연결 전까지 이 화면에서 집계하지 않습니다.
        </Alert>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <TextField
            select
            size="small"
            label="공장"
            value={selectedFactoryId || ''}
            onChange={(event) => setSelectedFactoryId(toPositiveIntOrNull(event.target.value))}
            sx={{ minWidth: 180 }}
          >
            {factories.map((factory) => (
              <MenuItem key={factory.id} value={String(factory.id)}>
                {String(factory.name || '').trim() || `공장 ${factory.id}`}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="라인"
            value={selectedLineId || ''}
            onChange={(event) => setSelectedLineId(toPositiveIntOrNull(event.target.value))}
            sx={{ minWidth: 180 }}
            disabled={!selectedFactoryId}
          >
            <MenuItem value="">전체 라인</MenuItem>
            {lines.map((line) => (
              <MenuItem key={line.id} value={String(line.id)}>
                {String(line.name || '').trim() || `라인 ${line.id}`}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" color="warning" label={`지연 ${summary.overdue}건`} />
            <Chip size="small" color="primary" label={`진행중 ${summary.active}건`} />
            <Chip size="small" label={`대기 ${summary.pending}건`} />
            <Chip size="small" color="success" label={`완료 ${summary.completed}건`} />
          </Stack>
        </Stack>

        {loading ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
            <Stack spacing={1.5} alignItems="center">
              <CircularProgress size={28} />
              <Typography color="text.secondary">배치 진행 데이터를 불러오는 중입니다.</Typography>
            </Stack>
          </Paper>
        ) : !selectedFactoryId ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
            <Typography color="text.secondary">표시할 공장을 선택하세요.</Typography>
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {filteredBatches.map((batch) => {
              const status = getStatus(batch, todayKey);
              const statusMeta = STATUS_META[status];
              const closeMode = batch.isCompleted
                ? String(batch.closeMode || '').trim() || getCloseMode(batch.closedQty, batch.orderQty)
                : null;
              const StatusIcon = statusMeta.icon;
              const canClose =
                status !== 'pending' && (!batch.isCompleted || batch.isAutoCompleted);
              const isClosing = closingId === batch.id;

              return (
                <Paper
                  key={batch.id}
                  variant="outlined"
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 2,
                    borderColor: statusMeta.border,
                    bgcolor: statusMeta.background,
                  }}
                >
                  {status !== 'pending' ? (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        width: `${batch.isCompleted ? 100 : batch.progressPercent}%`,
                        bgcolor: statusMeta.overlay,
                        pointerEvents: 'none',
                      }}
                    />
                  ) : null}

                  <Stack spacing={1.5} sx={{ position: 'relative', zIndex: 1, p: 2 }}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      alignItems={{ md: 'center' }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          icon={<StatusIcon />}
                          size="small"
                          color={statusMeta.color}
                          label={statusMeta.label}
                          variant={batch.isCompleted ? 'filled' : 'outlined'}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {batch.lineName}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {batch.orderNo || '-'}
                        </Typography>
                        <Typography variant="body2">{batch.styleName || '-'}</Typography>
                        {closeMode ? (
                          <Chip
                            size="small"
                            color={closeMode === 'FULL' ? 'success' : closeMode === 'OVER' ? 'info' : 'warning'}
                            label={getCloseModeLabel(closeMode)}
                          />
                        ) : null}
                        {batch.isCompletionInconsistent ? (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`완료 경고 -${formatInt(batch.completionGapQuantity)}장`}
                          />
                        ) : null}
                      </Stack>
                      <Box sx={{ flex: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        배정 기간: {batch.plannedStart || '-'} ~ {batch.plannedEnd || '-'}
                      </Typography>
                    </Stack>

                    <Stack
                      direction={{ xs: 'column', lg: 'row' }}
                      spacing={2}
                      alignItems={{ lg: 'center' }}
                    >
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ flex: 1 }}
                      >
                        <MetricBlock label="주문수량" value={`${formatInt(batch.orderQty)}장`} />
                        <MetricBlock
                          label="작업기록 생산수량"
                          value={`${formatInt(batch.producedQty)}장`}
                          helper="작업기록 기준"
                        />
                        <MetricBlock
                          label="검수 누적"
                          value={batch.qcReady ? `${formatInt(batch.qcPassedTotal)}장` : '집계 준비 중'}
                          helper={batch.qcReady ? 'QC 누적 기준' : 'QC 이력 연결 예정'}
                        />
                        <MetricBlock
                          label="진행도"
                          value={`${formatInt(batch.progressPercent)}%`}
                          helper="작업기록 기준"
                        />
                      </Stack>

                      <Stack alignItems={{ xs: 'flex-start', lg: 'flex-end' }} spacing={0.75}>
                        {batch.isCompleted ? (
                          <>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              완료일 {batch.completedAt || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              확정수량 {formatInt(batch.closedQty)}장
                            </Typography>
                            {batch.isAutoCompleted ? (
                              <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                disabled={submittingCloseId === batch.id}
                                startIcon={<CheckCircleOutlineIcon />}
                                onClick={() => setClosingId((current) => (current === batch.id ? null : batch.id))}
                              >
                                수동 확정
                              </Button>
                            ) : null}
                          </>
                        ) : canClose ? (
                          <Button
                            variant={status === 'overdue' ? 'contained' : 'outlined'}
                            color={status === 'overdue' ? 'warning' : 'primary'}
                            disabled={submittingCloseId === batch.id}
                            startIcon={status === 'overdue' ? <WarningAmberIcon /> : <CheckCircleOutlineIcon />}
                            onClick={() => setClosingId((current) => (current === batch.id ? null : batch.id))}
                          >
                            제작 완료 확정
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            시작 전 배치입니다
                          </Typography>
                        )}
                      </Stack>
                    </Stack>

                    {isClosing ? (
                      <ClosePanel
                        batch={batch}
                        submitting={submittingCloseId === batch.id}
                        onConfirm={(qty) => handleConfirmClose(batch, qty)}
                        onCancel={() => setClosingId(null)}
                      />
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}

            {filteredBatches.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Typography color="text.secondary">표시할 배치가 없습니다.</Typography>
              </Paper>
            ) : null}
          </Stack>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default BatchProgress;
