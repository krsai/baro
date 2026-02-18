import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import AddIcon from '@mui/icons-material/Add';
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
const resolveCustomerKey = (customer) => normalizeKeyPart(customer?.id ?? customer?.name);
const resolveStyleKey = (style) => normalizeKeyPart(style?.id ?? style?.name);
const resolveColorKey = (color) => normalizeKeyPart(color?.id ?? color?.code ?? color?.name);
const resolveProcessKey = (process) =>
  normalizeKeyPart(process?.code ?? process?.name ?? process?.id);
const buildProcessComboKey = ({ customer, style, color, process }) => {
  const customerKey = resolveCustomerKey(customer);
  const styleKey = resolveStyleKey(style);
  const colorKey = resolveColorKey(color);
  const processKey = resolveProcessKey(process);

  if (!customerKey || !styleKey || !colorKey || !processKey) return '';
  return `${customerKey}::${styleKey}::${colorKey}::${processKey}`;
};
const hasDuplicateProcessCombo = (items = []) => {
  const seen = new Set();
  for (const item of items) {
    const key = buildProcessComboKey(item || {});
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
const findDuplicateWorkerLogIndex = (workerLogs = []) =>
  workerLogs.findIndex((log) => hasDuplicateProcessCombo(log?.items));
const equalsText = (left, right) =>
  String(left || '').trim() === String(right || '').trim();
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

  if (!record?.workerName && !record?.workerId) return null;
  return {
    id: record?.workerId || `virtual-worker-${fallbackIndex}`,
    name: record?.workerName || `작업자 ${fallbackIndex + 1}`,
  };
};
const buildWorkerLogsFromRecords = (records, { employees, customers, styles, colors }) => {
  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) return [];

  const groups = new Map();

  safeRecords.forEach((record, index) => {
    const workerKey =
      record?.workerId !== null && record?.workerId !== undefined && record.workerId !== ''
        ? `id:${record.workerId}`
        : `name:${record?.workerName || 'unknown'}:${index}`;

    if (!groups.has(workerKey)) {
      groups.set(workerKey, {
        id: buildLogId(),
        worker: findWorkerValue(employees, record, index),
        items: [],
      });
    }

    const customer = findCustomerValue(customers, record?.customerName, index);
    const style = findStyleValue(styles, record, index);
    const process = findProcessValue(record, style, index);
    const color = findColorValue(colors, record, index);
    groups.get(workerKey).items.push({
      id: buildItemId(),
      customer,
      style,
      process,
      color,
      quantity: Number(record?.quantity) > 0 ? Number(record.quantity) : '',
    });
  });

  return Array.from(groups.values()).map((log) => ({
    ...log,
    items: log.items.length > 0 ? log.items : [buildEmptyItem()],
  }));
};

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
    process.at,
    process.pt
  );
};

const toOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const toPositiveIdOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
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

