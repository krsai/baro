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
  TableFooter,
  TextField,
  IconButton,
  Grid,
  Divider,
  Stack,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import SearchableSelect from '../../../../components/SearchableSelect';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';
import {
  calculateProcessLineTotal,
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcess,
  parseOptionalSecondsInput,
  resolveProcessActualTime,
} from '../../../../utils/processTime';

const masterProcesses = [
  { id: 1, code: 'P001', name: '주머니 달기', description: '자켓이나 코트의 주머니를 부착합니다.' },
  { id: 2, code: 'P002', name: '소매 달기', description: '몸통과 블라우스의 소매를 부착합니다.' },
  { id: 3, code: 'P003', name: '단추 달기', description: '모든 의류에 단추를 답니다.' },
  { id: 4, code: 'P004', name: '지퍼 달기', description: '바지나 재킷의 지퍼를 부착합니다.' },
  { id: 5, code: 'P005', name: '라벨 부착', description: '브랜드 또는 사이즈 라벨을 부착합니다.' },
];

const getProcessIdentity = (process) => {
  if (!process || typeof process !== 'object') return '';
  if (process.id !== null && process.id !== undefined && process.id !== '') {
    return `id:${String(process.id)}`;
  }
  const code = String(process.code ?? '').trim().toUpperCase();
  if (code) return `code:${code}`;
  const name = String(process.name ?? '').trim().toLowerCase();
  return name ? `name:${name}` : '';
};

const findMasterProcess = (process) => {
  if (!process) return null;
  return (
    masterProcesses.find((item) => item.id === process.id) ||
    masterProcesses.find((item) => item.code === process.code) ||
    masterProcesses.find((item) => item.name === process.name) ||
    null
  );
};

