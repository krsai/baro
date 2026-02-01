import React, { useState, useEffect } from 'react';
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
import SearchableSelect from '../../../components/SearchableSelect';

// Mock data for master processes - in a real app, this would be fetched.
const masterProcesses = [
    { id: 1, code: 'P001', name: '주머니 달기', description: '자켓이나 코트의 주머니를 부착합니다.' },
    { id: 2, code: 'P002', name: '소매 달기', description: '셔츠나 블라우스의 소매를 부착합니다.' },
    { id: 3, code: 'P003', name: '단추 달기', description: '모든 의류의 단추를 답니다.' },
    { id: 4, code: 'P004', name: '지퍼 달기', description: '바지나 스커트의 지퍼를 부착합니다.' },
    { id: 5, code: 'P005', name: '라벨 부착', description: '브랜드 또는 사이즈 라벨을 부착합니다.' },
];

const ProcessForm = ({ onClose, onSave, initialData }) => {
  const [addedProcesses, setAddedProcesses] = useState([]);
  const [newProcess, setNewProcess] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [standardTime, setStandardTime] = useState(0);

  const isEditMode = Boolean(initialData);

  useEffect(() => {
    if (isEditMode && initialData) {
        const masterProcess = masterProcesses.find(p => p.id === initialData.id);
        setNewProcess(masterProcess || null);
        setQuantity(initialData.quantity);
        setStandardTime(initialData.st);
    } else {
        setNewProcess(null);
        setQuantity(1);
        setStandardTime(0);
        setAddedProcesses([]);
    }
  }, [initialData, isEditMode]);

  const handleAddToList = () => {
    if (!newProcess) {
      alert('추가할 공정을 선택하세요.');
      return;
    }
    if (quantity <= 0) {
      alert('수량은 1 이상이어야 합니다.');
      return;
    }

    const processToAdd = {
      instanceId: `${newProcess.id}-${Date.now()}`,
      ...newProcess,
      quantity,
      st: standardTime,
    };
    setAddedProcesses([...addedProcesses, processToAdd]);
    
    // Reset form for next entry
    setNewProcess(null);
    setQuantity(1);
    setStandardTime(0);
  };

  const handleRemoveFromList = (instanceId) => {
    setAddedProcesses(addedProcesses.filter((p) => p.instanceId !== instanceId));
  };
  
  const handleSave = () => {
    if (isEditMode) {
        const updatedProcess = {
            ...initialData,
            ...newProcess,
            quantity,
            st: standardTime,
        }
        onSave(updatedProcess);
    } else {
        onSave(addedProcesses);
    }
    onClose();
  };

  const formatTime = (value) => `${value}초`;

  const renderAddMode = () => (
    <>
        <Box sx={{ p: 2, mb: 2, border: '1px solid #ddd', borderRadius: 2 }}>
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                    <SearchableSelect
                        label="공정 선택"
                        options={masterProcesses}
                        value={newProcess}
                        onChange={(event, newValue) => setNewProcess(newValue)}
                        getOptionLabel={(option) => `[${option.code}] ${option.name}`}
                    />
                </Grid>
                <Grid item xs={6} sm={2.5}>
                    <TextField
                        label="수량"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        fullWidth
                        InputProps={{ inputProps: { min: 1 } }}
                    />
                </Grid>
                <Grid item xs={6} sm={2.5}>
                    <TextField
                        label="표준 시간 (ST, 초)"
                        type="number"
                        value={standardTime}
                        onChange={(e) => setStandardTime(parseInt(e.target.value, 10) || 0)}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={3}>
                    <Button 
                        variant="contained" 
                        startIcon={<AddIcon />} 
                        onClick={handleAddToList}
                        fullWidth
                        sx={{height: '56px'}}
                        disabled={!newProcess}
                    >
                        목록에 추가
                    </Button>
                </Grid>
            </Grid>
        </Box>

        <Typography variant="subtitle1" sx={{ mb: 1 }}>추가할 공정 목록 ({addedProcesses.length}개)</Typography>
        <Paper variant='outlined'>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>공정명</TableCell>
                            <TableCell align="right">수량</TableCell>
                            <TableCell align="right">표준 시간 (ST)</TableCell>
                            <TableCell align="right">총 시간</TableCell>
                            <TableCell align="center">삭제</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {addedProcesses.map((process) => (
                        <TableRow key={process.instanceId} hover>
                            <TableCell>{`[${process.code}] ${process.name}`}</TableCell>
                            <TableCell align="right">{process.quantity}</TableCell>
                            <TableCell align="right">{formatTime(process.st)}</TableCell>
                            <TableCell align="right">{formatTime(process.quantity * process.st)}</TableCell>
                            <TableCell align="center">
                            <IconButton size="small" onClick={() => handleRemoveFromList(process.instanceId)}>
                                <DeleteIcon />
                            </IconButton>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    </>
  );

  const renderEditMode = () => (
    <Box sx={{p:2}}>
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <SearchableSelect
                    label="공정 선택"
                    options={masterProcesses}
                    value={newProcess}
                    onChange={(event, newValue) => setNewProcess(newValue)}
                    getOptionLabel={(option) => `[${option.code}] ${option.name}`}
                />
            </Grid>
            <Grid item xs={6}>
                <TextField
                    label="수량"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    fullWidth
                    InputProps={{ inputProps: { min: 1 } }}
                />
            </Grid>
            <Grid item xs={6}>
                <TextField
                    label="표준 시간 (ST, 초)"
                    type="number"
                    value={standardTime}
                    onChange={(e) => setStandardTime(parseInt(e.target.value, 10) || 0)}
                    fullWidth
                />
            </Grid>
        </Grid>
    </Box>
  );

  return (
    <Box sx={{ width: isEditMode ? '40vw' : '50vw', p: 3, display: 'flex', flexDirection: 'column', height: '100vh', transition: 'width 0.3s' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
            <Typography variant="h5" component="h2" fontWeight="bold">
                {isEditMode ? '공정 수정' : '신규 공정 추가'}
            </Typography>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        
        <Divider sx={{mb: 2}}/>

        <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
            {isEditMode ? renderEditMode() : renderAddMode()}
        </Box>
        
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1, flexShrink: 0 }}>
            <Button variant="outlined" onClick={onClose}>취소</Button>
            <Button onClick={handleSave} variant="contained" disabled={!isEditMode && addedProcesses.length === 0}>
                {isEditMode ? '수정 내용 저장' : `${addedProcesses.length}개 공정 저장`}
            </Button>
        </Box>
    </Box>
  );
};

export default ProcessForm;
