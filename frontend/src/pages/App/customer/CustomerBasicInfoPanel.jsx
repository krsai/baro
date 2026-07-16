import React, { useMemo } from 'react';
import { Box, Grid, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import LocationOnRoundedIcon from '@mui/icons-material/LocationOnRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import { getSizeSetOptions } from '../../../constants/productAttributes';
import { formatCustomerDate, normalizeCountry } from './customerFormShared';

const getText = (languageCode) => {
  const values = {
    ko: {
      identity: '고객 기본 정보', identityHelp: '고객 식별 정보와 언어별 공식 명칭을 관리합니다.',
      nameEn: '고객명 (영문)', nameKo: '고객명 (한글)', nameVi: '고객명 (베트남어)',
      industry: '업종',
      brand: '브랜드', factory: '공장',
      order: '기본 주문 설정', orderHelp: '이 고객의 신규 주문에 자동으로 적용됩니다.', sizeSet: '기본 사이즈 표기 방식',
      address: '사업장 주소', addressHelp: '국가와 상세 주소를 함께 입력하세요.', addressPlaceholder: '도로명, 건물명, 지역 등 상세 주소',
      contact: '담당자 연락처', contactHelp: '담당자 이름과 연락 수단을 한곳에서 관리합니다.',
    },
    en: {
      identity: 'Customer information', identityHelp: 'Manage identifiers and official names in each language.',
      nameEn: 'Customer Name (English)', nameKo: 'Customer Name (Korean)', nameVi: 'Customer Name (Vietnamese)',
      industry: 'Business type',
      brand: 'Brand', factory: 'Manufacturer',
      order: 'Order defaults', orderHelp: 'Automatically applied when creating a new order for this customer.', sizeSet: 'Default size notation',
      address: 'Business address', addressHelp: 'Enter the country and full street address together.', addressPlaceholder: 'Street, building, district, and other details',
      contact: 'Contact person', contactHelp: 'Keep the contact name and communication details together.',
    },
    vi: {
      identity: 'Thông tin khách hàng', identityHelp: 'Quản lý mã và tên chính thức theo từng ngôn ngữ.',
      nameEn: 'Tên khách hàng (tiếng Anh)', nameKo: 'Tên khách hàng (tiếng Hàn)', nameVi: 'Tên khách hàng (tiếng Việt)',
      industry: 'Loại hình',
      brand: 'Thương hiệu', factory: 'Nhà máy',
      order: 'Thiết lập đơn hàng mặc định', orderHelp: 'Tự động áp dụng khi tạo đơn hàng mới cho khách hàng này.', sizeSet: 'Cách ghi kích cỡ mặc định',
      address: 'Địa chỉ doanh nghiệp', addressHelp: 'Nhập quốc gia và địa chỉ chi tiết cùng nhau.', addressPlaceholder: 'Đường, tòa nhà, quận/huyện và thông tin khác',
      contact: 'Người liên hệ', contactHelp: 'Quản lý tên và thông tin liên lạc tại một nơi.',
    },
  };
  return values[languageCode] || values.en;
};

const Section = ({ icon, title, help, children, accent = '#0b6bcb' }) => (
  <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', borderColor: 'divider', boxShadow: '0 5px 20px rgba(15,23,42,.035)' }}>
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 2, bgcolor: 'rgba(248,250,252,.8)', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', color: accent, bgcolor: `${accent}12` }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontWeight: 800, lineHeight: 1.35 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{help}</Typography>
      </Box>
    </Box>
    <Box sx={{ p: { xs: 2, md: 2.5 } }}>{children}</Box>
  </Paper>
);

const CustomerBasicInfoPanel = ({ customerFormData, countryOptions, savingCustomer, languageCode, onBasicFieldChange, onCountryChange, t }) => {
  const text = useMemo(() => getText(languageCode), [languageCode]);
  const sizeSetOptions = useMemo(() => getSizeSetOptions(languageCode), [languageCode]);
  const common = { fullWidth: true, disabled: savingCustomer, size: 'small' };
  const isBrand = customerFormData.industry === 'BRAND';

  return (
    <Stack spacing={2} sx={{ maxWidth: 1180 }}>
      <Section icon={<BusinessRoundedIcon />} title={text.identity} help={text.identityHelp}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} lg={2}><TextField {...common} label={text.industry} value={isBrand ? text.brand : text.factory} disabled /></Grid>
          <Grid item xs={12} sm={6} lg={2}><TextField {...common} required label={t('customerCode')} name="code" value={customerFormData.code} onChange={onBasicFieldChange} /></Grid>
          <Grid item xs={12} md={4} lg={2}><TextField {...common} required label={text.nameEn} name="name" value={customerFormData.name} onChange={onBasicFieldChange} /></Grid>
          <Grid item xs={12} md={4} lg={2}><TextField {...common} label={text.nameKo} name="nameKo" value={customerFormData.nameKo} onChange={onBasicFieldChange} /></Grid>
          <Grid item xs={12} md={4} lg={2}><TextField {...common} label={text.nameVi} name="nameVi" value={customerFormData.nameVi} onChange={onBasicFieldChange} /></Grid>
          <Grid item xs={12} sm={6} lg={2}><TextField {...common} label={t('registeredAt')} value={formatCustomerDate(customerFormData.registeredAt, languageCode)} disabled /></Grid>
        </Grid>
      </Section>

      {isBrand && <Section icon={<StraightenRoundedIcon />} title={text.order} help={text.orderHelp} accent="#7c3aed">
        <TextField {...common} select label={text.sizeSet} name="defaultSizeSetCode" value={customerFormData.defaultSizeSetCode} onChange={onBasicFieldChange} sx={{ maxWidth: 480 }}>
          {sizeSetOptions.map((option) => <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}
        </TextField>
      </Section>}

      <Section icon={<LocationOnRoundedIcon />} title={text.address} help={text.addressHelp} accent="#059669">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4} md={3}><TextField {...common} select label={t('country')} name="country" value={normalizeCountry(customerFormData.country) || 'VN'} onChange={onCountryChange}>{countryOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} sm={8} md={9}><TextField {...common} label={t('address')} name="address" value={customerFormData.address} onChange={onBasicFieldChange} placeholder={text.addressPlaceholder} multiline minRows={2} /></Grid>
        </Grid>
      </Section>

      <Section icon={<BadgeRoundedIcon />} title={text.contact} help={text.contactHelp} accent="#ea580c">
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}><TextField {...common} label={t('manager')} name="manager" value={customerFormData.manager} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><BadgeRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
          <Grid item xs={4} md={2}><TextField {...common} label={t('countryCode')} name="countryCode" value={customerFormData.countryCode} onChange={onBasicFieldChange} /></Grid>
          <Grid item xs={8} md={3}><TextField {...common} label={t('phoneNumber')} name="phoneNumber" value={customerFormData.phoneNumber} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><PhoneRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
          <Grid item xs={12} md={3}><TextField {...common} type="email" label={t('email')} name="email" value={customerFormData.email} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><EmailRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
        </Grid>
      </Section>
    </Stack>
  );
};

export default CustomerBasicInfoPanel;
