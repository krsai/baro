import React, { memo, useMemo, useState } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import AssignBar from './AssignBar';

const CELL_WIDTH = 100;
const ROW_HEIGHT = 90;
const BAR_HEIGHT = 64;
const BAR_GAP = 6;
const MIN_BAR_WIDTH = 56;

const DropCell = memo(({ id, isHoliday, isColumnHighlighted }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { dropId: id } });
  const baseColor = isHoliday ? '#FCECEF' : 'transparent';
  const isHighlighted = isOver || isColumnHighlighted;

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: CELL_WIDTH,
        height: '100%',
        border: '1px dashed #e2e6ef',
        zIndex: 0,
        backgroundColor: isHighlighted ? 'rgba(25, 118, 210, 0.18)' : baseColor,
        transition: 'background-color 0.08s ease',
        boxSizing: 'border-box',
      }}
    />
  );
});

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

const LANE_EPSILON = 1e-4;

const assignLanes = (items) => {
  const laneEndByIndex = [];
  const placed = [];

  items.forEach((item) => {
    const range = buildRange(item);
    let laneIndex = 0;

    while (laneIndex < laneEndByIndex.length) {
      if (range.start >= laneEndByIndex[laneIndex] - LANE_EPSILON) break;
      laneIndex += 1;
    }

    laneEndByIndex[laneIndex] = range.end;
    placed.push({ ...item, laneIndex });
  });

  return { placed, laneCount: laneEndByIndex.length || 1 };
};

const getOrderKey = (assignment) => {
  const offset = (assignment.startDayOffsetPercent ?? 0) / 100;
  return assignment.startIndex + offset;
};

const isNonWorkingDay = (day) => Boolean(day?.isSunday || day?.isHoliday);
const isLockedAssignment = (assignment) =>
  ['SENT', 'AGREED'].includes(String(assignment?.ctStatus || '').trim().toUpperCase());

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

const ScheduleTimeline = ({ lines, days, assignments, onLinkPrev, onOpenContextMenu }) => {
  const [hoveredDayIndex, setHoveredDayIndex] = useState(null);

  useDndMonitor({
    onDragStart() {
      setHoveredDayIndex(null);
    },
    onDragOver(event) {
      const overId = String(event.over?.id ?? '');
      // DropCell id format: "lineId::dayIndex"
      const cellMatch = overId.match(/::(\d+)$/);
      if (cellMatch) {
        setHoveredDayIndex(Number(cellMatch[1]));
        return;
      }
      // AssignBar droppable id format: "assign-drop-{id}"
      const assignMatch = overId.match(/^assign-drop-(.+)$/);
      if (assignMatch) {
        const assignId = assignMatch[1];
        const found = (Array.isArray(assignments) ? assignments : []).find(
          (a) => String(a.id) === assignId,
        );
        if (found != null) {
          setHoveredDayIndex(found.startIndex);
          return;
        }
      }
      setHoveredDayIndex(null);
    },
    onDragEnd() {
      setHoveredDayIndex(null);
    },
    onDragCancel() {
      setHoveredDayIndex(null);
    },
  });

  const assignmentsByLine = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => map.set(line.id, []));
    assignments.forEach((item) => {
      if (!map.has(item.lineId)) map.set(item.lineId, []);
      map.get(item.lineId).push(item);
    });
    map.forEach((items) => {
      items.sort((a, b) => getOrderKey(a) - getOrderKey(b));
    });
    return map;
  }, [lines, assignments]);

  const lineLayouts = useMemo(() => {
    const map = new Map();
    const minWidthCells = MIN_BAR_WIDTH / CELL_WIDTH;

    lines.forEach((line) => {
      const lineAssignments = assignmentsByLine.get(line.id) || [];
      const linkableIds = new Set();
      lineAssignments.forEach((item, index) => {
        if (index === 0) return;
        const prev = lineAssignments[index - 1];
        const expected = getNextStartIndex(prev, days);
        if (item.startIndex > expected) {
          linkableIds.add(item.id);
        }
      });

      const rangeById = new Map();
      lineAssignments.forEach((assignment) => {
        const rawRange = buildRange(assignment);
        const rawWidthCells = Math.max(rawRange.end - rawRange.start, 0);
        rangeById.set(assignment.id, {
          start: rawRange.start,
          end: rawRange.start + Math.max(rawWidthCells, minWidthCells),
        });
      });

      const { placed, laneCount } = assignLanes(lineAssignments);
      const barsBlockHeight = laneCount * (BAR_HEIGHT + BAR_GAP) + BAR_GAP;
      const rowHeightForLine = Math.max(ROW_HEIGHT, barsBlockHeight);
      const verticalOffset = Math.round((rowHeightForLine - barsBlockHeight) / 2);
      const placedWithLayout = placed.map((assignment) => {
        const range = rangeById.get(assignment.id) || buildRange(assignment);
        const widthCells = Math.max(range.end - range.start, 0);
        return {
          ...assignment,
          leftPx: range.start * CELL_WIDTH,
          widthPx: widthCells * CELL_WIDTH,
          topPx: verticalOffset + BAR_GAP + assignment.laneIndex * (BAR_HEIGHT + BAR_GAP),
          heightPx: BAR_HEIGHT,
          workDays: getWorkingDuration(assignment, days),
        };
      });

      map.set(line.id, { placed: placedWithLayout, laneCount, linkableIds });
    });

    return map;
  }, [lines, assignmentsByLine, days]);

  return (
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <TableContainer
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
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
              const layout = lineLayouts.get(line.id) || {
                placed: [],
                laneCount: 1,
                linkableIds: new Set(),
              };
              const { placed, laneCount, linkableIds } = layout;
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
                            isColumnHighlighted={hoveredDayIndex === dayIndex}
                          />
                        );
                      })}

                      {placed.map((assignment) => {
                        return (
                          <AssignBar
                            key={assignment.id}
                            assignment={assignment}
                            showLinkPrev={linkableIds.has(assignment.id)}
                            onLinkPrev={onLinkPrev}
                            onOpenContextMenu={onOpenContextMenu}
                            isLocked={isLockedAssignment(assignment)}
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
