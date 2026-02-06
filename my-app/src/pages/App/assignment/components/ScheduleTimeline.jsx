import React, { useMemo } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import AssignBar from './AssignBar';

const CELL_WIDTH = 140;
const ROW_HEIGHT = 74;
const BAR_HEIGHT = 50;
const BAR_GAP = 4;

const DropCell = ({ id }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { dropId: id } });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: CELL_WIDTH,
        height: ROW_HEIGHT,
        border: '1px dashed #e2e6ef',
        zIndex: 0,
        backgroundColor: isOver ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
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

const getNextStartIndex = (assignment) => {
  const endPercent = assignment.endDayPercent ?? 100;
  return endPercent >= 100 ? assignment.endIndex + 1 : assignment.endIndex;
};

const ScheduleTimeline = ({ lines, days, assignments, onLinkPrev }) => {
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
      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 190 }}>라인</TableCell>
              {days.map((day) => (
                <TableCell key={day.key} align="center" sx={{ minWidth: CELL_WIDTH }}>
                  <Typography variant="caption">{day.label}</Typography>
                </TableCell>
              ))}
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
                const expected = getNextStartIndex(prev);
                if (item.startIndex > expected) {
                  linkableIds.add(item.id);
                }
              });
              const { placed, laneCount } = assignLanes(lineAssignments);
              const rowHeight = Math.max(ROW_HEIGHT, laneCount * (BAR_HEIGHT + BAR_GAP) + BAR_GAP);

              return (
                <TableRow key={line.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {line.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      인원 {line.headcount} · {line.shift}
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
                      {days.map((day, dayIndex) => (
                        <DropCell key={`${line.id}-${day.key}`} id={`${line.id}::${dayIndex}`} />
                      ))}

                      {placed.map((assignment) => {
                        const startOffset = (assignment.startDayOffsetPercent ?? 0) / 100;
                        const startPercent = (assignment.startDayPercent ?? 100) / 100;
                        const endPercent = (assignment.endDayPercent ?? 100) / 100;
                        const fullDays = Math.max(assignment.endIndex - assignment.startIndex - 1, 0);
                        const widthCells =
                          assignment.startIndex === assignment.endIndex
                            ? startPercent
                            : startPercent + fullDays + endPercent;

                        return (
                          <AssignBar
                            key={assignment.id}
                            assignment={{
                              ...assignment,
                              leftPx: (assignment.startIndex + startOffset) * CELL_WIDTH,
                              widthPx: Math.max(widthCells * CELL_WIDTH, 120),
                              topPx: BAR_GAP + assignment.laneIndex * (BAR_HEIGHT + BAR_GAP),
                              heightPx: BAR_HEIGHT,
                            }}
                            showLinkPrev={linkableIds.has(assignment.id)}
                            onLinkPrev={onLinkPrev}
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
