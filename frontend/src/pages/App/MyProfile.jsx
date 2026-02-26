import { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Paper,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../components/AppPageContainer';
import PageSectionHeader from '../../components/PageSectionHeader';
import { useApp } from '../../context/AppContext';
import { requestJSON } from '../../utils/apiClient';

const buildProfileInfo = (data = {}) => ({
  email: data.email ?? '',
  name: data.name ?? '',
  phone: data.phone ?? '',
  bankName: data.bankName ?? '',
  bankAccountNumber: data.bankAccountNumber ?? '',
});

const MyProfile = () => {
  const { showNotification } = useApp();
  const [formData, setFormData] = useState(buildProfileInfo());

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await requestJSON('/employees/me');
        if (!data) return;
        setFormData(buildProfileInfo(data));
      } catch (_error) {
        // ignore fetch errors
      }
    };
    fetchProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: formData.name?.trim(),
        phone: formData.phone?.trim(),
        bankName: formData.bankName?.trim(),
        bankAccountNumber: formData.bankAccountNumber?.trim(),
      };
      const saved = await requestJSON('/employees/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setFormData(buildProfileInfo(saved));
      showNotification('개인 정보가 저장되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const InfoRow = ({ label, value, name, disabled }) => (
    <Box sx={{ py: 1.5, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
        {disabled && (
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>
            (수정 불가)
          </Typography>
        )}
      </Typography>
      {disabled ? (
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {value || '-'}
        </Typography>
      ) : (
        <TextField
          variant="standard"
          fullWidth
          name={name}
          value={value}
          onChange={handleInputChange}
          slotProps={{ input: { disableUnderline: false } }}
          sx={{ '& .MuiInputBase-input': { fontWeight: 500, fontSize: '1rem', py: 0.25 } }}
        />
      )}
    </Box>
  );

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="개인 정보"
          actionLabel="저장"
          actionIcon={<SaveIcon />}
          onAction={handleSave}
        />
      }
    >
      <Paper variant="outlined" sx={{ width: '100%', p: 3 }}>
        <InfoRow label="이메일" value={formData.email} disabled />
        <InfoRow label="이름" name="name" value={formData.name} />
        <InfoRow label="연락처" name="phone" value={formData.phone} />
        <InfoRow label="은행" name="bankName" value={formData.bankName} />
        <InfoRow label="계좌번호" name="bankAccountNumber" value={formData.bankAccountNumber} />
      </Paper>
    </AppPageContainer>
  );
};

export default MyProfile;
