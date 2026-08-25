import React, { memo, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  Alert,
  Box,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { getUiMessage } from '../../../../constants/uiMessages';
import { resolveCardCustomerDisplay } from '../utils/assignmentCard';
import CompactBoardCard from './CompactBoardCard';

const buildAssignmentSearchText = (assignment) =>
  [
    assignment?.label,
    assignment?.customer,
    assignment?.customerNameKo,
    assignment?.customerNameVi,
    assignment?.colorName,
    assignment?.gender,
    assignment?.orderNo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const filterAssignmentsBySearchTerm = (assignments, lowerSearchTerm) => {
  if (!lowerSearchTerm) return assignments;
  return (Array.isArray(assignments) ? assignments : []).filter((assignment) =>
    buildAssignmentSearchText(assignment).includes(lowerSearchTerm)
  );
};

const formatMonthLabel = (monthKey = '') => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '-';
  const [year, month] = monthKey.split('-');
  return `${year}.${month}`;
};

const formatPercentLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return `${Math.round(parsed * 10) / 10}%`;
};

const formatDateKeyLabel = (dateKey = '', fallback = '-') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return fallback;
  return dateKey;
};

const formatLineCompletionLabel = (dateKey, languageCode = 'en') => {
  const template =
    languageCode === 'ko'
      ? '완료 예상 {date}'
      : languageCode === 'vi'
        ? 'Du kien xong {date}'
        : 'Finish est. {date}';
  return template.replace('{date}', formatDateKeyLabel(dateKey, '-'));
};

const formatWorkRecordDateLabel = (dateKey, languageCode = 'en') => {
  if (!dateKey) {
    return getUiMessage(
      'assign.noRecentWorkRecord',
      'No recent records',
      languageCode
    );
  }
  return getUiMessage(
    'assign.workRecordsThroughCompact',
    'Records through {date}',
    languageCode,
    { date: formatDateKeyLabel(dateKey, '-') }
  );
};

const resolvePlanTone = (plannedLoadPercent) => {
  const value = Number(plannedLoadPercent);
  if (!Number.isFinite(value)) {
    return {
      barColor: '#90CAF9',
      textColor: 'text.secondary',
      backgroundColor: 'rgba(144, 202, 249, 0.14)',
    };
  }
  if (value > 120) {
    return {
      barColor: '#D32F2F',
      textColor: 'error.main',
      backgroundColor: 'rgba(211, 47, 47, 0.08)',
    };
  }
  if (value > 100) {
    return {
      barColor: '#ED6C02',
      textColor: 'warning.main',
      backgroundColor: 'rgba(237, 108, 2, 0.08)',
    };
  }
  return {
    barColor: '#1976D2',
    textColor: 'primary.main',
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  };
};

const LineRowDropHint = memo(function LineRowDropHint({ isOver, languageCode }) {
  return (
    <Box
      sx={{
        mt: 1,
        px: 1,
        py: 0.75,
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: isOver ? 'primary.main' : 'divider',
        backgroundColor: isOver ? 'rgba(37, 99, 235, 0.08)' : '#F8FAFC',
        transition: 'border-color 0.12s ease, background-color 0.12s ease',
      }}
    >
      <Typography variant="caption" color={isOver ? 'primary.main' : 'text.secondary'}>
        {getUiMessage('assign.lineDropHint', 'Drop cards here to assign to this line', languageCode)}
      </Typography>
    </Box>
  );
});

// Display-only clustering for the queued-assignments list: purely visual
// (order-number headers), does not touch queue position/startIndex/endIndex
// or any schedule/forecast calculation, which are unaffected by rendering
// order (AGENTS.md: the queue "order" only feeds forecast ETA math, not
// actual production - that always comes from work records). Groups appear
// in first-seen order with no extra sort pass, per user request.
const groupAssignmentsByOrderNo = (assignments = [], languageCode = 'en') => {
  const groups = [];
  const groupByOrderNo = new Map();
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const orderNo = assignment?.orderNo || '';
    if (!groupByOrderNo.has(orderNo)) {
      const group = {
        orderNo,
        customer: resolveCardCustomerDisplay(assignment, languageCode) || '',
        items: [],
        totalQuantity: 0,
      };
      groupByOrderNo.set(orderNo, group);
      groups.push(group);
    }
    const group = groupByOrderNo.get(orderNo);
    group.items.push(assignment);
    group.totalQuantity += Math.max(0, Number(assignment?.quantity) || 0);
  });
  return groups;
};

