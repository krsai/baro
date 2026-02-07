import React, { useMemo, useRef, useState } from 'react';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleCard from './components/StyleCard';
import ScheduleTimeline from './components/ScheduleTimeline';

const DAILY_CAPACITY_SECONDS = 28800;

const BASIS_COLORS = {
  PT: { color: '#DCE9FF', stripe: '#9FB9F2' },
  ST: { color: '#DFF3E5', stripe: '#9ED5B3' },
  NONE: { color: '#F7D8E0', stripe: '#E6A8B6' },
};

const mockBackend = {
  factories: [
    {
      id: 'F-01',
      name: '안산 1공장',
      lines: [
        {
          id: 'L-01',
          name: 'A-라인',
          workStart: '08:00',
          workEnd: '17:00',
          breakMinutes: 60,
          headcount: 12,
          dailyCapacitySeconds: 12 * 8 * 60 * 60,
        },
        {
          id: 'L-02',
          name: 'B-라인',
          workStart: '08:00',
          workEnd: '17:00',
          breakMinutes: 60,
          headcount: 10,
          dailyCapacitySeconds: 10 * 8 * 60 * 60,
        },
      ],
      employees: [
        { id: 'E-001', name: '김하늘', lineId: 'L-01' },
        { id: 'E-002', name: '이준호', lineId: 'L-01' },
        { id: 'E-003', name: '박서윤', lineId: 'L-02' },
        { id: 'E-004', name: '정도현', lineId: 'L-02' },
      ],
    },
    {
      id: 'F-02',
      name: '광주 2공장',
      lines: [
        {
          id: 'L-03',
          name: 'C-라인',
          workStart: '08:00',
          workEnd: '17:00',
          breakMinutes: 60,
          headcount: 8,
          dailyCapacitySeconds: 8 * 8 * 60 * 60,
        },
      ],
      employees: [
        { id: 'E-101', name: '최유진', lineId: 'L-03' },
        { id: 'E-102', name: '오세훈', lineId: 'L-03' },
      ],
    },
  ],
  holidays: ['2026-02-10'],
  orders: [
    {
      id: 'C-001',
      originOrderId: 'C-001',
      orderNo: 'ORD-2026-001',
      customer: '더산',
      styleName: '클래식 데님 자켓',
      styleCode: 'DS-DJ-01',
      quantity: 1200,
      processCount: 12,
      status: 'PT',
      totalSeconds: 980000,
      totalPt: 980000,
      totalStByFactory: [
        { factoryId: 'F-01', factoryName: '안산 1공장', seconds: 1100000 },
        { factoryId: 'F-02', factoryName: '광주 2공장', seconds: 1040000 },
      ],
    },
    {
      id: 'C-002',
      originOrderId: 'C-002',
      orderNo: 'ORD-2026-002',
      customer: '엘라',
      styleName: '오버핏 셔츠',
      styleCode: 'EL-OS-02',
      quantity: 800,
      processCount: 9,
      status: 'ST',
      totalSeconds: 650000,
      totalPt: 650000,
      totalStByFactory: [
        { factoryId: 'F-01', factoryName: '안산 1공장', seconds: 720000 },
        { factoryId: 'F-02', factoryName: '광주 2공장', seconds: 680000 },
      ],
    },
    {
      id: 'C-003',
      originOrderId: 'C-003',
      orderNo: 'ORD-2026-003',
      customer: '앤블루',
      styleName: '플리츠 스커트',
      quantity: 500,
      processCount: 7,
      status: 'NONE',
      totalSeconds: 0,
      totalPt: 0,
      totalStByFactory: [],
    },
    {
      id: 'C-004',
      originOrderId: 'C-004',
      orderNo: 'ORD-2026-004',
      customer: '루나',
      styleName: '코튼 트렌치 코트',
      styleCode: 'LU-TC-11',
      quantity: 350,
      processCount: 10,
      status: 'PT',
      totalSeconds: 820000,
      totalPt: 820000,
      totalStByFactory: [
        { factoryId: 'F-01', factoryName: '안산 1공장', seconds: 910000 },
        { factoryId: 'F-02', factoryName: '광주 2공장', seconds: 870000 },
      ],
    },
    {
      id: 'C-005',
      originOrderId: 'C-005',
      orderNo: 'ORD-2026-005',
      customer: '미라',
      styleName: '릴랙스 니트 팬츠',
      styleCode: 'MI-KP-07',
      quantity: 900,
      processCount: 8,
      status: 'ST',
      totalSeconds: 540000,
      totalPt: 540000,
      totalStByFactory: [
        { factoryId: 'F-01', factoryName: '안산 1공장', seconds: 600000 },
        { factoryId: 'F-02', factoryName: '광주 2공장', seconds: 590000 },
      ],
    },
    {
      id: 'C-006',
      originOrderId: 'C-006',
      orderNo: 'ORD-2026-006',
      customer: '노바',
      styleName: '라운드 스웻 셋업',
      quantity: 420,
      processCount: 6,
      status: 'NONE',
      totalSeconds: 0,
      totalPt: 0,
      totalStByFactory: [],
    },
  ],
};

