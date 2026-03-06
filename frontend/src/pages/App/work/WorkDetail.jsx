import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { koKR as datePickerKoKR } from '@mui/x-date-pickers/locales';
import CloseIcon from '@mui/icons-material/Close';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import SearchableSelect from '../../../components/SearchableSelect';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { fetchAttributes } from '../../../utils/attributeApi';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import WorkerLog from './WorkerLog';

const buildLogId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const buildItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const buildEmptyItem = () => ({
  id: buildItemId(),
  card: null,
  assignmentPlanId: null,
  customer: null,
  style: null,
  process: null,
  color: null,
  quantity: '',
});
const buildWorkerLog = () => ({
  id: buildLogId(),
  worker: null,
  items: [buildEmptyItem()],
});
const buildFocusToken = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const normalizeKeyPart = (value) => String(value ?? '').trim().toLowerCase();
const resolveWorkerKey = (worker) => normalizeKeyPart(worker?.id ?? worker?.name);
const resolveCustomerKey = (customer) => normalizeKeyPart(customer?.id ?? customer?.name);
const resolveStyleKey = (style) => normalizeKeyPart(style?.id ?? style?.name);
const resolveColorKey = (color) => normalizeKeyPart(color?.id ?? color?.code ?? color?.name);
const resolveProcessKey = (process) =>
  normalizeKeyPart(process?.processKey ?? process?.code ?? process?.name ?? process?.id);
