import React, { useMemo } from 'react';
import {
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  formatCustomerDate,
  normalizeCountry,
} from './customerFormShared';

const getSectionText = (languageCode) => {
  if (languageCode === 'ko') {
    return {
      identityTitle: '기본 정보',
      localizedTitle: '다국어 이름',
      contactTitle: '연락처',
      nameKo: '고객명 (한글)',
      nameVi: '고객명 (베트남어)',
    };
  }

  if (languageCode === 'vi') {
    return {
      identityTitle: 'Thong tin co ban',
      localizedTitle: 'Ten da ngon ngu',
      contactTitle: 'Lien he',
      nameKo: 'Ten khach hang (tieng Han)',
      nameVi: 'Ten khach hang (tieng Viet)',
    };
  }

  return {
    identityTitle: 'Basic Info',
    localizedTitle: 'Localized Names',
    contactTitle: 'Contact',
    nameKo: 'Customer Name (Korean)',
    nameVi: 'Customer Name (Vietnamese)',
  };
};

const SectionLabel = ({ children }) => (
  <Typography
    variant="overline"
    sx={{
      fontWeight: 700,
      letterSpacing: 0.6,
      color: 'text.secondary',
      lineHeight: 1.6,
    }}
  >
    {children}
  </Typography>
);

const CustomerBasicInfoPanel = ({
  customerFormData,
  countryOptions,
  savingCustomer,
  languageCode,
  onBasicFieldChange,
  onCountryChange,
  t,
}) => {
  const sectionText = useMemo(() => getSectionText(languageCode), [languageCode]);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2.5, md: 3.5 } }}>
      <Stack spacing={3}>
        <Stack spacing={1.5}>
          <SectionLabel>{sectionText.identityTitle}</SectionLabel>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                required
                label={t('customerCode')}
                name="code"
                value={customerFormData.code}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label={t('customerName')}
                name="name"
                value={customerFormData.name}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label={t('registeredAt')}
                value={formatCustomerDate(customerFormData.registeredAt, languageCode)}
                disabled
              />
            </Grid>
          </Grid>
        </Stack>

        <Divider />

        <Stack spacing={1.5}>
          <SectionLabel>{sectionText.localizedTitle}</SectionLabel>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={sectionText.nameKo}
                name="nameKo"
                value={customerFormData.nameKo}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={sectionText.nameVi}
                name="nameVi"
                value={customerFormData.nameVi}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
          </Grid>
        </Stack>

        <Divider />

        <Stack spacing={1.5}>
          <SectionLabel>{sectionText.contactTitle}</SectionLabel>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label={t('country')}
                name="country"
                value={normalizeCountry(customerFormData.country) || 'VN'}
                onChange={onCountryChange}
                disabled={savingCustomer}
              >
                {countryOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label={t('manager')}
                name="manager"
                value={customerFormData.manager}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('address')}
                name="address"
                value={customerFormData.address}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
                multiline
                minRows={2}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label={t('countryCode')}
                name="countryCode"
                value={customerFormData.countryCode}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('phoneNumber')}
                name="phoneNumber"
                value={customerFormData.phoneNumber}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
            <Grid item xs={12} md={5}>
              <TextField
                fullWidth
                label={t('email')}
                name="email"
                type="email"
                value={customerFormData.email}
                onChange={onBasicFieldChange}
                disabled={savingCustomer}
              />
            </Grid>
          </Grid>
        </Stack>
      </Stack>
    </Paper>
  );
};

export default CustomerBasicInfoPanel;
