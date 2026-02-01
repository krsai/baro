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

const initialSizes = [
  { id: 1, name: 'Small', order: 1 },
  { id: 2, name: 'Medium', order: 2 },
  { id: 3, name: 'Large', order: 3 },
  { id: 4, name: 'X-Large', order: 4 },
];

const AttrSize = () => {
  const [items, setItems] = useState(initialSizes);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const initialFormData = { name: '', order: '' };
  const [formData, setFormData] = useState(initialFormData);

  const filteredItems = useMemo(() => {
    let sortedItems = [...items].sort((a, b) => a.order - b.order);
    if (!searchTerm) return sortedItems;
    const lowerTerm = searchTerm.toLowerCase();
    return sortedItems.filter(
      (item) => item.name.toLowerCase().includes(lowerTerm)
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
          placeholder="사이즈명 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          사이즈 추가
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>사이즈명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>정렬 순서</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.order}</TableCell>
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
        <DialogTitle>{editingItem ? '사이즈 수정' : '신규 사이즈 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField name="name" label="사이즈명" value={formData.name} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="order" label="정렬 순서" type="number" value={formData.order} onChange={handleInputChange} fullWidth />
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

export default AttrSize;
