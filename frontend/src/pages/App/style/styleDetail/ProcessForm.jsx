import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Grid,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import SearchableSelect from '../../../../components/SearchableSelect';
import {
  calculateProcessLineTotal,
  formatSeconds,
  normalizeProcess,
  parseOptionalSecondsInput,
  resolveProcessActualTime,
} from '../../../../utils/processTime';

// Mock data for master processes - in a real app, this would be fetched.
const masterProcesses = [
  { id: 1, code: 'P001', name: '주머니 달기', description: '자켓이나 코트의 주머니를 부착합니다.' },
  { id: 2, code: 'P002', name: '소매 달기', description: '셔츠나 블라우스의 소매를 부착합니다.' },
  { id: 3, code: 'P003', name: '단추 달기', description: '모든 의류의 단추를 답니다.' },
  { id: 4, code: 'P004', name: '지퍼 달기', description: '바지나 스커트의 지퍼를 부착합니다.' },
  { id: 5, code: 'P005', name: '라벨 부착', description: '브랜드 또는 사이즈 라벨을 부착합니다.' },
];

const findMasterProcess = (process) => {
  if (!process) return null;
  return (
    masterProcesses.find((item) => item.id === process.id) ||
    masterProcesses.find((item) => item.code === process.code) ||
    masterProcesses.find((item) => item.name === process.name) ||
    null
  );
};

