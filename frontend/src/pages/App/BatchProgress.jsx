import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AppPageContainer from '../../components/AppPageContainer';

// ─── 더미 데이터 ─────────────────────────────────────────────────────────────
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
    styleName: '재킷 A형',
    plannedStart: '2026-04-01',
    plannedEnd: '2026-04-09',
    orderQty: 140,
    producedQty: 128,
    // 공정별 수량 (공정 합의 최솟값 = 완성 수량)
    processBreakdown: [
      { processName: '재단', qty: 140 },
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
    styleName: '블라우스 B형',
    plannedStart: '2026-04-10',
    plannedEnd: '2026-04-19',
    orderQty: 200,
    producedQty: 200,
    processBreakdown: [
      { processName: '재단', qty: 205 },
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
    styleName: '바지 C형',
    plannedStart: '2026-04-20',
    plannedEnd: '2026-04-27',
    orderQty: 80,
    producedQty: 0,
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
    styleName: '스커트 D형',
    plannedStart: '2026-04-01',
    plannedEnd: '2026-04-15',
    orderQty: 300,
    producedQty: 312,
    processBreakdown: [
      { processName: '재단', qty: 320 },
      { processName: '봉제', qty: 312 },
    ],
    isCompleted: true,
    completedAt: '2026-04-30',
    closedQty: 300,
  },
];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
const today = '2026-04-30';

const getStatus = (batch) => {
  if (batch.isCompleted) return 'completed';
  if (batch.plannedEnd < today) return 'overdue';
  if (batch.plannedStart <= today) return 'active';
  return 'pending';
};

const STATUS_LABEL = {
  completed: '완료',
  overdue: '지연',
  active: '진행중',
  pending: '대기',
};
const STATUS_COLOR = {
  completed: 'success',
  overdue: 'warning',
  active: 'primary',
  pending: 'default',
};

const progressPercent = (produced, order) => {
  if (!order || order <= 0) return 0;
  return Math.min(100, Math.round((produced / order) * 100));
};

// ─── 완료 확인 다이얼로그 대신 인라인 확인 패널 ──────────────────────────────
const ClosePanel = ({ batch, onClose, onCancel }) => {
  const [qty, setQty] = useState(String(batch.producedQty));

  return (
    <Box sx={{ bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mt: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        생산 완료 확정 — 최종 수량을 확인하세요.
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <TextField
          label="확정 수량"
          size="small"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          sx={{ width: 120 }}
        />
        <Typography variant="body2" color="text.secondary">
          / 주문 {batch.orderQty}장
          {Number(qty) > batch.orderQty && (
            <Box component="span" sx={{ color: 'warning.main', ml: 0.5 }}>
              (초과 생산)
            </Box>
          )}
          {Number(qty) < batch.orderQty && (
            <Box component="span" sx={{ color: 'warning.main', ml: 0.5 }}>
              (미달 — 운영 판단으로 완료)
            </Box>
          )}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          color="success"
          onClick={() => onClose(Number(qty))}
          startIcon={<CheckCircleOutlineIcon />}
        >
          생산 완료 확정
        </Button>
        <Button variant="outlined" size="small" onClick={onCancel}>
          취소
        </Button>
      </Stack>
    </Box>
  );
};

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
const BatchProgress = () => {
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [batches, setBatches] = useState(DUMMY_BATCHES);
  const [closingId, setClosingId] = useState(null);

  const filtered = batches.filter(
    (b) => selectedLineId === 'all' || String(b.lineId) === String(selectedLineId)
  );

  const handleConfirmClose = (batchId, qty) => {
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId
          ? { ...b, isCompleted: true, completedAt: today, closedQty: qty }
          : b
      )
    );
    setClosingId(null);
  };

  return (
    <AppPageContainer
      title="배정 진행도 / 생산 완료"
      subtitle="배정된 작업 카드별 생산 수량을 확인하고, 완료된 배치를 확정합니다."
    >
      {/* 필터 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField
          select
          label="라인"
          size="small"
          value={selectedLineId}
          onChange={(e) => setSelectedLineId(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">전체 라인</MenuItem>
          {DUMMY_LINES.map((line) => (
            <MenuItem key={line.id} value={String(line.id)}>
              {line.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          진행중 {filtered.filter((b) => getStatus(b) === 'active').length}건 ·
          지연 {filtered.filter((b) => getStatus(b) === 'overdue').length}건 ·
          완료 {filtered.filter((b) => b.isCompleted).length}건
        </Typography>
      </Stack>

      {/* 카드 목록 */}
      <Stack spacing={1.5}>
        {filtered.map((batch) => {
          const status = getStatus(batch);
          const pct = progressPercent(batch.producedQty, batch.orderQty);
          const isClosing = closingId === batch.id;

          return (
            <Paper key={batch.id} variant="outlined" sx={{ p: 2 }}>
              {/* 헤더 행 */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Chip
                  label={STATUS_LABEL[status]}
                  color={STATUS_COLOR[status]}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  {batch.lineName}
                </Typography>
                <Typography variant="subtitle2" fontWeight={600}>
                  {batch.orderNo}
                </Typography>
                <Typography variant="body2">{batch.styleName}</Typography>
                <Box sx={{ flex: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  배정 기간: {batch.plannedStart} ~ {batch.plannedEnd}
                </Typography>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              {/* 수량 + 진행도 */}
              <Stack direction="row" spacing={3} alignItems="center">
                <Box sx={{ minWidth: 200 }}>
                  <Stack direction="row" spacing={0.5} alignItems="baseline">
                    <Typography variant="h6" fontWeight={700}>
                      {batch.producedQty}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      / {batch.orderQty}장 주문
                    </Typography>
                    {batch.producedQty > batch.orderQty && (
                      <Chip label="+초과" color="info" size="small" sx={{ ml: 0.5 }} />
                    )}
                  </Stack>
                  <Box sx={{ mt: 0.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      color={pct >= 100 ? 'success' : status === 'overdue' ? 'warning' : 'primary'}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {pct}% 생산됨
                    </Typography>
                  </Box>
                </Box>

                {/* 공정별 상세 */}
                {batch.processBreakdown.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      공정별 수량
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {batch.processBreakdown.map((p) => (
                        <Chip
                          key={p.processName}
                          label={`${p.processName} ${p.qty}`}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                <Box sx={{ flex: 1 }} />

                {/* 완료 버튼 or 완료 상태 */}
                {batch.isCompleted ? (
                  <Stack alignItems="flex-end" spacing={0.5}>
                    <Chip
                      icon={<CheckCircleOutlineIcon />}
                      label="생산 완료"
                      color="success"
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {batch.completedAt} · 확정 {batch.closedQty}장
                    </Typography>
                  </Stack>
                ) : (
                  <Button
                    variant={status === 'overdue' ? 'contained' : 'outlined'}
                    color={status === 'overdue' ? 'warning' : 'primary'}
                    size="small"
                    startIcon={status === 'overdue' ? <WarningAmberIcon /> : <CheckCircleOutlineIcon />}
                    onClick={() => setClosingId(isClosing ? null : batch.id)}
                  >
                    생산 완료
                  </Button>
                )}
              </Stack>

              {/* 완료 확인 패널 (인라인) */}
              {isClosing && (
                <ClosePanel
                  batch={batch}
                  onClose={(qty) => handleConfirmClose(batch.id, qty)}
                  onCancel={() => setClosingId(null)}
                />
              )}
            </Paper>
          );
        })}

        {filtered.length === 0 && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">배정된 카드가 없습니다.</Typography>
          </Paper>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default BatchProgress;
