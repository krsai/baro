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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchInput from '../../../components/SearchInput';

const initialColors = [
  { id: 1, code: 'BLK', name: 'Black' },
  { id: 2, code: 'WHT', name: 'White' },
  { id: 3, code: 'RED', name: 'Red' },
  { id: 4, code: 'BLU', name: 'Blue' },
];

const AttrColor = () => {
  const [items, setItems] = useState(initialColors);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const initialFormData = { code: '', name: '' };
  const [formData, setFormData] = useState(initialFormData);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowerTerm = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(lowerTerm) ||
        item.code.toLowerCase().includes(lowerTerm)
    );
  }, [items, searchTerm]);

  const handleAdd = () => {
    setEditingItem(null);
    setFormData(initialFormData);
    setOpenDialog(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData(item);
    setOpenDialog(true);
  };

  const handleDelete = (itemId) => {
    if (window.confirm('정말로 삭제하시겠습니까?')) {
      setItems(items.filter((i) => i.id !== itemId));
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSave = () => {
    if (editingItem) {
      setItems(
        items.map((i) => (i.id === editingItem.id ? { ...formData, id: i.id } : i))
      );
    } else {
      const newItem = {
        ...formData,
        id: Math.max(...items.map((i) => i.id), 0) + 1,
      };
      setItems([...items, newItem]);
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
          placeholder="색상명 또는 코드 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          색상 추가
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>코드</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>색상명</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <IconButton size="small" onClick={() => handleEdit(item)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(item.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{editingItem ? '색상 수정' : '신규 색상 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField name="code" label="코드" value={formData.code} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="name" label="색상명" value={formData.name} onChange={handleInputChange} fullWidth />
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

export default AttrColor;