const ProcessForm = ({ onClose, onSave, initialData, existingProcesses = [] }) => {
  const [addedProcesses, setAddedProcesses] = useState([]);
  const [newProcess, setNewProcess] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [provisionalTime, setProvisionalTime] = useState('');
  const [inputError, setInputError] = useState('');

  const isEditMode = Boolean(initialData);

  useEffect(() => {
    if (isEditMode && initialData) {
      const matchedProcess = findMasterProcess(initialData);
      setNewProcess(matchedProcess || null);
      setQuantity(Math.max(1, Number.parseInt(initialData.quantity, 10) || 1));
      setProvisionalTime(
        initialData.pt === null || initialData.pt === undefined ? '' : String(initialData.pt)
      );
      setInputError('');
      return;
    }

    setNewProcess(null);
    setQuantity(1);
    setProvisionalTime('');
    setAddedProcesses([]);
    setInputError('');
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

  const addedTotalPT = useMemo(() => calculateProcessTotal(addedProcesses, 'pt'), [addedProcesses]);
  const addedTotalAT = useMemo(() => calculateProcessTotal(addedProcesses, 'at'), [addedProcesses]);
  const hasAddedPT = useMemo(() => hasAnyProcessTime(addedProcesses, 'pt'), [addedProcesses]);
  const hasAddedAT = useMemo(() => hasAnyProcessTime(addedProcesses, 'at'), [addedProcesses]);
  const existingIdentitySet = useMemo(() => {
    const set = new Set();
    existingProcesses.forEach((process) => {
      if (isEditMode && process?.instanceId === initialData?.instanceId) return;
      const identity = getProcessIdentity(process);
      if (identity) set.add(identity);
    });
    return set;
  }, [existingProcesses, isEditMode, initialData?.instanceId]);
  const addedIdentitySet = useMemo(() => {
    const set = new Set();
    addedProcesses.forEach((process) => {
      const identity = getProcessIdentity(process);
      if (identity) set.add(identity);
    });
    return set;
  }, [addedProcesses]);

  const isDuplicateSelection = (process) => {
    const identity = getProcessIdentity(process);
    if (!identity) return false;
    return existingIdentitySet.has(identity) || addedIdentitySet.has(identity);
  };

  const buildProcessPayload = (baseProcess, instanceId = null) =>
    normalizeProcess({
      ...baseProcess,
      instanceId: instanceId || `${baseProcess.id}-${Date.now()}`,
      quantity,
      pt: parseOptionalSecondsInput(provisionalTime),
      at: calculatedActualTime,
    });

  const validateInput = () => {
    if (!selectedProcess) {
      setInputError('공정을 선택해주세요.');
      return false;
    }
    if (isDuplicateSelection(selectedProcess)) {
      setInputError('이미 등록된 공정입니다.');
      return false;
    }
    if (quantity <= 0) {
      setInputError('수량은 1 이상이어야 합니다.');
      return false;
    }
    setInputError('');
    return true;
  };

  const handleAddToList = () => {
    if (!validateInput()) return;

    const processToAdd = buildProcessPayload(selectedProcess);
    setAddedProcesses((prev) => [...prev, processToAdd]);

    setNewProcess(null);
    setQuantity(1);
    setProvisionalTime('');
  };

  const handleQuickAdd = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!isEditMode) {
      handleAddToList();
    }
  };

  const handleRemoveFromList = (instanceId) => {
    setAddedProcesses((prev) => prev.filter((process) => process.instanceId !== instanceId));
  };

  const handleSave = () => {
    if (isEditMode) {
      if (!validateInput()) return;

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
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.25, fontWeight: 700 }}>
          공정 입력
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: '2.3fr 1fr 1.2fr 1.2fr auto',
            },
            gap: 1.25,
            alignItems: 'center',
          }}
        >
          <SearchableSelect
            label="공정 선택"
            options={masterProcesses}
            value={newProcess}
            onChange={(_event, value) => {
              setNewProcess(value);
              setInputError('');
            }}
            getOptionLabel={(option) => `[${option.code}] ${option.name}`}
            getOptionDisabled={(option) => isDuplicateSelection(option)}
            sx={{ width: '100%' }}
          />

          <TextField
            label="수량"
            type="number"
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
            }
            onKeyDown={handleQuickAdd}
            fullWidth
            InputProps={{ inputProps: { min: 1 } }}
          />

          <TextField
            label="PT(초)"
            type="number"
            value={provisionalTime}
            onChange={(event) => setProvisionalTime(event.target.value)}
            onKeyDown={handleQuickAdd}
            fullWidth
            placeholder="예: 15"
            InputProps={{ inputProps: { min: 0 } }}
          />

          <TextField
            label="AT(초, 자동)"
            value={calculatedActualTime ?? ''}
            fullWidth
            InputProps={{ readOnly: true }}
            sx={{
              '& .MuiInputBase-input.Mui-disabled': {
                WebkitTextFillColor: 'inherit',
              },
              '& .MuiInputBase-root': {
                backgroundColor: '#f8fafc',
              },
            }}
          />

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddToList}
            sx={{
              width: { xs: '100%', md: 'auto' },
              minWidth: 116,
              height: 42,
              px: 1.75,
              borderRadius: 1.5,
              boxShadow: 'none',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
            disabled={!selectedProcess}
          >
            목록에 추가
          </Button>
        </Box>

        {inputError && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
            {inputError}
          </Typography>
        )}

        {selectedProcess && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 1 }}>
            <Chip
              size="small"
              label={`선택 공정: [${selectedProcess.code}] ${selectedProcess.name}`}
              color="primary"
              variant="outlined"
            />
            <Chip
              size="small"
              label={`AT(자동): ${formatSeconds(calculatedActualTime)}`}
              variant="outlined"
            />
          </Stack>
        )}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          추가할 공정 목록
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip size="small" label={`${addedProcesses.length}개`} />
          <Chip
            size="small"
            variant="outlined"
            label={`총 PT: ${hasAddedPT ? formatSeconds(addedTotalPT) : '-'}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`총 AT: ${hasAddedAT ? formatSeconds(addedTotalAT) : '-'}`}
          />
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 460px)' }}>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ width: 64, fontWeight: 700 }}>No</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>공정명</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  수량
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  PT
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  AT(자동)
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  총 PT
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  총 AT
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">
                  삭제
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {addedProcesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <Typography color="text.secondary">추가할 공정이 없습니다.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                addedProcesses.map((process, index) => (
                  <TableRow key={process.instanceId} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{`[${process.code}] ${process.name}`}</TableCell>
                    <TableCell align="right">
                      {formatNumberWithCommas(process.quantity, {
                        fallback: '-',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
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
            {addedProcesses.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>
                    합계
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasAddedPT ? formatSeconds(addedTotalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasAddedAT ? formatSeconds(addedTotalAT) : '-'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      </Paper>
    </>
  );

  const renderEditMode = () => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.25, fontWeight: 700 }}>
        공정 정보 수정
      </Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12}>
          <SearchableSelect
            label="공정 선택"
            options={masterProcesses}
            value={newProcess}
            onChange={(_event, value) => {
              setNewProcess(value);
              setInputError('');
            }}
            getOptionLabel={(option) => `[${option.code}] ${option.name}`}
            getOptionDisabled={(option) => isDuplicateSelection(option)}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
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
        <Grid item xs={12} sm={4}>
          <TextField
            label="PT(초)"
            type="number"
            value={provisionalTime}
            onChange={(event) => setProvisionalTime(event.target.value)}
            fullWidth
            placeholder="예: 15"
            InputProps={{ inputProps: { min: 0 } }}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="AT(초, 자동)"
            value={calculatedActualTime ?? ''}
            fullWidth
            InputProps={{ readOnly: true }}
            sx={{
              '& .MuiInputBase-root': {
                backgroundColor: '#f8fafc',
              },
            }}
          />
        </Grid>
      </Grid>
      {inputError && (
        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
          {inputError}
        </Typography>
      )}
    </Paper>
  );

  const drawerWidth = isEditMode
    ? { xs: '100vw', sm: 560 }
    : { xs: '100vw', lg: 1040 };

  return (
    <Box
      sx={{
        width: drawerWidth,
        maxWidth: '100vw',
        p: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexShrink: 0,
        }}
      >
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

      <Box
        sx={{
          mt: 2,
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          flexShrink: 0,
          bgcolor: 'background.paper',
        }}
      >
        <Button variant="text" color="secondary" onClick={onClose}>
          취소
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={!isEditMode && addedProcesses.length === 0}>
          {isEditMode ? '변경 저장' : `${addedProcesses.length}개 공정 추가하기`}
        </Button>
      </Box>
    </Box>
  );
};

export default ProcessForm;
