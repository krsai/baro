import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import CloseIcon from '@mui/icons-material/Close';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useBeforeUnload, useBlocker, useLocation } from 'react-router-dom';
import { useAssignBoardDnd } from './hooks/useAssignBoardDnd';
import AppPageContainer from '../../../components/AppPageContainer';
import LastUpdaterLabel from '../../../components/LastUpdaterLabel';
import CustomDatePicker from '../../../components/CustomDatePicker';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import useHolidayCalendar from '../../../hooks/useHolidayCalendar';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../constants/layout';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getGenderLabel } from '../../../constants/productAttributes';
import StyleCard from './components/StyleCard';
import ScheduleTimeline from './components/ScheduleTimeline';
import {
  ASSIGN_RECOMPUTE_RANGE_BUFFER_DAYS,
  ASSIGN_TIMELINE_CELL_WIDTH,
} from './constants';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { fetchStyleById } from '../../../utils/styleApi';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessTotalForOrderQuantity,
  formatStBucketQuantityLabel,
  normalizeProcesses,
  resolveProcessAtPerPieceSeconds,
  resolveProcessAtReliability,
  resolveProcessExactStPerPieceSeconds,
  resolveStBucketQuantity,
} from '../../../utils/processTime';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import {
  hasAssignmentCtSnapshot,
  resolveAssignmentCtSnapshot,
  resolveAssignmentCtTotalSeconds,
  resolveAssignmentCtUpdatedAt,
  resolveAssignmentCtUpdatedBy,
} from '../../../utils/assignmentCt';
import {
  formatProcessNameWithQuantity,
  resolveLocalizedProcessName,
} from '../../../utils/processDisplay';
import { subscribeOrderModificationLockChanged } from '../../../utils/orderSyncEvents';
import {
  emitWorkspaceDataChanged,
  hasWorkspaceDataTopic,
  WORKSPACE_DATA_TOPICS,
} from '../../../utils/workspaceDataEvents';
import { todayDateKey as getTodayDateKey } from '../../../utils/dateKey.mjs';

const { useDeferredValue } = React;
const ASSIGN_BOARD_SYNC_SOURCE = 'assignment-board';

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
const toCtInputText = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return String(Math.round(parsed * 100) / 100)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');
};
const resolveCtUnitCost = (seconds, wagePerSecond) => {
  const resolvedSeconds = Number(seconds);
  const resolvedWage = Number(wagePerSecond);
  if (!Number.isFinite(resolvedSeconds) || resolvedSeconds <= 0) return null;
  if (!Number.isFinite(resolvedWage) || resolvedWage <= 0) return null;
  return resolvedSeconds * resolvedWage;
};
const LANGUAGE_LOCALE_MAP = {
  ko: 'ko-KR',
  en: 'en-US',
  vi: 'vi-VN',
};
const resolveLocale = (languageCode = 'en') => LANGUAGE_LOCALE_MAP[languageCode] || LANGUAGE_LOCALE_MAP.en;
const formatCurrencyDong = (value, languageCode = 'en') =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} ${getUiMessage(
    'assign.currencyUnit',
    'dong',
    languageCode
  )}`;
const buildAssignableCardSearchText = (card) =>
  [
    card?.styleName,
    card?.customer,
    card?.colorName,
    card?.gender,
    card?.orderNo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
const formatQuantityRatio = (unassignedQuantity, orderTotalQuantity) =>
  `${formatNumberWithCommas(unassignedQuantity, {
    fallback: '0',
    maximumFractionDigits: 0,
  })}/${formatNumberWithCommas(orderTotalQuantity, {
    fallback: '0',
    maximumFractionDigits: 0,
  })}`;

const UnassignedCardItem = React.memo(function UnassignedCardItem({
  card,
  isSelected,
  onSelect,
  onOpenContextMenu,
  onDisabledCardDragAttempt,
}) {
  return (
    <Box
      sx={{
        minWidth: { xs: 250, sm: 280 },
        maxWidth: 320,
        flex: '0 0 auto',
        border: isSelected ? '1px solid' : '1px solid transparent',
        borderColor: isSelected ? 'primary.main' : 'transparent',
        borderRadius: 1,
      }}
    >
      <StyleCard
        card={card}
        onSelect={onSelect}
        onOpenContextMenu={onOpenContextMenu}
        onDisabledDragAttempt={onDisabledCardDragAttempt}
      />
    </Box>
  );
});

const UnassignedCardGroupsPanel = React.memo(function UnassignedCardGroupsPanel({
  filteredCardCount,
  groupedFilteredCards,
  filteredUnassignedQuantity,
  filteredOrderTotalQuantity,
  loading,
  selectedCardId,
  languageCode,
  onSelectCard,
  onOpenContextMenu,
  onDisabledCardDragAttempt,
}) {
  const summaryText = loading
    ? getUiMessage('assign.cardsSyncing', '카드 동기화 중...', languageCode)
    : getUiMessage(
        'assign.cardSummary',
        `${filteredCardCount}개 · ${groupedFilteredCards.length}주문`,
        languageCode,
        {
          cardCount: filteredCardCount,
          orderCount: groupedFilteredCards.length,
        }
      );
  const quantitySummary = getUiMessage(
    'assign.quantityCompact',
    '수량 {quantity}',
    languageCode,
    {
      quantity: formatQuantityRatio(
        filteredUnassignedQuantity,
        filteredOrderTotalQuantity
      ),
    }
  );

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2">
          {getUiMessage('assign.unassignedCards', '미배정 카드', languageCode)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {loading ? summaryText : `${summaryText} · ${quantitySummary}`}
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
                {getUiMessage(
                  'assign.orderWithNumber',
                  `주문 ${group.orderNo}`,
                  languageCode,
                  { orderNo: group.orderNo }
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.dueDate
                  ? getUiMessage(
                      'common.dueDate',
                      `납기 ${group.dueDate}`,
                      languageCode,
                      { date: group.dueDate }
                    )
                  : getUiMessage(
                      'common.dueDateUndecided',
                      '납기 미정',
                      languageCode
                    )}{' '}
                ·{' '}
                {getUiMessage(
                  'common.itemCountSuffix',
                  `${group.cards.length}개`,
                  languageCode,
                  { count: group.cards.length }
                )}{' '}
                ·{' '}
                {getUiMessage(
                  'assign.quantityCompact',
                  '수량 {quantity}',
                  languageCode,
                  {
                    quantity: formatQuantityRatio(
                      group.unassignedQuantity,
                      group.orderTotalQuantity
                    ),
                  }
                )}
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
                <UnassignedCardItem
                  key={card.id}
                  card={card}
                  isSelected={card.id === selectedCardId}
                  onSelect={onSelectCard}
                  onOpenContextMenu={onOpenContextMenu}
                  onDisabledCardDragAttempt={onDisabledCardDragAttempt}
                />
              ))}
            </Stack>
          </Box>
        ))}
        {!loading && groupedFilteredCards.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {getUiMessage('assign.noUnassignedCards', '미배정 카드가 없습니다.', languageCode)}
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  );
});

const PT_REFERENCE_QUANTITY_LABEL = DEFAULT_TIME_REF_QUANTITY.toLocaleString('ko-KR');
const formatSecondsLabel = (value, fallback = '-', languageCode = 'en') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}${getUiMessage(
    'assign.secondsUnit',
    'sec',
    languageCode
  )}`;
};
const formatDaysLabel = (value, fallback = '-', languageCode = 'en') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return getUiMessage('assign.durationDays', '{days}d', languageCode, {
    days: formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 }),
  });
};
const formatDateTimeLabel = (value, fallback = '-', languageCode = 'en') => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString(resolveLocale(languageCode));
};
const AT_RELIABILITY_COLOR = {
  [AT_RELIABILITY_STATUS.COLLECTING]: 'default',
  [AT_RELIABILITY_STATUS.UNRELIABLE]: 'error',
  [AT_RELIABILITY_STATUS.INSUFFICIENT]: 'warning',
  [AT_RELIABILITY_STATUS.USABLE]: 'info',
  [AT_RELIABILITY_STATUS.TRUSTED]: 'success',
  [AT_RELIABILITY_STATUS.VERIFIED]: 'primary',
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
const resolveProcessPtInfo = (process, orderQuantity = 1) => {
  const ptSeconds = toOptionalPositiveNumber(process?.pt);
  const referenceQuantity = DEFAULT_TIME_REF_QUANTITY;
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
  stSeedSeconds = null,
}) => {
  const seedSeconds = toOptionalPositiveNumber(stSeedSeconds);
  if (seedSeconds != null) return { seconds: seedSeconds, source: 'ST' };

  const manualSt = toOptionalPositiveNumber(
    resolveProcessExactStPerPieceSeconds(process, orderQuantity)
  );
  if (manualSt != null) return { seconds: manualSt, source: 'ST' };

  const ptInfo = resolveProcessPtInfo(process, orderQuantity);
  if (ptInfo.seconds != null) return { seconds: ptInfo.seconds, source: 'PT' };

  return { seconds: 0, source: 'NONE' };
};
const hasSavedCtSnapshot = (assignment) => hasAssignmentCtSnapshot(assignment);

const buildAssignableLines = ({ factories, lines, lineHeadcounts }) => {
  const safeFactories = Array.isArray(factories) ? factories : [];
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeLineHeadcounts = Array.isArray(lineHeadcounts) ? lineHeadcounts : [];
  const factoryById = new Map(
    safeFactories.map((factory, index) => [normalizeKey(factory?.id), { ...factory, __order: index }])
  );
  const lineHeadcountMap = safeLineHeadcounts.reduce((map, item) => {
    const key = normalizeKey(item?.lineId);
    const workerCount = Number(item?.workerCount);
    if (!key || !Number.isFinite(workerCount) || workerCount <= 0) return map;
    map.set(key, Math.max(0, Math.trunc(workerCount)));
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
const toSignedInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
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
  const startIndex = toSignedInt(assignment.startIndex, 0);
  const endIndex = Math.max(startIndex, toSignedInt(assignment.endIndex, startIndex));
  const startDayOffsetPercent = clampPercent(assignment.startDayOffsetPercent, 0, 99.999);
  const startDayPercent = clampPercent(assignment.startDayPercent, 100, 100);
  const endDayPercent = clampPercent(assignment.endDayPercent, startDayPercent, 100);
  const version = toNonNegativeInt(assignment.version, 0);
  const versionUpdatedAt =
    typeof assignment.versionUpdatedAt === 'string' && assignment.versionUpdatedAt.trim()
      ? assignment.versionUpdatedAt
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
  };
};

const toStableJsonText = (value) => {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJsonText(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${toStableJsonText(value[key])}`)
    .join(',')}}`;
};

const toComparableAssignmentState = (assignment) => {
  const normalized = normalizeAssignmentLayout(assignment);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return normalized;
  }
  const {
    startIndex: _startIndex,
    endIndex: _endIndex,
    version: _version,
    versionUpdatedAt: _versionUpdatedAt,
    dbId: _dbId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = normalized;
  return rest;
};

const isSameComparableAssignmentState = (left, right) =>
  toStableJsonText(toComparableAssignmentState(left)) ===
  toStableJsonText(toComparableAssignmentState(right));

const remapAssignmentToDayWindow = (assignment, days, fallbackBaseDate = null) => {
  const normalized = normalizeAssignmentLayout(assignment);
  if (!normalized || !Array.isArray(days) || days.length === 0) {
    return normalized;
  }

  let startDateKey =
    typeof normalized.startDateKey === 'string' && normalized.startDateKey.trim()
      ? normalized.startDateKey.trim()
      : null;
  let endDateKey =
    typeof normalized.endDateKey === 'string' && normalized.endDateKey.trim()
      ? normalized.endDateKey.trim()
      : null;

  if (!startDateKey && fallbackBaseDate instanceof Date && !Number.isNaN(fallbackBaseDate.getTime())) {
    const absoluteStart = new Date(fallbackBaseDate);
    absoluteStart.setDate(absoluteStart.getDate() + normalized.startIndex);
    startDateKey = buildDateKey(absoluteStart);
  }
  if (!endDateKey && fallbackBaseDate instanceof Date && !Number.isNaN(fallbackBaseDate.getTime())) {
    const absoluteEnd = new Date(fallbackBaseDate);
    absoluteEnd.setDate(absoluteEnd.getDate() + normalized.endIndex);
    endDateKey = buildDateKey(absoluteEnd);
  }

  if (!startDateKey) {
    return normalized;
  }

  const firstDayKey = days[0]?.key;
  if (!firstDayKey) {
    return { ...normalized, startDateKey, endDateKey };
  }
  const firstDate = new Date(firstDayKey + 'T00:00:00');
  const assignDate = new Date(startDateKey + 'T00:00:00');
  const finishDate = endDateKey ? new Date(endDateKey + 'T00:00:00') : null;
  if (
    Number.isNaN(firstDate.getTime()) ||
    Number.isNaN(assignDate.getTime()) ||
    (finishDate && Number.isNaN(finishDate.getTime()))
  ) {
    return { ...normalized, startDateKey, endDateKey };
  }
  const startIndex = Math.round((assignDate - firstDate) / 86400000);
  const fallbackSpan = Math.max(0, normalized.endIndex - normalized.startIndex);
  const endIndex = finishDate
    ? Math.max(startIndex, Math.round((finishDate - firstDate) / 86400000))
    : startIndex + fallbackSpan;
  return {
    ...normalized,
    startDateKey,
    endDateKey,
    startIndex,
    endIndex,
  };
};

const parseDateKey = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value.trim() + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const syncAssignmentDateKeys = (assignment, baseDate = null) => {
  const normalized = normalizeAssignmentLayout(assignment);
  if (!normalized) return normalized;
  const resolvedBaseDate =
    baseDate instanceof Date && !Number.isNaN(baseDate.getTime()) ? baseDate : null;
  if (!resolvedBaseDate) return normalized;

  const startDate = new Date(resolvedBaseDate);
  startDate.setDate(startDate.getDate() + normalized.startIndex);
  const endDate = new Date(resolvedBaseDate);
  endDate.setDate(endDate.getDate() + normalized.endIndex);

  return {
    ...normalized,
    startDateKey: buildDateKey(startDate),
    endDateKey: buildDateKey(endDate),
  };
};

const buildAssignmentSchedulePatch = (assignment, baseDate = null) => {
  const synced = normalizeAssignmentLayout(syncAssignmentDateKeys(assignment, baseDate));
  if (!synced || typeof synced !== 'object') return null;

  const startIndex = toSignedInt(synced.startIndex, 0);
  const endIndex = Math.max(startIndex, toSignedInt(synced.endIndex, startIndex));
  const startDateKey =
    typeof synced.startDateKey === 'string' && synced.startDateKey.trim()
      ? synced.startDateKey.trim()
      : null;
  const endDateKey =
    typeof synced.endDateKey === 'string' && synced.endDateKey.trim()
      ? synced.endDateKey.trim()
      : startDateKey;

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: clampPercent(synced.startDayOffsetPercent, 0, 99.999),
    startDayPercent: clampPercent(synced.startDayPercent, 100, 100),
    endDayPercent: clampPercent(synced.endDayPercent, synced.startDayPercent, 100),
    startDateKey,
    endDateKey,
  };
};

const resolveAssignmentAbsoluteRange = (assignment, baseDate = null) => {
  const normalized = normalizeAssignmentLayout(assignment);
  if (!normalized) return null;

  const startDateFromKey = parseDateKey(normalized.startDateKey);
  const endDateFromKey = parseDateKey(normalized.endDateKey);
  if (startDateFromKey) {
    const startDate = new Date(startDateFromKey);
    const endDate = endDateFromKey
      ? new Date(endDateFromKey)
      : new Date(startDateFromKey);
    if (!endDateFromKey) {
      endDate.setDate(
        endDate.getDate() + Math.max(0, normalized.endIndex - normalized.startIndex)
      );
    }
    if (endDate < startDate) {
      return { startDate, endDate: startDate };
    }
    return { startDate, endDate };
  }

  const resolvedBaseDate =
    baseDate instanceof Date && !Number.isNaN(baseDate.getTime()) ? baseDate : null;
  if (!resolvedBaseDate) return null;

  const startDate = new Date(resolvedBaseDate);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() + normalized.startIndex);
  const endDate = new Date(resolvedBaseDate);
  endDate.setHours(0, 0, 0, 0);
  endDate.setDate(endDate.getDate() + normalized.endIndex);
  return {
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
  };
};

