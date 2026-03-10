import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
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
import CustomDatePicker from '../../../components/CustomDatePicker';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  normalizeProcesses,
  resolveProcessAtPerPieceSeconds,
  resolveProcessAtReliability,
  resolveProcessExactStPerPieceSeconds,
} from '../../../utils/processTime';
import { loadHolidays } from '../../../utils/localData';
import { ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT } from '../../../constants/timeThresholds';
import {
  ASSIGNMENT_CT_STATUS_DEFAULT_LABELS,
  getAssignmentCtStatusLabel,
  normalizeAssignmentCtStatus,
} from '../../../constants/assignmentStatus';

const STATUS_META = {
  PENDING:  { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.PENDING, color: 'default' },
  SENT:     { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.SENT, color: 'info' },
  AGREED:   { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.AGREED, color: 'success' },
  REJECTED: { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.REJECTED, color: 'warning' },
};
const CALENDAR_CT_STATUS_META = {
  PENDING:  { cardBg: '#EBEBF0', labelColor: '#888898', borderColor: 'rgba(136, 136, 152, 0.35)' },
  SENT:     { cardBg: '#BFEAD0', labelColor: '#3A9858', borderColor: 'rgba(58, 152, 88, 0.35)' },
  AGREED:   { cardBg: '#C8DFF7', progressBg: '#88B8E8', labelColor: '#4A88C8', borderColor: 'rgba(74, 136, 200, 0.4)' },
  REJECTED: { cardBg: '#F7DCC8', labelColor: '#C07838', borderColor: 'rgba(192, 120, 56, 0.35)' },
};
const CALENDAR_BAR_HEIGHT = 64;
const CALENDAR_BAR_GAP = 6;
const CALENDAR_LANE_EPSILON = 1e-4;
const PT_REFERENCE_QUANTITY_LABEL = DEFAULT_TIME_REF_QUANTITY.toLocaleString('ko-KR');
const resolveCtStatusChipSx = (status) => {
  const meta = CALENDAR_CT_STATUS_META[status] || CALENDAR_CT_STATUS_META.PENDING;
  return {
    bgcolor: meta.cardBg,
    color: meta.labelColor,
    borderColor: meta.borderColor,
    fontWeight: 700,
  };
};
const CT_INPUT_REGEX = /^\d*(?:\.\d{0,2})?$/;
const normalizeCtStatus = (value) => normalizeAssignmentCtStatus(value);
const isAssignmentVersionConflictError = (error) => {
  const status = Number(error?.status);
  const message = String(error?.message || '').toLowerCase();
  return status === 409 && message.includes('assignment version conflict');
};
const resolveBoardSaveErrorMessage = (error, fallbackMessage) => {
  if (isAssignmentVersionConflictError(error)) {
    return '다른 사용자가 먼저 수정했습니다. 최신 상태를 반영했어요. 다시 시도해 주세요.';
  }
  const raw = String(error?.message || '').trim();
  if (raw.toLowerCase().includes('assignment version conflict')) {
    return '다른 사용자가 먼저 수정했습니다. 최신 상태를 반영했어요. 다시 시도해 주세요.';
  }
  return raw || fallbackMessage;
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

const formatScheduleDate = (baseDate, dayIndex) => {
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + toNonNegativeInt(dayIndex, 0));
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][target.getDay()];
  return `${target.getMonth() + 1}/${target.getDate()} (${weekday})`;
};

const parseDateKey = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value.trim() + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatScheduleDateValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`;
};

const resolveAssignmentScheduleBounds = (assignment, baseDate) => {
  if (!assignment) return null;

  const startDateFromKey = parseDateKey(assignment?.startDateKey);
  const endDateFromKey = parseDateKey(assignment?.endDateKey);
  const hasStartIndex = Number.isFinite(Number(assignment?.startIndex));
  const hasEndIndex = Number.isFinite(Number(assignment?.endIndex));
  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));

  const startDate = startDateFromKey || (hasStartIndex ? toScheduleDate(baseDate, startIndex) : null);
  if (!startDate) return null;

  let endDate = endDateFromKey;
  if (!endDate) {
    if (startDateFromKey && hasEndIndex) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.max(0, endIndex - startIndex));
    } else if (hasEndIndex) {
      endDate = toScheduleDate(baseDate, endIndex);
    } else {
      endDate = new Date(startDate);
    }
  }

  if (Number.isNaN(endDate.getTime()) || endDate < startDate) {
    endDate = new Date(startDate);
  }

  return {
    startDate,
    endDate,
    startKey: buildDateKey(startDate),
    endKey: buildDateKey(endDate),
  };
};

const syncAssignmentScheduleDateKeys = (assignment, baseDate) => {
  if (!assignment || typeof assignment !== 'object') return assignment;
  const bounds = resolveAssignmentScheduleBounds(assignment, baseDate);
  if (!bounds) return assignment;
  return {
    ...assignment,
    startDateKey: bounds.startKey,
    endDateKey: bounds.endKey,
  };
};

const buildAssignmentSchedulePatch = (assignment, baseDate) => {
  const synced = syncAssignmentScheduleDateKeys(assignment, baseDate);
  if (!synced || typeof synced !== 'object') return null;

  const startIndex = toSignedInt(synced?.startIndex, 0);
  const endIndex = Math.max(startIndex, toSignedInt(synced?.endIndex, startIndex));
  const startDateKey =
    typeof synced?.startDateKey === 'string' && synced.startDateKey.trim()
      ? synced.startDateKey.trim()
      : null;
  const endDateKey =
    typeof synced?.endDateKey === 'string' && synced.endDateKey.trim()
      ? synced.endDateKey.trim()
      : startDateKey;

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: Number(synced?.startDayOffsetPercent) || 0,
    startDayPercent: Number(synced?.startDayPercent) || 100,
    endDayPercent: Number(synced?.endDayPercent) || 100,
    startDateKey,
    endDateKey,
  };
};

const formatScheduleRange = (baseDate, assignment) => {
  const bounds = resolveAssignmentScheduleBounds(assignment, baseDate);
  if (!bounds) return '-';
  if (bounds.startKey === bounds.endKey) {
    return formatScheduleDateValue(bounds.startDate);
  }
  return `${formatScheduleDateValue(bounds.startDate)} ~ ${formatScheduleDateValue(bounds.endDate)}`;
};

const resolveSecondsForProposal = (assignment) => {
  const proposalSeconds = Number(assignment?.proposalSeconds);
  if (Number.isFinite(proposalSeconds) && proposalSeconds > 0) return proposalSeconds;
  const totalSeconds = Number(assignment?.totalSeconds);
  if (Number.isFinite(totalSeconds) && totalSeconds > 0) return totalSeconds;
  return 0;
};

const resolveAgreedSeconds = (assignment) => {
  const contractedSeconds = Number(assignment?.contractedSeconds);
  if (Number.isFinite(contractedSeconds) && contractedSeconds > 0) return contractedSeconds;
  return resolveSecondsForProposal(assignment);
};

const formatCurrencyDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} 동`;

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
const resolveCtUnitCost = (seconds, wagePerSecond) => {
  const resolvedSeconds = Number(seconds);
  const resolvedWage = Number(wagePerSecond);
  if (!Number.isFinite(resolvedSeconds) || resolvedSeconds <= 0) return null;
  if (!Number.isFinite(resolvedWage) || resolvedWage <= 0) return null;
  return resolvedSeconds * resolvedWage;
};

const resolveProcessAtSeconds = (process, orderQuantity = 1) => {
  const perPieceSeconds = resolveProcessAtPerPieceSeconds(process, orderQuantity);
  return Number.isFinite(perPieceSeconds) && perPieceSeconds > 0
    ? perPieceSeconds
    : null;
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
  proposalStSeconds = null,
}) => {
  const proposal = toOptionalPositiveNumber(proposalStSeconds);
  if (proposal != null) return { seconds: proposal, source: 'ST' };

  const manualSt = toOptionalPositiveNumber(
    resolveProcessExactStPerPieceSeconds(process, orderQuantity)
  );
  if (manualSt != null) return { seconds: manualSt, source: 'ST' };

  const ptInfo = resolveProcessPtInfo(process, orderQuantity);
  if (ptInfo.seconds != null) return { seconds: ptInfo.seconds, source: 'PT' };

  return { seconds: 0, source: 'NONE' };
};

const calcDivergencePercent = (current, base) => {
  const currentValue = Number(current);
  const baseValue = Number(base);
  if (!Number.isFinite(currentValue) || !Number.isFinite(baseValue) || baseValue <= 0) {
    return null;
  }
  return ((currentValue - baseValue) / baseValue) * 100;
};

const formatSecondsLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}` + '초';
};

const formatDaysLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })}` + '일';
};

const formatPercentLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(1)}%`;
};

const buildAssignmentProgressMap = (rows) =>
  new Map(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => String(row?.id || '').trim())
      .map((row) => [
        String(row.id),
        {
          baselineQuantity:
            Number.isFinite(Number(row?.baselineQuantity)) && Number(row.baselineQuantity) > 0
              ? Number(row.baselineQuantity)
              : null,
          producedQuantity: Math.max(0, Number(row?.producedQuantity) || 0),
          overflowQuantity: Math.max(0, Number(row?.overflowQuantity) || 0),
          progressPercent:
            Number.isFinite(Number(row?.progressPercent)) && Number(row.progressPercent) >= 0
              ? Number(row.progressPercent)
              : null,
        },
      ])
  );

const resolveLineDailyCapacitySeconds = (line, headcount) => {
  const directCapacity = Number(line?.dailyCapacitySeconds);
  if (Number.isFinite(directCapacity) && directCapacity > 0) {
    return Math.round(directCapacity);
  }
  return Math.max(1, toPositiveInt(headcount, 1)) * 8 * 60 * 60;
};

const buildDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toScheduleDate = (baseDate, dayIndex) => {
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() + toNonNegativeInt(dayIndex, 0));
  return date;
};

const toMonthStart = (date) => {
  const target = new Date(date);
  target.setDate(1);
  target.setHours(0, 0, 0, 0);
  return target;
};

const addMonths = (date, amount) => {
  const target = new Date(date);
  target.setMonth(target.getMonth() + amount);
  return toMonthStart(target);
};

const isSameMonth = (left, right) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const formatMonthLabel = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const buildMonthlyCalendarDays = (monthDate) => {
  const monthStart = toMonthStart(monthDate);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthStart.getMonth() + 1);
  monthEnd.setDate(0);

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const days = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }
  return days;
};

const getClipBorderRadius = (isClippedLeft, isClippedRight) => {
  const topLeft = isClippedLeft ? 0 : 8;
  const topRight = isClippedRight ? 0 : 8;
  const bottomRight = isClippedRight ? 0 : 8;
  const bottomLeft = isClippedLeft ? 0 : 8;
  return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
};

const diffCalendarDays = (targetDate, baseDate) => {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return 0;
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) return 0;
  const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const baseUtc = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  return Math.round((targetUtc - baseUtc) / (24 * 60 * 60 * 1000));
};

const resolveBarPercentUnit = (value, fallbackPercent = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackPercent / 100;
  return parsed / 100;
};

const buildCalendarAssignmentRange = (assignment, baseDate, weekStartDate) => {
  const bounds = resolveAssignmentScheduleBounds(assignment, baseDate);
  if (!bounds) return null;

  const startOffset = resolveBarPercentUnit(assignment?.startDayOffsetPercent, 0);
  const startPercent = resolveBarPercentUnit(assignment?.startDayPercent, 100);
  const endPercent = resolveBarPercentUnit(assignment?.endDayPercent, 100);
  const startDayIndex = diffCalendarDays(bounds.startDate, weekStartDate);
  const endDayIndex = diffCalendarDays(bounds.endDate, weekStartDate);

  if (bounds.startKey === bounds.endKey) {
    const start = startDayIndex + startOffset;
    return {
      bounds,
      start,
      end: start + startPercent,
    };
  }

  const fullDays = Math.max(endDayIndex - startDayIndex - 1, 0);
  const start = startDayIndex + startOffset;
  return {
    bounds,
    start,
    end: start + startPercent + fullDays + endPercent,
  };
};

const assignCalendarLanes = (items) => {
  const laneEndByIndex = [];
  return items.map((item) => {
    let laneIndex = 0;
    while (laneIndex < laneEndByIndex.length) {
      if (item.startUnit >= laneEndByIndex[laneIndex] - CALENDAR_LANE_EPSILON) break;
      laneIndex += 1;
    }
    laneEndByIndex[laneIndex] = item.endUnit;
    return {
      ...item,
      laneIndex,
    };
  });
};

const CalendarAssignmentBar = ({
  assignment,
  startUnit,
  endUnit,
  laneIndex,
  statusMeta,
  isSelected,
  isClippedLeft,
  isClippedRight,
  onClick,
}) => {
  const ctStatus = normalizeCtStatus(assignment?.status ?? assignment?.ctStatus);
  const ctLabel = STATUS_META[ctStatus]?.label || STATUS_META.PENDING.label;
  const previewUrl =
    assignment?.previewUrl ||
    assignment?.imageUrl ||
    assignment?.thumbnailUrl ||
    '';
  const progressPercent = ctStatus === 'AGREED'
    ? Math.min(100, Math.max(0, Number(assignment?.progress?.progressPercent) || 0))
    : 0;
  const spanUnits = Math.max(0, endUnit - startUnit);
  const isCompact = spanUnits < 0.95;
  const isNarrow = spanUnits < 1.32;
  const hideMetaBadges = spanUnits < 1.56;
  const hideSecondary = spanUnits < 0.8;
  const widthPct = ((spanUnits / 7) * 100).toFixed(4);
  const leftPct = ((startUnit / 7) * 100).toFixed(4);
  const lineName = assignment?.line?.name || `라인 ${assignment?.lineId || '-'}`;
  const orderNo =
    assignment?.orderNo ||
    assignment?.orderNumber ||
    assignment?.card?.orderNo ||
    assignment?.card?.orderNumber ||
    '';
  const customer =
    assignment?.customer ||
    assignment?.customerName ||
    assignment?.card?.customer ||
    assignment?.card?.customerName ||
    '-';
  const quantityLabel = assignment?.quantity != null
    ? `수량 ${formatNumberWithCommas(assignment.quantity, {
        fallback: '0',
        maximumFractionDigits: 0,
      })}`
    : '';
  const line1 = orderNo ? `${customer} · ${orderNo}` : customer || lineName;
  const line2 = [
    assignment?.label || '-',
    assignment?.colorName || '',
    assignment?.gender || '',
    quantityLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  const durationLabel = formatDaysLabel(assignment?.workingDays, '');

  return (
    <Box
      onClick={onClick}
      title={[lineName, line1, line2].filter(Boolean).join(' | ')}
      sx={{
        position: 'absolute',
        top: CALENDAR_BAR_GAP + laneIndex * (CALENDAR_BAR_HEIGHT + CALENDAR_BAR_GAP),
        left: `${leftPct}%`,
        width: widthPct === '0.0000' ? '0' : `${widthPct}%`,
        height: CALENDAR_BAR_HEIGHT,
        boxSizing: 'border-box',
        borderRadius: getClipBorderRadius(isClippedLeft, isClippedRight),
        backgroundColor: statusMeta.cardBg,
        color: '#1f2a3a',
        border: '1px solid',
        borderColor: isSelected ? statusMeta.labelColor : statusMeta.borderColor,
        borderLeft: isClippedLeft
          ? '2px dashed rgba(0,0,0,0.22)'
          : `1px solid ${isSelected ? statusMeta.labelColor : statusMeta.borderColor}`,
        borderRight: isClippedRight
          ? '2px dashed rgba(0,0,0,0.22)'
          : `1px solid ${isSelected ? statusMeta.labelColor : statusMeta.borderColor}`,
        boxShadow: isSelected
          ? `inset 0 0 0 1px ${statusMeta.labelColor}, 0 2px 6px rgba(0,0,0,0.12)`
          : '0 1px 4px rgba(0,0,0,0.10)',
        px: isNarrow ? 1 : 1.5,
        pl: isClippedLeft ? 2.5 : isNarrow ? 1 : 1.5,
        pr: isClippedRight ? 2.5 : isNarrow ? 1 : 6,
        display: 'flex',
        alignItems: 'center',
        gap: isNarrow ? 1 : 1.5,
        overflow: 'visible',
        cursor: 'pointer',
        zIndex: isSelected ? 3 : 2,
        '&:hover': {
          opacity: 0.9,
          zIndex: 4,
        },
      }}
    >
      {ctStatus === 'AGREED' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: getClipBorderRadius(isClippedLeft, isClippedRight),
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: statusMeta.progressBg || 'transparent',
              transition: 'width 0.35s ease',
            }}
          />
        </Box>
      )}

      {isClippedLeft && (
        <Box
          sx={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: 20,
            background: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 3px,
              rgba(0,0,0,0.10) 3px,
              rgba(0,0,0,0.10) 5px
            )`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', lineHeight: 1 }}>
            {'<<'}
          </Typography>
        </Box>
      )}

      {isClippedRight && (
        <Box
          sx={{
            position: 'absolute',
            inset: '0 0 0 auto',
            width: 20,
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 3px,
              rgba(0,0,0,0.10) 3px,
              rgba(0,0,0,0.10) 5px
            )`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', lineHeight: 1 }}>
            {'>>'}
          </Typography>
        </Box>
      )}

      {previewUrl ? (
        <Box
          component="img"
          src={previewUrl}
          alt={assignment?.label || '작업'}
          sx={{
            position: 'relative',
            zIndex: 1,
            width: isNarrow ? 28 : 40,
            height: isNarrow ? 28 : 40,
            borderRadius: 1,
            objectFit: 'cover',
            border: '1px solid rgba(0,0,0,0.08)',
            flexShrink: 0,
          }}
        />
      ) : (
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            width: isNarrow ? 28 : 40,
            height: isNarrow ? 28 : 40,
            borderRadius: 1,
            border: '1px dashed rgba(0,0,0,0.18)',
            backgroundColor: 'rgba(255,255,255,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'rgba(0,0,0,0.3)',
            fontSize: isNarrow ? 7 : 8,
            textAlign: 'center',
            lineHeight: 1.2,
            whiteSpace: 'pre',
            px: 0.2,
          }}
        >
          이미지{'\n'}없음
        </Box>
      )}

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          width: '100%',
          flex: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: '#1f2a3a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.4,
            fontSize: isNarrow ? 11 : 13,
          }}
        >
          {isCompact ? (customer || lineName) : line1}
        </Typography>
        {!hideSecondary && (
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(31,42,58,0.78)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.4,
              fontSize: isNarrow ? 10 : 12,
            }}
          >
            {isCompact ? (assignment?.label || lineName) : line2}
          </Typography>
        )}
      </Box>

      {!hideMetaBadges && durationLabel ? (
        <Box
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 1,
            px: 0.8,
            py: 0.2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.7)',
            fontSize: 11,
            fontWeight: 700,
            color: '#364152',
            maxWidth: '50%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {durationLabel}
        </Box>
      ) : null}

      {!hideMetaBadges && (
        <Box
          sx={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            zIndex: 1,
            px: 0.8,
            py: 0.2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.7)',
            fontSize: 10,
            fontWeight: 700,
            color: statusMeta.labelColor,
            maxWidth: '60%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctLabel}
        </Box>
      )}
    </Box>
  );
};

const isNonWorkingDate = (date, holidaySet) => {
  if (!date) return false;
  if (date.getDay() === 0) return true;
  return holidaySet.has(buildDateKey(date));
};

const getAssignmentWorkingDays = (assignment, baseDate, holidaySet) => {
  if (!assignment) return 0;
  const bounds = resolveAssignmentScheduleBounds(assignment, baseDate);
  if (!bounds) return 0;
  const startPercent = Number(assignment?.startDayPercent);
  const endPercent = Number(assignment?.endDayPercent);
  const startRatio = Number.isFinite(startPercent) && startPercent > 0 ? startPercent / 100 : 1;
  const endRatio = Number.isFinite(endPercent) && endPercent > 0 ? endPercent / 100 : 1;

  let total = 0;
  for (const date = new Date(bounds.startDate); date <= bounds.endDate; date.setDate(date.getDate() + 1)) {
    if (isNonWorkingDate(date, holidaySet)) continue;

    const currentKey = buildDateKey(date);
    if (bounds.startKey === bounds.endKey) {
      total += startRatio;
      continue;
    }
    if (currentKey === bounds.startKey) {
      total += startRatio;
      continue;
    }
    if (currentKey === bounds.endKey) {
      total += endRatio;
      continue;
    }
    total += 1;
  }

  return total;
};

const ProductionPlanBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId, activeOrgRole, activeProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState(null);
  const [deltaDialog, setDeltaDialog] = useState(null); // { mode, deltaCard, ... }
  const [cards, setCards] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lines, setLines] = useState([]);
  const [factories, setFactories] = useState([]);
  const [styles, setStyles] = useState([]);
  const [assignmentProgressById, setAssignmentProgressById] = useState(() => new Map());
  const [lineWorkers, setLineWorkers] = useState([]);
  const [processProposalDrafts, setProcessProposalDrafts] = useState({});
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const holidaySet = useMemo(() => new Set(loadHolidays()), []);
  const [baseDate] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [calendarMonth, setCalendarMonth] = useState(() => toMonthStart(new Date()));
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const drawerContainerRef = useRef(null);
  const todayKey = useMemo(() => buildDateKey(new Date()), []);
  const isLineLeaderView = activeOrgRole === 'WORKER';
  const lineQuery = useMemo(
    () =>
      buildQueryString({
        orgId: activeOrgId,
        ...(isLineLeaderView ? { managedOnly: 1 } : {}),
      }),
    [activeOrgId, isLineLeaderView]
  );

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.id), line])),
    [lines]
  );
  const visibleLineIdSet = useMemo(
    () => new Set((Array.isArray(lines) ? lines : []).map((line) => String(line.id))),
    [lines]
  );
  const factoryById = useMemo(
    () => new Map((Array.isArray(factories) ? factories : []).map((factory) => [String(factory.id), factory])),
    [factories]
  );
  const cardById = useMemo(
    () => new Map((Array.isArray(cards) ? cards : []).map((card) => [String(card.id), card])),
    [cards]
  );
  const styleById = useMemo(
    () => new Map((Array.isArray(styles) ? styles : []).map((style) => [String(style.id), style])),
    [styles]
  );
  const lineHeadcountById = useMemo(() => {
    const map = new Map();
    (Array.isArray(lineWorkers) ? lineWorkers : []).forEach((worker) => {
      const key = String(worker?.currentLineId || '').trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [lineWorkers]);

  const assignmentsForView = useMemo(() => {
    const sourceAssignments = (Array.isArray(assignments) ? assignments : []).filter((assignment) => {
      if (!isLineLeaderView) return true;
      const lineIdKey = String(assignment?.lineId || '').trim();
      if (!lineIdKey) return false;
      return visibleLineIdSet.has(lineIdKey);
    });

    return sourceAssignments
      .map((assignment) => {
        const card = cardById.get(String(assignment?.cardId || '')) || null;
        const styleId = String(card?.styleId || '');
        const style = styleById.get(styleId) || null;
        const line = lineById.get(String(assignment?.lineId || '')) || null;
        const factory = line ? factoryById.get(String(line.factoryId)) || null : null;
        const currentHeadcount = Number(lineHeadcountById.get(String(assignment?.lineId || '')) || 0);
        const fallbackHeadcount = Number(line?.headcount || line?.manpower || 0);
        const headcount = Math.max(1, currentHeadcount > 0 ? currentHeadcount : fallbackHeadcount);
        const lineDailyCapacitySeconds = resolveLineDailyCapacitySeconds(line, headcount);
        const status = normalizeCtStatus(assignment?.ctStatus);
        const proposalSeconds = resolveSecondsForProposal(assignment);
        const perPieceSeconds =
          proposalSeconds > 0
            ? proposalSeconds / Math.max(1, toPositiveInt(assignment?.quantity, 1))
            : null;
        const agreedSeconds = resolveAgreedSeconds(assignment);
        const wagePerSecond = Number(factory?.wagePerSecond);
        const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;
        const perPieceCost =
          validWage && Number.isFinite(perPieceSeconds) && perPieceSeconds > 0
            ? perPieceSeconds * wagePerSecond
            : null;
        const expectedCost = validWage ? proposalSeconds * wagePerSecond : null;
        const agreedCost = validWage && status === 'AGREED' ? agreedSeconds * wagePerSecond : null;
        const workingDays = getAssignmentWorkingDays(assignment, baseDate, holidaySet);
        const expectedPerPerson = expectedCost == null ? null : expectedCost / headcount;
        const monthlyPerPerson =
          expectedPerPerson == null || workingDays <= 0
            ? null
            : (expectedPerPerson / workingDays) * 26;
        const progress = assignmentProgressById.get(String(assignment?.id || '')) || null;

        return {
          ...assignment,
          card,
          style,
          line,
          factory,
          previewUrl:
            card?.previewUrl ||
            card?.imageUrl ||
            card?.thumbnailUrl ||
            (Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : ''),
          imageUrl:
            card?.imageUrl ||
            card?.previewUrl ||
            (Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : ''),
          thumbnailUrl:
            card?.thumbnailUrl ||
            card?.imageUrl ||
            card?.previewUrl ||
            (Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : ''),
          headcount,
          lineDailyCapacitySeconds,
          status,
          proposalSeconds,
          perPieceSeconds,
          perPieceCost,
          agreedSeconds,
          wagePerSecond: validWage ? wagePerSecond : null,
          expectedCost,
          agreedCost,
          workingDays,
          expectedPerPerson,
          monthlyPerPerson,
          progress,
        };
      })
      .sort((a, b) => {
        const lineCompare = String(a?.line?.name || a?.lineId || '').localeCompare(
          String(b?.line?.name || b?.lineId || ''),
          undefined,
          { numeric: true }
        );
        if (lineCompare !== 0) return lineCompare;
        const startCompare = toNonNegativeInt(a?.startIndex, 0) - toNonNegativeInt(b?.startIndex, 0);
        if (startCompare !== 0) return startCompare;
        return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, { numeric: true });
      });
  }, [
    assignments,
    isLineLeaderView,
    visibleLineIdSet,
    cardById,
    styleById,
    lineById,
    factoryById,
    lineHeadcountById,
    baseDate,
    holidaySet,
    assignmentProgressById,
  ]);

  const statusSummary = useMemo(
    () =>
      assignmentsForView.reduce(
        (acc, assignment) => {
          const status = normalizeCtStatus(assignment?.status);
          if (status === 'AGREED') acc.agreed += 1;
          else if (status === 'REJECTED') acc.rejected += 1;
          else if (status === 'SENT') acc.sent += 1;
          else acc.pending += 1;
          return acc;
        },
        { pending: 0, sent: 0, agreed: 0, rejected: 0 }
      ),
    [assignmentsForView]
  );

  const workStatusSummary = useMemo(
    () =>
      assignmentsForView.reduce(
        (acc, assignment) => {
          if (normalizeCtStatus(assignment?.status) !== 'AGREED') {
            acc.notReady += 1;
            return acc;
          }
          if (assignment?.isCompleted) acc.completed += 1;
          else acc.inProgress += 1;
          return acc;
        },
        { notReady: 0, inProgress: 0, completed: 0 }
      ),
    [assignmentsForView]
  );

  const actionableAssignments = useMemo(
    () =>
      assignmentsForView.filter(
        (assignment) => {
          const status = normalizeCtStatus(assignment?.status);
          if (isLineLeaderView) {
            return status === 'SENT' || status === 'REJECTED';
          }
          return status !== 'AGREED';
        }
      ),
    [assignmentsForView, isLineLeaderView]
  );

  const reviewAssignments = useMemo(() => {
    const nextAssignments = [...assignmentsForView];
    nextAssignments.sort((left, right) => {
      const leftStatus = normalizeCtStatus(left?.status);
      const rightStatus = normalizeCtStatus(right?.status);
      const leftIsAgreed = leftStatus === 'AGREED';
      const rightIsAgreed = rightStatus === 'AGREED';
      if (leftIsAgreed !== rightIsAgreed) {
        return leftIsAgreed ? 1 : -1;
      }
      return 0;
    });
    return nextAssignments;
  }, [assignmentsForView]);

  const deltaCards = useMemo(
    () => (Array.isArray(cards) ? cards : []).filter((card) => card?.type === 'DELTA'),
    [cards]
  );

  const selectedAssignment = useMemo(() => {
    if (assignmentsForView.length === 0) return null;
    if (selectedAssignmentId) {
      const matched = assignmentsForView.find(
        (item) => String(item.id) === String(selectedAssignmentId)
      );
      if (matched) return matched;
    }
    return actionableAssignments[0] || assignmentsForView[0] || null;
  }, [actionableAssignments, assignmentsForView, selectedAssignmentId]);
  const focusCalendarMonthForAssignment = useCallback((assignment) => {
    if (!assignment) return;
    const bounds = resolveAssignmentScheduleBounds(assignment, baseDate);
    if (!bounds) return;
    const targetMonth = toMonthStart(bounds.startDate);
    setCalendarMonth((prev) => (isSameMonth(prev, targetMonth) ? prev : targetMonth));
  }, [baseDate]);
  const selectedQuantityLabel = useMemo(
    () =>
      formatNumberWithCommas(
        Math.max(1, toPositiveInt(selectedAssignment?.quantity ?? 1, 1)),
        { fallback: '1', maximumFractionDigits: 0 }
      ),
    [selectedAssignment?.quantity]
  );
  const selectedAssignmentBusy =
    !!selectedAssignment &&
    String(savingAssignmentId || '') === String(selectedAssignment.id);
  const renderActionButtonLabel = (label, busy) => (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
      }}
    >
      <Box component="span" sx={{ visibility: busy ? 'hidden' : 'visible' }}>
        {label}
      </Box>
      {busy && (
        <CircularProgress
          size={16}
          color="inherit"
          sx={{ position: 'absolute' }}
        />
      )}
    </Box>
  );
  const selectedCtStatus = normalizeCtStatus(selectedAssignment?.status ?? selectedAssignment?.ctStatus);

  const assignmentViewById = useMemo(
    () => new Map(assignmentsForView.map((item) => [String(item.id), item])),
    [assignmentsForView]
  );

  const selectedAssignmentDateKeys = useMemo(() => {
    const keys = new Set();
    if (!selectedAssignment) return keys;
    const bounds = resolveAssignmentScheduleBounds(selectedAssignment, baseDate);
    if (!bounds) return keys;
    for (const date = new Date(bounds.startDate); date <= bounds.endDate; date.setDate(date.getDate() + 1)) {
      keys.add(buildDateKey(date));
    }
    return keys;
  }, [
    selectedAssignment?.id,
    selectedAssignment?.startDateKey,
    selectedAssignment?.endDateKey,
    selectedAssignment?.startIndex,
    selectedAssignment?.endIndex,
    baseDate,
  ]);

  const calendarDays = useMemo(
    () => buildMonthlyCalendarDays(calendarMonth),
    [calendarMonth]
  );

  const calendarMonthEnd = useMemo(() => {
    const end = new Date(calendarMonth);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return end;
  }, [calendarMonth]);

  const weekRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      rows.push(calendarDays.slice(i, i + 7));
    }
    return rows;
  }, [calendarDays]);

  const calendarBarData = useMemo(() => {
    return weekRows.map((weekDays) => {
      const weekStartDate = weekDays[0];
      const weekItems = assignmentsForView
        .map((assignment) => {
          const range = buildCalendarAssignmentRange(assignment, baseDate, weekStartDate);
          if (!range) return null;

          const startUnit = Math.max(0, range.start);
          const endUnit = Math.min(7, range.end);
          if (endUnit - startUnit <= CALENDAR_LANE_EPSILON) return null;

          return {
            assignment,
            startUnit,
            endUnit,
            isClippedLeft: range.start < 0,
            isClippedRight: range.end > 7,
          };
        })
        .filter(Boolean);

      weekItems.sort((left, right) =>
        left.startUnit - right.startUnit ||
        right.endUnit - left.endUnit ||
        String(left.assignment?.id || '').localeCompare(String(right.assignment?.id || ''), undefined, { numeric: true })
      );

      const segments = assignCalendarLanes(weekItems);

      return {
        weekDays,
        segments,
        laneCount: Math.max(1, segments.reduce((maxLane, item) => Math.max(maxLane, item.laneIndex + 1), 1)),
      };
    });
  }, [weekRows, assignmentsForView, baseDate]);

  const calendarLegend = useMemo(
    () => [
      { label: getAssignmentCtStatusLabel('PENDING'), status: 'PENDING' },
      { label: getAssignmentCtStatusLabel('SENT'), status: 'SENT' },
      { label: getAssignmentCtStatusLabel('REJECTED'), status: 'REJECTED' },
      { label: getAssignmentCtStatusLabel('AGREED'), status: 'AGREED' },
    ],
    []
  );

  useEffect(() => {
    if (assignmentsForView.length === 0) {
      setSelectedAssignmentId('');
      return;
    }
    setSelectedAssignmentId((prev) => {
      const exists = assignmentsForView.some(
        (item) => String(item.id) === String(prev)
      );
      if (exists) return prev;
      return String((actionableAssignments[0] || assignmentsForView[0]).id);
    });
  }, [actionableAssignments, assignmentsForView]);

  useEffect(() => {
    if (!selectedAssignment) {
      setIsPanelOpen(false);
    }
  }, [selectedAssignment]);

  const selectedDraftByProcess = useMemo(
    () => processProposalDrafts[String(selectedAssignment?.id || '')] || {},
    [processProposalDrafts, selectedAssignment?.id]
  );

  useEffect(() => {
    if (!selectedAssignment?.id) return;
    const assignmentKey = String(selectedAssignment.id);
    setProcessProposalDrafts((prev) => {
      if (prev[assignmentKey]) return prev;

      const proposalProcesses = Array.isArray(selectedAssignment?.card?.pendingCtProposal?.processes)
        ? selectedAssignment.card.pendingCtProposal.processes
        : [];
      if (proposalProcesses.length === 0) return prev;

      const nextDrafts = proposalProcesses.reduce((acc, item) => {
        const processKey = String(item?.processKey || '').trim();
        const proposedSeconds = toOptionalPositiveNumber(
          item?.requestedSeconds ?? item?.proposedSeconds
        );
        if (!processKey || proposedSeconds == null) return acc;
        if (item?.hasLineLeaderProposal !== true) return acc;
        acc[processKey] = String(proposedSeconds);
        return acc;
      }, {});

      if (Object.keys(nextDrafts).length === 0) return prev;
      return {
        ...prev,
        [assignmentKey]: nextDrafts,
      };
    });
  }, [selectedAssignment?.id, selectedAssignment?.card?.pendingCtProposal]);

  const handleProcessProposalInputChange = useCallback((assignmentId, processKey, value) => {
    if (!assignmentId || !processKey) return;
    if (!CT_INPUT_REGEX.test(value)) return;

    const assignmentKey = String(assignmentId);
    const normalizedProcessKey = String(processKey);
    setProcessProposalDrafts((prev) => {
      const currentForAssignment = prev[assignmentKey] || {};
      if (value === '') {
        if (!(normalizedProcessKey in currentForAssignment)) return prev;

        const nextForAssignment = { ...currentForAssignment };
        delete nextForAssignment[normalizedProcessKey];

        if (Object.keys(nextForAssignment).length === 0) {
          const next = { ...prev };
          delete next[assignmentKey];
          return next;
        }
        return {
          ...prev,
          [assignmentKey]: nextForAssignment,
        };
      }

      if (currentForAssignment[normalizedProcessKey] === value) return prev;
      return {
        ...prev,
        [assignmentKey]: {
          ...currentForAssignment,
          [normalizedProcessKey]: value,
        },
      };
    });
  }, []);

  const buildProcessRows = useCallback(
    (assignmentView) => {
      if (!assignmentView) return [];
      const processes = normalizeProcesses(assignmentView?.style?.processes);
      if (processes.length === 0) return [];

      const assignmentKey = String(assignmentView.id || '');
      const draftByProcess = processProposalDrafts[assignmentKey] || {};
      const orderQuantity = Math.max(1, toPositiveInt(assignmentView?.quantity, 1));
      const wagePerSecond = toOptionalPositiveNumber(assignmentView?.wagePerSecond);
      const lineDailyCapacitySeconds = Number(assignmentView?.lineDailyCapacitySeconds);
      const operatorProposalPayload = assignmentView?.card?.operatorCtProposal;
      const operatorProposalQuantity = Math.max(
        1,
        toPositiveInt(operatorProposalPayload?.quantity ?? orderQuantity, orderQuantity)
      );
      const canReuseOperatorProposal = operatorProposalQuantity === orderQuantity;
      const operatorProposalByProcess = (
        Array.isArray(operatorProposalPayload?.processes)
          ? operatorProposalPayload.processes
          : []
      ).reduce((map, item) => {
        if (!canReuseOperatorProposal) return map;
        const processKey = String(item?.processKey || '').trim();
        const proposedSeconds = toOptionalPositiveNumber(item?.proposedSeconds);
        const stSeconds = toOptionalPositiveNumber(
          item?.stSeconds ?? item?.suggestedSeconds ?? item?.baseSeconds
        );
        const seedSeconds = stSeconds ?? proposedSeconds;
        if (!processKey || seedSeconds == null) return map;
        map.set(processKey, {
          stSeconds: seedSeconds,
          proposedSeconds: proposedSeconds ?? seedSeconds,
        });
        return map;
      }, new Map());
      const pendingRequestByProcess = (
        Array.isArray(assignmentView?.card?.pendingCtProposal?.processes)
          ? assignmentView.card.pendingCtProposal.processes
          : []
      ).reduce((map, item) => {
        const processKey = String(item?.processKey || '').trim();
        const requestedSeconds = toOptionalPositiveNumber(
          item?.requestedSeconds ?? item?.proposedSeconds
        );
        if (!processKey || requestedSeconds == null) return map;
        map.set(processKey, requestedSeconds);
        return map;
      }, new Map());
      const assignmentStatus = normalizeCtStatus(
        assignmentView?.status ?? assignmentView?.ctStatus
      );
      const isAgreedAssignment = assignmentStatus === 'AGREED';
      const agreedSnapshot = assignmentView?.card?.ctAgreedSnapshot;
      const agreedSnapshotQuantity = Math.max(
        1,
        toPositiveInt(agreedSnapshot?.quantity ?? orderQuantity, orderQuantity)
      );
      const canUseAgreedSnapshot =
        isAgreedAssignment &&
        agreedSnapshot &&
        agreedSnapshotQuantity === orderQuantity &&
        (!assignmentView?.id ||
          !agreedSnapshot?.sourceAssignmentId ||
          String(agreedSnapshot.sourceAssignmentId) === String(assignmentView.id));
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
        const atSeconds = resolveProcessAtSeconds(process, orderQuantity);
        const atReliability = resolveProcessAtReliability(process, orderQuantity);
        const operatorProposal = operatorProposalByProcess.get(processKey) ?? null;
        const stSeedInfo = resolveProcessStSeedSeconds({
          process,
          orderQuantity,
          proposalStSeconds: operatorProposal?.stSeconds ?? null,
        });
        const baseSeconds = stSeedInfo.seconds;
        const basePerPieceSeconds = baseSeconds * processQuantity;
        const atPerPieceSeconds = atSeconds == null ? null : atSeconds * processQuantity;
        const atVsBasePercent = calcDivergencePercent(atPerPieceSeconds, basePerPieceSeconds);
        const needsStReview =
          atVsBasePercent != null &&
          Math.abs(atVsBasePercent) >= ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT;

        const directSeconds = toOptionalPositiveNumber(draftByProcess[processKey]);
        const agreedSnapshotEntry = agreedSnapshotByProcess.get(processKey) ?? null;
        const agreedSnapshotSeconds = agreedSnapshotEntry?.agreedSeconds ?? null;
        const agreedSnapshotRequestedSeconds = agreedSnapshotEntry?.requestedSeconds ?? null;
        const agreedSnapshotProposedSeconds = agreedSnapshotEntry?.proposedSeconds ?? null;
        const suggestedSeconds =
          operatorProposal?.proposedSeconds ?? agreedSnapshotProposedSeconds ?? baseSeconds;
        const pendingRequestedSeconds = pendingRequestByProcess.get(processKey) ?? null;
        const requestedSeconds =
          pendingRequestedSeconds ?? (isAgreedAssignment ? agreedSnapshotRequestedSeconds : null);
        const hasDirectProposal = directSeconds != null;
        const proposedSeconds =
          hasDirectProposal ? directSeconds : requestedSeconds ?? suggestedSeconds;
        const confirmedSeconds = isAgreedAssignment
          ? agreedSnapshotSeconds ??
            requestedSeconds ??
            toOptionalPositiveNumber(operatorProposal?.proposedSeconds ?? proposedSeconds) ??
            toOptionalPositiveNumber(proposedSeconds) ??
            toOptionalPositiveNumber(suggestedSeconds)
          : null;
        const hasRequestedAdjustment = Math.abs(proposedSeconds - suggestedSeconds) > 1e-6;
        const suggestedPerPieceSeconds = suggestedSeconds * processQuantity;
        const proposedPerPieceSeconds = proposedSeconds * processQuantity;
        const confirmedPerPieceSeconds =
          confirmedSeconds == null ? null : confirmedSeconds * processQuantity;

        const totalBaseSeconds = basePerPieceSeconds * orderQuantity;
        const totalAtSeconds = atPerPieceSeconds == null ? null : atPerPieceSeconds * orderQuantity;
        const totalSuggestedSeconds = suggestedPerPieceSeconds * orderQuantity;
        const totalProposedSeconds = proposedPerPieceSeconds * orderQuantity;
        const perPieceCost = wagePerSecond == null ? null : proposedPerPieceSeconds * wagePerSecond;
        const suggestedPerPieceCost =
          wagePerSecond == null ? null : suggestedPerPieceSeconds * wagePerSecond;
        const suggestedCost = wagePerSecond == null ? null : totalSuggestedSeconds * wagePerSecond;
        const expectedCost = wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond;
        const expectedDays =
          Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
            ? totalProposedSeconds / lineDailyCapacitySeconds
            : null;

        return {
          processKey,
          processName,
          processQuantity,
          baseBasis: stSeedInfo.source,
          ptSeconds: ptInfo.seconds,
          ptReferenceQuantity: ptInfo.referenceQuantity,
          ptIsReferenceFallback: ptInfo.isReferenceFallback,
          baseSeconds,
          basePerPieceSeconds,
          atSeconds,
          atReliability,
          atPerPieceSeconds,
          atVsBasePercent,
          needsStReview,
          suggestedSeconds,
          suggestedPerPieceSeconds,
          totalSuggestedSeconds,
          hasRequestedAdjustment,
          proposedSeconds,
          proposedPerPieceSeconds,
          confirmedSeconds,
          confirmedPerPieceSeconds,
          hasDirectProposal,
          totalBaseSeconds,
          totalAtSeconds,
          totalProposedSeconds,
          proposedUnitCost: resolveCtUnitCost(suggestedSeconds, wagePerSecond),
          requestedUnitCost: resolveCtUnitCost(proposedSeconds, wagePerSecond),
          confirmedUnitCost: resolveCtUnitCost(confirmedSeconds, wagePerSecond),
          suggestedPerPieceCost,
          suggestedCost,
          perPieceCost,
          expectedCost,
          expectedDays,
        };
      });
    },
    [processProposalDrafts]
  );

  const selectedProcessRows = useMemo(
    () => buildProcessRows(selectedAssignment),
    [buildProcessRows, selectedAssignment]
  );

  // 기본 CT와 다른 값이 입력된 공정이 하나라도 있으면 true
  const hasCtAdjustment = useMemo(
    () => selectedProcessRows.some((row) => row.hasRequestedAdjustment),
    [selectedProcessRows]
  );

  const selectedCostSummary = useMemo(() => {
    if (!selectedAssignment) return null;

    const assignmentStatus = normalizeCtStatus(selectedAssignment?.status);
    const isAgreedAssignment = assignmentStatus === 'AGREED';
    const orderQuantity = Math.max(1, toPositiveInt(selectedAssignment.quantity, 1));
    const headcount = Math.max(1, toPositiveInt(selectedAssignment.headcount, 1));
    const workingDays = Number(selectedAssignment.workingDays) > 0 ? Number(selectedAssignment.workingDays) : 0;
    const wagePerSecond = toOptionalPositiveNumber(selectedAssignment.wagePerSecond);
    const lineDailyCapacitySeconds = Number(selectedAssignment.lineDailyCapacitySeconds);

    if (selectedProcessRows.length === 0) {
      const fallbackTotalSeconds = resolveSecondsForProposal(selectedAssignment);
      const fallbackTotalCost = wagePerSecond == null ? null : fallbackTotalSeconds * wagePerSecond;
      const fallbackPerPieceCost = fallbackTotalCost == null ? null : fallbackTotalCost / orderQuantity;
      const fallbackDurationDays =
        Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
          ? fallbackTotalSeconds / lineDailyCapacitySeconds
          : null;
      const fallbackPerPersonExpected = fallbackTotalCost == null ? null : fallbackTotalCost / headcount;
      const fallbackMonthly =
        fallbackPerPersonExpected == null || workingDays <= 0
          ? null
          : (fallbackPerPersonExpected / workingDays) * 26;
      const fallbackConfirmedPerPieceSeconds =
        isAgreedAssignment && fallbackTotalSeconds > 0
          ? fallbackTotalSeconds / orderQuantity
          : null;

      return {
        totalBasePerPieceSeconds: fallbackTotalSeconds / orderQuantity,
        totalSuggestedPerPieceSeconds: fallbackTotalSeconds / orderQuantity,
        totalProposedPerPieceSeconds: fallbackTotalSeconds / orderQuantity,
        totalConfirmedPerPieceSeconds: fallbackConfirmedPerPieceSeconds,
        totalBaseSeconds: fallbackTotalSeconds,
        totalSuggestedSeconds: fallbackTotalSeconds,
        totalAtPerPieceSeconds: null,
        totalAtSeconds: null,
        atVsBasePercent: null,
        needsStReview: false,
        atCoverageCount: 0,
        totalProposedSeconds: fallbackTotalSeconds,
        perPieceCost: fallbackPerPieceCost,
        totalCost: fallbackTotalCost,
        totalDurationDays: fallbackDurationDays,
        perPersonExpectedCost: fallbackPerPersonExpected,
        monthlyPerPersonExpected: fallbackMonthly,
        directProposalCount: 0,
      };
    }

    const totalBasePerPieceSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.basePerPieceSeconds,
      0
    );
    const totalSuggestedPerPieceSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.suggestedPerPieceSeconds,
      0
    );
    const totalProposedPerPieceSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.proposedPerPieceSeconds,
      0
    );
    const totalConfirmedPerPieceSeconds =
      isAgreedAssignment
        ? selectedProcessRows.reduce(
            (sum, row) => sum + (Number(row?.confirmedPerPieceSeconds) || 0),
            0
          )
        : null;
    const totalBaseSeconds = selectedProcessRows.reduce((sum, row) => sum + row.totalBaseSeconds, 0);
    const totalSuggestedSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.totalSuggestedSeconds,
      0
    );
    const totalProposedSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.totalProposedSeconds,
      0
    );
    const rowsWithAt = selectedProcessRows.filter((row) => row.totalAtSeconds != null);
    const totalAtPerPieceSeconds =
      rowsWithAt.length > 0
        ? rowsWithAt.reduce((sum, row) => sum + row.atPerPieceSeconds, 0)
        : null;
    const totalAtSeconds =
      rowsWithAt.length > 0
        ? rowsWithAt.reduce((sum, row) => sum + row.totalAtSeconds, 0)
        : null;
    const atVsBasePercent = calcDivergencePercent(totalAtPerPieceSeconds, totalBasePerPieceSeconds);
    const needsStReview =
      atVsBasePercent != null &&
      Math.abs(atVsBasePercent) >= ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT;
    const directProposalCount = selectedProcessRows.filter((row) => row.hasRequestedAdjustment).length;
    const totalCost = wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond;
    const perPieceCost = totalCost == null ? null : totalCost / orderQuantity;
    const totalDurationDays =
      Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
        ? totalProposedSeconds / lineDailyCapacitySeconds
        : null;
    const perPersonExpectedCost = totalCost == null ? null : totalCost / headcount;
    const monthlyPerPersonExpected =
      perPersonExpectedCost == null || workingDays <= 0 ? null : (perPersonExpectedCost / workingDays) * 26;

    return {
      totalBasePerPieceSeconds,
      totalSuggestedPerPieceSeconds,
      totalProposedPerPieceSeconds,
      totalConfirmedPerPieceSeconds,
      totalBaseSeconds,
      totalSuggestedSeconds,
      totalAtPerPieceSeconds,
      totalAtSeconds,
      atVsBasePercent,
      needsStReview,
      atCoverageCount: rowsWithAt.length,
      totalProposedSeconds,
      perPieceCost,
      totalCost,
      totalDurationDays,
      perPersonExpectedCost,
      monthlyPerPersonExpected,
      directProposalCount,
    };
  }, [selectedAssignment, selectedProcessRows]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const [boardState, lineRows, factoryRows, lineWorkerRows, styleRows] = await Promise.all([
          requestJSON('/assignment-board-view' + query).catch(() => ({ cards: [], assignments: [] })),
          requestJSON('/lines' + lineQuery).catch(() => []),
          requestJSON('/factories' + query).catch(() => []),
          requestJSON('/line-workers' + query).catch(() => []),
          fetchStylesFromApi({ orgId: activeOrgId }).catch(() => []),
        ]);
        if (cancelled) return;

        const nextCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
        const nextAssignments = Array.isArray(boardState?.assignments) ? boardState.assignments : [];
        const assignmentIds = Array.from(
          new Set(
            nextAssignments
              .map((item) => String(item?.id || '').trim())
              .filter(Boolean)
          )
        );
        const progressRows =
          assignmentIds.length > 0
            ? await requestJSON(
                '/assignment-plan-progress' +
                  buildQueryString({
                    orgId: activeOrgId,
                    ids: assignmentIds.join(','),
                  })
              ).catch(() => [])
            : [];
        const progressMap = buildAssignmentProgressMap(progressRows);
        setCards(nextCards);
        setAssignments(nextAssignments);
        setLines(Array.isArray(lineRows) ? lineRows : []);
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
        setLineWorkers(Array.isArray(lineWorkerRows) ? lineWorkerRows : []);
        setStyles(Array.isArray(styleRows) ? styleRows : []);
        setAssignmentProgressById(progressMap);
        setSelectedAssignmentId((prev) => {
          if (!prev) return nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
          const exists = nextAssignments.some((item) => String(item?.id) === String(prev));
          return exists ? prev : nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
        });
      } catch (_error) {
        if (!cancelled) {
          setCards([]);
          setAssignments([]);
          setLines([]);
          setFactories([]);
          setLineWorkers([]);
          setStyles([]);
          setAssignmentProgressById(new Map());
          setSelectedAssignmentId('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, lineQuery]);

  const refreshBoardState = useCallback(async () => {
    const query = buildQueryString({ orgId: activeOrgId });
    const boardState = await requestJSON('/assignment-board-view' + query, {
      forceRefresh: true,
    }).catch(() => null);
    if (!boardState) return false;

    const nextCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
    const nextAssignments = Array.isArray(boardState?.assignments)
      ? boardState.assignments
      : [];
    const assignmentIds = Array.from(
      new Set(
        nextAssignments
          .map((item) => String(item?.id || '').trim())
          .filter(Boolean)
      )
    );
    const progressRows =
      assignmentIds.length > 0
        ? await requestJSON(
            '/assignment-plan-progress' +
              buildQueryString({
                orgId: activeOrgId,
                ids: assignmentIds.join(','),
              }),
            { forceRefresh: true }
          ).catch(() => [])
        : [];
    const progressMap = buildAssignmentProgressMap(progressRows);
    setCards(nextCards);
    setAssignments(nextAssignments);
    setAssignmentProgressById(progressMap);
    setSelectedAssignmentId((prev) => {
      if (!prev) return nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
      const exists = nextAssignments.some((item) => String(item?.id) === String(prev));
      return exists ? prev : nextAssignments[0]?.id ? String(nextAssignments[0].id) : '';
    });
    return true;
  }, [activeOrgId]);

  const persistBoardState = useCallback(
    async (nextAssignments, nextCards = cards) => {
      const query = buildQueryString({ orgId: activeOrgId });
      const assignmentsForSave = (Array.isArray(nextAssignments) ? nextAssignments : []).map((assignment) =>
        syncAssignmentScheduleDateKeys(assignment, baseDate)
      );
      try {
        const boardState = await requestJSON('/assignment-board-state' + query, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: nextCards, assignments: assignmentsForSave }),
        });
        const persistedCards = Array.isArray(boardState?.cards) ? boardState.cards : nextCards;
        const persistedAssignments = Array.isArray(boardState?.assignments)
          ? boardState.assignments
          : assignmentsForSave;
        setCards(persistedCards);
        setAssignments(persistedAssignments);
      } catch (error) {
        if (isAssignmentVersionConflictError(error)) {
          await refreshBoardState();
          const conflictError = new Error(
            '다른 사용자가 먼저 수정했습니다. 최신 상태를 반영했어요. 다시 시도해 주세요.'
          );
          conflictError.status = 409;
          throw conflictError;
        }
        throw error;
      }
    },
    [activeOrgId, baseDate, cards, refreshBoardState]
  );

  const handleToggleCompletion = useCallback(async (assignment) => {
    const assignmentId = String(assignment?.id || '').trim();
    if (!assignmentId || savingAssignmentId) return;

    const query = buildQueryString({ orgId: activeOrgId });
    const isCompleted = Boolean(assignment?.isCompleted);

    setSavingAssignmentId(assignmentId);
    try {
      let completionResult = null;
      if (isCompleted) {
        completionResult = await requestJSON(`/assignment-plans/${encodeURIComponent(assignmentId)}/reopen${query}`, {
          method: 'PATCH',
          skipGlobalLoading: true,
        });
      } else {
        completionResult = await requestJSON(`/assignment-plans/${encodeURIComponent(assignmentId)}/complete${query}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          skipGlobalLoading: true,
        });
      }
      const nextIsCompleted = Boolean(completionResult?.isCompleted ?? !isCompleted);
      const nextFinalQuantity = nextIsCompleted
        ? toNonNegativeInt(completionResult?.finalQuantity, null)
        : null;
      const nextCompletedAt = nextIsCompleted
        ? String(completionResult?.completedAt || assignment?.completedAt || new Date().toISOString())
        : null;

      setAssignments((prevAssignments) =>
        (Array.isArray(prevAssignments) ? prevAssignments : []).map((item) => {
          if (String(item?.id || '') !== assignmentId) return item;
          return {
            ...item,
            isCompleted: nextIsCompleted,
            finalQuantity: nextFinalQuantity,
            completedAt: nextCompletedAt,
          };
        })
      );

      const progressRows = await requestJSON(
        '/assignment-plan-progress' +
          buildQueryString({
            orgId: activeOrgId,
            ids: assignmentId,
          }),
        {
          forceRefresh: true,
          skipGlobalLoading: true,
        }
      ).catch(() => []);

      const progressRow = Array.isArray(progressRows)
        ? progressRows.find((row) => String(row?.id || '') === assignmentId) || null
        : null;
      if (progressRow) {
        const progressEntry = buildAssignmentProgressMap([progressRow]).get(assignmentId);
        if (progressEntry) {
          setAssignmentProgressById((prevMap) => {
            const nextMap = new Map(prevMap);
            nextMap.set(assignmentId, progressEntry);
            return nextMap;
          });
        }
      }

      showNotification(
        isCompleted ? '작업이 진행 상태로 전환되었습니다.' : '작업이 완료 상태로 전환되었습니다.',
        'success'
      );
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '작업 상태 변경에 실패했습니다.'),
        'error'
      );
    } finally {
      setSavingAssignmentId(null);
    }
  }, [activeOrgId, savingAssignmentId, showNotification]);

  const handleAgree = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    if (!target) return;
    const targetView = assignmentViewById.get(String(assignmentId)) || null;
    const orderQuantity = Math.max(
      1,
      toPositiveInt(targetView?.quantity ?? target?.quantity ?? 1, 1)
    );
    const schedulePatch = buildAssignmentSchedulePatch(target, baseDate);
    const agreedProcessRows = buildProcessRows(targetView).map((row) => {
      const proposedSeconds = toOptionalPositiveNumber(
        row.suggestedSeconds ?? row.baseSeconds
      );
      const requestedSeconds = toOptionalPositiveNumber(
        row.proposedSeconds ?? row.suggestedSeconds ?? row.baseSeconds
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
    let resolvedAgreedSeconds = agreedProcessRows.reduce(
      (sum, row) => sum + row.agreedTotalSeconds,
      0
    );
    if (!Number.isFinite(resolvedAgreedSeconds) || resolvedAgreedSeconds <= 0) {
      resolvedAgreedSeconds = Math.max(
        1,
        toNonNegativeInt(resolveSecondsForProposal(targetView ?? target), 1)
      );
    } else {
      resolvedAgreedSeconds = Math.max(1, Math.round(resolvedAgreedSeconds));
    }
    const totalStPerPieceSeconds =
      agreedProcessRows.length > 0
        ? agreedProcessRows.reduce((sum, row) => sum + row.basePerPieceSeconds, 0)
        : resolvedAgreedSeconds / orderQuantity;
    const totalRequestedPerPieceSeconds =
      agreedProcessRows.length > 0
        ? agreedProcessRows.reduce((sum, row) => sum + row.proposedPerPieceSeconds, 0)
        : resolvedAgreedSeconds / orderQuantity;
    const totalAgreedPerPieceSeconds =
      agreedProcessRows.length > 0
        ? agreedProcessRows.reduce((sum, row) => sum + row.agreedPerPieceSeconds, 0)
        : resolvedAgreedSeconds / orderQuantity;

    const now = new Date().toISOString();
    const agreedBy = String(
      activeProfile?.employeeName || activeProfile?.email || activeProfile?.label || ''
    ).trim() || 'LINE_LEADER';
    const agreementSnapshot = {
      agreedAt: now,
      agreedBy,
      sourceAssignmentId: String(assignmentId),
      lineId: target?.lineId ?? null,
      schedule: schedulePatch,
      quantity: orderQuantity,
      totalStPerPieceSeconds,
      totalRequestedPerPieceSeconds,
      totalAgreedPerPieceSeconds,
      totalAgreedSeconds: resolvedAgreedSeconds,
      processes: agreedProcessRows.map((row) => ({
        processKey: row.processKey,
        name: row.processName,
        quantity: row.processQuantity,
        basis: row.baseBasis,
        stSeconds: row.baseSeconds,
        proposedSeconds: row.proposedSeconds,
        requestedSeconds: row.requestedSeconds,
        agreedSeconds: row.agreedSeconds,
        agreedPerPieceSeconds: row.agreedPerPieceSeconds,
      })),
    };
    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== String(assignmentId)) return item;

      return {
        ...item,
        ...(schedulePatch || {}),
        ctStatus: 'AGREED',
        contractedSeconds:
          toNonNegativeInt(item?.contractedSeconds, 0) > 0
            ? toNonNegativeInt(item?.contractedSeconds, 0)
            : resolvedAgreedSeconds,
        ctSource: item?.ctSource || item?.proposalBasis || item?.basis || 'MANUAL',
        ctAgreedBy: agreedBy,
        ctAgreedAt: now,
      };
    });
    const nextCards = target?.cardId
      ? cards.map((card) =>
          String(card?.id) === String(target.cardId)
            ? {
                ...card,
                ctAgreedSnapshot: agreementSnapshot,
                pendingCtProposal: null,
              }
            : card
        )
      : cards;

    setSavingAssignmentId(String(assignmentId));
    try {
      await persistBoardState(nextAssignments, nextCards);
      setProcessProposalDrafts((prev) => {
        const assignmentKey = String(assignmentId);
        if (!(assignmentKey in prev)) return prev;
        const next = { ...prev };
        delete next[assignmentKey];
        return next;
      });
      setIsPanelOpen(false);
      showNotification('작업 계획이 동의 처리되었습니다.', 'success');
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '작업 계획 동의 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const handleRequestAdjustment = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    const targetView = assignmentViewById.get(String(assignmentId)) || null;
    if (!target) return;

    const processRows = buildProcessRows(targetView);
    const orderQuantity = Math.max(1, toPositiveInt(target?.quantity, 1));
    const lineDailyCapacitySeconds = Number(targetView?.lineDailyCapacitySeconds);
    const wagePerSecond = toOptionalPositiveNumber(targetView?.wagePerSecond);
    const headcount = Math.max(1, toPositiveInt(targetView?.headcount, 1));
    const workingDays = Number(targetView?.workingDays) > 0 ? Number(targetView.workingDays) : 0;
    const schedulePatch = buildAssignmentSchedulePatch(target, baseDate);

    const totalBasePerPieceSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.basePerPieceSeconds, 0)
        : resolveSecondsForProposal(target) / orderQuantity;
    const totalSuggestedPerPieceSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.suggestedPerPieceSeconds, 0)
        : resolveSecondsForProposal(target) / orderQuantity;
    const totalProposedPerPieceSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.proposedPerPieceSeconds, 0)
        : resolveSecondsForProposal(target) / orderQuantity;
    const totalBaseSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.totalBaseSeconds, 0)
        : resolveSecondsForProposal(target);
    const totalSuggestedSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.totalSuggestedSeconds, 0)
        : resolveSecondsForProposal(target);
    const totalProposedSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.totalProposedSeconds, 0)
        : resolveSecondsForProposal(target);
    const rowsWithAt = processRows.filter((row) => row.totalAtSeconds != null);
    const totalAtPerPieceSeconds =
      rowsWithAt.length > 0
        ? rowsWithAt.reduce((sum, row) => sum + row.atPerPieceSeconds, 0)
        : null;
    const totalAtSeconds =
      rowsWithAt.length > 0
        ? rowsWithAt.reduce((sum, row) => sum + row.totalAtSeconds, 0)
        : null;
    const atVsBasePercent = calcDivergencePercent(totalAtPerPieceSeconds, totalBasePerPieceSeconds);
    const needsStReview =
      atVsBasePercent != null &&
      Math.abs(atVsBasePercent) >= ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT;
    const totalCostPreview = wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond;
    const perPersonPreview = totalCostPreview == null ? null : totalCostPreview / headcount;
    const monthlyPreview =
      perPersonPreview == null || workingDays <= 0 ? null : (perPersonPreview / workingDays) * 26;
    const totalDurationDays =
      Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
        ? totalProposedSeconds / lineDailyCapacitySeconds
        : null;
    const directProposalCount = processRows.filter((row) => row.hasRequestedAdjustment).length;

    const adjustmentPayload = {
      requestedAt: new Date().toISOString(),
      requestedBy: 'LINE_LEADER',
      sourceAssignmentId: target.id,
      lineId: target.lineId,
      lineName: targetView?.line?.name || '',
      quantity: orderQuantity,
      schedule: {
        ...(schedulePatch || {}),
      },
      totalBasePerPieceSeconds,
      totalSuggestedPerPieceSeconds,
      totalProposedPerPieceSeconds,
      totalBaseSeconds,
      totalSuggestedSeconds,
      totalAtPerPieceSeconds,
      totalAtSeconds,
      atVsBasePercent,
      needsStReview,
      totalProposedSeconds,
      totalDurationDays,
      expectedCost: totalCostPreview,
      expectedPerPerson: perPersonPreview,
      expectedMonthlyPerPerson: monthlyPreview,
      directProposalCount,
      processes: processRows.map((row) => ({
        processKey: row.processKey,
        name: row.processName,
        quantity: row.processQuantity,
        basis: row.baseBasis,
        baseSeconds: row.baseSeconds,
        basePerPieceSeconds: row.basePerPieceSeconds,
        suggestedSeconds: row.suggestedSeconds,
        suggestedPerPieceSeconds: row.suggestedPerPieceSeconds,
        atSeconds: row.atSeconds,
        atPerPieceSeconds: row.atPerPieceSeconds,
        atVsBasePercent: row.atVsBasePercent,
        needsStReview: row.needsStReview,
        proposedSeconds: row.proposedSeconds,
        requestedSeconds: row.proposedSeconds,
        proposedPerPieceSeconds: row.proposedPerPieceSeconds,
        hasLineLeaderProposal: row.hasRequestedAdjustment,
      })),
    };

    const nextCards = target?.cardId
      ? cards.map((card) =>
          String(card?.id) === String(target.cardId)
            ? {
                ...card,
                pendingCtProposal: adjustmentPayload,
              }
            : card
        )
      : cards;
    const adjustmentSummary = `운영팀 변경 요청 · ${new Date().toISOString()}`;
    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== String(assignmentId)) return item;
      return {
        ...item,
        ...(schedulePatch || {}),
        ctStatus: 'REJECTED',
        ctOverride: true,
        ctSource: 'LINE_LEADER_PROPOSAL',
        ctAgreedBy: null,
        ctAgreedAt: null,
        ctNote: adjustmentSummary,
      };
    });

    setSavingAssignmentId(String(assignmentId));
    try {
      await persistBoardState(nextAssignments, nextCards);
      setIsPanelOpen(false);
      showNotification(
        directProposalCount > 0
          ? `변경 요청이 등록되었습니다. 공정 ${directProposalCount}건의 요청 CT가 운영팀 검토로 전달되었습니다.`
          : '변경 요청이 운영팀 검토 대상으로 등록되었습니다.',
        'info'
      );
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '변경 요청 처리에 실패했습니다.'),
        'error'
      );
    } finally {
      setSavingAssignmentId(null);
    }
  };

  // ?? Delta card ?ы띁 ??????????????????????????????????????????????
  const findMatchingAssignmentsForDelta = (deltaCard) =>
    assignmentsForView.filter((a) => {
      if (a.isCompleted) return false;
      const card = cardById.get(String(a.cardId));
      return (
        (card?.styleId === deltaCard.styleId || a.label === deltaCard.label) &&
        (a.colorName || '') === (deltaCard.colorName || '') &&
        (a.gender || '') === (deltaCard.gender || '') &&
        (a.customer || '') === (deltaCard.customer || '')
      );
    });

  const handleDeltaCardRemove = async (deltaCardId) => {
    if (!window.confirm('차이 카드를 삭제하시겠습니까?')) return;
    const nextCards = cards.filter((c) => String(c?.id) !== String(deltaCardId));
    try {
      await persistBoardState(assignments, nextCards);
      showNotification('차이 카드가 삭제되었습니다.', 'success');
    } catch (error) {
      showNotification(resolveBoardSaveErrorMessage(error, '삭제에 실패했습니다.'), 'error');
    }
  };

  const handleDeltaAssignOpen = (deltaCard) => {
    setDeltaDialog({
      mode: 'ASSIGN',
      deltaCard,
      selectedLineId: lines.length > 0 ? String(lines[0].id) : '',
      startOffset: '0',
      endOffset: '0',
    });
  };

  const handleDeltaAbsorbOpen = (deltaCard) => {
    const matching = findMatchingAssignmentsForDelta(deltaCard);
    setDeltaDialog({
      mode: 'ABSORB',
      deltaCard,
      matchingAssignments: matching,
      selectedAssignmentId: matching.length > 0 ? String(matching[0].id) : '',
    });
  };

  const handleDeltaDeductOpen = (deltaCard) => {
    const matching = findMatchingAssignmentsForDelta(deltaCard);
    setDeltaDialog({
      mode: 'DEDUCT',
      deltaCard,
      matchingAssignments: matching,
      selectedAssignmentId: matching.length > 0 ? String(matching[0].id) : '',
    });
  };

  const handleDeltaDialogClose = () => setDeltaDialog(null);

  const handleDeltaAssignConfirm = async () => {
    if (!deltaDialog) return;
    const { deltaCard, selectedLineId, startOffset, endOffset } = deltaDialog;
    if (!selectedLineId) {
      showNotification('라인을 선택해 주세요.', 'error');
      return;
    }
    const startIndex = toNonNegativeInt(Number(startOffset), 0);
    const endIndex = Math.max(startIndex, toNonNegativeInt(Number(endOffset), startIndex));

    // 차이 카드를 일반 카드로 전환
    const convertedCard = {
      id: deltaCard.id,
      styleId: deltaCard.styleId,
      label: deltaCard.label,
      customer: deltaCard.customer,
      colorName: deltaCard.colorName,
      gender: deltaCard.gender,
    };
    const newAssignment = {
      id: `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cardId: convertedCard.id,
      lineId: selectedLineId,
      startIndex,
      endIndex,
      quantity: deltaCard.quantity,
      ctStatus: 'PENDING',
      label: deltaCard.label,
      customer: deltaCard.customer,
      colorName: deltaCard.colorName,
      gender: deltaCard.gender,
    };

    const nextCards = cards.map((c) =>
      String(c?.id) === String(deltaCard.id) ? convertedCard : c
    );
    const nextAssignments = [...assignments, newAssignment];
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification('라인 배정이 완료되었습니다.', 'success');
      setDeltaDialog(null);
    } catch (error) {
      showNotification(resolveBoardSaveErrorMessage(error, '배정에 실패했습니다.'), 'error');
    }
  };

  const handleDeltaAbsorbConfirm = async () => {
    if (!deltaDialog || !deltaDialog.selectedAssignmentId) return;
    const { deltaCard, selectedAssignmentId } = deltaDialog;
    const targetAssignment = assignments.find((a) => String(a?.id) === String(selectedAssignmentId));
    const targetView = assignmentViewById.get(String(selectedAssignmentId)) || null;
    if (!targetAssignment || !targetView) return;

    const oldQty = Math.max(1, toPositiveInt(targetAssignment.quantity, 1));
    const newQty = oldQty + deltaCard.quantity;

    const proposalSeconds = resolveSecondsForProposal(targetAssignment);
    const lineDailyCapacitySeconds = Number(targetView.lineDailyCapacitySeconds || 0);
    const startIndex = toNonNegativeInt(targetAssignment.startIndex, 0);
    let newEndIndex = startIndex;
    if (proposalSeconds > 0 && lineDailyCapacitySeconds > 0) {
      const perPieceSeconds = proposalSeconds / oldQty;
      const durationDays = Math.ceil((perPieceSeconds * newQty) / lineDailyCapacitySeconds);
      newEndIndex = startIndex + Math.max(0, durationDays - 1);
    } else {
      newEndIndex = Math.max(startIndex, toNonNegativeInt(targetAssignment.endIndex, startIndex));
    }

    const nextAssignments = assignments.map((a) =>
      String(a?.id) === String(selectedAssignmentId) ? { ...a, quantity: newQty, endIndex: newEndIndex } : a
    );
    const nextCards = cards.filter((c) => String(c?.id) !== String(deltaCard.id));
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification(`수량 ${deltaCard.quantity}개가 기존 배정에 흡수되었습니다.`, 'success');
      setDeltaDialog(null);
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '수량 흡수에 실패했습니다.'),
        'error'
      );
    }
  };

  const handleDeltaDeductConfirm = async () => {
    if (!deltaDialog || !deltaDialog.selectedAssignmentId) return;
    const { deltaCard, selectedAssignmentId } = deltaDialog;
    const targetAssignment = assignments.find((a) => String(a?.id) === String(selectedAssignmentId));
    const targetView = assignmentViewById.get(String(selectedAssignmentId)) || null;
    if (!targetAssignment || !targetView) return;

    const oldQty = Math.max(1, toPositiveInt(targetAssignment.quantity, 1));
    const newQty = Math.max(0, oldQty - deltaCard.quantity);
    const nextCards = cards.filter((c) => String(c?.id) !== String(deltaCard.id));

    if (newQty === 0) {
      // 수량 0 -> 배정 전체 삭제
      const nextAssignments = assignments.filter((a) => String(a?.id) !== String(selectedAssignmentId));
      try {
        await persistBoardState(nextAssignments, nextCards);
        showNotification('수량이 0이 되어 배정이 삭제되었습니다.', 'info');
        setDeltaDialog(null);
      } catch (error) {
        showNotification(resolveBoardSaveErrorMessage(error, '처리에 실패했습니다.'), 'error');
      }
      return;
    }

    const proposalSeconds = resolveSecondsForProposal(targetAssignment);
    const lineDailyCapacitySeconds = Number(targetView.lineDailyCapacitySeconds || 0);
    const startIndex = toNonNegativeInt(targetAssignment.startIndex, 0);
    let newEndIndex = startIndex;
    if (proposalSeconds > 0 && lineDailyCapacitySeconds > 0) {
      const perPieceSeconds = proposalSeconds / oldQty;
      const durationDays = Math.ceil((perPieceSeconds * newQty) / lineDailyCapacitySeconds);
      newEndIndex = startIndex + Math.max(0, durationDays - 1);
    } else {
      newEndIndex = Math.max(startIndex, toNonNegativeInt(targetAssignment.endIndex, startIndex));
    }

    const nextAssignments = assignments.map((a) =>
      String(a?.id) === String(selectedAssignmentId) ? { ...a, quantity: newQty, endIndex: newEndIndex } : a
    );
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification(`수량 ${deltaCard.quantity}개가 차감되었습니다.`, 'success');
      setDeltaDialog(null);
    } catch (error) {
      showNotification(
        resolveBoardSaveErrorMessage(error, '수량 차감에 실패했습니다.'),
        'error'
      );
    }
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">작업 계획 협의</Typography>
            <Typography variant="body2" color="text.secondary">
              CT 상태와 작업 상태를 한 목록에서 함께 확인하고 요청 CT 등록, 동의, 진행/완료 전환을 처리합니다.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`${getAssignmentCtStatusLabel('PENDING')} ${statusSummary.pending}`}
              variant="outlined"
              sx={resolveCtStatusChipSx('PENDING')}
            />
            <Chip
              label={`${getAssignmentCtStatusLabel('SENT')} ${statusSummary.sent}`}
              variant="outlined"
              sx={resolveCtStatusChipSx('SENT')}
            />
            <Chip
              label={`${getAssignmentCtStatusLabel('REJECTED')} ${statusSummary.rejected}`}
              variant="outlined"
              sx={resolveCtStatusChipSx('REJECTED')}
            />
            <Chip
              label={`${getAssignmentCtStatusLabel('AGREED')} ${statusSummary.agreed}`}
              variant="outlined"
              sx={resolveCtStatusChipSx('AGREED')}
            />
            <Chip label={`진행 ${workStatusSummary.inProgress}`} color="default" variant="outlined" />
            <Chip label={`완료 ${workStatusSummary.completed}`} color="success" variant="outlined" />
          </Stack>
        </Box>
      }
    >
      {/* 메인 레이아웃: 좌측 전체 + 우측 슬라이드 패널 */}
      <Box ref={drawerContainerRef} sx={{ position: 'relative', overflow: 'hidden' }}>
        {/* 좌측 컬럼 (목록 + 달력) - 항상 전체 폭 */}
        <Box>
          <Stack spacing={1.5}>
            <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  작업 계획 목록
                </Typography>
                <Chip size="small" label={`${reviewAssignments.length}건`} variant="outlined" />
              </Box>
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>CT 상태</TableCell>
                    <TableCell>라인</TableCell>
                    <TableCell>고객</TableCell>
                    <TableCell>스타일</TableCell>
                    <TableCell align="right">수량</TableCell>
                    <TableCell align="right">예상 비용(한 벌)</TableCell>
                    <TableCell>예상 일정</TableCell>
                    <TableCell>진행률</TableCell>
                    <TableCell>작업 상태</TableCell>
                    <TableCell align="center">변경</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableStatusRow colSpan={10} message="불러오는 중..." sx={{ py: 2 }} />
                  ) : reviewAssignments.length === 0 ? (
                    <TableStatusRow colSpan={10} message="표시할 배정 작업이 없습니다." sx={{ py: 2 }} />
                  ) : (
                    reviewAssignments.map((assignment) => {
                      const statusMeta = STATUS_META[assignment.status] || STATUS_META.PENDING;
                      const rowSelected = String(selectedAssignment?.id || '') === String(assignment.id);
                      const isAgreed = assignment.status === 'AGREED';
                      const completionBusy = String(savingAssignmentId || '') === String(assignment.id);

                      return (
                        <TableRow
                          key={assignment.id}
                          hover
                          selected={rowSelected}
                          onClick={() => {
                            focusCalendarMonthForAssignment(assignment);
                            setSelectedAssignmentId(String(assignment.id));
                            setIsPanelOpen(true);
                          }}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Chip
                              size="small"
                              label={statusMeta.label}
                              variant="outlined"
                              sx={resolveCtStatusChipSx(assignment.status)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment?.line?.name || ('라인 ' + assignment.lineId)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {assignment?.factory?.name || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment.customer || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {assignment.label || '-'}
                              </Typography>
                              {assignment.ctOverride && (
                                <Chip size="small" label="CT 임시" color="warning" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {assignment.colorName || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatNumberWithCommas(assignment.quantity, {
                              fallback: '-',
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {assignment.perPieceCost == null ? '-' : formatCurrencyDong(assignment.perPieceCost)}
                          </TableCell>
                          <TableCell>{formatScheduleRange(baseDate, assignment)}</TableCell>
                          <TableCell sx={{ minWidth: 180 }}>
                            {assignment.progress?.progressPercent == null ? (
                              <Typography variant="caption" color="text.secondary">
                                기록 없음
                              </Typography>
                            ) : (
                              <Stack spacing={0.5}>
                                <Typography variant="caption" color="text.secondary">
                                  {`${formatNumberWithCommas(
                                    assignment.progress?.producedQuantity || 0,
                                    { fallback: '0', maximumFractionDigits: 0 }
                                  )} / ${
                                    assignment.progress?.baselineQuantity != null
                                      ? formatNumberWithCommas(assignment.progress.baselineQuantity, {
                                          fallback: '0',
                                          maximumFractionDigits: 0,
                                        })
                                      : '-'
                                  } (${formatPercentLabel(assignment.progress.progressPercent)})`}
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.max(
                                    0,
                                    Math.min(100, Number(assignment.progress.progressPercent) || 0)
                                  )}
                                  color={
                                    Number(assignment.progress?.overflowQuantity) > 0
                                      ? 'error'
                                      : Number(assignment.progress?.progressPercent) >= 100
                                        ? 'success'
                                        : 'primary'
                                  }
                                  sx={{ height: 8, borderRadius: 8 }}
                                />
                                {Number(assignment.progress?.overflowQuantity) > 0 && (
                                  <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
                                    {`초과 ${formatNumberWithCommas(
                                      assignment.progress.overflowQuantity,
                                      { fallback: '0', maximumFractionDigits: 0 }
                                    )}개`}
                                  </Typography>
                                )}
                              </Stack>
                            )}
                          </TableCell>
                          <TableCell sx={{ minWidth: 120 }}>
                            {isAgreed ? (
                              <Chip
                                size="small"
                                label={assignment.isCompleted ? '완료' : '진행'}
                                color={assignment.isCompleted ? 'success' : 'default'}
                                variant={assignment.isCompleted ? 'filled' : 'outlined'}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                CT 미확정
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center" sx={{ minWidth: 104 }}>
                            {isAgreed ? (
                              <Button
                                size="small"
                                variant={assignment.isCompleted ? 'outlined' : 'contained'}
                                color={assignment.isCompleted ? 'warning' : 'success'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleCompletion(assignment);
                                }}
                                disabled={Boolean(savingAssignmentId)}
                              >
                                {renderActionButtonLabel(
                                  assignment.isCompleted ? '진행' : '완료',
                                  completionBusy
                                )}
                              </Button>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                -
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* 미배정 풀 - 수량 변경 차이 카드 */}
            {deltaCards.length > 0 && (
              <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'warning.50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    미배정 풀 - 수량 변경 대기
                  </Typography>
                  <Chip size="small" label={`${deltaCards.length}건`} color="warning" variant="outlined" />
                </Box>
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {deltaCards.map((card) => (
                    <Box
                      key={card.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        py: 0.75,
                        bgcolor: card.deltaType === 'PLUS' ? 'success.50' : 'error.50',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: card.deltaType === 'PLUS' ? 'success.200' : 'error.200',
                      }}
                    >
                      <Chip
                        size="small"
                        label={`${card.deltaType === 'PLUS' ? '+' : '-'}${card.quantity}`}
                        color={card.deltaType === 'PLUS' ? 'success' : 'error'}
                        sx={{ fontWeight: 700, minWidth: 52 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {card.customer || '-'} / {card.label || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {card.colorName || '-'} · {card.gender || '-'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexShrink={0}>
                        {card.deltaType === 'PLUS' ? (
                          <>
                            <Button size="small" variant="outlined" color="success" onClick={() => handleDeltaAssignOpen(card)}>
                              라인 배정
                            </Button>
                            <Button size="small" variant="outlined" onClick={() => handleDeltaAbsorbOpen(card)}>
                              흡수
                            </Button>
                          </>
                        ) : (
                          <Button size="small" variant="outlined" color="error" onClick={() => handleDeltaDeductOpen(card)}>
                            수량 차감
                          </Button>
                        )}
                        <Button size="small" variant="text" color="inherit" onClick={() => handleDeltaCardRemove(card.id)}>
                          제거
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                </Box>
              </Paper>
            )}

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 1,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  계획 일정 달력 (월)
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
                    title="이전 달"
                    sx={{ p: 0.25 }}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <CustomDatePicker
                    value={calendarMonth}
                    onChange={(val) => { if (val?.isValid?.()) setCalendarMonth(toMonthStart(val.toDate())); }}
                  />
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', mx: 0.25 }}>~</Typography>
                  <CustomDatePicker
                    value={calendarMonthEnd}
                    onChange={(val) => { if (val?.isValid?.()) setCalendarMonth(toMonthStart(val.toDate())); }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
                    title="다음 달"
                    sx={{ p: 0.25 }}
                  >
                    <ChevronRightIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <Stack sx={{ gap: '2px' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
                      sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                    >
                      M+
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
                      sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                    >
                      M-
                    </Button>
                  </Stack>
                </Box>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ px: 0.25, mb: 1, flexWrap: 'wrap' }}>
                {calendarLegend.map((item) => {
                  const meta = CALENDAR_CT_STATUS_META[item.status];
                  return (
                    <Chip
                      key={item.status}
                      size="small"
                      label={item.label}
                      variant="outlined"
                      sx={{
                        bgcolor: meta.cardBg,
                        color: meta.labelColor,
                        borderColor: meta.borderColor,
                        fontWeight: 700,
                      }}
                    />
                  );
                })}
                <Chip
                  size="small"
                  label="<< / >> 연속"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Stack>

              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {/* 요일 헤더 - 일요일은 빨간색 */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                  {CALENDAR_WEEKDAYS.map((weekday, index) => (
                    <Box
                      key={`weekday-${weekday}`}
                      sx={{
                        px: 0.75,
                        py: 0.5,
                        bgcolor: 'grey.100',
                        borderBottom: '1px solid',
                        borderRight: index < 6 ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: index === 0 ? 'error.main' : 'text.secondary',
                        }}
                      >
                        {weekday}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* 주차별 렌더링 - 날짜 행 + 이벤트 바 행 */}
                {calendarBarData.map(({ weekDays, segments, laneCount }, weekIndex) => {
                  const isLastWeek = weekIndex === calendarBarData.length - 1;
                  const barAreaHeight = Math.max(
                    CALENDAR_BAR_HEIGHT + CALENDAR_BAR_GAP * 2,
                    laneCount * (CALENDAR_BAR_HEIGHT + CALENDAR_BAR_GAP) + CALENDAR_BAR_GAP
                  );

                  return (
                    <Box key={weekIndex}>
                      {/* 날짜 숫자 행 */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                        {weekDays.map((date, dayIndex) => {
                          const dateKey = buildDateKey(date);
                          const inCurrentMonth = isSameMonth(date, calendarMonth);
                          const isToday = dateKey === todayKey;
                          const inSelectedRange = selectedAssignmentDateKeys.has(dateKey);
                          const isSunday = dayIndex === 0;

                          return (
                            <Box
                              key={dateKey}
                              sx={{
                                px: 0.75,
                                py: 0.5,
                                borderRight: dayIndex < 6 ? '1px solid' : 'none',
                                borderColor: 'divider',
                                bgcolor: inSelectedRange
                                  ? 'rgba(25, 118, 210, 0.10)'
                                  : inCurrentMonth
                                    ? 'background.paper'
                                    : 'grey.50',
                                opacity: inCurrentMonth ? 1 : 0.55,
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  bgcolor: isToday ? 'primary.main' : 'transparent',
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: isToday || inSelectedRange ? 700 : 500,
                                    color: isToday ? 'white' : isSunday ? 'error.main' : 'inherit',
                                  }}
                                >
                                  {date.getDate()}
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>

                      {/* 이벤트 바 행 */}
                      <Box
                        sx={{
                          position: 'relative',
                          height: barAreaHeight,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                          borderBottom: !isLastWeek ? '1px solid' : 'none',
                          borderColor: 'divider',
                        }}
                      >
                        {/* 배경 셀 (테두리 유지) */}
                        {weekDays.map((date, dayIndex) => {
                          const dateKey = buildDateKey(date);
                          const inCurrentMonth = isSameMonth(date, calendarMonth);
                          const inSelectedRange = selectedAssignmentDateKeys.has(dateKey);
                          return (
                            <Box
                              key={dateKey}
                              sx={{
                                borderRight: dayIndex < 6 ? '1px solid' : 'none',
                                borderColor: 'divider',
                                bgcolor: inSelectedRange
                                  ? 'rgba(25, 118, 210, 0.05)'
                                  : inCurrentMonth
                                    ? 'background.paper'
                                    : 'grey.50',
                                opacity: inCurrentMonth ? 1 : 0.55,
                              }}
                            />
                          );
                        })}

                        {/* 연속 이벤트 바 (주차별 span bar) */}
                        {segments.map(({ assignment, startUnit, endUnit, laneIndex, isClippedLeft, isClippedRight }) => {
                          const segKey = `${assignment.id}-${weekIndex}-${laneIndex}`;
                          const isSelected = String(assignment.id) === String(selectedAssignment?.id);
                          const statusMeta = CALENDAR_CT_STATUS_META[normalizeCtStatus(assignment?.status ?? assignment?.ctStatus)] || CALENDAR_CT_STATUS_META.PENDING;

                          return (
                            <CalendarAssignmentBar
                              key={segKey}
                              assignment={assignment}
                              startUnit={startUnit}
                              endUnit={endUnit}
                              laneIndex={laneIndex}
                              statusMeta={statusMeta}
                              isSelected={isSelected}
                              isClippedLeft={isClippedLeft}
                              isClippedRight={isClippedRight}
                              onClick={() => {
                                focusCalendarMonthForAssignment(assignment);
                                setSelectedAssignmentId(String(assignment.id));
                                setIsPanelOpen(true);
                              }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          </Stack>
        </Box>

        {/* 우측 Drawer (선택 시 화면 우측에서 슬라이드) */}
        <Drawer
          anchor="right"
          open={isPanelOpen && Boolean(selectedAssignment)}
          onClose={() => setIsPanelOpen(false)}
          PaperProps={{
            sx: {
              position: 'absolute',
              width: { xs: '100%', md: '80%' },
              height: '100%',
              overflowY: 'auto',
              p: 2.5,
            },
          }}
          ModalProps={{ container: () => drawerContainerRef.current, disablePortal: true }}
        >
          <Box sx={{ width: '100%' }}>
            {selectedAssignment && (
              <Stack spacing={1.5}>
                {/* 패널 헤더 */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    선택한 계획 상세
                  </Typography>
                  <Button size="small" color="inherit" onClick={() => setIsPanelOpen(false)}>
                    닫기
                  </Button>
                </Box>

                {/* 작업 상세 + CT/비용 요약 - 50/50 가로 배치 */}
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  {/* 작업 상세 */}
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    작업 상세
                  </Typography>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>고객:</strong> {selectedAssignment.customer || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>스타일:</strong> {selectedAssignment.label || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>색상/성별:</strong>{' '}
                      {selectedAssignment.colorName || '-'}
                      {selectedAssignment.gender ? ` / ${selectedAssignment.gender}` : ''}
                    </Typography>
                    <Typography variant="body2">
                      <strong>수량:</strong>{' '}
                      {formatNumberWithCommas(selectedAssignment.quantity, {
                        fallback: '-',
                        maximumFractionDigits: 0,
                      })}
                    </Typography>
                    <Typography variant="body2">
                      <strong>라인:</strong>{' '}
                      {selectedAssignment?.line?.name || `라인 ${selectedAssignment.lineId}`}
                    </Typography>
                    <Typography variant="body2">
                      <strong>공장:</strong> {selectedAssignment?.factory?.name || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>예상 일정:</strong> {formatScheduleRange(baseDate, selectedAssignment)}
                    </Typography>
                  </Stack>
                  </Paper>

                  {/* CT/비용 요약 */}
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    CT/비용 요약
                  </Typography>
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        공정 ST 합 (한 벌)
                      </Typography>
                      <Typography variant="body2">
                        {formatSecondsLabel(selectedCostSummary?.totalBasePerPieceSeconds)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        공정 제안 CT 합 (한 벌)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatSecondsLabel(selectedCostSummary?.totalSuggestedPerPieceSeconds)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        공정 요청 CT 합 (한 벌)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatSecondsLabel(selectedCostSummary?.totalProposedPerPieceSeconds)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        AT 예측 합 (한 벌)
                      </Typography>
                      <Typography variant="body2">
                        {selectedCostSummary?.totalAtPerPieceSeconds == null
                          ? '-'
                          : formatSecondsLabel(selectedCostSummary.totalAtPerPieceSeconds)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        AT vs ST 차이율
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: selectedCostSummary?.needsStReview ? 700 : 400,
                          color:
                            selectedCostSummary?.atVsBasePercent == null
                              ? 'text.secondary'
                              : selectedCostSummary.atVsBasePercent > 0
                                ? 'error.main'
                                : 'success.main',
                        }}
                      >
                        {formatPercentLabel(selectedCostSummary?.atVsBasePercent)}
                      </Typography>
                    </Box>
                    {selectedCostSummary?.atCoverageCount > 0 &&
                      selectedCostSummary.atCoverageCount < selectedProcessRows.length && (
                        <Typography variant="caption" color="text.secondary">
                          AT 데이터 보유 공정: {selectedCostSummary.atCoverageCount}/{selectedProcessRows.length}
                        </Typography>
                      )}
                    {selectedCostSummary?.needsStReview && (
                      <Alert severity="warning">
                        ST 조정 필요: 현재 AT 예측이 ST 대비 {formatPercentLabel(selectedCostSummary.atVsBasePercent)}
                      </Alert>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        한 벌 배정 공임
                      </Typography>
                      <Typography variant="body2">
                        {selectedCostSummary?.perPieceCost == null
                          ? '-'
                          : formatCurrencyDong(selectedCostSummary.perPieceCost)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        주문 총 배정 공임
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedCostSummary?.totalCost == null
                          ? '-'
                          : formatCurrencyDong(selectedCostSummary.totalCost)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        예상 기간
                      </Typography>
                      <Typography variant="body2">
                        {formatDaysLabel(selectedCostSummary?.totalDurationDays)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        라인 인원
                      </Typography>
                      <Typography variant="body2">{selectedAssignment.headcount}명</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        1인당 기대 공임
                      </Typography>
                      <Typography variant="body2">
                        {selectedCostSummary?.perPersonExpectedCost == null
                          ? '-'
                          : formatCurrencyDong(selectedCostSummary.perPersonExpectedCost)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        월환산 1인 기대 공임
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedCostSummary?.monthlyPerPersonExpected == null
                          ? '-'
                          : formatCurrencyDong(selectedCostSummary.monthlyPerPersonExpected)}
                      </Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        제안 CT(전체)
                      </Typography>
                      <Typography variant="body2">
                        {formatSecondsLabel(selectedCostSummary?.totalSuggestedSeconds, '0초')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        요청 CT(전체)
                      </Typography>
                      <Typography variant="body2">
                        {formatSecondsLabel(selectedCostSummary?.totalProposedSeconds, '0초')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        동의 CT(전체)
                      </Typography>
                      <Typography variant="body2">
                          {selectedCtStatus === 'AGREED'
                            ? formatSecondsLabel(selectedAssignment.agreedSeconds, '0초')
                            : '-'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        동의자
                      </Typography>
                      <Typography variant="body2">
                        {selectedCtStatus === 'AGREED'
                          ? selectedAssignment.ctAgreedBy || '-'
                          : '-'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        초당 공임
                      </Typography>
                      <Typography variant="body2">
                        {selectedAssignment.wagePerSecond == null
                          ? '미설정'
                          : `${formatNumberWithCommas(selectedAssignment.wagePerSecond, {
                              fallback: '0',
                              maximumFractionDigits: 2,
                            })} 동/초`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        동의 비용
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedCtStatus !== 'AGREED' || selectedAssignment.agreedCost == null
                          ? '-'
                          : formatCurrencyDong(selectedAssignment.agreedCost)}
                      </Typography>
                    </Box>
                  </Stack>
                  </Paper>
                </Box>

                {/* 공정 CT 상세 / 라인장 요청 및 하단 동의/조정 버튼 배치 */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    공정 CT 상세 / 라인장 요청
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    요청 CT를 입력해 변경 요청하면 운영팀 검토 대상으로 전달되며 현재 라인 배정은 유지됩니다.
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  {selectedProcessRows.length === 0 ? (
                    <Alert severity="info">연결된 스타일 공정 정보가 없어 공정별 CT를 표시할 수 없습니다.</Alert>
                  ) : (
                    <TableContainer sx={{ maxHeight: 360 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell align="right">#</TableCell>
                            <TableCell>공정</TableCell>
                            <TableCell align="right">{`PT(${PT_REFERENCE_QUANTITY_LABEL})`}</TableCell>
                            <TableCell align="right">{`AT(${selectedQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`ST(${selectedQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`제안 CT(${selectedQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`요청 CT(${selectedQuantityLabel})`}</TableCell>
                            <TableCell align="right">{`확정 CT(${selectedQuantityLabel})`}</TableCell>
                            <TableCell align="right">단가(동)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedProcessRows.map((row, index) => (
                            <TableRow key={row.processKey}>
                              <TableCell align="right">{index + 1}</TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {row.processName}
                                </Typography>
                              </TableCell>
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
                                {formatNumberWithCommas(row.baseSeconds, {
                                  fallback: '0',
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell align="right">
                                {formatNumberWithCommas(row.suggestedSeconds, {
                                  fallback: '0',
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell align="right">
                                {selectedCtStatus === 'AGREED' ? (
                                  row.proposedSeconds == null
                                    ? '-'
                                    : formatNumberWithCommas(row.proposedSeconds, {
                                        fallback: '0',
                                        maximumFractionDigits: 2,
                                      })
                                ) : (
                                  <TextField
                                    size="small"
                                    value={selectedDraftByProcess[row.processKey] ?? ''}
                                    placeholder={
                                      row.suggestedSeconds > 0
                                        ? String(
                                            formatNumberWithCommas(row.suggestedSeconds, {
                                              fallback: '0',
                                              maximumFractionDigits: 2,
                                            })
                                          )
                                        : ''
                                    }
                                    onChange={(event) =>
                                      handleProcessProposalInputChange(
                                        selectedAssignment.id,
                                        row.processKey,
                                        event.target.value
                                      )
                                    }
                                    inputProps={{
                                      inputMode: 'decimal',
                                      pattern: '\\d*(\\.\\d{0,2})?',
                                      style: { textAlign: 'right' },
                                    }}
                                    sx={{ width: 90 }}
                                  />
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {selectedCtStatus !== 'AGREED' || row.confirmedSeconds == null
                                  ? '-'
                                  : formatNumberWithCommas(row.confirmedSeconds, {
                                      fallback: '0',
                                      maximumFractionDigits: 2,
                                    })}
                              </TableCell>
                              <TableCell align="right">
                                {selectedAssignment.wagePerSecond == null ? (
                                  '-'
                                ) : selectedCtStatus === 'AGREED' ? (
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
                              {selectedCostSummary?.totalBasePerPieceSeconds == null
                                ? '-'
                                : formatNumberWithCommas(selectedCostSummary.totalBasePerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {selectedCostSummary?.totalSuggestedPerPieceSeconds == null
                                ? '-'
                                : formatNumberWithCommas(selectedCostSummary.totalSuggestedPerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {selectedCostSummary?.totalProposedPerPieceSeconds == null
                                ? '-'
                                : formatNumberWithCommas(selectedCostSummary.totalProposedPerPieceSeconds, {
                                    fallback: '0',
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {selectedCtStatus === 'AGREED' &&
                              selectedCostSummary?.totalConfirmedPerPieceSeconds != null
                                ? formatNumberWithCommas(
                                    selectedCostSummary.totalConfirmedPerPieceSeconds,
                                    {
                                      fallback: '0',
                                      maximumFractionDigits: 2,
                                    }
                                  )
                                : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {selectedAssignment.wagePerSecond == null ? (
                                '-'
                              ) : selectedCtStatus === 'AGREED' &&
                                selectedCostSummary?.totalConfirmedPerPieceSeconds != null ? (
                                formatCurrencyDong(
                                  selectedCostSummary.totalConfirmedPerPieceSeconds *
                                    selectedAssignment.wagePerSecond
                                )
                              ) : (
                                <Stack spacing={0.1} alignItems="flex-end">
                                  <Typography variant="caption" color="text.secondary">
                                    {`제안 ${
                                      selectedCostSummary?.totalSuggestedPerPieceSeconds == null
                                        ? '-'
                                        : formatCurrencyDong(
                                            selectedCostSummary.totalSuggestedPerPieceSeconds *
                                              selectedAssignment.wagePerSecond
                                          )
                                    }`}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {`요청 ${
                                      selectedCostSummary?.totalProposedPerPieceSeconds == null
                                        ? '-'
                                        : formatCurrencyDong(
                                            selectedCostSummary.totalProposedPerPieceSeconds *
                                              selectedAssignment.wagePerSecond
                                          )
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
                    {selectedCostSummary?.directProposalCount > 0
                      ? `요청 CT 반영 공정: ${selectedCostSummary.directProposalCount}개`
                      : '요청값이 없으면 제안 CT 기준으로 동의 처리할 수 있습니다.'}
                  </Typography>

                  {/* 동의 / 조정 요청 버튼 - 공정 CT 카드 하단 */}
                  <Divider sx={{ mt: 1.5, mb: 1.5 }} />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      variant={hasCtAdjustment ? 'outlined' : 'contained'}
                      onClick={() => handleAgree(selectedAssignment.id)}
                      disabled={selectedAssignmentBusy || selectedCtStatus === 'AGREED' || hasCtAdjustment}
                    >
                      {renderActionButtonLabel(
                        selectedCtStatus === 'AGREED' ? '동의됨' : '동의',
                        selectedAssignmentBusy
                      )}
                    </Button>
                    <Button
                      size="small"
                      variant={hasCtAdjustment ? 'contained' : 'outlined'}
                      color="warning"
                      onClick={() => handleRequestAdjustment(selectedAssignment.id)}
                      disabled={selectedAssignmentBusy || !hasCtAdjustment}
                    >
                      {renderActionButtonLabel('변경 요청', selectedAssignmentBusy)}
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            )}
          </Box>
        </Drawer>
      </Box>

      {/* 차이 카드 액션 Dialog */}
      <Dialog open={Boolean(deltaDialog)} onClose={handleDeltaDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {deltaDialog?.mode === 'ASSIGN'
            ? '라인 배정'
            : deltaDialog?.mode === 'ABSORB'
            ? '기존 배정에 수량 흡수'
            : '수량 차감'}
        </DialogTitle>
        <DialogContent>
          {deltaDialog && (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Box>
                <Typography variant="body2">
                  <strong>차이 카드:</strong> {deltaDialog.deltaCard.customer} / {deltaDialog.deltaCard.label}
                  {deltaDialog.deltaCard.colorName ? ` · ${deltaDialog.deltaCard.colorName}` : ''}
                  {deltaDialog.deltaCard.gender ? ` · ${deltaDialog.deltaCard.gender}` : ''}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>수량:</strong>{' '}
                  <Chip
                    size="small"
                    label={`${deltaDialog.deltaCard.deltaType === 'PLUS' ? '+' : '-'}${deltaDialog.deltaCard.quantity}`}
                    color={deltaDialog.deltaCard.deltaType === 'PLUS' ? 'success' : 'error'}
                  />
                </Typography>
              </Box>

              {deltaDialog.mode === 'ASSIGN' && (
                <>
                  <FormControl size="small" fullWidth>
                    <InputLabel>배정 라인</InputLabel>
                    <Select
                      value={deltaDialog.selectedLineId || ''}
                      label="배정 라인"
                      onChange={(e) => setDeltaDialog((prev) => ({ ...prev, selectedLineId: e.target.value }))}
                    >
                      {lines.map((line) => (
                        <MenuItem key={line.id} value={String(line.id)}>
                          {line.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      label="시작일 (오늘로부터 N일)"
                      type="number"
                      value={deltaDialog.startOffset ?? '0'}
                      onChange={(e) => {
                        const v = String(Math.max(0, Number(e.target.value)) || 0);
                        setDeltaDialog((prev) => ({ ...prev, startOffset: v }));
                      }}
                      inputProps={{ min: 0 }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="종료일 (오늘로부터 N일)"
                      type="number"
                      value={deltaDialog.endOffset ?? '0'}
                      onChange={(e) => {
                        const v = String(Math.max(0, Number(e.target.value)) || 0);
                        setDeltaDialog((prev) => ({ ...prev, endOffset: v }));
                      }}
                      inputProps={{ min: 0 }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                </>
              )}

              {(deltaDialog.mode === 'ABSORB' || deltaDialog.mode === 'DEDUCT') && (
                deltaDialog.matchingAssignments?.length === 0 ? (
                  <Alert severity="warning">
                    동일 스타일/색상/성별의 배정 카드가 없습니다.
                  </Alert>
                ) : (
                  <FormControl size="small" fullWidth>
                    <InputLabel>대상 배정 선택</InputLabel>
                    <Select
                      value={deltaDialog.selectedAssignmentId || ''}
                      label="대상 배정 선택"
                      onChange={(e) => setDeltaDialog((prev) => ({ ...prev, selectedAssignmentId: e.target.value }))}
                    >
                      {(deltaDialog.matchingAssignments || []).map((a) => (
                        <MenuItem key={a.id} value={String(a.id)}>
                          {a.line?.name || `라인 ${a.lineId}`} · {a.quantity}개 · {formatScheduleRange(baseDate, a)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeltaDialogClose}>취소</Button>
          <Button
            variant="contained"
            color={deltaDialog?.mode === 'DEDUCT' ? 'error' : 'primary'}
            onClick={
              deltaDialog?.mode === 'ASSIGN'
                ? handleDeltaAssignConfirm
                : deltaDialog?.mode === 'ABSORB'
                ? handleDeltaAbsorbConfirm
                : handleDeltaDeductConfirm
            }
            disabled={
              deltaDialog?.mode === 'ASSIGN'
                ? !deltaDialog?.selectedLineId
                : !deltaDialog?.selectedAssignmentId
            }
          >
            {deltaDialog?.mode === 'ASSIGN'
              ? '배정'
              : deltaDialog?.mode === 'ABSORB'
              ? '수량 흡수'
              : '수량 차감'}
          </Button>
        </DialogActions>
      </Dialog>

    </AppPageContainer>
  );
};

export default ProductionPlanBoard;
