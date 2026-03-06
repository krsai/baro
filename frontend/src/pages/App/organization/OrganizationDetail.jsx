import { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Paper,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../../components/AppPageContainer';
import PageSectionHeader from '../../../components/PageSectionHeader';
import { useApp } from '../../../context/AppContext';
import { requestJSON } from '../../../utils/apiClient';

const buildCompanyInfo = (data = {}) => ({
  name: data.name ?? '',
  businessNumber: data.businessNumber ?? '',
  representative: data.representative ?? '',
  industry: data.industry ?? '',
  address: data.address ?? '',
  phone: data.phone ?? '',
  email: data.email ?? '',
});

const OrganizationDetail = () => {
  const { showNotification } = useApp();

  const [organizationId, setOrganizationId] = useState(null);
  const [formData, setFormData] = useState(buildCompanyInfo());

  useEffect(() => {
    let active = true;

    const fetchOrganization = async () => {
      try {
        const data = await requestJSON('/organizations/primary');
        if (!active || !data) return;
        setOrganizationId(data.id ?? null);
        setFormData(buildCompanyInfo(data));
      } catch (_error) {
        // ignore fetch errors in UI for now
      }
    };

    fetchOrganization();
    return () => {
      active = false;
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: formData.name?.trim(),
        businessNumber: formData.businessNumber?.trim(),
        representative: formData.representative?.trim(),
        industry: formData.industry?.trim(),
        address: formData.address?.trim(),
        phone: formData.phone?.trim(),
        email: formData.email?.trim(),
      };

      const saved = await requestJSON(
        organizationId ? `/organizations/${organizationId}` : '/organizations',
        {
          method: organizationId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      setOrganizationId(saved.id ?? null);
      setFormData(buildCompanyInfo(saved));
      showNotification('회사 정보가 저장되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '회사 정보 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const InfoRow = ({ label, value, name }) => (
    <Box sx={{ py: 1.5, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
      </Typography>
      <TextField
        variant="standard"
        fullWidth
        name={name}
        value={value}
        onChange={handleInputChange}
        slotProps={{ input: { disableUnderline: false } }}
        sx={{ '& .MuiInputBase-input': { fontWeight: 500, fontSize: '1rem', py: 0.25 } }}
      />
    </Box>
  );

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="회사 정보"
          actionLabel="저장"
          actionIcon={<SaveIcon />}
          onAction={handleSave}
        />
      }
    >
      <Paper variant="outlined" sx={{ width: '100%', p: 3 }}>
        <InfoRow label="회사명" name="name" value={formData.name} />
        <InfoRow label="사업자등록번호" name="businessNumber" value={formData.businessNumber} />
        <InfoRow label="대표자명" name="representative" value={formData.representative} />
        <InfoRow label="업종" name="industry" value={formData.industry} />
        <InfoRow label="주소" name="address" value={formData.address} />
        <InfoRow label="연락처" name="phone" value={formData.phone} />
        <InfoRow label="이메일" name="email" value={formData.email} />
      </Paper>
    </AppPageContainer>
  );
};

export default OrganizationDetail;