const buildAssignmentPersistenceWindow = ({
  assignments,
  days,
  baseDate,
  holidaySet,
}) => {
  const fallbackStart =
    parseDateKey(Array.isArray(days) && days.length > 0 ? days[0]?.key : null) ||
    (baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
      ? new Date(baseDate)
      : new Date());
  fallbackStart.setHours(0, 0, 0, 0);

  const fallbackEnd =
    parseDateKey(
      Array.isArray(days) && days.length > 0 ? days[days.length - 1]?.key : null
    ) || new Date(fallbackStart);
  fallbackEnd.setHours(0, 0, 0, 0);

  let minStart = new Date(fallbackStart);
  let maxEnd = new Date(fallbackEnd);
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const range = resolveAssignmentAbsoluteRange(assignment, baseDate);
    if (!range) return;
    if (range.startDate < minStart) minStart = new Date(range.startDate);
    if (range.endDate > maxEnd) maxEnd = new Date(range.endDate);
  });

  const spanDays = Math.max(1, Math.round((maxEnd - minStart) / 86400000) + 1);
  const minLength = Math.max(Array.isArray(days) ? days.length : 0, spanDays + 14);
  return {
    baseDate: minStart,
    days: buildDays(minStart, minLength, holidaySet),
  };
};

const normalizeKey = (value) => String(value ?? '').trim();
const normalizeGenderKey = (value) => {
  const raw = normalizeKey(value).toUpperCase();
  if (raw === 'M' || raw === 'MEN' || raw === 'MALE' || raw === '남성') return 'M';
  if (raw === 'W' || raw === 'WOMEN' || raw === 'FEMALE' || raw === '여성') return 'W';
  if (raw === 'U' || raw === 'UNISEX' || raw === '공용') return 'U';
  return 'U';
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

const createCardId = (orderId, styleId) =>
  `${normalizeKey(orderId)}::${normalizeKey(styleId)}`;
const isCardManualOrderLocked = (card) => card?.isManualOrderLocked !== false;

const buildCardsFromOrders = ({ orders, styles }) => {
  const styleMap = new Map((Array.isArray(styles) ? styles : []).map((style) => [style.id, style]));
  const cards = [];
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

  (Array.isArray(orders) ? orders : []).forEach((order, orderIndex) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const groupedByStyleId = new Map();

    items.forEach((item, itemIndex) => {
      const styleId = item?.styleId || '';
      if (!styleId) return;
      const quantity = resolveItemQuantity(item);
      if ((Number(quantity) || 0) <= 0) return;

      const style = styleMap.get(styleId);
      const current = groupedByStyleId.get(styleId);
      if (!current) {
        groupedByStyleId.set(styleId, {
          quantity,
          itemIndex,
          style,
          styleName: item?.styleName || '',
          styleCode: item?.styleCode || '',
        });
        return;
      }
      current.quantity += quantity;
      if (!current.style && style) current.style = style;
      if (!current.styleName && item?.styleName) current.styleName = item.styleName;
      if (!current.styleCode && item?.styleCode) current.styleCode = item.styleCode;
    });

    groupedByStyleId.forEach((group, styleId) => {
      const style = group.style || styleMap.get(styleId);
      const processSummary = styleProcessSummaryMap.get(styleId);
      const processCount = processSummary?.processCount ?? 0;
      const totalPt = getTotalForOrderQuantity(
        processSummary?.processes || [],
        'pt',
        group.quantity
      );
      const totalAt = getTotalForOrderQuantity(
        processSummary?.processes || [],
        'at',
        group.quantity
      );
      const totalSt = getTotalStForOrderQuantity(
        processSummary?.processes || [],
        group.quantity
      );
      const hasSt = totalSt > 0;
      const hasPt = totalPt > 0;
      const status = hasSt ? 'ST' : hasPt ? 'PT' : 'NONE';
      const totalSeconds = hasSt ? totalSt : totalPt;
      const cardId = createCardId(
        order?.id ?? order?.orderNumber ?? `order-${orderIndex}`,
        styleId
      );

      cards.push({
        id: cardId,
        originOrderId: cardId,
        orderNo: order?.orderNumber || order?.id || '-',
        dueDate: order?.dueDate || '',
        customer: order?.customerName || order?.customer || '-',
        styleId,
        styleName: group.styleName || style?.name || `스타일 ${group.itemIndex + 1}`,
        styleCode: group.styleCode || style?.styleCode || '',
        colorId: '',
        colorName: '',
        gender: '',
        quantity: group.quantity,
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
const hasSt = (card) =>
  Number(card?.totalSt) > 0 || String(card?.status || '').trim().toUpperCase() === 'ST';

const getCardBasis = (card) => {
  if (hasSt(card)) return 'ST';
  const legacyStatus = String(card?.status || '').trim().toUpperCase();
  if (legacyStatus === 'PT' || legacyStatus === 'CT') return 'PT';
  if (!hasPt(card)) return 'NONE';
  return 'PT';
};

const resolveCardStatus = (_card, nextPt, _nextAt, nextSt = null) => {
  const stPresent = Number(nextSt) > 0;
  const ptPresent = Number(nextPt) > 0;
  if (!ptPresent && !stPresent) return 'NONE';
  if (stPresent) return 'ST';
  return 'PT';
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
  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
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
  const fallbackDailyCapacity = Math.max(
    1,
    getLineCapacitySeconds(assignment?.lineId, lineCapacityById)
  );
  const projectedWorkingDays = Math.max(
    1,
    Math.ceil(Math.max(toNonNegativeNumber(totalSeconds, 0), 0) / fallbackDailyCapacity)
  );
  const knownLastIndex = Array.isArray(days) && days.length > 0 ? days.length - 1 : startIndex;
  const maxCursor =
    Math.max(startIndex, knownLastIndex) +
    projectedWorkingDays +
    ASSIGN_RECOMPUTE_RANGE_BUFFER_DAYS;

  while (remaining > 0 && cursor <= maxCursor) {
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

  if (remaining > 0) {
    endIndex = maxCursor;
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
  return card.totalPt ?? card.totalSeconds ?? 0;
};

const toComparableCtSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const {
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    ...rest
  } = snapshot;
  return rest;
};

const buildAssignmentCtSnapshotForSave = ({
  assignment,
  card = null,
  style = null,
  draftByProcess = {},
  stDraftByProcess = {},
  baseDate = null,
  updatedAt = null,
  updatedBy = null,
}) => {
  if (!assignment || typeof assignment !== 'object') return null;

  const orderQuantity = Math.max(
    1,
    toPositiveInt(assignment?.quantity ?? card?.quantity ?? 1, 1)
  );
  const existingSnapshot = resolveAssignmentCtSnapshot(assignment);
  const existingProcessMap = new Map(
    (Array.isArray(existingSnapshot?.processes) ? existingSnapshot.processes : []).map(
      (process) => [String(process?.processKey || '').trim(), process]
    )
  );
  const styleProcesses = normalizeProcesses(style?.processes);
  const processSeeds =
    styleProcesses.length > 0
      ? styleProcesses.map((process, index) => ({
          source: 'STYLE',
          process,
          processKey: String(
            process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
          ).trim(),
          processName:
            process?.name || process?.processName || process?.code || `공정 ${index + 1}`,
          processNameKo: String(
            process?.nameKo ||
              process?.processNameKo ||
              resolveLocalizedProcessName(process, 'ko') ||
              ''
          ).trim(),
          processNameEn: String(
            process?.nameEn ||
              process?.processNameEn ||
              resolveLocalizedProcessName(process, 'en') ||
              ''
          ).trim(),
          processNameVi: String(
            process?.nameVi ||
              process?.processNameVi ||
              resolveLocalizedProcessName(process, 'vi') ||
              ''
          ).trim(),
          processQuantity: Math.max(1, toPositiveInt(process?.quantity, 1)),
        }))
      : (Array.isArray(existingSnapshot?.processes) ? existingSnapshot.processes : []).map(
          (process, index) => ({
            source: 'SNAPSHOT',
            process,
            processKey: String(process?.processKey || `PROCESS-${index + 1}`).trim(),
            processName:
              process?.name || process?.processName || process?.processKey || `공정 ${index + 1}`,
            processNameKo: String(
              process?.nameKo ||
                process?.processNameKo ||
                resolveLocalizedProcessName(process, 'ko') ||
                ''
            ).trim(),
            processNameEn: String(
              process?.nameEn ||
                process?.processNameEn ||
                resolveLocalizedProcessName(process, 'en') ||
                ''
            ).trim(),
            processNameVi: String(
              process?.nameVi ||
                process?.processNameVi ||
                resolveLocalizedProcessName(process, 'vi') ||
                ''
            ).trim(),
            processQuantity: Math.max(1, toPositiveInt(process?.quantity, 1)),
          })
        );

  const processes = processSeeds
    .map((seed, index) => {
      const processKey = seed.processKey;
      if (!processKey) return null;

      const snapshotProcess = existingProcessMap.get(processKey) ?? null;
      const ctDraftSeconds = toOptionalPositiveNumber(draftByProcess?.[processKey]);
      const stDraftSeconds = toOptionalPositiveNumber(stDraftByProcess?.[processKey]);
      const stSeedInfo =
        seed.source === 'STYLE'
          ? resolveProcessStSeedSeconds({
              process: seed.process,
              orderQuantity,
            })
          : {
              seconds: toOptionalPositiveNumber(snapshotProcess?.stSeconds),
              source: seed.process?.basis || snapshotProcess?.basis || 'CT',
            };
      const snapshotStSeconds = toOptionalPositiveNumber(snapshotProcess?.stSeconds);
      const snapshotCtSeconds = toOptionalPositiveNumber(
        snapshotProcess?.ctSeconds ??
          snapshotProcess?.agreedSeconds ??
          snapshotProcess?.requestedSeconds ??
          snapshotProcess?.proposedSeconds
      );
      const stSeconds =
        stDraftSeconds ??
        snapshotStSeconds ??
        toOptionalPositiveNumber(stSeedInfo?.seconds);
      const ctSeconds = ctDraftSeconds ?? snapshotCtSeconds ?? stSeconds;
      if (ctSeconds == null) return null;
      const resolvedStSeconds = stSeconds ?? ctSeconds;
      const resolvedCtSeconds = ctSeconds;
      const processCode =
        String(
          seed?.process?.code ??
            snapshotProcess?.processCode ??
            snapshotProcess?.code ??
            ''
        ).trim() || null;
      const resolvedProcessId = Number(
        seed?.process?.id ?? snapshotProcess?.processId ?? snapshotProcess?.id
      );

      return {
        processKey,
        processId:
          Number.isFinite(resolvedProcessId) && resolvedProcessId > 0
            ? Math.trunc(resolvedProcessId)
            : null,
        processCode,
        name: seed.processName || `공정 ${index + 1}`,
        nameKo:
          seed.processNameKo ||
          String(snapshotProcess?.nameKo || snapshotProcess?.processNameKo || '').trim(),
        nameEn:
          seed.processNameEn ||
          String(snapshotProcess?.nameEn || snapshotProcess?.processNameEn || '').trim(),
        nameVi:
          seed.processNameVi ||
          String(snapshotProcess?.nameVi || snapshotProcess?.processNameVi || '').trim(),
        quantity: seed.processQuantity,
        basis: 'ST',
        stSeconds: resolvedStSeconds,
        ctSeconds: resolvedCtSeconds,
        ctPerPieceSeconds: resolvedCtSeconds * seed.processQuantity,
      };
    })
    .filter(Boolean);

  const fallbackTotalSeconds = Math.max(
    0,
    Math.round(
      Number(
        resolveAssignmentCtTotalSeconds(assignment) ||
          resolveCardTotalSeconds(card) ||
          assignment?.totalSeconds ||
          0
      ) || 0
    )
  );
  const totalStPerPieceSeconds =
    processes.length > 0
      ? processes.reduce(
          (sum, process) =>
            sum + ((Number(process?.stSeconds) || 0) * (Number(process?.quantity) || 1)),
          0
        )
      : Number(existingSnapshot?.totalStPerPieceSeconds) || fallbackTotalSeconds / orderQuantity;
  const totalCtPerPieceSeconds =
    processes.length > 0
      ? processes.reduce(
          (sum, process) => sum + (Number(process?.ctPerPieceSeconds) || 0),
          0
        )
      : Number(existingSnapshot?.totalCtPerPieceSeconds) || fallbackTotalSeconds / orderQuantity;
  const totalCtSeconds = Math.max(
    0,
    Math.round(
      totalCtPerPieceSeconds > 0
        ? totalCtPerPieceSeconds * orderQuantity
        : fallbackTotalSeconds
    )
  );
  const snapshotCore = {
    sourceAssignmentId: String(assignment?.id || '').trim() || null,
    lineId: assignment?.lineId ?? null,
    quantity: orderQuantity,
    schedule: buildAssignmentSchedulePatch(assignment, baseDate),
    totalStPerPieceSeconds,
    totalCtPerPieceSeconds,
    totalCtSeconds,
    processes,
  };
  const currentComparable = toComparableCtSnapshot(snapshotCore);
  const previousComparable = toComparableCtSnapshot(existingSnapshot);
  const keepPreviousUpdateMeta =
    previousComparable != null &&
    toStableJsonText(previousComparable) === toStableJsonText(currentComparable);

  return {
    ...snapshotCore,
    updatedAt:
      (keepPreviousUpdateMeta ? existingSnapshot?.updatedAt : updatedAt) || updatedAt || null,
    updatedBy:
      (keepPreviousUpdateMeta ? existingSnapshot?.updatedBy : updatedBy) || updatedBy || null,
  };
};

const applyAssignmentCtSnapshotForSave = ({
  assignment,
  card = null,
  style = null,
  draftByProcess = {},
  stDraftByProcess = {},
  baseDate = null,
  updatedAt = null,
  updatedBy = null,
}) => {
  const ctSnapshot = buildAssignmentCtSnapshotForSave({
    assignment,
    card,
    style,
    draftByProcess,
    stDraftByProcess,
    baseDate,
    updatedAt,
    updatedBy,
  });
  const nextTotalSeconds = Math.max(
    0,
    Math.round(
      Number(
        ctSnapshot?.totalCtSeconds ??
          resolveCardTotalSeconds(card) ??
          assignment?.totalSeconds ??
          0
      ) || 0
    )
  );

  return normalizeAssignmentLayout({
    ...assignment,
    totalSeconds: nextTotalSeconds,
    contractedSeconds: nextTotalSeconds > 0 ? nextTotalSeconds : null,
    ctSnapshot,
  });
};

const hasAssignmentCtDraftChange = ({
  assignment,
  card = null,
  style = null,
  draftByProcess = {},
  stDraftByProcess = {},
  baseDate = null,
}) => {
  if (!hasSavedCtSnapshot(assignment)) return false;
  const hasDraftInput =
    Object.keys(stDraftByProcess || {}).length > 0 ||
    Object.keys(draftByProcess || {}).length > 0;
  if (!hasDraftInput) return false;

  const savedSnapshotComparable = toComparableCtSnapshot(
    resolveAssignmentCtSnapshot(assignment)
  );
  const nextSnapshotComparable = toComparableCtSnapshot(
    buildAssignmentCtSnapshotForSave({
      assignment,
      card,
      style,
      draftByProcess,
      stDraftByProcess,
      baseDate,
      updatedAt: resolveAssignmentCtUpdatedAt(assignment),
      updatedBy: resolveAssignmentCtUpdatedBy(assignment),
    })
  );
  return (
    toStableJsonText(savedSnapshotComparable) !==
    toStableJsonText(nextSnapshotComparable)
  );
};

function doesAssignmentScheduleNeedRecompute(
  assignment,
  targetTotalSeconds,
  days,
  lineCapacityById = null
) {
  const plannedSeconds = Number(targetTotalSeconds);
  if (!Number.isFinite(plannedSeconds) || plannedSeconds <= 0) return false;

  const scheduledSeconds = Number(
    getAssignmentTotalSeconds(assignment, days, lineCapacityById)
  );
  if (!Number.isFinite(scheduledSeconds) || scheduledSeconds < 0) return true;

  return Math.abs(scheduledSeconds - plannedSeconds) > 1;
}

const syncAssignmentFromCard = (assignment, card, days, lineCapacityById = null) => {
  if (!assignment || !card) return assignment;

  const totalSeconds = resolveCardTotalSeconds(card);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return assignment;

  const basis = getCardBasis(card);
  const nextTotalSeconds =
    hasSavedCtSnapshot(assignment)
      ? resolveAssignmentCtTotalSeconds(assignment)
      : totalSeconds;
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
        totalSeconds: nextTotalSeconds,
        contractedSeconds: assignment.contractedSeconds ?? null,
  };
  const hasAbsoluteScheduleKeys = Boolean(parseDateKey(assignment?.startDateKey));
  const currentTotalSeconds = toNonNegativeInt(assignment?.totalSeconds, 0);
  const hasScheduleDrift = doesAssignmentScheduleNeedRecompute(
    next,
    nextTotalSeconds,
    days,
    lineCapacityById
  );
  if (
    hasAbsoluteScheduleKeys &&
    currentTotalSeconds === Math.round(nextTotalSeconds) &&
    !hasScheduleDrift
  ) {
    return next;
  }
  const range = recomputeAssignmentRange(next, nextTotalSeconds, days, lineCapacityById);
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
const clampPercentValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
};
const toRawPercentValue = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};
const resolveAssignmentVisualStatus = ({
  isCompleted = false,
  startDateKey = null,
  endDateKey = null,
  todayDateKey,
}) => {
  if (isCompleted) return 'completed';
  const normalizedTodayDateKey = typeof todayDateKey === 'string' ? todayDateKey : '';
  const normalizedStartDateKey =
    typeof startDateKey === 'string' && startDateKey.trim() ? startDateKey.trim() : '';
  const normalizedEndDateKey =
    typeof endDateKey === 'string' && endDateKey.trim()
      ? endDateKey.trim()
      : normalizedStartDateKey;

  if (
    normalizedStartDateKey &&
    normalizedTodayDateKey &&
    normalizedStartDateKey > normalizedTodayDateKey
  ) {
    return 'pending';
  }
  if (
    normalizedEndDateKey &&
    normalizedTodayDateKey &&
    normalizedEndDateKey < normalizedTodayDateKey
  ) {
    return 'overdue';
  }
  return 'active';
};

const getMonthStartDate = (value = new Date()) => {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getMonthEndDate = (value = new Date()) => {
  const date = getMonthStartDate(value);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDateRangeDayCount = (start, end) =>
  Math.max(1, Math.round((end - start) / 86400000) + 1);

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

const WEEKDAY_MESSAGE_KEYS = [
  'assign.weekdaySun',
  'assign.weekdayMon',
  'assign.weekdayTue',
  'assign.weekdayWed',
  'assign.weekdayThu',
  'assign.weekdayFri',
  'assign.weekdaySat',
];

const buildDays = (baseDate, count, holidaySet = new Set(), languageCode = 'en') => {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    const weekday = getUiMessage(
      WEEKDAY_MESSAGE_KEYS[date.getDay()],
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
      languageCode
    );
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

const planAssignmentDetailed = ({
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
  if (dayIndex >= totalDays) {
    return {
      planned: null,
      failureCode: 'OUT_OF_RANGE',
      needsMoreDays: true,
    };
  }

  const startCapacity = getDayCapacitySeconds(dayIndex, lineId, days, lineCapacityById);
  if (startCapacity <= 0 || usage[dayIndex] >= startCapacity) {
    return {
      planned: null,
      failureCode: 'START_DAY_UNAVAILABLE',
      needsMoreDays: false,
    };
  }

  const startOffsetPercent = (usage[dayIndex] / startCapacity) * 100;
  const startAvailable = startCapacity - usage[dayIndex];
  const startUse = Math.min(startAvailable, remaining);
  const startDayPercent = (startUse / startCapacity) * 100;
  remaining -= startUse;

  if (remaining <= 0) {
    return {
      planned: {
        startIndex: dayIndex,
        endIndex: dayIndex,
        startDayOffsetPercent: startOffsetPercent,
        startDayPercent,
        endDayPercent: startDayPercent,
      },
      failureCode: null,
      needsMoreDays: false,
    };
  }

  let cursor = dayIndex + 1;
  while (cursor < totalDays && remaining > 0) {
    if (isNonWorkingDay(cursor, days)) {
      cursor += 1;
      continue;
    }
    if (usage[cursor] > 0) {
      return {
        planned: null,
        failureCode: 'DAY_CONFLICT',
        needsMoreDays: false,
      };
    }
    const dailyCapacity = getDayCapacitySeconds(cursor, lineId, days, lineCapacityById);
    if (dailyCapacity <= 0) {
      cursor += 1;
      continue;
    }
    if (remaining <= dailyCapacity) {
      const endDayPercent = (remaining / dailyCapacity) * 100;
      return {
        planned: {
          startIndex: dayIndex,
          endIndex: cursor,
          startDayOffsetPercent: startOffsetPercent,
          startDayPercent,
          endDayPercent,
        },
        failureCode: null,
        needsMoreDays: false,
      };
    }
    remaining -= dailyCapacity;
    cursor += 1;
  }

  return {
    planned: null,
    failureCode: 'INSUFFICIENT_DAYS',
    needsMoreDays: true,
  };
};

const planAssignment = (params) => planAssignmentDetailed(params).planned;

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

const reflowSingleLineAssignmentsByCapacity = ({
  lineId,
  lineItems,
  totalDays,
  days,
  lineCapacityById,
  capacityForSource,
  safeReflowStartIndex,
}) => {
  const sorted = (Array.isArray(lineItems) ? lineItems : [])
    .slice()
    .sort((a, b) => getAssignmentStartKey(a) - getAssignmentStartKey(b));
  if (sorted.length === 0) {
    return {
      assignments: [],
      failed: false,
      needsMoreDays: false,
    };
  }

  const fallbackAssignments = sorted.map((item) => ({ ...item, lineId }));
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
    const startIndex = Math.max(
      cursorStart,
      toNonNegativeInt(item?.startIndex, cursorStart)
    );
    if (startIndex >= totalDays) {
      return {
        assignments: fallbackAssignments,
        failed: true,
        needsMoreDays: true,
      };
    }

    const totalSeconds = resolveAssignmentPlannedSeconds(
      item,
      days,
      capacityForSource
    );
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return {
        assignments: fallbackAssignments,
        failed: true,
        needsMoreDays: false,
      };
    }
    const usedBeforeReflow = getUsageSecondsBeforeIndex(
      item,
      safeReflowStartIndex,
      days,
      capacityForSource
    );
    const remainingSeconds = Math.max(0, totalSeconds - usedBeforeReflow);
    if (remainingSeconds <= 0) continue;

    const planResult = planAssignmentDetailed({
      startIndex,
      totalSeconds: remainingSeconds,
      lineId,
      assignments: placed,
      totalDays,
      days,
      lineCapacityById,
    });
    if (!planResult.planned) {
      return {
        assignments: fallbackAssignments,
        failed: true,
        needsMoreDays: planResult.needsMoreDays,
      };
    }

    const planned = planResult.planned;
    const nextItem = {
      ...item,
      lineId,
      totalSeconds,
      ...planned,
      startDateKey: days[planned.startIndex]?.key ?? item.startDateKey,
      endDateKey: days[planned.endIndex]?.key ?? item.endDateKey,
    };
    placed.push(nextItem);

    const nextCursorStart = getNextStartIndex(nextItem, days, lineCapacityById);
    cursorStart = nextCursorStart == null ? nextItem.endIndex : nextCursorStart;
  }

  return {
    assignments: placed,
    failed: false,
    needsMoreDays: false,
  };
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
  const failedLineIds = [];
  let needsMoreDays = false;

  for (const [lineId, lineItems] of grouped.entries()) {
    const lineResult = reflowSingleLineAssignmentsByCapacity({
      lineId,
      lineItems,
      totalDays,
      days,
      lineCapacityById,
      capacityForSource,
      safeReflowStartIndex,
    });
    if (lineResult.failed) {
      failedLineIds.push(lineId);
    }
    if (lineResult.needsMoreDays) {
      needsMoreDays = true;
    }
    nextAssignments.push(...lineResult.assignments);
  }

  return {
    assignments: nextAssignments,
    failedLineIds,
    needsMoreDays,
  };
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
    startDateKey: days[planned.startIndex]?.key ?? insertItem.startDateKey,
    endDateKey: days[planned.endIndex]?.key ?? insertItem.endDateKey,
  });

  let cursorStart = getNextStartIndex(
    placed[placed.length - 1],
    days,
    lineCapacityById
  );

  const queue = after;

  for (const item of queue) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    if (item?.isCompleted) {
      const fixedStartIndex = toNonNegativeInt(item?.startIndex, 0);
      const fixedEndIndex = Math.max(
        fixedStartIndex,
        toNonNegativeInt(item?.endIndex, fixedStartIndex)
      );
      if (cursorStart > fixedStartIndex) return null;
      placed.push({
        ...item,
        lineId,
        startDateKey: days[fixedStartIndex]?.key ?? item.startDateKey,
        endDateKey: days[fixedEndIndex]?.key ?? item.endDateKey,
      });
      cursorStart = getNextStartIndex(
        placed[placed.length - 1],
        days,
        lineCapacityById
      );
      continue;
    }
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
      startDateKey: days[planned.startIndex]?.key ?? item.startDateKey,
      endDateKey: days[planned.endIndex]?.key ?? item.endDateKey,
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
      startDateKey: days[planned.startIndex]?.key ?? item.startDateKey,
      endDateKey: days[planned.endIndex]?.key ?? item.endDateKey,
    });

    cursorStart = getNextStartIndex(
      placed[placed.length - 1],
      days,
      lineCapacityById
    );
  }

  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    if (item?.isCompleted) {
      const fixedStartIndex = toNonNegativeInt(item?.startIndex, 0);
      const fixedEndIndex = Math.max(
        fixedStartIndex,
        toNonNegativeInt(item?.endIndex, fixedStartIndex)
      );
      if (cursorStart > fixedStartIndex) return null;
      placed.push({
        ...item,
        lineId,
        startDateKey: days[fixedStartIndex]?.key ?? item.startDateKey,
        endDateKey: days[fixedEndIndex]?.key ?? item.endDateKey,
      });
      cursorStart = getNextStartIndex(
        placed[placed.length - 1],
        days,
        lineCapacityById
      );
      continue;
    }

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
      startDateKey: days[planned.startIndex]?.key ?? item.startDateKey,
      endDateKey: days[planned.endIndex]?.key ?? item.endDateKey,
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
    startDateKey: days[planned.startIndex]?.key ?? newItem.startDateKey,
    endDateKey: days[planned.endIndex]?.key ?? newItem.endDateKey,
  });

  let cursorStart = getNextStartIndex(
    placed[placed.length - 1],
    days,
    lineCapacityById
  );
  for (const item of after) {
    if (cursorStart == null || cursorStart >= totalDays) return null;
    if (item?.isCompleted) {
      const fixedStartIndex = toNonNegativeInt(item?.startIndex, 0);
      const fixedEndIndex = Math.max(
        fixedStartIndex,
        toNonNegativeInt(item?.endIndex, fixedStartIndex)
      );
      if (cursorStart > fixedStartIndex) return null;
      placed.push({
        ...item,
        lineId,
        startDateKey: days[fixedStartIndex]?.key ?? item.startDateKey,
        endDateKey: days[fixedEndIndex]?.key ?? item.endDateKey,
      });
      cursorStart = getNextStartIndex(
        placed[placed.length - 1],
        days,
        lineCapacityById
      );
      continue;
    }
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
      startDateKey: days[nextPlanned.startIndex]?.key ?? item.startDateKey,
      endDateKey: days[nextPlanned.endIndex]?.key ?? item.endDateKey,
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
  const { showNotification } = useAppActions();
  const { activeOrgId, activeOrgRole, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [cards, setCards] = useState(() => initialCards);
  const [styles, setStyles] = useState([]);
  const [lines, setLines] = useState(() => initialLines);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [assignmentProgressById, setAssignmentProgressById] = useState({});
  const [activeDrag, setActiveDrag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const [externalReloadTick, setExternalReloadTick] = useState(0);
  const hasLoadedSourceDataRef = useRef(false);
  const lastLoadedOrgIdRef = useRef(null);
  const detailStyleFetchAttemptRef = useRef(new Set());
  const startDateRef = useRef(getMonthStartDate());
  const splitCounterRef = useRef(1);
  const disabledCardDragNoticeAtRef = useRef(0);
  const cursorWarningTimerRef = useRef(null);
  const lastSavedSnapshotRef = useRef('');
  const historyPastRef = useRef([]);
  const historyFutureRef = useRef([]);
  const historySnapshotRef = useRef('');
  const historyApplyingRef = useRef(false);
  const [historyStatus, setHistoryStatus] = useState({ undoCount: 0, redoCount: 0 });
  const { holidaySet } = useHolidayCalendar(activeOrgId);
  const MAX_RANGE_DAYS = 92;
  const [viewStart, setViewStart] = useState(() => getMonthStartDate());
  const [viewEnd, setViewEnd] = useState(() => getMonthEndDate());
  // viewStart 변경 시 assignment 인덱스 재계산을 위한 이전값 추적
  const prevViewStartRef = useRef(null);
  const dayCount = useMemo(() => {
    return Math.max(10, Math.round((viewEnd - viewStart) / 86400000) + 1);
  }, [viewStart, viewEnd]);
  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const [days, setDays] = useState(() =>
    buildDays(
      startDateRef.current,
      getDateRangeDayCount(startDateRef.current, getMonthEndDate(startDateRef.current)),
      holidaySet,
      languageCode
    )
  );
  const [contextMenuState, setContextMenuState] = useState(null);
  const [detailState, setDetailState] = useState(null);
  const [cursorWarningState, setCursorWarningState] = useState({
    open: false,
    x: 0,
    y: 0,
    message: '',
  });
  const [detailDraftsByTarget, setDetailDraftsByTarget] = useState({});
  const [detailStDraftsByTarget, setDetailStDraftsByTarget] = useState({});
  const [detailStyleLoadingKey, setDetailStyleLoadingKey] = useState('');
  const stylesRef = useRef(styles);
  const cardsRef = useRef(cards);
  const linesRef = useRef(lines);
  const assignmentsRef = useRef(assignments);
  const daysRef = useRef(days);
  const detailDraftsRef = useRef(detailDraftsByTarget);
  const detailStDraftsRef = useRef(detailStDraftsByTarget);
  useEffect(() => {
    setDays((prev) => {
      const nextLength = Array.isArray(prev) && prev.length > 0 ? prev.length : dayCount;
      return buildDays(startDateRef.current, nextLength, holidaySet, languageCode);
    });
  }, [dayCount, holidaySet, languageCode]);
  const { sensors, handleDragStart, handleDragCancel } = useAssignBoardDnd({
    persistReady,
    loading,
    cardsRef,
    assignmentsRef,
    setActiveDrag,
  });
  const lineCapacityById = useMemo(() => {
    return buildLineCapacityMap(lines);
  }, [lines]);
  const blurActiveElement = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  }, []);
  const preventToolbarButtonFocus = useCallback((event) => {
    event.preventDefault();
  }, []);
  const showCursorWarning = useCallback((clientX, clientY, message) => {
    const viewportWidth = Number(window?.innerWidth) || 0;
    const viewportHeight = Number(window?.innerHeight) || 0;
    const maxX = viewportWidth > 0 ? viewportWidth - 16 : clientX;
    const maxY = viewportHeight > 0 ? viewportHeight - 16 : clientY;
    const x = Math.max(16, Math.min(Number(clientX) + 14, maxX));
    const y = Math.max(16, Math.min(Number(clientY) - 12, maxY));
    setCursorWarningState({
      open: true,
      x,
      y,
      message,
    });
    if (cursorWarningTimerRef.current) {
      clearTimeout(cursorWarningTimerRef.current);
    }
    cursorWarningTimerRef.current = setTimeout(() => {
      setCursorWarningState((prev) => ({ ...prev, open: false }));
    }, 1300);
  }, []);
  const handleDisabledCardDragAttempt = useCallback((payload) => {
    const now = Date.now();
    if (now - disabledCardDragNoticeAtRef.current < 1200) return;
    disabledCardDragNoticeAtRef.current = now;
    const message =
      payload?.reason === 'ORDER_UNLOCKED'
        ? getUiMessage(
            'assign.dragRequiresOrderManualLock',
            languageCode === 'vi'
              ? 'Chi co the phan cong tren lich khi don hang da duoc khoa thu cong.'
              : languageCode === 'en'
                ? 'Scheduling is allowed only when the order is manually locked.'
                : '주문을 수동 잠금한 상태에서만 스케줄 배정이 가능합니다.',
            languageCode
          )
        : getUiMessage(
            'assign.dragRequiresPtOrSt',
            languageCode === 'vi'
              ? 'Chi co the phan cong sau khi dang ky PT/ST.'
              : languageCode === 'en'
                ? 'You can assign only after registering PT/ST.'
                : 'PT/ST 등록 후에 배정이 가능합니다.',
            languageCode
          );
    const pointerX = Number(payload?.clientX);
    const pointerY = Number(payload?.clientY);
    if (Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
      showCursorWarning(pointerX, pointerY, message);
      return;
    }
    showNotification(message, 'info');
  }, [languageCode, showCursorWarning, showNotification]);

  useEffect(() => {
    return () => {
      if (cursorWarningTimerRef.current) {
        clearTimeout(cursorWarningTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    detailDraftsRef.current = detailDraftsByTarget;
  }, [detailDraftsByTarget]);

  useEffect(() => {
    detailStDraftsRef.current = detailStDraftsByTarget;
  }, [detailStDraftsByTarget]);

  const syncHistoryStatus = useCallback(() => {
    setHistoryStatus({
      undoCount: historyPastRef.current.length,
      redoCount: historyFutureRef.current.length,
    });
  }, []);
  const isAssignmentRouteActive = location.pathname === '/assignment';

  useEffect(() => {
    return subscribeOrderModificationLockChanged((detail) => {
      const eventOrgId = Number(detail?.orgId);
      const currentOrgId = Number(activeOrgId);
      if (
        Number.isFinite(eventOrgId) &&
        eventOrgId > 0 &&
        Number.isFinite(currentOrgId) &&
        currentOrgId > 0 &&
        eventOrgId !== currentOrgId
      ) {
        return;
      }
      hasLoadedSourceDataRef.current = false;
      lastLoadedOrgIdRef.current = null;
      setExternalReloadTick((prev) => prev + 1);
    });
  }, [activeOrgId]);

  const serializeAssignmentsForSnapshot = useCallback((nextAssignments) => {
    const baseDate = startDateRef.current;
    return (Array.isArray(nextAssignments) ? nextAssignments : []).map((item) => {
      const normalized = normalizeAssignmentLayout(syncAssignmentDateKeys(item, baseDate));
      if (!normalized || typeof normalized !== 'object') return normalized;
      const {
        startIndex: _startIndex,
        endIndex: _endIndex,
        version: _version,
        versionUpdatedAt: _versionUpdatedAt,
        dbId: _dbId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
      } = normalized;
      return rest;
    });
  }, []);

  const createBoardSnapshotText = useCallback(
    (
      nextCards,
      nextAssignments,
      nextDetailDraftsByTarget = detailDraftsRef.current,
      nextDetailStDraftsByTarget = detailStDraftsRef.current
    ) =>
      JSON.stringify({
        cards: Array.isArray(nextCards) ? nextCards : [],
        assignments: serializeAssignmentsForSnapshot(nextAssignments),
        detailDraftsByTarget:
          nextDetailDraftsByTarget && typeof nextDetailDraftsByTarget === 'object'
            ? nextDetailDraftsByTarget
            : {},
        detailStDraftsByTarget:
          nextDetailStDraftsByTarget && typeof nextDetailStDraftsByTarget === 'object'
            ? nextDetailStDraftsByTarget
            : {},
      }),
    [serializeAssignmentsForSnapshot]
  );
  const resetBoardHistory = useCallback(
    (
      nextCards,
      nextAssignments,
      nextDetailDraftsByTarget = detailDraftsRef.current,
      nextDetailStDraftsByTarget = detailStDraftsRef.current
    ) => {
      historyPastRef.current = [];
      historyFutureRef.current = [];
      historySnapshotRef.current = createBoardSnapshotText(
        nextCards,
        nextAssignments,
        nextDetailDraftsByTarget,
        nextDetailStDraftsByTarget
      );
      historyApplyingRef.current = false;
      syncHistoryStatus();
    },
    [createBoardSnapshotText, syncHistoryStatus]
  );

  const createPersistSnapshotText = useCallback(
    (
      nextCards,
      nextAssignments,
      nextDetailDraftsByTarget = detailDraftsRef.current,
      nextDetailStDraftsByTarget = detailStDraftsRef.current
    ) =>
      JSON.stringify({
        cards: Array.isArray(nextCards) ? nextCards : [],
        assignments: serializeAssignmentsForSnapshot(nextAssignments),
        detailDraftsByTarget:
          nextDetailDraftsByTarget && typeof nextDetailDraftsByTarget === 'object'
            ? nextDetailDraftsByTarget
            : {},
        detailStDraftsByTarget:
          nextDetailStDraftsByTarget && typeof nextDetailStDraftsByTarget === 'object'
            ? nextDetailStDraftsByTarget
            : {},
      }),
    [serializeAssignmentsForSnapshot]
  );

  const currentPersistSnapshot = useMemo(
    () =>
      createPersistSnapshotText(
        cards,
        assignments,
        detailDraftsByTarget,
        detailStDraftsByTarget
      ),
    [
      assignments,
      cards,
      createPersistSnapshotText,
      detailDraftsByTarget,
      detailStDraftsByTarget,
    ]
  );
  const isDirty = persistReady && currentPersistSnapshot !== lastSavedSnapshotRef.current;
  const requestExternalBoardReload = useCallback(() => {
    hasLoadedSourceDataRef.current = false;
    lastLoadedOrgIdRef.current = null;
    setExternalReloadTick((prev) => prev + 1);
  }, []);
  const shouldHandleWorkspaceRefresh = useCallback((detail) => {
    if (hasWorkspaceDataTopic(detail, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD)) {
      return detail?.source !== ASSIGN_BOARD_SYNC_SOURCE;
    }

    if (!hasWorkspaceDataTopic(detail, WORKSPACE_DATA_TOPICS.STYLES)) {
      return false;
    }

    const changedStyleIds = Array.isArray(detail?.styleIds)
      ? detail.styleIds.map((styleId) => String(styleId || '').trim()).filter(Boolean)
      : [];
    if (changedStyleIds.length === 0) return true;

    const currentStyleIdSet = new Set(
      (Array.isArray(cardsRef.current) ? cardsRef.current : [])
        .map((card) => String(card?.styleId || '').trim())
        .filter(Boolean)
    );
    return changedStyleIds.some((styleId) => currentStyleIdSet.has(styleId));
  }, []);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.STYLES, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    isActive: isAssignmentRouteActive,
    isBlocked: loading || persisting || isDirty,
    onRefresh: requestExternalBoardReload,
    shouldHandle: shouldHandleWorkspaceRefresh,
    onBlocked: () => {
      if (!isDirty) return;
      showNotification(
        getUiMessage(
          'assign.externalDataPending',
          '관련 데이터가 변경되었습니다. 현재 미저장 배정이 있어 저장 또는 초기화 후 최신 상태를 반영합니다.',
          languageCode
        ),
        'info'
      );
    },
  });

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
          remapAssignmentToDayWindow(item, days)
        ),
      };
    },
    [days]
  );
  const parsePersistSnapshotAssignments = useCallback((snapshotText) => {
    try {
      const parsed = JSON.parse(snapshotText || '{}');
      return Array.isArray(parsed?.assignments) ? parsed.assignments : [];
    } catch (_error) {
      return [];
    }
  }, []);
  const mergeServerAssignmentVersions = useCallback(
    (nextAssignments, serverAssignments, savedAssignments) => {
      const serverById = new Map(
        (Array.isArray(serverAssignments) ? serverAssignments : [])
          .map((item) => normalizeAssignmentLayout(item))
          .filter((item) => item?.id)
          .map((item) => [String(item.id), item])
      );
      const savedById = new Map(
        (Array.isArray(savedAssignments) ? savedAssignments : [])
          .map((item) => normalizeAssignmentLayout(item))
          .filter((item) => item?.id)
          .map((item) => [String(item.id), item])
      );

      return (Array.isArray(nextAssignments) ? nextAssignments : []).map((item) => {
        const normalized = normalizeAssignmentLayout(item);
        const assignmentId = String(normalized?.id || '').trim();
        if (!assignmentId) return normalized;

        const serverItem = serverById.get(assignmentId);
        const savedItem = savedById.get(assignmentId);
        if (!serverItem || !savedItem) return normalized;
        if (!isSameComparableAssignmentState(savedItem, serverItem)) {
          return normalized;
        }

        return normalizeAssignmentLayout({
          ...normalized,
          version: toNonNegativeInt(serverItem?.version, normalized?.version ?? 0),
          versionUpdatedAt:
            typeof serverItem?.versionUpdatedAt === 'string' && serverItem.versionUpdatedAt.trim()
              ? serverItem.versionUpdatedAt
              : normalized?.versionUpdatedAt ?? null,
        });
      });
    },
    []
  );
  const alignAssignmentsForBoardPut = useCallback(
    async (nextAssignments) => {
      if (!activeOrgId) {
        return Array.isArray(nextAssignments) ? nextAssignments : [];
      }

      try {
        const latestAssignments = await requestJSON(
          '/assignment-board-versions' + buildQueryString({ orgId: activeOrgId }),
          {
            forceRefresh: true,
            skipGlobalLoading: true,
          }
        );
        return mergeServerAssignmentVersions(
          nextAssignments,
          latestAssignments?.assignments,
          parsePersistSnapshotAssignments(lastSavedSnapshotRef.current)
        );
      } catch (_error) {
        return Array.isArray(nextAssignments) ? nextAssignments : [];
      }
    },
    [activeOrgId, mergeServerAssignmentVersions, parsePersistSnapshotAssignments]
  );
  const resolveBoardSaveErrorMessage = useCallback((error, fallbackMessage) => {
    const raw = String(error?.message || '').trim();
    if (raw.toLowerCase().includes('assignment version conflict')) {
      return getUiMessage(
        'assign.versionConflict',
        'The server data is newer than this screen. Reload the assignment page and try again.',
        languageCode
      );
    }
    if (raw.toLowerCase().includes('order manual lock required before scheduling assignment')) {
      return getUiMessage(
        'assign.orderManualLockRequiredSaveError',
        languageCode === 'vi'
          ? 'Chi co the luu thay doi phan cong khi don hang da duoc khoa thu cong.'
          : languageCode === 'en'
            ? 'You can save scheduling changes only when the order is manually locked.'
            : '주문이 수동 잠금된 상태에서만 배정 변경을 저장할 수 있습니다.',
        languageCode
      );
    }
    return raw || fallbackMessage;
  }, [languageCode]);

  const applyBoardSnapshotText = useCallback((snapshotText) => {
    try {
      const parsed = JSON.parse(snapshotText || '{}');
      const snapshotCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
      const snapshotAssignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
      const snapshotDetailDrafts =
        parsed?.detailDraftsByTarget &&
        typeof parsed.detailDraftsByTarget === 'object' &&
        !Array.isArray(parsed.detailDraftsByTarget)
          ? parsed.detailDraftsByTarget
          : {};
      const snapshotDetailStDrafts =
        parsed?.detailStDraftsByTarget &&
        typeof parsed.detailStDraftsByTarget === 'object' &&
        !Array.isArray(parsed.detailStDraftsByTarget)
          ? parsed.detailStDraftsByTarget
          : {};
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        { cards: snapshotCards, assignments: snapshotAssignments },
        snapshotCards,
        snapshotAssignments
      );
      const maxEndIndex = persistedAssignments.reduce(
        (max, item) => Math.max(max, toSignedInt(item?.endIndex, 0)),
        0
      );
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      setDetailDraftsByTarget(snapshotDetailDrafts);
      setDetailStDraftsByTarget(snapshotDetailStDrafts);
      setSelectedCardId((prev) =>
        persistedCards.some((card) => String(card?.id) === String(prev)) ? prev : null
      );
      setDays((prev) => {
        const requiredLength = Math.max(prev.length, maxEndIndex + 10);
        return requiredLength > prev.length
          ? buildDays(startDateRef.current, requiredLength, holidaySet, languageCode)
          : prev;
      });
      return true;
    } catch (_error) {
      // Ignore malformed snapshots and keep current state.
      return false;
    }
  }, [holidaySet, resolvePersistedBoardState]);

  const applyLoadedBoardData = useCallback(
    ({
      nextStyles = null,
      nextLines = [],
      baseCards = [],
      boardState = null,
      markPersistReady = false,
    }) => {
      const safeBaseCards = Array.isArray(baseCards) ? baseCards : [];
      const nextLineCapacityById = buildLineCapacityMap(nextLines);
      const nextLineIdSet = new Set(nextLines.map((line) => normalizeKey(line.id)));

      const hasSavedBoardState =
        Array.isArray(boardState?.cards) || Array.isArray(boardState?.assignments);
      const savedCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
      const savedAssignments = Array.isArray(boardState?.assignments) ? boardState.assignments : [];
      const restoredCards = hasSavedBoardState
        ? mergeCardsWithSaved(safeBaseCards, savedCards)
        : safeBaseCards;
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
          ? buildDays(startDateRef.current, restoreDayCount, holidaySet, languageCode)
          : days;
      const restoredAssignments = hasSavedBoardState
        ? normalizedSavedAssignments.map((item) => {
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

      {
        const restoreDayLength = normalizedRestoreDays.length;
        normalizedRestoredAssignments = normalizedRestoredAssignments.map((assignment) => {
          const remapped = remapAssignmentToDayWindow(assignment, normalizedRestoreDays);
          if (remapped?.startDateKey) {
            return remapped;
          }
          const clampedStart = Math.min(
            Math.max(toSignedInt(remapped?.startIndex, 0), 0),
            restoreDayLength - 1
          );
          const clampedEnd = Math.min(
            Math.max(clampedStart, toSignedInt(remapped?.endIndex, clampedStart)),
            restoreDayLength - 1
          );
          return { ...remapped, startIndex: clampedStart, endIndex: clampedEnd };
        });
      }

      const hasAbsoluteScheduleKeys = normalizedRestoredAssignments.some((item) =>
        Boolean(parseDateKey(item?.startDateKey))
      );
      if (!hasAbsoluteScheduleKeys && normalizedRestoredAssignments.length > 1) {
        const reflowStartIndex = getTodayDayIndex(normalizedRestoreDays);
        let candidateDays = normalizedRestoreDays;
        let reflowResult = null;

        for (let attempt = 0; attempt < 6; attempt += 1) {
          reflowResult = reflowAssignmentsByLineCapacity({
            assignments: normalizedRestoredAssignments,
            totalDays: candidateDays.length,
            days: candidateDays,
            lineCapacityById: nextLineCapacityById,
            sourceLineCapacityById: nextLineCapacityById,
            reflowStartIndex,
          });
          if (!reflowResult?.needsMoreDays) break;
          candidateDays = buildDays(
            startDateRef.current,
            candidateDays.length + 20,
            holidaySet,
            languageCode
          );
        }

        if (Array.isArray(reflowResult?.assignments)) {
          normalizedRestoredAssignments = reflowResult.assignments.map((item) =>
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
        normalizedRestoredAssignments,
        {},
        {}
      );
      const boardSnapshot = createBoardSnapshotText(
        restoredCards,
        normalizedRestoredAssignments,
        {},
        {}
      );
      const nextCardIdSet = new Set(restoredCards.map((card) => card.id));

      if (Array.isArray(nextStyles)) {
        setStyles(nextStyles);
      }
      setLines(nextLines);
      setCards(restoredCards);
      // Keep absolute date keys loaded from server state.
      // Recomputing them from current view base date causes cross-month schedules to shift visually.
      setAssignments(
        normalizedRestoredAssignments.map((assignment) =>
          normalizeAssignmentLayout(assignment)
        )
      );
      setDetailDraftsByTarget({});
      setDetailStDraftsByTarget({});
      if (nextDayCount > normalizedRestoreDays.length) {
        setDays(buildDays(startDateRef.current, nextDayCount, holidaySet, languageCode));
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
      if (markPersistReady) {
        setPersistReady(true);
      }
    },
    [
      createBoardSnapshotText,
      createPersistSnapshotText,
      days,
      holidaySet,
      syncHistoryStatus,
    ]
  );

  useEffect(() => {
    const newStart = new Date(viewStart);
    newStart.setHours(0, 0, 0, 0);
    const oldBase = prevViewStartRef.current || newStart;
    prevViewStartRef.current = newStart;
    startDateRef.current = newStart;
    const newDays = buildDays(newStart, dayCount, holidaySet, languageCode);
    setDays(newDays);
    // View range changes should only remap indices for rendering.
    // Reflow/recompute here mutates schedule unintentionally and can trigger false save conflicts.
    setAssignments((prev) =>
      (Array.isArray(prev) ? prev : []).map((assignment) =>
        remapAssignmentToDayWindow(assignment, newDays, oldBase)
      )
    );
  }, [viewStart, dayCount, holidaySet, languageCode]);

  useEffect(() => {
    if (!isAssignmentRouteActive) return undefined;
    const normalizedOrgId =
      Number.isFinite(Number(activeOrgId)) && Number(activeOrgId) > 0
        ? Number(activeOrgId)
        : null;
    if (
      hasLoadedSourceDataRef.current &&
      lastLoadedOrgIdRef.current === normalizedOrgId
    ) {
      return undefined;
    }
    let cancelled = false;

    const loadSourceData = async () => {
      setPersistReady(false);
      setLoading(true);
      detailStyleFetchAttemptRef.current = new Set();
      let appliedSavedBoardState = false;
      let loadedSuccessfully = false;
      try {
        const orgQuery = buildQueryString({ orgId: activeOrgId });
        const assignmentCardsQuery = buildQueryString({
          orgId: activeOrgId,
          includeProcesses: 1,
        });
        const boardViewQuery = buildQueryString({
          orgId: activeOrgId,
          includeCards: 0,
        });
        const lineHeadcountQuery = buildQueryString({
          orgId: activeOrgId,
          summary: 1,
        });
        const assignmentCardsPromise = requestJSON('/assignment-cards' + assignmentCardsQuery, {
          forceRefresh: true,
        }).catch(() => null);

        const applyAssignmentCardsResponse = (assignmentCardsResponse, nextLines, boardState) => {
          const nextStyles = Array.isArray(assignmentCardsResponse?.styles)
            ? assignmentCardsResponse.styles
            : [];
          const nextCards = (Array.isArray(assignmentCardsResponse?.cards)
            ? assignmentCardsResponse.cards
            : []
          ).map((card) => ({
            ...card,
            isManualOrderLocked: isCardManualOrderLocked(card),
          }));
          applyLoadedBoardData({
            nextStyles,
            nextLines,
            baseCards: nextCards,
            boardState,
            markPersistReady: true,
          });
        };

        const [factories, lines, lineHeadcounts, boardState] = await Promise.all([
          requestJSON('/factories' + orgQuery).catch(() => []),
          requestJSON('/lines' + orgQuery).catch(() => []),
          requestJSON('/line-workers' + lineHeadcountQuery).catch(() => []),
          requestJSON('/assignment-board-view' + boardViewQuery, {
            forceRefresh: true,
          }).catch(() => null),
        ]);
        if (cancelled) return;

        const safeFactories = Array.isArray(factories) ? factories : [];
        const nextLines = buildAssignableLines({
          factories: safeFactories,
          lines,
          lineHeadcounts,
        });

        const assignmentCardsResponse = await assignmentCardsPromise;
        if (cancelled) return;
        if (!assignmentCardsResponse) {
          setStyles([]);
          setLines(nextLines);
          setCards([]);
          setAssignments([]);
          setPersistReady(true);
          return;
        }

        applyAssignmentCardsResponse(assignmentCardsResponse, nextLines, boardState);
        appliedSavedBoardState = true;
        loadedSuccessfully = true;
      } catch (_error) {
        if (!cancelled) {
          if (!appliedSavedBoardState) {
            setStyles([]);
            setLines([]);
            setCards([]);
            setAssignments([]);
            lastSavedSnapshotRef.current = createPersistSnapshotText([], []);
            historyPastRef.current = [];
            historyFutureRef.current = [];
            historySnapshotRef.current = createBoardSnapshotText([], []);
            historyApplyingRef.current = false;
            syncHistoryStatus();
          }
          setPersistReady(true);
        }
      } finally {
        if (!cancelled) {
          if (loadedSuccessfully) {
            hasLoadedSourceDataRef.current = true;
            lastLoadedOrgIdRef.current = normalizedOrgId;
          }
          setLoading(false);
        }
      }
    };

    loadSourceData();
    return () => {
      cancelled = true;
    };
  }, [
    activeOrgId,
    applyLoadedBoardData,
    createBoardSnapshotText,
    createPersistSnapshotText,
    externalReloadTick,
    isAssignmentRouteActive,
    syncHistoryStatus,
  ]);


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
  }, [
    assignments,
    cards,
    createBoardSnapshotText,
    detailDraftsByTarget,
    detailStDraftsByTarget,
    persistReady,
    syncHistoryStatus,
  ]);

  const handleSaveBoard = useCallback(async () => {
    if (!activeOrgId || !persistReady || persisting || !isDirty) return;

    blurActiveElement();
    setPersisting(true);

    const currentCards = Array.isArray(cardsRef.current) ? cardsRef.current : [];
    const currentAssignments = Array.isArray(assignmentsRef.current)
      ? assignmentsRef.current
      : [];
    const currentDays = Array.isArray(daysRef.current) ? daysRef.current : [];
    const currentStyles = Array.isArray(stylesRef.current) ? stylesRef.current : [];
    const currentCardById = new Map(
      currentCards
        .filter((card) => card?.id)
        .map((card) => [String(card.id), card])
    );
    const currentStyleById = new Map(
      currentStyles
        .filter((style) => style?.id)
        .map((style) => [String(style.id), style])
    );
    const currentDetailDraftsByTarget =
      detailDraftsRef.current && typeof detailDraftsRef.current === 'object'
        ? detailDraftsRef.current
        : {};
    const currentDetailStDraftsByTarget =
      detailStDraftsRef.current && typeof detailStDraftsRef.current === 'object'
        ? detailStDraftsRef.current
        : {};
    const nowIso = new Date().toISOString();
    const updatedBy =
      String(
        activeProfile?.employeeName ||
          activeProfile?.name ||
          activeProfile?.email ||
          activeProfile?.label ||
          ''
      ).trim() || 'OPERATOR';
    const applyCtSnapshotForPersistence = (assignment, baseDate = startDateRef.current) => {
      const card = currentCardById.get(String(assignment?.cardId || '')) || null;
      const styleId = String(card?.styleId || '').trim();
      const style = styleId ? currentStyleById.get(styleId) || null : null;
      return applyAssignmentCtSnapshotForSave({
        assignment,
        card,
        style,
        draftByProcess:
          currentDetailDraftsByTarget[`assignment:${String(assignment?.id || '')}`] || {},
        stDraftByProcess:
          currentDetailStDraftsByTarget[`assignment:${String(assignment?.id || '')}`] || {},
        baseDate,
        updatedAt: nowIso,
        updatedBy,
      });
    };
    const assignmentsWithCtSnapshot = currentAssignments.map((item) =>
      applyCtSnapshotForPersistence(item, startDateRef.current)
    );

    const { baseDate: persistBaseDate, days: persistDays } = buildAssignmentPersistenceWindow({
      assignments: assignmentsWithCtSnapshot,
      days: currentDays,
      baseDate: startDateRef.current,
      holidaySet,
    });
    const assignmentsForPersistence = assignmentsWithCtSnapshot.map((item) =>
      remapAssignmentToDayWindow(
        syncAssignmentDateKeys(item, startDateRef.current),
        persistDays,
        startDateRef.current
      )
    );

    // 저장 전 날짜 중첩 제거: 기존 배치를 기준으로 재배치
    let candidatePersistDays = persistDays;
    let reflowResult = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      reflowResult = reflowAssignmentsByLineCapacity({
        assignments: assignmentsForPersistence,
        totalDays: candidatePersistDays.length,
        days: candidatePersistDays,
        lineCapacityById,
        reflowStartIndex: 0,
      });
      if (!reflowResult?.needsMoreDays) break;
      candidatePersistDays = buildDays(
        persistBaseDate,
        candidatePersistDays.length + 20,
        holidaySet
      );
    }
    const assignmentsToSave = Array.isArray(reflowResult?.assignments)
      ? reflowResult.assignments
      : assignmentsForPersistence;

    const normalizedAssignments = assignmentsToSave.map((item) =>
      applyCtSnapshotForPersistence(
        syncAssignmentDateKeys(item, persistBaseDate),
        persistBaseDate
      )
    );
    try {
      const assignmentsForPut = await alignAssignmentsForBoardPut(normalizedAssignments);
      const response = await requestJSON(
        '/assignment-board-state' + buildQueryString({ orgId: activeOrgId }),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: currentCards, assignments: assignmentsForPut }),
          skipGlobalLoading: true,
        }
      );
      const { persistedCards, persistedAssignments } = resolvePersistedBoardState(
        response,
        currentCards,
        assignmentsForPut
      );
      // 저장 후 서버 응답(version 등 메타데이터 갱신)을 히스토리에 기록하지 않음
      historyApplyingRef.current = true;
      setCards(persistedCards);
      setAssignments(persistedAssignments);
      setDetailDraftsByTarget({});
      setDetailStDraftsByTarget({});
      lastSavedSnapshotRef.current = createPersistSnapshotText(
        persistedCards,
        persistedAssignments,
        {},
        {}
      );
      resetBoardHistory(persistedCards, persistedAssignments, {}, {});
      emitWorkspaceDataChanged({
        topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
        orgId: activeOrgId,
        assignmentIds: persistedAssignments.map((item) => item?.id),
        source: ASSIGN_BOARD_SYNC_SOURCE,
      });
      showNotification(
        getUiMessage('assign.saveSuccess', 'Assignment saved.', languageCode),
        'success'
      );
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(
          error,
          getUiMessage('assign.saveError', 'Failed to save the assignment.', languageCode)
        ),
        'error'
      );
    } finally {
      setPersisting(false);
    }
  }, [
    activeOrgId,
    assignments,
    cards,
    cardsRef,
    blurActiveElement,
    days,
    daysRef,
    holidaySet,
    lineCapacityById,
    alignAssignmentsForBoardPut,
    createPersistSnapshotText,
    isDirty,
    persistReady,
    persisting,
    resolveBoardSaveErrorMessage,
    resolvePersistedBoardState,
    resetBoardHistory,
    showNotification,
    assignmentsRef,
    activeProfile?.employeeName,
    activeProfile?.name,
    activeProfile?.email,
    activeProfile?.label,
    stylesRef,
    languageCode,
  ]);

  const navigationBlocker = useBlocker(
    isAssignmentRouteActive && persistReady && isDirty && !persisting
  );

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    const shouldLeave = window.confirm(
      getUiMessage(
        'assign.leaveWithoutSaving',
        'There are unsaved assignment changes. Leave without saving?',
        languageCode
      )
    );
    if (shouldLeave) {
      navigationBlocker.proceed();
      return;
    }
    navigationBlocker.reset();
  }, [languageCode, navigationBlocker, navigationBlocker.state]);

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
    const next = buildDays(startDateRef.current, minLength, holidaySet, languageCode);
    setDays(next);
    return next;
  };

  const AUTO_EXTEND_STEP_DAYS = 14;
  const AUTO_EXTEND_MAX_DAYS = 730;
  const getNextAutoExtendLength = (currentLength) => {
    const safeLength = Math.max(1, toNonNegativeInt(currentLength, 0));
    if (safeLength >= AUTO_EXTEND_MAX_DAYS) return null;
    return Math.min(AUTO_EXTEND_MAX_DAYS, safeLength + AUTO_EXTEND_STEP_DAYS);
  };

  const tryPlanAssignment = (params) => {
    let candidateDays = days;
    while (true) {
      const planResult = planAssignmentDetailed({
        ...params,
        totalDays: candidateDays.length,
        days: candidateDays,
        lineCapacityById,
      });
      if (planResult?.planned) return planResult.planned;
      if (!planResult?.needsMoreDays) return null;

      const nextLength = getNextAutoExtendLength(candidateDays.length);
      if (!nextLength) return null;
      candidateDays = ensureDaysLength(nextLength);
    }
  };

  const runRebuildWithAutoExtend = (builder, params) => {
    let candidateDays = days;
    while (true) {
      const result = builder({
        ...params,
        totalDays: candidateDays.length,
        days: candidateDays,
        lineCapacityById,
      });
      if (result) return result;

      const nextLength = getNextAutoExtendLength(candidateDays.length);
      if (!nextLength) return null;
      candidateDays = ensureDaysLength(nextLength);
    }
  };

  const tryRebuildLineWithInsert = (params) => {
    return runRebuildWithAutoExtend(rebuildLineWithInsert, params);
  };

  const tryRebuildLineWithChain = (params) => {
    return runRebuildWithAutoExtend(rebuildLineWithChain, params);
  };

  const tryRebuildLineWithReplace = (params) => {
    return runRebuildWithAutoExtend(rebuildLineWithReplace, params);
  };
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
  const assignmentProgressIdsKey = useMemo(
    () =>
      Array.from(
        new Set(
          assignments
            .map((assignment) => String(assignment?.id || '').trim())
            .filter(Boolean)
        )
      )
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .join(','),
    [assignments]
  );
  useEffect(() => {
    const normalizedOrgId = Number(activeOrgId);
    if (!Number.isFinite(normalizedOrgId) || normalizedOrgId <= 0 || !assignmentProgressIdsKey) {
      setAssignmentProgressById({});
      return undefined;
    }

    let cancelled = false;
    const abortController = new AbortController();
    requestJSON(
      '/assignment-plan-progress' +
        buildQueryString({ orgId: normalizedOrgId, ids: assignmentProgressIdsKey }),
      {
        skipGlobalLoading: true,
        signal: abortController.signal,
      }
    )
      .then((rows) => {
        if (cancelled) return;
        const nextMap = {};
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const rowId = String(row?.id || '').trim();
          if (!rowId) return;
          nextMap[rowId] = row;
        });
        setAssignmentProgressById(nextMap);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentProgressById({});
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeOrgId, assignmentProgressIdsKey]);
  const assignmentCtDisplayStateById = useMemo(() => {
    const map = new Map();

    assignments.forEach((assignment) => {
      const assignmentId = String(assignment?.id || '').trim();
      if (!assignmentId) return;
      if (!hasSavedCtSnapshot(assignment)) {
        map.set(assignmentId, 'UNSAVED');
        return;
      }

      const card = cardById.get(String(assignment?.cardId || '')) || null;
      const styleId = String(card?.styleId || '').trim();
      const style = styleId ? styleById.get(styleId) || null : null;
      const draftByProcess = detailDraftsByTarget[`assignment:${assignmentId}`] || {};
      const stDraftByProcess = detailStDraftsByTarget[`assignment:${assignmentId}`] || {};
      const hasDraftChange = hasAssignmentCtDraftChange({
        assignment,
        card,
        style,
        draftByProcess,
        stDraftByProcess,
        baseDate: startDateRef.current,
      });
      map.set(assignmentId, hasDraftChange ? 'UNSAVED' : 'SAVED');
    });

    return map;
  }, [
    assignments,
    cardById,
    styleById,
    detailDraftsByTarget,
    detailStDraftsByTarget,
  ]);

  const assignmentsForRender = useMemo(() => {
    const dayIndexByDateKey = new Map(
      (Array.isArray(days) ? days : [])
        .map((day, index) => {
          const key = typeof day?.key === 'string' ? day.key.trim() : '';
          return key ? [key, index] : null;
        })
        .filter(Boolean)
    );
    const firstDayDate =
      Array.isArray(days) && days.length > 0 ? parseDateKey(days[0]?.key) : null;

    const resolveEndIndexFromDateKey = (dateKey, fallbackIndex) => {
      const normalizedDateKey =
        typeof dateKey === 'string' && dateKey.trim() ? dateKey.trim() : '';
      if (!normalizedDateKey) return fallbackIndex;
      if (dayIndexByDateKey.has(normalizedDateKey)) {
        return dayIndexByDateKey.get(normalizedDateKey);
      }
      const targetDate = parseDateKey(normalizedDateKey);
      if (!targetDate || !firstDayDate) return fallbackIndex;
      return Math.round((targetDate.getTime() - firstDayDate.getTime()) / 86400000);
    };

    return assignments
      .filter((item) => item.endIndex >= 0 && item.startIndex < dayCount)
      .map((item) => {
        const progressRow = assignmentProgressById[String(item?.id || '').trim()] || null;
        const plannedQuantity = Number(
          progressRow?.plannedQuantity ?? item?.quantity ?? item?.plannedQuantity ?? 0
        );
        const qcPassedTotalRaw = Number(progressRow?.qcPassedTotal ?? item?.qcPassedTotal ?? 0);
        const closedQtyRaw = Number(progressRow?.closedQty ?? item?.closedQty ?? item?.finalQuantity ?? 0);
        const qcDisplayQuantity = qcPassedTotalRaw > 0 ? qcPassedTotalRaw : closedQtyRaw;
        const rawProgressPercent = toRawPercentValue(
          progressRow?.operationalProgressPercent ??
            progressRow?.progressPercent ??
            item?.workProgressPercent ??
            item?.progressPercent ??
            0
        );
        const scheduleStatus = String(progressRow?.scheduleStatus || '').trim();
        const isCompleted = Boolean(
          (scheduleStatus === 'PRODUCTION_COMPLETED'
            ? true
            : null) ??
            progressRow?.isCompleted ??
            progressRow?.closedAt ??
            item?.isCompleted ??
            item?.closedAt ??
            item?.completedAt
        );
        const workProgressPercent = rawProgressPercent;
        const qcProgressPercent =
          plannedQuantity > 0 ? clampPercentValue((qcDisplayQuantity / plannedQuantity) * 100) : 0;
        const renderEndDateKey =
          (typeof progressRow?.renderEndDate === 'string' && progressRow.renderEndDate.trim()
            ? progressRow.renderEndDate.trim()
            : null) ||
          (typeof progressRow?.candidateEndDate === 'string' && progressRow.candidateEndDate.trim()
            ? progressRow.candidateEndDate.trim()
            : null) ||
          (typeof item?.endDateKey === 'string' && item.endDateKey.trim() ? item.endDateKey.trim() : null);
        const resolvedEndIndex = Math.max(
          toSignedInt(item?.startIndex, 0),
          toSignedInt(
            resolveEndIndexFromDateKey(renderEndDateKey, toSignedInt(item?.endIndex, 0)),
            toSignedInt(item?.endIndex, 0)
          )
        );
        const statusType = resolveAssignmentVisualStatus({
          isCompleted,
          startDateKey: item?.startDateKey,
          endDateKey: renderEndDateKey || item?.endDateKey,
          todayDateKey,
        });
        if (!item.cardId) return item;
        const card = cardById.get(item.cardId);
        if (!card) return item;
        return {
          ...item,
          quantity: item.quantity ?? card.quantity,
          gender: item.gender ?? card.gender,
          isCompleted,
          completedAt:
            progressRow?.productionCompletedAt ??
            progressRow?.completedAt ??
            progressRow?.closedAt ??
            item?.completedAt ??
            item?.closedAt ??
            null,
          productionCompletedAt:
            progressRow?.productionCompletedAt ?? item?.productionCompletedAt ?? null,
          scheduleStatus: scheduleStatus || item?.scheduleStatus || null,
          candidateEndDate:
            progressRow?.candidateEndDate ?? item?.candidateEndDate ?? null,
          renderEndDate:
            progressRow?.renderEndDate ?? progressRow?.candidateEndDate ?? item?.renderEndDate ?? null,
          endDateKey: renderEndDateKey || item?.endDateKey,
          endIndex: resolvedEndIndex,
          closedAt:
            progressRow?.closedAt ?? item?.closedAt ?? item?.completedAt ?? null,
          closedQty:
            progressRow?.closedQty ?? item?.closedQty ?? item?.finalQuantity ?? null,
          closeMode: progressRow?.closeMode ?? item?.closeMode ?? null,
          closeBasis: progressRow?.closeBasis ?? item?.closeBasis ?? null,
          producedQuantity:
            progressRow?.producedQuantity ?? item?.producedQuantity ?? null,
          progressPercent: workProgressPercent,
          workProgressPercent,
          qcPassedTotal: qcDisplayQuantity || 0,
          qcProgressPercent,
          qcDisplaySource:
            qcPassedTotalRaw > 0 ? 'event' : isCompleted && qcDisplayQuantity > 0 ? 'close' : 'empty',
          latestQcDate:
            progressRow?.latestQcDate ?? item?.latestQcDate ?? null,
          statusType,
          ctDisplayState:
            assignmentCtDisplayStateById.get(String(item.id)) ||
            (hasSavedCtSnapshot(item) ? 'SAVED' : 'UNSAVED'),
        };
      });
  }, [
    assignments,
    assignmentCtDisplayStateById,
    assignmentProgressById,
    cardById,
    days,
    dayCount,
    todayDateKey,
  ]);

  const unassignedCards = useMemo(
    () => cards.filter((card) => !assignedCardIds.has(card.id)),
    [cards, assignedCardIds]
  );
  const unlockedUnassignedCardCount = useMemo(
    () =>
      unassignedCards.reduce(
        (count, card) => count + (isCardManualOrderLocked(card) ? 0 : 1),
        0
      ),
    [unassignedCards]
  );
  const cardSearchTextById = useMemo(
    () =>
      new Map(
        unassignedCards.map((card) => [String(card.id), buildAssignableCardSearchText(card)])
      ),
    [unassignedCards]
  );

  const filteredCards = useMemo(() => {
    if (!deferredSearchTerm) return unassignedCards;
    const lower = deferredSearchTerm.toLowerCase();
    return unassignedCards.filter(
      (card) => (cardSearchTextById.get(String(card.id)) || '').includes(lower)
    );
  }, [cardSearchTextById, deferredSearchTerm, unassignedCards]);
  const unassignedQuantityByOrderNo = useMemo(() => {
    const totals = new Map();
    unassignedCards.forEach((card) => {
      const orderNo =
        normalizeKey(card?.orderNo) ||
        getUiMessage('assign.fallbackOrderNumber', 'No Order No.', languageCode);
      totals.set(orderNo, (totals.get(orderNo) || 0) + Math.max(0, Number(card?.quantity) || 0));
    });
    return totals;
  }, [languageCode, unassignedCards]);
  const totalOrderQuantityByOrderNo = useMemo(() => {
    const totals = new Map();
    cards.forEach((card) => {
      const orderNo =
        normalizeKey(card?.orderNo) ||
        getUiMessage('assign.fallbackOrderNumber', 'No Order No.', languageCode);
      totals.set(orderNo, (totals.get(orderNo) || 0) + Math.max(0, Number(card?.quantity) || 0));
    });
    return totals;
  }, [cards, languageCode]);

  const compareUnassignedCardAsc = useCallback((left, right) => {
    const leftStyleKey =
      normalizeKey(left?.styleName) ||
      normalizeKey(left?.styleCode) ||
      normalizeKey(left?.styleId) ||
      normalizeKey(left?.id);
    const rightStyleKey =
      normalizeKey(right?.styleName) ||
      normalizeKey(right?.styleCode) ||
      normalizeKey(right?.styleId) ||
      normalizeKey(right?.id);
    const styleCompare = leftStyleKey.localeCompare(rightStyleKey, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (styleCompare !== 0) return styleCompare;

    const leftColorKey = normalizeKey(left?.colorName) || normalizeKey(left?.colorCode);
    const rightColorKey = normalizeKey(right?.colorName) || normalizeKey(right?.colorCode);
    const colorCompare = leftColorKey.localeCompare(rightColorKey, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (colorCompare !== 0) return colorCompare;

    const leftGenderKey = normalizeGenderKey(left?.gender);
    const rightGenderKey = normalizeGenderKey(right?.gender);
    const genderCompare = leftGenderKey.localeCompare(rightGenderKey, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (genderCompare !== 0) return genderCompare;

    return normalizeKey(left?.id).localeCompare(normalizeKey(right?.id), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }, []);

  const groupedFilteredCards = useMemo(() => {
    const groups = new Map();
    filteredCards.forEach((card) => {
      const orderNo =
        normalizeKey(card?.orderNo) ||
        getUiMessage('assign.fallbackOrderNumber', 'No Order No.', languageCode);
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

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        unassignedQuantity:
          Number(unassignedQuantityByOrderNo.get(group.orderNo)) || 0,
        orderTotalQuantity: Math.max(
          Number(unassignedQuantityByOrderNo.get(group.orderNo)) || 0,
          Number(totalOrderQuantityByOrderNo.get(group.orderNo)) || 0
        ),
        cards: [...group.cards].sort(compareUnassignedCardAsc),
      }))
      .sort((a, b) => {
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
  }, [
    compareUnassignedCardAsc,
    filteredCards,
    languageCode,
    totalOrderQuantityByOrderNo,
    unassignedQuantityByOrderNo,
  ]);
  const filteredUnassignedQuantity = useMemo(
    () =>
      groupedFilteredCards.reduce(
        (sum, group) => sum + (Number(group.unassignedQuantity) || 0),
        0
      ),
    [groupedFilteredCards]
  );
  const filteredOrderTotalQuantity = useMemo(
    () =>
      groupedFilteredCards.reduce(
        (sum, group) => sum + (Number(group.orderTotalQuantity) || 0),
        0
      ),
    [groupedFilteredCards]
  );

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
  const currentDetailStyleKey = useMemo(() => {
    const styleId = String(detailCard?.styleId || '').trim();
    if (!styleId || !activeOrgId) return '';
    return `${activeOrgId}:${styleId}`;
  }, [activeOrgId, detailCard?.styleId]);
  useEffect(() => {
    const styleId = String(detailCard?.styleId || '').trim();
    if (!styleId || !activeOrgId) {
      setDetailStyleLoadingKey((prev) => (prev === currentDetailStyleKey ? '' : prev));
      return undefined;
    }
    const attemptKey = `${activeOrgId}:${styleId}`;
    const currentStyle = styleById.get(styleId) || null;
    if (
      Array.isArray(currentStyle?.processes) &&
      currentStyle.processes.length > 0
    ) {
      setDetailStyleLoadingKey((prev) => (prev === attemptKey ? '' : prev));
      return undefined;
    }
    if (detailStyleFetchAttemptRef.current.has(attemptKey)) {
      return undefined;
    }

    detailStyleFetchAttemptRef.current.add(attemptKey);
    setDetailStyleLoadingKey(attemptKey);
    let cancelled = false;

    const loadStyleDetail = async () => {
      try {
        const loadedStyle = await fetchStyleById(styleId, {
          orgId: activeOrgId,
          ownerOrgId: currentStyle?.ownerOrgId ?? null,
          skipGlobalLoading: true,
        });
        if (cancelled || !loadedStyle) return;
        setStyles((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = next.findIndex(
            (item) => String(item?.id || '').trim() === styleId
          );
          if (existingIndex >= 0) {
            next[existingIndex] = loadedStyle;
          } else {
            next.push(loadedStyle);
          }
          return next;
        });
      } catch (_error) {
        // Keep the attempt consumed to avoid repeated background fetches for missing styles.
      } finally {
        if (!cancelled) {
          setDetailStyleLoadingKey((prev) => (prev === attemptKey ? '' : prev));
        }
      }
    };

    loadStyleDetail();
    return () => {
      cancelled = true;
      setDetailStyleLoadingKey((prev) => (prev === attemptKey ? '' : prev));
    };
  }, [activeOrgId, currentDetailStyleKey, detailCard, styleById]);
  const detailStyleLoading = Boolean(currentDetailStyleKey) && detailStyleLoadingKey === currentDetailStyleKey;
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
    const wagePerSecond = toOptionalPositiveNumber(
      detailLine?.factoryWagePerSecond ??
        detailLine?.wagePerSecond ??
        detailAssignment?.factoryWagePerSecond ??
        detailAssignment?.wagePerSecond
    );
    const ctSnapshot = resolveAssignmentCtSnapshot(detailAssignment);
    const canUseSnapshot = ctSnapshot && Array.isArray(ctSnapshot?.processes);
    const savedSnapshotByProcess = (
      canUseSnapshot && Array.isArray(ctSnapshot?.processes)
        ? ctSnapshot.processes
        : []
    ).reduce((map, item) => {
      const processKey = String(item?.processKey || '').trim();
      if (!processKey) return map;
      map.set(processKey, {
        stSeconds: toOptionalPositiveNumber(item?.stSeconds),
        ctSeconds: toOptionalPositiveNumber(
          item?.ctSeconds ??
            item?.agreedSeconds ??
            item?.requestedSeconds ??
            item?.proposedSeconds
        ),
      });
      return map;
    }, new Map());
    return processes.map((process, index) => {
      const processKey = String(
        process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
      );
      const processName =
        resolveLocalizedProcessName(process, languageCode) ||
        process?.code ||
        getUiMessage('assign.fallbackProcessName', 'Process {index}', languageCode, {
          index: index + 1,
        });
      const processQuantity = Math.max(1, toPositiveInt(process?.quantity, 1));
      const ptInfo = resolveProcessPtInfo(process, orderQuantity);
      const atSeconds = resolveProcessAtPerPieceSeconds(process, orderQuantity);
      const atReliability = resolveProcessAtReliability(process, orderQuantity);
      const baseStSeedInfo = resolveProcessStSeedSeconds({
        process,
        orderQuantity,
      });
      const savedSnapshotEntry = savedSnapshotByProcess.get(processKey) ?? null;
      const savedSnapshotStSeconds = savedSnapshotEntry?.stSeconds ?? null;
      const savedSnapshotCtSeconds = savedSnapshotEntry?.ctSeconds ?? null;
      const stDraftSeconds = toOptionalPositiveNumber(detailStDraftByProcess[processKey]);
      const ctDraftSeconds = toOptionalPositiveNumber(detailDraftByProcess[processKey]);
      const baseSeconds = stDraftSeconds ?? savedSnapshotStSeconds ?? baseStSeedInfo.seconds;
      const hasStDraftChange =
        stDraftSeconds != null &&
        Math.abs(stDraftSeconds - (savedSnapshotStSeconds ?? baseStSeedInfo.seconds)) > 1e-6;
      const proposedSeconds = ctDraftSeconds ?? savedSnapshotCtSeconds ?? baseSeconds;
      const savedSeconds = savedSnapshotCtSeconds ?? baseSeconds;
      const basePerPieceSeconds = baseSeconds * processQuantity;
      const proposedPerPieceSeconds = proposedSeconds * processQuantity;
      const savedPerPieceSeconds =
        savedSeconds == null ? null : savedSeconds * processQuantity;
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
        ctSeconds: proposedSeconds,
        hasStDraftChange,
        requestedSeconds: proposedSeconds,
        proposedSeconds,
        basePerPieceSeconds,
        requestedPerPieceSeconds: proposedPerPieceSeconds,
        proposedPerPieceSeconds,
        savedSeconds,
        savedPerPieceSeconds,
        totalBaseSeconds: basePerPieceSeconds * orderQuantity,
        totalRequestedSeconds: totalProposedSeconds,
        totalProposedSeconds,
        proposedUnitCost: resolveCtUnitCost(proposedSeconds, wagePerSecond),
        savedUnitCost: resolveCtUnitCost(savedSeconds, wagePerSecond),
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
    detailAssignment?.ctSnapshot,
    detailLine?.factoryWagePerSecond,
    detailLine?.wagePerSecond,
    languageCode,
    lineCapacityById,
  ]);
  const detailSummary = useMemo(() => {
    if (!detailCard) return null;
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
        : Number(detailAssignment?.totalSeconds || detailCard?.totalSeconds || 0) / orderQuantity;
    const totalSavedPerPieceSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce(
            (sum, row) => sum + (Number(row?.savedPerPieceSeconds) || 0),
            0
          )
        : Number(resolveAssignmentCtTotalSeconds(detailAssignment) || 0) / orderQuantity;
    const totalRequestedSeconds =
      detailProcessRows.length > 0
        ? detailProcessRows.reduce((sum, row) => sum + row.totalRequestedSeconds, 0)
        : Number(detailAssignment?.totalSeconds || detailCard?.totalSeconds || 0);
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
      totalSavedPerPieceSeconds,
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
  const detailStBucketQuantityLabel = useMemo(() => {
    const orderQuantity = Math.max(
      1,
      toPositiveInt(
        detailSummary?.orderQuantity ?? detailAssignment?.quantity ?? detailCard?.quantity ?? 1,
        1
      )
    );
    return formatStBucketQuantityLabel(resolveStBucketQuantity(orderQuantity), 'ko-KR');
  }, [detailSummary?.orderQuantity, detailAssignment?.quantity, detailCard?.quantity]);
  const detailHasSavedCtSnapshot = useMemo(
    () => hasSavedCtSnapshot(detailAssignment),
    [detailAssignment]
  );
  const detailCtDisplayState = useMemo(() => {
    if (!detailAssignment) return 'UNSAVED';
    return (
      assignmentCtDisplayStateById.get(String(detailAssignment.id)) ||
      (detailHasSavedCtSnapshot ? 'SAVED' : 'UNSAVED')
    );
  }, [assignmentCtDisplayStateById, detailAssignment, detailHasSavedCtSnapshot]);
  const detailCtIsSaved = detailCtDisplayState === 'SAVED';
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
      if (Boolean(contextMenuTargetAssignment?.isCompleted)) return true;
      return Number(contextMenuTargetAssignment.quantity ?? 0) <= 1;
    }
    if (!contextMenuTargetCard) return true;
    return Number(contextMenuTargetCard.quantity ?? 0) <= 1;
  }, [
    contextMenuState,
    contextMenuTargetAssignment,
    contextMenuTargetCard,
  ]);

  const handleContextMenuOpen = useCallback((payload) => {
    if (!persistReady || loading) return;
    if (!payload?.targetType || !payload?.id) return;
    setContextMenuState({
      targetType: payload.targetType,
      id: String(payload.id),
      mouseX: Number(payload.mouseX) || 0,
      mouseY: Number(payload.mouseY) || 0,
    });
  }, [loading, persistReady]);
  const handleSelectCard = useCallback((cardId) => {
    setSelectedCardId(cardId);
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
    blurActiveElement();
    setDetailState(null);
  }, [blurActiveElement]);
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
  }, [detailTargetKey]);

  const handleDragEnd = (event) => {
    if (!persistReady || loading) {
      setActiveDrag(null);
      return;
    }
    const { active, over } = event;
    if (!over) {
      if (String(active.id).startsWith('assign-')) {
        const assignmentId = String(active.id).replace('assign-', '');
        const targetAssignment = assignmentById.get(assignmentId);
        if (!targetAssignment?.isCompleted) {
          setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
        }
      }
      setActiveDrag(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('assign-')) {
      const movingAssignmentId = activeId.replace('assign-', '');
      const movingAssignment = assignmentById.get(movingAssignmentId);
      if (movingAssignment?.isCompleted) {
        setActiveDrag(null);
        return;
      }
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
        if (mergeAssignmentIntoCardTarget(targetCardId, assignmentId)) {
          setActiveDrag(null);
          return;
        }
      }
    }

    if (overId.startsWith('assign-drop-')) {
      const targetId = overId.replace('assign-drop-', '');
      const targetAssignment = assignmentById.get(targetId);
      if (targetAssignment?.isCompleted) {
        setActiveDrag(null);
        return;
      }
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
      const detectedId = overId.replace('assign-drop-', '');
      const detectedAssignment = assignmentById.get(detectedId) ?? null;
      if (detectedAssignment) {
        // lineId는 dnd-kit 감지 카드에서 가져옴 (라인 판별은 정확)
        lineId = detectedAssignment.lineId;

        // 자신의 droppable 위에 드롭한 경우: drag delta로 날짜 추정
        if (activeId.startsWith('assign-') && detectedId === activeId.replace('assign-', '')) {
          const dayDelta = Math.round(event.delta.x / ASSIGN_TIMELINE_CELL_WIDTH);
          dayIndex = Math.max(0, detectedAssignment.startIndex + dayDelta);
          targetOnDay = null;
        } else {
          // 커서 위치 기반 dayIndex 계산
          // overRect + detectedAssignment.startIndex로 grid 기준 절대 위치 복원
          const overRect = event.over?.rect;
          const activator = event.activatorEvent;
          const pointerX =
            activator && typeof activator.clientX === 'number'
              ? activator.clientX + event.delta.x
              : null;
          if (overRect && pointerX != null) {
            // detected 카드 범위에 클램핑하지 않고 커서의 실제 날짜 계산
            const spanDays = Math.max(detectedAssignment.endIndex - detectedAssignment.startIndex + 1, 1);
            const relPos = (pointerX - overRect.left) / Math.max(overRect.width, 1);
            const dayOffset = Math.floor(relPos * spanDays);
            dayIndex = Math.max(0, detectedAssignment.startIndex + dayOffset);
          } else {
            dayIndex = detectedAssignment.startIndex;
          }
          // 커서 위치 기준으로 실제 타겟 카드 재탐색 (인디케이터와 동일한 로직)
          targetOnDay = getTargetOnDay(assignments, lineId, dayIndex);
          if (targetOnDay) {
            // 타겟 카드 기준 앞/뒤 판단 (day index 중점 비교)
            const cardMidDay = (targetOnDay.startIndex + targetOnDay.endIndex + 1) / 2;
            dropBeforeTarget = dayIndex < cardMidDay;
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
    if (targetOnDay?.isCompleted) {
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
      if (!isCardManualOrderLocked(card)) {
        showNotification(
          getUiMessage(
            'assign.dragRequiresOrderManualLock',
            languageCode === 'vi'
              ? 'Chi co the phan cong tren lich khi don hang da duoc khoa thu cong.'
              : languageCode === 'en'
                ? 'Scheduling is allowed only when the order is manually locked.'
                : '주문을 수동 잠금한 상태에서만 스케줄 배정이 가능합니다.',
            languageCode
          ),
          'warning'
        );
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
        contractedSeconds: null,
        ctSnapshot: null,
        color: colors.color,
        stripeColor: colors.stripe,
        totalSeconds,
        startDateKey: days[dayIndex]?.key,
        endDateKey: days[dayIndex]?.key,
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
            syncAssignmentDateKeys(
              {
                ...newItem,
                ...planned,
              },
              startDateRef.current
            ),
          ]);
          setActiveDrag(null);
          return;
        }

        const nextAssignment = getNextAssignmentAfterDay(assignments, lineId, dayIndex);
        if (nextAssignment && !nextAssignment.isCompleted) {
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
        if (target?.isCompleted) return prev;

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
            return filtered.concat(
              syncAssignmentDateKeys(
                {
                  ...target,
                  lineId,
                  ...planned,
                },
                startDateRef.current
              )
            );
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
          if (nextAssignment && !nextAssignment.isCompleted) insertBeforeId = nextAssignment.id;
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

  const handleLinkPrev = useCallback((assignmentId) => {
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
  }, [days, lineCapacityById]);

  const promptSplitQuantity = useCallback((quantity) => {
    if (!quantity || quantity <= 1) return null;
    const input = window.prompt(
      getUiMessage(
        'assign.splitQuantityPrompt',
        'Enter the quantity to split (1 to {max})',
        languageCode,
        { max: quantity - 1 }
      )
    );
    if (input == null) return null;
    const value = Number(input);
    if (!Number.isFinite(value)) return null;
    const qty = Math.floor(value);
    if (qty <= 0 || qty >= quantity) return null;
    return qty;
  }, [languageCode]);

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

  const getAssignmentOriginId = (assignment) => {
    if (!assignment) return null;
    if (assignment.originOrderId) return assignment.originOrderId;
    const card = cardById.get(assignment.cardId);
    return getCardOriginId(card) ?? assignment.cardId ?? assignment.id;
  };

  const buildCardFromAssignment = (assignment) => {
    const card = cardById.get(assignment.cardId);
    if (card) return card;
    const basis = assignment.basis || 'PT';
    return {
      id: assignment.cardId ?? assignment.id,
      originOrderId: assignment.originOrderId ?? assignment.cardId ?? assignment.id,
      styleName: assignment.label || getUiMessage('assign.styleLabel', 'Style', languageCode),
      colorName: assignment.colorName || '',
      gender: normalizeGenderKey(assignment.gender),
      quantity: assignment.quantity ?? 0,
      totalSeconds: assignment.totalSeconds ?? 0,
      totalPt: basis === 'PT' ? assignment.totalSeconds ?? 0 : 0,
      totalAt: basis === 'AT' ? assignment.totalSeconds ?? 0 : 0,
      totalSt: basis === 'ST' ? assignment.totalSeconds ?? 0 : 0,
      status: basis === 'ST' ? 'ST' : basis === 'PT' || basis === 'CT' ? 'PT' : 'NONE',
      isManualOrderLocked: true,
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
    if (getAssignmentOriginId(target) !== getCardOriginId(sourceCard)) return false;

    const addedSeconds = resolveCardTotalSeconds(sourceCard);
    const mergedSeconds = (target.totalSeconds ?? 0) + addedSeconds;
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
    if (getAssignmentOriginId(target) !== getAssignmentOriginId(source)) return false;

    const sourceCard = buildCardFromAssignment(source);
    const addedSeconds = resolveCardTotalSeconds(sourceCard);
    const mergedSeconds = (target.totalSeconds ?? 0) + addedSeconds;
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

  const handleResetAssignments = useCallback(() => {
    if (!persistReady || !isDirty) return;
    const confirmed = window.confirm(
      getUiMessage(
        'assign.resetConfirm',
        'Restore unsaved assignment changes to the last saved state?',
        languageCode
      )
    );
    if (!confirmed) return;
    const restored = applyBoardSnapshotText(lastSavedSnapshotRef.current);
    if (!restored) {
      showNotification(
        getUiMessage(
          'assign.resetFailed',
          'Failed to restore the last saved state. Refresh the page and try again.',
          languageCode
        ),
        'error'
      );
      return;
    }
    showNotification(
      getUiMessage('assign.resetSuccess', 'Restored the last saved state.', languageCode),
      'info'
    );
  }, [applyBoardSnapshotText, isDirty, languageCode, persistReady, showNotification]);

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

  const applyViewRange = useCallback(
    (nextStart, nextEnd) => {
      const normalizedStart = new Date(nextStart);
      normalizedStart.setHours(0, 0, 0, 0);
      const normalizedEnd = new Date(nextEnd);
      normalizedEnd.setHours(0, 0, 0, 0);

      if (normalizedStart > normalizedEnd) return false;
      if (
        normalizedStart.getTime() === viewStart.getTime() &&
        normalizedEnd.getTime() === viewEnd.getTime()
      ) {
        return true;
      }

      setViewStart(normalizedStart);
      setViewEnd(normalizedEnd);
      return true;
    },
    [viewEnd, viewStart]
  );

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
      applyViewRange(s, cappedEnd);
      return;
    }
    applyViewRange(s, e);
  };
  const handleViewEndChange = (newEnd) => {
    const e = new Date(newEnd); e.setHours(0,0,0,0);
    const s = new Date(viewStart);
    if (e < s) return;
    const range = Math.round((e - s) / 86400000) + 1;
    if (range > MAX_RANGE_DAYS) return;
    applyViewRange(s, e);
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
    applyViewRange(newStart, newEnd);
  };
  // M+ : 다음달 전체 (from 기준)
  const handleMonthPlus = () => {
    const newStart = toMonthStart(viewStart); newStart.setMonth(newStart.getMonth() + 1);
    const newEnd   = toMonthEnd(newStart);
    applyViewRange(newStart, newEnd);
  };
  const controlsDisabled = persisting || loading;

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {getUiMessage('assign.pageTitle', '작업 배정', languageCode)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LastUpdaterLabel />
            <SaveButton
              onMouseDown={preventToolbarButtonFocus}
              onClick={handleSaveBoard}
              disabled={persisting || !persistReady || !isDirty}
              loading={persisting}
              sx={{ minWidth: 72 }}
            />
          </Stack>
        </Box>
      }
    >
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        autoScroll={false}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
            mb: 1.5,
          }}
        >
          <SearchInput
            placeholder={getUiMessage(
              'assign.searchPlaceholder',
              '스타일/고객사/색상 검색',
              languageCode
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 320 } }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
            <Button
              variant="outlined"
              onMouseDown={preventToolbarButtonFocus}
              onClick={handleUndo}
              disabled={controlsDisabled || historyStatus.undoCount === 0}
            >
              {getUiMessage('common.undo', '되돌리기', languageCode)}
            </Button>
            <Button
              variant="outlined"
              onMouseDown={preventToolbarButtonFocus}
              onClick={handleRedo}
              disabled={controlsDisabled || historyStatus.redoCount === 0}
            >
              {getUiMessage('common.redo', '다시하기', languageCode)}
            </Button>
            <Button
              variant="outlined"
              onMouseDown={preventToolbarButtonFocus}
              onClick={handleResetAssignments}
              disabled={controlsDisabled || !persistReady || !isDirty}
            >
              {getUiMessage('common.reset', '초기화', languageCode)}
            </Button>
          </Stack>
        </Box>
        {unlockedUnassignedCardCount > 0 ? (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {getUiMessage(
              'assign.manualLockRequiredForSchedulingBanner',
              languageCode === 'vi'
                ? `Co ${unlockedUnassignedCardCount} the chua khoa thu cong. Chi co the phan cong tren lich sau khi khoa don hang.`
                : languageCode === 'en'
                  ? `${unlockedUnassignedCardCount} cards are from unlocked orders. Lock the order manually before scheduling.`
                  : `수동 잠금되지 않은 주문 카드가 ${unlockedUnassignedCardCount}건 있습니다. 주문을 수동 잠금한 뒤 스케줄 배정을 진행해 주세요.`,
              languageCode
            )}
          </Alert>
        ) : null}
        <Grid container spacing={2} sx={{ minWidth: 0 }}>
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <UnassignedCardGroupsPanel
              filteredCardCount={filteredCards.length}
              groupedFilteredCards={groupedFilteredCards}
              filteredUnassignedQuantity={filteredUnassignedQuantity}
              filteredOrderTotalQuantity={filteredOrderTotalQuantity}
              loading={loading}
              selectedCardId={selectedCardId}
              languageCode={languageCode}
              onSelectCard={handleSelectCard}
              onOpenContextMenu={handleContextMenuOpen}
              onDisabledCardDragAttempt={handleDisabledCardDragAttempt}
            />
          </Grid>
          <Grid item xs={12} md={8} sx={{ minWidth: 0 }}>
            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">
                  {getUiMessage('assign.lineTimeline', '라인 타임라인', languageCode)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CustomDatePicker
                    value={viewStart}
                    onChange={(val) => { if (val?.isValid?.()) handleViewStartChange(val.toDate()); }}
                    disabled={controlsDisabled}
                  />
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mx: 0.25 }}>~</Typography>
                  <CustomDatePicker
                    value={viewEnd}
                    onChange={(val) => { if (val?.isValid?.()) handleViewEndChange(val.toDate()); }}
                    disabled={controlsDisabled}
                  />
                  <Stack sx={{ gap: '2px' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleMonthPlus}
                      disabled={controlsDisabled}
                      sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                    >
                      M+
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleMonthMinus}
                      disabled={controlsDisabled}
                      sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                    >
                      M-
                    </Button>
                  </Stack>
                </Box>
              </Box>
              <ScheduleTimeline
                lines={lines}
                days={days}
                dayCount={dayCount}
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
                {activeDrag.orderNo
                  ? activeDrag.orderNo
                  : getUiMessage('assign.dragOverlayFallback', 'Unassigned Card', languageCode)}
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
          <MenuItem onClick={handleContextOpenDetail} disabled={controlsDisabled}>
            {getUiMessage('assign.contextOpenDetail', 'Open Detail', languageCode)}
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleContextSplit} disabled={controlsDisabled || contextSplitDisabled}>
            {getUiMessage('assign.contextSplitQuantity', 'Split Quantity', languageCode)}
          </MenuItem>
        </Menu>

        <Drawer
          anchor="right"
          open={Boolean(detailState)}
          onClose={handleCloseDetail}
          PaperProps={{
            sx: {
              ...TOP_OFFSET_DRAWER_PAPER_SX,
              width: { xs: '100%', md: '72%' },
              p: 2.5,
              overflowY: 'auto',
            },
          }}
        >
          <Stack spacing={1.5}>
            <Box
              sx={{
                position: 'sticky',
                top: (theme) => theme.spacing(-2.5),
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                py: 0.5,
                backgroundColor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                {getUiMessage('assign.detailTitle', 'Assignment Detail', languageCode)}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  size="small"
                  color="inherit"
                  onClick={handleCloseDetail}
                  disabled={controlsDisabled}
                >
                  {getUiMessage('common.close', 'Close', languageCode)}
                </Button>
                <IconButton
                  size="small"
                  onClick={handleCloseDetail}
                  disabled={controlsDisabled}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            {!detailCard ? (
              <Typography variant="body2" color="text.secondary">
                {getUiMessage(
                  'assign.detailNotFound',
                  'The selected card could not be found.',
                  languageCode
                )}
              </Typography>
            ) : (
              <>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.customerLabel', 'Customer', languageCode)}:</strong>{' '}
                      {detailCard.customer || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.styleLabel', 'Style', languageCode)}:</strong>{' '}
                      {detailCard.styleName || '-'}
                      {detailCard.colorName ? ` · ${detailCard.colorName}` : ''}
                      {detailCard.gender
                        ? ` · ${getGenderLabel(detailCard.gender, detailCard.gender, languageCode)}`
                        : ''}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.quantityLabel', 'Quantity', languageCode)}:</strong>{' '}
                      {formatNumberWithCommas(
                        detailAssignment?.quantity ?? detailCard.quantity ?? 0,
                        { fallback: '-', maximumFractionDigits: 0 }
                      )}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.lineLabel', 'Line', languageCode)}:</strong>{' '}
                      {detailLine?.name || '-'}
                    </Typography>
                    {detailAssignment && (
                      <>
                        <Typography variant="body2">
                          <strong>{getUiMessage('assign.savedCtLabel', 'Saved CT', languageCode)}:</strong>{' '}
                          <Chip
                            size="small"
                            label={getUiMessage(
                              detailCtIsSaved ? 'assign.savedState' : 'assign.unsavedState',
                              detailCtIsSaved ? 'Saved' : 'Unsaved',
                              languageCode
                            )}
                            color={detailCtIsSaved ? 'primary' : 'default'}
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        </Typography>
                        <Typography variant="body2">
                          <strong>{getUiMessage('assign.updatedByLabel', 'Last Saved By', languageCode)}:</strong>{' '}
                          {resolveAssignmentCtUpdatedBy(detailAssignment) || '-'}
                          {' · '}
                          {formatDateTimeLabel(
                            resolveAssignmentCtUpdatedAt(detailAssignment),
                            '-',
                            languageCode
                          )}
                        </Typography>
                      </>
                    )}
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    {getUiMessage('assign.ctCostSummary', 'CT / Cost Summary', languageCode)}
                  </Typography>
                  <Stack spacing={0.6}>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.processStSumPerPiece', 'Process ST Total (per piece)', languageCode)}:</strong>{' '}
                      {formatSecondsLabel(detailSummary?.totalBasePerPieceSeconds, '-', languageCode)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.processInputCtSumPerPiece', 'Entered CT Total (per piece)', languageCode)}:</strong>{' '}
                      {formatSecondsLabel(
                        detailSummary?.totalRequestedPerPieceSeconds,
                        '-',
                        languageCode
                      )}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.processInputCtSumTotal', 'Entered CT Total (all qty)', languageCode)}:</strong>{' '}
                      {formatSecondsLabel(detailSummary?.totalRequestedSeconds, '-', languageCode)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.divergenceLabel', 'Variance', languageCode)}:</strong>{' '}
                      {detailSummary?.divergencePercent == null
                        ? '-'
                        : `${detailSummary.divergencePercent > 0 ? '+' : ''}${detailSummary.divergencePercent.toFixed(1)}%`}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.expectedDurationLabel', 'Expected Duration', languageCode)}:</strong>{' '}
                      {formatDaysLabel(detailSummary?.totalDurationDays, '-', languageCode)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{getUiMessage('assign.expectedCostLabel', 'Expected Cost', languageCode)}:</strong>{' '}
                      {detailSummary?.expectedCost == null
                        ? '-'
                        : formatCurrencyDong(detailSummary.expectedCost, languageCode)}
                    </Typography>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    {getUiMessage('assign.processCtDetail', 'Process CT Detail', languageCode)}
                  </Typography>
                  {detailStyleLoading ? (
                    <Box
                      sx={{
                        minHeight: 160,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CircularProgress size={28} />
                    </Box>
                  ) : detailProcessRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {getUiMessage(
                        'assign.processDataUnavailable',
                        'Process data is not available, so CT detail cannot be shown.',
                        languageCode
                      )}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell align="right">#</TableCell>
                            <TableCell>{getUiMessage('assign.processLabel', 'Process', languageCode)}</TableCell>
                            <TableCell align="right">{`PT(${PT_REFERENCE_QUANTITY_LABEL})`}</TableCell>
                            <TableCell align="right">{`AT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`ST(${detailStBucketQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`CT(${detailQuantityLabel})`}</TableCell>
                            <TableCell align="right">
                              {getUiMessage('assign.unitCostDong', 'Unit Cost (dong)', languageCode)}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detailProcessRows.map((row, index) => (
                            <TableRow key={row.processKey}>
                              <TableCell align="right">{index + 1}</TableCell>
                              <TableCell>
                                {formatProcessNameWithQuantity(
                                  row.processName,
                                  row.processQuantity
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {row.ptSeconds == null ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {getUiMessage('assign.noData', 'No data', languageCode)}
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
                                <TextField
                                  value={
                                    Object.prototype.hasOwnProperty.call(
                                      detailStDraftByProcess,
                                      row.processKey
                                    )
                                      ? detailStDraftByProcess[row.processKey]
                                      : toCtInputText(row.baseSeconds)
                                  }
                                  onChange={(event) =>
                                    handleDetailStDraftInput(row.processKey, event.target.value)
                                  }
                                  size="small"
                                  placeholder="-"
                                  inputProps={{ inputMode: 'decimal' }}
                                  sx={{
                                    width: 100,
                                    '& .MuiInputBase-input': {
                                      textAlign: 'right',
                                      py: 0.5,
                                      fontSize: '0.8125rem',
                                    },
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <TextField
                                  value={
                                    Object.prototype.hasOwnProperty.call(
                                      detailDraftByProcess,
                                      row.processKey
                                    )
                                      ? detailDraftByProcess[row.processKey]
                                      : toCtInputText(row.ctSeconds)
                                  }
                                  onChange={(event) =>
                                    handleDetailDraftInput(row.processKey, event.target.value)
                                  }
                                  size="small"
                                  placeholder="-"
                                  inputProps={{ inputMode: 'decimal' }}
                                  sx={{
                                    width: 100,
                                    '& .MuiInputBase-input': {
                                      textAlign: 'right',
                                      py: 0.5,
                                      fontSize: '0.8125rem',
                                    },
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                {detailSummary?.wagePerSecond == null ? (
                                  '-'
                                ) : (
                                  row.proposedUnitCost == null
                                    ? '-'
                                    : formatCurrencyDong(row.proposedUnitCost, languageCode)
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={4} align="left" sx={{ fontWeight: 700 }}>
                              {getUiMessage(
                                'assign.processSumPerPiece',
                                'Process Total (per piece)',
                                languageCode
                              )}
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
                              {detailSummary?.wagePerSecond == null ? (
                                '-'
                              ) : detailSummary?.totalRequestedPerPieceSeconds != null &&
                                detailSummary.totalRequestedPerPieceSeconds > 0 ? (
                                formatCurrencyDong(
                                  detailSummary.totalRequestedPerPieceSeconds *
                                    detailSummary.wagePerSecond,
                                  languageCode
                                )
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {languageCode === 'ko'
                      ? '저장하면 현재 입력한 ST/CT 값으로 snapshot이 저장됩니다.'
                      : languageCode === 'vi'
                        ? 'Khi luu, ST/CT vua nhap se duoc luu vao snapshot.'
                        : 'When you save the assignment, the current ST/CT inputs are stored in the snapshot.'}
                  </Typography>
                </Paper>
              </>
            )}
          </Stack>
        </Drawer>
        {cursorWarningState.open ? (
          <Box
            sx={{
              position: 'fixed',
              left: cursorWarningState.x,
              top: cursorWarningState.y,
              transform: 'translate(-6px, -100%)',
              zIndex: 1400,
              px: 1.25,
              py: 0.75,
              borderRadius: 1.5,
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              color: '#FFFFFF',
              boxShadow: '0 8px 20px rgba(2, 6, 23, 0.35)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {cursorWarningState.message}
          </Box>
        ) : null}
      </DndContext>
    </AppPageContainer>
  );
};

export default AssignBoard;
