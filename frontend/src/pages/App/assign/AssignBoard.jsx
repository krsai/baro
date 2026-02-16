import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleCard from './components/StyleCard';
import ScheduleTimeline from './components/ScheduleTimeline';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import {
  HOLIDAY_UPDATED_EVENT,
  STORAGE_KEYS,
  loadHolidays,
  loadOrders,
} from '../../../utils/localData';
import { normalizeProcesses } from '../../../utils/processTime';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const DAILY_CAPACITY_SECONDS = 8 * 60 * 60;

const BASIS_COLORS = {
  PT: { color: '#DCE9FF', stripe: '#9FB9F2' },
  AT: { color: '#DFF3E5', stripe: '#9ED5B3' },
  NONE: { color: '#F7D8E0', stripe: '#E6A8B6' },
};

const initialCards = [];
const initialLines = [];
const initialAssignments = [];
let runtimeLines = [];

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  return Math.round(parsed);
};

const normalizeKey = (value) => String(value ?? '').trim();
const normalizeColorKey = (value) => normalizeKey(value).toUpperCase();

const sumSizeQuantities = (sizeQuantities = {}) =>
  Object.values(sizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0);

const sumLegacyQuantities = (rows = []) =>
  rows.reduce((sum, row) => sum + (Number(row?.quantity) || 0), 0);

const resolveItemQuantity = (item) => {
  if (Number(item?.totalQuantity) > 0) return Number(item.totalQuantity);
  if (item?.sizeQuantities && typeof item.sizeQuantities === 'object') {
    const qty = sumSizeQuantities(item.sizeQuantities);
    if (qty > 0) return qty;
  }
  if (Array.isArray(item?.quantities)) {
    const qty = sumLegacyQuantities(item.quantities);
    if (qty > 0) return qty;
  }
  return 0;
};

const resolveColorBucketsFromLegacyRows = (rows = []) => {
  const bucket = new Map();
  rows.forEach((row) => {
    const quantity = Number(row?.quantity) || 0;
    if (quantity <= 0) return;
    const colorKey = normalizeColorKey(row?.colorId || row?.color || row?.gender || 'UNSPEC');
    bucket.set(colorKey, (bucket.get(colorKey) || 0) + quantity);
  });
  return Array.from(bucket.entries()).map(([colorId, quantity]) => ({ colorId, quantity }));
};

const resolveItemColorBuckets = (item) => {
  const fromLegacyRows = resolveColorBucketsFromLegacyRows(
    Array.isArray(item?.quantities) ? item.quantities : []
  );
  if (fromLegacyRows.length > 0) return fromLegacyRows;

  const fallbackQuantity = resolveItemQuantity(item);
  if (fallbackQuantity <= 0) return [];

  const fallbackColor = normalizeColorKey(item?.colorId || item?.colorCode || item?.gender || 'UNSPEC');
  return [{ colorId: fallbackColor, quantity: fallbackQuantity }];
};

const mergeFactorySeconds = (first = [], second = []) => {
  const map = new Map();
  [...first, ...second].forEach((entry) => {
    if (!entry) return;
    const key = normalizeKey(entry.factoryId || entry.factoryName);
    if (!map.has(key)) {
      map.set(key, { ...entry, seconds: Number(entry.seconds) || 0 });
      return;
    }
    const current = map.get(key);
    current.seconds = (current.seconds || 0) + (Number(entry.seconds) || 0);
  });
  return Array.from(map.values());
};

const getFactoryMappedSeconds = (source, factoryId) => {
  if (source == null) return null;
  if (Array.isArray(source)) {
    const match = source.find((item) => normalizeKey(item?.factoryId) === normalizeKey(factoryId));
    return toSeconds(match?.seconds);
  }
  if (typeof source === 'object') {
    const byRaw = toSeconds(source[factoryId]);
    if (byRaw != null) return byRaw;
    return toSeconds(source[String(factoryId)]);
  }
  return null;
};

const getProcessSeconds = (process, factoryId, field) => {
  // PT/AT are now factory-common (no per-factory values)
  return toSeconds(process?.[field]);
};

const getTotalByFactory = (processes, field, factoryId, quantity) =>
  processes.reduce((sum, process) => {
    const perPiece = getProcessSeconds(process, factoryId, field);
    if (perPiece == null) return sum;
    return sum + perPiece * quantity;
  }, 0);

const createCardId = (orderId, styleId, colorId) =>
  `${normalizeKey(orderId)}::${normalizeKey(styleId)}::${normalizeColorKey(colorId)}`;

