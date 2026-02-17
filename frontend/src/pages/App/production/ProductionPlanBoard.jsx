import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
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
  PENDING: { label: 'CT 대기', color: 'default' },
  AGREED: { label: 'CT 동의', color: 'success' },
  REJECTED: { label: '조정 요청', color: 'warning' },
};

const normalizeCtStatus = (value) => {
  if (value === 'AGREED' || value === 'REJECTED') return value;
  return 'PENDING';
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
};

const formatScheduleDate = (baseDate, dayIndex) => {
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + toNonNegativeInt(dayIndex, 0));
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][target.getDay()];
  return `${target.getMonth() + 1}/${target.getDate()} (${weekday})`;
};

const formatScheduleRange = (baseDate, assignment) => {
  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));
  if (startIndex === endIndex) {
    return formatScheduleDate(baseDate, startIndex);
  }
  return `${formatScheduleDate(baseDate, startIndex)} ~ ${formatScheduleDate(baseDate, endIndex)}`;
};

const resolveSecondsForProposal = (assignment) => {
  const proposalSeconds = Number(assignment?.proposalSeconds);
  if (Number.isFinite(proposalSeconds) && proposalSeconds > 0) return proposalSeconds;
  const totalSeconds = Number(assignment?.totalSeconds);
  if (Number.isFinite(totalSeconds) && totalSeconds > 0) return totalSeconds;
  return 0;
};

const resolveAgreedSeconds = (assignment) => {
  const contractedSeconds = Number(assignment?.contractedSeconds);
  if (Number.isFinite(contractedSeconds) && contractedSeconds > 0) return contractedSeconds;
  return resolveSecondsForProposal(assignment);
};

const formatCurrencyDong = (value) =>
  `${formatNumberWithCommas(value, { fallback: '0', maximumFractionDigits: 2 })} 동`;