const ProcessForm = ({ onClose, onSave, initialData }) => {
  const [addedProcesses, setAddedProcesses] = useState([]);
  const [newProcess, setNewProcess] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [provisionalTime, setProvisionalTime] = useState('');

  const isEditMode = Boolean(initialData);

  useEffect(() => {
    if (isEditMode && initialData) {
      const matchedProcess = findMasterProcess(initialData);
      setNewProcess(matchedProcess || null);
      setQuantity(Math.max(1, Number.parseInt(initialData.quantity, 10) || 1));
      setProvisionalTime(
        initialData.pt === null || initialData.pt === undefined ? '' : String(initialData.pt)
      );
      return;
    }

    setNewProcess(null);
    setQuantity(1);
    setProvisionalTime('');
    setAddedProcesses([]);
  }, [initialData, isEditMode]);

  const selectedProcess = useMemo(() => {
    if (newProcess) return newProcess;
    if (!initialData) return null;
    return {
      id: initialData.id,
      code: initialData.code,
      name: initialData.name,
      description: initialData.description || '',
    };
  }, [initialData, newProcess]);

  const selectedWorkStats = useMemo(() => {
    if (!selectedProcess) return null;
    return {
      actualTime: selectedProcess.actualTime ?? initialData?.actualTime ?? null,
    };
  }, [initialData, selectedProcess]);

  const calculatedActualTime = useMemo(
    () =>
      resolveProcessActualTime({
        existingAt: isEditMode ? initialData?.at : null,
        workStats: selectedWorkStats,
      }),
    [initialData, isEditMode, selectedWorkStats]
  );

  const buildProcessPayload = (baseProcess, instanceId = null) =>
    normalizeProcess({
      ...baseProcess,
      instanceId: instanceId || `${baseProcess.id}-${Date.now()}`,
      quantity,
      pt: parseOptionalSecondsInput(provisionalTime),
      at: calculatedActualTime,
    });

  const handleAddToList = () => {
    if (!selectedProcess) {
      alert('추가할 공정을 선택하세요.');
      return;
    }
    if (quantity <= 0) {
      alert('수량은 1 이상이어야 합니다.');
      return;
    }

    const processToAdd = buildProcessPayload(selectedProcess);
    setAddedProcesses((prev) => [...prev, processToAdd]);

    setNewProcess(null);
    setQuantity(1);
    setProvisionalTime('');
  };

  const handleRemoveFromList = (instanceId) => {
    setAddedProcesses((prev) => prev.filter((process) => process.instanceId !== instanceId));
  };

  const handleSave = () => {
    if (isEditMode) {
      if (!selectedProcess) {
        alert('수정할 공정을 선택하세요.');
        return;
      }

      const updatedProcess = buildProcessPayload(
        {
          ...initialData,
          ...selectedProcess,
        },
        initialData.instanceId
      );
      onSave(updatedProcess);
      onClose();
      return;
    }

    onSave(addedProcesses);
    onClose();
  };

  const renderAddMode = () => (
    <>
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <SearchableSelect
              label="공정 선택"
              options={masterProcesses}
              value={newProcess}
              onChange={(_event, value) => setNewProcess(value)}
              getOptionLabel={(option) => `[${option.code}] ${option.name}`}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              label="수량"
              type="number"
              value={quantity}
              onChange={(event) =>
                setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
              }
              fullWidth
              InputProps={{ inputProps: { min: 1 } }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              label="PT (초, 선택)"
              type="number"
              value={provisionalTime}
              onChange={(event) => setProvisionalTime(event.target.value)}
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
              helperText="미입력 가능"
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="AT (자동 계산, 초)"
              value={calculatedActualTime ?? ''}
              placeholder="작업 기록 누적 후 계산"
              fullWidth
              InputProps={{ readOnly: true }}
              helperText="회귀 분석 기반 자동 산출"
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddToList}
              fullWidth
              sx={{ height: '56px' }}
              disabled={!selectedProcess}
            >
              목록에 추가
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
        추가할 공정 목록 ({addedProcesses.length}개)
      </Typography>
      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>공정명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  수량
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  PT
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  AT(자동)
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  총 PT
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  총 AT
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">
                  삭제
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {addedProcesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">추가할 공정이 없습니다.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                addedProcesses.map((process) => (
                  <TableRow key={process.instanceId} hover>
                    <TableCell>{`[${process.code}] ${process.name}`}</TableCell>
                    <TableCell align="right">{process.quantity}</TableCell>
                    <TableCell align="right">{formatSeconds(process.pt)}</TableCell>
                    <TableCell align="right">{formatSeconds(process.at)}</TableCell>
                    <TableCell align="right">
                      {formatSeconds(calculateProcessLineTotal(process, 'pt'))}
                    </TableCell>
                    <TableCell align="right">
                      {formatSeconds(calculateProcessLineTotal(process, 'at'))}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveFromList(process.instanceId)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );

  const renderEditMode = () => (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <SearchableSelect
            label="공정 선택"
            options={masterProcesses}
            value={newProcess}
            onChange={(_event, value) => setNewProcess(value)}
            getOptionLabel={(option) => `[${option.code}] ${option.name}`}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="수량"
            type="number"
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
            }
            fullWidth
            InputProps={{ inputProps: { min: 1 } }}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="PT (초, 선택)"
            type="number"
            value={provisionalTime}
            onChange={(event) => setProvisionalTime(event.target.value)}
            fullWidth
            InputProps={{ inputProps: { min: 0 } }}
            helperText="미입력 가능"
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="AT (자동 계산, 초)"
            value={calculatedActualTime ?? ''}
            placeholder="작업 기록 누적 후 계산"
            fullWidth
            InputProps={{ readOnly: true }}
            helperText="회귀 분석 기반 자동 산출"
          />
        </Grid>
      </Grid>
    </Paper>
  );

  return (
    <Box
      sx={{
        width: isEditMode ? '40vw' : '60vw',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        transition: 'width 0.3s ease-in-out',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
        <Typography variant="h5" component="h2" fontWeight="bold">
          {isEditMode ? '공정 수정' : '신규 공정 추가'}
        </Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          pr: 1,
          mr: -1,
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#ccc', borderRadius: '4px' },
          '&::-webkit-scrollbar-thumb:hover': { bgcolor: '#aaa' },
        }}
      >
        {isEditMode ? renderEditMode() : renderAddMode()}
      </Box>

      <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1, flexShrink: 0 }}>
        <Button variant="text" color="secondary" onClick={onClose}>
          취소
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={!isEditMode && addedProcesses.length === 0}>
          {isEditMode ? '수정하기' : `${addedProcesses.length}개 공정 추가하기`}
        </Button>
      </Box>
    </Box>
  );
};

export default ProcessForm;