const buildCardsFromOrders = ({ orders, styles, factories, colorNameMap }) => {
  const safeFactories = Array.isArray(factories) ? factories : [];
  const styleMap = new Map((Array.isArray(styles) ? styles : []).map((style) => [style.id, style]));
  const cards = [];
  const cardMap = new Map();

  const upsertCard = (nextCard) => {
    const existing = cardMap.get(nextCard.id);
    if (!existing) {
      cardMap.set(nextCard.id, nextCard);
      cards.push(nextCard);
      return;
    }

    const mergedTotalPt = (existing.totalPt ?? 0) + (nextCard.totalPt ?? 0);
    const mergedTotalAt = (existing.totalAt ?? 0) + (nextCard.totalAt ?? 0);
    const mergedHasAt = mergedTotalAt > 0 || existing.status === 'AT' || nextCard.status === 'AT';
    const mergedHasPt = mergedTotalPt > 0;
    const mergedStatus = mergedHasAt ? 'AT' : mergedHasPt ? 'PT' : 'NONE';

    const merged = {
      ...existing,
      quantity: (existing.quantity ?? 0) + (nextCard.quantity ?? 0),
      totalSeconds: (existing.totalSeconds ?? 0) + (nextCard.totalSeconds ?? 0),
      totalPt: mergedTotalPt,
      totalAt: mergedTotalAt,
      status: mergedStatus,
      processCount: Math.max(existing.processCount ?? 0, nextCard.processCount ?? 0),
    };
    cardMap.set(nextCard.id, merged);
    const index = cards.findIndex((card) => card.id === nextCard.id);
    if (index >= 0) cards[index] = merged;
  };

  (Array.isArray(orders) ? orders : []).forEach((order, orderIndex) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item, itemIndex) => {
      const styleId = item?.styleId || '';
      if (!styleId) return;

      const style = styleMap.get(styleId);
      const processes = normalizeProcesses(style?.processes);
      const colorBuckets = resolveItemColorBuckets(item);
      if (colorBuckets.length === 0) return;

      colorBuckets.forEach(({ colorId, quantity }) => {
        if ((Number(quantity) || 0) <= 0) return;

        const normalizedColor = normalizeColorKey(colorId);
        const colorName = colorNameMap.get(normalizedColor) || normalizedColor || '색상 없음';
        // PT/AT are factory-common values (not per-factory)
        const totalPt = getTotalByFactory(processes, 'pt', null, quantity);
        const totalAt = getTotalByFactory(processes, 'at', null, quantity);
        const hasAt = totalAt > 0;
        const hasPt = totalPt > 0;
        const status = hasAt ? 'AT' : hasPt ? 'PT' : 'NONE';
        const totalSeconds = hasAt ? totalAt : totalPt;

        upsertCard({
          id: createCardId(order?.id ?? order?.orderNumber ?? `order-${orderIndex}`, styleId, normalizedColor),
          originOrderId: createCardId(
            order?.id ?? order?.orderNumber ?? `order-${orderIndex}`,
            styleId,
            normalizedColor
          ),
          orderNo: order?.orderNumber || order?.id || '-',
          customer: order?.customerName || order?.customer || '-',
          styleId,
          styleName: item?.styleName || style?.name || `스타일 ${itemIndex + 1}`,
          styleCode: item?.styleCode || style?.styleCode || '',
          colorId: normalizedColor,
          colorName,
          quantity,
          processCount: processes.length,
          status,
          totalSeconds,
          totalPt,
          totalAt,
          previewUrl:
            Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : '',
        });
      });
    });
  });

  return cards;
};

