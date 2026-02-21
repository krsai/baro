import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
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
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { normalizeProcesses } from '../../../utils/processTime';

const formatCurrencyDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} 동`;

const formatSeconds = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${formatNumberWithCommas(n, { fallback: '0', maximumFractionDigits: 2 })} 초`;
};

const formatDays = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${formatNumberWithCommas(n, { fallback: '0', maximumFractionDigits: 2 })} 일`;
};

const formatPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const calcDivergence = (proposed, base) => {
  const p = Number(proposed);
  const b = Number(base);
  if (!Number.isFinite(p) || !Number.isFinite(b) || b === 0) return null;
  return ((p - b) / b) * 100;
};

const CtReviewBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lines, setLines] = useState([]);
  const [factories, setFactories] = useState([]);
  const [styles, setStyles] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedStyleId, setExpandedStyleId] = useState(null);
  const [actioningId, setActioningId] = useState(null);

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((l) => [String(l.id), l])),
    [lines]
  );
  const factoryById = useMemo(
    () => new Map((Array.isArray(factories) ? factories : []).map((f) => [String(f.id), f])),
    [factories]
  );
  const cardById = useMemo(
    () => new Map((Array.isArray(cards) ? cards : []).map((c) => [String(c.id), c])),
    [cards]
  );

  // 스타일별 CT 현황: CT가 하나라도 설정된 스타일 + AT vs CT 괴리율
  const styleCtSummaries = useMemo(() => {
    return (Array.isArray(styles) ? styles : [])
      .map((style) => {
        const processes = normalizeProcesses(style.processes);
        const ctProcesses = processes.filter(
          (p) => p.ct != null && Number.isFinite(Number(p.ct)) && Number(p.ct) > 0
        );
        if (ctProcesses.length === 0) return null;

        const totalCt = ctProcesses.reduce((sum, p) => sum + Number(p.ct), 0);
        const totalAt = ctProcesses
          .filter((p) => p.at != null && Number.isFinite(Number(p.at)) && Number(p.at) > 0)
          .reduce((sum, p) => sum + Number(p.at), 0);
        const atVsCtDivergence = totalCt > 0 && totalAt > 0
          ? ((totalAt - totalCt) / totalCt) * 100
          : null;
        const needsReview = atVsCtDivergence != null && Math.abs(atVsCtDivergence) >= 10;

        return {
          id: style.id,
          name: style.name || '-',
          styleCode: style.styleCode || style.id || '-',
          customer: style.customer || '-',
          totalCt,
          totalAt: totalAt > 0 ? totalAt : null,
          atVsCtDivergence,
          needsReview,
          ctProcessCount: ctProcesses.length,
          processDetails: ctProcesses.map((p) => ({
            name: p.name || p.code || '-',
            ct: Number(p.ct),
            at: p.at != null ? Number(p.at) : null,
            divergence: p.at != null && Number(p.ct) > 0
              ? ((Number(p.at) - Number(p.ct)) / Number(p.ct)) * 100
              : null,
          })),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.needsReview && !b.needsReview) return -1;
        if (!a.needsReview && b.needsReview) return 1;
        return (b.atVsCtDivergence == null ? -999 : Math.abs(b.atVsCtDivergence)) -
               (a.atVsCtDivergence == null ? -999 : Math.abs(a.atVsCtDivergence));
      });
  }, [styles]);

  const agreedItems = useMemo(() => {
    return (Array.isArray(assignments) ? assignments : [])
      .filter((a) => String(a?.ctStatus || '').toUpperCase() === 'AGREED')
      .map((assignment) => {
        const card = cardById.get(String(assignment?.cardId || '')) || null;
        const line = lineById.get(String(assignment?.lineId || '')) || null;
        const factory = line ? factoryById.get(String(line.factoryId)) || null : null;
        return { ...assignment, card, line, factory };
      })
      .sort((a, b) => new Date(b.ctAgreedAt || 0) - new Date(a.ctAgreedAt || 0));
  }, [assignments, cardById, lineById, factoryById]);

  const reviewItems = useMemo(() => {
    return (Array.isArray(assignments) ? assignments : [])
      .filter((a) => String(a?.ctStatus || '').toUpperCase() === 'REJECTED')
      .map((assignment) => {
        const card = cardById.get(String(assignment?.cardId || '')) || null;
        const line = lineById.get(String(assignment?.lineId || '')) || null;
        const factory = line ? factoryById.get(String(line.factoryId)) || null : null;
        const proposal = card?.pendingCtProposal || null;
        return { ...assignment, card, line, factory, proposal };
      })
      .sort(
        (a, b) =>
          new Date(b.proposal?.requestedAt || 0) - new Date(a.proposal?.requestedAt || 0)
      );
  }, [assignments, cardById, lineById, factoryById]);

  const persistBoardState = useCallback(
    async (nextAssignments, nextCards = cards) => {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCards, assignments: nextAssignments }),
      });
      setCards(nextCards);
      setAssignments(nextAssignments);
    },
    [activeOrgId, cards]
  );

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const [boardState, lineRows, factoryRows, styleRows] = await Promise.all([
          requestJSON('/assignment-board-state' + query).catch(() => ({ cards: [], assignments: [] })),
          requestJSON('/lines' + query).catch(() => []),
          requestJSON('/factories' + query).catch(() => []),
          fetchStylesFromApi({ orgId: activeOrgId }).catch(() => []),
        ]);
        if (cancelled) return;
        setCards(Array.isArray(boardState?.cards) ? boardState.cards : []);
        setAssignments(Array.isArray(boardState?.assignments) ? boardState.assignments : []);
        setLines(Array.isArray(lineRows) ? lineRows : []);
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
        setStyles(Array.isArray(styleRows) ? styleRows : []);
      } catch (_error) {
        if (!cancelled) {
          setCards([]);
          setAssignments([]);
          setLines([]);
          setFactories([]);
          setStyles([]);
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

  const handleApprove = async (item) => {
    if (actioningId) return;
    const proposal = item.proposal;
    const contractedSeconds = Number(proposal?.totalProposedSeconds);
    if (!Number.isFinite(contractedSeconds) || contractedSeconds <= 0) {
      showNotification('제안 CT 데이터가 유효하지 않습니다.', 'error');
      return;
    }

    const now = new Date().toISOString();
    const nextAssignments = assignments.map((a) =>
      String(a?.id) !== String(item.id)
        ? a
        : {
            ...a,
            ctStatus: 'AGREED',
            contractedSeconds,
            ctSource: 'LINE_LEADER_PROPOSAL',
            ctAgreedBy: 'OPERATOR',
            ctAgreedAt: now,
            ctNote: null,
          }
    );
    const nextCards = item?.cardId
      ? cards.map((c) =>
          String(c?.id) === String(item.cardId) ? { ...c, pendingCtProposal: null } : c
        )
      : cards;

    setActioningId(String(item.id));
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification('CT 제안이 승인되었습니다. 작업 계획 협의에서 동의 처리하세요.', 'success');
    } catch (error) {
      showNotification(error?.message || '승인 처리에 실패했습니다.', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (item) => {
    if (actioningId) return;
    if (
      !window.confirm(
        'CT 제안을 거부하면 해당 배정이 취소되어 미배정 상태로 전환됩니다. 진행할까요?'
      )
    )
      return;

    const nextAssignments = assignments.filter((a) => String(a?.id) !== String(item.id));
    const nextCards = item?.cardId
      ? cards.map((c) =>
          String(c?.id) === String(item.cardId) ? { ...c, pendingCtProposal: null } : c
        )
      : cards;

    setActioningId(String(item.id));
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification('CT 제안이 거부되었습니다. 배정이 취소되어 미배정 상태로 전환됩니다.', 'info');
    } catch (error) {
      showNotification(error?.message || '거부 처리에 실패했습니다.', 'error');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">CT 조정 검토</Typography>
            <Typography variant="body2" color="text.secondary">
              라인장이 요청한 CT 조정 제안을 검토하고 승인 또는 거부합니다.
            </Typography>
          </Box>
          <Chip
            label={`검토 대기 ${reviewItems.length}건`}
            color={reviewItems.length > 0 ? 'warning' : 'default'}
            variant="outlined"
          />
        </Box>
      }
    >
      <Stack spacing={2}>
        {!loading && reviewItems.length === 0 && (
          <Alert severity="success">검토 대기 중인 CT 조정 요청이 없습니다.</Alert>
        )}

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              운영팀 검토 대기 목록
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>라인 / 공장</TableCell>
                  <TableCell>고객 / 스타일</TableCell>
                  <TableCell align="right">수량</TableCell>
                  <TableCell align="right">기본 CT (한벌)</TableCell>
                  <TableCell align="right">제안 CT (한벌)</TableCell>
                  <TableCell align="right">CT 괴리율</TableCell>
                  <TableCell align="right">예상 비용</TableCell>
                  <TableCell>요청 일시</TableCell>
                  <TableCell align="center">처리</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow colSpan={9} message="불러오는 중..." sx={{ py: 2 }} />
                ) : reviewItems.length === 0 ? (
                  <TableStatusRow colSpan={9} message="검토할 항목이 없습니다." sx={{ py: 2 }} />
                ) : (
                  reviewItems.map((item) => {
                    const busy = actioningId === String(item.id);
                    const expanded = expandedId === String(item.id);
                    const proposal = item.proposal;

                    return (
                      <React.Fragment key={item.id}>
                        <TableRow
                          hover
                          selected={expanded}
                          sx={{ cursor: 'pointer' }}
                          onClick={() =>
                            setExpandedId((prev) =>
                              prev === String(item.id) ? null : String(item.id)
                            )
                          }
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {item?.line?.name || `라인 ${item.lineId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item?.factory?.name || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {item.customer || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.label || '-'}
                              {item.colorName ? ` · ${item.colorName}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {formatNumberWithCommas(proposal?.quantity ?? item.quantity, {
                              fallback: '-',
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell align="right">
                            {formatSeconds(proposal?.totalBasePerPieceSeconds)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ fontWeight: 700, color: 'warning.dark' }}
                          >
                            {formatSeconds(proposal?.totalProposedPerPieceSeconds)}
                          </TableCell>
                          <TableCell align="right">
                            {(() => {
                              const div = calcDivergence(
                                proposal?.totalProposedPerPieceSeconds,
                                proposal?.totalBasePerPieceSeconds
                              );
                              if (div == null) return '-';
                              const color = div > 0 ? 'error.main' : 'success.main';
                              return (
                                <Typography variant="body2" sx={{ color, fontWeight: 700 }}>
                                  {formatPercent(div)}
                                </Typography>
                              );
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            {proposal?.expectedCost == null
                              ? '-'
                              : formatCurrencyDong(proposal.expectedCost)}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {proposal?.requestedAt
                                ? new Date(proposal.requestedAt).toLocaleString('ko-KR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })
                                : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                            <Stack direction="row" spacing={0.5} justifyContent="center">
                              <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                disabled={busy}
                                onClick={() => handleApprove(item)}
                              >
                                승인
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={busy}
                                onClick={() => handleReject(item)}
                              >
                                거부
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>

                        {/* 공정 상세 펼치기 */}
                        <TableRow>
                          <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                            <Collapse in={expanded} unmountOnExit>
                              <Box
                                sx={{
                                  px: 3,
                                  py: 2,
                                  bgcolor: 'grey.50',
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    mb: 1.5,
                                  }}
                                >
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    공정별 CT 제안 상세
                                  </Typography>
                                  {proposal?.directProposalCount > 0 && (
                                    <Chip
                                      size="small"
                                      label={`라인장 직접 입력 ${proposal.directProposalCount}건`}
                                      color="warning"
                                      variant="outlined"
                                    />
                                  )}
                                </Box>

                                {Array.isArray(proposal?.processes) &&
                                proposal.processes.length > 0 ? (
                                  <TableContainer>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>#</TableCell>
                                          <TableCell>공정</TableCell>
                                          <TableCell align="right">공정수</TableCell>
                                          <TableCell align="right">기본 CT(초)</TableCell>
                                          <TableCell align="right">제안 CT(초)</TableCell>
                                          <TableCell align="right">한 벌 제안 CT(초)</TableCell>
                                          <TableCell align="center">라인장 제안</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {proposal.processes.map((proc, idx) => (
                                          <TableRow key={proc.processKey || idx}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell>{proc.name || proc.processKey}</TableCell>
                                            <TableCell align="right">
                                              {proc.quantity ?? 1}
                                            </TableCell>
                                            <TableCell align="right">
                                              {formatSeconds(proc.baseSeconds)}
                                            </TableCell>
                                            <TableCell
                                              align="right"
                                              sx={{
                                                fontWeight: proc.hasLineLeaderProposal ? 700 : 400,
                                                color: proc.hasLineLeaderProposal
                                                  ? 'warning.dark'
                                                  : 'inherit',
                                              }}
                                            >
                                              {formatSeconds(proc.proposedSeconds)}
                                            </TableCell>
                                            <TableCell align="right">
                                              {formatSeconds(proc.proposedPerPieceSeconds)}
                                            </TableCell>
                                            <TableCell align="center">
                                              {proc.hasLineLeaderProposal ? (
                                                <Chip
                                                  size="small"
                                                  label="제안"
                                                  color="warning"
                                                  variant="outlined"
                                                />
                                              ) : (
                                                '-'
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                        <TableRow>
                                          <TableCell
                                            colSpan={5}
                                            align="right"
                                            sx={{ fontWeight: 700 }}
                                          >
                                            합계 (한 벌 CT)
                                          </TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatSeconds(proposal.totalProposedPerPieceSeconds)}
                                          </TableCell>
                                          <TableCell />
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    공정 상세 데이터가 없습니다.
                                  </Typography>
                                )}

                                <Stack
                                  direction="row"
                                  spacing={2}
                                  sx={{ mt: 2 }}
                                  divider={<Divider orientation="vertical" flexItem />}
                                >
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      예상 기간
                                    </Typography>
                                    <Typography variant="body2">
                                      {formatDays(proposal?.totalDurationDays)}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      총 예상 공임
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                      {proposal?.expectedCost == null
                                        ? '-'
                                        : formatCurrencyDong(proposal.expectedCost)}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      1인당 예상 공임
                                    </Typography>
                                    <Typography variant="body2">
                                      {proposal?.expectedPerPerson == null
                                        ? '-'
                                        : formatCurrencyDong(proposal.expectedPerPerson)}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      월 환산 1인 공임
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                      {proposal?.expectedMonthlyPerPerson == null
                                        ? '-'
                                        : formatCurrencyDong(proposal.expectedMonthlyPerPerson)}
                                    </Typography>
                                  </Box>
                                </Stack>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        {/* ── CT 동의 완료 목록 ── */}
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              CT 동의 완료 목록
            </Typography>
            <Chip
              size="small"
              label={`${agreedItems.length}건`}
              color={agreedItems.length > 0 ? 'success' : 'default'}
              variant="outlined"
            />
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>라인 / 공장</TableCell>
                  <TableCell>고객 / 스타일</TableCell>
                  <TableCell align="right">수량</TableCell>
                  <TableCell align="right">합의 CT (전체)</TableCell>
                  <TableCell>동의 주체</TableCell>
                  <TableCell>동의 일시</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow colSpan={6} message="불러오는 중..." sx={{ py: 2 }} />
                ) : agreedItems.length === 0 ? (
                  <TableStatusRow colSpan={6} message="CT 동의 완료된 배정이 없습니다." sx={{ py: 2 }} />
                ) : (
                  agreedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item?.line?.name || `라인 ${item.lineId}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item?.factory?.name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.customer || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.label || '-'}
                          {item.colorName ? ` · ${item.colorName}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatNumberWithCommas(item.quantity, {
                          fallback: '-',
                          maximumFractionDigits: 0,
                        })}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatSeconds(item.contractedSeconds)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.ctAgreedBy === 'OPERATOR' ? '운영팀 승인' : '라인장 동의'}
                          color={item.ctAgreedBy === 'OPERATOR' ? 'primary' : 'success'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {item.ctAgreedAt
                            ? new Date(item.ctAgreedAt).toLocaleString('ko-KR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* ── 스타일 CT 버전 현황 ── */}
        {styleCtSummaries.length > 0 && (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{
                px: 2,
                py: 1.25,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                스타일별 CT 현황 (AT vs 공식 CT 괴리율)
              </Typography>
              {styleCtSummaries.filter((s) => s.needsReview).length > 0 && (
                <Chip
                  size="small"
                  label={`CT 재검토 권장 ${styleCtSummaries.filter((s) => s.needsReview).length}건`}
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>고객 / 스타일</TableCell>
                    <TableCell align="right">총 CT (한벌)</TableCell>
                    <TableCell align="right">총 AT (한벌)</TableCell>
                    <TableCell align="right">AT vs CT 괴리율</TableCell>
                    <TableCell align="center">상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {styleCtSummaries.map((summary) => {
                    const divColor =
                      summary.atVsCtDivergence == null
                        ? 'text.secondary'
                        : summary.atVsCtDivergence > 0
                          ? 'success.main'
                          : 'error.main';
                    const expanded = expandedStyleId === String(summary.id);

                    return (
                      <React.Fragment key={summary.id}>
                        <TableRow
                          hover
                          selected={expanded}
                          sx={{ cursor: 'pointer' }}
                          onClick={() =>
                            setExpandedStyleId((prev) =>
                              prev === String(summary.id) ? null : String(summary.id)
                            )
                          }
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {summary.customer}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {summary.name} · {summary.styleCode}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatSeconds(summary.totalCt)}</TableCell>
                          <TableCell align="right">
                            {summary.totalAt != null ? formatSeconds(summary.totalAt) : '-'}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ color: divColor, fontWeight: 700 }}>
                              {summary.atVsCtDivergence != null
                                ? formatPercent(summary.atVsCtDivergence)
                                : 'AT 없음'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {summary.needsReview ? (
                              <Chip
                                size="small"
                                label="CT 재검토 권장"
                                color="warning"
                                variant="outlined"
                              />
                            ) : (
                              <Chip size="small" label="정상" color="success" variant="outlined" />
                            )}
                          </TableCell>
                        </TableRow>

                        {/* 공정별 상세 */}
                        <TableRow>
                          <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                            <Collapse in={expanded} unmountOnExit>
                              <Box
                                sx={{
                                  px: 3,
                                  py: 2,
                                  bgcolor: 'grey.50',
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                <Typography
                                  variant="subtitle2"
                                  sx={{ fontWeight: 700, mb: 1 }}
                                >
                                  공정별 CT vs AT 비교
                                </Typography>
                                <TableContainer>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>공정</TableCell>
                                        <TableCell align="right">CT(초)</TableCell>
                                        <TableCell align="right">AT(초)</TableCell>
                                        <TableCell align="right">AT vs CT 괴리율</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {summary.processDetails.map((proc, idx) => {
                                        const pColor =
                                          proc.divergence == null
                                            ? 'text.secondary'
                                            : proc.divergence > 0
                                              ? 'success.main'
                                              : 'error.main';
                                        return (
                                          <TableRow key={idx}>
                                            <TableCell>{proc.name}</TableCell>
                                            <TableCell align="right">
                                              {formatSeconds(proc.ct)}
                                            </TableCell>
                                            <TableCell align="right">
                                              {proc.at != null ? formatSeconds(proc.at) : '-'}
                                            </TableCell>
                                            <TableCell align="right">
                                              <Typography
                                                variant="body2"
                                                sx={{ color: pColor, fontWeight: proc.divergence != null && Math.abs(proc.divergence) >= 10 ? 700 : 400 }}
                                              >
                                                {proc.divergence != null
                                                  ? formatPercent(proc.divergence)
                                                  : '-'}
                                              </Typography>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default CtReviewBoard;
