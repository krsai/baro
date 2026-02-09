import React, { useEffect, useState } from 'react';
import {
  Typography,
  Box,
  Button,
  TextField,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';

const OrganizationDetail = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  const [organizationId, setOrganizationId] = useState(null);
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    businessNumber: '',
    representative: '',
    industry: '',
    address: '',
    phone: '',
    email: '',
  });

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ ...companyInfo });

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const response = await fetch(`${API_BASE}/organizations/primary`);
        const data = await response.json();
        if (data) {
          setOrganizationId(data.id);
          setCompanyInfo({
            name: data.name ?? '',
            businessNumber: data.businessNumber ?? '',
            representative: data.representative ?? '',
            industry: data.industry ?? '',
            address: data.address ?? '',
            phone: data.phone ?? '',
            email: data.email ?? '',
          });
        }
      } catch (_error) {
        // ignore fetch errors in UI for now
      }
    };

    fetchOrganization();
  }, [API_BASE]);

  const handleEditOpen = () => {
    setEditData({ ...companyInfo });
    setEditMode(true);
  };

  const handleEditClose = () => {
    setEditMode(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    const saveOrganization = async () => {
      try {
        const payload = {
          name: editData.name?.trim(),
          businessNumber: editData.businessNumber?.trim(),
          representative: editData.representative?.trim(),
          industry: editData.industry?.trim(),
          address: editData.address?.trim(),
          phone: editData.phone?.trim(),
          email: editData.email?.trim(),
        };

        const response = await fetch(
          organizationId ? `${API_BASE}/organizations/${organizationId}` : `${API_BASE}/organizations`,
          {
            method: organizationId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const saved = await response.json();
        if (!response.ok) {
          return;
        }

        setOrganizationId(saved.id);
        setCompanyInfo({
          name: saved.name ?? '',
          businessNumber: saved.businessNumber ?? '',
          representative: saved.representative ?? '',
          industry: saved.industry ?? '',
          address: saved.address ?? '',
          phone: saved.phone ?? '',
          email: saved.email ?? '',
        });
        setEditMode(false);
      } catch (_error) {
        // ignore save errors in UI for now
      }
    };

    saveOrganization();
  };

  const InfoRow = ({ label, value }) => (
    <Box sx={{ py: 2, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<EditIcon />} onClick={handleEditOpen}>
          수정
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%', p: 3 }}>
        <InfoRow label="회사명" value={companyInfo.name} />
        <InfoRow label="사업자등록번호" value={companyInfo.businessNumber} />
        <InfoRow label="대표자명" value={companyInfo.representative} />
        <InfoRow label="업종" value={companyInfo.industry} />
        <InfoRow label="주소" value={companyInfo.address} />
        <InfoRow label="연락처" value={companyInfo.phone} />
        <InfoRow label="이메일" value={companyInfo.email} />
      </Paper>

      {/* 수정 다이얼로그 */}
      <Dialog open={editMode} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle>회사 정보 수정</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="회사명"
                name="name"
                value={editData.name}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="사업자등록번호"
                name="businessNumber"
                value={editData.businessNumber}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="대표자명"
                name="representative"
                value={editData.representative}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="업종" name="industry" value={editData.industry} onChange={handleInputChange} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="주소" name="address" value={editData.address} onChange={handleInputChange} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="연락처" name="phone" value={editData.phone} onChange={handleInputChange} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="이메일" name="email" type="email" value={editData.email} onChange={handleInputChange} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose} startIcon={<CancelIcon />}>취소</Button>
          <Button onClick={handleSave} variant="contained" startIcon={<SaveIcon />}>저장</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrganizationDetail;
