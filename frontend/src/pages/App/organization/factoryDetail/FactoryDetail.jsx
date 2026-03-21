import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Drawer,
  Grid,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../../constants/layout';
import {
  formatDigitsWithCommas,
  parseNumberLike,
} from '../../../../utils/numberFormat';

const WORK_DAYS_PER_MONTH = 26;
const HOURS_PER_DAY = 8;
const SECONDS_PER_MONTH = WORK_DAYS_PER_MONTH * HOURS_PER_DAY * 60 * 60;

const parseNumber = (value) => {
  return parseNumberLike(value);
};

const FactoryDetail = ({ open, onClose, onSave, factory }) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    countryCode: '+84',
    phoneNumber: '',
    manager: '',
    targetMonthlyWage: '',
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
        targetMonthlyWage: factory.targetMonthlyWage ?? '',
        wagePerSecond: factory.wagePerSecond ?? '',
      });
      return;
    }

    setFormData({
      name: '',
      address: '',
      countryCode: '+84',
      phoneNumber: '',
      manager: '',
      targetMonthlyWage: '',
      wagePerSecond: '',
    });
  }, [factory, open]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === 'targetMonthlyWage') {
      setFormData((prev) => ({
        ...prev,
        targetMonthlyWage: value.replace(/[^\d]/g, ''),
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const computedWagePerSecond = useMemo(() => {
    const target = parseNumber(formData.targetMonthlyWage);
    if (Number.isFinite(target)) {
      const value = target / SECONDS_PER_MONTH;
      return Math.round(value * 100) / 100;
    }
    const fallback = parseNumber(formData.wagePerSecond);
    return Number.isFinite(fallback) ? fallback : Number.NaN;
  }, [formData.targetMonthlyWage, formData.wagePerSecond]);

  const computedWageDisplay = Number.isFinite(computedWagePerSecond)
    ? computedWagePerSecond.toFixed(2)
    : '';

  const handleSave = () => {
    const targetMonthlyWage = parseNumber(formData.targetMonthlyWage);
    const wagePerSecond = Number.isFinite(computedWagePerSecond)
      ? computedWagePerSecond
      : formData.wagePerSecond ?? '';

    onSave?.({
      ...factory,
      ...formData,
      targetMonthlyWage: Number.isFinite(targetMonthlyWage) ? targetMonthlyWage : '',
      wagePerSecond,
    });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          ...TOP_OFFSET_DRAWER_PAPER_SX,
          width: { xs: '100%', sm: 500 },
        },
      }}
    >
      <Box sx={{ width: '100%', height: '100%', overflowY: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{factory ? '공장 수정' : '공장 추가'}</Typography>
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
              label="국가번호"
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

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="월 목표 급여"
              name="targetMonthlyWage"
              value={formatDigitsWithCommas(formData.targetMonthlyWage)}
              onChange={handleInputChange}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              helperText="월 26일, 하루 8시간(08:00~17:00, 점심 1시간 제외) 기준"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="초당 급여 (자동계산)"
              name="wagePerSecond"
              value={computedWageDisplay}
              InputProps={{ readOnly: true }}
              helperText="월 목표 급여 기준으로 자동 계산"
              sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
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
