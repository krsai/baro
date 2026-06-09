import React, { memo, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
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
import { formatNumberWithCommas } from '../../../../utils/numberFormat';
import CompactBoardCard from './CompactBoardCard';

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

const formatHoursLabel = (seconds, fallback = '-') => {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  const hours = Math.round((parsed / 3600) * 10) / 10;
  return `${formatNumberWithCommas(hours, { fallback: '0', maximumFractionDigits: 1 })}h`;
};

const formatDateKeyLabel = (dateKey = '', fallback = '-') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return fallback;
  return dateKey;
};

const formatDaysLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(Math.round(parsed * 10) / 10, {
    fallback: '0',
    maximumFractionDigits: 1,
  })}d`;
};

const formatQuantityLabel = (quantity, languageCode = 'en') =>
  getUiMessage('assign.quantityCompact', 'Qty {quantity}', languageCode, {
    quantity: formatNumberWithCommas(Math.max(0, Number(quantity) || 0), {
      fallback: '0',
      maximumFractionDigits: 0,
    }),
  });

const formatProgressChipLabel = (value, languageCode = 'en') =>
  getUiMessage('assign.progressCompact', 'Progress {percent}', languageCode, {
    percent: formatPercentLabel(value, '0%'),
  });

const formatHoursChipLabel = (
  key,
  fallback,
  seconds,
  languageCode = 'en'
) =>
  getUiMessage(key, fallback, languageCode, {
    hours: formatHoursLabel(seconds, '-'),
  });

const formatDaysChipLabel = (key, fallback, days, languageCode = 'en') =>
  getUiMessage(key, fallback, languageCode, {
    days: formatDaysLabel(days, '-'),
  });

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

const LineRowDropArea = memo(function LineRowDropArea({ lineId, languageCode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `line-row-drop::${lineId}`,
    data: { dropMode: 'line-row', lineId },
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        mt: 1,
        px: 1,
        py: 0.75,
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: isOver ? 'primary.main' : 'divider',
        backgroundColor: isOver ? 'rgba(37, 99, 235, 0.08)' : '#F8FAFC',
      }}
    >
      <Typography variant="caption" color={isOver ? 'primary.main' : 'text.secondary'}>
        {getUiMessage('assign.lineDropHint', 'Drop cards here to assign to this line', languageCode)}
      </Typography>
    </Box>
  );
});

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
        width: 26,
        minWidth: 26,
        height: 92,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: isOver ? 'primary.main' : 'divider',
        backgroundColor: isOver ? 'rgba(37, 99, 235, 0.08)' : '#FCFCFD',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isOver ? 'primary.main' : 'text.secondary',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        +
      </Typography>
    </Box>
  );
});

const AssignmentDetailCard = memo(function AssignmentDetailCard({
  assignment,
  languageCode,
  onOpenDetail,
  onOpenContextMenu,
}) {
  const queueStatus = assignment?.queueStatus || (assignment?.isCompleted ? 'completed' : 'queued');
  const isCompleted = queueStatus === 'completed';
  const isReadyToComplete = queueStatus === 'ready_to_complete';
  const isLocked = isCompleted;
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
      : isReadyToComplete
        ? {
            label: getUiMessage(
              'assign.readyStatusCompact',
              'Work done',
              languageCode
            ),
          variant: 'outlined',
          color: 'warning',
        }
      : null,
    {
      label: formatProgressChipLabel(assignment.progressPercent, languageCode),
      variant: 'outlined',
    },
    !isCompleted
      ? {
          label: formatHoursChipLabel(
            'assign.remainingHoursCompact',
            'Remain {hours}',
            assignment.remainingStTotalSeconds,
            languageCode
          ),
          variant: 'outlined',
        }
      : null,
    !isCompleted
      ? {
          label: formatDaysChipLabel(
            'assign.etaDaysCompact',
            'ETA {days}',
            assignment.estimatedRemainingWorkDays,
            languageCode
          ),
          variant: 'outlined',
        }
      : null,
    !isCompleted && Number(assignment?.queuePosition) > 0
      ? {
          label: getUiMessage('assign.queuePositionCompact', 'Q{position}', languageCode, {
            position: assignment.queuePosition,
          }),
          variant: 'outlined',
        }
      : null,
  ];
  if (Number(assignment?.quantity) > 0) {
    chips.push({
      label: formatQuantityLabel(assignment.quantity, languageCode),
      variant: 'outlined',
    });
  }
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
    : isReadyToComplete
      ? assignment.completedAt
        ? getUiMessage(
            assignment.completionDateIsEstimated
              ? 'assign.workDoneEstimatedAtCompact'
              : 'assign.workDoneAtCompact',
            assignment.completionDateIsEstimated
              ? 'Work done est. {date}'
              : 'Work done {date}',
            languageCode,
            {
              date: formatDateKeyLabel(assignment.completedAt, '-'),
            }
          )
        : getUiMessage(
            'assign.awaitingCompletionCompact',
            'Awaiting completion',
            languageCode
          )
      : '';
  const accentColor = isCompleted ? '#15803D' : isReadyToComplete ? '#D97706' : '#2563EB';
  const backgroundColor = isCompleted ? '#F3F4F6' : isReadyToComplete ? '#FFF7ED' : '#FFFFFF';

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
      title={assignment.label || '-'}
      subtitle={assignment.orderNo || getUiMessage('assign.orderNoFallback', 'No order', languageCode)}
      meta={[assignment.customer, assignment.colorName].filter(Boolean).join(' / ')}
      chips={chips.filter(Boolean)}
      footer={footer}
      previewUrl={assignment.previewUrl || ''}
      accentColor={accentColor}
      backgroundColor={backgroundColor}
      onClick={() => onOpenDetail?.(assignment.id)}
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

const LineMonthCapacityBoard = ({
  rows,
  monthKeys,
  loading = false,
  languageCode = 'en',
  onOpenAssignmentDetail,
  onOpenContextMenu,
}) => {
  const [expandedLineIds, setExpandedLineIds] = useState(() => new Set());

  const normalizedRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const normalizedMonthKeys = useMemo(
    () => (Array.isArray(monthKeys) ? monthKeys : []).filter(Boolean),
    [monthKeys]
  );

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
        <Table size="small" sx={{ minWidth: 980 }}>
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
                  <TableRow hover>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <IconButton
                          size="small"
                          onClick={() => toggleExpanded(row.lineId)}
                          aria-label={getUiMessage(
                            isExpanded
                              ? 'assign.collapseLineAria'
                              : 'assign.expandLineAria',
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
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getUiMessage(
                              'assign.completedCountCompact',
                              '{count} completed',
                              languageCode,
                              { count: row.completedAssignmentCount || 0 }
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getUiMessage(
                              'assign.readyCountCompact',
                              '{count} awaiting completion',
                              languageCode,
                              { count: row.readyToCompleteAssignmentCount || 0 }
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getUiMessage(
                              'assign.remainingLoadCompact',
                              'Remain {hours}',
                              languageCode,
                              {
                                hours: formatHoursLabel(
                                  row.totalRemainingStTotalSeconds,
                                  '-'
                                ),
                              }
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getUiMessage(
                              'assign.backlogDaysCompact',
                              'Backlog {days}',
                              languageCode,
                              {
                                days: formatDaysLabel(row.queueBacklogDays, '-'),
                              }
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {row.lineFreeDateKey
                              ? getUiMessage(
                                  'assign.lineFreeByCompact',
                                  'Free by {date}',
                                  languageCode,
                                  {
                                    date: formatDateKeyLabel(row.lineFreeDateKey, '-'),
                                  }
                                )
                              : Number(row.activeAssignmentCount) > 0
                                ? getUiMessage(
                                    'assign.etaUnavailableCompact',
                                    'ETA unavailable',
                                    languageCode
                                  )
                              : getUiMessage(
                                  'assign.lineFreeNowCompact',
                                  'Free now',
                                  languageCode
                                )}
                          </Typography>
                          {row.forecastAnchorDateKey ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {getUiMessage(
                                'assign.forecastFromCompact',
                                'Forecast from {date}',
                                languageCode,
                                {
                                  date: formatDateKeyLabel(row.forecastAnchorDateKey, '-'),
                                }
                              )}
                            </Typography>
                          ) : null}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getUiMessage(
                              'assign.assignmentCountCompact',
                              '{count} assignments',
                              languageCode,
                              { count: row.assignments.length }
                            )}
                          </Typography>
                          {Number(row.stUnknownAssignmentCount) > 0 ? (
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                              {getUiMessage(
                                'assign.stUnknownExcludedCompact',
                                '{count} ST-missing excluded',
                                languageCode,
                                {
                                  count: row.stUnknownAssignmentCount,
                                }
                              )}
                            </Typography>
                          ) : null}
                          <LineRowDropArea lineId={row.lineId} languageCode={languageCode} />
                        </Box>
                      </Stack>
                    </TableCell>
                    {normalizedMonthKeys.map((monthKey) => {
                      const summary =
                        (Array.isArray(row.months) ? row.months : []).find(
                          (item) => item?.monthKey === monthKey
                        ) || null;
                      const tone = resolvePlanTone(summary?.plannedLoadPercent);
                      const isForecastMonth = Boolean(summary?.isForecastMonth);
                      const isAnchorMonth = Boolean(summary?.isAnchorMonth);
                      const isHistoricalMonth = Boolean(summary?.isHistoricalMonth);
                      const planBarValue = Math.max(
                        0,
                        Math.min(
                          100,
                          isHistoricalMonth ? 0 : Number(summary?.plannedLoadPercent) || 0
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
                              backgroundColor: tone.backgroundColor,
                              border: '1px solid rgba(0,0,0,0.05)',
                              minHeight: 132,
                            }}
                          >
                            <Stack spacing={0.75}>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  {getUiMessage(
                                    isForecastMonth ? 'assign.forecastLoad' : 'assign.plannedLoad',
                                    isForecastMonth ? 'Forecast load' : 'Planned load',
                                    languageCode
                                  )}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: tone.textColor }}>
                                  {formatPercentLabel(
                                    isHistoricalMonth ? null : summary?.plannedLoadPercent
                                  )}
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={planBarValue}
                                  sx={{
                                    mt: 0.5,
                                    height: 6,
                                    borderRadius: 999,
                                    backgroundColor: 'rgba(0,0,0,0.08)',
                                    '& .MuiLinearProgress-bar': {
                                      backgroundColor: tone.barColor,
                                    },
                                  }}
                                />
                                {isAnchorMonth && summary?.forecastAnchorDateKey ? (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block', mt: 0.5 }}
                                  >
                                    {getUiMessage(
                                      'assign.forecastFromCompact',
                                      'Forecast from {date}',
                                      languageCode,
                                      {
                                        date: formatDateKeyLabel(summary.forecastAnchorDateKey, '-'),
                                      }
                                    )}
                                  </Typography>
                                ) : null}
                              </Box>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  {getUiMessage('assign.actualOutput', 'Actual output', languageCode)}
                                </Typography>
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
                              {isForecastMonth ? (
                                <Typography variant="caption" color="text.secondary">
                                  {getUiMessage(
                                    'assign.totalEstimatedLoad',
                                    'Total est.',
                                    languageCode
                                  )}{' '}
                                  {formatPercentLabel(summary?.totalEstimatedLoadPercent)}
                                </Typography>
                              ) : null}
                              <Typography variant="caption" color="text.secondary">
                                {getUiMessage(
                                  'assign.carryOutCompact',
                                  'Carry {hours}',
                                  languageCode,
                                  {
                                    hours: formatHoursLabel(
                                      isForecastMonth ? summary?.carryOutStSeconds : null,
                                      '-'
                                    ),
                                  }
                                )}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {getUiMessage(
                                  'assign.capacityCompact',
                                  'Capacity {hours}',
                                  languageCode,
                                  {
                                    hours: formatHoursLabel(
                                      summary?.lineMonthlyCapacitySeconds,
                                      '-'
                                    ),
                                  }
                                )}
                              </Typography>
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
                          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, alignItems: 'stretch' }}>
                            {row.queuedAssignments.length > 0 ? (
                              <>
                                <LineAssignmentDropSlot
                                  lineId={row.lineId}
                                  beforeAssignmentId={row.queuedAssignments[0]?.id || null}
                                  languageCode={languageCode}
                                />
                                {row.queuedAssignments.map((assignment) => (
                                  <React.Fragment key={assignment.id || `${row.lineId}:${assignment.label}`}>
                                    <AssignmentDetailCard
                                      assignment={assignment}
                                      languageCode={languageCode}
                                      onOpenDetail={onOpenAssignmentDetail}
                                      onOpenContextMenu={onOpenContextMenu}
                                    />
                                    <LineAssignmentDropSlot
                                      lineId={row.lineId}
                                      afterAssignmentId={assignment.id}
                                      languageCode={languageCode}
                                    />
                                  </React.Fragment>
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
                          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, alignItems: 'stretch' }}>
                            {row.completedAssignments.length > 0 ? (
                              row.completedAssignments.map((assignment) => (
                                <AssignmentDetailCard
                                  key={assignment.id || `${row.lineId}:${assignment.label}:completed`}
                                  assignment={assignment}
                                  languageCode={languageCode}
                                  onOpenDetail={onOpenAssignmentDetail}
                                  onOpenContextMenu={onOpenContextMenu}
                                />
                              ))
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                                {getUiMessage(
                                  'assign.noFinishedAssignmentsInLine',
                                  'No finished assignments in this line.',
                                  languageCode
                                )}
                              </Typography>
                            )}
                          </Stack>
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