const buildProcessComboKey = ({ worker, customer, style, color, process }) => {
  const workerKey = resolveWorkerKey(worker);
  const customerKey = resolveCustomerKey(customer);
  const styleKey = resolveStyleKey(style);
  const colorKey = resolveColorKey(color);
  const processKey = resolveProcessKey(process);

  if (!workerKey || !customerKey || !styleKey || !colorKey || !processKey) return '';
  return `${workerKey}::${customerKey}::${styleKey}::${colorKey}::${processKey}`;
};
const hasDuplicateProcessCombo = (workerLogs = []) => {
  const seen = new Set();
  for (const log of workerLogs) {
    const item = Array.isArray(log?.items) ? log.items[0] : null;
    const key = buildProcessComboKey({
      worker: log?.worker,
      customer: item?.customer,
      style: item?.style,
      color: item?.color,
      process: item?.process,
    });
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
const findDuplicateWorkerLogIndex = (workerLogs = []) =>
  workerLogs.findIndex((_log, index) =>
    hasDuplicateProcessCombo(workerLogs.slice(0, index + 1))
  );
const equalsText = (left, right) =>
  String(left || '').trim() === String(right || '').trim();
const DISPLAY_NAME_COLLATOR = new Intl.Collator('ko', {
  numeric: true,
  sensitivity: 'base',
});
const normalizeDisplayText = (value) => String(value || '').trim();
const compareDisplayText = (left, right) =>
  DISPLAY_NAME_COLLATOR.compare(normalizeDisplayText(left), normalizeDisplayText(right));
const sortByDisplayLabel = (items = [], getLabel = (item) => item?.name || '') =>
  [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const labelComparison = compareDisplayText(getLabel(left), getLabel(right));
    if (labelComparison !== 0) return labelComparison;

    const secondaryComparison = compareDisplayText(
      left?.name ?? left?.label ?? left?.email ?? '',
      right?.name ?? right?.label ?? right?.email ?? ''
    );
    if (secondaryComparison !== 0) return secondaryComparison;

    return compareDisplayText(left?.id ?? left?.dbId ?? '', right?.id ?? right?.dbId ?? '');
  });
const stripCardGenderSuffix = (value) =>
  String(value || '')
    .replace(/\s*\[(M|W|U)\]\s*$/i, '')
    .trim();
const findStyleFromCard = ({ styles, customerName, label }) => {
  const rawLabel = String(label || '').trim();
  const normalizedLabel = stripCardGenderSuffix(rawLabel);
  const labelCandidates = Array.from(
    new Set([rawLabel, normalizedLabel].filter(Boolean))
  );
  if (labelCandidates.length === 0) return null;

  return (
    styles.find((style) => {
      if (customerName && !equalsText(style?.customer, customerName)) return false;
      return labelCandidates.some(
        (candidate) =>
          equalsText(style?.name, candidate) ||
          equalsText(style?.styleCode, candidate) ||
          equalsText(style?.styleId, candidate) ||
          equalsText(style?.id, candidate)
      );
    }) || null
  );
};
const findCustomerValue = (customers, customerName, fallbackIndex) => {
  if (!customerName) return null;
  return (
    customers.find((customer) => equalsText(customer?.name, customerName)) || {
      id: `virtual-customer-${fallbackIndex}`,
      name: customerName,
    }
  );
};
const findStyleValue = (styles, record, fallbackIndex) => {
  if (!record) return null;

  const styleId = record.styleId;
  const styleName = record.styleName;
  const customerName = record.customerName;

  if (styleId) {
    const byId = styles.find((style) => String(style?.id || '') === String(styleId));
    if (byId) return byId;
  }

  if (styleName) {
    const byName = styles.find((style) => {
      if (!equalsText(style?.name, styleName)) return false;
      if (!customerName) return true;
      return equalsText(style?.customer, customerName);
    });
    if (byName) return byName;
  }

  if (!styleId && !styleName) return null;
  return {
    id: styleId || `virtual-style-${fallbackIndex}`,
    name: styleName || `스타일 ${styleId || ''}`,
    customer: customerName || '',
    processes: [],
  };
};
const findProcessValue = (record, styleValue, fallbackIndex) => {
  if (!record?.processCode && !record?.processName) return null;

  const processes = Array.isArray(styleValue?.processes) ? styleValue.processes : [];
  if (record?.processCode) {
    const byCode = processes.find((process) => equalsText(process?.code, record.processCode));
    if (byCode) return byCode;
  }
  if (record?.processName) {
    const byName = processes.find((process) => equalsText(process?.name, record.processName));
    if (byName) return byName;
  }

  const ctSeconds = Number(record?.ctSeconds) || 0;
  return {
    id: `virtual-process-${fallbackIndex}`,
    code: record?.processCode || '',
    name: record?.processName || '공정',
    ctSeconds,
    contractedSeconds: ctSeconds,
  };
};
const findColorValue = (colors, record, fallbackIndex) => {
  if (!record) return null;

  const colorId = record.colorId;
  const colorCode = record.colorCode;
  const colorName = record.colorName;

  if (colorId !== null && colorId !== undefined && colorId !== '') {
    const byId = colors.find((color) => String(color?.id || '') === String(colorId));
    if (byId) return byId;
  }

  if (colorCode) {
    const byCode = colors.find((color) => equalsText(color?.code, colorCode));
    if (byCode) return byCode;
  }

  if (colorName) {
    const byName = colors.find((color) => equalsText(color?.name, colorName));
    if (byName) return byName;
  }

  if (!colorId && !colorCode && !colorName) return null;
  return {
    id: colorId || `virtual-color-${fallbackIndex}`,
    code: colorCode || '',
    name: colorName || colorCode || '색상',
  };
};
const findWorkerValue = (employees, record, fallbackIndex) => {
  if (record?.workerId !== null && record?.workerId !== undefined && record.workerId !== '') {
    const matched = employees.find(
      (employee) => String(employee?.id || '') === String(record.workerId)
    );
    if (matched) return matched;
  }
  if (record?.workerName) {
    const matchedByName = employees.find((employee) =>
      equalsText(employee?.name, record.workerName)
    );
    if (matchedByName) return matchedByName;
  }

  const workerName = String(record?.workerName || '').trim();
  if (!workerName) return null;
  return {
    id: record?.workerId || `virtual-worker-${fallbackIndex}`,
    name: workerName,
  };
};
const resolvePlanStyleValue = ({ plan, styles, fallbackIndex }) => {
  if (!plan) return null;

  const styleId = String(plan?.styleId || '').trim();
  if (styleId) {
    const byId = styles.find((style) => String(style?.id || '') === styleId);
    if (byId) return byId;

    const byStyleCode = styles.find((style) => equalsText(style?.styleCode, styleId));
    if (byStyleCode) return byStyleCode;
  }

  const matchedStyle = findStyleFromCard({
    styles,
    customerName: plan?.customer,
    label: plan?.label,
  });
  if (matchedStyle) return matchedStyle;

  const fallbackStyleName = stripCardGenderSuffix(plan?.label) || plan?.label;
  if (!fallbackStyleName && !styleId) return null;

  return {
    id: styleId || `virtual-style-${fallbackIndex}`,
    name: fallbackStyleName || `스타일 ${fallbackIndex + 1}`,
    customer: plan?.customer || '',
    processes: [],
  };
};
const resolvePlanCustomerValue = ({ plan, customers, fallbackIndex }) =>
  findCustomerValue(customers, plan?.customer, fallbackIndex);
const resolvePlanColorValue = ({ plan, colors, fallbackIndex }) => {
  const matchedColor =
    colors.find(
      (color) =>
        equalsText(color?.name, plan?.colorName) ||
        equalsText(color?.code, plan?.color) ||
        equalsText(color?.code, plan?.colorName)
    ) || null;
  if (matchedColor) return matchedColor;
  if (!plan?.colorName && !plan?.color) return null;

  return {
    id: plan?.color || `virtual-color-${fallbackIndex}`,
    code: plan?.color || '',
    name: plan?.colorName || plan?.color || '색상',
  };
};
const buildAgreedSnapshotByProcess = (plan) => {
  const assignmentStatus = String(plan?.ctStatus || '').trim().toUpperCase();
  const agreedSnapshot = plan?.ctAgreedSnapshot;
  const orderQuantity = Math.max(1, resolveAssignmentPlanBaselineQuantity(plan) ?? 1);
  const agreedSnapshotQuantity = Math.max(
    1,
    toPositiveIdOrNull(agreedSnapshot?.quantity) ?? orderQuantity
  );
  const canUseAgreedSnapshot =
    assignmentStatus === 'AGREED' &&
    agreedSnapshot &&
    agreedSnapshotQuantity === orderQuantity &&
    (!plan?.id ||
      !agreedSnapshot?.sourceAssignmentId ||
      String(agreedSnapshot.sourceAssignmentId) === String(plan.id));

  const sourceRows =
    canUseAgreedSnapshot && Array.isArray(agreedSnapshot?.processes)
      ? agreedSnapshot.processes
      : [];

  return sourceRows.reduce((map, item) => {
    const processKey = String(item?.processKey || '').trim();
    if (!processKey) return map;
    map.set(processKey, {
      processKey,
      name: String(item?.name || '').trim() || '공정',
      agreedSeconds: Number(item?.agreedSeconds) || 0,
      requestedSeconds: Number(
        item?.requestedSeconds ??
          item?.lineRequestedSeconds ??
          item?.proposedSeconds ??
          item?.agreedSeconds
      ) || 0,
      proposedSeconds: Number(
        item?.proposedSeconds ?? item?.stSeconds ?? item?.suggestedSeconds
      ) || 0,
    });
    return map;
  }, new Map());
};
const buildProcessKey = (process, index = 0) =>
  String(process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`);

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.round(parsed) : 0;
};

const resolveFirstPositiveSeconds = (...values) => {
  for (const value of values) {
    const seconds = toSeconds(value);
    if (seconds > 0) return seconds;
  }
  return 0;
};

const resolveCtSeconds = (process) => {
  if (!process) return 0;
  return resolveFirstPositiveSeconds(
    process.ctSeconds,
    process.contractedSeconds,
    process.ct,
    process.at,
    process.pt
  );
};
const toResolvedProcessShape = (process, fallbackId, agreedSnapshotEntry = null) => {
  if (!process || typeof process !== 'object') return null;
  const ctSeconds = resolveFirstPositiveSeconds(
    agreedSnapshotEntry?.agreedSeconds,
    agreedSnapshotEntry?.requestedSeconds,
    agreedSnapshotEntry?.proposedSeconds,
    process.ct,
    process.ctSeconds,
    process.contractedSeconds,
    process.at,
    process.pt
  );
  return {
    id: process.instanceId || process.id || fallbackId,
    processKey: process.instanceId || process.id || process.code || fallbackId,
    code: process.code || '',
    name: process.name || agreedSnapshotEntry?.name || '공정',
    pt: process.pt,
    at: process.at,
    ctSeconds,
    contractedSeconds: resolveFirstPositiveSeconds(ctSeconds, process.contractedSeconds),
  };
};
const buildProcessOptionsForAssignmentCard = ({ card, style }) => {
  const styleProcesses = Array.isArray(style?.processes) ? style.processes : [];
  const agreedSnapshotByProcess = buildAgreedSnapshotByProcess(card);
  const options = styleProcesses
    .map((process, index) =>
      toResolvedProcessShape(
        process,
        `style-process-${style?.id || card?.dbId || 'item'}-${index}`,
        agreedSnapshotByProcess.get(buildProcessKey(process, index)) ?? null
      )
    )
    .filter(Boolean);

  agreedSnapshotByProcess.forEach((snapshotEntry, processKey) => {
    if (options.some((option) => option.processKey === processKey)) return;
    options.push({
      id: processKey,
      processKey,
      code: '',
      name: snapshotEntry.name || '공정',
      pt: null,
      at: null,
      ctSeconds: resolveFirstPositiveSeconds(
        snapshotEntry.agreedSeconds,
        snapshotEntry.requestedSeconds,
        snapshotEntry.proposedSeconds
      ),
      contractedSeconds: resolveFirstPositiveSeconds(
        snapshotEntry.agreedSeconds,
        snapshotEntry.requestedSeconds,
        snapshotEntry.proposedSeconds
      ),
    });
  });

  return options;
};
const resolveProcessForRecord = ({ record, card, style, fallbackIndex }) => {
  if (!record?.processCode && !record?.processName) return null;

  const processOptions = buildProcessOptionsForAssignmentCard({ card, style });
  if (record?.processCode) {
    const byCode = processOptions.find((process) => equalsText(process?.code, record.processCode));
    if (byCode) return byCode;
  }
  if (record?.processName) {
    const byName = processOptions.find((process) => equalsText(process?.name, record.processName));
    if (byName) return byName;
  }
  if (processOptions.length === 1) return processOptions[0];

  const ctSeconds = Number(record?.ctSeconds) || 0;
  return {
    id: `virtual-process-${fallbackIndex}`,
    processKey: `virtual-process-${fallbackIndex}`,
    code: record?.processCode || '',
    name: record?.processName || '공정',
    ctSeconds,
    contractedSeconds: ctSeconds,
  };
};
const buildWorkerLogsFromRecords = (
  records,
  { employees, customers, styles, colors, assignmentPlanById }
) => {
  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) return [];

  return safeRecords.map((record, index) => {
    const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
    const card = assignmentPlanId ? assignmentPlanById.get(assignmentPlanId) ?? null : null;
    const customer = card
      ? resolvePlanCustomerValue({ plan: card, customers, fallbackIndex: index })
      : findCustomerValue(customers, record?.customerName, index);
    const style = card
      ? resolvePlanStyleValue({ plan: card, styles, fallbackIndex: index })
      : findStyleValue(styles, record, index);
    const color = card
      ? resolvePlanColorValue({ plan: card, colors, fallbackIndex: index })
      : findColorValue(colors, record, index);
    const process = card
      ? resolveProcessForRecord({ record, card, style, fallbackIndex: index })
      : findProcessValue(record, style, index);

    return {
      id: buildLogId(),
      worker: findWorkerValue(employees, record, index),
      items: [
        {
          id: buildItemId(),
          card,
          assignmentPlanId: assignmentPlanId ?? null,
          customer,
          style,
          process,
          color,
          quantity: Number(record?.quantity) > 0 ? Number(record.quantity) : '',
        },
      ],
    };
  });
};

const toOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER = 3;
const toPositiveIdOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
};
const buildInitialRecordHydrationKey = (initialLog, selectedLine) => {
  if (!initialLog?.id) return '';

  const selectedLineId = toPositiveIdOrNull(selectedLine?.id);
  if (selectedLineId) {
    return `log:${initialLog.id}:selected-line:${selectedLineId}`;
  }

  const selectedLineName = String(selectedLine?.name || '').trim();
  if (selectedLineName) {
    return `log:${initialLog.id}:selected-line-name:${selectedLineName}`;
  }

  const initialLineId = toPositiveIdOrNull(initialLog?.lineId);
  if (initialLineId) {
    return `log:${initialLog.id}:line:${initialLineId}`;
  }

  const initialLineName = String(initialLog?.lineName || '').trim();
  if (initialLineName) {
    return `log:${initialLog.id}:line-name:${initialLineName}`;
  }

  return '';
};
const filterRecordsByEmployees = (records, employees = []) => {
  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0 || employees.length === 0) return [];

  const eligibleWorkerIds = new Set(
    employees
      .map((employee) => toPositiveIdOrNull(employee?.id))
      .filter((workerId) => workerId !== null)
  );
  const eligibleWorkerNames = new Set(
    employees
      .map((employee) => String(employee?.name || '').trim())
      .filter(Boolean)
  );

  return safeRecords.filter((record) => {
    const workerId = toPositiveIdOrNull(record?.workerId);
    if (workerId !== null) return eligibleWorkerIds.has(workerId);

    const workerName = String(record?.workerName || '').trim();
    return workerName ? eligibleWorkerNames.has(workerName) : false;
  });
};
const isAgreedAssignmentPlan = (plan) =>
  String(plan?.ctStatus || '').trim().toUpperCase() === 'AGREED';
const resolveAssignmentPlanBaselineQuantity = (plan) => {
  const finalQuantity = Number(plan?.finalQuantity);
  if (Number.isFinite(finalQuantity) && finalQuantity > 0) {
    return Math.round(finalQuantity);
  }
  const plannedQuantity = Number(plan?.quantity);
  if (Number.isFinite(plannedQuantity) && plannedQuantity > 0) {
    return Math.round(plannedQuantity);
  }
  return null;
};
const formatAssignmentPlanLabel = (plan) => {
  if (!plan || typeof plan !== 'object') return '배정 카드';
  const parts = [plan?.orderNo, plan?.label, plan?.colorName]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  if (plan?.dbId) return `배정 카드 #${plan.dbId}`;
  return '배정 카드';
};
const AUTO_NOTE_PREFIX = '[자동 초과 메모]';
const AUTO_NOTE_MARKER = `\n\n${AUTO_NOTE_PREFIX}\n`;
const formatWorkRecordProcessLabel = (record) => {
  const code = String(record?.processCode || '').trim();
  const name = String(record?.processName || '').trim();
  if (code && name) return `[${code}] ${name}`;
  return name || code || '공정';
};
const stripAutoNoteFromText = (value) => {
  const text = String(value || '');
  const leadingAutoPrefix = `${AUTO_NOTE_PREFIX}\n`;
  if (text.startsWith(leadingAutoPrefix)) return '';
  const prefixIndex = text.indexOf(leadingAutoPrefix);
  if (prefixIndex >= 0) return text.slice(0, prefixIndex).trimEnd();
  const markerIndex = text.indexOf(AUTO_NOTE_MARKER);
  return markerIndex >= 0 ? text.slice(0, markerIndex) : text;
};
const buildCombinedNote = ({ manualNote, autoNote }) => {
  const trimmedManualNote = String(manualNote || '').trim();
  const trimmedAutoNote = String(autoNote || '').trim();
  if (trimmedManualNote && trimmedAutoNote) {
    return `${trimmedManualNote}${AUTO_NOTE_MARKER}${trimmedAutoNote}`;
  }
  if (trimmedAutoNote) {
    return `${AUTO_NOTE_PREFIX}\n${trimmedAutoNote}`;
  }
  return trimmedManualNote;
};
const resolveAssignmentProcessMetric = (processCode, processName) => {
  const normalizedCode = String(processCode || '').trim().toUpperCase();
  if (normalizedCode) {
    return {
      key: `code:${normalizedCode}`,
      label: String(processCode || '').trim() || String(processName || '').trim() || `CODE:${normalizedCode}`,
    };
  }
  const normalizedName = String(processName || '').trim().toLowerCase();
  if (normalizedName) {
    return {
      key: `name:${normalizedName}`,
      label: String(processName || '').trim() || String(processCode || '').trim() || `NAME:${normalizedName}`,
    };
  }
  return { key: 'unknown', label: '미지정 공정' };
};
const collectAssignmentProcessQuantityRows = (records = []) => {
  const buckets = new Map();
  records.forEach((record) => {
    if (!record || typeof record !== 'object') return;
    const assignmentPlanId = toPositiveIdOrNull(record.assignmentPlanId);
    if (!assignmentPlanId) return;
    const quantity = Math.max(0, Math.round(Number(record.quantity) || 0));
    if (quantity <= 0) return;
    const processMetric = resolveAssignmentProcessMetric(
      record.processCode,
      record.processName
    );
    const bucketKey = `${assignmentPlanId}::${processMetric.key}`;
    const current = buckets.get(bucketKey);
    if (current) {
      current.quantity += quantity;
      return;
    }
    buckets.set(bucketKey, {
      assignmentPlanId,
      processMetricKey: processMetric.key,
      processLabel: processMetric.label,
      quantity,
    });
  });
  return Array.from(buckets.values());
};
const reconcileWorkerForFactory = (worker, employees = []) => {
  if (!worker) return null;

  const workerId = toPositiveIdOrNull(worker.id);
  if (workerId) {
    const matchedById = employees.find(
      (employee) => toPositiveIdOrNull(employee?.id) === workerId
    );
    if (matchedById) return matchedById;
  }

  const workerName = String(worker?.name || '').trim();
  if (workerName) {
    const matchedByName = employees.find((employee) =>
      equalsText(employee?.name, workerName)
    );
    if (matchedByName) return matchedByName;
  }

  return null;
};
const resolveWorkerGroupKey = (log) => {
  const workerId = toPositiveIdOrNull(log?.worker?.id);
  if (workerId) return `worker:${workerId}`;

  const workerName = String(log?.worker?.name || '').trim().toLowerCase();
  if (workerName) return `worker-name:${workerName}`;

  return `row:${log?.id || 'blank'}`;
};
const groupWorkerLogsForDisplay = (workerLogs = []) => {
  const groups = [];
  const groupedByWorkerKey = new Map();

  (Array.isArray(workerLogs) ? workerLogs : []).forEach((log) => {
    const workerKey = resolveWorkerGroupKey(log);
    const isBlankWorkerGroup = workerKey.startsWith('row:');
    const existingGroup = isBlankWorkerGroup ? null : groupedByWorkerKey.get(workerKey);

    if (existingGroup) {
      existingGroup.entries.push(log);
      if (!existingGroup.worker && log?.worker) {
        existingGroup.worker = log.worker;
      }
      return;
    }

    const nextGroup = {
      id: `group:${workerKey}`,
      worker: log?.worker ?? null,
      entries: [log],
    };
    groups.push(nextGroup);
    if (!isBlankWorkerGroup) {
      groupedByWorkerKey.set(workerKey, nextGroup);
    }
  });

  return groups;
};
const resolveEmployeeDisplayName = (employee = {}) => {
  const name = String(employee?.name || '').trim();
  if (name) return name;

  const email = String(employee?.email || '').trim();
  if (email) return email;

  return '';
};
const normalizeEmployeeOption = (employee = {}) => ({
  ...employee,
  name: resolveEmployeeDisplayName(employee),
});
const buildFactoryKey = (factoryId) => {
  const normalizedFactoryId = toPositiveIdOrNull(factoryId);
  return normalizedFactoryId ? String(normalizedFactoryId) : '';
};
const buildFactoryWorkDateKey = ({ factoryId, workDateKey }) => {
  const factoryKey = buildFactoryKey(factoryId);
  if (!factoryKey || !workDateKey) return '';
  return `${factoryKey}:${workDateKey}`;
};
const buildEmployeeScopeKey = ({ factoryId, lineId, workDateKey }) => {
  const normalizedFactoryId = toPositiveIdOrNull(factoryId);
  const normalizedLineId = toPositiveIdOrNull(lineId);
  if (!normalizedFactoryId || !normalizedLineId || !workDateKey) return '';
  return `${normalizedFactoryId}:${normalizedLineId}:${workDateKey}`;
};
const groupAssignmentPlansByLineId = (plans = []) =>
  sortByDisplayLabel(Array.isArray(plans) ? plans : [], (plan) =>
    formatAssignmentPlanLabel(plan)
  ).reduce((map, plan) => {
    const lineKey = String(toPositiveIdOrNull(plan?.lineId) ?? '').trim();
    if (!lineKey) return map;
    if (!map[lineKey]) {
      map[lineKey] = [];
    }
    map[lineKey].push(plan);
    return map;
  }, {});
const groupEmployeesByScopeKey = ({ factoryId, workDateKey, employees = [] }) => {
  const groupedEmployees = (Array.isArray(employees) ? employees : []).reduce((map, employee) => {
    const scopeKey = buildEmployeeScopeKey({
      factoryId,
      lineId: employee?.currentLineId,
      workDateKey,
    });
    if (!scopeKey) return map;
    if (!map[scopeKey]) {
      map[scopeKey] = [];
    }
    map[scopeKey].push(normalizeEmployeeOption(employee));
    return map;
  }, {});

  Object.keys(groupedEmployees).forEach((scopeKey) => {
    groupedEmployees[scopeKey] = sortByDisplayLabel(
      groupedEmployees[scopeKey],
      (employee) => resolveEmployeeDisplayName(employee)
    );
  });

  return groupedEmployees;
};
const buildInitialFactorySelection = (workLog) => {
  if (!workLog) return null;
  if (!workLog?.factoryId && !workLog?.factoryName) return null;
  return {
    id: workLog?.factoryId || '',
    name: workLog?.factoryName || '',
  };
};
const buildInitialLineSelection = (workLog) => {
  if (!workLog) return null;
  if (!workLog?.lineId && !workLog?.lineName) return null;
  return {
    id: workLog?.lineId || '',
    name: workLog?.lineName || '',
  };
};
const buildInitialWorkDateValue = (workLog) => {
  const nextDate = dayjs(workLog?.workDate || workLog?.createdAt || undefined);
  return nextDate.isValid() ? nextDate : dayjs();
};
const findMatchingLineOption = (lines = [], line) => {
  if (!line || (!line?.id && !line?.name)) return null;

  return (
    lines.find((option) => String(option?.id || '') === String(line?.id || '')) ||
    lines.find((option) => equalsText(option?.name, line?.name)) ||
    null
  );
};
const shouldKeepInitialLineSelection = ({ currentLine, selectedFactoryId, initialLog }) => {
  if (!currentLine || !selectedFactoryId || !initialLog?.id) return false;

  const normalizedSelectedFactoryId = toPositiveIdOrNull(selectedFactoryId);
  const initialFactoryId = toPositiveIdOrNull(initialLog.factoryId);
  if (
    !normalizedSelectedFactoryId ||
    !initialFactoryId ||
    normalizedSelectedFactoryId !== initialFactoryId
  ) {
    return false;
  }

  return Boolean(findMatchingLineOption([currentLine], buildInitialLineSelection(initialLog)));
};
const reconcileLineSelection = ({ currentLine, lines, selectedFactoryId, initialLog }) => {
  const nextLines = Array.isArray(lines) ? lines : [];
  const matchedCurrentLine = findMatchingLineOption(nextLines, currentLine);
  if (matchedCurrentLine) return matchedCurrentLine;

  if (!selectedFactoryId || !initialLog?.id) return null;

  const normalizedSelectedFactoryId = toPositiveIdOrNull(selectedFactoryId);
  const initialFactoryId = toPositiveIdOrNull(initialLog.factoryId);
  if (
    !normalizedSelectedFactoryId ||
    !initialFactoryId ||
    normalizedSelectedFactoryId !== initialFactoryId
  ) {
    return null;
  }

  return findMatchingLineOption(nextLines, buildInitialLineSelection(initialLog));
};

const WorkDetail = ({
  onClose,
  onSave,
  onSelectionContextChange,
  isLogSwitching = false,
  mode = 'drawer',
  initialLog = null,
}) => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const [workDate, setWorkDate] = useState(() => buildInitialWorkDateValue(initialLog));
  const [factories, setFactories] = useState([]);
  const [selectedFactory, setSelectedFactory] = useState(() => buildInitialFactorySelection(initialLog));
  const [lines, setLines] = useState([]);
  const [selectedLine, setSelectedLine] = useState(() => buildInitialLineSelection(initialLog));
  const [assignmentPlansByLineId, setAssignmentPlansByLineId] = useState({});
  const [loadedLineFactoryKey, setLoadedLineFactoryKey] = useState('');
  const [loadedAssignmentFactoryKey, setLoadedAssignmentFactoryKey] = useState('');
  const [employeesByScopeKey, setEmployeesByScopeKey] = useState({});
  const [loadedEmployeeFactoryDateKey, setLoadedEmployeeFactoryDateKey] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loadedEmployeeScopeKey, setLoadedEmployeeScopeKey] = useState('');
  const [customers, setCustomers] = useState([]);
  const [styles, setStyles] = useState([]);
  const [colors, setColors] = useState([]);
  const [workerLogs, setWorkerLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);
  const [duplicateEntryMessage, setDuplicateEntryMessage] = useState('');
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [note, setNote] = useState('');
  const cancelButtonRef = useRef(null);
  const initializedMetaLogIdRef = useRef('');
  const initializedLineLogIdRef = useRef('');
  const initializedRecordsLogIdRef = useRef('');
  const previousSelectedLineIdRef = useRef(null);
  const [hydratedRecordKey, setHydratedRecordKey] = useState('');
  const isPageMode = mode === 'page';
  const workDateKey = useMemo(
    () => workDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
    [workDate]
  );
  const initialLogLineId = toPositiveIdOrNull(initialLog?.lineId);
  const initialLogLineName = String(initialLog?.lineName || '').trim();
  const isFactoryAggregateInitialLog =
    Boolean(initialLog?.id) && !initialLogLineId && !initialLogLineName;
  const selectedLineId = toPositiveIdOrNull(selectedLine?.id);
  const selectedLineKey = selectedLineId ? String(selectedLineId) : '';
  const selectedFactoryKey = buildFactoryKey(selectedFactory?.id);
  const selectedEmployeeFactoryDateKey = useMemo(
    () =>
      buildFactoryWorkDateKey({
        factoryId: selectedFactory?.id,
        workDateKey,
      }),
    [selectedFactory?.id, workDateKey]
  );
  const selectedEmployeeScopeKey = useMemo(() => {
    return buildEmployeeScopeKey({
      factoryId: selectedFactory?.id,
      lineId: selectedLine?.id,
      workDateKey,
    });
  }, [selectedFactory?.id, selectedLine?.id, workDateKey]);
  const isAssignmentPlanCacheReady =
    Boolean(selectedFactoryKey) && loadedAssignmentFactoryKey === selectedFactoryKey;
  const isLineCacheReady =
    Boolean(selectedFactoryKey) && loadedLineFactoryKey === selectedFactoryKey;
  const isEmployeeFactoryDateCacheReady =
    Boolean(selectedEmployeeFactoryDateKey) &&
    loadedEmployeeFactoryDateKey === selectedEmployeeFactoryDateKey;
  const assignmentPlans = useMemo(
    () => (selectedLineKey ? assignmentPlansByLineId[selectedLineKey] || [] : []),
    [assignmentPlansByLineId, selectedLineKey]
  );
  const initialRecordHydrationKey = useMemo(
    () => buildInitialRecordHydrationKey(initialLog, selectedLine),
    [initialLog, selectedLine]
  );
  const assignmentPlanById = useMemo(
    () =>
      assignmentPlans.reduce((map, plan) => {
        const key = toPositiveIdOrNull(plan?.dbId);
        if (key === null || map.has(key)) return map;
        map.set(key, plan);
        return map;
      }, new Map()),
    [assignmentPlans]
  );
  const skipInitialGlobalLoading = Boolean(initialLog?.id);

  useEffect(() => {
    let cancelled = false;

    const loadBaseData = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const [factoryRows, customerRows, styleRows, attributeData] = await Promise.all([
          requestJSON('/factories' + query, {
            skipGlobalLoading: skipInitialGlobalLoading,
          }).catch(() => []),
          requestJSON('/customers' + query, {
            skipGlobalLoading: skipInitialGlobalLoading,
          }).catch(() => []),
          fetchStylesFromApi({
            orgId: activeOrgId,
            skipGlobalLoading: skipInitialGlobalLoading,
          }).catch(() => []),
          fetchAttributes({
            orgId: activeOrgId,
            skipGlobalLoading: skipInitialGlobalLoading,
          }).catch(() => null),
        ]);
        if (cancelled) return;
        // ADMIN이 아닌 사용자는 소속 공장만 표시
        const allFactories = Array.isArray(factoryRows) ? factoryRows : [];
        const isAdmin = activeOrgRole === 'ADMIN';
        const filteredFactories = sortByDisplayLabel(
          !isAdmin && activeFactoryId
            ? allFactories.filter((f) => f.id === activeFactoryId)
            : allFactories,
          (factory) => factory?.name || ''
        );
        setFactories(filteredFactories);
        // 신규 입력이고 소속 공장이 하나로 특정되는 경우 자동 선택
        if (!initialLog?.id && filteredFactories.length === 1) {
          setSelectedFactory(filteredFactories[0]);
        }
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setStyles(Array.isArray(styleRows) ? styleRows : []);
        setColors(Array.isArray(attributeData?.colors) ? attributeData.colors : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBaseData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, activeOrgRole, activeFactoryId, initialLog?.id, skipInitialGlobalLoading]);

  useEffect(() => {
    if (!selectedFactory?.id) {
      setLines([]);
      setSelectedLine(null);
      setLoadedLineFactoryKey('');
      setAssignmentPlansByLineId({});
      setLoadedAssignmentFactoryKey('');
      setEmployeesByScopeKey({});
      setLoadedEmployeeFactoryDateKey('');
      return;
    }
    let cancelled = false;
    const selectedFactoryId = selectedFactory.id;
    const factoryKey = buildFactoryKey(selectedFactoryId);
    setLines([]);
    setSelectedLine((currentLine) =>
      shouldKeepInitialLineSelection({ currentLine, selectedFactoryId, initialLog })
        ? currentLine
        : null
    );
    setLoadedLineFactoryKey('');
    setAssignmentPlansByLineId({});
    setLoadedAssignmentFactoryKey('');
    setEmployeesByScopeKey({});
    setLoadedEmployeeFactoryDateKey('');
    requestJSON(`/lines${buildQueryString({ factoryId: selectedFactoryId, orgId: activeOrgId })}`, {
      skipGlobalLoading: true,
    })
      .then((data) => {
        if (!cancelled) {
          const nextLines = sortByDisplayLabel(Array.isArray(data) ? data : [], (line) => line?.name || '');
          setLines(nextLines);
          setSelectedLine((currentLine) =>
            reconcileLineSelection({
              currentLine,
              lines: nextLines,
              selectedFactoryId,
              initialLog,
            })
          );
          setLoadedLineFactoryKey(factoryKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
          setLoadedLineFactoryKey(factoryKey);
        }
      });
    return () => { cancelled = true; };
  }, [
    activeOrgId,
    initialLog?.id,
    initialLog?.factoryId,
    initialLog?.lineId,
    initialLog?.lineName,
    selectedFactory?.id,
  ]);

  useEffect(() => {
    if (!selectedFactory?.id) {
      setAssignmentPlansByLineId({});
      setLoadedAssignmentFactoryKey('');
      return;
    }
    let cancelled = false;
    const factoryKey = buildFactoryKey(selectedFactory.id);
    setLoadedAssignmentFactoryKey('');
    requestJSON(
      `/assignment-plans${buildQueryString({ factoryId: selectedFactory.id, orgId: activeOrgId })}`,
      {
        skipGlobalLoading: true,
      }
    )
      .then((data) => {
        if (!cancelled) {
          setAssignmentPlansByLineId(groupAssignmentPlansByLineId(data));
          setLoadedAssignmentFactoryKey(factoryKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentPlansByLineId({});
          setLoadedAssignmentFactoryKey(factoryKey);
        }
      });
    return () => { cancelled = true; };
  }, [selectedFactory?.id, activeOrgId]);

  useEffect(() => {
    if (!selectedFactory?.id) {
      setEmployeesByScopeKey({});
      setLoadedEmployeeFactoryDateKey('');
      return;
    }
    let cancelled = false;
    const employeeFactoryDateKey = buildFactoryWorkDateKey({
      factoryId: selectedFactory.id,
      workDateKey,
    });
    setLoadedEmployeeFactoryDateKey('');
    requestJSON(
      `/line-workers${buildQueryString({
        factoryId: selectedFactory.id,
        workDate: workDateKey,
        orgId: activeOrgId,
      })}`,
      {
        skipGlobalLoading: true,
      }
    )
      .then((data) => {
        if (!cancelled) {
          setEmployeesByScopeKey(
            groupEmployeesByScopeKey({
              factoryId: selectedFactory.id,
              workDateKey,
              employees: data,
            })
          );
          setLoadedEmployeeFactoryDateKey(employeeFactoryDateKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployeesByScopeKey({});
          setLoadedEmployeeFactoryDateKey(employeeFactoryDateKey);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFactory?.id, workDateKey, activeOrgId]);

  useEffect(() => {
    initializedMetaLogIdRef.current = '';
    initializedLineLogIdRef.current = '';
    initializedRecordsLogIdRef.current = '';
    setHydratedRecordKey('');
  }, [initialLog?.id]);

  useEffect(() => {
    setSelectedFactory(buildInitialFactorySelection(initialLog));
    setSelectedLine(buildInitialLineSelection(initialLog));
    setWorkDate(buildInitialWorkDateValue(initialLog));
  }, [
    initialLog?.id,
    initialLog?.factoryId,
    initialLog?.factoryName,
    initialLog?.lineId,
    initialLog?.lineName,
    initialLog?.workDate,
    initialLog?.createdAt,
  ]);

  useEffect(() => {
    if (initialLog?.id) {
      setNote(stripAutoNoteFromText(initialLog.note || ''));
    } else {
      setNote('');
    }
    setSaveErrorMessage('');
  }, [initialLog?.id, initialLog?.note]);

  useEffect(() => {
    if (!initialLog?.id) return;
    if (initializedMetaLogIdRef.current === initialLog.id) return;
    if (factories.length === 0) return;

    const matchedFactory =
      factories.find(
        (factory) => String(factory?.id || '') === String(initialLog.factoryId || '')
      ) || factories.find((factory) => equalsText(factory?.name, initialLog.factoryName));

    if (matchedFactory) {
      setSelectedFactory(matchedFactory);
    } else if (initialLog.factoryId || initialLog.factoryName) {
      setSelectedFactory({
        id: initialLog.factoryId || '',
        name: initialLog.factoryName || '',
      });
    }

    const nextDate = dayjs(initialLog.workDate || initialLog.createdAt || undefined);
    setWorkDate(nextDate.isValid() ? nextDate : dayjs());
    initializedMetaLogIdRef.current = initialLog.id;
  }, [factories, initialLog]);

  useEffect(() => {
    if (!initialLog?.id) return;
    if (initializedLineLogIdRef.current === initialLog.id) return;
    if (!selectedFactory?.id) return;
    if (lines.length === 0) return;
    if (
      initialLog.factoryId &&
      String(selectedFactory.id || '') !== String(initialLog.factoryId)
    ) {
      return;
    }

    if (!initialLog.lineId && !initialLog.lineName) {
      initializedLineLogIdRef.current = initialLog.id;
      return;
    }

    const matchedLine =
      lines.find((line) => String(line?.id || '') === String(initialLog.lineId || '')) ||
      lines.find((line) => equalsText(line?.name, initialLog.lineName));

    if (matchedLine) {
      setSelectedLine(matchedLine);
    } else {
      setSelectedLine({
        id: initialLog.lineId || '',
        name: initialLog.lineName || '',
      });
    }

    initializedLineLogIdRef.current = initialLog.id;
  }, [initialLog, lines, selectedFactory]);

  useEffect(() => {
    const isPendingInitialHydration =
      Boolean(initialRecordHydrationKey) &&
      initializedRecordsLogIdRef.current !== initialRecordHydrationKey;
    if (!selectedFactory?.id || !selectedLine?.id) {
      previousSelectedLineIdRef.current = null;
      setHydratedRecordKey('');
      setEmployees([]);
      setLoadedEmployeeScopeKey('');
      setFocusRequest(null);
      setDuplicateEntryMessage('');
      setWorkerLogs([]);
      return;
    }

    setEmployees([]);
    setLoadedEmployeeScopeKey('');
    setFocusRequest(null);
    setDuplicateEntryMessage('');
    if (isPendingInitialHydration) {
      setHydratedRecordKey('');
      setWorkerLogs([]);
    }

    if (!isEmployeeFactoryDateCacheReady) {
      return;
    }

    const list = selectedEmployeeScopeKey ? employeesByScopeKey[selectedEmployeeScopeKey] || [] : [];
    const previousSelectedLineId = previousSelectedLineIdRef.current;
    const hasLineChanged =
      previousSelectedLineId !== null && previousSelectedLineId !== selectedLineId;
    setEmployees(list);
    setLoadedEmployeeScopeKey(selectedEmployeeScopeKey);
    if (isPendingInitialHydration) {
      previousSelectedLineIdRef.current = selectedLineId;
      return;
    }

    let nextInitialWorkerLogId = null;
    setWorkerLogs((prev) => {
      if (hasLineChanged) {
        if (list.length === 0) return [];
        const initialWorkerLog = buildWorkerLog();
        nextInitialWorkerLogId = initialWorkerLog.id;
        return [initialWorkerLog];
      }

      if (!Array.isArray(prev) || prev.length === 0) {
        if (list.length === 0) return [];
        const initialWorkerLog = buildWorkerLog();
        nextInitialWorkerLogId = initialWorkerLog.id;
        return [initialWorkerLog];
      }

      // Preserve current input rows, but remap worker selection to
      // workers that belong to the selected line on the selected work date.
      return prev.map((log) => ({
        ...log,
        worker: reconcileWorkerForFactory(log.worker, list),
        items: Array.isArray(log.items) && log.items.length > 0 ? log.items : [buildEmptyItem()],
      }));
    });
    if (nextInitialWorkerLogId) {
      setFocusRequest({
        entryId: nextInitialWorkerLogId,
        field: 'worker',
        token: buildFocusToken(),
      });
    } else {
      setFocusRequest(null);
    }
    setDuplicateEntryMessage('');
    previousSelectedLineIdRef.current = selectedLineId;
  }, [
    employeesByScopeKey,
    isEmployeeFactoryDateCacheReady,
    initialLog?.id,
    initialRecordHydrationKey,
    selectedEmployeeScopeKey,
    selectedFactory?.id,
    selectedLine?.id,
  ]);

  useEffect(() => {
    if (!initialLog?.id) return;
    if (!selectedFactory?.id) return;
    if (!initialRecordHydrationKey) {
      if (isFactoryAggregateInitialLog) {
        setWorkerLogs([]);
        setDuplicateEntryMessage('');
        setFocusRequest(null);
        initializedRecordsLogIdRef.current = '';
      }
      return;
    }
    if (initializedRecordsLogIdRef.current === initialRecordHydrationKey) return;
    if (selectedEmployeeScopeKey && loadedEmployeeScopeKey !== selectedEmployeeScopeKey) {
      return;
    }
    if (selectedLine?.id && !isAssignmentPlanCacheReady) {
      return;
    }
    if (initialLogLineId && !selectedLine?.id) return;
    if (
      initialLog.factoryId &&
      String(selectedFactory.id || '') !== String(initialLog.factoryId)
    ) {
      return;
    }

    const selectedLineMatchesInitialLog =
      !initialLogLineId && !initialLogLineName
        ? true
        : initialLogLineId
          ? String(selectedLine?.id || '') === String(initialLogLineId)
          : equalsText(selectedLine?.name, initialLogLineName);

    const scopedRecords = isFactoryAggregateInitialLog
      ? filterRecordsByEmployees(initialLog.records, employees)
      : selectedLineMatchesInitialLog
        ? initialLog.records
        : [];
    const nextWorkerLogs = buildWorkerLogsFromRecords(scopedRecords, {
      employees,
      customers,
      styles,
      colors,
      assignmentPlanById,
    });

    if (nextWorkerLogs.length > 0) {
      setWorkerLogs(nextWorkerLogs);
    } else if (employees.length > 0) {
      setWorkerLogs([buildWorkerLog()]);
    } else {
      setWorkerLogs([]);
    }

    setDuplicateEntryMessage('');
    setFocusRequest(null);
    initializedRecordsLogIdRef.current = initialRecordHydrationKey;
    setHydratedRecordKey(initialRecordHydrationKey);
  }, [
    colors,
    customers,
    employees,
    initialLog,
    initialLogLineId,
    initialLogLineName,
    initialRecordHydrationKey,
    isAssignmentPlanCacheReady,
    isFactoryAggregateInitialLog,
    loadedEmployeeScopeKey,
    assignmentPlanById,
    selectedEmployeeScopeKey,
    selectedFactory,
    selectedLine,
    styles,
  ]);

  const processOptionsByLogId = useMemo(
    () =>
      workerLogs.reduce((map, log) => {
        const item = Array.isArray(log?.items) ? log.items[0] : null;
        map.set(
          log.id,
          buildProcessOptionsForAssignmentCard({
            card: item?.card,
            style: item?.style,
          })
        );
        return map;
      }, new Map()),
    [workerLogs]
  );
  const duplicateProcessKeysByLogId = useMemo(
    () =>
      workerLogs.reduce((map, log) => {
        const currentItem = Array.isArray(log?.items) ? log.items[0] : null;
        const currentWorkerId = toPositiveIdOrNull(log?.worker?.id);
        const currentAssignmentPlanId = toPositiveIdOrNull(currentItem?.assignmentPlanId);
        const usedProcessKeys = new Set();

        if (currentWorkerId && currentAssignmentPlanId) {
          workerLogs.forEach((otherLog) => {
            if (otherLog?.id === log?.id) return;
            const otherItem = Array.isArray(otherLog?.items) ? otherLog.items[0] : null;
            if (toPositiveIdOrNull(otherLog?.worker?.id) !== currentWorkerId) return;
            if (toPositiveIdOrNull(otherItem?.assignmentPlanId) !== currentAssignmentPlanId) return;

            const processKey = String(
              otherItem?.process?.processKey || otherItem?.process?.id || ''
            ).trim();
            if (processKey) {
              usedProcessKeys.add(processKey);
            }
          });
        }

        map.set(log.id, usedProcessKeys);
        return map;
      }, new Map()),
    [workerLogs]
  );
  const workerLogGroups = useMemo(
    () => groupWorkerLogsForDisplay(workerLogs),
    [workerLogs]
  );
  const isSelectedLineDataLoading =
    Boolean(selectedLine?.id) &&
    (!isLineCacheReady ||
      !isAssignmentPlanCacheReady ||
      (Boolean(selectedEmployeeScopeKey) && !isEmployeeFactoryDateCacheReady));
  const isInitialRecordHydrationPending =
    Boolean(initialRecordHydrationKey) && hydratedRecordKey !== initialRecordHydrationKey;
  const isInitialDetailLoading =
    Boolean(initialLog?.id) &&
    (loading ||
      (Boolean(selectedFactoryKey) && !isLineCacheReady) ||
      (Boolean(selectedFactoryKey) && !isAssignmentPlanCacheReady) ||
      (Boolean(selectedEmployeeFactoryDateKey) && !isEmployeeFactoryDateCacheReady) ||
      isInitialRecordHydrationPending);
  const isLineSelectionLoading = Boolean(selectedFactory?.id) && !selectedLine && !isLineCacheReady;
  const selectedFactoryWagePerSecond = useMemo(() => {
    if (!selectedFactory?.id) return null;
    const matchedFactory =
      factories.find((factory) => String(factory?.id) === String(selectedFactory?.id)) ||
      selectedFactory;
    return toOptionalNumber(matchedFactory?.wagePerSecond);
  }, [factories, selectedFactory]);
  useEffect(() => {
    onSelectionContextChange?.({
      factoryId: toPositiveIdOrNull(selectedFactory?.id),
      lineId: selectedLineId,
      workDate: workDateKey,
      workLogId: toPositiveIdOrNull(initialLog?.id),
    });
  }, [
    initialLog?.id,
    onSelectionContextChange,
    selectedFactory?.id,
    selectedLineId,
    workDateKey,
  ]);
  const agreedAssignmentPlans = useMemo(
    () => assignmentPlans.filter((plan) => isAgreedAssignmentPlan(plan)),
    [assignmentPlans]
  );
  const hasAssignmentPlans = assignmentPlans.length > 0;
  const hasOnlyUnagreedAssignmentPlans =
    hasAssignmentPlans && agreedAssignmentPlans.length === 0;

  const applyWorkerLogsWithDuplicateCheck = (updater) => {
    let duplicateDetected = false;
    setWorkerLogs((prev) => {
      const nextWorkerLogs = updater(prev);
      duplicateDetected = findDuplicateWorkerLogIndex(nextWorkerLogs) >= 0;
      return nextWorkerLogs;
    });
    setDuplicateEntryMessage(
      duplicateDetected
        ? '같은 작업자/배정카드/공정 조합은 중복 입력할 수 없습니다. 수량으로 합산해 주세요.'
        : ''
    );
  };

  const buildNextRowFromLog = (log) => {
    const item = Array.isArray(log?.items) && log.items.length > 0 ? log.items[0] : buildEmptyItem();
    return {
      id: buildLogId(),
      worker: log?.worker ?? null,
      items: [
        {
          ...buildEmptyItem(),
          card: item?.card ?? null,
          assignmentPlanId: item?.assignmentPlanId ?? null,
          customer: item?.customer ?? null,
          style: item?.style ?? null,
          color: item?.color ?? null,
          process: null,
          quantity: '',
        },
      ],
    };
  };

  const handleAddWorker = (templateLog = null) => {
    const nextLog = templateLog ? buildNextRowFromLog(templateLog) : buildWorkerLog();
    applyWorkerLogsWithDuplicateCheck((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      if (!templateLog?.id) return [...safePrev, nextLog];
      const insertIndex = safePrev.findIndex((log) => log.id === templateLog.id);
      if (insertIndex < 0) return [...safePrev, nextLog];
      return [
        ...safePrev.slice(0, insertIndex + 1),
        nextLog,
        ...safePrev.slice(insertIndex + 1),
      ];
    });
    const nextItem = nextLog.items[0];
    setFocusRequest({
      entryId: nextLog.id,
      field: nextItem?.card ? 'process' : nextLog.worker ? 'card' : 'worker',
      token: buildFocusToken(),
    });
  };

  const handleRemoveWorker = (logId) => {
    applyWorkerLogsWithDuplicateCheck((prev) => prev.filter((log) => log.id !== logId));
    setFocusRequest(null);
  };

  const handleWorkerChange = (logIdsOrId, nextWorker) => {
    const normalizedLogIds = Array.from(
      new Set(
        (Array.isArray(logIdsOrId) ? logIdsOrId : [logIdsOrId]).filter(Boolean)
      )
    );
    if (normalizedLogIds.length === 0) return;
    const logIdSet = new Set(normalizedLogIds);

    applyWorkerLogsWithDuplicateCheck((prev) =>
      prev.map((log) => (logIdSet.has(log.id) ? { ...log, worker: nextWorker } : log))
    );
    if (nextWorker) {
      setFocusRequest({
        entryId: normalizedLogIds[0],
        field: 'card',
        token: buildFocusToken(),
      });
      return;
    }
    setFocusRequest(null);
  };

  const handleCardChange = (logId, value) => {
    applyWorkerLogsWithDuplicateCheck((prev) =>
      prev.map((log, index) => {
        if (log.id !== logId) return log;
        const currentItem =
          Array.isArray(log.items) && log.items.length > 0 ? log.items[0] : buildEmptyItem();
        if (!value) {
          return {
            ...log,
            items: [
              {
                ...currentItem,
                card: null,
                assignmentPlanId: null,
                customer: null,
                style: null,
                process: null,
                color: null,
                quantity: '',
              },
            ],
          };
        }

        return {
          ...log,
          items: [
            {
              ...currentItem,
              card: value,
              assignmentPlanId: value.dbId ?? null,
              customer: resolvePlanCustomerValue({
                plan: value,
                customers,
                fallbackIndex: index,
              }),
              style: resolvePlanStyleValue({
                plan: value,
                styles,
                fallbackIndex: index,
              }),
              process: null,
              color: resolvePlanColorValue({
                plan: value,
                colors,
                fallbackIndex: index,
              }),
              quantity: '',
            },
          ],
        };
      })
    );
    if (value) {
      setFocusRequest({
        entryId: logId,
        field: 'process',
        token: buildFocusToken(),
      });
    }
  };

  const handleProcessChange = (logId, value) => {
    applyWorkerLogsWithDuplicateCheck((prev) =>
      prev.map((log) => {
        if (log.id !== logId) return log;
        const currentItem =
          Array.isArray(log.items) && log.items.length > 0 ? log.items[0] : buildEmptyItem();
        return {
          ...log,
          items: [
            {
              ...currentItem,
              process: value,
            },
          ],
        };
      })
    );
    if (value) {
      setFocusRequest({
        entryId: logId,
        field: 'quantity',
        token: buildFocusToken(),
      });
    }
  };

  const handleQuantityChange = (logId, value) => {
    applyWorkerLogsWithDuplicateCheck((prev) =>
      prev.map((log) => {
        if (log.id !== logId) return log;
        const currentItem =
          Array.isArray(log.items) && log.items.length > 0 ? log.items[0] : buildEmptyItem();
        return {
          ...log,
          items: [
            {
              ...currentItem,
              quantity: value,
            },
          ],
        };
      })
    );
  };

  const summary = useMemo(() => {
    const records = workerLogs.flatMap((log) =>
      log.items
        .filter((item) => item.process && Number(item.quantity) > 0)
        .map((item) => ({
          workerId: toPositiveIdOrNull(log.worker?.id),
          workerName: log.worker?.name || '',
          customerName: item.customer?.name || '',
          styleId: item.style?.id || '',
          styleName: item.style?.name || '',
          processCode: item.process?.code || '',
          processName: item.process?.name || '',
          colorId: item.color?.id ?? null,
          colorCode: item.color?.code || '',
          colorName: item.color?.name || '',
          ctSeconds: resolveCtSeconds(item.process),
          quantity: Number(item.quantity) || 0,
          assignmentPlanId: item.assignmentPlanId ?? null,
        }))
    );
    const workerIdSet = new Set(
      records
        .map((record) => toPositiveIdOrNull(record.workerId))
        .filter((workerId) => workerId !== null)
    );

    const totalContractedSeconds = records.reduce(
      (sum, row) => sum + row.ctSeconds * row.quantity,
      0
    );

    return {
      records,
      workerCount: workerIdSet.size,
      itemCount: records.length,
      totalContractedSeconds,
    };
  }, [workerLogs]);
  const autoExceededNote = useMemo(() => {
    const lines = summary.records
      .map((record) => {
        const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
        if (!assignmentPlanId) return null;
        const plan = assignmentPlanById.get(assignmentPlanId);
        const baselineQuantity = resolveAssignmentPlanBaselineQuantity(plan);
        if (!baselineQuantity || record.quantity <= baselineQuantity) return null;

        return `${
          String(record?.workerName || '').trim() || '이름 미상'
        } / ${formatAssignmentPlanLabel(plan)} / ${formatWorkRecordProcessLabel(record)} ${
          record.quantity - baselineQuantity
        }개 초과`;
      })
      .filter(Boolean);

    return lines.join('\n');
  }, [assignmentPlanById, summary.records]);
  const noteValue = useMemo(
    () =>
      buildCombinedNote({
        manualNote: note,
        autoNote: autoExceededNote,
      }),
    [autoExceededNote, note]
  );
  const handleSave = () => {
    setSaveErrorMessage('');
    if (!selectedFactory) return;
    if (!selectedLine?.id) {
      setSaveErrorMessage('라인을 선택해 주세요.');
      return;
    }
    if (summary.records.length === 0) return;
    const eligibleWorkerIdSet = new Set(
      employees
        .map((employee) => toPositiveIdOrNull(employee?.id))
        .filter((workerId) => workerId !== null)
    );
    const invalidLineWorkerRecord = summary.records.find((record) => {
      const workerId = toPositiveIdOrNull(record?.workerId);
      if (!workerId) return true;
      return !eligibleWorkerIdSet.has(workerId);
    });
    if (invalidLineWorkerRecord) {
      setSaveErrorMessage(
        '선택한 작업일/라인에 소속되지 않은 작업자가 포함되어 있습니다. 라인과 작업자를 다시 확인해 주세요.'
      );
      return;
    }
    const invalidWorkerLogIndex = workerLogs.findIndex((log) => {
      const workerId = toPositiveIdOrNull(log.worker?.id);
      if (workerId) return false;
      return log.items.some((item) => item.process && Number(item.quantity) > 0);
    });
    if (invalidWorkerLogIndex >= 0) {
      setSaveErrorMessage(
        `${invalidWorkerLogIndex + 1}번째 작업 항목에 유효한 작업자 ID가 없습니다. 작업자를 다시 선택해 주세요.`
      );
      return;
    }
    if (selectedFactoryWagePerSecond == null || selectedFactoryWagePerSecond <= 0) {
      setSaveErrorMessage('초당 공임이 0 이하이거나 미설정 상태입니다. 공장 공임을 먼저 설정해 주세요.');
      return;
    }
    const duplicateWorkerLogIndex = findDuplicateWorkerLogIndex(workerLogs);
    if (duplicateWorkerLogIndex >= 0) {
      const duplicateLog = workerLogs[duplicateWorkerLogIndex];
      const workerLabel =
        String(duplicateLog?.worker?.name || '').trim() ||
        `${duplicateWorkerLogIndex + 1}번째 작업자 행`;
      setDuplicateEntryMessage(
        `${workerLabel}에 같은 배정/공정 조합이 중복되어 있습니다. 수량으로 합산해 주세요.`
      );
      return;
    }
    if (hasAssignmentPlans) {
      if (hasOnlyUnagreedAssignmentPlans) {
        setSaveErrorMessage('이 라인에는 CT 동의된 배정카드가 없습니다.');
        return;
      }
      const agreedAssignmentPlanIdSet = new Set(
        agreedAssignmentPlans
          .map((plan) => toPositiveIdOrNull(plan?.dbId))
          .filter((planId) => planId !== null)
      );
      const missingAssignmentRecord = summary.records.find(
        (record) => toPositiveIdOrNull(record?.assignmentPlanId) === null
      );
      if (missingAssignmentRecord) {
        setSaveErrorMessage('배정카드를 선택해 주세요.');
        return;
      }
      const unagreedAssignmentRecord = summary.records.find((record) => {
        const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
        if (assignmentPlanId === null) return true;
        return !agreedAssignmentPlanIdSet.has(assignmentPlanId);
      });
      if (unagreedAssignmentRecord) {
        setSaveErrorMessage(
          'CT 동의가 완료된 배정 카드만 작업 기록으로 저장할 수 있습니다.'
        );
        return;
      }
    }
    const assignmentProcessRows = collectAssignmentProcessQuantityRows(summary.records);
    const excessiveAssignmentProcess = assignmentProcessRows.find((row) => {
      const plan = assignmentPlanById.get(row.assignmentPlanId);
      if (!plan) return false;
      const baselineQuantity = resolveAssignmentPlanBaselineQuantity(plan);
      if (!baselineQuantity) return false;
      const maxAllowedQuantity = Math.max(
        baselineQuantity,
        Math.ceil(baselineQuantity * ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER)
      );
      return row.quantity > maxAllowedQuantity;
    });
    if (excessiveAssignmentProcess) {
      const plan = assignmentPlanById.get(excessiveAssignmentProcess.assignmentPlanId);
      const baselineQuantity = resolveAssignmentPlanBaselineQuantity(plan);
      const maxAllowedQuantity =
        baselineQuantity == null
          ? null
          : Math.max(
              baselineQuantity,
              Math.ceil(baselineQuantity * ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER)
            );
      setSaveErrorMessage(
        `${formatAssignmentPlanLabel(plan)} / ${excessiveAssignmentProcess.processLabel} 수량 ${
          excessiveAssignmentProcess.quantity
        }개가 허용 상한 ${
          maxAllowedQuantity ?? '-'
        }개를 초과했습니다. 수량을 확인해 주세요.`
      );
      return;
    }

    onSave?.({
      workDate: workDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      factoryId: selectedFactory.id,
      factoryName: selectedFactory.name,
      lineId: selectedLine.id,
      lineName: selectedLine.name,
      factoryWagePerSecond: selectedFactoryWagePerSecond,
      ctBasis: 'CT',
      workerCount: summary.workerCount,
      itemCount: summary.itemCount,
      totalContractedSeconds: summary.totalContractedSeconds,
      records: summary.records,
      note: noteValue,
    });
  };

  if (isInitialDetailLoading && !isLogSwitching) {
    return (
      <Box
        sx={{
          width: isPageMode ? '100%' : { xs: '100vw', md: '56vw' },
          p: isPageMode ? 0 : 3,
          height: isPageMode ? 'auto' : '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6">작업 상세</Typography>
          </Box>
          {!isPageMode ? (
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          ) : null}
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: 3,
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafbff',
          }}
        >
          <Typography color="text.secondary">작업 기록을 준비하고 있습니다.</Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: isPageMode ? '100%' : { xs: '100vw', md: '56vw' },
        p: isPageMode ? 0 : 3,
        height: isPageMode ? 'auto' : '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">작업 상세</Typography>
        </Box>
        {!isPageMode ? (
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        ) : null}
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fafbff' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale="ko"
            localeText={datePickerKoKR.components.MuiLocalizationProvider.defaultProps.localeText}
          >
            <DatePicker
              label="작업일자"
              value={workDate}
              onChange={setWorkDate}
              format="YYYY-MM-DD"
              sx={{ minWidth: 220 }}
              slotProps={{ textField: { fullWidth: true, size: 'small' } }}
            />
          </LocalizationProvider>

          <SearchableSelect
            label={!loading && factories.length === 1 ? '공장 (자동선택)' : '공장'}
            className={!loading && factories.length === 1 ? 'auto-selected-field' : undefined}
            options={factories}
            value={selectedFactory}
            onChange={(_event, value) => setSelectedFactory(value)}
            autoHighlight
            disabled={loading || factories.length === 1}
            sx={{ minWidth: 240 }}
            textFieldProps={{ size: 'small' }}
            isOptionEqualToValue={(option, value) => option?.id === value?.id}
          />

          <SearchableSelect
            label="라인"
            options={lines}
            value={selectedLine}
            onChange={(_event, value) => setSelectedLine(value)}
            autoHighlight
            disabled={!selectedFactory || !isLineCacheReady || lines.length === 0 || isLogSwitching}
            sx={{ minWidth: 200 }}
            getOptionLabel={(option) => option?.name || ''}
            isOptionEqualToValue={(option, value) => option?.id === value?.id}
            textFieldProps={{ size: 'small' }}
          />

          <TextField
            label="초당 공임"
            value={
              selectedFactory
                ? selectedFactoryWagePerSecond == null
                  ? '미설정'
                  : `${formatNumberWithCommas(selectedFactoryWagePerSecond, {
                      fallback: '0',
                      maximumFractionDigits: 2,
                    })} 동/초`
                : '-'
            }
            InputProps={{ readOnly: true }}
            size="small"
            sx={{ minWidth: 240, '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          />
        </Stack>

        <TextField
          label="비고"
          value={noteValue}
          onChange={(event) => setNote(stripAutoNoteFromText(event.target.value))}
          size="small"
          fullWidth
          multiline
          minRows={2}
          sx={{ mt: 1.5 }}
          placeholder="메모를 입력해 주세요."
        />
        {duplicateEntryMessage ? (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            {duplicateEntryMessage}
          </Alert>
        ) : null}
        {saveErrorMessage ? (
          <Alert severity="error" sx={{ mt: 1.5, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            {saveErrorMessage}
          </Alert>
        ) : null}
        {isFactoryAggregateInitialLog ? (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            공장 단위 합산 로그는 현재 수정 저장을 지원하지 않습니다.
          </Alert>
        ) : null}
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          flex: isPageMode ? '0 1 auto' : 1,
          minHeight: isPageMode ? 420 : 0,
          p: 2,
          overflow: 'auto',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {selectedFactory
              ? selectedLine
                ? isLogSwitching
                  ? '선택한 라인 기록을 불러오는 중입니다.'
                  : isSelectedLineDataLoading
                  ? '라인 데이터를 불러오는 중입니다.'
                  : employees.length > 0
                  ? `저장 대상 ${summary.records.length}건`
                  : '선택한 라인/작업일 기준으로 입력 가능한 작업자가 없습니다.'
                : isLineSelectionLoading
                ? '라인 정보를 불러오는 중입니다.'
                : '라인을 먼저 선택하세요.'
              : '먼저 공장을 선택하세요.'}
          </Typography>
        </Box>

        {isLogSwitching ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            같은 작업일의 다른 라인 기록으로 전환하고 있습니다.
          </Alert>
        ) : selectedFactory && employees.length === 0 ? (
          !selectedLine ? (
            isLineSelectionLoading ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              라인 정보를 불러오는 중입니다.
            </Alert>
            ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              라인을 선택하면 해당 라인 소속 작업자만 불러옵니다.
            </Alert>
            )
          ) : isSelectedLineDataLoading ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              라인 데이터를 준비하고 있습니다.
            </Alert>
          ) : (
          <Alert severity="warning" sx={{ mt: 2 }}>
            선택한 작업일 기준으로 이 라인에 소속된 작업자가 없어 작업 기록을 작성할 수 없습니다.
          </Alert>
          )
        ) : workerLogs.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleAddWorker()}
              disabled={!selectedLine || isSelectedLineDataLoading || isLogSwitching || employees.length === 0}
            >
              첫 작업자 추가
            </Button>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {workerLogGroups.map((group) => (
              <WorkerLog
                key={group.id}
                group={{
                  ...group,
                  entries: group.entries.map((log) => {
                    const item =
                      Array.isArray(log.items) && log.items.length > 0
                        ? log.items[0]
                        : buildEmptyItem();
                    return {
                      id: log.id,
                      worker: log.worker,
                      card: item.card,
                      assignmentPlanId: item.assignmentPlanId,
                      customer: item.customer,
                      style: item.style,
                      process: item.process,
                      color: item.color,
                      quantity: item.quantity,
                    };
                  }),
                }}
                availableEmployees={employees}
                assignmentPlans={assignmentPlans}
                processOptionsByLogId={processOptionsByLogId}
                duplicateProcessKeysByLogId={duplicateProcessKeysByLogId}
                focusRequest={focusRequest}
                onWorkerChange={handleWorkerChange}
                onCardChange={handleCardChange}
                onProcessChange={handleProcessChange}
                onQuantityChange={handleQuantityChange}
                onAddRow={handleAddWorker}
                onRemoveRow={handleRemoveWorker}
                canRemoveRow={workerLogs.length > 1}
              />
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleAddWorker()}
                disabled={!selectedLine || isSelectedLineDataLoading || isLogSwitching || employees.length === 0}
              >
                다른 작업자 추가
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} ref={cancelButtonRef}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !selectedFactory ||
              !selectedLine ||
              isSelectedLineDataLoading ||
              isLogSwitching ||
              summary.records.length === 0 ||
              isFactoryAggregateInitialLog
            }
          >
            저장
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default WorkDetail;
