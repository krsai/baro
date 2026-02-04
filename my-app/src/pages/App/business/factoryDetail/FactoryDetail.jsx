import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  Typography,
  TextField,
  Button,
  Grid,
  Divider,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';

const FactoryDetail = ({ open, onClose, onSave, factory }) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    countryCode: '+84',
    phoneNumber: '',
    manager: '',
    wageStandard: 'PT',
    wagePerSecond: '',
  });

  useEffect(() => {
    if (factory) {
      setFormData({
        name: factory.name || '',
        address: factory.address || '',
        countryCode: factory.countryCode || '+84',
        phoneNumber: factory.phoneNumber || '',
        manager: factory.manager || '',
        wageStandard: factory.wageStandard || 'PT',
        wagePerSecond: factory.wagePerSecond || '',
      });
    } else {
      // Reset for new factory
      setFormData({
        name: '',
        address: '',
        countryCode: '+84',
        phoneNumber: '',
        manager: '',
        wageStandard: 'PT',
        wagePerSecond: '',
      });
    }
  }, [factory, open]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleWageStandardChange = (event, newStandard) => {
    if (newStandard !== null) {
      setFormData((prev) => ({
        ...prev,
        wageStandard: newStandard,
      }));
    }
  };

  const handleSave = () => {
    onSave({ ...factory, ...formData });
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 500, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{factory ? '공장 정보 수정' : '새 공장 추가'}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="공장명"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="주소"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="관리자"
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={5}>
            <TextField
              fullWidth
              label="국가코드"
              name="countryCode"
              value={formData.countryCode}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={7}>
            <TextField
              fullWidth
              label="전화번호"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>급여 기준</Typography>
            <ToggleButtonGroup
                value={formData.wageStandard}
                exclusive
                onChange={handleWageStandardChange}
                fullWidth
            >
                <ToggleButton value="PT">PT (Provisional Time)</ToggleButton>
                <ToggleButton value="ST">ST (Standard Time)</ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="초당 급여 (원)"
              name="wagePerSecond"
              type="number"
              value={formData.wagePerSecond}
              onChange={handleInputChange}
            />
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
            저장
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default FactoryDetail;