import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
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
  const [profileInfo, setProfileInfo] = useState(buildProfileInfo());
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(buildProfileInfo());

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await requestJSON('/employees/me');
        if (!data) return;
        setProfileInfo(buildProfileInfo(data));
      } catch (_error) {
        // ignore fetch errors
      }
    };
    fetchProfile();
  }, []);

  const handleEditOpen = () => {
    setEditData({ ...profileInfo });
    setEditMode(true);
  };

  const handleEditClose = () => {
    setEditMode(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: editData.name?.trim(),
        phone: editData.phone?.trim(),
        bankName: editData.bankName?.trim(),
        bankAccountNumber: editData.bankAccountNumber?.trim(),
      };
      const saved = await requestJSON('/employees/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setProfileInfo(buildProfileInfo(saved));
      setEditMode(false);
      showNotification('개인 정보가 저장되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const InfoRow = ({ label, value, readOnly }) => (
    <Box sx={{ py: 2, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
        {readOnly && (
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>
            (수정 불가)
          </Typography>
        )}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {value || '-'}
      </Typography>
    </Box>
  );

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="개인 정보"
          actionLabel="수정"
          actionIcon={<EditIcon />}
          onAction={handleEditOpen}
        />
      }
    >
      <Paper variant="outlined" sx={{ width: '100%', p: 3 }}>
        <InfoRow label="이메일" value={profileInfo.email} readOnly />
        <InfoRow label="이름" value={profileInfo.name} />
        <InfoRow label="연락처" value={profileInfo.phone} />
        <InfoRow label="은행" value={profileInfo.bankName} />
        <InfoRow label="계좌번호" value={profileInfo.bankAccountNumber} />
      </Paper>

      <Dialog open={editMode} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle>개인 정보 수정</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="이메일"
                value={profileInfo.email}
                disabled
                helperText="소셜 로그인 이메일은 수정할 수 없습니다."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="이름"
                name="name"
                value={editData.name}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="연락처"
                name="phone"
                value={editData.phone}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="은행"
                name="bankName"
                value={editData.bankName}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="계좌번호"
                name="bankAccountNumber"
                value={editData.bankAccountNumber}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose} startIcon={<CancelIcon />}>
            취소
          </Button>
          <Button onClick={handleSave} variant="contained" startIcon={<SaveIcon />}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default MyProfile;