const initialCards = mockBackend.orders;
const mockLines = mockBackend.factories.flatMap((factory) =>
  factory.lines.map((line) => ({
    id: line.id,
    name: line.name,
    headcount: line.headcount,
    shift: `${line.workStart}~${line.workEnd}`,
    dailyCapacitySeconds: line.dailyCapacitySeconds,
    factoryId: factory.id,
    factoryName: factory.name,
  }))
);

const initialAssignments = [];

const HOLIDAY_SET = new Set(mockBackend.holidays || []);

const getLineCapacitySeconds = (lineId) => {
  if (!lineId) return DAILY_CAPACITY_SECONDS;
  const line = mockLines.find((item) => item.id === lineId);
  return line?.dailyCapacitySeconds ?? DAILY_CAPACITY_SECONDS;
};

const isNonWorkingDay = (dayIndex, days) => {
  if (!Array.isArray(days)) return false;
  const day = days[dayIndex];
  if (!day) return false;
  return day.isSunday || day.isHoliday;
};

const getDayCapacitySeconds = (dayIndex, lineId, days) => {
  if (isNonWorkingDay(dayIndex, days)) return 0;
  return getLineCapacitySeconds(lineId);
};

const hasPt = (card) => Number(card.totalPt) > 0;
const hasSt = (card) =>
  Array.isArray(card.totalStByFactory) && card.totalStByFactory.some((item) => item.seconds > 0);

const getCardBasis = (card) => {
  if (!hasPt(card) && !hasSt(card)) return 'NONE';
  if (card.status === 'ST') return 'ST';
  return 'PT';
};

const resolveCardStatus = (card, nextPt, nextStList) => {
  const ptPresent = Number(nextPt) > 0;
  const stPresent =
    Array.isArray(nextStList) && nextStList.some((item) => item.seconds > 0);
  if (!ptPresent && !stPresent) return 'NONE';
  return card.status === 'ST' ? 'ST' : 'PT';
};

const scaleValue = (value, ratio) => {
  if (value == null) return value;
  const scaled = Math.round(value * ratio);
  if (value > 0 && ratio > 0 && scaled === 0) return 1;
  return scaled;
};

const scaleStList = (list, ratio) => {
  if (!Array.isArray(list)) return list;
  return list.map((item) => ({ ...item, seconds: scaleValue(item.seconds, ratio) }));
};

const getCardOriginId = (card) => card?.originOrderId ?? card?.id;

const mergeStLists = (first = [], second = []) => {
  const map = new Map();
  const applyItem = (item) => {
    if (!item) return;
    const key = item.factoryId || item.factoryName || JSON.stringify(item);
    const existing = map.get(key);
    if (existing) {
      existing.seconds = (existing.seconds ?? 0) + (item.seconds ?? 0);
    } else {
      map.set(key, { ...item });
    }
  };
  first.forEach(applyItem);
  second.forEach(applyItem);
  return Array.from(map.values());
};

const mergeCardData = (target, source) => {
  const mergedQuantity = (target.quantity ?? 0) + (source.quantity ?? 0);
  const mergedTotalSeconds = (target.totalSeconds ?? 0) + (source.totalSeconds ?? 0);
  const mergedTotalPt = (target.totalPt ?? 0) + (source.totalPt ?? 0);
  const mergedSt = mergeStLists(target.totalStByFactory ?? [], source.totalStByFactory ?? []);
  return {
    ...target,
    quantity: mergedQuantity,
    totalSeconds: mergedTotalSeconds,
    totalPt: mergedTotalPt,
    totalStByFactory: mergedSt,
    status: resolveCardStatus(target, mergedTotalPt, mergedSt),
    originOrderId: getCardOriginId(target),
  };
};

