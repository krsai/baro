import React, { useMemo, useRef, useState } from 'react';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleCard from './components/StyleCard';
import ScheduleTimeline from './components/ScheduleTimeline';

const DAILY_CAPACITY_SECONDS = 28800;

const mockCards = [
  {
    id: 'C-001',
    customer: '더산',
    styleName: '클래식 데님 자켓',
    quantity: 1200,
    processCount: 12,
    status: 'PT',
    totalSeconds: 98000,
  },
  {
    id: 'C-002',
    customer: '엘라',
    styleName: '오버핏 셔츠',
    quantity: 800,
    processCount: 9,
    status: 'ST',
    totalSeconds: 65000,
  },
  {
    id: 'C-003',
    customer: '앤블루',
    styleName: '플리츠 스커트',
    quantity: 500,
    processCount: 7,
    status: 'NONE',
    totalSeconds: 0,
  },
  {
    id: 'C-004',
    customer: '루나',
    styleName: '코튼 트렌치 코트',
    quantity: 350,
    processCount: 10,
    status: 'PT',
    totalSeconds: 82000,
  },
  {
    id: 'C-005',
    customer: '미라',
    styleName: '릴랙스 니트 팬츠',
    quantity: 900,
    processCount: 8,
    status: 'ST',
    totalSeconds: 54000,
  },
  {
    id: 'C-006',
    customer: '노바',
    styleName: '라운드 스웻 셋업',
    quantity: 420,
    processCount: 6,
    status: 'NONE',
    totalSeconds: 0,
  },
];

const mockLines = [
  { id: 'L-01', name: 'A-라인', headcount: 12, shift: '08:00~17:00' },
  { id: 'L-02', name: 'B-라인', headcount: 10, shift: '08:00~17:00' },
  { id: 'L-03', name: 'C-라인', headcount: 8, shift: '08:00~17:00' },
];

const initialAssignments = [];

const buildDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDays = (baseDate, count) => {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return {
      key: buildDateKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()} (${weekday})`,
    };
  });
};

const getUsageSeconds = (assignment) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;

  if (assignment.startIndex === assignment.endIndex) {
    return [{ dayIndex: assignment.startIndex, seconds: DAILY_CAPACITY_SECONDS * startPercent }];
  }

  const usage = [{ dayIndex: assignment.startIndex, seconds: DAILY_CAPACITY_SECONDS * startPercent }];
  for (let i = assignment.startIndex + 1; i < assignment.endIndex; i += 1) {
    usage.push({ dayIndex: i, seconds: DAILY_CAPACITY_SECONDS });
  }
  usage.push({ dayIndex: assignment.endIndex, seconds: DAILY_CAPACITY_SECONDS * endPercent });
  return usage;
};

const buildUsageMap = (assignments, lineId, totalDays) => {
  const usage = Array.from({ length: totalDays }).map(() => 0);
  assignments
    .filter((item) => item.lineId === lineId)
    .forEach((item) => {
      getUsageSeconds(item).forEach(({ dayIndex, seconds }) => {
        if (usage[dayIndex] != null) usage[dayIndex] += seconds;
      });
    });
  return usage;
};

const planAssignment = ({ startIndex, totalSeconds, lineId, assignments, totalDays }) => {
  const usage = buildUsageMap(assignments, lineId, totalDays);
  let remaining = totalSeconds;
  let dayIndex = startIndex;

  if (usage[dayIndex] >= DAILY_CAPACITY_SECONDS) return null;

  const startOffsetPercent = (usage[dayIndex] / DAILY_CAPACITY_SECONDS) * 100;
  const startAvailable = DAILY_CAPACITY_SECONDS - usage[dayIndex];
  const startUse = Math.min(startAvailable, remaining);
  const startDayPercent = (startUse / DAILY_CAPACITY_SECONDS) * 100;
  remaining -= startUse;

  if (remaining <= 0) {
    return {
      startIndex: dayIndex,
      endIndex: dayIndex,
      startDayOffsetPercent: startOffsetPercent,
      startDayPercent,
      endDayPercent: startDayPercent,
    };
  }

  dayIndex += 1;
  while (dayIndex < totalDays && remaining > 0) {
    if (usage[dayIndex] > 0) {
      return null;
    }

    if (remaining <= DAILY_CAPACITY_SECONDS) {
      const endDayPercent = (remaining / DAILY_CAPACITY_SECONDS) * 100;
      return {
        startIndex,
        endIndex: dayIndex,
        startDayOffsetPercent: startOffsetPercent,
        startDayPercent,
        endDayPercent,
      };
    }

    remaining -= DAILY_CAPACITY_SECONDS;
    dayIndex += 1;
  }

  return null;
};

const getAssignmentStartKey = (assignment) => {
  const offset = (assignment.startDayOffsetPercent ?? 0) / 100;
  return assignment.startIndex + offset;
};

const getTargetOnDay = (assignments, lineId, dayIndex) => {
  const candidates = assignments.filter(
    (item) => item.lineId === lineId && dayIndex >= item.startIndex && dayIndex <= item.endIndex
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, item) =>
    getAssignmentStartKey(item) < getAssignmentStartKey(earliest) ? item : earliest
  );
};

const getAssignmentTotalSeconds = (assignment) => {
  return getUsageSeconds(assignment).reduce((sum, item) => sum + item.seconds, 0);
};

const getNextStartIndex = (assignment) => {
  if (!assignment) return null;
  const usage = getUsageSeconds(assignment);
  const lastUsage = usage.find((item) => item.dayIndex === assignment.endIndex);
  if (!lastUsage) return assignment.endIndex;
  return lastUsage.seconds >= DAILY_CAPACITY_SECONDS ? assignment.endIndex + 1 : assignment.endIndex;
};

const rebuildLineWithInsert = ({
  lineId,
  insertIndex,
  insertAfterId,
  insertBeforeId,
  insertItem,
  assignments,
  totalDays,
}) => {
  const lineItems = assignments
    .filter((item) => item.lineId === lineId)
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));

  if (insertIndex == null || insertIndex >= totalDays) return null;

  let before = [];
  let after = [];

  if (insertAfterId) {
    const targetIndex = lineItems.findIndex((item) => item.id === insertAfterId);
    if (targetIndex === -1) return null;
    before = lineItems.slice(0, targetIndex + 1);
    after = lineItems.slice(targetIndex + 1);
    insertIndex = getNextStartIndex(before[before.length - 1]);
    if (insertIndex == null || insertIndex >= totalDays) return null;
  } else if (insertBeforeId) {
    const targetIndex = lineItems.findIndex((item) => item.id === insertBeforeId);
    if (targetIndex === -1) return null;
    before = lineItems.slice(0, targetIndex);
    after = lineItems.slice(targetIndex);
  } else {
    lineItems.forEach((item) => {
      if (item.endIndex < insertIndex) {
        before.push(item);
      } else {
        after.push(item);
      }
    });
  }

  const placed = before.map((item) => ({ ...item }));
  let planned = planAssignment({
    startIndex: insertIndex,
    totalSeconds: insertItem.totalSeconds ?? getAssignmentTotalSeconds(insertItem),
    lineId,
    assignments: placed,
    totalDays,
  });

  if (!planned) return null;

  placed.push({
    ...insertItem,
    lineId,
    ...planned,
  });

  let cursorStart = getNextStartIndex(placed[placed.length - 1]);

  const queue = after;

  for (const item of queue) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item);
    planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(placed[placed.length - 1]);
  }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const getNextAssignmentAfterDay = (items, lineId, dayIndex, excludeId) => {
  const sorted = items
    .filter((item) => item.lineId === lineId && item.id !== excludeId)
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));

  return sorted.find((item) => item.startIndex > dayIndex) || null;
};

const buildConnectedChain = (items, startIndex) => {
  if (startIndex == null || startIndex < 0) return [];
  const chain = [];
  for (let i = startIndex; i < items.length; i += 1) {
    if (i === startIndex) {
      chain.push(items[i]);
      continue;
    }
    const expectedStart = getNextStartIndex(chain[chain.length - 1]);
    if (items[i].startIndex === expectedStart) {
      chain.push(items[i]);
    } else {
      break;
    }
  }
  return chain;
};

const rebuildLineWithChain = ({
  lineId,
  insertIndex,
  insertAfterId,
  chainItems,
  assignments,
  totalDays,
}) => {
  if (!Array.isArray(chainItems) || chainItems.length === 0) return null;
  const chainIds = new Set(chainItems.map((item) => item.id));
  const lineItems = assignments
    .filter((item) => item.lineId === lineId && !chainIds.has(item.id))
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));

  if (insertIndex == null || insertIndex >= totalDays) return null;

  let before = [];
  let after = [];

  if (insertAfterId) {
    const targetIndex = lineItems.findIndex((item) => item.id === insertAfterId);
    if (targetIndex === -1) return null;
    before = lineItems.slice(0, targetIndex + 1);
    after = lineItems.slice(targetIndex + 1);
    insertIndex = getNextStartIndex(before[before.length - 1]);
    if (insertIndex == null || insertIndex >= totalDays) return null;
  } else {
    lineItems.forEach((item) => {
      if (item.endIndex < insertIndex) {
        before.push(item);
      } else {
        after.push(item);
      }
    });
  }

  const placed = before.map((item) => ({ ...item }));
  let cursorStart = insertIndex;

  for (const item of chainItems) {
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item);
    const planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(placed[placed.length - 1]);
  }

  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item);
    const planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(placed[placed.length - 1]);
  }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const AssignBoard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [activeDrag, setActiveDrag] = useState(null);
  const startDateRef = useRef(new Date());
  const [days, setDays] = useState(() => buildDays(startDateRef.current, 10));

  const ensureDaysLength = (minLength) => {
    if (days.length >= minLength) return days;
    const next = buildDays(startDateRef.current, minLength);
    setDays(next);
    return next;
  };

  const extendDays = (extra = 10) => {
    return ensureDaysLength(days.length + extra);
  };

  const tryPlanAssignment = (params) => {
    let planned = planAssignment({ ...params, totalDays: days.length });
    if (!planned) {
      const extended = extendDays(10);
      planned = planAssignment({ ...params, totalDays: extended.length });
    }
    return planned;
  };

  const tryRebuildLineWithInsert = (params) => {
    let result = rebuildLineWithInsert({ ...params, totalDays: days.length });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithInsert({ ...params, totalDays: extended.length });
    }
    return result;
  };

  const tryRebuildLineWithChain = (params) => {
    let result = rebuildLineWithChain({ ...params, totalDays: days.length });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithChain({ ...params, totalDays: extended.length });
    }
    return result;
  };

  const assignedCardIds = useMemo(() => {
    return new Set(assignments.map((item) => item.cardId).filter(Boolean));
  }, [assignments]);

  const filteredCards = useMemo(() => {
    const pool = mockCards.filter((card) => !assignedCardIds.has(card.id));
    if (!searchTerm) return pool;
    const lower = searchTerm.toLowerCase();
    return pool.filter(
      (card) =>
        card.styleName.toLowerCase().includes(lower) ||
        card.customer.toLowerCase().includes(lower)
    );
  }, [searchTerm, assignedCardIds]);

  const handleDragStart = (event) => {
    const { active } = event;
    if (!active) return;
    const id = String(active.id);
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = mockCards.find((item) => item.id === cardId);
      if (card) {
        setActiveDrag({ type: 'card', label: card.styleName,
          previewUrl: card.previewUrl,
          imageUrl: card.imageUrl,
          thumbnailUrl: card.thumbnailUrl, customer: card.customer });
      }
      return;
    }
    if (id.startsWith('assign-')) {
      const assignmentId = id.replace('assign-', '');
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (assignment) {
        setActiveDrag({
          type: 'assignment',
          label: assignment.label,
          customer: assignment.customer,
          orderNo: assignment.orderNo,
        });
      }
    }
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) {
      if (String(active.id).startsWith('assign-')) {
        const assignmentId = String(active.id).replace('assign-', '');
        setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
      }
      setActiveDrag(null);
      return;
    }

    let lineId = null;
    let dayIndex = null;
    let targetOnDay = null;

    if (String(over.id).startsWith('assign-drop-')) {
      const targetId = String(over.id).replace('assign-drop-', '');
      targetOnDay = assignments.find((item) => item.id === targetId);
      if (targetOnDay) {
        lineId = targetOnDay.lineId;
        dayIndex = targetOnDay.startIndex;
      }
    } else {
      const dropId = over.id;
      const [lineIdRaw, dayIndexRaw] = String(dropId).split('::');
      lineId = lineIdRaw;
      dayIndex = Number(dayIndexRaw);
      targetOnDay = getTargetOnDay(assignments, lineId, dayIndex);
    }

    if (!lineId || dayIndex === null) {
      setActiveDrag(null);
      return;
    }

    if (String(active.id).startsWith('card-')) {
      const cardId = String(active.id).replace('card-', '');
      const card = mockCards.find((item) => item.id === cardId);
      if (!card || card.status === 'NONE') {
        setActiveDrag(null);
        return;
      }

      const colorMap = {
        'C-001': { color: '#CDEBD7', stripe: '#9ED5B3' },
        'C-002': { color: '#CFE1FF', stripe: '#9FB9F2' },
        'C-003': { color: '#F7D0D8', stripe: '#E6A8B6' },
      };

      const colors = colorMap[cardId] || { color: '#E2E8F0', stripe: '#B6C3D1' };

      const newItem = {
        id: `A-${cardId}-${lineId}-${dayIndex}`,
        cardId,
        lineId,
        orderNo: `ORD-NEW-${cardId}`,
        customer: card.customer,
        label: card.styleName,
          previewUrl: card.previewUrl,
          imageUrl: card.imageUrl,
          thumbnailUrl: card.thumbnailUrl,
        color: colors.color,
        stripeColor: colors.stripe,
        totalSeconds: card.totalSeconds,
      };

      if (!targetOnDay) {
        const planned = tryPlanAssignment({
          startIndex: dayIndex,
          totalSeconds: card.totalSeconds,
          lineId,
          assignments,
        });

        if (planned) {
          setAssignments((prev) => [
            ...prev,
            {
              ...newItem,
              ...planned,
            },
          ]);
          setActiveDrag(null);
          return;
        }

        const nextAssignment = getNextAssignmentAfterDay(assignments, lineId, dayIndex);
        if (nextAssignment) {
          const pushed = tryRebuildLineWithInsert({
            lineId,
            insertIndex: dayIndex,
            insertBeforeId: nextAssignment.id,
            insertItem: newItem,
            assignments,
          });

          if (pushed) {
            setAssignments(pushed);
          }
        }
        setActiveDrag(null);
        return;
      }

      const pushed = tryRebuildLineWithInsert({
        lineId,
        insertIndex: dayIndex,
        insertAfterId: targetOnDay.id,
        insertItem: newItem,
        assignments,
      });

      if (pushed) {
        setAssignments(pushed);
      }
      setActiveDrag(null);
      return;
    }

    if (String(active.id).startsWith('assign-')) {
      const assignmentId = String(active.id).replace('assign-', '');
      setAssignments((prev) => {
        const target = prev.find((item) => item.id === assignmentId);
        if (!target) return prev;

        const filtered = prev.filter((item) => item.id !== assignmentId);

        const totalSeconds = getAssignmentTotalSeconds(target);

        if (!targetOnDay || targetOnDay.id === assignmentId) {
          const planned = tryPlanAssignment({
            startIndex: dayIndex,
            totalSeconds,
            lineId,
            assignments: filtered,
          });

          if (planned) {
            return filtered.concat({
              ...target,
              lineId,
              ...planned,
            });
          }
        }

        let insertAfterId = null;
        let insertBeforeId = null;
        if (targetOnDay && targetOnDay.id !== assignmentId) {
          insertAfterId = targetOnDay.id;
        } else {
          const nextAssignment = getNextAssignmentAfterDay(filtered, lineId, dayIndex, assignmentId);
          if (nextAssignment) insertBeforeId = nextAssignment.id;
        }

        if (insertAfterId || insertBeforeId) {
          const pushed = tryRebuildLineWithInsert({
            lineId,
            insertIndex: dayIndex,
            insertAfterId,
            insertBeforeId,
            insertItem: { ...target, totalSeconds },
            assignments: filtered,
          });

          if (pushed) return pushed;
        }
        return prev;
      });
      setActiveDrag(null);
    }
  };

  const handleLinkPrev = (assignmentId) => {
    setAssignments((prev) => {
      const target = prev.find((item) => item.id === assignmentId);
      if (!target) return prev;
      const lineItems = prev
        .filter((item) => item.lineId === target.lineId)
        .slice()
        .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));
      const targetIndex = lineItems.findIndex((item) => item.id === assignmentId);
      if (targetIndex <= 0) return prev;
      const prevItem = lineItems[targetIndex - 1];
      const insertIndex = getNextStartIndex(prevItem);
      if (insertIndex == null) return prev;
      const chain = buildConnectedChain(lineItems, targetIndex);
      if (chain.length === 0) return prev;

      const moved = tryRebuildLineWithChain({
        lineId: target.lineId,
        insertIndex,
        insertAfterId: prevItem.id,
        chainItems: chain,
        assignments: prev,
      });

      return moved || prev;
    });
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">작업 배정</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined">배정 초기화</Button>
            <Button variant="contained">배정 확정</Button>
          </Stack>
        </Box>
      }
    >
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        autoScroll={false}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Stack spacing={1.5}>
              <SearchInput
                placeholder="스타일명 또는 고객사 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">미배정 카드</Typography>
                <Typography variant="caption" color="text.secondary">
                  {filteredCards.length}건
                </Typography>
              </Box>
              <Stack spacing={1}>
                {filteredCards.map((card) => (
                  <Box
                    key={card.id}
                    sx={{
                      border: card.id === selectedCardId ? '1px solid' : '1px solid transparent',
                      borderColor: card.id === selectedCardId ? 'primary.main' : 'transparent',
                      borderRadius: 1,
                    }}
                  >
                    <StyleCard
                      card={card}
                      onSelect={() => setSelectedCardId(card.id)}
                    />
                  </Box>
                ))}
              </Stack>
            </Stack>
          </Grid>
          <Grid item xs={12} md={8}>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">라인 타임라인</Typography>
                <Typography variant="caption" color="text.secondary">
                  드래그 앤 드롭으로 배정하세요
                </Typography>
              </Box>
              <ScheduleTimeline
                lines={mockLines}
                days={days}
                assignments={assignments}
                onLinkPrev={handleLinkPrev}
              />
            </Stack>
          </Grid>
        </Grid>

        <DragOverlay style={{ zIndex: 50 }} >
          {activeDrag ? (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 2,
                backgroundColor: '#F3F4F6',
                opacity: 0.85,
                color: '#1F2937',
                boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
                border: '1px solid rgba(0,0,0,0.08)',
                minWidth: 220,
                maxWidth: 320,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {activeDrag.orderNo ? activeDrag.orderNo : '미배정 카드'}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {activeDrag.label}
              </Typography>
              {activeDrag.customer && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {activeDrag.customer}
                </Typography>
              )}
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>
    </AppPageContainer>
  );
};

export default AssignBoard;
