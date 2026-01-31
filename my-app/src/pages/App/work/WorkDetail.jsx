import React, { useState, useMemo } from 'react';
import { Box, Typography, IconButton, Button, Paper, Divider, Grid } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import SearchableSelect from '../../../components/SearchableSelect';
import WorkerLog from './WorkerLog';

// --- Mock Data ---
const factories = [
  { id: 1, name: '하노이 1공장', perSecondWage: 0.1 },
  { id: 2, name: '다낭 2공장', perSecondWage: 0.09 },
];
const employees = [
  { id: 101, name: 'John Doe', factoryId: 1 },
  { id: 102, name: 'Jane Smith', factoryId: 1 },
  { id: 201, name: 'Peter Pan', factoryId: 2 },
  { id: 202, name: 'Tony Stark', factoryId: 1 },
];
const customers = [ { id: 1, name: '더산' }, { id: 2, name: '나이키' }, { id: 3, name: '아디다스' }];
const styles = [
  { id: 'S-001', name: '클래식 데님 자켓', customerId: 1 },
  { id: 'S-002', name: '하이웨이스트 와이드 팬츠', customerId: 2 },
  { id: 'S-003', name: '오버핏 린넨 셔츠', customerId: 1 },
];
const processes = [
  { id: 1, styleId: 'S-001', name: '소매 부착', paymentStandard: 'PT', paymentValue: 50 },
  { id: 2, styleId: 'S-001', name: '칼라 조립', paymentStandard: 'ST', paymentValue: 80 },
  { id: 3, styleId: 'S-002', name: '허리 밴드', paymentStandard: 'PT', paymentValue: 60 },
];

const WorkDetail = ({ onClose }) => {
  const [workDate, setWorkDate] = useState(dayjs());
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [workerLogs, setWorkerLogs] = useState([]);

  const filteredEmployees = useMemo(() => {
    if (!selectedFactory) return [];
    return employees.filter((emp) => emp.factoryId === selectedFactory.id);
  }, [selectedFactory]);

  const handleAddWorker = () => {
    setWorkerLogs([...workerLogs, { id: Date.now(), worker: null, items: [] }]);
  };

  const handleRemoveWorker = (logId) => {
    setWorkerLogs(workerLogs.filter((log) => log.id !== logId));
  };

  const handleWorkerChange = (logId, newWorker) => {
    setWorkerLogs(
      workerLogs.map((log) =>
        log.id === logId ? { ...log, worker: newWorker } : log
      )
    );
  };

  const handleAddItem = (logId) => {
    const newLogs = workerLogs.map((log) => {
      if (log.id === logId) {
        const newItem = { id: Date.now(), customer: null, style: null, process: null, quantity: '' };
        return { ...log, items: [...log.items, newItem] };
      }
      return log;
    });
    setWorkerLogs(newLogs);
  };

  const handleRemoveItem = (logId, itemId) => {
    const newLogs = workerLogs.map((log) => {
      if (log.id === logId) {
        return { ...log, items: log.items.filter((item) => item.id !== itemId) };
      }
      return log;
    });
    setWorkerLogs(newLogs);
  };

  const handleItemChange = (logId, itemId, field, value) => {
    const newLogs = workerLogs.map((log) => {
      if (log.id === logId) {
        const newItems = log.items.map((item) => {
          if (item.id === itemId) {
            const updatedItem = { ...item, [field]: value };
            if (field === 'customer') {
              updatedItem.style = null;
              updatedItem.process = null;
            }
            if (field === 'style') {
              updatedItem.process = null;
            }
            return updatedItem;
          }
          return item;
        });
        return { ...log, items: newItems };
      }
      return log;
    });
    setWorkerLogs(newLogs);
  };

  const totalCalculatedWage = useMemo(() => {
    if (!selectedFactory) return '0.00';
    return workerLogs
      .flatMap(log => log.items)
      .reduce((total, item) => {
        if (!item.process || !item.quantity) return total;
        const wagePerPiece = item.process.paymentValue * selectedFactory.perSecondWage;
        return total + wagePerPiece * item.quantity;
      }, 0)
      .toFixed(2);
  }, [workerLogs, selectedFactory]);

  return (
    <Box sx={{ width: '50vw', p: 3, display: 'flex', flexDirection: 'column', height: '90vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
        <Typography variant="h5" component="h2" fontWeight="bold">작업 기록</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexShrink: 0 }}>
        <Box sx={{ flex: 1 }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="작업일자"
              value={workDate}
              onChange={setWorkDate}
              sx={{ width: '100%' }}
              slotProps={{ textField: { autoFocus: true } }}
            />
          </LocalizationProvider>
        </Box>
        <Box sx={{ flex: 1 }}>
          <SearchableSelect
            label="공장"
            options={factories}
            value={selectedFactory}
            onChange={(e, val) => {
              setSelectedFactory(val);
              setWorkerLogs([]);
            }}
            sx={{ width: '100%' }}
          />
        </Box>
      </Box>
      
      <Paper variant="outlined" sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddWorker}
            disabled={!selectedFactory}
            sx={{width: '100%'}}
          >
            작업자 추가
          </Button>
        </Box>
        {workerLogs.length === 0 && (
            <Typography color="text.secondary" align="center" sx={{p: 4}}>
                먼저 공장을 선택하고 작업자를 추가하세요.
            </Typography>
        )}
        {workerLogs.map((log) => (
          <WorkerLog
            key={log.id}
            log={log}
            onWorkerChange={handleWorkerChange}
            onRemoveWorker={handleRemoveWorker}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onItemChange={handleItemChange}
            availableEmployees={filteredEmployees}
            customers={customers}
            styles={styles}
            processes={processes}
            factory={selectedFactory}
          />
        ))}
      </Paper>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="h6">총 합계: ${totalCalculatedWage}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={onClose}>취소</Button>
          <Button variant="contained" disabled={workerLogs.length === 0}>저장</Button>
        </Box>
      </Box>
    </Box>
  );
};

export default WorkDetail;