const recomputeAssignmentRange = (assignment, totalSeconds, days) => {
  const startDayOffsetPercent = assignment.startDayOffsetPercent ?? 0;
  const startIndex = assignment.startIndex;
  const startCapacity = getDayCapacitySeconds(startIndex, assignment.lineId, days);
  const startOffsetSeconds = (startDayOffsetPercent / 100) * startCapacity;
  const startAvailable = Math.max(startCapacity - startOffsetSeconds, 0);
  let remaining = totalSeconds;
  const startUse = Math.min(startAvailable, remaining);
  const startDayPercent = startCapacity > 0 ? (startUse / startCapacity) * 100 : 0;
  remaining -= startUse;

  if (remaining <= 0) {
    return {
      startIndex,
      endIndex: startIndex,
      startDayOffsetPercent,
      startDayPercent,
      endDayPercent: startDayPercent,
    };
  }

  let endIndex = startIndex;
  const hasCalendar = Array.isArray(days);
  let cursor = startIndex + 1;
  while (remaining > 0) {
    if (hasCalendar && cursor >= days.length) break;
    if (hasCalendar && isNonWorkingDay(cursor, days)) {
      endIndex = cursor;
      cursor += 1;
      continue;
    }
    const dailyCapacity = getDayCapacitySeconds(cursor, assignment.lineId, days);
    if (dailyCapacity <= 0) {
      endIndex = cursor;
      cursor += 1;
      continue;
    }
    endIndex = cursor;
    if (remaining <= dailyCapacity) {
      const endDayPercent = (remaining / dailyCapacity) * 100;
      return {
        startIndex,
        endIndex,
        startDayOffsetPercent,
        startDayPercent,
        endDayPercent,
      };
    }
    remaining -= dailyCapacity;
    cursor += 1;
  }

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent,
    startDayPercent,
    endDayPercent: 100,
  };
};

const resolveCardTotalSeconds = (card, lineId) => {
  const basis = getCardBasis(card);
  if (basis === 'NONE') return 0;
  if (basis === 'ST') {
    const line = mockLines.find((item) => item.id === lineId);
    const factoryId = line?.factoryId;
    const match = card.totalStByFactory?.find((item) => item.factoryId === factoryId);
    return match?.seconds ?? card.totalSeconds ?? 0;
  }
  return card.totalPt ?? card.totalSeconds ?? 0;
};

const buildDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDays = (baseDate, count, holidaySet = new Set()) => {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    const key = buildDateKey(date);
    const isSunday = date.getDay() === 0;
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()} (${weekday})`,
      isSunday,
      isHoliday: holidaySet.has(key),
    };
  });
};

const getUsageSeconds = (assignment, days) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  const usage = [];

  for (let i = assignment.startIndex; i <= assignment.endIndex; i += 1) {
    const dailyCapacity = getDayCapacitySeconds(i, assignment.lineId, days);
    if (dailyCapacity <= 0) {
      usage.push({ dayIndex: i, seconds: 0 });
      continue;
    }
    if (assignment.startIndex === assignment.endIndex) {
      usage.push({ dayIndex: i, seconds: dailyCapacity * startPercent });
      continue;
    }
    if (i === assignment.startIndex) {
      usage.push({ dayIndex: i, seconds: dailyCapacity * startPercent });
      continue;
    }
    if (i === assignment.endIndex) {
      usage.push({ dayIndex: i, seconds: dailyCapacity * endPercent });
      continue;
    }
    usage.push({ dayIndex: i, seconds: dailyCapacity });
  }

  return usage;
};

const buildUsageMap = (assignments, lineId, totalDays, days) => {
  const usage = Array.from({ length: totalDays }).map(() => 0);
  assignments
    .filter((item) => item.lineId === lineId)
    .forEach((item) => {
      getUsageSeconds(item, days).forEach(({ dayIndex, seconds }) => {
        if (usage[dayIndex] != null) usage[dayIndex] += seconds;
      });
    });
  return usage;
};

const planAssignment = ({ startIndex, totalSeconds, lineId, assignments, totalDays, days }) => {
  const usage = buildUsageMap(assignments, lineId, totalDays, days);
  let remaining = totalSeconds;
  let dayIndex = startIndex;
  while (dayIndex < totalDays && isNonWorkingDay(dayIndex, days)) {
    dayIndex += 1;
  }
  if (dayIndex >= totalDays) return null;

  const startCapacity = getDayCapacitySeconds(dayIndex, lineId, days);
  if (startCapacity <= 0 || usage[dayIndex] >= startCapacity) return null;

  const startOffsetPercent = (usage[dayIndex] / startCapacity) * 100;
  const startAvailable = startCapacity - usage[dayIndex];
  const startUse = Math.min(startAvailable, remaining);
  const startDayPercent = (startUse / startCapacity) * 100;
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

  let cursor = dayIndex + 1;
  while (cursor < totalDays && remaining > 0) {
    if (isNonWorkingDay(cursor, days)) {
      cursor += 1;
      continue;
    }
    if (usage[cursor] > 0) {
      return null;
    }
    const dailyCapacity = getDayCapacitySeconds(cursor, lineId, days);
    if (dailyCapacity <= 0) {
      cursor += 1;
      continue;
    }
    if (remaining <= dailyCapacity) {
      const endDayPercent = (remaining / dailyCapacity) * 100;
      return {
        startIndex: dayIndex,
        endIndex: cursor,
        startDayOffsetPercent: startOffsetPercent,
        startDayPercent,
        endDayPercent,
      };
    }
    remaining -= dailyCapacity;
    cursor += 1;
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

const getAssignmentTotalSeconds = (assignment, days) => {
  return getUsageSeconds(assignment, days).reduce((sum, item) => sum + item.seconds, 0);
};

const getNextStartIndex = (assignment, days) => {
  if (!assignment) return null;
  const usage = getUsageSeconds(assignment, days);
  const lastUsage = usage.find((item) => item.dayIndex === assignment.endIndex);
  if (!lastUsage) return assignment.endIndex;
  const dailyCapacity = getDayCapacitySeconds(assignment.endIndex, assignment.lineId, days);
  if (dailyCapacity > 0 && lastUsage.seconds < dailyCapacity) {
    return assignment.endIndex;
  }
  let nextIndex = assignment.endIndex + 1;
  if (!Array.isArray(days)) return nextIndex;
  while (nextIndex < days.length && isNonWorkingDay(nextIndex, days)) {
    nextIndex += 1;
  }
  return nextIndex;
};

const rebuildLineWithInsert = ({
  lineId,
  insertIndex,
  insertAfterId,
  insertBeforeId,
  insertItem,
  assignments,
  totalDays,
  days,
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
    insertIndex = getNextStartIndex(before[before.length - 1], days);
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
    totalSeconds: insertItem.totalSeconds ?? getAssignmentTotalSeconds(insertItem, days),
    lineId,
    assignments: placed,
    totalDays,
    days,
  });

  if (!planned) return null;

  placed.push({
    ...insertItem,
    lineId,
    ...planned,
  });

  let cursorStart = getNextStartIndex(placed[placed.length - 1], days);

  const queue = after;

  for (const item of queue) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item, days);
    planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(placed[placed.length - 1], days);
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

const buildConnectedChain = (items, startIndex, days) => {
  if (startIndex == null || startIndex < 0) return [];
  const chain = [];
  for (let i = startIndex; i < items.length; i += 1) {
    if (i === startIndex) {
      chain.push(items[i]);
      continue;
    }
    const expectedStart = getNextStartIndex(chain[chain.length - 1], days);
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
  days,
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
    insertIndex = getNextStartIndex(before[before.length - 1], days);
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
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item, days);
    const planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(placed[placed.length - 1], days);
  }

  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
      const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item, days);
      const planned = planAssignment({
        startIndex: cursorStart,
        totalSeconds,
        lineId,
        assignments: placed,
        totalDays,
        days,
      });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

      cursorStart = getNextStartIndex(placed[placed.length - 1], days);
    }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const rebuildLineWithReplace = ({ lineId, targetId, newItem, assignments, totalDays, days }) => {
  const lineItems = assignments
    .filter((item) => item.lineId === lineId)
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));
  const targetIndex = lineItems.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) return null;
  const before = lineItems.slice(0, targetIndex);
  const after = lineItems.slice(targetIndex + 1);
  const insertIndex = newItem.startIndex ?? lineItems[targetIndex].startIndex;
  if (insertIndex == null || insertIndex >= totalDays) return null;

  const placed = before.map((item) => ({ ...item }));
  const planned = planAssignment({
    startIndex: insertIndex,
    totalSeconds: newItem.totalSeconds ?? getAssignmentTotalSeconds(newItem, days),
    lineId,
    assignments: placed,
    totalDays,
    days,
  });
  if (!planned) return null;

  placed.push({
    ...newItem,
    lineId,
    ...planned,
  });

  let cursorStart = getNextStartIndex(placed[placed.length - 1], days);
  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds = item.totalSeconds ?? getAssignmentTotalSeconds(item, days);
    const nextPlanned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
    });
    if (!nextPlanned) return null;
    placed.push({
      ...item,
      lineId,
      ...nextPlanned,
    });
    cursorStart = getNextStartIndex(placed[placed.length - 1], days);
  }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const AssignBoard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [cards, setCards] = useState(() => initialCards);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [activeDrag, setActiveDrag] = useState(null);
  const startDateRef = useRef(new Date());
  const splitCounterRef = useRef(1);
  const [days, setDays] = useState(() => buildDays(startDateRef.current, 10, HOLIDAY_SET));

  const ensureDaysLength = (minLength) => {
    if (days.length >= minLength) return days;
    const next = buildDays(startDateRef.current, minLength, HOLIDAY_SET);
    setDays(next);
    return next;
  };

  const extendDays = (extra = 10) => {
    return ensureDaysLength(days.length + extra);
  };

  const tryPlanAssignment = (params) => {
    let planned = planAssignment({ ...params, totalDays: days.length, days });
    if (!planned) {
      const extended = extendDays(10);
      planned = planAssignment({ ...params, totalDays: extended.length, days: extended });
    }
    return planned;
  };

  const tryRebuildLineWithInsert = (params) => {
    let result = rebuildLineWithInsert({ ...params, totalDays: days.length, days });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithInsert({ ...params, totalDays: extended.length, days: extended });
    }
    return result;
  };

  const tryRebuildLineWithChain = (params) => {
    let result = rebuildLineWithChain({ ...params, totalDays: days.length, days });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithChain({ ...params, totalDays: extended.length, days: extended });
    }
    return result;
  };

  const tryRebuildLineWithReplace = (params) => {
    let result = rebuildLineWithReplace({ ...params, totalDays: days.length, days });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithReplace({ ...params, totalDays: extended.length, days: extended });
    }
    return result;
  };

  const assignedCardIds = useMemo(() => {
    return new Set(assignments.map((item) => item.cardId).filter(Boolean));
  }, [assignments]);

  const assignmentsForRender = useMemo(() => {
    return assignments.map((item) => {
      if (item.quantity != null) return item;
      if (!item.cardId) return item;
      const card = cards.find((source) => source.id === item.cardId);
      if (!card) return item;
      return { ...item, quantity: card.quantity };
    });
  }, [assignments, cards]);

  const filteredCards = useMemo(() => {
    const pool = cards.filter((card) => !assignedCardIds.has(card.id));
    if (!searchTerm) return pool;
    const lower = searchTerm.toLowerCase();
    return pool.filter(
      (card) =>
        card.styleName.toLowerCase().includes(lower) ||
        card.customer.toLowerCase().includes(lower) ||
        (card.orderNo ? card.orderNo.toLowerCase().includes(lower) : false)
    );
  }, [searchTerm, assignedCardIds]);

  const handleDragStart = (event) => {
    const { active } = event;
    if (!active) return;
    const id = String(active.id);
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = cards.find((item) => item.id === cardId);
      if (card) {
        setActiveDrag({
          type: 'card',
          label: card.styleName,
          orderNo: card.orderNo,
          previewUrl: card.previewUrl,
          imageUrl: card.imageUrl,
          thumbnailUrl: card.thumbnailUrl,
          customer: card.customer,
        });
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

    const activeId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith('card-drop-')) {
      const targetCardId = overId.replace('card-drop-', '');
      if (activeId.startsWith('card-')) {
        const sourceCardId = activeId.replace('card-', '');
        if (mergeUnassignedCards(targetCardId, sourceCardId)) {
          setActiveDrag(null);
          return;
        }
      }
      if (activeId.startsWith('assign-')) {
        const assignmentId = activeId.replace('assign-', '');
        if (mergeAssignmentIntoCardTarget(targetCardId, assignmentId)) {
          setActiveDrag(null);
          return;
        }
      }
    }

    if (overId.startsWith('assign-drop-')) {
      const targetId = overId.replace('assign-drop-', '');
      const targetAssignment = assignments.find((item) => item.id === targetId);
      if (targetAssignment && activeId.startsWith('card-')) {
        const sourceCardId = activeId.replace('card-', '');
        const sourceCard = cards.find((item) => item.id === sourceCardId);
        if (sourceCard && getAssignmentOriginId(targetAssignment) === getCardOriginId(sourceCard)) {
          if (mergeCardIntoAssignment(targetId, sourceCardId)) {
            setActiveDrag(null);
            return;
          }
        }
      }
      if (targetAssignment && activeId.startsWith('assign-')) {
        const sourceAssignmentId = activeId.replace('assign-', '');
        if (mergeAssignments(targetId, sourceAssignmentId)) {
          setActiveDrag(null);
          return;
        }
      }
    }

    let lineId = null;
    let dayIndex = null;
    let targetOnDay = null;

    if (overId.startsWith('assign-drop-')) {
      const targetId = overId.replace('assign-drop-', '');
      targetOnDay = assignments.find((item) => item.id === targetId);
      if (targetOnDay) {
        lineId = targetOnDay.lineId;
        dayIndex = targetOnDay.startIndex;
      }
    } else {
      const dropId = overId;
      const [lineIdRaw, dayIndexRaw] = String(dropId).split('::');
      lineId = lineIdRaw;
      dayIndex = Number(dayIndexRaw);
      targetOnDay = getTargetOnDay(assignments, lineId, dayIndex);
    }

    if (!lineId || dayIndex === null) {
      setActiveDrag(null);
      return;
    }

    if (activeId.startsWith('card-')) {
      const cardId = activeId.replace('card-', '');
      const card = cards.find((item) => item.id === cardId);
      if (!card) {
        setActiveDrag(null);
        return;
      }
      const basis = getCardBasis(card);
      if (basis === 'NONE') {
        setActiveDrag(null);
        return;
      }
      const totalSeconds = resolveCardTotalSeconds(card, lineId);
      if (!totalSeconds) {
        setActiveDrag(null);
        return;
      }
      const colors = BASIS_COLORS[basis] || BASIS_COLORS.PT;

      const newItem = {
        id: `A-${cardId}-${lineId}-${dayIndex}`,
        cardId,
        lineId,
        orderNo: card.orderNo ?? `ORD-NEW-${cardId}`,
        customer: card.customer,
        label: card.styleName,
        previewUrl: card.previewUrl,
        imageUrl: card.imageUrl,
        thumbnailUrl: card.thumbnailUrl,
        quantity: card.quantity,
        originOrderId: getCardOriginId(card) ?? cardId,
        basis,
        color: colors.color,
        stripeColor: colors.stripe,
        totalSeconds,
      };

      if (!targetOnDay) {
        const planned = tryPlanAssignment({
          startIndex: dayIndex,
          totalSeconds,
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

    if (activeId.startsWith('assign-')) {
      const assignmentId = activeId.replace('assign-', '');
      setAssignments((prev) => {
        const target = prev.find((item) => item.id === assignmentId);
        if (!target) return prev;

        const filtered = prev.filter((item) => item.id !== assignmentId);

        const totalSeconds = getAssignmentTotalSeconds(target, days);

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
      const insertIndex = getNextStartIndex(prevItem, days);
      if (insertIndex == null) return prev;
      const chain = buildConnectedChain(lineItems, targetIndex, days);
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

  const promptSplitQuantity = (quantity) => {
    if (!quantity || quantity <= 1) return null;
    const input = window.prompt(`분할할 수량을 입력하세요 (1 ~ ${quantity - 1})`);
    if (input == null) return null;
    const value = Number(input);
    if (!Number.isFinite(value)) return null;
    const qty = Math.floor(value);
    if (qty <= 0 || qty >= quantity) return null;
    return qty;
  };

  const buildSplitCard = (card, quantity, ratio, newId) => {
    const totalSeconds = scaleValue(card.totalSeconds, ratio);
    const totalPt = scaleValue(card.totalPt, ratio);
    const totalStByFactory = scaleStList(card.totalStByFactory, ratio);
    const originOrderId = getCardOriginId(card) ?? card.id;
    return {
      ...card,
      id: newId,
      originOrderId,
      quantity,
      totalSeconds,
      totalPt,
      totalStByFactory,
      status: resolveCardStatus(card, totalPt, totalStByFactory),
    };
  };

  const handleSplitCard = (cardId) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const quantity = Number(card.quantity);
    const splitQty = promptSplitQuantity(quantity);
    if (!splitQty) return;
    const remainQty = quantity - splitQty;
    const ratio = splitQty / quantity;
    const remainRatio = remainQty / quantity;
    const newId = `${card.id}-S${splitCounterRef.current++}`;
    const updatedCard = buildSplitCard(card, remainQty, remainRatio, card.id);
    const splitCard = buildSplitCard(card, splitQty, ratio, newId);

    setCards((prev) => prev.map((item) => (item.id === card.id ? updatedCard : item)).concat(splitCard));
  };

  const handleSplitAssignment = (assignmentId) => {
    const target = assignments.find((item) => item.id === assignmentId);
    if (!target?.cardId) return;
    const card = cards.find((item) => item.id === target.cardId);
    if (!card) return;
    const quantity = Number(card.quantity ?? target.quantity);
    const splitQty = promptSplitQuantity(quantity);
    if (!splitQty) return;
    const remainQty = quantity - splitQty;
    const ratio = splitQty / quantity;
    const remainRatio = remainQty / quantity;
    const newId = `${card.id}-S${splitCounterRef.current++}`;
    const updatedCard = buildSplitCard(card, remainQty, remainRatio, card.id);
    const splitCard = buildSplitCard(card, splitQty, ratio, newId);

    setCards((prev) => prev.map((item) => (item.id === card.id ? updatedCard : item)).concat(splitCard));

    const scaledSeconds = scaleValue(target.totalSeconds, remainRatio) || 1;
    const range = recomputeAssignmentRange(target, scaledSeconds, days);
    setAssignments((prev) =>
      prev.map((item) =>
        item.id === assignmentId
          ? {
              ...item,
              quantity: remainQty,
              totalSeconds: scaledSeconds,
              ...range,
            }
          : item
      )
    );
  };

  const getAssignmentOriginId = (assignment) => {
    if (!assignment) return null;
    if (assignment.originOrderId) return assignment.originOrderId;
    const card = cards.find((item) => item.id === assignment.cardId);
    return getCardOriginId(card) ?? assignment.cardId ?? assignment.id;
  };

  const buildCardFromAssignment = (assignment) => {
    const card = cards.find((item) => item.id === assignment.cardId);
    if (card) return card;
    return {
      id: assignment.cardId ?? assignment.id,
      originOrderId: assignment.originOrderId ?? assignment.cardId ?? assignment.id,
      quantity: assignment.quantity ?? 0,
      totalSeconds: assignment.totalSeconds ?? 0,
      totalPt: assignment.totalSeconds ?? 0,
      totalStByFactory: [],
      status: assignment.basis === 'ST' ? 'ST' : 'PT',
    };
  };

  const mergeUnassignedCards = (targetId, sourceId) => {
    if (!targetId || !sourceId || targetId === sourceId) return false;
    let merged = false;
    setCards((prev) => {
      const target = prev.find((item) => item.id === targetId);
      const source = prev.find((item) => item.id === sourceId);
      if (!target || !source) return prev;
      if (getCardOriginId(target) !== getCardOriginId(source)) return prev;
      merged = true;
      const next = mergeCardData(target, source);
      return prev.filter((item) => item.id !== sourceId).map((item) => (item.id === targetId ? next : item));
    });
    return merged;
  };

  const mergeCardIntoAssignment = (targetAssignmentId, sourceCardId) => {
    const target = assignments.find((item) => item.id === targetAssignmentId);
    const sourceCard = cards.find((item) => item.id === sourceCardId);
    if (!target || !sourceCard) return false;
    if (getAssignmentOriginId(target) !== getCardOriginId(sourceCard)) return false;

    const addedSeconds = resolveCardTotalSeconds(sourceCard, target.lineId);
    const mergedSeconds = (target.totalSeconds ?? 0) + addedSeconds;
    const mergedQuantity = (target.quantity ?? 0) + (sourceCard.quantity ?? 0);

    setCards((prev) => {
      const targetCard = prev.find((item) => item.id === target.cardId) ?? sourceCard;
      const mergedCard = mergeCardData(targetCard, sourceCard);
      return prev
        .filter((item) => item.id !== sourceCardId)
        .map((item) => (item.id === target.cardId ? mergedCard : item));
    });

    setAssignments((prev) => {
      const updated = {
        ...target,
        quantity: mergedQuantity,
        totalSeconds: mergedSeconds,
      };
      const rest = prev.filter((item) => item.id !== targetAssignmentId);
      const replaced = tryRebuildLineWithReplace({
        lineId: target.lineId,
        targetId: targetAssignmentId,
        newItem: updated,
        assignments: rest.concat(target),
      });
      return replaced || prev;
    });

    return true;
  };

  const mergeAssignmentIntoCardTarget = (targetCardId, sourceAssignmentId) => {
    const targetCard = cards.find((item) => item.id === targetCardId);
    const sourceAssignment = assignments.find((item) => item.id === sourceAssignmentId);
    if (!targetCard || !sourceAssignment) return false;
    if (getCardOriginId(targetCard) !== getAssignmentOriginId(sourceAssignment)) return false;

    const sourceCard = buildCardFromAssignment(sourceAssignment);
    const mergedCard = mergeCardData(targetCard, sourceCard);
    setCards((prev) =>
      prev
        .filter((item) => item.id !== sourceCard.id)
        .map((item) => (item.id === targetCardId ? mergedCard : item))
    );
    setAssignments((prev) => prev.filter((item) => item.id !== sourceAssignmentId));
    return true;
  };

  const mergeAssignments = (targetAssignmentId, sourceAssignmentId) => {
    if (!targetAssignmentId || !sourceAssignmentId || targetAssignmentId === sourceAssignmentId) return false;
    const target = assignments.find((item) => item.id === targetAssignmentId);
    const source = assignments.find((item) => item.id === sourceAssignmentId);
    if (!target || !source) return false;
    if (getAssignmentOriginId(target) !== getAssignmentOriginId(source)) return false;

    const sourceCard = buildCardFromAssignment(source);
    const addedSeconds = resolveCardTotalSeconds(sourceCard, target.lineId);
    const mergedSeconds = (target.totalSeconds ?? 0) + addedSeconds;
    const mergedQuantity = (target.quantity ?? 0) + (sourceCard.quantity ?? 0);

    setCards((prev) => {
      const targetCard = prev.find((item) => item.id === target.cardId) ?? buildCardFromAssignment(target);
      const mergedCard = mergeCardData(targetCard, sourceCard);
      return prev
        .filter((item) => item.id !== sourceCard.id || sourceCard.id === targetCard.id)
        .map((item) => (item.id === targetCard.id ? mergedCard : item));
    });

    setAssignments((prev) => {
      const updated = {
        ...target,
        quantity: mergedQuantity,
        totalSeconds: mergedSeconds,
      };
      const rest = prev.filter((item) => item.id !== sourceAssignmentId);
      const replaced = tryRebuildLineWithReplace({
        lineId: target.lineId,
        targetId: targetAssignmentId,
        newItem: updated,
        assignments: rest,
      });
      return replaced || prev;
    });

    return true;
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
                      onSplit={() => handleSplitCard(card.id)}
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
                assignments={assignmentsForRender}
                onLinkPrev={handleLinkPrev}
                onSplit={handleSplitAssignment}
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
                transform: 'scale(1.02)',
                cursor: 'grabbing',
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
