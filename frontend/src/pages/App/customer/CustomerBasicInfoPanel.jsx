import React, { useMemo } from 'react';
import {
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
      identityTitle: '고객 기본 정보',
      identityDescription: '코드, 기본 고객명, 등록일처럼 가장 자주 확인하는 정보를 먼저 묶었습니다.',
      localizedTitle: '다국어 고객명',
      localizedDescription: '한글과 베트남어 이름을 함께 관리해 화면 표시를 일관되게 맞춥니다.',
      contactTitle: '국가 및 연락처',
      contactDescription: '국가, 담당자, 주소, 연락 수단을 한 흐름으로 정리했습니다.',
      nameKo: '고객명 (한글)',
      nameVi: '고객명 (베트남어)',
    };
  }

  if (languageCode === 'vi') {
    return {
      identityTitle: 'Thong tin khach hang',
      identityDescription: 'Gom ma, ten chinh va ngay dang ky de xem nhanh hon.',
      localizedTitle: 'Ten da ngon ngu',
      localizedDescription: 'Luu ten tieng Han va tieng Viet de hien thi dong nhat tren giao dien.',
      contactTitle: 'Quoc gia va lien he',
      contactDescription: 'Dat quoc gia, nguoi phu trach, dia chi va cach lien lac trong cung mot nhom.',
      nameKo: 'Ten khach hang (tieng Han)',
      nameVi: 'Ten khach hang (tieng Viet)',
    };
  }

  return {
    identityTitle: 'Customer Basics',
    identityDescription: 'Keep the code, primary name, and registration date together for quick review.',
    localizedTitle: 'Localized Names',
    localizedDescription: 'Store Korean and Vietnamese names for consistent display across the workspace.',
    contactTitle: 'Country & Contact',
    contactDescription: 'Group country, owner, address, and contact details into one flow.',
    nameKo: 'Customer Name (Korean)',
    nameVi: 'Customer Name (Vietnamese)',
  };
};

const SectionCard = ({ title, description, children }) => (
  <Paper
    variant="outlined"
    sx={{
      borderRadius: 3,
      p: { xs: 2, md: 3 },
      background:
        'linear-gradient(180deg, rgba(248,250,252,0.72) 0%, rgba(255,255,255,0.98) 100%)',
    }}
  >
    <Stack spacing={2.25}>
      <div>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        ) : null}
      </div>
      {children}
    </Stack>
  </Paper>
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
    <Stack spacing={2}>
      <SectionCard
        title={sectionText.identityTitle}
        description={sectionText.identityDescription}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
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
          <Grid item xs={12} md={5}>
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
      </SectionCard>

      <SectionCard
        title={sectionText.localizedTitle}
        description={sectionText.localizedDescription}
      >
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
      </SectionCard>

      <SectionCard
        title={sectionText.contactTitle}
        description={sectionText.contactDescription}
      >
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
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
          <Grid item xs={12} md={6}>
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
          <Grid item xs={12} md={4}>
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
          <Grid item xs={12} md={4}>
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
      </SectionCard>
    </Stack>
  );
};

export default CustomerBasicInfoPanel;
