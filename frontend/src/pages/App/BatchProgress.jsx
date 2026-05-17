import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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

const TODAY = '2026-04-30';

const DUMMY_LINES = [
  { id: 1, name: 'L15-1' },
  { id: 2, name: 'L15-2' },
  { id: 3, name: 'L16-1' },
];

const DUMMY_BATCHES = [
  {
    id: 'A1',
    lineId: 1,
    lineName: 'L15-1',
    orderNo: 'AM01160',
    styleName: '셔츠 A',
    plannedStart: '2026-04-01',
    plannedEnd: '2026-04-09',
    orderQty: 140,
    producedQty: 128,
    qcPassedTotal: 116,
    processBreakdown: [
      { processName: '봉제', qty: 128 },
      { processName: '마감', qty: 128 },
    ],
    isCompleted: false,
    completedAt: null,
    closedQty: null,
  },
  {
    id: 'A2',
    lineId: 1,
    lineName: 'L15-1',
    orderNo: 'AM01161',
    styleName: '블라우스 B',
    plannedStart: '2026-04-10',
    plannedEnd: '2026-04-19',
    orderQty: 200,
    producedQty: 200,
    qcPassedTotal: 182,
    processBreakdown: [
      { processName: '봉제', qty: 200 },
      { processName: '마감', qty: 200 },
    ],
    isCompleted: false,
    completedAt: null,
    closedQty: null,
  },
  {
    id: 'A3',
    lineId: 1,
    lineName: 'L15-1',
    orderNo: 'AM01162',
    styleName: '바지 C',
    plannedStart: '2026-05-02',
    plannedEnd: '2026-05-08',
    orderQty: 80,
    producedQty: 0,
    qcPassedTotal: 0,
    processBreakdown: [],
    isCompleted: false,
    completedAt: null,
    closedQty: null,
  },
  {
    id: 'B1',
    lineId: 2,
    lineName: 'L15-2',
    orderNo: 'AM01170',
    styleName: '원피스 D',
    plannedStart: '2026-04-01',
    plannedEnd: '2026-04-15',
    orderQty: 300,
    producedQty: 312,
    qcPassedTotal: 300,
    processBreakdown: [
      { processName: '봉제', qty: 312 },
      { processName: '마감', qty: 305 },
    ],
    isCompleted: true,
    completedAt: '2026-04-30',
    closedQty: 300,
  },
];

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

const getStatus = (batch) => {
  if (batch.isCompleted) return 'completed';
  if (batch.plannedStart > TODAY) return 'pending';
  if (batch.plannedEnd < TODAY) return 'overdue';
  return 'active';
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

const MetricBlock = ({ label, value, helper, align = 'left' }) => (
  <Stack spacing={0.35} sx={{ minWidth: 120, textAlign: align }}>
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

const ClosePanel = ({ batch, onConfirm, onCancel }) => {
  const [qty, setQty] = useState(String(batch.producedQty || 0));
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
            startIcon={<CheckCircleOutlineIcon />}
            onClick={() => onConfirm(parsedQty)}
          >
            제작 완료 확정
          </Button>
          <Button variant="outlined" onClick={onCancel}>
            닫기
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const BatchProgress = () => {
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [closingId, setClosingId] = useState(null);
  const [batches, setBatches] = useState(DUMMY_BATCHES);

  const filteredBatches = useMemo(() => {
    const next = batches.filter(
      (batch) => selectedLineId === 'all' || String(batch.lineId) === String(selectedLineId)
    );

    next.sort((left, right) => {
      const leftStatus = getStatus(left);
      const rightStatus = getStatus(right);
      const statusDiff = STATUS_ORDER[leftStatus] - STATUS_ORDER[rightStatus];
      if (statusDiff !== 0) return statusDiff;
      if (left.lineId !== right.lineId) return left.lineId - right.lineId;
      if (left.plannedStart !== right.plannedStart) {
        return left.plannedStart.localeCompare(right.plannedStart);
      }
      return String(left.orderNo || '').localeCompare(String(right.orderNo || ''));
    });

    return next;
  }, [batches, selectedLineId]);

  const summary = useMemo(
    () =>
      filteredBatches.reduce(
        (acc, batch) => {
          const status = getStatus(batch);
          acc[status] += 1;
          return acc;
        },
        { overdue: 0, active: 0, pending: 0, completed: 0 }
      ),
    [filteredBatches]
  );

  const handleConfirmClose = (batchId, closedQty) => {
    setBatches((current) =>
      current.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              isCompleted: true,
              completedAt: TODAY,
              closedQty,
            }
          : batch
      )
    );
    setClosingId(null);
  };

  return (
    <AppPageContainer
      header={
        <Stack spacing={0.6}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            배치 진행 / 제작 완료
          </Typography>
          <Typography variant="body2" color="text.secondary">
            배정 카드별 작업기록 생산수량과 검수 누적을 검토하고, 제작 완료 수량을 최종 확정하는 화면입니다.
          </Typography>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Alert severity="info">
          이 화면의 계획 기간은 배정 시점의 계획을 그대로 보여줍니다. 작업기록과 검수 누적은 참고 정보이며, 제작 완료는
          사람이 별도로 확정합니다.
        </Alert>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <TextField
            select
            size="small"
            label="라인"
            value={selectedLineId}
            onChange={(event) => setSelectedLineId(event.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">전체 라인</MenuItem>
            {DUMMY_LINES.map((line) => (
              <MenuItem key={line.id} value={String(line.id)}>
                {line.name}
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

        <Stack spacing={1.5}>
          {filteredBatches.map((batch) => {
            const status = getStatus(batch);
            const statusMeta = STATUS_META[status];
            const progressPercent = getProgressPercent(batch.producedQty, batch.orderQty);
            const closeMode = batch.isCompleted ? getCloseMode(batch.closedQty, batch.orderQty) : null;
            const StatusIcon = statusMeta.icon;
            const canClose = status !== 'pending' && !batch.isCompleted;
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
                      width: `${batch.isCompleted ? 100 : progressPercent}%`,
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
                        {batch.orderNo}
                      </Typography>
                      <Typography variant="body2">{batch.styleName}</Typography>
                      {closeMode ? (
                        <Chip
                          size="small"
                          color={closeMode === 'FULL' ? 'success' : closeMode === 'OVER' ? 'info' : 'warning'}
                          label={getCloseModeLabel(closeMode)}
                        />
                      ) : null}
                    </Stack>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      배정 기간: {batch.plannedStart} ~ {batch.plannedEnd}
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
                        value={`${formatInt(batch.qcPassedTotal)}장`}
                        helper="QC 누적 기준"
                      />
                      <MetricBlock
                        label="진행도"
                        value={`${progressPercent}%`}
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
                        </>
                      ) : canClose ? (
                        <Button
                          variant={status === 'overdue' ? 'contained' : 'outlined'}
                          color={status === 'overdue' ? 'warning' : 'primary'}
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

                  {batch.processBreakdown.length > 0 ? (
                    <Stack spacing={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        공정별 참고수량
                      </Typography>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {batch.processBreakdown.map((process) => (
                          <Chip
                            key={`${batch.id}:${process.processName}`}
                            size="small"
                            variant="outlined"
                            label={`${process.processName} ${formatInt(process.qty)}장`}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  ) : null}

                  {isClosing ? (
                    <ClosePanel
                      batch={batch}
                      onConfirm={(qty) => handleConfirmClose(batch.id, qty)}
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
      </Stack>
    </AppPageContainer>
  );
};

export default BatchProgress;
