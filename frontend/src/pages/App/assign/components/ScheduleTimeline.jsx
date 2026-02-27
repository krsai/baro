import React, { memo, useRef, useMemo, useState } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import AssignBar from './AssignBar';

const CELL_WIDTH = 100;
const ROW_HEIGHT = 90;
const BAR_HEIGHT = 64;
const BAR_GAP = 6;
const MIN_BAR_WIDTH = 56;
const FIXED_COL_WIDTH = 190; // sticky "라인" 컬럼 너비

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

// 마우스/터치 이벤트에서 현재 포인터 X 좌표 계산
const getPointerX = (event) => {
  const activator = event.activatorEvent;
  if (!activator) return null;
  if (typeof activator.clientX === 'number') return activator.clientX + (event.delta?.x ?? 0);
  const touch = activator.touches?.[0] ?? activator.changedTouches?.[0];
  if (touch && typeof touch.clientX === 'number') return touch.clientX + (event.delta?.x ?? 0);
  return null;
};

const ScheduleTimeline = ({ lines, days, assignments, onLinkPrev, onOpenContextMenu }) => {
  // { lineId: string|null, dayIndex: number|null } — 현재 포인터가 위치한 셀
  const [hoveredTarget, setHoveredTarget] = useState({ lineId: null, dayIndex: null });
  const gridContainerRef = useRef(null);
  // getBoundingClientRect()는 레이아웃을 강제 재계산하므로 드래그 시작 시 1번만 캐시
  const containerRectRef = useRef(null);

  // O(1) 조회를 위한 Map — assignments 배열이 바뀔 때만 재생성
  const assignmentById = useMemo(() => {
    const map = new Map();
    assignments.forEach((a) => map.set(String(a.id), a));
    return map;
  }, [assignments]);

  useDndMonitor({
    onDragStart() {
      setHoveredTarget({ lineId: null, dayIndex: null });
      // 드래그 시작 시점의 컨테이너 위치를 캐시 (드래그 중 페이지 스크롤은 드문 상황)
      containerRectRef.current = gridContainerRef.current?.getBoundingClientRect() ?? null;
    },
    // onDragOver 는 droppable이 바뀔 때만 발동 → AssignBar 내부 이동 시 delta가 고정됨
    // onDragMove 는 매 포인터 이동마다 발동 → 항상 최신 delta로 정확한 위치 계산
    onDragMove(event) {
      const overId = String(event.over?.id ?? '');

      // Case 1: DropCell  —  "lineId::dayIndex"
      const cellMatch = overId.match(/^(.+)::(\d+)$/);
      if (cellMatch) {
        setHoveredTarget({ lineId: cellMatch[1], dayIndex: Number(cellMatch[2]) });
        return;
      }

      // Case 2: AssignBar droppable  —  "assign-drop-{id}"
      const assignMatch = overId.match(/^assign-drop-(.+)$/);
      if (assignMatch) {
        const found = assignmentById.get(assignMatch[1]);
        if (found != null) {
          const pointerX = getPointerX(event);
          const container = gridContainerRef.current;
          const rect = containerRectRef.current; // 캐시된 rect 사용 (재계산 없음)
          if (pointerX != null && container != null && rect != null) {
            // scrollLeft만 live로 읽음 (레이아웃 재계산 없음)
            const relX = pointerX - rect.left - FIXED_COL_WIDTH + container.scrollLeft;
            const computedDayIndex = Math.floor(relX / CELL_WIDTH);
            if (computedDayIndex >= 0 && computedDayIndex < days.length) {
              setHoveredTarget({ lineId: String(found.lineId), dayIndex: computedDayIndex });
              return;
            }
          }
          // fallback: 바의 시작 날짜
          setHoveredTarget({ lineId: String(found.lineId), dayIndex: found.startIndex });
          return;
        }
      }

      setHoveredTarget({ lineId: null, dayIndex: null });
    },
    onDragEnd() {
      setHoveredTarget({ lineId: null, dayIndex: null });
      containerRectRef.current = null;
    },
    onDragCancel() {
      setHoveredTarget({ lineId: null, dayIndex: null });
      containerRectRef.current = null;
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
              const lineIdStr = String(line.id);

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
                        // 이 셀이 현재 포인터 위치와 정확히 일치할 때만 하이라이트
                        const isHighlighted =
                          hoveredTarget.lineId === lineIdStr &&
                          hoveredTarget.dayIndex === dayIndex;
                        return (
                          <DropCell
                            key={`${line.id}-${day.key}`}
                            id={`${line.id}::${dayIndex}`}
                            isHoliday={isHoliday}
                            isHighlighted={isHighlighted}
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