const WorkDetail = ({ onClose, onSave, mode = 'drawer', initialLog = null }) => {
  const { devBypass, devProfile } = useAuth();
  const [workDate, setWorkDate] = useState(dayjs());
  const [factories, setFactories] = useState([]);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [styles, setStyles] = useState([]);
  const [colors, setColors] = useState([]);
  const [workerLogs, setWorkerLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemFocusRequest, setItemFocusRequest] = useState(null);
  const [workerFocusRequest, setWorkerFocusRequest] = useState(null);
  const [duplicateEntryMessage, setDuplicateEntryMessage] = useState('');
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [note, setNote] = useState('');
  const cancelButtonRef = useRef(null);
  const initializedMetaLogIdRef = useRef('');
  const initializedRecordsLogIdRef = useRef('');
  const isPageMode = mode === 'page';
  const activeOrgId = useMemo(() => {
    if (!devBypass) return null;
    const parsed = Number(devProfile?.orgId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [devBypass, devProfile?.orgId]);

  useEffect(() => {
    let cancelled = false;

    const loadBaseData = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const [factoryRows, customerRows, styleRows, attributeData] = await Promise.all([
          requestJSON('/factories' + query).catch(() => []),
          requestJSON('/customers' + query).catch(() => []),
          fetchStylesFromApi({ orgId: activeOrgId }).catch(() => []),
          fetchAttributes({ orgId: activeOrgId }).catch(() => null),
        ]);
        if (cancelled) return;
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
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
  }, [activeOrgId]);

  useEffect(() => {
    initializedMetaLogIdRef.current = '';
    initializedRecordsLogIdRef.current = '';
  }, [initialLog?.id]);

  useEffect(() => {
    if (initialLog?.id) {
      setNote(initialLog.note || '');
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
    let cancelled = false;
    const isPendingInitialHydration =
      Boolean(initialLog?.id) &&
      initializedRecordsLogIdRef.current !== initialLog.id;

    const loadEmployees = async () => {
      if (!selectedFactory?.id) {
        setEmployees([]);
        setWorkerLogs([]);
        setWorkerFocusRequest(null);
        return;
      }
      try {
        const data = await requestJSON(
          `/employees${buildQueryString({ factoryId: selectedFactory.id, orgId: activeOrgId })}`
        );
        if (cancelled) return;
        const list = (Array.isArray(data) ? data : []).map((employee) => ({
          ...employee,
          name: employee.name || `작업자 ${employee.id}`,
        }));
        if (!cancelled) {
          setEmployees(list);
          if (isPendingInitialHydration) {
            // 상세 수정 초기화 중에는 기존 기록 복원 effect가 workerLogs를 세팅한다.
          } else {
            let nextInitialWorkerLogId = null;
            setWorkerLogs((prev) => {
              if (!Array.isArray(prev) || prev.length === 0) {
                if (list.length === 0) return [];
                const initialWorkerLog = buildWorkerLog();
                nextInitialWorkerLogId = initialWorkerLog.id;
                return [initialWorkerLog];
              }

              // Preserve current input rows on factory change, but remap worker selection to
              // employees that actually belong to the selected factory.
              return prev.map((log) => ({
                ...log,
                worker: reconcileWorkerForFactory(log.worker, list),
                items: Array.isArray(log.items) && log.items.length > 0 ? log.items : [buildEmptyItem()],
              }));
            });
            if (nextInitialWorkerLogId) {
              setWorkerFocusRequest({ logId: nextInitialWorkerLogId, token: buildFocusToken() });
            } else {
              setWorkerFocusRequest(null);
            }
          }
          setItemFocusRequest(null);
          setDuplicateEntryMessage('');
        }
      } catch (_error) {
        if (!cancelled) setEmployees([]);
      }
    };

    setEmployees([]);
    setItemFocusRequest(null);
    setDuplicateEntryMessage('');
    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, initialLog?.id, selectedFactory?.id]);

  useEffect(() => {
    if (!initialLog?.id) return;
    if (initializedRecordsLogIdRef.current === initialLog.id) return;
    if (!selectedFactory?.id) return;
    if (
      initialLog.factoryId &&
      String(selectedFactory.id || '') !== String(initialLog.factoryId)
    ) {
      return;
    }

    const nextWorkerLogs = buildWorkerLogsFromRecords(initialLog.records, {
      employees,
      customers,
      styles,
      colors,
    });

    if (nextWorkerLogs.length > 0) {
      setWorkerLogs(nextWorkerLogs);
    } else if (employees.length > 0) {
      setWorkerLogs([buildWorkerLog()]);
    } else {
      setWorkerLogs([]);
    }

    setDuplicateEntryMessage('');
    setItemFocusRequest(null);
    setWorkerFocusRequest(null);
    initializedRecordsLogIdRef.current = initialLog.id;
  }, [colors, customers, employees, initialLog, selectedFactory, styles]);

  const takenWorkerIds = useMemo(
    () => new Set(workerLogs.map((log) => log.worker?.id).filter(Boolean)),
    [workerLogs]
  );
  const selectedFactoryWagePerSecond = useMemo(() => {
    if (!selectedFactory?.id) return null;
    const matchedFactory =
      factories.find((factory) => String(factory?.id) === String(selectedFactory?.id)) ||
      selectedFactory;
    return toOptionalNumber(matchedFactory?.wagePerSecond);
  }, [factories, selectedFactory]);
  const totalInputItemCount = useMemo(
    () => workerLogs.reduce((sum, log) => sum + log.items.length, 0),
    [workerLogs]
  );
  const canAddWorker = Boolean(selectedFactory) && employees.length > 0;

  const handleAddWorker = () => {
    const nextLog = buildWorkerLog();
    setWorkerLogs((prev) => [...prev, nextLog]);
    setWorkerFocusRequest({ logId: nextLog.id, token: buildFocusToken() });
    setDuplicateEntryMessage('');
  };

  const handleRemoveWorker = (logId) => {
    setWorkerLogs((prev) => prev.filter((log) => log.id !== logId));
    setItemFocusRequest((prev) => (prev?.logId === logId ? null : prev));
    setWorkerFocusRequest((prev) => (prev?.logId === logId ? null : prev));
    setDuplicateEntryMessage('');
  };

  const handleWorkerChange = (logId, nextWorker) => {
    setWorkerLogs((prev) =>
      prev.map((log) => (log.id === logId ? { ...log, worker: nextWorker } : log))
    );
    if (nextWorker?.id) {
      const firstItemId = workerLogs.find((log) => log.id === logId)?.items?.[0]?.id;
      if (firstItemId) {
        setItemFocusRequest({
          logId,
          itemId: firstItemId,
          field: 'customer',
          token: buildFocusToken(),
        });
      }
    }
    setDuplicateEntryMessage('');
  };

  const handleAddItem = (logId, { focusField = 'customer' } = {}) => {
    const nextItem = buildEmptyItem();
    setWorkerLogs((prev) =>
      prev.map((log) =>
        log.id === logId
          ? { ...log, items: [...log.items, nextItem] }
          : log
      )
    );
    setItemFocusRequest({
      logId,
      itemId: nextItem.id,
      field: focusField,
      token: buildFocusToken(),
    });
    setDuplicateEntryMessage('');
  };

  const handleRemoveItem = (logId, itemId) => {
    setWorkerLogs((prev) =>
      prev.map((log) =>
        log.id === logId
          ? { ...log, items: log.items.filter((item) => item.id !== itemId) }
          : log
      )
    );
    setDuplicateEntryMessage('');
  };
  const handleRequestFocusCancel = () => {
    requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });
  };

  const handleItemChange = (logId, itemId, field, value) => {
    let duplicateDetected = false;

    setWorkerLogs((prev) =>
      prev.map((log) => {
        if (log.id !== logId) return log;
        const nextItems = log.items.map((item) => {
            if (item.id !== itemId) return item;
            const next = { ...item, [field]: value };
            if (field === 'customer') {
              next.style = null;
              next.process = null;
              next.color = null;
            }
            if (field === 'style') {
              next.process = null;
              next.color = null;
            }
            return next;
          });

        if (hasDuplicateProcessCombo(nextItems)) {
          duplicateDetected = true;
          return log;
        }

        return { ...log, items: nextItems };
      })
    );

    if (duplicateDetected) {
      setDuplicateEntryMessage(
        '같은 작업자 내에서는 고객사/스타일/색상/공정 조합을 중복 입력할 수 없습니다. 수량으로 합산해 주세요.'
      );
      return;
    }

    setDuplicateEntryMessage('');
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
  const totalExpectedWage = useMemo(() => {
    if (selectedFactoryWagePerSecond == null) return 0;
    return summary.totalContractedSeconds * selectedFactoryWagePerSecond;
  }, [selectedFactoryWagePerSecond, summary.totalContractedSeconds]);
  const excludedItemCount = Math.max(0, totalInputItemCount - summary.records.length);

  const handleSave = () => {
    setSaveErrorMessage('');
    if (!selectedFactory) return;
    if (summary.records.length === 0) return;
    const invalidWorkerLogIndex = workerLogs.findIndex((log) => {
      const workerId = toPositiveIdOrNull(log.worker?.id);
      if (workerId) return false;
      return log.items.some((item) => item.process && Number(item.quantity) > 0);
    });
    if (invalidWorkerLogIndex >= 0) {
      setSaveErrorMessage(
        `작업자 ${invalidWorkerLogIndex + 1} 항목에 유효한 작업자 ID가 없습니다. 작업자를 다시 선택해 주세요.`
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
      const workerLabel = duplicateLog?.worker?.name || `작업자 ${duplicateWorkerLogIndex + 1}`;
      setDuplicateEntryMessage(
        `${workerLabel}에 고객사/스타일/색상/공정 중복 항목이 있습니다. 수량으로 합산 후 저장해 주세요.`
      );
      return;
    }

    onSave?.({
      workDate: workDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      factoryId: selectedFactory.id,
      factoryName: selectedFactory.name,
      factoryWagePerSecond: selectedFactoryWagePerSecond,
      ctBasis: 'CT',
      workerCount: summary.workerCount,
      itemCount: summary.itemCount,
      totalContractedSeconds: summary.totalContractedSeconds,
      records: summary.records,
      note: note.trim(),
    });
  };

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
          <Typography variant="h6">작업 기록 입력</Typography>
          <Typography variant="body2" color="text.secondary">
            공장 선택 후 작업자/항목을 바로 입력할 수 있도록 구성했습니다.
          </Typography>
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
            label="공장"
            options={factories}
            value={selectedFactory}
            onChange={(_event, value) => setSelectedFactory(value)}
            autoHighlight
            disabled={loading}
            sx={{ minWidth: 240 }}
            textFieldProps={{ size: 'small' }}
            isOptionEqualToValue={(option, value) => option?.id === value?.id}
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
            helperText={
              selectedFactory && selectedFactoryWagePerSecond == null
                ? '공장 관리에서 초당 공임을 먼저 설정하세요.'
                : undefined
            }
            sx={{ minWidth: 240 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
          <Chip size="small" label={`작업자 ${workerLogs.length}명`} />
          <Chip size="small" label={`입력 항목 ${totalInputItemCount}건`} />
          <Chip size="small" label={`저장 대상 ${summary.records.length}건`} color="primary" variant="outlined" />
          {excludedItemCount > 0 ? (
            <Chip size="small" label={`미완성 ${excludedItemCount}건`} color="warning" variant="outlined" />
          ) : null}
        </Stack>
        <TextField
          label="비고"
          value={note}
          onChange={(event) => setNote(event.target.value)}
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
        <Alert severity="info" icon={false} sx={{ mt: 1.5, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
          키보드 사용 팁: 수량 칸에서 Tab은 항목 추가 버튼으로 이동, Enter는 새 항목 추가 후 고객사 칸으로 이동합니다.
        </Alert>
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
              ? employees.length > 0
                ? '작업자를 선택하고 항목을 입력하세요.'
                : '선택한 공장에 등록된 작업자가 없습니다.'
              : '먼저 공장을 선택하세요.'}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddWorker}
            disabled={!canAddWorker}
          >
            작업자 추가
          </Button>
        </Box>

        {selectedFactory && employees.length === 0 ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            이 공장에는 작업자가 없어 작업 기록을 작성할 수 없습니다. 공장/작업자 정보를 먼저 등록하세요.
          </Alert>
        ) : workerLogs.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
            공장을 선택하면 기본 입력 행이 자동으로 생성됩니다.
          </Typography>
        ) : (
          workerLogs.map((log, index) => (
            <WorkerLog
              key={log.id}
              rowIndex={index + 1}
              log={log}
              onWorkerChange={handleWorkerChange}
              onRemoveWorker={handleRemoveWorker}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onItemChange={handleItemChange}
              availableEmployees={employees}
              customers={customers}
              styles={styles}
              colors={colors}
              factory={selectedFactory}
              takenWorkerIds={takenWorkerIds}
              focusRequest={itemFocusRequest?.logId === log.id ? itemFocusRequest : null}
              focusWorkerRequest={workerFocusRequest?.logId === log.id ? workerFocusRequest : null}
              onRequestFocusCancel={handleRequestFocusCancel}
            />
          ))
        )}
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            총 CT:{' '}
            {formatNumberWithCommas(summary.totalContractedSeconds, {
              fallback: '0',
              maximumFractionDigits: 0,
            })}
            초
          </Typography>
          <Typography variant="body2" color="text.secondary">
            예상 총 공임:{' '}
            {selectedFactoryWagePerSecond == null
              ? '-'
              : `${formatNumberWithCommas(totalExpectedWage, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 동`}
          </Typography>
          {excludedItemCount > 0 ? (
            <Typography variant="caption" color="warning.main">
              미완성 항목 {excludedItemCount}건은 저장 시 제외됩니다.
            </Typography>
          ) : null}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} ref={cancelButtonRef}>
            취소
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!selectedFactory || summary.records.length === 0}>
            저장
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default WorkDetail;

