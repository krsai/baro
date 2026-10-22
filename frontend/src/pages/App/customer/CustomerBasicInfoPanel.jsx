import PartnerProfileFields from '../../../components/PartnerProfileFields';
import EntityBankAccounts from '../../../components/EntityBankAccounts';
import { ENTITY_TEXT } from '../../../constants/entityProfile';
import EntityDetailSection from '../../../components/EntityDetailSection';
import Grid from '@mui/material/Grid';
import React, { useMemo } from 'react';
import { MenuItem, Stack, TextField } from '@mui/material';
import { getSizeSetOptions } from '../../../constants/productAttributes';

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
      <PartnerProfileFields languageCode={languageCode} disabled={savingCustomer}
        value={{...customerFormData,contactName:customerFormData.manager,contactPhone:customerFormData.phoneNumber}}
        onChange={(key,value)=>{
          const name={contactName:'manager',contactPhone:'phoneNumber'}[key]||key;
          const event={target:{name,value}};
          if(key==='country')onCountryChange(event);else onBasicFieldChange(event);
        }}/>
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
