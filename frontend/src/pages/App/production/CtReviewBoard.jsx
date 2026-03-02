import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const STATUS_META = {
  PENDING:  { label: '대기',  color: 'default' },
  SENT:     { label: '제안',  color: 'info' },
  REJECTED: { label: '요청',  color: 'warning' },
  AGREED:   { label: '확정',  color: 'success' },
};

const STATUS_ORDER = {
  REJECTED: 0,
  SENT: 1,
  PENDING: 2,
  AGREED: 3,
};

const normalizeCtStatus = (value) => {
  if (value === 'SENT' || value === 'AGREED' || value === 'REJECTED') return value;
  return 'PENDING';
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
};

const formatSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '-';
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}초`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
};

const parseDateKey = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value.trim() + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return null;
  return date;
};
const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatScheduleDate = (baseDate, dayIndex) => {
  const index = toNonNegativeInt(dayIndex, 0);
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() + index);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`;
};

const formatScheduleDateValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`;
};

const formatScheduleRange = (baseDate, assignment) => {
  const startDateFromKey = parseDateKey(assignment?.startDateKey);
  const endDateFromKey = parseDateKey(assignment?.endDateKey);
  if (startDateFromKey) {
    let endDate = endDateFromKey;
    if (!endDate) {
      const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
      const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));
      endDate = new Date(startDateFromKey);
      endDate.setDate(endDate.getDate() + Math.max(0, endIndex - startIndex));
    }
    if (Number.isNaN(endDate.getTime()) || endDate < startDateFromKey) {
      endDate = new Date(startDateFromKey);
    }
    const startLabel = formatScheduleDateValue(startDateFromKey);
    const endLabel = formatScheduleDateValue(endDate);
    return toDateKey(startDateFromKey) === toDateKey(endDate)
      ? startLabel
      : `${startLabel} ~ ${endLabel}`;
  }

  const hasStart = Number.isFinite(Number(assignment?.startIndex));
  const hasEnd = Number.isFinite(Number(assignment?.endIndex));
  if (!hasStart || !hasEnd) return '-';

  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));
  if (startIndex === endIndex) return formatScheduleDate(baseDate, startIndex);
  return `${formatScheduleDate(baseDate, startIndex)} ~ ${formatScheduleDate(baseDate, endIndex)}`;
};

const parseDueDateTimestamp = (value) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const formatDueDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR');
};

const CtReviewBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lines, setLines] = useState([]);
  const [factories, setFactories] = useState([]);
  const [baseDate] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const [boardState, lineRows, factoryRows] = await Promise.all([
          requestJSON('/assignment-board-state' + query).catch(() => ({ cards: [], assignments: [] })),
          requestJSON('/lines' + query).catch(() => []),
          requestJSON('/factories' + query).catch(() => []),
        ]);

        if (cancelled) return;
        setCards(Array.isArray(boardState?.cards) ? boardState.cards : []);
        setAssignments(Array.isArray(boardState?.assignments) ? boardState.assignments : []);
        setLines(Array.isArray(lineRows) ? lineRows : []);
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
      } catch (error) {
        if (cancelled) return;
        setCards([]);
        setAssignments([]);
        setLines([]);
        setFactories([]);
        showNotification(error?.message || '배정 결과를 불러오지 못했습니다.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, showNotification]);

  const cardById = useMemo(
    () => new Map((Array.isArray(cards) ? cards : []).map((card) => [String(card.id), card])),
    [cards]
  );

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.id), line])),
    [lines]
  );

  const factoryById = useMemo(
    () =>
      new Map((Array.isArray(factories) ? factories : []).map((factory) => [String(factory.id), factory])),
    [factories]
  );

  const rows = useMemo(() => {
    return (Array.isArray(assignments) ? assignments : [])
      .map((assignment) => {
        const card = cardById.get(String(assignment?.cardId || '')) || null;
        const line = lineById.get(String(assignment?.lineId || '')) || null;
        const factory = line ? factoryById.get(String(line?.factoryId || '')) || null : null;
        const status = normalizeCtStatus(assignment?.ctStatus);
        const dueDate = card?.dueDate || null;
        const dueDateTimestamp = parseDueDateTimestamp(dueDate);

        return {
          id: assignment?.id,
          status,
          orderNo: card?.orderNo || '-',
          customer: card?.customer || '-',
          styleName: card?.styleName || card?.label || '-',
          colorName: card?.colorName || '',
          gender: card?.gender || '',
          quantity: toNonNegativeInt(assignment?.quantity ?? card?.quantity, 0),
          lineName: line?.name || `라인 ${assignment?.lineId || '-'}`,
          factoryName: factory?.name || '-',
          scheduleLabel: formatScheduleRange(baseDate, assignment),
          dueDate,
          dueDateTimestamp,
          proposalSeconds: Number(assignment?.proposalSeconds),
          contractedSeconds: Number(assignment?.contractedSeconds),
          agreedBy: assignment?.ctAgreedBy || '-',
          agreedAt: assignment?.ctAgreedAt || null,
        };
      })
      .sort((a, b) => {
        if (a.dueDateTimestamp == null && b.dueDateTimestamp != null) return 1;
        if (a.dueDateTimestamp != null && b.dueDateTimestamp == null) return -1;
        if (a.dueDateTimestamp != null && b.dueDateTimestamp != null && a.dueDateTimestamp !== b.dueDateTimestamp) {
          return a.dueDateTimestamp - b.dueDateTimestamp;
        }

        const statusOrderA = STATUS_ORDER[a.status] ?? 99;
        const statusOrderB = STATUS_ORDER[b.status] ?? 99;
        if (statusOrderA !== statusOrderB) return statusOrderA - statusOrderB;

        const lineCompare = String(a.lineName).localeCompare(String(b.lineName), undefined, { numeric: true });
        if (lineCompare !== 0) return lineCompare;

        return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      });
  }, [assignments, cardById, lineById, factoryById, baseDate]);

  const statusSummary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.total += 1;
          acc[row.status] += 1;
          return acc;
        },
        {
          total: 0,
          PENDING: 0,
          SENT: 0,
          REJECTED: 0,
          AGREED: 0,
        }
      ),
    [rows]
  );

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="h6">배정 결과</Typography>
            <Typography variant="body2" color="text.secondary">
              작업별 현재 상태와 주문/배정 정보를 조회합니다.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label={`전체 ${statusSummary.total}`} variant="outlined" />
            <Chip label={`대기 ${statusSummary.PENDING}`} variant="outlined" />
            <Chip label={`제안 ${statusSummary.SENT}`} color="info" variant="outlined" />
            <Chip label={`요청 ${statusSummary.REJECTED}`} color="warning" variant="outlined" />
            <Chip label={`확정 ${statusSummary.AGREED}`} color="success" variant="outlined" />
          </Stack>
        </Box>
      }
    >
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 720 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>상태</TableCell>
                <TableCell>주문 정보</TableCell>
                <TableCell align="right">수량</TableCell>
                <TableCell>라인 / 공장</TableCell>
                <TableCell>일정</TableCell>
                <TableCell>납기일</TableCell>
                <TableCell align="right">제안 CT(전체)</TableCell>
                <TableCell align="right">확정 CT(전체)</TableCell>
                <TableCell>동의 정보</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow colSpan={9} message="불러오는 중..." sx={{ py: 2 }} />
              ) : rows.length === 0 ? (
                <TableStatusRow colSpan={9} message="표시할 배정 결과가 없습니다." sx={{ py: 2 }} />
              ) : (
                rows.map((row) => {
                  const statusMeta = STATUS_META[row.status] || STATUS_META.PENDING;
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Chip size="small" label={statusMeta.label} color={statusMeta.color} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          [{row.orderNo}] {row.customer}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.styleName}
                          {row.colorName ? ` · ${row.colorName}` : ''}
                          {row.gender ? ` · ${row.gender}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatNumberWithCommas(row.quantity, { fallback: '0', maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.lineName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.factoryName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.scheduleLabel}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDueDate(row.dueDate)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{formatSeconds(row.proposalSeconds)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {row.status === 'AGREED' ? formatSeconds(row.contractedSeconds) : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.status === 'AGREED' ? row.agreedBy : '-'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.status === 'AGREED' ? formatDateTime(row.agreedAt) : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppPageContainer>
  );
};

export default CtReviewBoard;
