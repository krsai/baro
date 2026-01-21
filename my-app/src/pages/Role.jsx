import React, { useState, useMemo } from 'react';
import {
  Container,
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
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useApp } from '../context/AppContext';

const Role = () => {
  const { roles, setRoles } = useApp();

  const [openDialog, setOpenDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleAddRole = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      description: '',
    });
    setOpenDialog(true);
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setFormData(role);
    setOpenDialog(true);
  };

  const handleDeleteRole = (id) => {
    setRoles(roles.filter((r) => r.id !== id));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    if (editingRole) {
      // 수정
      setRoles(
        roles.map((r) =>
          r.id === editingRole.id ? { ...formData, id: editingRole.id } : r
        )
      );
    } else {
      // 추가
      setRoles([
        ...roles,
        {
          ...formData,
          id: Math.max(...roles.map((r) => r.id), 0) + 1,
        },
      ]);
    }
    setOpenDialog(false);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  return (
    <Container component="main" maxWidth="lg">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 3 }}>
          <Typography component="h1" variant="h4">
            역할 관리
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddRole}
          >
            역할 추가
          </Button>
        </Box>

        <TableContainer component={Paper} sx={{ width: '100%' }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>역할</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '60%' }}>설명</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', width: '20%' }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id} hover>
                  <TableCell sx={{ width: '20%' }}>
                    <Chip label={role.name} color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ width: '60%' }}>{role.description}</TableCell>
                  <TableCell sx={{ textAlign: 'center', width: '20%' }}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleEditRole(role)}
                      title="수정"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteRole(role.id)}
                      title="삭제"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {roles.length === 0 && (
          <Box sx={{ width: '100%', textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">역할 정보가 없습니다.</Typography>
          </Box>
        )}
      </Box>

      {/* 역할 추가/수정 다이얼로그 */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRole ? '역할 정보 수정' : '역할 추가'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="역할명"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="예: 관리자, 작업자"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="설명"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="역할에 대한 설명"
                multiline
                rows={3}
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
    </Container>
  );
};

export default Role;
