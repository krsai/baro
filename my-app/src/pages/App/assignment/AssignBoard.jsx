import React, { useMemo, useState } from 'react';
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

const getAssignmentTotalSeconds = (assignment) => {
  return getUsageSeconds(assignment).reduce((sum, item) => sum + item.seconds, 0);
};

const rebuildLineWithPush = ({
  lineId,
  targetId,
  insertItem,
  assignments,
  totalDays,
}) => {
  const lineItems = assignments
    .filter((item) => item.lineId === lineId)
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));

  const targetIndex = lineItems.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) return null;

  const before = lineItems.slice(0, targetIndex + 1);
  const after = lineItems.slice(targetIndex + 1);

  const placed = before.map((item) => ({ ...item }));
  let cursorStart = placed[placed.length - 1].endIndex;

  const queue = [insertItem, ...after];

  for (const item of queue) {
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

    cursorStart = planned.endIndex;
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

  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 10 }).map((_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
      return {
        key: buildDateKey(date),
        label: `${date.getMonth() + 1}/${date.getDate()} (${weekday})`,
      };
    });
  }, []);

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
        dayIndex = targetOnDay.endIndex;
      }
    } else {
      const dropId = over.id;
      const [lineIdRaw, dayIndexRaw] = String(dropId).split('::');
      lineId = lineIdRaw;
      dayIndex = Number(dayIndexRaw);
      targetOnDay = assignments.find(
        (item) => item.lineId === lineId && dayIndex >= item.startIndex && dayIndex <= item.endIndex
      );
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

      if (targetOnDay) {
        const pushed = rebuildLineWithPush({
          lineId,
          targetId: targetOnDay.id,
          insertItem: newItem,
          assignments,
          totalDays: days.length,
        });

        if (pushed) {
          setAssignments(pushed);
        }
        setActiveDrag(null);
        return;
      }

      const planned = planAssignment({
        startIndex: dayIndex,
        totalSeconds: card.totalSeconds,
        lineId,
        assignments,
        totalDays: days.length,
      });

      if (!planned) {
        setActiveDrag(null);
        return;
      }

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

    if (String(active.id).startsWith('assign-')) {
      const assignmentId = String(active.id).replace('assign-', '');
      setAssignments((prev) => {
        const target = prev.find((item) => item.id === assignmentId);
        if (!target) return prev;

        const filtered = prev.filter((item) => item.id !== assignmentId);

        if (targetOnDay && targetOnDay.id !== assignmentId) {
          const pushed = rebuildLineWithPush({
            lineId,
            targetId: targetOnDay.id,
            insertItem: { ...target, totalSeconds: getAssignmentTotalSeconds(target) },
            assignments: filtered,
            totalDays: days.length,
          });

          if (pushed) return pushed;
          return prev;
        }

        const totalSeconds = getUsageSeconds(target).reduce((sum, item) => sum + item.seconds, 0);

        const planned = planAssignment({
          startIndex: dayIndex,
          totalSeconds,
          lineId,
          assignments: filtered,
          totalDays: days.length,
        });

        if (!planned) return prev;

        return filtered.concat({
          ...target,
          lineId,
          ...planned,
        });
      });
      setActiveDrag(null);
    }
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
              <ScheduleTimeline lines={mockLines} days={days} assignments={assignments} />
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