import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
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
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { normalizeProcesses } from '../../../utils/processTime';
import { loadHolidays } from '../../../utils/localData';

const STATUS_META = {
  PENDING: { label: 'CT 대기', color: 'default' },
  AGREED: { label: 'CT 동의', color: 'success' },
  REJECTED: { label: '운영팀 검토', color: 'warning' },
};
const CT_INPUT_REGEX = /^\d*(?:\.\d{0,2})?$/;

const normalizeCtStatus = (value) => {
  if (value === 'AGREED' || value === 'REJECTED') return value;
  return 'PENDING';
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
};

const formatScheduleDate = (baseDate, dayIndex) => {
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + toNonNegativeInt(dayIndex, 0));
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][target.getDay()];
  return `${target.getMonth() + 1}/${target.getDate()} (${weekday})`;
};

const formatScheduleRange = (baseDate, assignment) => {
  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));
  if (startIndex === endIndex) {
    return formatScheduleDate(baseDate, startIndex);
  }
  return `${formatScheduleDate(baseDate, startIndex)} ~ ${formatScheduleDate(baseDate, endIndex)}`;
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
  `${formatNumberWithCommas(value, { fallback: '0', maximumFractionDigits: 2 })} 동`;

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

const formatSecondsLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })} 초`;
};

const formatDaysLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return `${formatNumberWithCommas(parsed, { fallback: '0', maximumFractionDigits: 2 })} 일`;
};

const resolveLineDailyCapacitySeconds = (line, headcount) => {
  const directCapacity = Number(line?.dailyCapacitySeconds);
  if (Number.isFinite(directCapacity) && directCapacity > 0) {
    return Math.round(directCapacity);
  }
  return Math.max(1, toPositiveInt(headcount, 1)) * 8 * 60 * 60;
};

const resolveProcessCtBaseSeconds = (process) => {
  const at = Number(process?.at);
  if (Number.isFinite(at) && at > 0) {
    return { basis: 'AT', seconds: at };
  }
  const pt = Number(process?.pt);
  if (Number.isFinite(pt) && pt > 0) {
    return { basis: 'PT', seconds: pt };
  }
  return { basis: 'NONE', seconds: 0 };
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

const isNonWorkingDate = (date, holidaySet) => {
  if (!date) return false;
  if (date.getDay() === 0) return true;
  return holidaySet.has(buildDateKey(date));
};

const getAssignmentWorkingDays = (assignment, baseDate, holidaySet) => {
  if (!assignment) return 0;
  const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
  const endIndex = Math.max(startIndex, toNonNegativeInt(assignment?.endIndex, startIndex));
  const startPercent = Number(assignment?.startDayPercent);
  const endPercent = Number(assignment?.endDayPercent);
  const startRatio = Number.isFinite(startPercent) && startPercent > 0 ? startPercent / 100 : 1;
  const endRatio = Number.isFinite(endPercent) && endPercent > 0 ? endPercent / 100 : 1;

  let total = 0;
  for (let dayIndex = startIndex; dayIndex <= endIndex; dayIndex += 1) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + dayIndex);
    if (isNonWorkingDate(date, holidaySet)) continue;

    if (startIndex === endIndex) {
      total += startRatio;
      continue;
    }
    if (dayIndex === startIndex) {
      total += startRatio;
      continue;
    }
    if (dayIndex === endIndex) {
      total += endRatio;
      continue;
    }
    total += 1;
  }

  return total;
};

const ProductionPlanBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState(null);
  const [cards, setCards] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lines, setLines] = useState([]);
  const [factories, setFactories] = useState([]);
  const [styles, setStyles] = useState([]);
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
  const todayKey = useMemo(() => buildDateKey(new Date()), []);

  const lineById = useMemo(
    () => new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.id), line])),
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
    return (Array.isArray(assignments) ? assignments : [])
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
        const agreedSeconds = resolveAgreedSeconds(assignment);
        const wagePerSecond = Number(factory?.wagePerSecond);
        const validWage = Number.isFinite(wagePerSecond) && wagePerSecond > 0;
        const expectedCost = validWage ? proposalSeconds * wagePerSecond : null;
        const agreedCost = validWage && status === 'AGREED' ? agreedSeconds * wagePerSecond : null;
        const workingDays = getAssignmentWorkingDays(assignment, baseDate, holidaySet);
        const expectedPerPerson = expectedCost == null ? null : expectedCost / headcount;
        const monthlyPerPerson =
          expectedPerPerson == null || workingDays <= 0
            ? null
            : (expectedPerPerson / workingDays) * 26;

        return {
          ...assignment,
          card,
          style,
          line,
          factory,
          headcount,
          lineDailyCapacitySeconds,
          status,
          proposalSeconds,
          agreedSeconds,
          wagePerSecond: validWage ? wagePerSecond : null,
          expectedCost,
          agreedCost,
          workingDays,
          expectedPerPerson,
          monthlyPerPerson,
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
  }, [assignments, cardById, styleById, lineById, factoryById, lineHeadcountById, baseDate, holidaySet]);

  const statusSummary = useMemo(
    () =>
      assignmentsForView.reduce(
        (acc, assignment) => {
          const status = normalizeCtStatus(assignment?.status);
          if (status === 'AGREED') acc.agreed += 1;
          else if (status === 'REJECTED') acc.rejected += 1;
          else acc.pending += 1;
          return acc;
        },
        { pending: 0, agreed: 0, rejected: 0 }
      ),
    [assignmentsForView]
  );

  const actionableAssignments = useMemo(
    () =>
      assignmentsForView.filter(
        (assignment) => normalizeCtStatus(assignment?.status) !== 'AGREED'
      ),
    [assignmentsForView]
  );

  const selectedAssignment = useMemo(() => {
    if (actionableAssignments.length === 0) return null;
    if (!selectedAssignmentId) return actionableAssignments[0] || null;
    return (
      actionableAssignments.find(
        (item) => String(item.id) === String(selectedAssignmentId)
      ) ||
      actionableAssignments[0] ||
      null
    );
  }, [actionableAssignments, selectedAssignmentId]);
  const selectedAssignmentBusy =
    !!selectedAssignment &&
    String(savingAssignmentId || '') === String(selectedAssignment.id);

  const assignmentViewById = useMemo(
    () => new Map(assignmentsForView.map((item) => [String(item.id), item])),
    [assignmentsForView]
  );

  const actionableByDateKey = useMemo(() => {
    const map = new Map();
    actionableAssignments.forEach((assignment) => {
      const startIndex = toNonNegativeInt(assignment?.startIndex, 0);
      const endIndex = Math.max(
        startIndex,
        toNonNegativeInt(assignment?.endIndex, startIndex)
      );
      for (let dayIndex = startIndex; dayIndex <= endIndex; dayIndex += 1) {
        const key = buildDateKey(toScheduleDate(baseDate, dayIndex));
        const current = map.get(key);
        if (current) {
          current.push(assignment);
        } else {
          map.set(key, [assignment]);
        }
      }
    });
    return map;
  }, [actionableAssignments, baseDate]);

  const selectedAssignmentDateKeys = useMemo(() => {
    const keys = new Set();
    if (!selectedAssignment) return keys;
    const startIndex = toNonNegativeInt(selectedAssignment?.startIndex, 0);
    const endIndex = Math.max(
      startIndex,
      toNonNegativeInt(selectedAssignment?.endIndex, startIndex)
    );
    for (let dayIndex = startIndex; dayIndex <= endIndex; dayIndex += 1) {
      keys.add(buildDateKey(toScheduleDate(baseDate, dayIndex)));
    }
    return keys;
  }, [
    selectedAssignment?.id,
    selectedAssignment?.startIndex,
    selectedAssignment?.endIndex,
    baseDate,
  ]);

  const calendarDays = useMemo(
    () => buildMonthlyCalendarDays(calendarMonth),
    [calendarMonth]
  );

  useEffect(() => {
    if (actionableAssignments.length === 0) {
      setSelectedAssignmentId('');
      return;
    }
    setSelectedAssignmentId((prev) => {
      const exists = actionableAssignments.some(
        (item) => String(item.id) === String(prev)
      );
      return exists ? prev : String(actionableAssignments[0].id);
    });
  }, [actionableAssignments]);

  useEffect(() => {
    if (!selectedAssignment) return;
    const targetMonth = toMonthStart(
      toScheduleDate(baseDate, selectedAssignment?.startIndex)
    );
    setCalendarMonth((prev) =>
      isSameMonth(prev, targetMonth) ? prev : targetMonth
    );
  }, [selectedAssignment?.id, selectedAssignment?.startIndex, baseDate]);

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
        const proposedSeconds = toOptionalPositiveNumber(item?.proposedSeconds);
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

      return processes.map((process, index) => {
        const processKey = String(
          process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
        );
        const processName = process?.name || process?.processName || process?.code || `공정 ${index + 1}`;
        const processQuantity = Math.max(1, toPositiveInt(process?.quantity, 1));
        const baseInfo = resolveProcessCtBaseSeconds(process);
        const baseSeconds = baseInfo.seconds;
        const basePerPieceSeconds = baseSeconds * processQuantity;

        const directSeconds = toOptionalPositiveNumber(draftByProcess[processKey]);
        const hasDirectProposal = directSeconds != null;
        const proposedSeconds = hasDirectProposal ? directSeconds : baseSeconds;
        const proposedPerPieceSeconds = proposedSeconds * processQuantity;

        const totalBaseSeconds = basePerPieceSeconds * orderQuantity;
        const totalProposedSeconds = proposedPerPieceSeconds * orderQuantity;
        const expectedCost = wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond;
        const expectedDays =
          Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
            ? totalProposedSeconds / lineDailyCapacitySeconds
            : null;

        return {
          processKey,
          processName,
          processQuantity,
          baseBasis: baseInfo.basis,
          baseSeconds,
          basePerPieceSeconds,
          proposedSeconds,
          proposedPerPieceSeconds,
          hasDirectProposal,
          totalBaseSeconds,
          totalProposedSeconds,
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

  const selectedCostSummary = useMemo(() => {
    if (!selectedAssignment) return null;

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

      return {
        totalBasePerPieceSeconds: fallbackTotalSeconds / orderQuantity,
        totalProposedPerPieceSeconds: fallbackTotalSeconds / orderQuantity,
        totalBaseSeconds: fallbackTotalSeconds,
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
    const totalProposedPerPieceSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.proposedPerPieceSeconds,
      0
    );
    const totalBaseSeconds = selectedProcessRows.reduce((sum, row) => sum + row.totalBaseSeconds, 0);
    const totalProposedSeconds = selectedProcessRows.reduce(
      (sum, row) => sum + row.totalProposedSeconds,
      0
    );
    const directProposalCount = selectedProcessRows.filter((row) => row.hasDirectProposal).length;
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
      totalProposedPerPieceSeconds,
      totalBaseSeconds,
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
          requestJSON('/assignment-board-state' + query).catch(() => ({ cards: [], assignments: [] })),
          requestJSON('/lines' + query).catch(() => []),
          requestJSON('/factories' + query).catch(() => []),
          requestJSON('/line-workers' + query).catch(() => []),
          fetchStylesFromApi({ orgId: activeOrgId }).catch(() => []),
        ]);
        if (cancelled) return;

        const nextCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
        const nextAssignments = Array.isArray(boardState?.assignments) ? boardState.assignments : [];
        setCards(nextCards);
        setAssignments(nextAssignments);
        setLines(Array.isArray(lineRows) ? lineRows : []);
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
        setLineWorkers(Array.isArray(lineWorkerRows) ? lineWorkerRows : []);
        setStyles(Array.isArray(styleRows) ? styleRows : []);
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
  }, [activeOrgId]);

  const persistBoardState = useCallback(
    async (nextAssignments, nextCards = cards) => {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/assignment-board-state' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: nextCards, assignments: nextAssignments }),
      });
      setCards(nextCards);
      setAssignments(nextAssignments);
    },
    [activeOrgId, cards]
  );

  const handleAgree = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    if (!target) return;

    const now = new Date().toISOString();
    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== String(assignmentId)) return item;

      return {
        ...item,
        ctStatus: 'AGREED',
        contractedSeconds:
          toNonNegativeInt(item?.contractedSeconds, 0) > 0
            ? toNonNegativeInt(item?.contractedSeconds, 0)
            : Math.max(1, toNonNegativeInt(resolveSecondsForProposal(item), 1)),
        ctSource: item?.ctSource || item?.proposalBasis || item?.basis || 'MANUAL',
        ctAgreedBy: item?.ctAgreedBy || 'LINE_LEADER',
        ctAgreedAt: now,
      };
    });
    const nextCards = target?.cardId
      ? cards.map((card) =>
          String(card?.id) === String(target.cardId)
            ? {
                ...card,
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
      showNotification('작업 계획이 동의 처리되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '작업 계획 동의 처리에 실패했습니다.', 'error');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const handleRequestAdjustment = async (assignmentId) => {
    if (!assignmentId || savingAssignmentId) return;

    const target = assignments.find((item) => String(item?.id) === String(assignmentId));
    const targetView = assignmentViewById.get(String(assignmentId)) || null;
    if (!target) return;

    const confirmMessage =
      '조정 요청 내용을 운영팀 검토 대상으로 등록합니다. 현재 라인 배정은 유지됩니다. 진행할까요?';
    if (!window.confirm(confirmMessage)) return;

    const processRows = buildProcessRows(targetView);
    const orderQuantity = Math.max(1, toPositiveInt(target?.quantity, 1));
    const lineDailyCapacitySeconds = Number(targetView?.lineDailyCapacitySeconds);
    const wagePerSecond = toOptionalPositiveNumber(targetView?.wagePerSecond);
    const headcount = Math.max(1, toPositiveInt(targetView?.headcount, 1));
    const workingDays = Number(targetView?.workingDays) > 0 ? Number(targetView.workingDays) : 0;

    const totalBasePerPieceSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.basePerPieceSeconds, 0)
        : resolveSecondsForProposal(target) / orderQuantity;
    const totalProposedPerPieceSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.proposedPerPieceSeconds, 0)
        : resolveSecondsForProposal(target) / orderQuantity;
    const totalBaseSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.totalBaseSeconds, 0)
        : resolveSecondsForProposal(target);
    const totalProposedSeconds =
      processRows.length > 0
        ? processRows.reduce((sum, row) => sum + row.totalProposedSeconds, 0)
        : resolveSecondsForProposal(target);
    const totalCostPreview = wagePerSecond == null ? null : totalProposedSeconds * wagePerSecond;
    const perPersonPreview = totalCostPreview == null ? null : totalCostPreview / headcount;
    const monthlyPreview =
      perPersonPreview == null || workingDays <= 0 ? null : (perPersonPreview / workingDays) * 26;
    const totalDurationDays =
      Number.isFinite(lineDailyCapacitySeconds) && lineDailyCapacitySeconds > 0
        ? totalProposedSeconds / lineDailyCapacitySeconds
        : null;
    const directProposalCount = processRows.filter((row) => row.hasDirectProposal).length;

    const adjustmentPayload = {
      requestedAt: new Date().toISOString(),
      requestedBy: 'LINE_LEADER',
      sourceAssignmentId: target.id,
      lineId: target.lineId,
      lineName: targetView?.line?.name || '',
      quantity: orderQuantity,
      schedule: {
        startIndex: toNonNegativeInt(target?.startIndex, 0),
        endIndex: Math.max(
          toNonNegativeInt(target?.startIndex, 0),
          toNonNegativeInt(target?.endIndex, toNonNegativeInt(target?.startIndex, 0))
        ),
        startDayPercent: Number(target?.startDayPercent) || 100,
        endDayPercent: Number(target?.endDayPercent) || 100,
      },
      totalBasePerPieceSeconds,
      totalProposedPerPieceSeconds,
      totalBaseSeconds,
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
        proposedSeconds: row.proposedSeconds,
        proposedPerPieceSeconds: row.proposedPerPieceSeconds,
        hasLineLeaderProposal: row.hasDirectProposal,
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
    const adjustmentSummary = `운영팀 조정 요청 · ${new Date().toISOString()}`;
    const nextAssignments = assignments.map((item) => {
      if (String(item?.id) !== String(assignmentId)) return item;
      return {
        ...item,
        ctStatus: 'REJECTED',
        ctSource: 'LINE_LEADER_PROPOSAL',
        ctAgreedBy: null,
        ctAgreedAt: null,
        ctNote: adjustmentSummary,
      };
    });

    setSavingAssignmentId(String(assignmentId));
    try {
      await persistBoardState(nextAssignments, nextCards);
      showNotification(
        directProposalCount > 0
          ? `조정 요청이 등록되었습니다. 공정 ${directProposalCount}건의 제안 CT가 운영팀 검토로 전달되었습니다.`
          : '조정 요청이 운영팀 검토 대상으로 등록되었습니다.',
        'info'
      );
    } catch (error) {
      showNotification(error?.message || '조정 요청 처리에 실패했습니다.', 'error');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">작업 계획 협의</Typography>
            <Typography variant="body2" color="text.secondary">
              라인 배정 작업의 일정/비용을 검토하고 CT 동의 또는 조정 요청을 처리합니다.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label={`CT 대기 ${statusSummary.pending}`} />
            <Chip label={`CT 동의 ${statusSummary.agreed}`} color="success" variant="outlined" />
            <Chip label={`운영팀 검토 ${statusSummary.rejected}`} color="warning" variant="outlined" />
          </Stack>
        </Box>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1.45fr) minmax(0, 1fr)',
          },
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack spacing={1.5}>
            <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  동의/조정 필요 계획 목록
                </Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>상태</TableCell>
                    <TableCell>라인</TableCell>
                    <TableCell>고객/스타일</TableCell>
                    <TableCell align="right">수량</TableCell>
                    <TableCell>예상 일정</TableCell>
                    <TableCell align="right">예상 비용</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableStatusRow colSpan={6} message="불러오는 중..." sx={{ py: 2 }} />
                  ) : actionableAssignments.length === 0 ? (
                    <TableStatusRow colSpan={6} message="검토할 배정 작업이 없습니다." sx={{ py: 2 }} />
                  ) : (
                    actionableAssignments.map((assignment) => {
                      const statusMeta = STATUS_META[assignment.status] || STATUS_META.PENDING;
                      const rowSelected = String(selectedAssignment?.id || '') === String(assignment.id);

                      return (
                        <TableRow
                          key={assignment.id}
                          hover
                          selected={rowSelected}
                          onClick={() => setSelectedAssignmentId(String(assignment.id))}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Chip
                              size="small"
                              label={statusMeta.label}
                              color={statusMeta.color}
                              variant={assignment.status === 'PENDING' ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment?.line?.name || `라인 ${assignment.lineId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {assignment?.factory?.name || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {assignment.customer || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {assignment.label || '-'}
                              {assignment.colorName ? ` · ${assignment.colorName}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {formatNumberWithCommas(assignment.quantity, {
                              fallback: '-',
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell>{formatScheduleRange(baseDate, assignment)}</TableCell>
                          <TableCell align="right">
                            {assignment.expectedCost == null ? '-' : formatCurrencyDong(assignment.expectedCost)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                </Table>
              </TableContainer>
            </Paper>

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
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Button size="small" onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}>
                    이전
                  </Button>
                  <Typography
                    variant="body2"
                    sx={{ minWidth: 78, textAlign: 'center', fontWeight: 600 }}
                  >
                    {formatMonthLabel(calendarMonth)}
                  </Typography>
                  <Button size="small" onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}>
                    다음
                  </Button>
                </Stack>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {CALENDAR_WEEKDAYS.map((weekday, index) => (
                  <Box
                    key={`weekday-${weekday}`}
                    sx={{
                      px: 0.75,
                      py: 0.5,
                      bgcolor: 'grey.100',
                      borderBottom: '1px solid',
                      borderRight: index % 7 === 6 ? 'none' : '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      {weekday}
                    </Typography>
                  </Box>
                ))}

                {calendarDays.map((date, index) => {
                  const dateKey = buildDateKey(date);
                  const dayAssignments = actionableByDateKey.get(dateKey) || [];
                  const inCurrentMonth = isSameMonth(date, calendarMonth);
                  const isToday = dateKey === todayKey;
                  const inSelectedRange = selectedAssignmentDateKeys.has(dateKey);

                  return (
                    <Box
                      key={dateKey}
                      sx={{
                        minHeight: 94,
                        p: 0.75,
                        borderRight: index % 7 === 6 ? 'none' : '1px solid',
                        borderBottom: index >= calendarDays.length - 7 ? 'none' : '1px solid',
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
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: isToday || inSelectedRange ? 700 : 500 }}>
                          {date.getDate()}
                        </Typography>
                        {dayAssignments.length > 0 ? (
                          <Chip size="small" label={`${dayAssignments.length}`} sx={{ height: 18 }} />
                        ) : null}
                      </Box>
                      <Stack spacing={0.4}>
                        {dayAssignments.slice(0, 2).map((assignment) => (
                          <Box
                            key={`${dateKey}-${assignment.id}`}
                            onClick={() => setSelectedAssignmentId(String(assignment.id))}
                            sx={{
                              px: 0.5,
                              py: 0.3,
                              borderRadius: 0.75,
                              bgcolor: 'rgba(25, 118, 210, 0.12)',
                              cursor: 'pointer',
                            }}
                          >
                            <Typography variant="caption" sx={{ display: 'block' }} noWrap>
                              {assignment?.line?.name || `L${assignment?.lineId || '-'}`}
                            </Typography>
                          </Box>
                        ))}
                        {dayAssignments.length > 2 ? (
                          <Typography variant="caption" color="text.secondary">
                            +{dayAssignments.length - 2} more
                          </Typography>
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          </Stack>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Stack spacing={1.5}>
            {selectedAssignment ? (
              <>
                <Paper variant="outlined" sx={{ p: 2 }}>
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
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleAgree(selectedAssignment.id)}
                      disabled={selectedAssignmentBusy || selectedAssignment.status === 'AGREED'}
                    >
                      {selectedAssignment.status === 'AGREED' ? '동의됨' : '동의'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={() => handleRequestAdjustment(selectedAssignment.id)}
                      disabled={selectedAssignmentBusy}
                    >
                      조정 요청
                    </Button>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    CT/비용 요약
                  </Typography>
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        공정 CT 합 (기본/한 벌)
                      </Typography>
                      <Typography variant="body2">
                        {formatSecondsLabel(selectedCostSummary?.totalBasePerPieceSeconds)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        공정 CT 합 (제안/한 벌)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatSecondsLabel(selectedCostSummary?.totalProposedPerPieceSeconds)}
                      </Typography>
                    </Box>
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
                        월 환산 1인 기대 공임
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
                        CT 제안 시간(현재)
                      </Typography>
                      <Typography variant="body2">
                        {formatSecondsLabel(selectedAssignment.proposalSeconds, '0 초')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        CT 합의 시간
                      </Typography>
                      <Typography variant="body2">
                        {selectedAssignment.status === 'AGREED'
                          ? formatSecondsLabel(selectedAssignment.agreedSeconds, '0 초')
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
                        합의 비용
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedAssignment.status !== 'AGREED' || selectedAssignment.agreedCost == null
                          ? '-'
                          : formatCurrencyDong(selectedAssignment.agreedCost)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    공정 CT 상세 / 라인장 제안
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    제안 CT를 입력한 뒤 조정 요청하면 운영팀 검토 큐로 전달되며 현재 라인 배정은 유지됩니다.
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
                            <TableCell align="center">기준</TableCell>
                            <TableCell align="right">공정수</TableCell>
                            <TableCell align="right">기본 CT(초)</TableCell>
                            <TableCell align="right">제안 CT(초)</TableCell>
                            <TableCell align="right">한 벌 CT(초)</TableCell>
                            <TableCell align="right">주문 공임</TableCell>
                            <TableCell align="right">기간(일)</TableCell>
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
                              <TableCell align="center">{row.baseBasis === 'NONE' ? '-' : row.baseBasis}</TableCell>
                              <TableCell align="right">{row.processQuantity}</TableCell>
                              <TableCell align="right">
                                {formatNumberWithCommas(row.baseSeconds, {
                                  fallback: '0',
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell align="right">
                                <TextField
                                  size="small"
                                  value={selectedDraftByProcess[row.processKey] ?? ''}
                                  placeholder={
                                    row.baseSeconds > 0
                                      ? String(
                                          formatNumberWithCommas(row.baseSeconds, {
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
                              </TableCell>
                              <TableCell align="right">
                                {formatNumberWithCommas(row.proposedPerPieceSeconds, {
                                  fallback: '0',
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell align="right">
                                {row.expectedCost == null ? '-' : formatCurrencyDong(row.expectedCost)}
                              </TableCell>
                              <TableCell align="right">{formatDaysLabel(row.expectedDays)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                              합계
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {formatNumberWithCommas(selectedCostSummary?.totalProposedPerPieceSeconds, {
                                fallback: '0',
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {selectedCostSummary?.totalCost == null
                                ? '-'
                                : formatCurrencyDong(selectedCostSummary.totalCost)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {formatDaysLabel(selectedCostSummary?.totalDurationDays)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {selectedCostSummary?.directProposalCount > 0
                      ? `직접 제안 입력: ${selectedCostSummary.directProposalCount}개 공정`
                      : '입력값이 없으면 기본 AT/PT 기준으로 운영팀 조정 요청됩니다.'}
                  </Typography>
                </Paper>
              </>
            ) : (
              <Alert severity="info">왼쪽 목록에서 배정 작업을 선택해 주세요.</Alert>
            )}
          </Stack>
        </Box>
      </Box>
    </AppPageContainer>
  );
};

export default ProductionPlanBoard;
