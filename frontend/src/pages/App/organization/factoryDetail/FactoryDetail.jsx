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
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 500, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{factory ? 'Edit Factory' : 'Add Factory'}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Factory Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Address"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Manager"
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={5}>
            <TextField
              fullWidth
              label="Country Code"
              name="countryCode"
              value={formData.countryCode}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={7}>
            <TextField
              fullWidth
              label="Phone"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Target Monthly Wage"
              name="targetMonthlyWage"
              value={formatDigitsWithCommas(formData.targetMonthlyWage)}
              onChange={handleInputChange}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Wage / sec"
              name="wagePerSecond"
              value={computedWageDisplay}
              InputProps={{ readOnly: true }}
              helperText="Auto-calculated from monthly target"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
            Save
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default FactoryDetail;
