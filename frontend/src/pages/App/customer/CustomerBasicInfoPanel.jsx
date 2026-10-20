import EntityBankAccounts from '../../../components/EntityBankAccounts';
import { ENTITY_TEXT } from '../../../constants/entityProfile';
import EntityDetailSection from '../../../components/EntityDetailSection';
import Grid from '@mui/material/Grid';
import React, { useMemo } from 'react';
import { Box, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import { getSizeSetOptions } from '../../../constants/productAttributes';
import { normalizeCountry } from './customerFormShared';

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

const CustomerBasicInfoPanel = ({ customerFormData, countryOptions, savingCustomer, languageCode, onBasicFieldChange, onCountryChange, t }) => {
  const text = useMemo(() => getText(languageCode), [languageCode]);
  const sizeSetOptions = useMemo(() => getSizeSetOptions(languageCode), [languageCode]);
  const common = { fullWidth: true, disabled: savingCustomer, size: 'small' };
  const isBrand = customerFormData.industry === 'BRAND';

  return (
    <Stack spacing={2} >
      <EntityDetailSection title={text.identity}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} label={text.industry} value={isBrand ? text.brand : text.factory} disabled /></Grid>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} required label={t('customerCode')} name="code" value={customerFormData.code} onChange={onBasicFieldChange} /></Grid>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} label={(ENTITY_TEXT[languageCode]||ENTITY_TEXT.en).businessNumber} name="businessNumber" value={customerFormData.businessNumber||''} onChange={onBasicFieldChange} /></Grid>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} required label={text.nameEn} name="name" value={customerFormData.name} onChange={onBasicFieldChange} /></Grid>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} label={text.nameKo} name="nameKo" value={customerFormData.nameKo} onChange={onBasicFieldChange} /></Grid>
          <Grid size={{xs:12,sm:6,md:4}}><TextField {...common} label={text.nameVi} name="nameVi" value={customerFormData.nameVi} onChange={onBasicFieldChange} /></Grid>
        </Grid>
      </EntityDetailSection>
      <EntityDetailSection title={text.contact}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,md:4}}><TextField {...common} label={t('manager')} name="manager" value={customerFormData.manager} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><BadgeRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
          <Grid size={{xs:4,md:2}}><TextField {...common} label={t('countryCode')} name="countryCode" value={customerFormData.countryCode} onChange={onBasicFieldChange} /></Grid>
          <Grid size={{xs:8,md:3}}><TextField {...common} label={t('phoneNumber')} name="phoneNumber" value={customerFormData.phoneNumber} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><PhoneRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
          <Grid size={{xs:12,md:3}}><TextField {...common} type="email" label={t('email')} name="email" value={customerFormData.email} onChange={onBasicFieldChange} InputProps={{ startAdornment: <InputAdornment position="start"><EmailRoundedIcon fontSize="small" /></InputAdornment> }} /></Grid>
        </Grid>
      </EntityDetailSection>
      <EntityDetailSection title={text.address}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:4,md:3}}><TextField {...common} select label={t('country')} name="country" value={normalizeCountry(customerFormData.country) || 'VN'} onChange={onCountryChange}>{countryOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField></Grid>
          <Grid size={{xs:12,sm:8,md:9}}><TextField {...common} label={t('address')} name="address" value={customerFormData.address} onChange={onBasicFieldChange} placeholder={text.addressPlaceholder} multiline minRows={2} /></Grid>
        </Grid>
      </EntityDetailSection>
      <EntityBankAccounts entityId={customerFormData.entityId} languageCode={languageCode}/>
      {isBrand && <EntityDetailSection title={text.order}>
        <TextField {...common} select label={text.sizeSet} name="defaultSizeSetCode" value={customerFormData.defaultSizeSetCode} onChange={onBasicFieldChange} sx={{ maxWidth: 480 }}>
          {sizeSetOptions.map((option) => <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}
        </TextField>
      </EntityDetailSection>}
    </Stack>
  );
};

export default CustomerBasicInfoPanel;
