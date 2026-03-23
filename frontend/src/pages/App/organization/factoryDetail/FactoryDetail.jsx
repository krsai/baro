import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../../constants/layout';
import { getStaticOptionOptions } from '../../../../constants/staticOptionRegistry';
import { getUiMessage } from '../../../../constants/uiMessages';
import { useLanguage } from '../../../../context/LanguageContext';
import {
  formatDigitsWithCommas,
  parseNumberLike,
} from '../../../../utils/numberFormat';

const WORK_DAYS_PER_MONTH = 26;
const HOURS_PER_DAY = 8;
const SECONDS_PER_MONTH = WORK_DAYS_PER_MONTH * HOURS_PER_DAY * 60 * 60;
const COUNTRY_CODE_BY_COUNTRY = {
  KR: '+82',
  VN: '+84',
};
const DEFAULT_COUNTRY = 'VN';
const DEFAULT_COUNTRY_CODE = COUNTRY_CODE_BY_COUNTRY[DEFAULT_COUNTRY];

const parseNumber = (value) => {
  return parseNumberLike(value);
};

const normalizeCountry = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || '';
};

const resolveCountryFromCountryCode = (countryCode) => {
  const normalized = String(countryCode || '').trim();
  if (normalized === COUNTRY_CODE_BY_COUNTRY.KR) return 'KR';
  if (normalized === COUNTRY_CODE_BY_COUNTRY.VN) return 'VN';
  return '';
};

const resolveDefaultCountryCode = (country) =>
  COUNTRY_CODE_BY_COUNTRY[normalizeCountry(country)] || DEFAULT_COUNTRY_CODE;

const buildFactoryFormData = (factory) => {
  const rawCountry = normalizeCountry(factory?.country);
  const countryFromCode = resolveCountryFromCountryCode(factory?.countryCode);
  const country = rawCountry || countryFromCode || DEFAULT_COUNTRY;
  return {
    name: factory?.name || '',
    address: factory?.address || '',
    country,
    countryCode: factory?.countryCode || resolveDefaultCountryCode(country),
    phoneNumber: factory?.phoneNumber || '',
    manager: factory?.manager || '',
    targetMonthlyWage: factory?.targetMonthlyWage ?? '',
    wagePerSecond: factory?.wagePerSecond ?? '',
  };
};

const FactoryDetail = ({ open, onClose, onSave, factory }) => {
  const { languageCode } = useLanguage();
  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );

  const text = useMemo(
    () => ({
      editTitle: getUiMessage('factoryDetail.editTitle', 'Edit Factory', languageCode),
      createTitle: getUiMessage('factoryDetail.createTitle', 'Add Factory', languageCode),
      name: getUiMessage('factoryDetail.name', 'Factory Name', languageCode),
      address: getUiMessage('factoryDetail.address', 'Address', languageCode),
      manager: getUiMessage('factoryDetail.manager', 'Manager', languageCode),
      country: getUiMessage('factoryDetail.country', 'Country', languageCode),
      countryCode: getUiMessage('factoryDetail.countryCode', 'Country Code', languageCode),
      phoneNumber: getUiMessage('factoryDetail.phoneNumber', 'Phone Number', languageCode),
      targetMonthlyWage: getUiMessage('factoryDetail.targetMonthlyWage', 'Target Monthly Wage', languageCode),
      wagePerSecond: getUiMessage('factoryDetail.wagePerSecond', 'Wage / sec (auto)', languageCode),
      targetMonthlyWageHelper: getUiMessage(
        'factoryDetail.targetMonthlyWageHelper',
        'Based on 26 days/month, 8 hours/day (08:00-17:00 with 1 hour lunch break).',
        languageCode
      ),
      wagePerSecondHelper: getUiMessage(
        'factoryDetail.wagePerSecondHelper',
        'Automatically calculated from monthly target wage.',
        languageCode
      ),
      save: getUiMessage('common.save', 'Save', languageCode),
    }),
    [languageCode]
  );

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    country: DEFAULT_COUNTRY,
    countryCode: DEFAULT_COUNTRY_CODE,
    phoneNumber: '',
    manager: '',
    targetMonthlyWage: '',
    wagePerSecond: '',
  });

  useEffect(() => {
    if (factory) {
      setFormData(buildFactoryFormData(factory));
      return;
    }

    setFormData(buildFactoryFormData(null));
  }, [factory, open]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === 'country') {
      const nextCountry = normalizeCountry(value) || DEFAULT_COUNTRY;
      setFormData((prev) => ({
        ...prev,
        country: nextCountry,
        countryCode: resolveDefaultCountryCode(nextCountry),
      }));
      return;
    }

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
      country: normalizeCountry(formData.country) || DEFAULT_COUNTRY,
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
          <Typography variant="h6">{factory ? text.editTitle : text.createTitle}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={2.25}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={text.name}
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={text.address}
              name="address"
              value={formData.address}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={text.manager}
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              select
              size="small"
              label={text.country}
              name="country"
              value={normalizeCountry(formData.country) || DEFAULT_COUNTRY}
              onChange={handleInputChange}
            >
              {countryOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label={text.countryCode}
              name="countryCode"
              value={formData.countryCode}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              size="small"
              label={text.phoneNumber}
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={text.targetMonthlyWage}
              name="targetMonthlyWage"
              value={formatDigitsWithCommas(formData.targetMonthlyWage)}
              onChange={handleInputChange}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              helperText={text.targetMonthlyWageHelper}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={text.wagePerSecond}
              name="wagePerSecond"
              value={computedWageDisplay}
              InputProps={{ readOnly: true }}
              helperText={text.wagePerSecondHelper}
              sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
            {text.save}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default FactoryDetail;