const getLineCapacitySeconds = (lineId) => {
  if (!lineId) return DAILY_CAPACITY_SECONDS;
  const line = runtimeLines.find((item) => item.id === lineId);
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
const hasAt = (card) => Number(card.totalAt) > 0;

const getCardBasis = (card) => {
  if (!hasPt(card) && !hasAt(card)) return 'NONE';
  if (hasAt(card)) return 'AT';
  return 'PT';
};

const resolveCardStatus = (card, nextPt, nextAt) => {
  const ptPresent = Number(nextPt) > 0;
  const atPresent = Number(nextAt) > 0;
  if (!ptPresent && !atPresent) return 'NONE';
  return atPresent ? 'AT' : 'PT';
};

const scaleValue = (value, ratio) => {
  if (value == null) return value;
  const scaled = Math.round(value * ratio);
  if (value > 0 && ratio > 0 && scaled === 0) return 1;
  return scaled;
};

const scaleTimeList = (list, ratio) => {
  if (!Array.isArray(list)) return list;
  return list.map((item) => ({ ...item, seconds: scaleValue(item.seconds, ratio) }));
};

const getCardOriginId = (card) => card?.originOrderId ?? card?.id;

const mergeTimeLists = (first = [], second = []) => {
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
  const mergedTotalAt = (target.totalAt ?? 0) + (source.totalAt ?? 0);
  return {
    ...target,
    quantity: mergedQuantity,
    totalSeconds: mergedTotalSeconds,
    totalPt: mergedTotalPt,
    totalAt: mergedTotalAt,
    status: resolveCardStatus(target, mergedTotalPt, mergedTotalAt),
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
  // PT/AT are factory-common values
  if (basis === 'AT') {
    return card.totalAt ?? card.totalSeconds ?? 0;
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
  const [lines, setLines] = useState(() => initialLines);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [activeDrag, setActiveDrag] = useState(null);
  const [loading, setLoading] = useState(false);
  const startDateRef = useRef(new Date());
  const splitCounterRef = useRef(1);
  const [holidayKeys, setHolidayKeys] = useState(() => loadHolidays());
  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);
  const [days, setDays] = useState(() => buildDays(startDateRef.current, 40, holidaySet));

  useEffect(() => {
    runtimeLines = lines;
  }, [lines]);

  useEffect(() => {
    const syncHolidays = () => {
      setHolidayKeys(loadHolidays());
    };

    const handleStorage = (event) => {
      if (event?.key && event.key !== STORAGE_KEYS.holidays) return;
      syncHolidays();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(HOLIDAY_UPDATED_EVENT, syncHolidays);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(HOLIDAY_UPDATED_EVENT, syncHolidays);
    };
  }, []);

  useEffect(() => {
    setDays((prev) => buildDays(startDateRef.current, Math.max(prev.length, 10), holidaySet));
  }, [holidaySet]);

  useEffect(() => {
    let cancelled = false;

    const fetchJson = async (path) => {
      const response = await fetch(`${API_BASE}${path}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${path}`);
      }
      return data;
    };

    const loadSourceData = async () => {
      setLoading(true);
      try {
        const [styles, factories] = await Promise.all([
          fetchStylesFromApi().catch(() => []),
          fetchJson('/factories').catch(() => []),
        ]);

        const safeFactories = Array.isArray(factories) ? factories : [];
        const lineListResults = await Promise.all(
          safeFactories.map((factory) =>
            fetchJson(`/lines?factoryId=${factory.id}`).catch(() => [])
          )
        );
        const workerListResults = await Promise.all(
          safeFactories.map((factory) =>
            fetchJson(`/line-workers?factoryId=${factory.id}`).catch(() => [])
          )
        );
        const attributes = await fetchJson('/attributes').catch(() => null);
        const colors = Array.isArray(attributes?.colors) ? attributes.colors : [];
        const colorNameMap = new Map(
          colors.map((item) => [normalizeColorKey(item?.code), item?.name || item?.code || ''])
        );

        const nextLines = safeFactories.flatMap((factory, index) => {
          const lineRows = Array.isArray(lineListResults[index]) ? lineListResults[index] : [];
          const workers = Array.isArray(workerListResults[index]) ? workerListResults[index] : [];
          return lineRows.map((line) => {
            const assignedCount = workers.filter(
              (worker) => normalizeKey(worker?.currentLineId) === normalizeKey(line?.id)
            ).length;
            const headcount = Math.max(assignedCount, 1);
            return {
              id: String(line.id),
              name: line.name || `Line ${line.id}`,
              headcount,
              shift: '08:00~17:00',
              dailyCapacitySeconds: headcount * DAILY_CAPACITY_SECONDS,
              factoryId: factory.id,
              factoryName: factory.name || `Factory ${factory.id}`,
            };
          });
        });

        const orders = loadOrders();
        const nextCards = buildCardsFromOrders({
          orders,
          styles,
          factories: safeFactories,
          colorNameMap,
        });

        if (!cancelled) {
          setLines(nextLines);
          setCards(nextCards);
          setAssignments((prev) =>
            prev
              .filter((item) => nextLines.some((line) => normalizeKey(line.id) === normalizeKey(item.lineId)))
              .filter((item) => nextCards.some((card) => card.id === item.cardId))
          );
          setSelectedCardId((prev) => (nextCards.some((card) => card.id === prev) ? prev : null));
        }
      } catch (_error) {
        if (!cancelled) {
          setLines([]);
          setCards([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSourceData();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureDaysLength = (minLength) => {
    if (days.length >= minLength) return days;
    const next = buildDays(startDateRef.current, minLength, holidaySet);
    setDays(next);
    return next;
  };

  const extendDays = (extra = 20) => {
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
        (card.colorName ? card.colorName.toLowerCase().includes(lower) : false) ||
        (card.orderNo ? card.orderNo.toLowerCase().includes(lower) : false)
    );
  }, [cards, searchTerm, assignedCardIds]);

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
        colorName: card.colorName,
        previewUrl: card.previewUrl,
        imageUrl: card.imageUrl,
        thumbnailUrl: card.thumbnailUrl,
        quantity: card.quantity,
        originOrderId: getCardOriginId(card) ?? cardId,
        basis,
        proposalBasis: basis,
        proposalSeconds: totalSeconds,
        contractedSeconds: totalSeconds,
        ctStatus: 'PENDING',
        ctSource: basis,
        ctAgreedBy: null,
        ctAgreedAt: null,
        ctNote: '',
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
    const totalAt = scaleValue(card.totalAt, ratio);
    const originOrderId = getCardOriginId(card) ?? card.id;
    return {
      ...card,
      id: newId,
      originOrderId,
      quantity,
      totalSeconds,
      totalPt,
      totalAt,
      status: resolveCardStatus(card, totalPt, totalAt),
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
    const scaledProposal = scaleValue(target.proposalSeconds ?? target.totalSeconds, remainRatio) || 1;
    const scaledContracted =
      target.contractedSeconds == null
        ? target.contractedSeconds
        : scaleValue(target.contractedSeconds, remainRatio) || 1;
    const range = recomputeAssignmentRange(target, scaledSeconds, days);
    setAssignments((prev) =>
      prev.map((item) =>
        item.id === assignmentId
          ? {
              ...item,
              quantity: remainQty,
              totalSeconds: scaledSeconds,
              proposalSeconds: scaledProposal,
              contractedSeconds: scaledContracted,
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
    const basis = assignment.proposalBasis || assignment.basis;
    return {
      id: assignment.cardId ?? assignment.id,
      originOrderId: assignment.originOrderId ?? assignment.cardId ?? assignment.id,
      quantity: assignment.quantity ?? 0,
      totalSeconds: assignment.totalSeconds ?? 0,
      totalPt: assignment.totalSeconds ?? 0,
      totalAt: 0,
      status: basis === 'AT' ? 'AT' : 'PT',
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
    const mergedProposalSeconds = (target.proposalSeconds ?? target.totalSeconds ?? 0) + addedSeconds;
    const mergedContractedSeconds =
      target.contractedSeconds == null ? null : (target.contractedSeconds ?? 0) + addedSeconds;
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
        proposalSeconds: mergedProposalSeconds,
        contractedSeconds: mergedContractedSeconds,
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
    const mergedProposalSeconds = (target.proposalSeconds ?? target.totalSeconds ?? 0) + addedSeconds;
    const mergedContractedSeconds =
      target.contractedSeconds == null ? null : (target.contractedSeconds ?? 0) + addedSeconds;
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
        proposalSeconds: mergedProposalSeconds,
        contractedSeconds: mergedContractedSeconds,
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

  const handleResetAssignments = () => {
    setAssignments([]);
  };

  const handleConfirmAssignments = () => {
    const now = new Date().toISOString();
    setAssignments((prev) =>
      prev.map((item) => ({
        ...item,
        ctStatus: 'AGREED',
        contractedSeconds: item.contractedSeconds ?? item.proposalSeconds ?? item.totalSeconds ?? 0,
        ctSource: item.ctSource || item.proposalBasis || item.basis || 'MANUAL',
        ctAgreedBy: item.ctAgreedBy || 'OPERATOR',
        ctAgreedAt: item.ctAgreedAt || now,
      }))
    );
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">작업 배정</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={handleResetAssignments}
              disabled={assignments.length === 0}
            >
              초기화
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmAssignments}
              disabled={assignments.length === 0}
            >
              CT 확정
            </Button>
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
                placeholder="스타일/고객사/색상 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">미배정 카드</Typography>
                <Typography variant="caption" color="text.secondary">
                  {loading ? '로딩 중...' : `${filteredCards.length}개`}
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
                  카드를 드래그하여 라인에 배정하세요
                </Typography>
              </Box>
              <ScheduleTimeline
                lines={lines}
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

