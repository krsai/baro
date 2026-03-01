import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import SearchInput from '../../../components/SearchInput';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import StyleCard from './components/StyleCard';
import ScheduleTimeline from './components/ScheduleTimeline';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { fetchAttributes } from '../../../utils/attributeApi';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { fetchOrders as fetchOrdersFromApi } from '../../../utils/orderApi';
import {
  HOLIDAY_UPDATED_EVENT,
  STORAGE_KEYS,
  loadHolidays,
} from '../../../utils/localData';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessTotalForOrderQuantity,
  normalizeProcesses,
  resolveProcessAtPerPieceSeconds,
  resolveProcessAtReliability,
} from '../../../utils/processTime';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
const DAILY_CAPACITY_SECONDS = 8 * 60 * 60;
const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};
const resolveLineHours = (line) => {
  const shiftHours = toNonNegativeNumber(line?.shiftHours, 8);
  const overtimeHours = toNonNegativeNumber(line?.overtimeHours, 0);
  return { shiftHours, overtimeHours, totalHours: shiftHours + overtimeHours };
};
const resolveLineDailyCapacitySeconds = (line, headcount) => {
  const directCapacity = Number(line?.dailyCapacitySeconds);
  if (Number.isFinite(directCapacity) && directCapacity > 0) {
    return Math.round(directCapacity);
  }
  const { totalHours } = resolveLineHours(line);
  return Math.round(Math.max(0, headcount) * totalHours * 60 * 60);
};
const formatLineShiftLabel = (line) => {
  const { shiftHours, overtimeHours } = resolveLineHours(line);
  if (overtimeHours > 0) {
    return `${shiftHours}h + OT ${overtimeHours}h`;
  }
  return `${shiftHours}h`;
};
const CT_INPUT_REGEX = /^\d*(?:\.\d{0,2})?$/;
const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const toOptionalPositiveNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};
const resolveCtUnitCost = (seconds, wagePerSecond) => {
  const resolvedSeconds = Number(seconds);
  const resolvedWage = Number(wagePerSecond);
  if (!Number.isFinite(resolvedSeconds) || resolvedSeconds <= 0) return null;
  if (!Number.isFinite(resolvedWage) || resolvedWage <= 0) return null;
  return resolvedSeconds * resolvedWage;
};
const formatCurrencyDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} 동`;
const formatSecondsLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}초`;
};
const formatDaysLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}일`;
};
const AT_RELIABILITY_COLOR = {
  [AT_RELIABILITY_STATUS.COLLECTING]: 'default',
  [AT_RELIABILITY_STATUS.FALLBACK]: 'warning',
  [AT_RELIABILITY_STATUS.LOW_SENSITIVITY]: 'warning',
  [AT_RELIABILITY_STATUS.LEARNING]: 'info',
  [AT_RELIABILITY_STATUS.STABLE]: 'success',
};
const AT_RELIABILITY_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': {
    px: 0.75,
    fontSize: '0.65rem',
    lineHeight: 1.1,
  },
};
const resolveAtReliabilityColor = (reliability) =>
  AT_RELIABILITY_COLOR[reliability?.status] ||
  AT_RELIABILITY_COLOR[AT_RELIABILITY_STATUS.COLLECTING];
const resolveAtReliabilityPercentLabel = (reliability) => {
  const percent = Number(reliability?.percent);
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
};
const calcDivergencePercent = (current, base) => {
  const currentValue = Number(current);
  const baseValue = Number(base);
  if (!Number.isFinite(currentValue) || !Number.isFinite(baseValue) || baseValue <= 0) {
    return null;
  }
  return ((currentValue - baseValue) / baseValue) * 100;
};
const normalizeCtStatus = (value) => {
  if (value === 'SENT' || value === 'AGREED' || value === 'REJECTED') return value;
  return 'PENDING';
};
const CT_STATUS_LABEL = {
  PENDING: '대기',
  SENT: '제안',
  AGREED: '확정',
  REJECTED: '요청',
};
const resolveProcessPtInfo = (process, orderQuantity = 1) => {
  const ptSeconds = toOptionalPositiveNumber(process?.pt);
  const referenceQuantity = toPositiveInt(
    process?.timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  return {
    seconds: ptSeconds,
    referenceQuantity,
    hasExactQuantity: ptSeconds != null && referenceQuantity === orderQuantity,
    isReferenceFallback: ptSeconds != null && referenceQuantity !== orderQuantity,
  };
};
const resolveProcessStSeedSeconds = ({
  process,
  orderQuantity = 1,
  proposalStSeconds = null,
}) => {
  const proposal = toOptionalPositiveNumber(proposalStSeconds);
  if (proposal != null) return { seconds: proposal, source: 'ST' };

  const manualSt = process?.stManual === true ? toOptionalPositiveNumber(process?.ct) : null;
  if (manualSt != null) return { seconds: manualSt, source: 'ST' };

  const ptInfo = resolveProcessPtInfo(process, orderQuantity);
  if (ptInfo.seconds != null) return { seconds: ptInfo.seconds, source: 'PT' };

  const atPerPiece = resolveProcessAtPerPieceSeconds(process, orderQuantity);
  if (atPerPiece != null && atPerPiece > 0) return { seconds: atPerPiece, source: 'AT' };

  return { seconds: 0, source: 'NONE' };
};
const isAssignmentLockedStatus = (value) =>
  ['SENT', 'AGREED'].includes(normalizeCtStatus(value));

const buildAssignableLines = ({ factories, lines, workers }) => {
  const safeFactories = Array.isArray(factories) ? factories : [];
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeWorkers = Array.isArray(workers) ? workers : [];
  const factoryById = new Map(
    safeFactories.map((factory, index) => [normalizeKey(factory?.id), { ...factory, __order: index }])
  );
  const lineHeadcountMap = safeWorkers.reduce((map, worker) => {
    const key = normalizeKey(worker?.currentLineId);
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  return safeLines
    .filter((line) => factoryById.has(normalizeKey(line?.factoryId)))
    .map((line) => {
      const factory = factoryById.get(normalizeKey(line?.factoryId));
      const assignedCount = lineHeadcountMap.get(normalizeKey(line?.id)) || 0;
      if (assignedCount <= 0) return null;
      const headcount = assignedCount;
      return {
        id: String(line.id),
        name: line.name || `Line ${line.id}`,
        headcount,
        shift: line?.shift || formatLineShiftLabel(line),
        shiftHours: toNonNegativeNumber(line?.shiftHours, 8),
        overtimeHours: toNonNegativeNumber(line?.overtimeHours, 0),
        dailyCapacitySeconds: resolveLineDailyCapacitySeconds(line, headcount),
        wagePerSecond: toOptionalPositiveNumber(line?.wagePerSecond),
        factoryId: factory?.id,
        factoryName: factory?.name || `Factory ${line?.factoryId}`,
        factoryWagePerSecond: toOptionalPositiveNumber(factory?.wagePerSecond),
        factoryOrder: factory?.__order ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.factoryOrder !== b.factoryOrder) return a.factoryOrder - b.factoryOrder;
      return normalizeKey(a.id).localeCompare(normalizeKey(b.id), undefined, { numeric: true });
    })
    .map(({ factoryOrder, ...line }) => line);
};

const buildLineCapacityMap = (lines = []) =>
  new Map(
    (Array.isArray(lines) ? lines : []).map((line) => {
      const key = normalizeKey(line?.id);
      const parsed = Number(line?.dailyCapacitySeconds);
      const resolved =
        Number.isFinite(parsed) && parsed > 0 ? parsed : DAILY_CAPACITY_SECONDS;
      return [key, resolved];
    })
  );


const BASIS_COLORS = {
  // AT/PT 모두 CT 기준 색으로 통일 (스케줄링 내부 구분은 유지)
  CT: { color: '#DCE9FF', stripe: '#9FB9F2' },
  ST: { color: '#DCE9FF', stripe: '#9FB9F2' },
  PT: { color: '#DCE9FF', stripe: '#9FB9F2' },
  AT: { color: '#DCE9FF', stripe: '#9FB9F2' },
  NONE: { color: '#F7D8E0', stripe: '#E6A8B6' },
};

const initialCards = [];
const initialLines = [];
const initialAssignments = [];
const MAX_HISTORY_STEPS = 30;

const mergeCardsWithSaved = (baseCards, savedCards) => {
  const merged = [];
  const indexById = new Map();

  (Array.isArray(baseCards) ? baseCards : []).forEach((card) => {
    if (!card?.id) return;
    indexById.set(card.id, merged.length);
    merged.push(card);
  });

  (Array.isArray(savedCards) ? savedCards : []).forEach((card) => {
    if (!card?.id) return;
    const existingIndex = indexById.get(card.id);
    if (existingIndex == null) {
      indexById.set(card.id, merged.length);
      merged.push(card);
      return;
    }
    const baseCard = merged[existingIndex];
    merged[existingIndex] = {
      ...card,
      ...baseCard,
      id: baseCard.id,
      originOrderId: baseCard.originOrderId || card.originOrderId || baseCard.id,
    };
  });

  return merged;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
};
const clampPercent = (value, fallback = 0, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > max) return max;
  return parsed;
};
const normalizeAssignmentLayout = (assignment) => {
  if (!assignment || typeof assignment !== 'object') return assignment;
  const startIndex = toNonNegativeInt(assignment.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment.endIndex, startIndex));
  const startDayOffsetPercent = clampPercent(assignment.startDayOffsetPercent, 0, 99.999);
  const startDayPercent = clampPercent(assignment.startDayPercent, 100, 100);
  const endDayPercent = clampPercent(assignment.endDayPercent, startDayPercent, 100);
  const version = toNonNegativeInt(assignment.version, 0);
  const versionUpdatedAt =
    typeof assignment.versionUpdatedAt === 'string' && assignment.versionUpdatedAt.trim()
      ? assignment.versionUpdatedAt
      : null;
  const ctSentAt =
    typeof assignment.ctSentAt === 'string' && assignment.ctSentAt.trim()
      ? assignment.ctSentAt
      : null;
  const ctEscalatedAt =
    typeof assignment.ctEscalatedAt === 'string' && assignment.ctEscalatedAt.trim()
      ? assignment.ctEscalatedAt
      : null;

  return {
    ...assignment,
    lineId: String(assignment.lineId ?? ''),
    startIndex,
    endIndex,
    startDayOffsetPercent,
    startDayPercent,
    endDayPercent,
    version,
    versionUpdatedAt,
    ctSentAt,
    ctEscalatedAt,
  };
};

const normalizeKey = (value) => String(value ?? '').trim();
const normalizeColorKey = (value) => normalizeKey(value).toUpperCase();
const normalizeGenderKey = (value) => {
  const raw = normalizeKey(value).toUpperCase();
  if (raw === 'M' || raw === 'MEN' || raw === 'MALE' || raw === '남성') return 'M';
  if (raw === 'W' || raw === 'WOMEN' || raw === 'FEMALE' || raw === '여성') return 'W';
  if (raw === 'U' || raw === 'UNISEX' || raw === '공용') return 'U';
  return 'U';
};
const resolveLegacyRowColorKey = (row) => {
  const fromCode = normalizeColorKey(row?.colorCode || row?.color || row?.colorName);
  if (fromCode) return fromCode;
  const fromId = normalizeColorKey(row?.colorId);
  if (!fromId || fromId === 'M' || fromId === 'W' || fromId === 'U') return 'UNSPEC';
  return fromId;
};

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

const resolveVariantBucketsFromLegacyRows = (rows = [], itemGender = 'U') => {
  const bucket = new Map();
  rows.forEach((row) => {
    const quantity = Number(row?.quantity) || 0;
    if (quantity <= 0) return;
    const colorId = resolveLegacyRowColorKey(row);
    const rawGender = normalizeKey(row?.gender ?? '').toUpperCase();
    const gender =
      rawGender === 'M' || rawGender === 'W' || rawGender === 'U'
        ? rawGender
        : itemGender;
    const bucketKey = `${colorId}::${gender}`;
    const existing = bucket.get(bucketKey);
    if (!existing) {
      bucket.set(bucketKey, { colorId, gender, quantity });
      return;
    }
    existing.quantity += quantity;
  });
  return Array.from(bucket.values());
};

const resolveItemVariantBuckets = (item) => {
  const itemGender = normalizeGenderKey(item?.gender);
  const fromLegacyRows = resolveVariantBucketsFromLegacyRows(
    Array.isArray(item?.quantities) ? item.quantities : [],
    itemGender
  );
  if (fromLegacyRows.length > 0) return fromLegacyRows;

  const fallbackQuantity = resolveItemQuantity(item);
  if (fallbackQuantity <= 0) return [];

  const fallbackColor = normalizeColorKey(item?.colorCode || item?.colorId || item?.color || 'UNSPEC');
  const fallbackGender = normalizeGenderKey(item?.gender);
  return [{ colorId: fallbackColor || 'UNSPEC', gender: fallbackGender, quantity: fallbackQuantity }];
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

const getTotalForOrderQuantity = (processes, field, orderQuantity) =>
  calculateProcessTotalForOrderQuantity(processes, field, orderQuantity);
const getTotalStForOrderQuantity = (processes, orderQuantity) =>
  normalizeProcesses(processes).reduce((sum, process) => {
    const processQuantity = toPositiveInt(process?.quantity, 1);
    const stSeed = resolveProcessStSeedSeconds({
      process,
      orderQuantity,
    });
    const stPerPiece = toOptionalPositiveNumber(stSeed?.seconds);
    if (stPerPiece == null) return sum;
    return sum + processQuantity * stPerPiece * orderQuantity;
  }, 0);

const createCardId = (orderId, styleId, colorId, gender) =>
  `${normalizeKey(orderId)}::${normalizeKey(styleId)}::${normalizeColorKey(colorId)}::${normalizeGenderKey(gender)}`;

const buildCardsFromOrders = ({ orders, styles, colorNameMap }) => {
  const styleMap = new Map((Array.isArray(styles) ? styles : []).map((style) => [style.id, style]));
  const cards = [];
  const cardMap = new Map();
  const cardIndexMap = new Map();
  const styleProcessSummaryMap = new Map();

  styleMap.forEach((style, styleId) => {
    const processes = normalizeProcesses(style?.processes);
    styleProcessSummaryMap.set(styleId, {
      processCount: processes.length,
      processes,
      previewUrl:
        Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : '',
    });
  });

  const upsertCard = (nextCard) => {
    const existing = cardMap.get(nextCard.id);
    if (!existing) {
      cardMap.set(nextCard.id, nextCard);
      cardIndexMap.set(nextCard.id, cards.length);
      cards.push(nextCard);
      return;
    }

    const mergedTotalPt = (existing.totalPt ?? 0) + (nextCard.totalPt ?? 0);
    const mergedTotalAt = (existing.totalAt ?? 0) + (nextCard.totalAt ?? 0);
    const mergedTotalSt = (existing.totalSt ?? 0) + (nextCard.totalSt ?? 0);
    const mergedHasPt = mergedTotalPt > 0;
    const mergedHasAt = mergedTotalAt > 0;
    const mergedHasSt = mergedTotalSt > 0;
    const mergedStatus = mergedHasSt ? 'ST' : mergedHasAt ? 'AT' : mergedHasPt ? 'PT' : 'NONE';

    const merged = {
      ...existing,
      quantity: (existing.quantity ?? 0) + (nextCard.quantity ?? 0),
      totalSeconds: (existing.totalSeconds ?? 0) + (nextCard.totalSeconds ?? 0),
      totalPt: mergedTotalPt,
      totalAt: mergedTotalAt,
      totalSt: mergedTotalSt,
      status: mergedStatus,
      dueDate: existing.dueDate || nextCard.dueDate || '',
      processCount: Math.max(existing.processCount ?? 0, nextCard.processCount ?? 0),
    };
    cardMap.set(nextCard.id, merged);
    const index = cardIndexMap.get(nextCard.id);
    if (index != null) cards[index] = merged;
  };

  (Array.isArray(orders) ? orders : []).forEach((order, orderIndex) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item, itemIndex) => {
      const styleId = item?.styleId || '';
      if (!styleId) return;

      const style = styleMap.get(styleId);
      const processSummary = styleProcessSummaryMap.get(styleId);
      const processCount = processSummary?.processCount ?? 0;
      const variantBuckets = resolveItemVariantBuckets(item);
if (variantBuckets.length === 0) return;

      variantBuckets.forEach(({ colorId, gender, quantity }) => {
        if ((Number(quantity) || 0) <= 0) return;

        const normalizedColor = normalizeColorKey(colorId);
        const normalizedGender = normalizeGenderKey(gender);
        const colorName = colorNameMap.get(normalizedColor) || normalizedColor || '색상 없음';
        const totalPt = getTotalForOrderQuantity(processSummary?.processes || [], 'pt', quantity);
        const totalAt = getTotalForOrderQuantity(processSummary?.processes || [], 'at', quantity);
        const totalSt = getTotalStForOrderQuantity(processSummary?.processes || [], quantity);
        const hasSt = totalSt > 0;
        const hasAt = totalAt > 0;
        const hasPt = totalPt > 0;
        const status = hasSt ? 'ST' : hasAt ? 'AT' : hasPt ? 'PT' : 'NONE';
        const totalSeconds = hasSt ? totalSt : hasAt ? totalAt : totalPt;

        upsertCard({
          id: createCardId(
            order?.id ?? order?.orderNumber ?? `order-${orderIndex}`,
            styleId,
            normalizedColor,
            normalizedGender
          ),
          originOrderId: createCardId(
            order?.id ?? order?.orderNumber ?? `order-${orderIndex}`,
            styleId,
            normalizedColor,
            normalizedGender
          ),
          orderNo: order?.orderNumber || order?.id || '-',
          dueDate: order?.dueDate || '',
          customer: order?.customerName || order?.customer || '-',
          styleId,
          styleName: item?.styleName || style?.name || `스타일 ${itemIndex + 1}`,
          styleCode: item?.styleCode || style?.styleCode || '',
          colorId: normalizedColor,
          colorName,
          gender: normalizedGender,
          quantity,
          processCount,
          status,
          totalSeconds,
          totalPt,
          totalAt,
          totalSt,
          previewUrl: processSummary?.previewUrl ?? '',
        });
      });
    });
  });

  return cards;
};

const getLineCapacitySeconds = (lineId, lineCapacityById = null) => {
  if (!lineId) return DAILY_CAPACITY_SECONDS;
  const key = normalizeKey(lineId);
  const resolved = Number(lineCapacityById?.get?.(key));
  if (!Number.isFinite(resolved) || resolved <= 0) return DAILY_CAPACITY_SECONDS;
  return resolved;
};

const isNonWorkingDay = (dayIndex, days) => {
  if (!Array.isArray(days)) return false;
  const day = days[dayIndex];
  if (!day) return false;
  return day.isSunday || day.isHoliday;
};

const getDayCapacitySeconds = (dayIndex, lineId, days, lineCapacityById = null) => {
  if (isNonWorkingDay(dayIndex, days)) return 0;
  return getLineCapacitySeconds(lineId, lineCapacityById);
};

const hasPt = (card) => Number(card.totalPt) > 0;
const hasAt = (card) => Number(card.totalAt) > 0;
const hasSt = (card) =>
  Number(card?.totalSt) > 0 || String(card?.status || '').trim().toUpperCase() === 'ST';

const getCardBasis = (card) => {
  if (hasSt(card)) return 'ST';
  if (!hasPt(card) && !hasAt(card)) return 'NONE';
  if (hasAt(card)) return 'AT';
  return 'PT';
};

const resolveCardStatus = (_card, nextPt, nextAt, nextSt = null) => {
  const stPresent = Number(nextSt) > 0;
  const ptPresent = Number(nextPt) > 0;
  const atPresent = Number(nextAt) > 0;
  if (!ptPresent && !atPresent && !stPresent) return 'NONE';
  if (stPresent) return 'ST';
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
  const mergedTotalSt = (target.totalSt ?? 0) + (source.totalSt ?? 0);
  return {
    ...target,
    quantity: mergedQuantity,
    totalSeconds: mergedTotalSeconds,
    totalPt: mergedTotalPt,
    totalAt: mergedTotalAt,
    totalSt: mergedTotalSt,
    status: resolveCardStatus(target, mergedTotalPt, mergedTotalAt, mergedTotalSt),
    originOrderId: getCardOriginId(target),
  };
};

const recomputeAssignmentRange = (assignment, totalSeconds, days, lineCapacityById = null) => {
  const startDayOffsetPercent = assignment.startDayOffsetPercent ?? 0;
  const startIndex = assignment.startIndex;
  const startCapacity = getDayCapacitySeconds(
    startIndex,
    assignment.lineId,
    days,
    lineCapacityById
  );
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
  let cursor = startIndex + 1;
  while (remaining > 0) {
    if (isNonWorkingDay(cursor, days)) {
      endIndex = cursor;
      cursor += 1;
      continue;
    }
    const dailyCapacity = getDayCapacitySeconds(
      cursor,
      assignment.lineId,
      days,
      lineCapacityById
    );
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

const resolveCardTotalSeconds = (card) => {
  // Always prefer ST when available
  if (Number(card?.totalSt) > 0) return card.totalSt;
  const basis = getCardBasis(card);
  if (basis === 'NONE') return 0;
  if (basis === 'AT') return card.totalAt ?? card.totalSeconds ?? 0;
  return card.totalPt ?? card.totalSeconds ?? 0;
};

const syncAssignmentFromCard = (assignment, card, days, lineCapacityById = null) => {
  if (!assignment || !card) return assignment;

  const totalSeconds = resolveCardTotalSeconds(card);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return assignment;

  const basis = getCardBasis(card);
  const next = {
    ...assignment,
    orderNo: card.orderNo ?? assignment.orderNo,
    customer: card.customer ?? assignment.customer,
    label: card.styleName,
    colorName: card.colorName ?? assignment.colorName,
    gender: card.gender ?? assignment.gender,
    previewUrl: card.previewUrl ?? assignment.previewUrl,
    imageUrl: card.imageUrl ?? assignment.imageUrl,
    thumbnailUrl: card.thumbnailUrl ?? assignment.thumbnailUrl,
    quantity: card.quantity ?? assignment.quantity,
    basis,
    proposalBasis: basis,
    totalSeconds,
    proposalSeconds: totalSeconds,
    contractedSeconds:
      assignment.contractedSeconds != null ? assignment.contractedSeconds : null,
  };
  const range = recomputeAssignmentRange(next, totalSeconds, days, lineCapacityById);
  return {
    ...next,
    ...range,
  };
};

const buildDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDueDateToTimestamp = (value) => {
  const text = normalizeKey(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map((item) => Number(item));
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
  }

  const date = new Date(text);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const normalizedTime = normalized.getTime();
  return Number.isFinite(normalizedTime) ? normalizedTime : null;
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

const getTodayDayIndex = (days, targetDate = new Date()) => {
  const key = buildDateKey(targetDate);
  const index = (Array.isArray(days) ? days : []).findIndex((day) => day?.key === key);
  return index >= 0 ? index : 0;
};

const getUsageSeconds = (assignment, days, lineCapacityById = null) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  const usage = [];

  for (let i = assignment.startIndex; i <= assignment.endIndex; i += 1) {
    const dailyCapacity = getDayCapacitySeconds(i, assignment.lineId, days, lineCapacityById);
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

const buildUsageMap = (assignments, lineId, totalDays, days, lineCapacityById = null) => {
  const usage = Array.from({ length: totalDays }).map(() => 0);
  assignments
    .filter((item) => item.lineId === lineId)
    .forEach((item) => {
      getUsageSeconds(item, days, lineCapacityById).forEach(({ dayIndex, seconds }) => {
        if (usage[dayIndex] != null) usage[dayIndex] += seconds;
      });
    });
  return usage;
};

const planAssignment = ({
  startIndex,
  totalSeconds,
  lineId,
  assignments,
  totalDays,
  days,
  lineCapacityById,
}) => {
  const usage = buildUsageMap(assignments, lineId, totalDays, days, lineCapacityById);
  let remaining = totalSeconds;
  let dayIndex = startIndex;
  while (dayIndex < totalDays && isNonWorkingDay(dayIndex, days)) {
    dayIndex += 1;
  }
  if (dayIndex >= totalDays) return null;

  const startCapacity = getDayCapacitySeconds(dayIndex, lineId, days, lineCapacityById);
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
    const dailyCapacity = getDayCapacitySeconds(cursor, lineId, days, lineCapacityById);
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

const getAssignmentTotalSeconds = (assignment, days, lineCapacityById = null) => {
  return getUsageSeconds(assignment, days, lineCapacityById).reduce(
    (sum, item) => sum + item.seconds,
    0
  );
};

const getUsageSecondsBeforeIndex = (
  assignment,
  beforeIndex,
  days,
  lineCapacityById = null
) => {
  const safeBeforeIndex = toNonNegativeInt(beforeIndex, 0);
  if (safeBeforeIndex <= 0) return 0;
  return getUsageSeconds(assignment, days, lineCapacityById).reduce((sum, item) => {
    if (item.dayIndex >= safeBeforeIndex) return sum;
    return sum + item.seconds;
  }, 0);
};

const resolveAssignmentPlannedSeconds = (assignment, days, lineCapacityById = null) => {
  const explicitTotal = Number(assignment?.totalSeconds);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal;

  const contractedTotal = Number(assignment?.contractedSeconds);
  if (Number.isFinite(contractedTotal) && contractedTotal > 0) return contractedTotal;

  const proposalTotal = Number(assignment?.proposalSeconds);
  if (Number.isFinite(proposalTotal) && proposalTotal > 0) return proposalTotal;

  return getAssignmentTotalSeconds(assignment, days, lineCapacityById);
};

const getNextStartIndex = (assignment, days, lineCapacityById = null) => {
  if (!assignment) return null;
  const usage = getUsageSeconds(assignment, days, lineCapacityById);
  const lastUsage = usage.find((item) => item.dayIndex === assignment.endIndex);
  if (!lastUsage) return assignment.endIndex;
  const dailyCapacity = getDayCapacitySeconds(
    assignment.endIndex,
    assignment.lineId,
    days,
    lineCapacityById
  );
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

const reflowAssignmentsByLineCapacity = ({
  assignments,
  totalDays,
  days,
  lineCapacityById,
  sourceLineCapacityById = null,
  reflowStartIndex = 0,
}) => {
  const capacityForSource = sourceLineCapacityById || lineCapacityById;
  const safeReflowStartIndex = toNonNegativeInt(reflowStartIndex, 0);
  const grouped = new Map();
  (Array.isArray(assignments) ? assignments : []).forEach((item) => {
    const lineKey = normalizeKey(item?.lineId);
    if (!lineKey) return;
    if (!grouped.has(lineKey)) grouped.set(lineKey, []);
    grouped.get(lineKey).push(item);
  });

  const nextAssignments = [];

  for (const [lineId, lineItems] of grouped.entries()) {
    const sorted = lineItems
      .slice()
      .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));
    if (sorted.length === 0) continue;

    const fixed = sorted
      .filter((item) => toNonNegativeInt(item?.endIndex, 0) < safeReflowStartIndex)
      .map((item) => ({ ...item, lineId }));
    const queue = sorted.filter(
      (item) => toNonNegativeInt(item?.endIndex, 0) >= safeReflowStartIndex
    );

    const placed = [...fixed];
    let cursorStart = Math.max(
      safeReflowStartIndex,
      toNonNegativeInt(sorted[0]?.startIndex, 0)
    );
    if (fixed.length > 0) {
      const nextFromFixed = getNextStartIndex(
        fixed[fixed.length - 1],
        days,
        lineCapacityById
      );
      if (nextFromFixed != null) {
        cursorStart = Math.max(cursorStart, nextFromFixed);
      }
    }

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      const startIndex = cursorStart;
      if (startIndex == null || startIndex >= totalDays) return null;

      const totalSeconds = resolveAssignmentPlannedSeconds(
        item,
        days,
        capacityForSource
      );
      if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
      const usedBeforeReflow = getUsageSecondsBeforeIndex(
        item,
        safeReflowStartIndex,
        days,
        capacityForSource
      );
      const remainingSeconds = Math.max(0, totalSeconds - usedBeforeReflow);
      if (remainingSeconds <= 0) continue;

      const planned = planAssignment({
        startIndex,
        totalSeconds: remainingSeconds,
        lineId,
        assignments: placed,
        totalDays,
        days,
        lineCapacityById,
      });
      if (!planned) return null;

      const nextItem = {
        ...item,
        lineId,
        totalSeconds,
        ...planned,
      };
      placed.push(nextItem);

      cursorStart = getNextStartIndex(nextItem, days, lineCapacityById);
    }

    nextAssignments.push(...placed);
  }

  return nextAssignments;
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
  lineCapacityById,
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
    insertIndex = getNextStartIndex(before[before.length - 1], days, lineCapacityById);
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
    totalSeconds:
      insertItem.totalSeconds ??
      getAssignmentTotalSeconds(insertItem, days, lineCapacityById),
    lineId,
    assignments: placed,
    totalDays,
    days,
    lineCapacityById,
  });

  if (!planned) return null;

  placed.push({
    ...insertItem,
    lineId,
    ...planned,
  });

  let cursorStart = getNextStartIndex(
    placed[placed.length - 1],
    days,
    lineCapacityById
  );

  const queue = after;

  for (const item of queue) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds =
      item.totalSeconds ?? getAssignmentTotalSeconds(item, days, lineCapacityById);
    planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
      lineCapacityById,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(
      placed[placed.length - 1],
      days,
      lineCapacityById
    );
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

const buildConnectedChain = (items, startIndex, days, lineCapacityById = null) => {
  if (startIndex == null || startIndex < 0) return [];
  const chain = [];
  for (let i = startIndex; i < items.length; i += 1) {
    if (i === startIndex) {
      chain.push(items[i]);
      continue;
    }
    const expectedStart = getNextStartIndex(
      chain[chain.length - 1],
      days,
      lineCapacityById
    );
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
  lineCapacityById,
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
    insertIndex = getNextStartIndex(before[before.length - 1], days, lineCapacityById);
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
    const totalSeconds =
      item.totalSeconds ?? getAssignmentTotalSeconds(item, days, lineCapacityById);
    const planned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
      lineCapacityById,
    });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

    cursorStart = getNextStartIndex(
      placed[placed.length - 1],
      days,
      lineCapacityById
    );
  }

  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
      const totalSeconds =
        item.totalSeconds ?? getAssignmentTotalSeconds(item, days, lineCapacityById);
      const planned = planAssignment({
        startIndex: cursorStart,
        totalSeconds,
        lineId,
        assignments: placed,
        totalDays,
        days,
        lineCapacityById,
      });

    if (!planned) return null;

    placed.push({
      ...item,
      lineId,
      ...planned,
    });

      cursorStart = getNextStartIndex(
        placed[placed.length - 1],
        days,
        lineCapacityById
      );
    }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const rebuildLineWithReplace = ({
  lineId,
  targetId,
  newItem,
  assignments,
  totalDays,
  days,
  lineCapacityById,
}) => {
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
    totalSeconds:
      newItem.totalSeconds ?? getAssignmentTotalSeconds(newItem, days, lineCapacityById),
    lineId,
    assignments: placed,
    totalDays,
    days,
    lineCapacityById,
  });
  if (!planned) return null;

  placed.push({
    ...newItem,
    lineId,
    ...planned,
  });

  let cursorStart = getNextStartIndex(
    placed[placed.length - 1],
    days,
    lineCapacityById
  );
  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    const totalSeconds =
      item.totalSeconds ?? getAssignmentTotalSeconds(item, days, lineCapacityById);
    const nextPlanned = planAssignment({
      startIndex: cursorStart,
      totalSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
      lineCapacityById,
    });
    if (!nextPlanned) return null;
    placed.push({
      ...item,
      lineId,
      ...nextPlanned,
    });
    cursorStart = getNextStartIndex(
      placed[placed.length - 1],
      days,
      lineCapacityById
    );
  }

  return [
    ...assignments.filter((item) => item.lineId !== lineId),
    ...placed,
  ];
};

const AssignBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId, activeOrgRole, activeProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [cards, setCards] = useState(() => initialCards);
  const [styles, setStyles] = useState([]);
  const [lines, setLines] = useState(() => initialLines);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [activeDrag, setActiveDrag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const startDateRef = useRef(new Date());
  const splitCounterRef = useRef(1);
  const lastSavedSnapshotRef = useRef('');
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const historySnapshotRef = useRef('');
  const historyApplyingRef = useRef(false);
  const [historyStatus, setHistoryStatus] = useState({ undoCount: 0, redoCount: 0 });
  const [holidayKeys, setHolidayKeys] = useState(() => loadHolidays());
  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);
  const MAX_RANGE_DAYS = 92;
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [viewEnd, setViewEnd] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 29);
    return d;
  });
  const dayCount = useMemo(() => {
    return Math.max(10, Math.round((viewEnd - viewStart) / 86400000) + 1);
  }, [viewStart, viewEnd]);
  const [days, setDays] = useState(() => buildDays(startDateRef.current, 30, holidaySet));
  const [contextMenuState, setContextMenuState] = useState(null);
  const [detailState, setDetailState] = useState(null);
  const [detailDraftsByTarget, setDetailDraftsByTarget] = useState({});
  const [detailStDraftsByTarget, setDetailStDraftsByTarget] = useState({});
  const [sendingProposal, setSendingProposal] = useState(false);
  const linesRef = useRef(lines);
  const assignmentsRef = useRef(assignments);
  const daysRef = useRef(days);
  const lineCapacityById = useMemo(() => {
    return buildLineCapacityMap(lines);
  }, [lines]);
  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  }, []);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  const syncHistoryStatus = useCallback(() => {
    setHistoryStatus({
      undoCount: historyPastRef.current.length,
      redoCount: historyFutureRef.current.length,
    });
  }, []);

  const createBoardSnapshotText = useCallback(
    (nextCards, nextAssignments) =>
      JSON.stringify({
        cards: Array.isArray(nextCards) ? nextCards : [],
        assignments: Array.isArray(nextAssignments) ? nextAssignments : [],
      }),
    []
  );

  const createPersistSnapshotText = useCallback(
    (nextCards, nextAssignments) => {
      const normalizedAssignments = (Array.isArray(nextAssignments) ? nextAssignments : []).map(
        (item) => normalizeAssignmentLayout(item)
      );
      return JSON.stringify({
        cards: Array.isArray(nextCards) ? nextCards : [],
        assignments: normalizedAssignments,
      });
    },
    []
  );

  const currentPersistSnapshot = useMemo(
    () => createPersistSnapshotText(cards, assignments),
    [assignments, cards, createPersistSnapshotText]
  );
  const isDirty = persistReady && currentPersistSnapshot !== lastSavedSnapshotRef.current;
  const resolvePersistedBoardState = useCallback(
    (payload, fallbackCards, fallbackAssignments) => {
      const persistedCards = Array.isArray(payload?.cards)
        ? payload.cards
        : Array.isArray(fallbackCards)
          ? fallbackCards
          : [];
      const persistedAssignmentsRaw = Array.isArray(payload?.assignments)
        ? payload.assignments
        : Array.isArray(fallbackAssignments)
          ? fallbackAssignments
          : [];
      return {
        persistedCards,
        persistedAssignments: persistedAssignmentsRaw.map((item) =>
          normalizeAssignmentLayout(item)
        ),
      };
    },
    []
  );
  const resolveBoardSaveErrorMessage = useCallback((error, fallbackMessage) => {
    const raw = String(error?.message || '').trim();
    if (raw.toLowerCase().includes('assignment version conflict')) {
      return '다른 사용자가 먼저 수정했습니다. 화면을 새로고침 후 다시 시도해 주세요.';
    }
    return raw || fallbackMessage;
  }, []);

  const applyBoardSnapshotText = useCallback((snapshotText) => {
    try {
      const parsed = JSON.parse(snapshotText || '{}');
      const nextCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
      const nextAssignments = Array.isArray(parsed?.assignments)
        ? parsed.assignments.map((item) => normalizeAssignmentLayout(item))
        : [];
      const maxEndIndex = nextAssignments.reduce(
        (max, item) => Math.max(max, toNonNegativeInt(item?.endIndex, 0)),
        0
      );
      setCards(nextCards);
      setAssignments(nextAssignments);
      setSelectedCardId((prev) =>
        nextCards.some((card) => String(card?.id) === String(prev)) ? prev : null
      );
      setDays((prev) => {
        const requiredLength = Math.max(prev.length, maxEndIndex + 10);
        return requiredLength > prev.length
          ? buildDays(startDateRef.current, requiredLength, holidaySet)
          : prev;
      });
    } catch (_error) {
      // Ignore malformed snapshots and keep current state.
    }
  }, [holidaySet]);

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
    startDateRef.current = new Date(viewStart);
    setDays(buildDays(startDateRef.current, dayCount, holidaySet));
  }, [viewStart, dayCount, holidaySet]);

  useEffect(() => {
    let cancelled = false;

    const loadSourceData = async () => {
      setPersistReady(false);
      setLoading(true);
      try {
        const orgQuery = buildQueryString({ orgId: activeOrgId });
        const [styles, orders, factories, lines, workers, attributes, boardState] = await Promise.all([
          fetchStylesFromApi({ compact: true, orgId: activeOrgId }).catch(() => []),
          fetchOrdersFromApi({ orgId: activeOrgId }).catch(() => []),
          requestJSON('/factories' + orgQuery).catch(() => []),
          requestJSON('/lines' + orgQuery).catch(() => []),
          requestJSON('/line-workers' + orgQuery).catch(() => []),
          fetchAttributes({ orgId: activeOrgId }).catch(() => null),
          requestJSON('/assignment-board-state' + orgQuery).catch(() => null),
        ]);

        const safeFactories = Array.isArray(factories) ? factories : [];
        const colors = Array.isArray(attributes?.colors) ? attributes.colors : [];
        const colorNameMap = new Map(
          colors.map((item) => [normalizeColorKey(item?.code), item?.name || item?.code || ''])
        );

        const nextLines = buildAssignableLines({
          factories: safeFactories,
          lines,
          workers,
        });

        const nextCards = buildCardsFromOrders({
          orders: Array.isArray(orders) ? orders : [],
          styles,
          colorNameMap,
        });
        const nextLineCapacityById = buildLineCapacityMap(nextLines);
        const nextLineIdSet = new Set(nextLines.map((line) => normalizeKey(line.id)));

        const hasSavedBoardState =
          Array.isArray(boardState?.cards) || Array.isArray(boardState?.assignments);
        const savedCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
        const savedAssignments = Array.isArray(boardState?.assignments) ? boardState.assignments : [];
        const restoredCards = hasSavedBoardState
          ? mergeCardsWithSaved(nextCards, savedCards)
          : nextCards;
        const restoredCardById = new Map(
          restoredCards
            .filter((card) => card?.id)
            .map((card) => [card.id, card])
        );
        const restoredCardIdSet = new Set(
          restoredCards.map((card) => card?.id).filter(Boolean)
        );
        const normalizedSavedAssignments = hasSavedBoardState
          ? savedAssignments
              .filter((item) => item?.id)
              .filter((item) => nextLineIdSet.has(normalizeKey(item?.lineId)))
              .filter((item) => restoredCardIdSet.has(item?.cardId))
              .map((item) =>
                normalizeAssignmentLayout({
                  ...item,
                  lineId: String(item.lineId),
                })
              )
          : [];
        const projectedMaxEndIndex = normalizedSavedAssignments.reduce((max, item) => {
          const linkedCard = restoredCardById.get(item.cardId);
          const totalSeconds = linkedCard
            ? resolveCardTotalSeconds(linkedCard)
            : toNonNegativeInt(item.totalSeconds, 0);
          const lineCapacity = Math.max(
            1,
            getLineCapacitySeconds(item.lineId, nextLineCapacityById)
          );
          const estimatedDays = Math.max(1, Math.ceil(totalSeconds / lineCapacity));
          return Math.max(max, item.endIndex, item.startIndex + estimatedDays + 14);
        }, days.length - 1);
        const restoreDayCount = Math.max(days.length, projectedMaxEndIndex + 1);
        const restoreDays =
          restoreDayCount > days.length
            ? buildDays(startDateRef.current, restoreDayCount, holidaySet)
            : days;
        const restoredAssignments = hasSavedBoardState
          ? normalizedSavedAssignments
              .map((item) => {
                const linkedCard = restoredCardById.get(item.cardId);
                if (!linkedCard) return item;
                return normalizeAssignmentLayout(
                  syncAssignmentFromCard(
                    item,
                    linkedCard,
                    restoreDays,
                    nextLineCapacityById
                  )
                );
              })
          : [];
        let normalizedRestoredAssignments = restoredAssignments.map((item) =>
          normalizeAssignmentLayout(item)
        );
        let normalizedRestoreDays = restoreDays;
        if (normalizedRestoredAssignments.length > 1) {
          const reflowStartIndex = getTodayDayIndex(normalizedRestoreDays);
          let candidateDays = normalizedRestoreDays;
          let reflowedAssignments = null;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            reflowedAssignments = reflowAssignmentsByLineCapacity({
              assignments: normalizedRestoredAssignments,
              totalDays: candidateDays.length,
              days: candidateDays,
              lineCapacityById: nextLineCapacityById,
              sourceLineCapacityById: nextLineCapacityById,
              reflowStartIndex,
            });
            if (reflowedAssignments) break;
            candidateDays = buildDays(startDateRef.current, candidateDays.length + 20, holidaySet);
          }

          if (reflowedAssignments) {
            normalizedRestoredAssignments = reflowedAssignments.map((item) =>
              normalizeAssignmentLayout(item)
            );
            normalizedRestoreDays = candidateDays;
          }
        }
        const maxRestoredEndIndex = normalizedRestoredAssignments.reduce(
          (max, item) => Math.max(max, toNonNegativeInt(item?.endIndex, 0)),
          0
        );
        const nextDayCount = Math.max(
          normalizedRestoreDays.length,
          maxRestoredEndIndex + 10
        );
        const maxSplit = restoredCards.reduce((max, card) => {
          const matched = String(card?.id || '').match(/-S(\d+)$/);
          if (!matched) return max;
          const value = Number(matched[1]);
          if (!Number.isFinite(value)) return max;
          return Math.max(max, value);
        }, 0);
        const persistSnapshot = createPersistSnapshotText(
          restoredCards,
          normalizedRestoredAssignments
        );
        const boardSnapshot = createBoardSnapshotText(
          restoredCards,
          normalizedRestoredAssignments
        );

        if (!cancelled) {
          const nextCardIdSet = new Set(restoredCards.map((card) => card.id));
          setStyles(Array.isArray(styles) ? styles : []);
          setLines(nextLines);
          setCards(restoredCards);
          setAssignments(normalizedRestoredAssignments);
          if (nextDayCount > normalizedRestoreDays.length) {
            setDays(buildDays(startDateRef.current, nextDayCount, holidaySet));
          } else if (normalizedRestoreDays.length > days.length) {
            setDays(normalizedRestoreDays);
          }
          setSelectedCardId((prev) => (nextCardIdSet.has(prev) ? prev : null));
          splitCounterRef.current = maxSplit + 1;
          lastSavedSnapshotRef.current = persistSnapshot;
          historyPastRef.current = [];
          historyFutureRef.current = [];
          historySnapshotRef.current = boardSnapshot;
          historyApplyingRef.current = false;
          syncHistoryStatus();
          setPersistReady(true);
        }
      } catch (_error) {
        if (!cancelled) {
          setStyles([]);
          setLines([]);
          setCards([]);
          setAssignments([]);
          lastSavedSnapshotRef.current = createPersistSnapshotText([], []);
          setPersistReady(true);
          historyPastRef.current = [];
          historyFutureRef.current = [];
          historySnapshotRef.current = createBoardSnapshotText([], []);
          historyApplyingRef.current = false;
          syncHistoryStatus();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSourceData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, createBoardSnapshotText, createPersistSnapshotText, syncHistoryStatus]);


  useEffect(() => {
    if (!persistReady) return;

    const snapshot = createBoardSnapshotText(cards, assignments);
    if (!historySnapshotRef.current) {
      historySnapshotRef.current = snapshot;
      syncHistoryStatus();
      return;
    }
    if (snapshot === historySnapshotRef.current) return;

    if (historyApplyingRef.current) {
      historySnapshotRef.current = snapshot;
      historyApplyingRef.current = false;
      syncHistoryStatus();
      return;
    }

    historyPastRef.current.push(historySnapshotRef.current);
    if (historyPastRef.current.length > MAX_HISTORY_STEPS) {
      historyPastRef.current = historyPastRef.current.slice(
        historyPastRef.current.length - MAX_HISTORY_STEPS
      );
    }
    historyFutureRef.current = [];
    historySnapshotRef.current = snapshot;
    syncHistoryStatus();
  }, [assignments, cards, createBoardSnapshotText, persistReady, syncHistoryStatus]);

  const handleSaveBoard = useCallback(async () => {
    if (!activeOrgId || !persistReady || persisting || !isDirty) return;

    // 저장 전 날짜 중첩 제거: 잠금 카드(SENT/AGREED) 위치 고정, 나머지 재배치
    const reflowedAssignments = reflowAssignmentsByLineCapacity({
      assignments,
      totalDays: days.length,
      days,
      lineCapacityById,
      reflowStartIndex: 0,
    });
    const assignmentsToSave = reflowedAssignments ?? assignments;

    const normalizedAssignments = assignmentsToSave.map((item) => normalizeAssignmentLayout(item));
    setPersisting(true);
    try {
      const response = await requestJSON(
        '/assignment-board-state' + buildQueryString({ orgId: activeOrgId }),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards, assignments: normalizedAssignments }),
          skipGlobalLoading: true,
        }
      );
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        cards,
        normalizedAssignments
      );
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      lastSavedSnapshotRef.current = createPersistSnapshotText(
        persistedCards,
        persistedAssignments
      );
      showNotification('작업 배정을 저장했습니다.', 'success');
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '작업 배정 저장에 실패했습니다.'),
        'error'
      );
    } finally {
      setPersisting(false);
    }
  }, [
    activeOrgId,
    assignments,
    cards,
    days,
    lineCapacityById,
    createPersistSnapshotText,
    isDirty,
    persistReady,
    persisting,
    resolveBoardSaveErrorMessage,
    resolvePersistedBoardState,
    showNotification,
  ]);

  const navigationBlocker = useBlocker(persistReady && isDirty && !persisting);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    const shouldLeave = window.confirm(
      '저장되지 않은 작업 배정 데이터가 있습니다. 저장하지 않고 이동하시겠습니까?'
    );
    if (shouldLeave) {
      navigationBlocker.proceed();
      return;
    }
    navigationBlocker.reset();
  }, [navigationBlocker, navigationBlocker.state]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!persistReady || !isDirty || persisting) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [isDirty, persistReady, persisting]
    )
  );

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
    let planned = planAssignment({
      ...params,
      totalDays: days.length,
      days,
      lineCapacityById,
    });
    if (!planned) {
      const extended = extendDays(10);
      planned = planAssignment({
        ...params,
        totalDays: extended.length,
        days: extended,
        lineCapacityById,
      });
    }
    return planned;
  };

  const tryRebuildLineWithInsert = (params) => {
    let result = rebuildLineWithInsert({
      ...params,
      totalDays: days.length,
      days,
      lineCapacityById,
    });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithInsert({
        ...params,
        totalDays: extended.length,
        days: extended,
        lineCapacityById,
      });
    }
    return result;
  };

  const tryRebuildLineWithChain = (params) => {
    let result = rebuildLineWithChain({
      ...params,
      totalDays: days.length,
      days,
      lineCapacityById,
    });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithChain({
        ...params,
        totalDays: extended.length,
        days: extended,
        lineCapacityById,
      });
    }
    return result;
  };

  const tryRebuildLineWithReplace = (params) => {
    let result = rebuildLineWithReplace({
      ...params,
      totalDays: days.length,
      days,
      lineCapacityById,
    });
    if (!result) {
      const extended = extendDays(10);
      result = rebuildLineWithReplace({
        ...params,
        totalDays: extended.length,
        days: extended,
        lineCapacityById,
      });
    }
    return result;
  };
  const reflowLineAssignmentsAfterCtUpdate = useCallback(
    (nextAssignments, { lineId, reflowStartIndex }) => {
      const normalizedAssignments = (Array.isArray(nextAssignments) ? nextAssignments : []).map((item) =>
        normalizeAssignmentLayout(item)
      );
      const lineKey = normalizeKey(lineId);
      if (!lineKey) {
        return {
          assignments: normalizedAssignments,
          daysForAssignments: days,
          reflowFailed: false,
        };
      }

      const targetLineAssignments = normalizedAssignments.filter(
        (item) => normalizeKey(item?.lineId) === lineKey
      );
      if (targetLineAssignments.length <= 1) {
        return {
          assignments: normalizedAssignments,
          daysForAssignments: days,
          reflowFailed: false,
        };
      }

      const safeReflowStartIndex = toNonNegativeInt(reflowStartIndex, 0);
      let candidateDays = days;
      let plannedLineAssignments = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        plannedLineAssignments = reflowAssignmentsByLineCapacity({
          assignments: targetLineAssignments,
          totalDays: candidateDays.length,
          days: candidateDays,
          lineCapacityById,
          sourceLineCapacityById: lineCapacityById,
          reflowStartIndex: safeReflowStartIndex,
        });
        if (plannedLineAssignments) break;
        candidateDays = buildDays(startDateRef.current, candidateDays.length + 20, holidaySet);
      }

      if (!plannedLineAssignments) {
        return {
          assignments: normalizedAssignments,
          daysForAssignments: days,
          reflowFailed: true,
        };
      }

      const plannedById = new Map(
        plannedLineAssignments.map((item) => [String(item?.id ?? ''), normalizeAssignmentLayout(item)])
      );
      const mergedAssignments = normalizedAssignments.map((item) => {
        const key = String(item?.id ?? '');
        return plannedById.get(key) || item;
      });

      return {
        assignments: mergedAssignments,
        daysForAssignments: candidateDays,
        reflowFailed: false,
      };
    },
    [days, holidaySet, lineCapacityById]
  );

  const assignedCardIds = useMemo(() => {
    return new Set(assignments.map((item) => item.cardId).filter(Boolean));
  }, [assignments]);

  const cardById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards]
  );
  const styleById = useMemo(
    () => new Map((Array.isArray(styles) ? styles : []).map((style) => [String(style.id), style])),
    [styles]
  );
  const assignmentById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments]
  );
  const isAssignmentLocked = useCallback(
    (assignment) => isAssignmentLockedStatus(assignment?.ctStatus),
    []
  );

  const assignmentsForRender = useMemo(() => {
    return assignments.map((item) => {
      if (!item.cardId) return item;
      const card = cardById.get(item.cardId);
      if (!card) return item;
      return {
        ...item,
        quantity: item.quantity ?? card.quantity,
        gender: item.gender ?? card.gender,
      };
    });
  }, [assignments, cardById]);

  const unassignedCards = useMemo(
    () => cards.filter((card) => !assignedCardIds.has(card.id)),
    [cards, assignedCardIds]
  );

  const filteredCards = useMemo(() => {
    if (!searchTerm) return unassignedCards;
    const lower = searchTerm.toLowerCase();
    return unassignedCards.filter(
      (card) =>
        card.styleName.toLowerCase().includes(lower) ||
        card.customer.toLowerCase().includes(lower) ||
        (card.colorName ? card.colorName.toLowerCase().includes(lower) : false) ||
        (card.gender ? String(card.gender).toLowerCase().includes(lower) : false) ||
        (card.orderNo ? card.orderNo.toLowerCase().includes(lower) : false)
    );
  }, [unassignedCards, searchTerm]);

  const groupedFilteredCards = useMemo(() => {
    const groups = new Map();
    filteredCards.forEach((card) => {
      const orderNo = normalizeKey(card?.orderNo) || '주문번호 없음';
      const dueDate = normalizeKey(card?.dueDate);
      const dueDateTimestamp = parseDueDateToTimestamp(dueDate);
      if (!groups.has(orderNo)) {
        groups.set(orderNo, {
          orderNo,
          dueDate: dueDate || '',
          dueDateTimestamp,
          cards: [],
        });
      }
      const group = groups.get(orderNo);
      group.cards.push(card);

      if (dueDateTimestamp != null) {
        if (group.dueDateTimestamp == null || dueDateTimestamp < group.dueDateTimestamp) {
          group.dueDateTimestamp = dueDateTimestamp;
          group.dueDate = dueDate;
        }
      } else if (!group.dueDate && dueDate) {
        group.dueDate = dueDate;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.dueDateTimestamp == null && b.dueDateTimestamp == null) {
        return a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
      }
      if (a.dueDateTimestamp == null) return 1;
      if (b.dueDateTimestamp == null) return -1;
      if (a.dueDateTimestamp !== b.dueDateTimestamp) {
        return a.dueDateTimestamp - b.dueDateTimestamp;
      }
      return a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
    });
  }, [filteredCards]);

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.id), line])),
    [lines]
  );
  const detailAssignment = useMemo(() => {
    if (!detailState || detailState.targetType !== 'assignment') return null;
    return assignmentById.get(String(detailState.assignmentId)) || null;
  }, [detailState, assignmentById]);
  const detailCard = useMemo(() => {
    if (!detailState) return null;
    if (detailState.targetType === 'card') {
      return cardById.get(String(detailState.cardId)) || null;
    }
    return cardById.get(String(detailAssignment?.cardId || '')) || null;
  }, [detailState, detailAssignment, cardById]);
  const detailStyle = useMemo(() => {
    const styleId = String(detailCard?.styleId || '').trim();
    if (!styleId) return null;
    return styleById.get(styleId) || null;
  }, [detailCard, styleById]);
  const detailLine = useMemo(() => {
    if (!detailAssignment) return null;
    return lineById.get(String(detailAssignment.lineId)) || null;
  }, [detailAssignment, lineById]);
  const detailTargetKey = useMemo(() => {
    if (!detailState) return '';
    if (detailState.targetType === 'assignment') {
      return `assignment:${String(detailState.assignmentId || '')}`;
    }
    return `card:${String(detailState.cardId || '')}`;
  }, [detailState]);
  const detailDraftByProcess = useMemo(
    () => detailDraftsByTarget[detailTargetKey] || {},
    [detailDraftsByTarget, detailTargetKey]
  );
  const detailStDraftByProcess = useMemo(
    () => detailStDraftsByTarget[detailTargetKey] || {},
    [detailStDraftsByTarget, detailTargetKey]
  );
  const detailOperatorProposalByProcess = useMemo(() => {
    const map = new Map();
    const proposal = detailCard?.operatorCtProposal;
    const processes = Array.isArray(proposal?.processes) ? proposal.processes : [];
    const orderQuantity = Math.max(
      1,
      toPositiveInt(detailAssignment?.quantity ?? detailCard?.quantity ?? 1, 1)
    );
    const proposalQuantity = Math.max(
      1,
      toPositiveInt(proposal?.quantity ?? orderQuantity, orderQuantity)
    );
    if (proposalQuantity !== orderQuantity) return map;
    processes.forEach((item) => {
      const processKey = String(item?.processKey || '').trim();
      const proposedSeconds = toOptionalPositiveNumber(item?.proposedSeconds);
      const stSeconds = toOptionalPositiveNumber(
        item?.stSeconds ?? item?.suggestedSeconds ?? item?.baseSeconds
      );
      const seedSeconds = stSeconds ?? proposedSeconds;
      if (!processKey || seedSeconds == null) return;
      map.set(processKey, {
        stSeconds: seedSeconds,
        proposedSeconds: proposedSeconds ?? seedSeconds,
      });
    });
    return map;
  }, [detailCard?.operatorCtProposal, detailAssignment?.quantity, detailCard?.quantity]);
  const detailLineRequestByProcess = useMemo(() => {
    const map = new Map();
    const proposal = detailCard?.pendingCtProposal;
    if (!proposal || typeof proposal !== 'object') return map;
    if (
      detailAssignment?.id &&
      proposal?.sourceAssignmentId &&
      String(proposal.sourceAssignmentId) !== String(detailAssignment.id)
    ) {
      return map;
    }
    const processes = Array.isArray(proposal?.processes) ? proposal.processes : [];
    processes.forEach((item) => {
      const processKey = String(item?.processKey || '').trim();
      const requestedSeconds = toOptionalPositiveNumber(
        item?.requestedSeconds ?? item?.proposedSeconds
      );
      if (!processKey || requestedSeconds == null) return;
      map.set(processKey, requestedSeconds);
    });
    return map;
  }, [detailCard?.pendingCtProposal, detailAssignment?.id]);
  const detailPendingLineRequestProposal = useMemo(() => {
    const proposal = detailCard?.pendingCtProposal;
    if (!proposal || typeof proposal !== 'object') return null;
    if (
      detailAssignment?.id &&
      proposal?.sourceAssignmentId &&
      String(proposal.sourceAssignmentId) !== String(detailAssignment.id)
    ) {
      return null;
    }
    return proposal;
  }, [detailCard?.pendingCtProposal, detailAssignment?.id]);
  const detailProcessRows = useMemo(() => {
    const orderQuantity = Math.max(
      1,
      toPositiveInt(detailAssignment?.quantity ?? detailCard?.quantity ?? 1, 1)
    );
    const processes = normalizeProcesses(detailStyle?.processes);
    if (processes.length === 0) return [];
    const lineDailyCapacitySeconds = Number(
      detailAssignment
        ? getLineCapacitySeconds(detailAssignment.lineId, lineCapacityById)
        : DAILY_CAPACITY_SECONDS
    );
    const assignmentStatus = normalizeCtStatus(detailAssignment?.ctStatus);
    const isAgreedAssignment = assignmentStatus === 'AGREED';
    const wagePerSecond = toOptionalPositiveNumber(
      detailLine?.factoryWagePerSecond ??
        detailLine?.wagePerSecond ??
        detailAssignment?.factoryWagePerSecond ??
        detailAssignment?.wagePerSecond
    );
    const agreedSnapshot = detailCard?.ctAgreedSnapshot;
    const agreedSnapshotQuantity = Math.max(
      1,
      toPositiveInt(agreedSnapshot?.quantity ?? orderQuantity, orderQuantity)
    );
    const canUseAgreedSnapshot =
      isAgreedAssignment &&
      agreedSnapshot &&
      agreedSnapshotQuantity === orderQuantity &&
      (!detailAssignment?.id ||
        !agreedSnapshot?.sourceAssignmentId ||
        String(agreedSnapshot.sourceAssignmentId) === String(detailAssignment.id));
    const agreedSnapshotByProcess = (
      canUseAgreedSnapshot && Array.isArray(agreedSnapshot?.processes)
        ? agreedSnapshot.processes
        : []
    ).reduce((map, item) => {
      const processKey = String(item?.processKey || '').trim();
      if (!processKey) return map;
      const agreedSeconds = toOptionalPositiveNumber(
        item?.agreedSeconds ?? item?.requestedSeconds ?? item?.proposedSeconds
      );
      const requestedSeconds = toOptionalPositiveNumber(
        item?.requestedSeconds ??
          item?.lineRequestedSeconds ??
          item?.proposedSeconds ??
          item?.agreedSeconds
      );
      const proposedSeconds = toOptionalPositiveNumber(
        item?.proposedSeconds ?? item?.stSeconds ?? item?.suggestedSeconds
      );
      map.set(processKey, {
        agreedSeconds,
        requestedSeconds,
        proposedSeconds,
      });
      return map;
    }, new Map());
    return processes.map((process, index) => {
      const processKey = String(
        process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
      );
      const processName = process?.name || process?.processName || process?.code || `공정 ${index + 1}`;
      const processQuantity = Math.max(1, toPositiveInt(process?.quantity, 1));
      const ptInfo = resolveProcessPtInfo(process, orderQuantity);
      const atSeconds = resolveProcessAtPerPieceSeconds(process, orderQuantity);
      const atReliability = resolveProcessAtReliability(process, orderQuantity);
      const operatorProposal = detailOperatorProposalByProcess.get(processKey) ?? null;
      const baseStSeedInfo = resolveProcessStSeedSeconds({
        process,
        orderQuantity,
        proposalStSeconds: operatorProposal?.stSeconds ?? null,
      });
      const stDraftSeconds = toOptionalPositiveNumber(detailStDraftByProcess[processKey]);
      const baseSeconds = stDraftSeconds ?? baseStSeedInfo.seconds;
      const hasStDraftChange =
        stDraftSeconds != null &&
        Math.abs(stDraftSeconds - baseStSeedInfo.seconds) > 1e-6;
      const agreedSnapshotEntry = agreedSnapshotByProcess.get(processKey) ?? null;
      const agreedSnapshotSeconds = agreedSnapshotEntry?.agreedSeconds ?? null;
      const agreedSnapshotRequestedSeconds = agreedSnapshotEntry?.requestedSeconds ?? null;
      const agreedSnapshotProposedSeconds = agreedSnapshotEntry?.proposedSeconds ?? null;
      const proposedSeedSeconds =
        operatorProposal?.proposedSeconds ?? agreedSnapshotProposedSeconds ?? baseSeconds;
      const proposedDraftSeconds = toOptionalPositiveNumber(detailDraftByProcess[processKey]);
      const proposedSeconds = proposedDraftSeconds ?? proposedSeedSeconds;
      const lineRequestedSeconds =
        detailLineRequestByProcess.get(processKey) ??
        (isAgreedAssignment ? agreedSnapshotRequestedSeconds : null);
      const confirmedSeconds = isAgreedAssignment
        ? agreedSnapshotSeconds ??
          lineRequestedSeconds ??
          toOptionalPositiveNumber(operatorProposal?.proposedSeconds ?? proposedSeconds) ??
          toOptionalPositiveNumber(proposedSeconds) ??
          toOptionalPositiveNumber(proposedSeedSeconds)
        : null;
      const hasLineRequestedChange =
        lineRequestedSeconds != null &&
        Math.abs(lineRequestedSeconds - proposedSeedSeconds) > 1e-6;
      const basePerPieceSeconds = baseSeconds * processQuantity;
      const proposedPerPieceSeconds = proposedSeconds * processQuantity;
      const confirmedPerPieceSeconds =
        confirmedSeconds == null ? null : confirmedSeconds * processQuantity;
      const totalProposedSeconds = proposedPerPieceSeconds * orderQuantity;
      return {
        processKey,
        processName,
        processQuantity,
        basis: stDraftSeconds != null ? 'ST' : baseStSeedInfo.source,
        ptSeconds: ptInfo.seconds,
        ptReferenceQuantity: ptInfo.referenceQuantity,
        ptIsReferenceFallback: ptInfo.isReferenceFallback,
        atSeconds,
        atReliability,
        baseSeconds,
        hasStDraftChange,
        proposedSeedSeconds,
        requestedSeconds: proposedSeconds,
        proposedSeconds,
        lineRequestedSeconds,
        hasLineRequestedChange,
        basePerPieceSeconds,
        requestedPerPieceSeconds: proposedPerPieceSeconds,
        proposedPerPieceSeconds,
        confirmedSeconds,
        confirmedPerPieceSeconds,
        totalBaseSeconds: basePerPieceSeconds * orderQuantity,
        totalRequestedSeconds: totalProposedSeconds,
        totalProposedSeconds,
        proposedUnitCost: resolveCtUnitCost(proposedSeconds, wagePerSecond),
        requestedUnitCost: resolveCtUnitCost(lineRequestedSeconds, wagePerSecond),
        confirmedUnitCost: resolveCtUnitCost(confirmedSeconds, wagePerSecond),
        perPieceCost: wagePerSecond == null ? null : proposedPerPieceSeconds * wagePerSecond,
        expectedCost: wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond,
        expectedDays:
          Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
            ? totalProposedSeconds / lineDailyCapacitySeconds
            : null,
      };
    });
  }, [
    detailAssignment,
    detailAssignment?.quantity,
    detailCard?.quantity,
    detailStyle?.processes,
    detailDraftByProcess,
    detailStDraftByProcess,
    detailOperatorProposalByProcess,
    detailLineRequestByProcess,
    detailCard?.ctAgreedSnapshot,
    detailLine?.factoryWagePerSecond,
    detailLine?.wagePerSecond,
    lineCapacityById,
  ]);
  const detailSummary = useMemo(() => {
    if (!detailCard) return null;
    const assignmentStatus = normalizeCtStatus(detailAssignment?.ctStatus);
    const isAgreedAssignment = assignmentStatus === 'AGREED';
    const orderQuantity = Math.max(
      1,
      toPositiveInt(detailAssignment?.quantity ?? detailCard?.quantity ?? 1, 1)
    );
    const lineDailyCapacitySeconds = Number(
      detailAssignment
        ? getLineCapacitySeconds(detailAssignment.lineId, lineCapacityById)
        : DAILY_CAPACITY_SECONDS
    );
    const totalBasePerPieceSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce((sum, row) => sum + row.basePerPieceSeconds, 0)
        : Number(detailCard?.totalSeconds || 0) / orderQuantity;
    const totalRequestedPerPieceSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce((sum, row) => sum + row.requestedPerPieceSeconds, 0)
        : Number(detailAssignment?.proposalSeconds || detailCard?.totalSeconds || 0) / orderQuantity;
    const totalConfirmedPerPieceSeconds =
      isAgreedAssignment && detailProcessRows.length > 0
        ? detailProcessRows.reduce(
            (sum, row) => sum + (Number(row?.confirmedPerPieceSeconds) || 0),
            0
          )
        : null;
    const totalRequestedSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce((sum, row) => sum + row.totalRequestedSeconds, 0)
        : Number(detailAssignment?.proposalSeconds || detailCard?.totalSeconds || 0);
    const totalBaseSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce((sum, row) => sum + row.totalBaseSeconds, 0)
        : Number(detailCard?.totalSeconds || 0);
    const headcount = Math.max(1, Number(detailLine?.headcount || 1));
    const wagePerSecond = toOptionalPositiveNumber(
      detailLine?.factoryWagePerSecond ??
        detailLine?.wagePerSecond ??
        detailAssignment?.factoryWagePerSecond ??
        detailAssignment?.wagePerSecond
    );
    const expectedCost =
      wagePerSecond == null ? null : totalRequestedSeconds * wagePerSecond;
    const totalDurationDays =
      Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
        ? totalRequestedSeconds / lineDailyCapacitySeconds
        : null;
    const perPersonExpected = expectedCost == null ? null : expectedCost / headcount;
    return {
      orderQuantity,
      totalBasePerPieceSeconds,
      totalRequestedPerPieceSeconds,
      totalConfirmedPerPieceSeconds,
      totalBaseSeconds,
      totalRequestedSeconds,
      divergencePercent: calcDivergencePercent(totalRequestedPerPieceSeconds, totalBasePerPieceSeconds),
      wagePerSecond,
      expectedCost,
      totalDurationDays,
      perPersonExpected,
    };
  }, [detailCard, detailAssignment, detailLine, detailProcessRows, lineCapacityById]);
  const detailQuantityLabel = useMemo(
    () =>
      formatNumberWithCommas(
        Math.max(
          1,
          toPositiveInt(
            detailSummary?.orderQuantity ?? detailAssignment?.quantity ?? detailCard?.quantity ?? 1,
            1
          )
        ),
        { fallback: '1', maximumFractionDigits: 0 }
      ),
    [detailSummary?.orderQuantity, detailAssignment?.quantity, detailCard?.quantity]
  );
  const detailIsLocked = useMemo(
    () => Boolean(detailAssignment && isAssignmentLocked(detailAssignment)),
    [detailAssignment, isAssignmentLocked]
  );
  const detailCtStatus = normalizeCtStatus(detailAssignment?.ctStatus);
  const detailRequestedPerPieceSeconds = useMemo(() => {
    const pendingRequested = Number(detailPendingLineRequestProposal?.totalProposedPerPieceSeconds);
    if (Number.isFinite(pendingRequested) && pendingRequested > 0) {
      return pendingRequested;
    }
    if (detailCtStatus !== 'AGREED' || detailProcessRows.length === 0) {
      return null;
    }
    const requestedRows = detailProcessRows
      .map((row) => Number(row?.lineRequestedSeconds))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (requestedRows.length === 0) return null;
    return requestedRows.reduce((sum, value) => sum + value, 0);
  }, [detailPendingLineRequestProposal, detailCtStatus, detailProcessRows]);
  const isAdminUser = useMemo(
    () => String(activeOrgRole || '').trim().toUpperCase() === 'ADMIN',
    [activeOrgRole]
  );
  const detailIsEscalated = Boolean(
    detailAssignment &&
      detailCtStatus === 'SENT' &&
      String(detailAssignment?.ctEscalatedAt || '').trim()
  );
  const canReopenAgreedAssignment = Boolean(
    detailAssignment && detailCtStatus === 'AGREED' && isAdminUser
  );
  const detailInLineRequestFlow = Boolean(
    detailAssignment &&
      detailCtStatus === 'REJECTED' &&
      detailPendingLineRequestProposal
  );
  const detailHasProposalChange = useMemo(
    () =>
      detailProcessRows.some(
        (row) =>
          row.hasStDraftChange === true ||
          Math.abs(Number(row.proposedSeconds) - Number(row.proposedSeedSeconds)) > 1e-6
      ),
    [detailProcessRows]
  );
  const canAgreeLineRequest = Boolean(
    detailInLineRequestFlow && !detailIsLocked && !detailHasProposalChange
  );
  const canSendProposal = Boolean(detailAssignment && detailProcessRows.length > 0 && detailCtStatus !== 'AGREED');
  const canResendProposal = detailInLineRequestFlow
    ? canSendProposal && detailHasProposalChange
    : canSendProposal;
  const contextMenuTargetAssignment = useMemo(() => {
    if (!contextMenuState || contextMenuState.targetType !== 'assignment') return null;
    return assignmentById.get(String(contextMenuState.id)) || null;
  }, [contextMenuState, assignmentById]);
  const contextMenuTargetCard = useMemo(() => {
    if (!contextMenuState || contextMenuState.targetType !== 'card') return null;
    return cardById.get(String(contextMenuState.id)) || null;
  }, [contextMenuState, cardById]);
  const contextSplitDisabled = useMemo(() => {
    if (!contextMenuState) return true;
    if (contextMenuState.targetType === 'assignment') {
      if (!contextMenuTargetAssignment) return true;
      if (isAssignmentLocked(contextMenuTargetAssignment)) return true;
      return Number(contextMenuTargetAssignment.quantity ?? 0) <= 1;
    }
    if (!contextMenuTargetCard) return true;
    return Number(contextMenuTargetCard.quantity ?? 0) <= 1;
  }, [
    contextMenuState,
    contextMenuTargetAssignment,
    contextMenuTargetCard,
    isAssignmentLocked,
  ]);

  const handleContextMenuOpen = useCallback((payload) => {
    if (!payload?.targetType || !payload?.id) return;
    setContextMenuState({
      targetType: payload.targetType,
      id: String(payload.id),
      mouseX: Number(payload.mouseX) || 0,
      mouseY: Number(payload.mouseY) || 0,
    });
  }, []);
  const handleContextMenuClose = useCallback(() => setContextMenuState(null), []);
  const handleContextOpenDetail = useCallback(() => {
    if (!contextMenuState) return;
    if (contextMenuState.targetType === 'assignment') {
      setDetailState({ targetType: 'assignment', assignmentId: contextMenuState.id });
    } else {
      setDetailState({ targetType: 'card', cardId: contextMenuState.id });
    }
    setContextMenuState(null);
  }, [contextMenuState]);
  const handleCloseDetail = useCallback(() => {
    if (sendingProposal) return;
    blurActiveElement();
    setDetailState(null);
  }, [blurActiveElement, sendingProposal]);
  const handleDetailDraftInput = useCallback((processKey, value) => {
    if (!detailTargetKey || !processKey) return;
    if (!CT_INPUT_REGEX.test(value)) return;
    setDetailDraftsByTarget((prev) => {
      const currentForTarget = prev[detailTargetKey] || {};
      if (value === '') {
        if (!(processKey in currentForTarget)) return prev;
        const nextForTarget = { ...currentForTarget };
        delete nextForTarget[processKey];
        return {
          ...prev,
          [detailTargetKey]: nextForTarget,
        };
      }
      if (currentForTarget[processKey] === value) return prev;
      return {
        ...prev,
        [detailTargetKey]: {
          ...currentForTarget,
          [processKey]: value,
        },
      };
    });
  }, [detailTargetKey]);
  const handleDetailStDraftInput = useCallback((processKey, value) => {
    if (!detailTargetKey || !processKey) return;
    if (!CT_INPUT_REGEX.test(value)) return;
    setDetailStDraftsByTarget((prev) => {
      const currentForTarget = prev[detailTargetKey] || {};
      if (value === '') {
        if (!(processKey in currentForTarget)) return prev;
        const nextForTarget = { ...currentForTarget };
        delete nextForTarget[processKey];
        return {
          ...prev,
          [detailTargetKey]: nextForTarget,
        };
      }
      if (currentForTarget[processKey] === value) return prev;
      return {
        ...prev,
        [detailTargetKey]: {
          ...currentForTarget,
          [processKey]: value,
        },
      };
    });
    // ST 변경 시 제안 CT 초안도 동일 값으로 맞춰 즉시 오퍼 기준에 반영한다.
    setDetailDraftsByTarget((prev) => {
      const currentForTarget = prev[detailTargetKey] || {};
      if (value === '') {
        if (!(processKey in currentForTarget)) return prev;
        const nextForTarget = { ...currentForTarget };
        delete nextForTarget[processKey];
        return {
          ...prev,
          [detailTargetKey]: nextForTarget,
        };
      }
      if (currentForTarget[processKey] === value) return prev;
      return {
        ...prev,
        [detailTargetKey]: {
          ...currentForTarget,
          [processKey]: value,
        },
      };
    });
  }, [detailTargetKey]);

  const handleDragStart = useCallback((event) => {
    const { active } = event;
    if (!active) return;
    const id = String(active.id);
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = cardById.get(cardId);
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
      const assignment = assignmentById.get(assignmentId);
      if (assignment) {
        setActiveDrag({
          type: 'assignment',
          label: assignment.label,
          customer: assignment.customer,
          orderNo: assignment.orderNo,
        });
      }
    }
  }, [cardById, assignmentById]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) {
      if (String(active.id).startsWith('assign-')) {
        const assignmentId = String(active.id).replace('assign-', '');
        const target = assignmentById.get(assignmentId);
        if (normalizeCtStatus(target?.ctStatus) === 'AGREED') {
          showNotification('확정된 작업은 라인에서 제외할 수 없습니다.', 'warning');
          setActiveDrag(null);
          return;
        }
        setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
      }
      setActiveDrag(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('assign-')) {
      const movingAssignmentId = activeId.replace('assign-', '');
      const movingAssignment = assignmentById.get(movingAssignmentId);
    }

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
        const sourceAssignment = assignmentById.get(assignmentId);
        if (normalizeCtStatus(sourceAssignment?.ctStatus) === 'AGREED') {
          showNotification('확정된 작업은 라인에서 제외할 수 없습니다.', 'warning');
          setActiveDrag(null);
          return;
        }
        if (mergeAssignmentIntoCardTarget(targetCardId, assignmentId)) {
          setActiveDrag(null);
          return;
        }
      }
    }

    if (overId.startsWith('assign-drop-')) {
      const targetId = overId.replace('assign-drop-', '');
      const targetAssignment = assignmentById.get(targetId);
      if (targetAssignment && activeId.startsWith('card-')) {
        const sourceCardId = activeId.replace('card-', '');
        const sourceCard = cardById.get(sourceCardId);
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
    let dropBeforeTarget = false; // true: 타겟 앞에 배치, false: 타겟 뒤에 배치

    if (overId.startsWith('assign-drop-')) {
      const targetId = overId.replace('assign-drop-', '');
      targetOnDay = assignmentById.get(targetId) ?? null;
      if (targetOnDay) {
        lineId = targetOnDay.lineId;
        // 자신의 droppable 위에 드롭한 경우(배정 바가 DropCell을 덮음):
        // startIndex 대신 drag delta로 실제 목표 날짜를 추정한다
        if (activeId.startsWith('assign-') && targetId === activeId.replace('assign-', '')) {
          const dayDelta = Math.round(event.delta.x / 100);
          dayIndex = Math.max(0, targetOnDay.startIndex + dayDelta);
        } else {
          // 타겟 바 위에 드롭: 포인터가 바의 앞/뒤 절반 중 어디에 있는지 판단
          const overRect = event.over?.rect;
          const activator = event.activatorEvent;
          const pointerX =
            activator && typeof activator.clientX === 'number'
              ? activator.clientX + event.delta.x
              : null;
          if (overRect && pointerX != null) {
            const relPos = (pointerX - overRect.left) / Math.max(overRect.width, 1);
            dropBeforeTarget = relPos < 0.5;
            // 포인터가 위치한 실제 날짜 셀 계산
            const spanDays = Math.max(targetOnDay.endIndex - targetOnDay.startIndex + 1, 1);
            const dayOffset = Math.floor(relPos * spanDays);
            dayIndex = Math.max(
              targetOnDay.startIndex,
              Math.min(targetOnDay.endIndex, targetOnDay.startIndex + dayOffset)
            );
          } else {
            dayIndex = targetOnDay.startIndex;
          }
        }
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
      const card = cardById.get(cardId);
      if (!card) {
        setActiveDrag(null);
        return;
      }
      const basis = getCardBasis(card);
      if (basis === 'NONE') {
        setActiveDrag(null);
        return;
      }
      const totalSeconds = resolveCardTotalSeconds(card);
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
        gender: card.gender,
        previewUrl: card.previewUrl,
        imageUrl: card.imageUrl,
        thumbnailUrl: card.thumbnailUrl,
        quantity: card.quantity,
        originOrderId: getCardOriginId(card) ?? cardId,
        basis,
        proposalBasis: basis,
        proposalSeconds: totalSeconds,
        contractedSeconds: null,
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
      const movingAssignmentForCheck = assignmentById.get(assignmentId);
      if (
        normalizeCtStatus(movingAssignmentForCheck?.ctStatus) === 'AGREED' &&
        String(lineId) !== String(movingAssignmentForCheck?.lineId)
      ) {
        showNotification('확정된 작업은 다른 라인으로 이동할 수 없습니다.', 'warning');
        setActiveDrag(null);
        return;
      }
      setAssignments((prev) => {
        const target = prev.find((item) => item.id === assignmentId);
        if (!target) return prev;

        const filtered = prev.filter((item) => item.id !== assignmentId);

        const totalSeconds = getAssignmentTotalSeconds(target, days, lineCapacityById);

        if (!targetOnDay || targetOnDay.id === assignmentId) {
          // Dropped on same day & same line — nothing to change
          if (dayIndex === target.startIndex && String(lineId) === String(target.lineId)) {
            return prev;
          }

          // 빈 공간에 드롭: 정확한 날짜에 배치하고 기존 카드는 원래 위치 유지
          // (빈칸이 충분하면 간격 보존, 부족하면 아래 insertBeforeId 로직으로 밀어냄)
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
          // 포인터가 타겟 바의 앞 절반 → 타겟 앞에 삽입, 뒤 절반 → 타겟 뒤에 삽입
          if (dropBeforeTarget) {
            insertBeforeId = targetOnDay.id;
          } else {
            insertAfterId = targetOnDay.id;
          }
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
      const insertIndex = getNextStartIndex(prevItem, days, lineCapacityById);
      if (insertIndex == null) return prev;
      const chain = buildConnectedChain(lineItems, targetIndex, days, lineCapacityById);
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

  const promptSplitQuantity = useCallback((quantity) => {
    if (!quantity || quantity <= 1) return null;
    const input = window.prompt(`분할할 수량을 입력하세요 (1 ~ ${quantity - 1})`);
    if (input == null) return null;
    const value = Number(input);
    if (!Number.isFinite(value)) return null;
    const qty = Math.floor(value);
    if (qty <= 0 || qty >= quantity) return null;
    return qty;
  }, []);

  const buildSplitCard = useCallback((card, quantity, ratio, newId) => {
    const totalSeconds = scaleValue(card.totalSeconds, ratio);
    const totalPt = scaleValue(card.totalPt, ratio);
    const totalAt = scaleValue(card.totalAt, ratio);
    const totalSt = scaleValue(card.totalSt, ratio);
    const originOrderId = getCardOriginId(card) ?? card.id;
    return {
      ...card,
      id: newId,
      originOrderId,
      quantity,
      totalSeconds,
      totalPt,
      totalAt,
      totalSt,
      status: resolveCardStatus(card, totalPt, totalAt, totalSt),
    };
  }, []);

  const handleSplitCard = useCallback((cardId) => {
    const card = cardById.get(cardId);
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
  }, [cardById, promptSplitQuantity, buildSplitCard]);

  const handleSplitAssignment = useCallback((assignmentId) => {
    const target = assignmentById.get(assignmentId);
    if (target && isAssignmentLocked(target)) {
      showNotification('제안 송부된 작업은 잠금 상태라 수량 분할할 수 없습니다.', 'warning');
      return;
    }
    if (!target?.cardId) return;
    const card = cardById.get(target.cardId);
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
    const range = recomputeAssignmentRange(
      target,
      scaledSeconds,
      days,
      lineCapacityById
    );
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
  }, [
    assignmentById,
    cardById,
    promptSplitQuantity,
    buildSplitCard,
    days,
    lineCapacityById,
    isAssignmentLocked,
    showNotification,
  ]);
  const handleContextSplit = useCallback(() => {
    if (!contextMenuState) return;
    if (contextMenuState.targetType === 'assignment') {
      handleSplitAssignment(contextMenuState.id);
    } else {
      handleSplitCard(contextMenuState.id);
    }
    setContextMenuState(null);
  }, [contextMenuState, handleSplitAssignment, handleSplitCard]);
  const recalcCardsForStyleProcesses = useCallback((sourceCards, styleId, processes) => {
    const normalizedStyleId = String(styleId || '').trim();
    if (!normalizedStyleId) return sourceCards;
    return (Array.isArray(sourceCards) ? sourceCards : []).map((card) => {
      if (String(card?.styleId || '').trim() !== normalizedStyleId) return card;
      const quantity = Math.max(1, toPositiveInt(card?.quantity, 1));
      const nextTotalPt = getTotalForOrderQuantity(processes, 'pt', quantity);
      const nextTotalAt = getTotalForOrderQuantity(processes, 'at', quantity);
      const nextTotalSt = getTotalStForOrderQuantity(processes, quantity);
      const nextStatus = resolveCardStatus(card, nextTotalPt, nextTotalAt, nextTotalSt);
      const nextTotalSeconds =
        nextStatus === 'ST' ? nextTotalSt : nextStatus === 'AT' ? nextTotalAt : nextTotalPt;
      return {
        ...card,
        totalPt: nextTotalPt,
        totalAt: nextTotalAt,
        totalSt: nextTotalSt,
        status: nextStatus,
        totalSeconds: nextTotalSeconds,
      };
    });
  }, []);
  const handleSendProposalToLineLeader = useCallback(async () => {
    if (sendingProposal) return;
    if (!detailAssignment) return;
    if (detailCtStatus === 'AGREED') {
      showNotification('확정 완료된 작업은 재제안할 수 없습니다.', 'warning');
      return;
    }
    if (detailInLineRequestFlow && !detailHasProposalChange) {
      showNotification('다시 제안은 제안 CT를 수정한 뒤에 가능합니다.', 'warning');
      return;
    }
    if (!detailSummary || !Number.isFinite(detailSummary.totalRequestedSeconds) || detailSummary.totalRequestedSeconds <= 0) {
      showNotification('송부할 CT 값이 유효하지 않습니다.', 'error');
      return;
    }

    const assignmentId = String(detailAssignment.id);
    const nextTotalSeconds = Math.max(1, Math.round(detailSummary.totalRequestedSeconds));
    const nowIso = new Date().toISOString();
    const nextCards = cards;
    const nextStyles = styles;
    const updatedStyleId = null;

    try {
      setSendingProposal(true);

      const operatorProposalPayload = {
        sentAt: nowIso,
        sentBy: 'OPERATOR',
        sourceAssignmentId: assignmentId,
        lineId: detailAssignment?.lineId ?? null,
        quantity: detailSummary.orderQuantity,
        totalStPerPieceSeconds: detailSummary.totalBasePerPieceSeconds,
        totalProposedPerPieceSeconds: detailSummary.totalRequestedPerPieceSeconds,
        totalProposedSeconds: detailSummary.totalRequestedSeconds,
        processes: detailProcessRows.map((row) => ({
          processKey: row.processKey,
          name: row.processName,
          quantity: row.processQuantity,
          basis: row.basis,
          ptSeconds: row.ptSeconds,
          ptReferenceQuantity: row.ptReferenceQuantity,
          atSeconds: row.atSeconds,
          stSeconds: row.baseSeconds,
          proposedSeconds: row.requestedSeconds,
          proposedPerPieceSeconds: row.requestedPerPieceSeconds,
        })),
      };
      const nextCardsWithProposal = detailAssignment?.cardId
        ? nextCards.map((card) =>
            String(card?.id) === String(detailAssignment.cardId)
              ? {
                  ...card,
                  operatorCtProposal: operatorProposalPayload,
                  pendingCtProposal: null,
                }
              : card
          )
        : nextCards;
      const nextCardById = new Map(
        nextCardsWithProposal.map((card) => [String(card?.id || ''), card])
      );
      const lineReflowStartByLine = new Map();
      const registerLineForReflow = (lineId, startIndex) => {
        const key = normalizeKey(lineId);
        if (!key) return;
        const safeStartIndex = toNonNegativeInt(startIndex, 0);
        if (!lineReflowStartByLine.has(key)) {
          lineReflowStartByLine.set(key, safeStartIndex);
          return;
        }
        lineReflowStartByLine.set(
          key,
          Math.min(lineReflowStartByLine.get(key), safeStartIndex)
        );
      };
      const normalizedUpdatedStyleId = String(updatedStyleId || '').trim();

      const nextAssignments = assignments.map((item) => {
        if (String(item?.id) === assignmentId) {
          // totalSeconds는 ST(q) 기반 배정 기간 — CT 제안값(proposalSeconds)과 무관하게 유지
          return {
            ...item,
            proposalSeconds: nextTotalSeconds,
            contractedSeconds: null,
            ctStatus: 'SENT',
            ctOverride: false,
            ctSource: 'OPERATOR_PROPOSAL',
            ctAgreedBy: null,
            ctAgreedAt: null,
            ctSentAt: nowIso,
            ctEscalatedAt: null,
            ctEscalationReason: null,
            ctEscalationTargetRole: null,
            ctEscalationStatus: null,
            ctNote: `제안 송부 ${nowIso}`,
          };
        }

        if (normalizedUpdatedStyleId && !isAssignmentLocked(item)) {
          const linkedCard = nextCardById.get(String(item?.cardId || ''));
          const linkedStyleId = String(linkedCard?.styleId || '').trim();
          if (linkedCard && linkedStyleId === normalizedUpdatedStyleId) {
            const syncedItem = normalizeAssignmentLayout(
              syncAssignmentFromCard(item, linkedCard, days, lineCapacityById)
            );
            const beforeSeconds = toNonNegativeInt(item?.totalSeconds, 0);
            const afterSeconds = toNonNegativeInt(syncedItem?.totalSeconds, 0);
            const beforeProposal = toNonNegativeInt(
              item?.proposalSeconds ?? beforeSeconds,
              beforeSeconds
            );
            const afterProposal = toNonNegativeInt(
              syncedItem?.proposalSeconds ?? afterSeconds,
              afterSeconds
            );
            if (
              beforeSeconds !== afterSeconds ||
              beforeProposal !== afterProposal ||
              normalizeKey(item?.proposalBasis || item?.basis) !==
                normalizeKey(syncedItem?.proposalBasis || syncedItem?.basis)
            ) {
              registerLineForReflow(
                syncedItem?.lineId,
                Math.min(
                  toNonNegativeInt(item?.startIndex, 0),
                  toNonNegativeInt(syncedItem?.startIndex, 0)
                )
              );
            }
            return syncedItem;
          }
        }
        return item;
      });
      let normalizedAssignments = nextAssignments.map((item) =>
        normalizeAssignmentLayout(item)
      );
      let daysForAssignments = days;
      let reflowFailed = false;
      for (const [lineId, reflowStartIndex] of lineReflowStartByLine.entries()) {
        const reflowResult = reflowLineAssignmentsAfterCtUpdate(normalizedAssignments, {
          lineId,
          reflowStartIndex,
        });
        normalizedAssignments = reflowResult.assignments.map((item) =>
          normalizeAssignmentLayout(item)
        );
        if (Array.isArray(reflowResult.daysForAssignments)) {
          if (reflowResult.daysForAssignments.length > daysForAssignments.length) {
            daysForAssignments = reflowResult.daysForAssignments;
          }
        }
        if (reflowResult.reflowFailed) {
          reflowFailed = true;
        }
      }
      const query = buildQueryString({ orgId: activeOrgId });
      const response = await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCardsWithProposal, assignments: normalizedAssignments }),
        skipGlobalLoading: true,
      });
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        nextCardsWithProposal,
        normalizedAssignments
      );

      let nextDays = daysForAssignments;
      const maxEndIndex = persistedAssignments.reduce(
        (max, item) => Math.max(max, toNonNegativeInt(item?.endIndex, 0)),
        0
      );
      if (maxEndIndex + 10 > nextDays.length) {
        nextDays = buildDays(startDateRef.current, maxEndIndex + 10, holidaySet);
      }
      if (nextDays.length > days.length) {
        setDays(nextDays);
      }
      setStyles(nextStyles);
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      const persistedSnapshot = createPersistSnapshotText(
        persistedCards,
        persistedAssignments
      );
      lastSavedSnapshotRef.current = persistedSnapshot;
      if (reflowFailed) {
        showNotification('CT 반영 후 라인 일정 자동 정렬에 실패해 기존 배치를 유지했습니다.', 'warning');
      }
      showNotification('제안 송부 완료. 해당 작업은 잠금 처리되었습니다.', 'success');
      blurActiveElement();
      setDetailState(null);
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '제안 송부 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSendingProposal(false);
    }
  }, [
    sendingProposal,
    detailAssignment,
    detailSummary,
    detailStyle,
    detailProcessRows,
    isAssignmentLocked,
    detailInLineRequestFlow,
    detailHasProposalChange,
    showNotification,
    cards,
    styles,
    assignments,
    activeOrgId,
    recalcCardsForStyleProcesses,
    days,
    lineCapacityById,
    holidaySet,
    createPersistSnapshotText,
    reflowLineAssignmentsAfterCtUpdate,
    blurActiveElement,
  ]);
  const handleAgreeLineRequest = useCallback(async () => {
    if (sendingProposal) return;
    if (!detailAssignment || !detailCard) return;
    if (!canAgreeLineRequest || !detailPendingLineRequestProposal) {
      if (detailHasProposalChange) {
        showNotification('제안 CT를 수정한 상태에서는 요청 동의를 할 수 없습니다.', 'warning');
      } else {
        showNotification('요청 동의는 요청 상태에서만 가능합니다.', 'warning');
      }
      return;
    }

    const assignmentId = String(detailAssignment.id);
    const nowIso = new Date().toISOString();
    const orderQuantity = Math.max(
      1,
      toPositiveInt(
        detailSummary?.orderQuantity ??
          detailAssignment?.quantity ??
          detailCard?.quantity ??
          detailPendingLineRequestProposal?.quantity ??
          1,
        1
      )
    );
    let nextCards = cards;

    try {
      setSendingProposal(true);

      const agreedProcessRows = detailProcessRows.map((row) => {
        const proposedSeconds = toOptionalPositiveNumber(
          detailOperatorProposalByProcess.get(row.processKey)?.proposedSeconds ??
            row.proposedSeedSeconds ??
            row.proposedSeconds ??
            row.baseSeconds
        );
        const requestedSeconds = toOptionalPositiveNumber(
          detailLineRequestByProcess.get(row.processKey) ?? row.lineRequestedSeconds
        );
        const agreedSeconds = requestedSeconds ?? proposedSeconds ?? toOptionalPositiveNumber(row.baseSeconds);
        const normalizedAgreedSeconds = agreedSeconds ?? 0;
        const agreedPerPieceSeconds = normalizedAgreedSeconds * row.processQuantity;
        return {
          ...row,
          proposedSeconds: proposedSeconds ?? row.baseSeconds,
          requestedSeconds,
          agreedSeconds: normalizedAgreedSeconds,
          agreedPerPieceSeconds,
          agreedTotalSeconds: agreedPerPieceSeconds * orderQuantity,
        };
      });

      let agreedTotalSeconds = agreedProcessRows.reduce(
        (sum, row) => sum + row.agreedTotalSeconds,
        0
      );
      if (!Number.isFinite(agreedTotalSeconds) || agreedTotalSeconds <= 0) {
        agreedTotalSeconds = Number(
          detailPendingLineRequestProposal?.totalProposedSeconds ??
            detailSummary?.totalRequestedSeconds ??
            detailAssignment?.proposalSeconds ??
            detailAssignment?.totalSeconds ??
            0
        );
      }
      if (!Number.isFinite(agreedTotalSeconds) || agreedTotalSeconds <= 0) {
        showNotification('동의할 요청 CT 값이 유효하지 않습니다.', 'error');
        return;
      }

      const nextTotalSeconds = Math.max(1, Math.round(agreedTotalSeconds));
      const totalStPerPieceSeconds =
        agreedProcessRows.length > 0
          ? agreedProcessRows.reduce((sum, row) => sum + row.basePerPieceSeconds, 0)
          : nextTotalSeconds / orderQuantity;
      const totalAgreedPerPieceSeconds =
        agreedProcessRows.length > 0
          ? agreedProcessRows.reduce((sum, row) => sum + row.agreedPerPieceSeconds, 0)
          : nextTotalSeconds / orderQuantity;

      const agreementSnapshot = {
        agreedAt: nowIso,
        agreedBy: 'OPERATOR',
        sourceAssignmentId: assignmentId,
        lineId: detailAssignment?.lineId ?? null,
        quantity: orderQuantity,
        totalStPerPieceSeconds,
        totalAgreedPerPieceSeconds,
        totalAgreedSeconds: nextTotalSeconds,
        processes: agreedProcessRows.map((row) => ({
          processKey: row.processKey,
          name: row.processName,
          quantity: row.processQuantity,
          basis: row.basis,
          stSeconds: row.baseSeconds,
          proposedSeconds: row.proposedSeconds,
          requestedSeconds: row.requestedSeconds,
          agreedSeconds: row.agreedSeconds,
          agreedPerPieceSeconds: row.agreedPerPieceSeconds,
        })),
      };
      const nextCardsWithAgreement = detailAssignment?.cardId
        ? nextCards.map((card) =>
            String(card?.id) === String(detailAssignment.cardId)
              ? {
                  ...card,
                  ctAgreedSnapshot: agreementSnapshot,
                  pendingCtProposal: null,
                }
              : card
          )
        : nextCards;

      const nextAssignments = assignments.map((item) => {
        if (String(item?.id) !== assignmentId) return item;
        const preservedProposalSeconds =
          toNonNegativeInt(item?.proposalSeconds, 0) > 0
            ? toNonNegativeInt(item?.proposalSeconds, 0)
            : Math.max(1, Math.round(detailSummary?.totalRequestedSeconds || 0));
        // CT 동의는 임금 협의 결과만 반영한다.
        // totalSeconds(일정 기간)는 AT(q)/PT(q) 기반이므로 CT 합의로 변경하지 않는다.
        return {
          ...item,
          proposalSeconds: preservedProposalSeconds,
          contractedSeconds: nextTotalSeconds,
          ctStatus: 'AGREED',
          ctOverride: false,
          ctSource: 'LINE_LEADER_PROPOSAL',
          ctAgreedBy: 'OPERATOR',
          ctAgreedAt: nowIso,
          ctSentAt: null,
          ctEscalatedAt: null,
          ctEscalationReason: null,
          ctEscalationTargetRole: null,
          ctEscalationStatus: null,
          ctNote: `요청 동의 ${nowIso}`,
        };
      });
      const normalizedAssignments = nextAssignments.map((item) =>
        normalizeAssignmentLayout(item)
      );
      const daysForAssignments = days;
      const reflowFailed = false;
      const query = buildQueryString({ orgId: activeOrgId });
      const response = await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCardsWithAgreement, assignments: normalizedAssignments }),
        skipGlobalLoading: true,
      });
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        nextCardsWithAgreement,
        normalizedAssignments
      );

      let nextDays = daysForAssignments;
      const maxEndIndex = persistedAssignments.reduce(
        (max, item) => Math.max(max, toNonNegativeInt(item?.endIndex, 0)),
        0
      );
      if (maxEndIndex + 10 > nextDays.length) {
        nextDays = buildDays(startDateRef.current, maxEndIndex + 10, holidaySet);
      }
      if (nextDays.length > days.length) {
        setDays(nextDays);
      }
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      const persistedSnapshot = createPersistSnapshotText(
        persistedCards,
        persistedAssignments
      );
      lastSavedSnapshotRef.current = persistedSnapshot;
      if (reflowFailed) {
        showNotification('CT 반영 후 라인 일정 자동 정렬에 실패해 기존 배치를 유지했습니다.', 'warning');
      }
      showNotification('요청 동의 완료. 해당 작업이 확정 상태로 전환되었습니다.', 'success');
      blurActiveElement();
      setDetailState(null);
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '요청 동의 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSendingProposal(false);
    }
  }, [
    sendingProposal,
    detailAssignment,
    detailCard,
    canAgreeLineRequest,
    detailHasProposalChange,
    detailPendingLineRequestProposal,
    detailSummary?.orderQuantity,
    detailSummary?.totalRequestedSeconds,
    detailProcessRows,
    detailLineRequestByProcess,
    detailOperatorProposalByProcess,
    cards,
    assignments,
    activeOrgId,
    days,
    lineCapacityById,
    holidaySet,
    createPersistSnapshotText,
    resolvePersistedBoardState,
    resolveBoardSaveErrorMessage,
    reflowLineAssignmentsAfterCtUpdate,
    blurActiveElement,
    showNotification,
  ]);
  const handleCancelAssignmentFromLineRequest = useCallback(async () => {
    if (sendingProposal) return;
    if (!detailAssignment || !detailCard) return;
    if (!detailInLineRequestFlow) {
      showNotification('배정 취소는 요청 검토 단계에서만 가능합니다.', 'warning');
      return;
    }
    const confirmed = window.confirm(
      '해당 작업 배정을 취소하면 미배정 카드로 돌아갑니다. 계속하시겠습니까?'
    );
    if (!confirmed) return;

    const assignmentId = String(detailAssignment.id);
    const nextAssignments = assignments
      .filter((item) => String(item?.id) !== assignmentId)
      .map((item) => normalizeAssignmentLayout(item));
    const nextCards = detailAssignment?.cardId
      ? cards.map((card) =>
          String(card?.id) === String(detailAssignment.cardId)
            ? {
                ...card,
                pendingCtProposal: null,
              }
            : card
        )
      : cards;

    try {
      setSendingProposal(true);
      const query = buildQueryString({ orgId: activeOrgId });
      const response = await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCards, assignments: nextAssignments }),
        skipGlobalLoading: true,
      });
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        nextCards,
        nextAssignments
      );
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      const persistedSnapshot = createPersistSnapshotText(
        persistedCards,
        persistedAssignments
      );
      lastSavedSnapshotRef.current = persistedSnapshot;
      blurActiveElement();
      setDetailState(null);
      showNotification('배정을 취소했습니다. 해당 작업은 미배정으로 전환되었습니다.', 'info');
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '배정 취소 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSendingProposal(false);
    }
  }, [
    sendingProposal,
    detailAssignment,
    detailCard,
    detailInLineRequestFlow,
    assignments,
    cards,
    activeOrgId,
    createPersistSnapshotText,
    resolvePersistedBoardState,
    resolveBoardSaveErrorMessage,
    blurActiveElement,
    showNotification,
  ]);
  const handleReopenAgreedAssignment = useCallback(async () => {
    if (sendingProposal) return;
    if (!detailAssignment || !detailCard) return;
    if (!canReopenAgreedAssignment) {
      showNotification('재협의 개시는 관리자만 실행할 수 있습니다.', 'warning');
      return;
    }
    const confirmed = window.confirm(
      '확정된 작업을 재협의 상태로 되돌립니다. 기존 합의 이력을 보관하고 대기 상태로 전환할까요?'
    );
    if (!confirmed) return;

    const assignmentId = String(detailAssignment.id);
    const nowIso = new Date().toISOString();
    const actor =
      String(
        activeProfile?.employeeName || activeProfile?.name || activeProfile?.email || activeProfile?.label || ''
      ).trim() || 'ADMIN';

    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== assignmentId) return item;
      return normalizeAssignmentLayout({
        ...item,
        ctStatus: 'PENDING',
        ctSource: 'REOPENED_BY_ADMIN',
        ctAgreedBy: null,
        ctAgreedAt: null,
        ctSentAt: null,
        ctEscalatedAt: null,
        ctEscalationReason: null,
        ctEscalationTargetRole: null,
        ctEscalationStatus: null,
        ctNote: `재협의 개시 ${nowIso}`,
      });
    });

    const historyEntry = {
      archivedAt: nowIso,
      archivedBy: actor,
      reason: 'REOPEN_RENEGOTIATION',
      assignmentId,
      previous: {
        ctStatus: detailAssignment?.ctStatus || 'AGREED',
        contractedSeconds: detailAssignment?.contractedSeconds ?? null,
        proposalSeconds: detailAssignment?.proposalSeconds ?? null,
        ctSource: detailAssignment?.ctSource ?? null,
        ctAgreedBy: detailAssignment?.ctAgreedBy ?? null,
        ctAgreedAt: detailAssignment?.ctAgreedAt ?? null,
        ctNote: detailAssignment?.ctNote ?? null,
      },
    };

    const nextCards = detailAssignment?.cardId
      ? cards.map((card) => {
          if (String(card?.id) !== String(detailAssignment.cardId)) return card;
          const previousHistory = Array.isArray(card?.ctAgreementHistory)
            ? card.ctAgreementHistory
            : [];
          return {
            ...card,
            pendingCtProposal: null,
            ctAgreementHistory: [...previousHistory, historyEntry],
          };
        })
      : cards;

    try {
      setSendingProposal(true);
      const query = buildQueryString({ orgId: activeOrgId });
      const response = await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCards, assignments: nextAssignments }),
        skipGlobalLoading: true,
      });
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        nextCards,
        nextAssignments
      );
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      const persistedSnapshot = createPersistSnapshotText(
        persistedCards,
        persistedAssignments
      );
      lastSavedSnapshotRef.current = persistedSnapshot;
      blurActiveElement();
      setDetailState(null);
      showNotification('재협의가 시작되었습니다. 해당 작업이 대기 상태로 전환되었습니다.', 'info');
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '재협의 개시 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSendingProposal(false);
    }
  }, [
    sendingProposal,
    detailAssignment,
    detailCard,
    canReopenAgreedAssignment,
    activeProfile?.employeeName,
    activeProfile?.name,
    activeProfile?.email,
    activeProfile?.label,
    assignments,
    cards,
    activeOrgId,
    createPersistSnapshotText,
    resolvePersistedBoardState,
    resolveBoardSaveErrorMessage,
    blurActiveElement,
    showNotification,
  ]);

  const getAssignmentOriginId = (assignment) => {
    if (!assignment) return null;
    if (assignment.originOrderId) return assignment.originOrderId;
    const card = cardById.get(assignment.cardId);
    return getCardOriginId(card) ?? assignment.cardId ?? assignment.id;
  };

  const buildCardFromAssignment = (assignment) => {
    const card = cardById.get(assignment.cardId);
    if (card) return card;
    const basis = assignment.proposalBasis || assignment.basis;
    return {
      id: assignment.cardId ?? assignment.id,
      originOrderId: assignment.originOrderId ?? assignment.cardId ?? assignment.id,
      styleName: assignment.label || '스타일',
      colorName: assignment.colorName || '',
      gender: normalizeGenderKey(assignment.gender),
      quantity: assignment.quantity ?? 0,
      totalSeconds: assignment.totalSeconds ?? 0,
      totalPt: basis === 'PT' ? assignment.totalSeconds ?? 0 : 0,
      totalAt: basis === 'AT' ? assignment.totalSeconds ?? 0 : 0,
      totalSt: basis === 'ST' ? assignment.totalSeconds ?? 0 : 0,
      status: basis === 'AT' ? 'AT' : basis === 'ST' ? 'ST' : 'PT',
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
    const target = assignmentById.get(targetAssignmentId);
    const sourceCard = cardById.get(sourceCardId);
    if (!target || !sourceCard) return false;
    if (isAssignmentLocked(target)) return false;
    if (getAssignmentOriginId(target) !== getCardOriginId(sourceCard)) return false;

    const addedSeconds = resolveCardTotalSeconds(sourceCard);
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
    const targetCard = cardById.get(targetCardId);
    const sourceAssignment = assignmentById.get(sourceAssignmentId);
    if (!targetCard || !sourceAssignment) return false;
    if (isAssignmentLocked(sourceAssignment)) return false;
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
    const target = assignmentById.get(targetAssignmentId);
    const source = assignmentById.get(sourceAssignmentId);
    if (!target || !source) return false;
    if (isAssignmentLocked(target) || isAssignmentLocked(source)) return false;
    if (getAssignmentOriginId(target) !== getAssignmentOriginId(source)) return false;

    const sourceCard = buildCardFromAssignment(source);
    const addedSeconds = resolveCardTotalSeconds(sourceCard);
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
    setAssignments((prev) => {
      const locked = prev.filter((item) => isAssignmentLocked(item));
      if (locked.length > 0) {
        showNotification('송부된 작업은 잠금되어 초기화 대상에서 제외됩니다.', 'info');
      }
      return locked;
    });
  };

  const handleUndo = useCallback(() => {
    if (historyPastRef.current.length === 0) return;
    const currentSnapshot = createBoardSnapshotText(cards, assignments);
    const previousSnapshot = historyPastRef.current.pop();
    historyFutureRef.current.push(currentSnapshot);
    historyApplyingRef.current = true;
    applyBoardSnapshotText(previousSnapshot);
    syncHistoryStatus();
  }, [
    applyBoardSnapshotText,
    assignments,
    cards,
    createBoardSnapshotText,
    syncHistoryStatus,
  ]);

  const handleRedo = useCallback(() => {
    if (historyFutureRef.current.length === 0) return;
    const currentSnapshot = createBoardSnapshotText(cards, assignments);
    const nextSnapshot = historyFutureRef.current.pop();
    historyPastRef.current.push(currentSnapshot);
    historyApplyingRef.current = true;
    applyBoardSnapshotText(nextSnapshot);
    syncHistoryStatus();
  }, [
    applyBoardSnapshotText,
    assignments,
    cards,
    createBoardSnapshotText,
    syncHistoryStatus,
  ]);

  // ── 날짜 범위 네비게이션 헬퍼 ──────────────────────────────────────
  const toMonthStart = (d) => { const r = new Date(d); r.setDate(1); r.setHours(0,0,0,0); return r; };
  const toMonthEnd   = (d) => { const r = new Date(d); r.setDate(1); r.setMonth(r.getMonth()+1); r.setDate(0); r.setHours(0,0,0,0); return r; };

  const handleViewStartChange = (newStart) => {
    const s = new Date(newStart); s.setHours(0,0,0,0);
    const e = new Date(viewEnd);
    if (s > e) return;
    const range = Math.round((e - s) / 86400000) + 1;
    if (range > MAX_RANGE_DAYS) {
      const cappedEnd = new Date(s); cappedEnd.setDate(cappedEnd.getDate() + MAX_RANGE_DAYS - 1);
      setViewEnd(cappedEnd);
    }
    setViewStart(s);
  };
  const handleViewEndChange = (newEnd) => {
    const e = new Date(newEnd); e.setHours(0,0,0,0);
    const s = new Date(viewStart);
    if (e < s) return;
    const range = Math.round((e - s) / 86400000) + 1;
    if (range > MAX_RANGE_DAYS) return;
    setViewEnd(e);
  };
  // ◄ : FROM → 전달 1일
  const handlePrevMonthFrom = () => {
    const prev = toMonthStart(viewStart); prev.setMonth(prev.getMonth() - 1);
    handleViewStartChange(prev);
  };
  // ► : TO → 다음달 말일
  const handleNextMonthTo = () => {
    const nextMonthFirst = new Date(viewEnd.getFullYear(), viewEnd.getMonth() + 1, 1);
    const nextEnd = toMonthEnd(nextMonthFirst);
    handleViewEndChange(nextEnd);
  };
  // M- : 전달 전체 (from 기준)
  const handleMonthMinus = () => {
    const newStart = toMonthStart(viewStart); newStart.setMonth(newStart.getMonth() - 1);
    const newEnd   = toMonthEnd(newStart);
    setViewStart(newStart); setViewEnd(newEnd);
  };
  // M+ : 다음달 전체 (from 기준)
  const handleMonthPlus = () => {
    const newStart = toMonthStart(viewStart); newStart.setMonth(newStart.getMonth() + 1);
    const newEnd   = toMonthEnd(newStart);
    setViewStart(newStart); setViewEnd(newEnd);
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">작업 배정</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {persisting ? '저장 중...' : isDirty ? '저장 안됨' : '저장됨'}
            </Typography>
            <Button
              variant="contained"
              onClick={handleSaveBoard}
              disabled={persisting || !persistReady || !isDirty}
            >
              저장
            </Button>
            <Button
              variant="outlined"
              onClick={handleUndo}
              disabled={historyStatus.undoCount === 0}
            >
              되돌리기
            </Button>
            <Button
              variant="outlined"
              onClick={handleRedo}
              disabled={historyStatus.redoCount === 0}
            >
              다시하기
            </Button>
            <Button
              variant="outlined"
              onClick={handleResetAssignments}
              disabled={assignments.length === 0}
            >
              초기화
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
        <Grid container spacing={2} sx={{ minWidth: 0 }}>
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              <SearchInput
                placeholder="스타일/고객사/색상 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">미배정 카드</Typography>
                <Typography variant="caption" color="text.secondary">
                  {loading
                    ? '로딩 중...'
                    : `${filteredCards.length}개 · ${groupedFilteredCards.length}주문`}
                </Typography>
              </Box>
              <Stack
                spacing={1}
                sx={{
                  maxHeight: { xs: 360, md: 520 },
                  overflowY: 'auto',
                  pr: 0.5,
                }}
              >
                {groupedFilteredCards.map((group) => (
                  <Box
                    key={group.orderNo}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      p: 1,
                      backgroundColor: '#FAFAFB',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        주문 {group.orderNo}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {group.dueDate ? `납기 ${group.dueDate}` : '납기 미정'} · {group.cards.length}개
                      </Typography>
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        overflowX: 'auto',
                        pb: 0.5,
                      }}
                    >
                      {group.cards.map((card) => (
                        <Box
                          key={card.id}
                          sx={{
                            minWidth: { xs: 250, sm: 280 },
                            maxWidth: 320,
                            flex: '0 0 auto',
                            border: card.id === selectedCardId ? '1px solid' : '1px solid transparent',
                            borderColor: card.id === selectedCardId ? 'primary.main' : 'transparent',
                            borderRadius: 1,
                          }}
                        >
                          <StyleCard
                            card={card}
                            onSelect={setSelectedCardId}
                            onOpenContextMenu={handleContextMenuOpen}
                          />
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                ))}
                {!loading && groupedFilteredCards.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    미배정 카드가 없습니다.
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          </Grid>
          <Grid item xs={12} md={8} sx={{ minWidth: 0 }}>
            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">라인 타임라인</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton size="small" onClick={handlePrevMonthFrom} title="이전 달 1일">
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                  <CustomDatePicker
                    value={viewStart}
                    onChange={(val) => { if (val?.isValid?.()) handleViewStartChange(val.toDate()); }}
                    slotProps={{ textField: { size: 'small', sx: { width: 140 } } }}
                  />
                  <Typography sx={{ fontSize: 14, color: 'text.secondary', mx: 0.25 }}>~</Typography>
                  <CustomDatePicker
                    value={viewEnd}
                    onChange={(val) => { if (val?.isValid?.()) handleViewEndChange(val.toDate()); }}
                    slotProps={{ textField: { size: 'small', sx: { width: 140 } } }}
                  />
                  <IconButton size="small" onClick={handleNextMonthTo} title="다음 달 말일">
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleMonthPlus}
                    sx={{ minWidth: 36, px: 0.75, fontSize: 12 }}
                  >
                    M+
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleMonthMinus}
                    sx={{ minWidth: 36, px: 0.75, fontSize: 12 }}
                  >
                    M-
                  </Button>
                </Box>
              </Box>
              <ScheduleTimeline
                lines={lines}
                days={days}
                assignments={assignmentsForRender}
                onLinkPrev={handleLinkPrev}
                onOpenContextMenu={handleContextMenuOpen}
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

        <Menu
          open={Boolean(contextMenuState)}
          onClose={handleContextMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenuState
              ? { top: contextMenuState.mouseY, left: contextMenuState.mouseX }
              : undefined
          }
        >
          <MenuItem onClick={handleContextOpenDetail}>업무 상세</MenuItem>
          <Divider />
          <MenuItem onClick={handleContextSplit} disabled={contextSplitDisabled}>
            수량 분할
          </MenuItem>
        </Menu>

        <Drawer
          anchor="right"
          open={Boolean(detailState)}
          onClose={handleCloseDetail}
          PaperProps={{ sx: { width: { xs: '100%', md: '80%' }, p: 2.5, overflowY: 'auto' } }}
        >
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" color="text.secondary">
                업무 상세
              </Typography>
              <Button size="small" color="inherit" onClick={handleCloseDetail} disabled={sendingProposal}>
                닫기
              </Button>
            </Box>

            {!detailCard ? (
              <Typography variant="body2" color="text.secondary">
                선택한 카드 정보를 찾을 수 없습니다.
              </Typography>
            ) : (
              <>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>고객:</strong> {detailCard.customer || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>스타일:</strong> {detailCard.styleName || '-'}
                      {detailCard.colorName ? ` · ${detailCard.colorName}` : ''}
                      {detailCard.gender ? ` · ${detailCard.gender}` : ''}
                    </Typography>
                    <Typography variant="body2">
                      <strong>수량:</strong>{' '}
                      {formatNumberWithCommas(
                        detailAssignment?.quantity ?? detailCard.quantity ?? 0,
                        { fallback: '-', maximumFractionDigits: 0 }
                      )}개
                    </Typography>
                    <Typography variant="body2">
                      <strong>라인:</strong> {detailLine?.name || '-'}
                    </Typography>
                    {detailAssignment && (
                      <Typography variant="body2">
                        <strong>CT 상태:</strong>{' '}
                        <Chip
                          size="small"
                          label={CT_STATUS_LABEL[normalizeCtStatus(detailAssignment.ctStatus)] || CT_STATUS_LABEL.PENDING}
                          color={detailIsLocked ? 'primary' : normalizeCtStatus(detailAssignment.ctStatus) === 'REJECTED' ? 'warning' : 'default'}
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                      </Typography>
                    )}
                    {detailIsEscalated && (
                      <Alert severity="warning" sx={{ mt: 0.5 }}>
                        제안 상태가 48시간을 초과해 관리자 검토 대상으로 에스컬레이션되었습니다.
                      </Alert>
                    )}
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    CT/비용 요약
                  </Typography>
                  <Stack spacing={0.6}>
                    <Typography variant="body2">
                      <strong>공정 ST 합 (한 벌):</strong>{' '}
                      {formatSecondsLabel(detailSummary?.totalBasePerPieceSeconds)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>공정 제안 CT 합 (한 벌):</strong>{' '}
                      {formatSecondsLabel(detailSummary?.totalRequestedPerPieceSeconds)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>공정 제안 CT 합 (전체):</strong>{' '}
                      {formatSecondsLabel(detailSummary?.totalRequestedSeconds)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>변동률:</strong>{' '}
                      {detailSummary?.divergencePercent == null
                        ? '-'
                        : `${detailSummary.divergencePercent > 0 ? '+' : ''}${detailSummary.divergencePercent.toFixed(1)}%`}
                    </Typography>
                    <Typography variant="body2">
                      <strong>예상 기간:</strong> {formatDaysLabel(detailSummary?.totalDurationDays)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>예상 비용:</strong>{' '}
                      {detailSummary?.expectedCost == null
                        ? '-'
                        : formatCurrencyDong(detailSummary.expectedCost)}
                    </Typography>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    공정 CT 상세
                  </Typography>
                  {detailProcessRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      공정 정보가 없어 상세 CT를 표시할 수 없습니다.
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell align="right">#</TableCell>
                            <TableCell>공정</TableCell>
                            <TableCell align="right">{`PT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`AT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`ST(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`제안 CT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`요청 CT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`확정 CT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">단가(동)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detailProcessRows.map((row, index) => (
                            <TableRow key={row.processKey}>
                              <TableCell align="right">{index + 1}</TableCell>
                              <TableCell>{row.processName}</TableCell>
                              <TableCell align="right">
                                {row.ptSeconds == null ? (
                                  <Typography variant="caption" color="text.secondary">
                                    데이터 없음
                                  </Typography>
                                ) : (
                                  <Stack spacing={0.1} alignItems="flex-end">
                                    <Typography variant="body2">
                                      {formatNumberWithCommas(row.ptSeconds, {
                                        fallback: '0',
                                        maximumFractionDigits: 2,
                                      })}
                                    </Typography>
                                    {row.ptIsReferenceFallback && (
                                      <Typography variant="caption" color="text.secondary">
                                        {`ref q=${formatNumberWithCommas(row.ptReferenceQuantity, {
                                          fallback: '0',
                                          maximumFractionDigits: 0,
                                        })}`}
                                      </Typography>
                                    )}
                                  </Stack>
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <Stack spacing={0.25} alignItems="flex-end">
                                  {row.atSeconds != null && (
                                    <Typography variant="body2">
                                      {formatNumberWithCommas(row.atSeconds, {
                                        fallback: '0',
                                        maximumFractionDigits: 2,
                                      })}
                                    </Typography>
                                  )}
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={resolveAtReliabilityColor(row.atReliability)}
                                    label={resolveAtReliabilityPercentLabel(row.atReliability)}
                                    sx={AT_RELIABILITY_CHIP_SX}
                                  />
                                </Stack>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {row.baseSeconds > 0
                                    ? formatNumberWithCommas(row.baseSeconds, {
                                        fallback: '0',
                                        maximumFractionDigits: 2,
                                      })
                                    : '-'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <TextField
                                  size="small"
                                  value={detailDraftByProcess[row.processKey] ?? ''}
                                  placeholder={
                                    row.proposedSeconds > 0
                                      ? String(
                                          formatNumberWithCommas(row.proposedSeconds, {
                                            fallback: '0',
                                            maximumFractionDigits: 2,
                                          })
                                        )
                                      : ''
                                  }
                                  inputProps={{
                                    inputMode: 'decimal',
                                    pattern: '\\d*(\\.\\d{0,2})?',
                                    style: { textAlign: 'right', width: 80 },
                                  }}
                                  onChange={(event) =>
                                    handleDetailDraftInput(row.processKey, event.target.value)
                                  }
                                  disabled={sendingProposal || detailCtStatus === 'AGREED'}
                                  sx={{ width: 90 }}
                                />
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  fontWeight: row.hasLineRequestedChange ? 700 : 400,
                                  color: row.hasLineRequestedChange ? 'warning.dark' : 'text.secondary',
                                }}
                              >
                                {row.lineRequestedSeconds == null
                                  ? '-'
                                  : formatNumberWithCommas(row.lineRequestedSeconds, {
                                      fallback: '0',
                                      maximumFractionDigits: 2,
                                    })}
                              </TableCell>
                              <TableCell align="right">
                                {detailCtStatus !== 'AGREED' || row.confirmedSeconds == null
                                  ? '-'
                                  : formatNumberWithCommas(row.confirmedSeconds, {
                                      fallback: '0',
                                      maximumFractionDigits: 2,
                                    })}
                              </TableCell>
                              <TableCell align="right">
                                {detailSummary?.wagePerSecond == null ? (
                                  '-'
                                ) : detailCtStatus === 'AGREED' ? (
                                  row.confirmedUnitCost == null ? (
                                    '-'
                                  ) : (
                                    formatCurrencyDong(row.confirmedUnitCost)
                                  )
                                ) : (
                                  <Stack spacing={0.1} alignItems="flex-end">
                                    <Typography variant="caption" color="text.secondary">
                                      {`제안 ${
                                        row.proposedUnitCost == null
                                          ? '-'
                                          : formatCurrencyDong(row.proposedUnitCost)
                                      }`}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {`요청 ${
                                        row.requestedUnitCost == null
                                          ? '-'
                                          : formatCurrencyDong(row.requestedUnitCost)
                                      }`}
                                    </Typography>
                                  </Stack>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                              공정 합(한 벌)
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {detailSummary?.totalBasePerPieceSeconds == null
                                ? '-'
                                : formatNumberWithCommas(detailSummary.totalBasePerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {detailSummary?.totalRequestedPerPieceSeconds == null
                                ? '-'
                                : formatNumberWithCommas(detailSummary.totalRequestedPerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {detailRequestedPerPieceSeconds != null
                                ? formatNumberWithCommas(detailRequestedPerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })
                                : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {detailCtStatus === 'AGREED' &&
                              detailSummary?.totalConfirmedPerPieceSeconds != null
                                ? formatNumberWithCommas(detailSummary.totalConfirmedPerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })
                                : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {detailSummary?.wagePerSecond == null ? (
                                '-'
                              ) : detailCtStatus === 'AGREED' &&
                                detailSummary?.totalConfirmedPerPieceSeconds != null ? (
                                formatCurrencyDong(
                                  detailSummary.totalConfirmedPerPieceSeconds *
                                    detailSummary.wagePerSecond
                                )
                              ) : (
                                <Stack spacing={0.1} alignItems="flex-end">
                                  <Typography variant="caption" color="text.secondary">
                                    {`제안 ${formatCurrencyDong(
                                      detailSummary.totalRequestedPerPieceSeconds *
                                        detailSummary.wagePerSecond
                                    )}`}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {`요청 ${
                                      detailRequestedPerPieceSeconds != null
                                        ? formatCurrencyDong(
                                            detailRequestedPerPieceSeconds *
                                              detailSummary.wagePerSecond
                                          )
                                        : '-'
                                    }`}
                                  </Typography>
                                </Stack>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {detailInLineRequestFlow
                      ? detailHasProposalChange
                        ? '라인장 변경 요청을 확인했습니다. 요청 동의/다시 제안/배정 취소 중 하나를 선택하세요.'
                        : '라인장 변경 요청을 확인했습니다. 다시 제안하려면 제안 CT를 먼저 수정하세요.'
                      : detailCtStatus === 'AGREED' && !isAdminUser
                        ? '확정 상태의 재협의 개시는 관리자 권한이 필요합니다.'
                      : '제안 CT 미입력 시 ST를 사용하며, 요청 CT는 라인장 변경 요청이 있을 때 표시됩니다.'}
                  </Typography>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
                    {detailCtStatus === 'AGREED' && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={handleReopenAgreedAssignment}
                        disabled={sendingProposal || !canReopenAgreedAssignment}
                      >
                        재협의 개시
                      </Button>
                    )}
                    {detailInLineRequestFlow && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        onClick={handleAgreeLineRequest}
                        disabled={sendingProposal || !canAgreeLineRequest}
                      >
                        요청 동의
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSendProposalToLineLeader}
                      disabled={!canResendProposal || sendingProposal}
                    >
                      {sendingProposal
                        ? detailInLineRequestFlow
                          ? '처리 중...'
                          : '송부 중...'
                        : detailInLineRequestFlow
                          ? '다시 제안'
                          : '제안 송부'}
                    </Button>
                    {detailInLineRequestFlow && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={handleCancelAssignmentFromLineRequest}
                        disabled={sendingProposal}
                      >
                        배정 취소
                      </Button>
                    )}
                  </Stack>
                </Paper>
              </>
            )}
          </Stack>
        </Drawer>
      </DndContext>
    </AppPageContainer>
  );
};

export default AssignBoard;
