import React, { useState, useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  IconButton,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchInput from '../../../components/SearchInput';

// Mock data for processes
const initialProcesses = [
  { id: 1, code: 'P001', name: '주머니 달기', description: '자켓이나 코트의 주머니를 부착합니다.' },
  { id: 2, code: 'P002', name: '소매 달기', description: '셔츠나 블라우스의 소매를 부착합니다.' },
  { id: 3, code: 'P003', name: '단추 달기', description: '모든 의류의 단추를 답니다. 단추 개수는 스타일에 따라 다릅니다.' },
  { id: 4, code: 'P004', name: '지퍼 달기', description: '바지나 스커트의 지퍼를 부착합니다.' },
  { id: 5, code: 'P005', name: '라벨 부착', description: '브랜드 또는 사이즈 라벨을 부착합니다.' },
];

const AttrProcess = () => {
  const [processes, setProcesses] = useState(initialProcesses);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  
  const initialFormData = { code: '', name: '', description: '' };
  const [formData, setFormData] = useState(initialFormData);

  const filteredProcesses = useMemo(() => {
    if (!searchTerm) return processes;
    const lowerTerm = searchTerm.toLowerCase();
    return processes.filter(
      (process) =>
        process.name.toLowerCase().includes(lowerTerm) ||
        process.code.toLowerCase().includes(lowerTerm)
    );
  }, [processes, searchTerm]);

  const handleAdd = () => {
    setEditingProcess(null);
    setFormData(initialFormData);
    setOpenDialog(true);
  };

  const handleEdit = (process) => {
    setEditingProcess(process);
    setFormData(process);
    setOpenDialog(true);
  };

  const handleDelete = (processId) => {
    if (window.confirm('정말로 이 공정을 삭제하시겠습니까?')) {
      setProcesses(processes.filter((p) => p.id !== processId));
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSave = () => {
    if (editingProcess) {
      setProcesses(
        processes.map((p) => (p.id === editingProcess.id ? { ...formData, id: p.id } : p))
      );
    } else {
      const newProcess = {
        ...formData,
        id: Math.max(...processes.map((p) => p.id), 0) + 1,
      };
      setProcesses([...processes, newProcess]);
    }
    handleCloseDialog();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="공정명 또는 코드 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          공정 추가
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>공정 코드</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>공정명</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>설명</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProcesses.map((process) => (
                <TableRow key={process.id} hover>
                  <TableCell>{process.code}</TableCell>
                  <TableCell>{process.name}</TableCell>
                  <TableCell>{process.description}</TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <IconButton size="small" onClick={() => handleEdit(process)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(process.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProcess ? '공정 정보 수정' : '신규 공정 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField name="code" label="공정 코드" value={formData.code} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="name" label="공정명" value={formData.name} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="description" label="설명" value={formData.description} onChange={handleInputChange} fullWidth multiline rows={3} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>취소</Button>
          <Button onClick={handleSave} variant="contained">
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AttrProcess;

