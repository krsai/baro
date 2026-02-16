import React, { useMemo } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import AssignBar from './AssignBar';

const CELL_WIDTH = 140;
const ROW_HEIGHT = 74;
const BAR_HEIGHT = 50;
const BAR_GAP = 4;

const DropCell = ({ id, isHoliday }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { dropId: id } });
  const baseColor = isHoliday ? '#FCECEF' : 'transparent';

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: CELL_WIDTH,
        height: ROW_HEIGHT,
        border: '1px dashed #e2e6ef',
        zIndex: 0,
        backgroundColor: isOver ? 'rgba(25, 118, 210, 0.12)' : baseColor,
        boxSizing: 'border-box',
      }}
    />
  );
};

const buildRange = (assignment) => {
  const startOffset = (assignment.startDayOffsetPercent ?? 0) / 100;
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  if (assignment.startIndex === assignment.endIndex) {
    return {
      start: assignment.startIndex + startOffset,
      end: assignment.startIndex + startOffset + startPercent,
    };
  }
  const fullDays = Math.max(assignment.endIndex - assignment.startIndex - 1, 0);
  const widthCells = startPercent + fullDays + endPercent;
  return {
    start: assignment.startIndex + startOffset,
    end: assignment.startIndex + startOffset + widthCells,
  };
};

const assignLanes = (items) => {
  const lanes = [];
  const placed = [];

  items.forEach((item) => {
    const range = buildRange(item);
    let laneIndex = 0;
    while (laneIndex < lanes.length) {
      const conflict = lanes[laneIndex].some((existing) => {
        const other = buildRange(existing);
        return !(range.end <= other.start || range.start >= other.end);
      });
      if (!conflict) break;
      laneIndex += 1;
    }

    if (!lanes[laneIndex]) lanes[laneIndex] = [];
    lanes[laneIndex].push(item);
    placed.push({ ...item, laneIndex });
  });

  return { placed, laneCount: lanes.length || 1 };
};

const getOrderKey = (assignment) => {
  const offset = (assignment.startDayOffsetPercent ?? 0) / 100;
  return assignment.startIndex + offset;
};

const isNonWorkingDay = (day) => Boolean(day?.isSunday || day?.isHoliday);

const getNextStartIndex = (assignment, days) => {
  const endPercent = assignment.endDayPercent ?? 100;
  if (endPercent < 100) return assignment.endIndex;
  let nextIndex = assignment.endIndex + 1;
  if (!Array.isArray(days)) return nextIndex;
  while (nextIndex < days.length && isNonWorkingDay(days[nextIndex])) {
    nextIndex += 1;
  }
  return nextIndex;
};

const getWorkingDuration = (assignment, days) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  let total = 0;

  for (let i = assignment.startIndex; i <= assignment.endIndex; i += 1) {
    const day = days?.[i];
    if (isNonWorkingDay(day)) continue;
    if (assignment.startIndex === assignment.endIndex) {
      total += startPercent;
      continue;
    }
    if (i === assignment.startIndex) {
      total += startPercent;
    } else if (i === assignment.endIndex) {
      total += endPercent;
    } else {
      total += 1;
    }
  }

  return total;
};

const ScheduleTimeline = ({ lines, days, assignments, onLinkPrev, onSplit }) => {
  const assignmentsByLine = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => map.set(line.id, []));
    assignments.forEach((item) => {
      if (!map.has(item.lineId)) map.set(item.lineId, []);
      map.get(item.lineId).push(item);
    });
    return map;
  }, [lines, assignments]);

  return (
    <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
        <Table stickyHeader size="small" sx={{ minWidth: '100%', width: 'max-content' }}>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  width: 190,
                  minWidth: 190,
                  position: 'sticky',
                  left: 0,
                  zIndex: (theme) => theme.zIndex.appBar + 2,
                  backgroundColor: 'background.paper',
                }}
              >
                라인
              </TableCell>
              {days.map((day) => {
                const isHoliday = day.isSunday || day.isHoliday;
                return (
                  <TableCell
                    key={day.key}
                    align="center"
                    sx={{
                      minWidth: CELL_WIDTH,
                      backgroundColor: isHoliday ? '#FCECEF' : 'inherit',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: isHoliday ? '#B42334' : 'text.secondary', fontWeight: isHoliday ? 700 : 500 }}
                    >
                      {day.label}
                    </Typography>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => {
              const lineAssignments = assignmentsByLine.get(line.id) || [];
              const sortedByStart = lineAssignments
                .slice()
                .sort((a, b) => getOrderKey(a) - getOrderKey(b));
              const linkableIds = new Set();
              sortedByStart.forEach((item, index) => {
                if (index === 0) return;
                const prev = sortedByStart[index - 1];
                const expected = getNextStartIndex(prev, days);
                if (item.startIndex > expected) {
                  linkableIds.add(item.id);
                }
              });
              const { placed, laneCount } = assignLanes(lineAssignments);
              const rowHeight = Math.max(ROW_HEIGHT, laneCount * (BAR_HEIGHT + BAR_GAP) + BAR_GAP);

              return (
                <TableRow key={line.id} hover>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: (theme) => theme.zIndex.appBar + 1,
                      backgroundColor: 'background.paper',
                      borderRight: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {line.factoryName}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {line.name}({line.headcount}명)
                    </Typography>
                  </TableCell>
                  <TableCell colSpan={days.length} sx={{ p: 0 }}>
                    <Box
                      sx={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${days.length}, ${CELL_WIDTH}px)`,
                        width: days.length * CELL_WIDTH,
                        height: rowHeight,
                        backgroundColor: '#fbfcfe',
                      }}
                    >
                      {days.map((day, dayIndex) => {
                        const isHoliday = day.isSunday || day.isHoliday;
                        return (
                          <DropCell
                            key={`${line.id}-${day.key}`}
                            id={`${line.id}::${dayIndex}`}
                            isHoliday={isHoliday}
                          />
                        );
                      })}

                      {placed.map((assignment) => {
                        const startOffset = (assignment.startDayOffsetPercent ?? 0) / 100;
                        const startPercent = (assignment.startDayPercent ?? 100) / 100;
                        const endPercent = (assignment.endDayPercent ?? 100) / 100;
                        const fullDays = Math.max(assignment.endIndex - assignment.startIndex - 1, 0);
                        const widthCells =
                          assignment.startIndex === assignment.endIndex
                            ? startPercent
                            : startPercent + fullDays + endPercent;
                        const workDays = getWorkingDuration(assignment, days);

                        return (
                          <AssignBar
                            key={assignment.id}
                            assignment={{
                              ...assignment,
                              leftPx: (assignment.startIndex + startOffset) * CELL_WIDTH,
                              widthPx: Math.max(widthCells * CELL_WIDTH, 120),
                              topPx: BAR_GAP + assignment.laneIndex * (BAR_HEIGHT + BAR_GAP),
                              heightPx: BAR_HEIGHT,
                              workDays,
                            }}
                            showLinkPrev={linkableIds.has(assignment.id)}
                            onLinkPrev={onLinkPrev}
                            onSplit={onSplit}
                          />
                        );
                      })}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default ScheduleTimeline;
