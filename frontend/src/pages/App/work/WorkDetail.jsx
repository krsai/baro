import React, { useEffect, useMemo, useState } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import SearchableSelect from '../../../components/SearchableSelect';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import WorkerLog from './WorkerLog';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const buildLogId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const buildItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.round(parsed) : 0;
};

const resolveCtSeconds = (process) => {
  if (!process) return 0;
  return toSeconds(process.ctSeconds ?? process.contractedSeconds ?? process.at ?? process.pt);
};

const WorkDetail = ({ onClose, onSave }) => {
  const [workDate, setWorkDate] = useState(dayjs());
  const [factories, setFactories] = useState([]);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [styles, setStyles] = useState([]);
  const [workerLogs, setWorkerLogs] = useState([]);
  const [loading, setLoading] = useState(false);

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

    const loadBaseData = async () => {
      setLoading(true);
      try {
        const [factoryRows, customerRows, styleRows] = await Promise.all([
          fetchJson('/factories').catch(() => []),
          fetchJson('/customers').catch(() => []),
          fetchStylesFromApi().catch(() => []),
        ]);
        if (cancelled) return;
        setFactories(Array.isArray(factoryRows) ? factoryRows : []);
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setStyles(Array.isArray(styleRows) ? styleRows : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBaseData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      if (!selectedFactory?.id) {
        setEmployees([]);
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/employees?factoryId=${selectedFactory.id}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || cancelled) {
          if (!cancelled) setEmployees([]);
          return;
        }
        const list = (Array.isArray(data) ? data : []).map((employee) => ({
          ...employee,
          name: employee.name || `Worker ${employee.id}`,
        }));
        if (!cancelled) setEmployees(list);
      } catch (_error) {
        if (!cancelled) setEmployees([]);
      }
    };

    setWorkerLogs([]);
    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [selectedFactory?.id]);

  const takenWorkerIds = useMemo(
    () => new Set(workerLogs.map((log) => log.worker?.id).filter(Boolean)),
    [workerLogs]
  );

  const handleAddWorker = () => {
    setWorkerLogs((prev) => [...prev, { id: buildLogId(), worker: null, items: [] }]);
  };

  const handleRemoveWorker = (logId) => {
    setWorkerLogs((prev) => prev.filter((log) => log.id !== logId));
  };

  const handleWorkerChange = (logId, nextWorker) => {
    setWorkerLogs((prev) =>
      prev.map((log) => (log.id === logId ? { ...log, worker: nextWorker } : log))
    );
  };

  const handleAddItem = (logId) => {
    setWorkerLogs((prev) =>
      prev.map((log) =>
        log.id === logId
          ? { ...log, items: [...log.items, { id: buildItemId(), customer: null, style: null, process: null, quantity: '' }] }
          : log
      )
    );
  };

  const handleRemoveItem = (logId, itemId) => {
    setWorkerLogs((prev) =>
      prev.map((log) =>
        log.id === logId
          ? { ...log, items: log.items.filter((item) => item.id !== itemId) }
          : log
      )
    );
  };

  const handleItemChange = (logId, itemId, field, value) => {
    setWorkerLogs((prev) =>
      prev.map((log) => {
        if (log.id !== logId) return log;
        return {
          ...log,
          items: log.items.map((item) => {
            if (item.id !== itemId) return item;
            const next = { ...item, [field]: value };
            if (field === 'customer') {
              next.style = null;
              next.process = null;
            }
            if (field === 'style') {
              next.process = null;
            }
            return next;
          }),
        };
      })
    );
  };

  const summary = useMemo(() => {
    const records = workerLogs.flatMap((log) =>
      log.items
        .filter((item) => item.process && Number(item.quantity) > 0)
        .map((item) => ({
          workerId: log.worker?.id ?? null,
          workerName: log.worker?.name || '',
          customerName: item.customer?.name || '',
          styleId: item.style?.id || '',
          styleName: item.style?.name || '',
          processCode: item.process?.code || '',
          processName: item.process?.name || '',
          ctSeconds: resolveCtSeconds(item.process),
          quantity: Number(item.quantity) || 0,
        }))
    );

    const totalContractedSeconds = records.reduce(
      (sum, row) => sum + row.ctSeconds * row.quantity,
      0
    );

    return {
      records,
      workerCount: new Set(records.map((row) => row.workerId).filter(Boolean)).size,
      itemCount: records.length,
      totalContractedSeconds,
    };
  }, [workerLogs]);

  const handleSave = () => {
    if (!selectedFactory) return;
    if (summary.records.length === 0) return;

    onSave?.({
      workDate: workDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      factoryId: selectedFactory.id,
      factoryName: selectedFactory.name,
      ctBasis: 'CT',
      workerCount: summary.workerCount,
      itemCount: summary.itemCount,
      totalContractedSeconds: summary.totalContractedSeconds,
      records: summary.records,
      note: 'Attendance integration pending',
    });
  };

  return (
    <Box sx={{ width: { xs: '100vw', md: '56vw' }, p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Work Log Input</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        CT is the only payroll basis. PT/AT are not used directly for payout.
      </Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            label="Work Date"
            value={workDate}
            onChange={setWorkDate}
            sx={{ minWidth: 220 }}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>

        <SearchableSelect
          label="Factory"
          options={factories}
          value={selectedFactory}
          onChange={(_event, value) => setSelectedFactory(value)}
          disabled={loading}
          sx={{ minWidth: 240 }}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
        />

        <TextField
          label="CT Basis"
          value="CT"
          InputProps={{ readOnly: true }}
          sx={{ minWidth: 140 }}
        />
      </Stack>

      <Paper variant="outlined" sx={{ flex: 1, p: 2, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddWorker}
            disabled={!selectedFactory}
          >
            Add Worker
          </Button>
        </Box>

        {workerLogs.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
            Select a factory and add worker logs.
          </Typography>
        ) : (
          workerLogs.map((log) => (
            <WorkerLog
              key={log.id}
              log={log}
              onWorkerChange={handleWorkerChange}
              onRemoveWorker={handleRemoveWorker}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onItemChange={handleItemChange}
              availableEmployees={employees}
              customers={customers}
              styles={styles}
              factory={selectedFactory}
              takenWorkerIds={takenWorkerIds}
            />
          ))
        )}
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Total CT: {summary.totalContractedSeconds.toLocaleString()} sec
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!selectedFactory || summary.records.length === 0}>
            Save
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default WorkDetail;