const LineAssignmentDropSlot = memo(function LineAssignmentDropSlot({
  lineId,
  beforeAssignmentId = null,
  afterAssignmentId = null,
  languageCode,
}) {
  const dropId = beforeAssignmentId
    ? `line-slot-drop::${lineId}::before::${beforeAssignmentId}`
    : afterAssignmentId
      ? `line-slot-drop::${lineId}::after::${afterAssignmentId}`
      : `line-slot-drop::${lineId}::empty`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      dropMode: 'line-slot',
      lineId,
      beforeAssignmentId,
      afterAssignmentId,
    },
  });

  return (
    <Box
      ref={setNodeRef}
      aria-label={getUiMessage('assign.insertAssignmentAria', 'Insert assignment here', languageCode)}
      sx={{
        width: '100%',
        minWidth: 0,
        height: 10,
        borderRadius: 1,
        borderTop: '2px solid',
        borderColor: isOver ? 'primary.main' : 'transparent',
        backgroundColor: isOver ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'border-color 0.12s ease, background-color 0.12s ease',
      }}
    />
  );
});

const AssignmentDetailCard = memo(function AssignmentDetailCard({
  assignment,
  languageCode,
  onOpenContextMenu,
}) {
  const queueStatus = assignment?.queueStatus || (assignment?.isCompleted ? 'completed' : 'queued');
  const isCompleted = queueStatus === 'completed';
  const isReviewRequired = queueStatus === 'review_required';
  const isZeroQuantityOverflow = queueStatus === 'zero_quantity_overflow';
  // Kept only as a record of already-produced overflow (AGENTS.md 40번) -
  // its planned quantity is 0, so there is nothing left to drag onto a line.
  const isLocked = isCompleted || isZeroQuantityOverflow;
  const chips = [
    isCompleted
      ? {
          label: getUiMessage(
            'assign.completedStatusCompact',
            'Completed',
            languageCode
          ),
          variant: 'outlined',
          color: 'success',
        }
      : isZeroQuantityOverflow
        ? {
            label: getUiMessage(
              'assign.zeroQuantityOverflowStatusCompact',
              'Zero-qty overflow',
              languageCode
            ),
            variant: 'outlined',
            color: 'warning',
          }
      : isReviewRequired
        ? {
            label: getUiMessage(
              'assign.reviewStatusCompact',
              '검토 필요',
              languageCode
            ),
            variant: 'outlined',
            color: 'error',
          }
      : null,
    // Orthogonal to the queueStatus chip above - a queued/review/ready card can also
    // have actual recorded work whose progress ratio the backend could not compute
    // (see isProgressUnknown, AGENTS.md). Its remaining ST is excluded from the line's
    // forecast rather than guessed at, so this needs to stay visible to the operator
    // instead of just quietly under-counting the backlog.
    !isCompleted && !isZeroQuantityOverflow && Boolean(assignment?.isProgressUnknown)
      ? {
          label: getUiMessage(
            'assign.progressUnknownStatusCompact',
            'Progress unknown',
            languageCode
          ),
          variant: 'outlined',
          color: 'warning',
        }
      : null,
  ];
  const footer = isCompleted
    ? assignment.completedAt
      ? getUiMessage(
          assignment.completionDateIsEstimated
            ? 'assign.completedEstimatedAtCompact'
            : 'assign.completedAtCompact',
          assignment.completionDateIsEstimated
            ? 'Done est. {date}'
            : 'Done {date}',
          languageCode,
          {
            date: formatDateKeyLabel(assignment.completedAt, '-'),
          }
        )
      : ''
    : isZeroQuantityOverflow
      ? getUiMessage(
          'assign.zeroQuantityOverflowCompact',
          'Removed from order - already produced {quantity}',
          languageCode,
          { quantity: Math.max(0, Number(assignment?.producedQuantity) || 0) }
        )
    : isReviewRequired
      ? getUiMessage(
          'assign.reviewRequiredCompact',
          '수량 검토 필요',
          languageCode
        )
      : '';
  const accentColor = isCompleted
    ? '#15803D'
    : isZeroQuantityOverflow
      ? '#B45309'
    : isReviewRequired
      ? '#B91C1C'
      : '#2563EB';
  const backgroundColor = isCompleted
    ? '#F3F4F6'
    : isZeroQuantityOverflow
      ? '#FFFBEB'
    : isReviewRequired
      ? '#FEF2F2'
      : '#FFFFFF';

  return (
    <CompactBoardCard
      draggableId={`assign-${assignment.id}`}
      droppableId={isLocked ? null : `assign-drop-${assignment.id}`}
      droppableData={
        isLocked
          ? null
          : { dropId: `assign-drop-${assignment.id}`, dropMode: 'assignment-card' }
      }
      disabled={isLocked}
      languageCode={languageCode}
      customer={resolveCardCustomerDisplay(assignment, languageCode) || '-'}
      orderNo={assignment.orderNo || getUiMessage('assign.orderNoFallback', 'No order', languageCode)}
      styleName={assignment.label || '-'}
      quantity={assignment.quantity}
      progressPercent={assignment.workProgressPercent ?? assignment.progressPercent}
      chips={chips.filter(Boolean)}
      footer={footer}
      previewUrl={assignment.previewUrl || ''}
      accentColor={accentColor}
      backgroundColor={backgroundColor}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu?.({
          targetType: 'assignment',
          id: assignment.id,
          mouseX: event.clientX,
          mouseY: event.clientY,
        });
      }}
    />
  );
});

