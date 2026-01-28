import React, { useState } from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useApp } from '../../../context/AppContext';
import AppPageContainer from '../../../components/AppPageContainer';

const FactoryList = () => {
  const { factories, setFactories } = useApp();

  const [openDialog, setOpenDialog] = useState(false);
  const [editingFactory, setEditingFactory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    countryCode: '',
    phoneNumber: '',
    manager: '',
  });

  const handleAddFactory = () => {
    setEditingFactory(null);
    setFormData({
      name: '',
      address: '',
      countryCode: '',
      phoneNumber: '',
      manager: '',
    });
    setOpenDialog(true);
  };

  const handleEditFactory = (factory) => {
    setEditingFactory(factory);
    setFormData(factory);
    setOpenDialog(true);
  };

  const handleDeleteFactory = (id) => {
    setFactories(factories.filter((f) => f.id !== id));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    if (editingFactory) {
      // 수정
      setFactories(
        factories.map((f) =>
          f.id === editingFactory.id ? { ...formData, id: editingFactory.id } : f
        )
      );
    } else {
      // 추가
      setFactories([
        ...factories,
        {
          ...formData,
          id: Math.max(...factories.map((f) => f.id), 0) + 1,
        },
      ]);
    }
    setOpenDialog(false);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Typography component="h1" variant="h4">
            공장 관리
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddFactory}
          >
            공장 추가
          </Button>
        </Box>
      }
    >
      <TableContainer component={Paper} sx={{ width: '100%' }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>공장명</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>주소</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>담당자</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {factories.map((factory) => (
              <TableRow key={factory.id} hover>
                <TableCell>{factory.name}</TableCell>
                <TableCell>{factory.address}</TableCell>
                <TableCell>{factory.countryCode} {factory.phoneNumber}</TableCell>
                <TableCell>{factory.manager}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {factories.length === 0 && (
        <Box sx={{ width: '100%', textAlign: 'center', py: 5 }}>
          <Typography color="text.secondary">공장 정보가 없습니다.</Typography>
        </Box>
      )}

      {/* 공장 추가/수정 다이얼로그 */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingFactory ? '공장 정보 수정' : '공장 추가'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="공장명"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="예: 하노이 공장"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="주소"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="상세 주소"
              />
            </Grid>
            <Grid item xs={5}>
              <TextField
                fullWidth
                label="국가번호"
                name="countryCode"
                value={formData.countryCode}
                onChange={handleInputChange}
                placeholder="예: +84"
              />
            </Grid>
            <Grid item xs={7}>
              <TextField
                fullWidth
                label="전화번호"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                placeholder="예: 24-1234-5678"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="담당자명"
                name="manager"
                value={formData.manager}
                onChange={handleInputChange}
                placeholder="담당자 이름"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default FactoryList;
