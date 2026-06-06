import React, { memo, useMemo, useState } from 'react';
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

const AssignmentDetailCard = memo(function AssignmentDetailCard({
  assignment,
  languageCode,
}) {
  return (
    <Box
      sx={{
        minWidth: 220,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        p: 1.25,
        backgroundColor: '#FAFAFB',
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
        {assignment.orderNo || getUiMessage('assign.orderNoFallback', 'No order', languageCode)}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {assignment.label || '-'}
      </Typography>
      {assignment.customer ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {assignment.customer}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', mt: 1 }}>
        <Chip
          size="small"
          label={getUiMessage(
            'assign.progressCompact',
            `Progress ${formatPercentLabel(assignment.progressPercent, '0%')}`,
            languageCode
          )}
        />
        <Chip
          size="small"
          label={getUiMessage(
            'assign.remainingHoursCompact',
            `Remain ${formatHoursLabel(assignment.remainingStTotalSeconds, '-')}`,
            languageCode
          )}
        />
        <Chip
          size="small"
          label={getUiMessage(
            'assign.visiblePlanHoursCompact',
            `In view ${formatHoursLabel(assignment.visiblePlannedStTotalSeconds, '-')}`,
            languageCode
          )}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {(assignment.startDateKey || '-') + ' ~ ' + (assignment.endDateKey || '-')}
      </Typography>
      {assignment.isCompleted ? (
        <Chip size="small" color="success" label={getUiMessage('common.completed', 'Completed', languageCode)} sx={{ mt: 1 }} />
      ) : null}
      {assignment.hasOrphanWorkRecords ? (
        <Chip size="small" color="warning" label={getUiMessage('assign.unlinkedWorkLogsCompact', 'Unlinked logs', languageCode)} sx={{ mt: 1, ml: assignment.isCompleted ? 0.75 : 0 }} />
      ) : null}
    </Box>
  );
});

const LineMonthCapacityBoard = ({
  rows,
  monthKeys,
  loading = false,
  languageCode = 'en',
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
                          aria-label={isExpanded ? 'collapse line' : 'expand line'}
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
                              'assign.assignmentCountCompact',
                              `${row.assignments.length} assignments`,
                              languageCode,
                              { count: row.assignments.length }
                            )}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    {normalizedMonthKeys.map((monthKey) => {
                      const summary =
                        (Array.isArray(row.months) ? row.months : []).find(
                          (item) => item?.monthKey === monthKey
                        ) || null;
                      const tone = resolvePlanTone(summary?.plannedLoadPercent);
                      const planBarValue = Math.max(
                        0,
                        Math.min(100, Number(summary?.plannedLoadPercent) || 0)
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
                                  {getUiMessage('assign.plannedLoad', 'Planned load', languageCode)}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: tone.textColor }}>
                                  {formatPercentLabel(summary?.plannedLoadPercent)}
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
                              <Typography variant="caption" color="text.secondary">
                                {getUiMessage(
                                  'assign.carryOutCompact',
                                  `Carry ${formatHoursLabel(summary?.carryOutStSeconds, '-')}`,
                                  languageCode
                                )}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {getUiMessage(
                                  'assign.capacityCompact',
                                  `Capacity ${formatHoursLabel(summary?.lineMonthlyCapacitySeconds, '-')}`,
                                  languageCode
                                )}
                              </Typography>
                              {Number(summary?.orphanWorkRecordCount) > 0 ? (
                                <Chip
                                  size="small"
                                  color="warning"
                                  label={getUiMessage(
                                    'assign.unlinkedWorkLogsWithCount',
                                    `Unlinked logs ${summary.orphanWorkRecordCount}`,
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
                              'assign.lineAssignments',
                              'Assignments on this line',
                              languageCode
                            )}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                            {row.assignments.length > 0 ? (
                              row.assignments.map((assignment) => (
                                <AssignmentDetailCard
                                  key={assignment.id || `${row.lineId}:${assignment.label}`}
                                  assignment={assignment}
                                  languageCode={languageCode}
                                />
                              ))
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                {getUiMessage(
                                  'assign.noAssignmentsInLine',
                                  'No assignments in this line.',
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