const LineCapacityMainRow = memo(function LineCapacityMainRow({
  row,
  normalizedMonthKeys,
  languageCode,
  isExpanded,
  onToggleExpand,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `line-row-drop::${row.lineId}`,
    data: { dropMode: 'line-row', lineId: row.lineId },
  });

  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        backgroundColor: isOver ? 'rgba(37, 99, 235, 0.06)' : undefined,
        outline: isOver ? '2px solid #2563EB' : undefined,
        outlineOffset: -2,
        transition: 'background-color 0.12s ease, outline 0.12s ease',
      }}
    >
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <IconButton
            size="small"
            onClick={onToggleExpand}
            aria-label={getUiMessage(
              isExpanded ? 'assign.collapseLineAria' : 'assign.expandLineAria',
              isExpanded ? 'Collapse line' : 'Expand line',
              languageCode
            )}
            sx={{ mt: -0.25 }}
          >
            {isExpanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">{row.lineName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {getUiMessage('assign.headcount', '{count} ppl', languageCode, {
                count: row.headcount || 0,
              })}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {getUiMessage(
                'assign.queueCountCompact',
                '{count} queued',
                languageCode,
                { count: row.activeAssignmentCount || 0 }
              )}
            </Typography>
            {Number(row.reviewRequiredAssignmentCount) > 0 ? (
              <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                {getUiMessage(
                  'assign.reviewCountCompact',
                  '{count} in review',
                  languageCode,
                  { count: row.reviewRequiredAssignmentCount || 0 }
                )}
              </Typography>
            ) : null}
            {Number(row.stUnknownAssignmentCount) > 0 ? (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                {getUiMessage(
                  'assign.stUnknownExcludedCompact',
                  '{count} ST-missing excluded',
                  languageCode,
                  { count: row.stUnknownAssignmentCount }
                )}
              </Typography>
            ) : null}
            {Number(row.progressUnknownAssignmentCount) > 0 ? (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                {getUiMessage(
                  'assign.progressUnknownExcludedCompact',
                  '{count} progress unknown - excluded',
                  languageCode,
                  { count: row.progressUnknownAssignmentCount }
                )}
              </Typography>
            ) : null}
            <LineRowDropHint isOver={isOver} languageCode={languageCode} />
          </Box>
        </Stack>
      </TableCell>
      {normalizedMonthKeys.map((monthKey) => {
        const summary =
          (Array.isArray(row.months) ? row.months : []).find(
            (item) => item?.monthKey === monthKey
          ) || null;
        const isAnchorMonth = Boolean(summary?.isAnchorMonth);
        const tone = resolvePlanTone(summary?.plannedLoadPercent);
        const loadLabel = getUiMessage(
          'assign.plannedLoad',
          'Planned load',
          languageCode
        );
        const loadValueLabel = formatPercentLabel(summary?.plannedLoadPercent);
        const planBarValue = Math.max(
          0,
          Math.min(
            100,
            Number(summary?.plannedLoadPercent) || 0
          )
        );
        const actualBarValue = Math.max(
          0,
          Math.min(100, Number(summary?.actualOutputPercent) || 0)
        );
        return (
          <TableCell key={`${row.lineId}:${monthKey}`} sx={{ verticalAlign: 'top' }}>
            <Box
              sx={{
                borderRadius: 1.5,
                p: 1,
                backgroundColor: isOver ? 'rgba(37, 99, 235, 0.05)' : tone.backgroundColor,
                border: isOver ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid rgba(0,0,0,0.05)',
                minHeight: 108,
                transition: 'background-color 0.12s ease, border-color 0.12s ease',
              }}
            >
              <Stack spacing={0.75}>
                <Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="baseline"
                    justifyContent="space-between"
                    useFlexGap
                    sx={{ width: '100%' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {loadLabel}
                    </Typography>
                    {isAnchorMonth ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ textAlign: 'right' }}
                      >
                        {row.lineFreeDateKey
                          ? formatLineCompletionLabel(row.lineFreeDateKey, languageCode)
                          : Number(row.activeAssignmentCount) > 0
                            ? getUiMessage('assign.etaUnavailableCompact', 'ETA unavailable', languageCode)
                            : getUiMessage('assign.lineFreeNowCompact', 'Free now', languageCode)}
                      </Typography>
                    ) : null}
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: tone.textColor }}>
                    {loadValueLabel}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={planBarValue}
                    sx={{
                      mt: 0.5,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.08)',
                      '& .MuiLinearProgress-bar': { backgroundColor: tone.barColor },
                    }}
                  />
                </Box>
                <Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="baseline"
                    justifyContent="space-between"
                    useFlexGap
                    sx={{ width: '100%' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {getUiMessage(
                        'assign.actualOutput',
                        'Actual production rate',
                        languageCode
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
                      {formatWorkRecordDateLabel(
                        summary?.actualOutputRecordedThroughDateKey,
                        languageCode
                      )}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatPercentLabel(summary?.actualOutputPercent)}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={actualBarValue}
                    sx={{
                      mt: 0.5,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.08)',
                    }}
                  />
                </Box>
                {Number(summary?.orphanWorkRecordCount) > 0 ? (
                  <Chip
                    size="small"
                    color="warning"
                    label={getUiMessage(
                      'assign.unlinkedWorkLogsWithCount',
                      'Unlinked logs {count}',
                      languageCode,
                      { count: summary.orphanWorkRecordCount }
                    )}
                    sx={{ alignSelf: 'flex-start' }}
                  />
                ) : null}
              </Stack>
            </Box>
          </TableCell>
        );
      })}
    </TableRow>
  );
});