const ProductionPlanBoard = () => {
  const { showNotification } = useApp();
  const { devBypass, devProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState(null);
  const [cards, setCards] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lines, setLines] = useState([]);
  const [factories, setFactories] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [baseDate] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const activeOrgId = useMemo(() => {
    if (!devBypass) return null;
    const parsed = Number(devProfile?.orgId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [devBypass, devProfile?.orgId]);

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.id), line])),
    [lines]
  );
  const factoryById = useMemo(
    () => new Map((Array.isArray(factories) ? factories : []).map((factory) => [String(factory.id), factory])),
    [factories]
  );

  const assignmentsForView = useMemo(() => {
    return (Array.isArray(assignments) ? assignments : [])
      .map((assignment) => {
        const line = lineById.get(String(assignment?.lineId || '')) || null;
        const factory = line ? factoryById.get(String(line.factoryId)) || null : null;
        const status = normalizeCtStatus(assignment?.ctStatus);
        const proposalSeconds = resolveSecondsForProposal(assignment);
        const agreedSeconds = resolveAgreedSeconds(assignment);
        const wagePerSecond = Number(factory?.wagePerSecond);
        const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;
        const expectedCost = validWage ? proposalSeconds * wagePerSecond : null;
        const agreedCost = validWage && status === 'AGREED' ? agreedSeconds * wagePerSecond : null;

        return {
          ...assignment,
          line,
          factory,
          status,
          proposalSeconds,
          agreedSeconds,
          wagePerSecond: validWage ? wagePerSecond : null,
          expectedCost,
          agreedCost,
        };
      })
      .sort((a, b) => {
        const lineCompare = String(a?.line?.name || a?.lineId || '').localeCompare(
          String(b?.line?.name || b?.lineId || ''),
          undefined,
          { numeric: true }
        );
        if (lineCompare !== 0) return lineCompare;
        const startCompare = toNonNegativeInt(a?.startIndex, 0) - toNonNegativeInt(b?.startIndex, 0);
        if (startCompare !== 0) return startCompare;
        return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, { numeric: true });
      });
  }, [assignments, lineById, factoryById]);

  const statusSummary = useMemo(
    () =>
      assignmentsForView.reduce(
        (acc, assignment) => {
          const status = normalizeCtStatus(assignment?.status);
          if (status === 'AGREED') acc.agreed += 1;
          else if (status === 'REJECTED') acc.rejected += 1;
          else acc.pending += 1;
          return acc;
        },
        { pending: 0, agreed: 0, rejected: 0 }
      ),
    [assignmentsForView]
  );

  const selectedAssignment = useMemo(() => {
    if (!selectedAssignmentId) return assignmentsForView[0] || null;
    return assignmentsForView.find((item) => String(item.id) === String(selectedAssignmentId)) || null;
  }, [assignmentsForView, selectedAssignmentId]);

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

        const nextCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
        const nextAssignments = Array.isArray(boardState?.assignments) ? boardState.assignments : [];
        setCards(nextCards);
        setAssignments(nextAssignments);
        setLines(Array.isArray(lineRows) ? lineRows : []);
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
        setSelectedAssignmentId((prev) => {
          if (!prev) return nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
          const exists = nextAssignments.some((item) => String(item?.id) === String(prev));
          return exists ? prev : nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
        });
      } catch (_error) {
        if (!cancelled) {
          setCards([]);
          setAssignments([]);
          setLines([]);
          setFactories([]);
          setSelectedAssignmentId('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const persistBoardState = useCallback(
    async (nextAssignments) => {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards, assignments: nextAssignments }),
      });
      setAssignments(nextAssignments);
    },
    [activeOrgId, cards]
  );

  const handleAgree = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    if (!target) return;

    const now = new Date().toISOString();
    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== String(assignmentId)) return item;

      return {
        ...item,
        ctStatus: 'AGREED',
        contractedSeconds:
          toNonNegativeInt(item?.contractedSeconds, 0) > 0
            ? toNonNegativeInt(item?.contractedSeconds, 0)
            : Math.max(1, toNonNegativeInt(resolveSecondsForProposal(item), 1)),
        ctSource: item?.ctSource || item?.proposalBasis || item?.basis || 'MANUAL',
        ctAgreedBy: item?.ctAgreedBy || 'LINE_LEADER',
        ctAgreedAt: now,
      };
    });

    setSavingAssignmentId(String(assignmentId));
    try {
      await persistBoardState(nextAssignments);
      showNotification('작업 계획이 동의 처리되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '작업 계획 동의 처리에 실패했습니다.', 'error');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const handleRequestAdjustment = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    if (!target) return;

    const confirmMessage =
      '조정 요청 시 해당 작업은 라인 배정에서 해제되고 미배정 카드로 돌아갑니다. 진행할까요?';
    if (!window.confirm(confirmMessage)) return;

    const nextAssignments = assignments.filter(
      (item) => String(item?.id) !== String(assignmentId)
    );

    setSavingAssignmentId(String(assignmentId));
    try {
      await persistBoardState(nextAssignments);
      setSelectedAssignmentId((prev) => {
        if (String(prev) !== String(assignmentId)) return prev;
        return nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
      });
      showNotification(
        '조정 요청이 등록되었습니다. 해당 작업은 미배정 카드로 되돌아갔습니다.',
        'info'
      );
    } catch (error) {
      showNotification(error?.message || '조정 요청 처리에 실패했습니다.', 'error');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">작업 계획 협의</Typography>
            <Typography variant="body2" color="text.secondary">
              라인 배정 작업의 일정/비용을 검토하고 CT 동의 또는 조정 요청을 처리합니다.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label={`CT 대기 ${statusSummary.pending}`} />
            <Chip label={`CT 동의 ${statusSummary.agreed}`} color="success" variant="outlined" />
            <Chip label={`조정 요청 ${statusSummary.rejected}`} color="warning" variant="outlined" />
          </Stack>
        </Box>
      }
    >
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>상태</TableCell>
                    <TableCell>라인</TableCell>
                    <TableCell>고객/스타일</TableCell>
                    <TableCell align="right">수량</TableCell>
                    <TableCell>예상 일정</TableCell>
                    <TableCell align="right">예상 비용</TableCell>
                    <TableCell align="right">처리</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableStatusRow colSpan={7} message="불러오는 중..." sx={{ py: 2 }} />
                  ) : assignmentsForView.length === 0 ? (
                    <TableStatusRow colSpan={7} message="검토할 배정 작업이 없습니다." sx={{ py: 2 }} />
                  ) : (
                    assignmentsForView.map((assignment) => {
                      const statusMeta = STATUS_META[assignment.status] || STATUS_META.PENDING;
                      const rowSelected = String(selectedAssignment?.id || '') === String(assignment.id);
                      const rowBusy = String(savingAssignmentId || '') === String(assignment.id);

                      return (
                        <TableRow
                          key={assignment.id}
                          hover
                          selected={rowSelected}
                          onClick={() => setSelectedAssignmentId(String(assignment.id))}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Chip
                              size="small"
                              label={statusMeta.label}
                              color={statusMeta.color}
                              variant={assignment.status === 'PENDING' ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment?.line?.name || `라인 ${assignment.lineId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {assignment?.factory?.name || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment.customer || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {assignment.label || '-'}
                              {assignment.colorName ? ` · ${assignment.colorName}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {formatNumberWithCommas(assignment.quantity, {
                              fallback: '-',
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell>{formatScheduleRange(baseDate, assignment)}</TableCell>
                          <TableCell align="right">
                            {assignment.expectedCost == null ? '-' : formatCurrencyDong(assignment.expectedCost)}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="contained"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAgree(assignment.id);
                                }}
                                disabled={rowBusy || assignment.status === 'AGREED'}
                              >
                                {assignment.status === 'AGREED' ? '동의됨' : '동의'}
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRequestAdjustment(assignment.id);
                                }}
                                disabled={rowBusy}
                              >
                                조정 요청
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack spacing={1.5}>
            {selectedAssignment ? (
              <>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    작업 상세
                  </Typography>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>고객:</strong> {selectedAssignment.customer || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>스타일:</strong> {selectedAssignment.label || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>색상/성별:</strong>{' '}
                      {selectedAssignment.colorName || '-'}
                      {selectedAssignment.gender ? ` / ${selectedAssignment.gender}` : ''}
                    </Typography>
                    <Typography variant="body2">
                      <strong>수량:</strong>{' '}
                      {formatNumberWithCommas(selectedAssignment.quantity, {
                        fallback: '-',
                        maximumFractionDigits: 0,
                      })}
                    </Typography>
                    <Typography variant="body2">
                      <strong>라인:</strong>{' '}
                      {selectedAssignment?.line?.name || `라인 ${selectedAssignment.lineId}`}
                    </Typography>
                    <Typography variant="body2">
                      <strong>공장:</strong> {selectedAssignment?.factory?.name || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>예상 일정:</strong> {formatScheduleRange(baseDate, selectedAssignment)}
                    </Typography>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    비용 리스트
                  </Typography>
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        CT 제안 시간
                      </Typography>
                      <Typography variant="body2">
                        {formatNumberWithCommas(selectedAssignment.proposalSeconds, {
                          fallback: '0',
                          maximumFractionDigits: 0,
                        })}{' '}
                        초
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        CT 합의 시간
                      </Typography>
                      <Typography variant="body2">
                        {selectedAssignment.status === 'AGREED'
                          ? `${formatNumberWithCommas(selectedAssignment.agreedSeconds, {
                              fallback: '0',
                              maximumFractionDigits: 0,
                            })} 초`
                          : '-'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        초당 공임
                      </Typography>
                      <Typography variant="body2">
                        {selectedAssignment.wagePerSecond == null
                          ? '미설정'
                          : `${formatNumberWithCommas(selectedAssignment.wagePerSecond, {
                              fallback: '0',
                              maximumFractionDigits: 2,
                            })} 동/초`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        예상 비용
                      </Typography>
                      <Typography variant="body2">
                        {selectedAssignment.expectedCost == null
                          ? '-'
                          : formatCurrencyDong(selectedAssignment.expectedCost)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        합의 비용
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedAssignment.status !== 'AGREED' || selectedAssignment.agreedCost == null
                          ? '-'
                          : formatCurrencyDong(selectedAssignment.agreedCost)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </>
            ) : (
              <Alert severity="info">왼쪽 목록에서 배정 작업을 선택해 주세요.</Alert>
            )}
            <Alert severity="warning">
              조정 요청을 선택하면 해당 배정은 즉시 해제되어 작업 배정 화면의 미배정 카드로 되돌아갑니다.
            </Alert>
          </Stack>
        </Grid>
      </Grid>
    </AppPageContainer>
  );
};

export default ProductionPlanBoard;
