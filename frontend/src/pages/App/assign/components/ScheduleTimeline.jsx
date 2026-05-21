import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import { getUiMessage } from '../../../../constants/uiMessages';
import { useLanguage } from '../../../../context/LanguageContext';
import AssignBar from './AssignBar';
import { ASSIGN_TIMELINE_CELL_WIDTH } from '../constants';

const CELL_WIDTH = ASSIGN_TIMELINE_CELL_WIDTH;
const ROW_HEIGHT = 90;
const BAR_HEIGHT = 64;
const BAR_GAP = 6;
const MIN_BAR_WIDTH = 56;
const FIXED_COL_WIDTH = 190;
const EMPTY_HOVERED_TARGET = { lineId: null, dayIndex: null };
const EMPTY_DRAG_STATE = { hoveredTarget: EMPTY_HOVERED_TARGET, dragPreview: null };
const EMPTY_LAYOUT = { placed: [], laneCount: 1, linkableIds: new Set() };

const DropCell = memo(({ id, isHoliday, isHighlighted }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { dropId: id } });
  const baseColor = isHoliday ? '#FCECEF' : 'transparent';
  const highlighted = isOver || isHighlighted;

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: CELL_WIDTH,
        height: '100%',
        border: '1px dashed #e2e6ef',
        zIndex: 0,
        backgroundColor: highlighted ? 'rgba(25, 118, 210, 0.18)' : baseColor,
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

const getAssignmentDisplayDuration = (assignment, lineCapacityById, days) => {
  const totalSeconds = Number(assignment?.totalSeconds);
  const lineCapacity = Number(
    lineCapacityById.get(String(assignment?.lineId))
    ?? lineCapacityById.get(Number(assignment?.lineId))
  );

  if (
    Number.isFinite(totalSeconds) &&
    totalSeconds > 0 &&
    Number.isFinite(lineCapacity) &&
    lineCapacity > 0
  ) {
    return totalSeconds / lineCapacity;
  }

  return getWorkingDuration(assignment, days);
};

const getPointerX = (event) => {
  const activator = event.activatorEvent;
  if (!activator) return null;

  if (typeof activator.clientX === 'number') {
    return activator.clientX + (event.delta?.x ?? 0);
  }

  const touch = activator.touches?.[0] ?? activator.changedTouches?.[0];
  if (touch && typeof touch.clientX === 'number') {
    return touch.clientX + (event.delta?.x ?? 0);
  }

  return null;
};

const getLayoutByLineId = (lineLayouts, lineId) =>
  lineLayouts.get(lineId) ?? lineLayouts.get(Number(lineId)) ?? lineLayouts.get(String(lineId));

const areHoveredTargetsEqual = (left, right) =>
  left?.lineId === right?.lineId && left?.dayIndex === right?.dayIndex;

const areDragPreviewsEqual = (left, right) =>
  left?.lineId === right?.lineId &&
  left?.insertLeftPx === right?.insertLeftPx &&
  left?.ghostWidthPx === right?.ghostWidthPx &&
  left?.draggedAssignmentId === right?.draggedAssignmentId;

const buildNextDragState = (hoveredTarget, dragPreview) => (prev) => {
  if (
    areHoveredTargetsEqual(prev.hoveredTarget, hoveredTarget) &&
    areDragPreviewsEqual(prev.dragPreview, dragPreview)
  ) {
    return prev;
  }

  return { hoveredTarget, dragPreview };
};