const LineMonthCapacityBoard = ({
  rows,
  monthKeys,
  loading = false,
  error = false,
  languageCode = 'en',
  searchTerm = '',
  onOpenContextMenu,
}) => {
  const [expandedLineIds, setExpandedLineIds] = useState(() => new Set());

  const lowerSearchTerm = useMemo(
    () => String(searchTerm || '').trim().toLowerCase(),
    [searchTerm]
  );
  const normalizedRows = useMemo(() => {
    const sourceRows = Array.isArray(rows) ? rows : [];
    if (!lowerSearchTerm) return sourceRows;
    return sourceRows.map((row) => ({
      ...row,
      queuedAssignments: filterAssignmentsBySearchTerm(row.queuedAssignments, lowerSearchTerm),
      reviewRequiredAssignments: filterAssignmentsBySearchTerm(
        row.reviewRequiredAssignments,
        lowerSearchTerm
      ),
      completedAssignments: filterAssignmentsBySearchTerm(
        row.completedAssignments,
        lowerSearchTerm
      ),
      zeroQuantityOverflowAssignments: filterAssignmentsBySearchTerm(
        row.zeroQuantityOverflowAssignments,
        lowerSearchTerm
      ),
    }));
  }, [rows, lowerSearchTerm]);
  const normalizedMonthKeys = useMemo(
    () => (Array.isArray(monthKeys) ? monthKeys : []).filter(Boolean),
    [monthKeys]
  );
  const tableMinWidth = Math.max(560, 250 + normalizedMonthKeys.length * 220);

  if (error) {
    return (
      <Alert severity="error">
        {getUiMessage(
          'assign.capacityUnavailable',
          '현재 생산능력과 계획 부하를 계산할 수 없습니다. 데이터를 확인한 뒤 다시 시도하세요.',
          languageCode
        )}
      </Alert>
    );
  }

  const toggleExpanded = (lineId) => {
    setExpandedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  return (
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ width: '100%', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 250, minWidth: 250 }}>
                {getUiMessage('assign.lineCapacityHeader', 'Line', languageCode)}
              </TableCell>
              {normalizedMonthKeys.map((monthKey) => (
                <TableCell
                  key={monthKey}
                  align="left"
                  sx={{ minWidth: 220, backgroundColor: '#FAFAFB' }}
                >
                  <Typography variant="subtitle2">{formatMonthLabel(monthKey)}</Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {normalizedRows.map((row) => {
              const isExpanded = expandedLineIds.has(row.lineId);
              return (
                <React.Fragment key={row.lineId}>
                  <LineCapacityMainRow
                    row={row}
                    normalizedMonthKeys={normalizedMonthKeys}
                    languageCode={languageCode}
                    isExpanded={isExpanded}
                    onToggleExpand={() => toggleExpanded(row.lineId)}
                  />
                  <TableRow>
                    <TableCell
                      colSpan={normalizedMonthKeys.length + 1}
                      sx={{ py: 0, borderBottom: isExpanded ? undefined : 0 }}
                    >
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: 2, py: 1.5, backgroundColor: '#FCFCFD' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {getUiMessage(
                              'assign.activeAssignmentsHeader',
                              'Queued on this line',
                              languageCode
                            )}
                          </Typography>
                          <Stack spacing={0}>
                            {row.queuedAssignments.length > 0 ? (
                              <>
                                <LineAssignmentDropSlot
                                  lineId={row.lineId}
                                  beforeAssignmentId={row.queuedAssignments[0]?.id || null}
                                  languageCode={languageCode}
                                />
                                {groupAssignmentsByOrderNo(row.queuedAssignments, languageCode).map((group) => (
                                  <Box key={group.orderNo || `${row.lineId}:no-order`} sx={{ mb: 0.5 }}>
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        px: 0.5,
                                        py: 0.5,
                                      }}
                                    >
                                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                        {group.orderNo
                                          ? group.customer
                                            ? getUiMessage(
                                                'assign.customerWithOrderNumber',
                                                `${group.customer} ${group.orderNo}`,
                                                languageCode,
                                                { customer: group.customer, orderNo: group.orderNo }
                                              )
                                            : getUiMessage(
                                                'assign.orderWithNumber',
                                                `주문 ${group.orderNo}`,
                                                languageCode,
                                                { orderNo: group.orderNo }
                                              )
                                          : getUiMessage(
                                              'assign.fallbackOrderNumber',
                                              'No Order No.',
                                              languageCode
                                            )}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {getUiMessage(
                                          'common.itemCountSuffix',
                                          `${group.items.length}개`,
                                          languageCode,
                                          { count: group.items.length }
                                        )}
                                        {' · '}
                                        {getUiMessage(
                                          'assign.quantityCompact',
                                          '수량 {quantity}',
                                          languageCode,
                                          { quantity: group.totalQuantity }
                                        )}
                                      </Typography>
                                    </Box>
                                    {group.items.map((assignment) => (
                                      <React.Fragment key={assignment.id || `${row.lineId}:${assignment.label}`}>
                                        <AssignmentDetailCard
                                          assignment={assignment}
                                          languageCode={languageCode}
                                          onOpenContextMenu={onOpenContextMenu}
                                        />
                                        <LineAssignmentDropSlot
                                          lineId={row.lineId}
                                          afterAssignmentId={assignment.id}
                                          languageCode={languageCode}
                                        />
                                      </React.Fragment>
                                    ))}
                                  </Box>
                                ))}
                              </>
                            ) : (
                              <>
                                <LineAssignmentDropSlot
                                  lineId={row.lineId}
                                  languageCode={languageCode}
                                />
                                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                                  {getUiMessage(
                                    'assign.noQueuedAssignmentsInLine',
                                    'No queued assignments in this line.',
                                    languageCode
                                  )}
                                </Typography>
                              </>
                            )}
                          </Stack>
                          {row.reviewRequiredAssignments.length > 0 ? (
                            <>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 1.5, mb: 1 }}
                              >
                                {getUiMessage(
                                  'assign.reviewAssignmentsHeader',
                                  'Review required',
                                  languageCode
                                )}
                              </Typography>
                              <Stack spacing={1}>
                                {row.reviewRequiredAssignments.map((assignment) => (
                                  <AssignmentDetailCard
                                    key={assignment.id || `${row.lineId}:${assignment.label}:review`}
                                    assignment={assignment}
                                    languageCode={languageCode}
                                    onOpenContextMenu={onOpenContextMenu}
                                  />
                                ))}
                              </Stack>
                            </>
                          ) : null}
                          {row.completedAssignments.length > 0 ? (
                            <>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 1.5, mb: 1 }}
                              >
                                {getUiMessage(
                                  'assign.finishedAssignmentsHeader',
                                  'Finished on this line',
                                  languageCode
                                )}
                              </Typography>
                              <Stack spacing={1}>
                                {row.completedAssignments.map((assignment) => (
                                  <AssignmentDetailCard
                                    key={assignment.id || `${row.lineId}:${assignment.label}:completed`}
                                    assignment={assignment}
                                    languageCode={languageCode}
                                    onOpenContextMenu={onOpenContextMenu}
                                  />
                                ))}
                              </Stack>
                            </>
                          ) : null}
                          {row.zeroQuantityOverflowAssignments.length > 0 ? (
                            <>
                              <Typography
                                variant="caption"
                                color="warning.main"
                                sx={{ display: 'block', mt: 1.5, mb: 1 }}
                              >
                                {getUiMessage(
                                  'assign.zeroQuantityOverflowHeader',
                                  'Needs review (removed from order, already worked)',
                                  languageCode
                                )}
                              </Typography>
                              <Stack spacing={1}>
                                {row.zeroQuantityOverflowAssignments.map((assignment) => (
                                  <AssignmentDetailCard
                                    key={assignment.id || `${row.lineId}:${assignment.label}:zero-overflow`}
                                    assignment={assignment}
                                    languageCode={languageCode}
                                    onOpenContextMenu={onOpenContextMenu}
                                  />
                                ))}
                              </Stack>
                            </>
                          ) : null}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
            {loading && normalizedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={normalizedMonthKeys.length + 1}>
                  <Typography variant="body2" color="text.secondary">
                    {getUiMessage('common.loading', 'Loading...', languageCode)}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && normalizedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={normalizedMonthKeys.length + 1}>
                  <Typography variant="body2" color="text.secondary">
                    {getUiMessage(
                      'assign.noLineCapacityRows',
                      'No line capacity data is available.',
                      languageCode
                    )}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default memo(LineMonthCapacityBoard);