const LineTimelineRow = memo(({
  line,
  viewDays,
  rowHeight,
  hoveredDayIndex,
  linePreview,
  placed,
  linkableIds,
  onLinkPrev,
  onOpenContextMenu,
  languageCode,
}) => (
  <TableRow hover>
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
        {line.name}
        {` (${getUiMessage('assign.headcount', '{count} ppl', languageCode, {
          count: line.headcount,
        })})`}
      </Typography>
    </TableCell>
    <TableCell colSpan={viewDays.length} sx={{ p: 0 }}>
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${viewDays.length}, ${CELL_WIDTH}px)`,
          width: viewDays.length * CELL_WIDTH,
          height: rowHeight,
          backgroundColor: '#fbfcfe',
        }}
      >
        {viewDays.map((day, dayIndex) => {
          const isHoliday = day.isSunday || day.isHoliday;
          return (
            <DropCell
              key={`${line.id}-${day.key}`}
              id={`${line.id}::${dayIndex}`}
              isHoliday={isHoliday}
              isHighlighted={hoveredDayIndex === dayIndex}
            />
          );
        })}

        {placed.map((assignment) => {
          const shouldShift =
            linePreview != null &&
            String(assignment.id) !== linePreview.draggedAssignmentId &&
            assignment.leftPx >= linePreview.insertLeftPx;

          return (
            <AssignBar
              key={assignment.id}
              assignment={assignment}
              shiftPx={shouldShift ? linePreview.ghostWidthPx : 0}
              showLinkPrev={linkableIds.has(assignment.id)}
              onLinkPrev={onLinkPrev}
              onOpenContextMenu={onOpenContextMenu}
            />
          );
        })}

        {hoveredDayIndex != null && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: hoveredDayIndex * CELL_WIDTH,
              width: CELL_WIDTH,
              height: rowHeight,
              backgroundColor: 'rgba(25, 118, 210, 0.15)',
              zIndex: 1104,
              pointerEvents: 'none',
            }}
          />
        )}

        {linePreview != null && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: linePreview.insertLeftPx - 1,
              width: 3,
              height: rowHeight,
              backgroundColor: 'rgba(25, 118, 210, 0.85)',
              borderRadius: 1,
              zIndex: 1200,
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    </TableCell>
  </TableRow>
), (prevProps, nextProps) => (
  prevProps.line === nextProps.line &&
  prevProps.viewDays === nextProps.viewDays &&
  prevProps.rowHeight === nextProps.rowHeight &&
  prevProps.hoveredDayIndex === nextProps.hoveredDayIndex &&
  prevProps.linePreview === nextProps.linePreview &&
  prevProps.placed === nextProps.placed &&
  prevProps.linkableIds === nextProps.linkableIds &&
  prevProps.onLinkPrev === nextProps.onLinkPrev &&
  prevProps.onOpenContextMenu === nextProps.onOpenContextMenu &&
  prevProps.languageCode === nextProps.languageCode
));

const ScheduleTimeline = ({ lines, days, dayCount, assignments, onLinkPrev, onOpenContextMenu }) => {
  const { languageCode } = useLanguage();
  const viewDays = useMemo(() => (
    dayCount != null && dayCount < days.length
      ? days.slice(0, dayCount)
      : days
  ), [days, dayCount]);
  const [dragState, setDragState] = useState(EMPTY_DRAG_STATE);
  const gridContainerRef = useRef(null);
  const containerRectRef = useRef(null);
  const ghostWidthPxRef = useRef(CELL_WIDTH);

  const assignmentById = useMemo(() => {
    const map = new Map();
    assignments.forEach((assignment) => {
      map.set(String(assignment.id), assignment);
    });
    return map;
  }, [assignments]);

  const lineCapacityById = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => {
      const lineId = String(line?.id ?? '');
      const dailyCapacity = Number(line?.dailyCapacitySeconds);
      if (!lineId || !Number.isFinite(dailyCapacity) || dailyCapacity <= 0) return;
      map.set(lineId, dailyCapacity);
    });
    return map;
  }, [lines]);

  const assignmentsByLine = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => map.set(line.id, []));

    assignments.forEach((item) => {
      if (!map.has(item.lineId)) map.set(item.lineId, []);
      map.get(item.lineId).push(item);
    });

    map.forEach((items) => {
      items.sort((left, right) => {
        const leftCompletedRank =
          String(left?.scheduleStatus || '').trim() === 'PRODUCTION_COMPLETED' ? 0 : 1;
        const rightCompletedRank =
          String(right?.scheduleStatus || '').trim() === 'PRODUCTION_COMPLETED' ? 0 : 1;
        if (leftCompletedRank !== rightCompletedRank) {
          return leftCompletedRank - rightCompletedRank;
        }

        const orderDiff = getOrderKey(left) - getOrderKey(right);
        if (orderDiff !== 0) return orderDiff;

        const leftStartDateKey =
          typeof left?.startDateKey === 'string' ? left.startDateKey.trim() : '';
        const rightStartDateKey =
          typeof right?.startDateKey === 'string' ? right.startDateKey.trim() : '';
        if (leftStartDateKey !== rightStartDateKey) {
          return leftStartDateKey.localeCompare(rightStartDateKey);
        }

        return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, {
          numeric: true,
        });
      });
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
      const viewEnd = viewDays.length;

      const placedWithLayout = placed.map((assignment) => {
        const range = rangeById.get(assignment.id) || buildRange(assignment);
        const rawStart = range.start;
        const rawEnd = range.start + Math.max(range.end - range.start, 0);
        const isClippedLeft = rawStart < 0;
        const isClippedRight = rawEnd > viewEnd;
        const clampedStart = Math.max(rawStart, 0);
        const clampedEnd = Math.min(rawEnd, viewEnd);
        const clampedWidthCells = Math.max(clampedEnd - clampedStart, 0);

        return {
          ...assignment,
          leftPx: clampedStart * CELL_WIDTH,
          widthPx: Math.max(
            clampedWidthCells * CELL_WIDTH,
            isClippedLeft || isClippedRight ? 20 : 0
          ),
          topPx: verticalOffset + BAR_GAP + assignment.laneIndex * (BAR_HEIGHT + BAR_GAP),
          heightPx: BAR_HEIGHT,
          workDays: getAssignmentDisplayDuration(assignment, lineCapacityById, days),
          isClippedLeft,
          isClippedRight,
        };
      });

      map.set(line.id, { placed: placedWithLayout, laneCount, linkableIds });
    });

    return map;
  }, [lines, assignmentsByLine, days, viewDays, lineCapacityById]);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    container.scrollLeft = 0;
  }, [viewDays.length, viewDays[0]?.key, viewDays[viewDays.length - 1]?.key]);

  const resetDragState = useCallback(() => {
    setDragState((prev) => (
      prev === EMPTY_DRAG_STATE ? prev : buildNextDragState(EMPTY_HOVERED_TARGET, null)(prev)
    ));
  }, []);

  useDndMonitor({
    onDragStart(event) {
      resetDragState();
      containerRectRef.current = gridContainerRef.current?.getBoundingClientRect() ?? null;

      const activeData = event.active?.data?.current;
      const draggedAssignmentId =
        activeData?.type === 'assignment' ? String(activeData.assignmentId ?? '') : null;

      ghostWidthPxRef.current = CELL_WIDTH;
      if (!draggedAssignmentId) return;

      const draggedAssignment = assignmentById.get(draggedAssignmentId);
      if (!draggedAssignment) return;

      const sourceLayout = getLayoutByLineId(lineLayouts, String(draggedAssignment.lineId));
      const draggedPlaced = sourceLayout?.placed?.find(
        (assignment) => String(assignment.id) === draggedAssignmentId
      );
      if (draggedPlaced) {
        ghostWidthPxRef.current = draggedPlaced.widthPx;
      }
    },

    onDragMove(event) {
      const overId = String(event.over?.id ?? '');
      const activeData = event.active?.data?.current;
      const pointerX = getPointerX(event);
      const container = gridContainerRef.current;
      const rect = containerRectRef.current;

      let pointerRelX = null;
      if (pointerX != null && container != null && rect != null) {
        pointerRelX = pointerX - rect.left - FIXED_COL_WIDTH + container.scrollLeft;
      }

      let overLineId = null;
      let overDayIndex = null;

      const cellMatch = overId.match(/^(.+)::(\d+)$/);
      if (cellMatch) {
        overLineId = cellMatch[1];
        overDayIndex = Number(cellMatch[2]);
      } else {
        const assignMatch = overId.match(/^assign-drop-(.+)$/);
        if (assignMatch) {
          const found = assignmentById.get(assignMatch[1]);
          if (found != null) {
            overLineId = String(found.lineId);
            if (pointerRelX != null) {
              const computed = Math.floor(pointerRelX / CELL_WIDTH);
              overDayIndex = Math.max(0, Math.min(days.length - 1, computed));
            } else {
              overDayIndex = found.startIndex;
            }
          }
        }
      }

      if (overLineId == null || overDayIndex == null) {
        setDragState(buildNextDragState({ lineId: overLineId, dayIndex: overDayIndex }, null));
        return;
      }

      const lineLayout = getLayoutByLineId(lineLayouts, overLineId);
      const placed = lineLayout?.placed ?? [];
      const draggedAssignmentId =
        activeData?.type === 'assignment' ? String(activeData.assignmentId ?? '') : null;

      const targetAtDay = placed.find(
        (assignment) =>
          assignment.startIndex <= overDayIndex &&
          overDayIndex <= assignment.endIndex &&
          String(assignment.id) !== draggedAssignmentId
      );

      let insertLeftPx;
      if (targetAtDay) {
        const barMidX = targetAtDay.leftPx + targetAtDay.widthPx / 2;
        const cursorX = pointerRelX ?? overDayIndex * CELL_WIDTH + CELL_WIDTH / 2;
        insertLeftPx =
          cursorX < barMidX
            ? targetAtDay.leftPx
            : targetAtDay.leftPx + targetAtDay.widthPx;
      } else {
        insertLeftPx = overDayIndex * CELL_WIDTH;
      }

      setDragState(buildNextDragState(
        { lineId: overLineId, dayIndex: overDayIndex },
        {
          lineId: overLineId,
          insertLeftPx,
          ghostWidthPx: ghostWidthPxRef.current,
          draggedAssignmentId,
        }
      ));
    },

    onDragEnd: resetDragState,
    onDragCancel: resetDragState,
  });

  const { hoveredTarget, dragPreview } = dragState;

  return (
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <TableContainer
        ref={gridContainerRef}
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
                {getUiMessage('assign.lineColumn', 'Line', languageCode)}
              </TableCell>
              {viewDays.map((day) => {
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
                      sx={{
                        color: isHoliday ? '#B42334' : 'text.secondary',
                        fontWeight: isHoliday ? 700 : 500,
                      }}
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
              const layout = lineLayouts.get(line.id) || EMPTY_LAYOUT;
              const { placed, laneCount, linkableIds } = layout;
              const rowHeight = Math.max(ROW_HEIGHT, laneCount * (BAR_HEIGHT + BAR_GAP) + BAR_GAP);
              const lineIdStr = String(line.id);
              const hoveredDayIndex =
                hoveredTarget.lineId === lineIdStr ? hoveredTarget.dayIndex : null;
              const linePreview =
                dragPreview && String(dragPreview.lineId) === lineIdStr ? dragPreview : null;

              return (
                <LineTimelineRow
                  key={line.id}
                  line={line}
                  viewDays={viewDays}
                  rowHeight={rowHeight}
                  hoveredDayIndex={hoveredDayIndex}
                  linePreview={linePreview}
                  placed={placed}
                  linkableIds={linkableIds}
                  onLinkPrev={onLinkPrev}
                  onOpenContextMenu={onOpenContextMenu}
                  languageCode={languageCode}
                />
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default memo(ScheduleTimeline);
