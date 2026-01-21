import React, { useState } from 'react';
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
import AppPageContainer from '../../components/AppPageContainer'; // Import AppPageContainer

const Company = () => {
  const [companyInfo, setCompanyInfo] = useState({
    companyName: '바로가먼트',
    businessNumber: '123-45-67890',
    representative: '김철수',
    industry: '의류 제조 및 판매',
    address: '서울시 강남구 테헤란로 123',
    phone: '02-1234-5678',
    email: 'info@barogarmement.com',
  });

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ ...companyInfo });

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
    setCompanyInfo({ ...editData });
    setEditMode(false);
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
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Typography component="h1" variant="h4">
            법인 관리
          </Typography>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={handleEditOpen}
          >
            수정
          </Button>
        </Box>
      }
    >
      <Paper sx={{ width: '100%', p: 3 }}>
        <InfoRow label="회사명" value={companyInfo.companyName} />
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
                name="companyName"
                value={editData.companyName}
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
              <TextField
                fullWidth
                label="업종"
                name="industry"
                value={editData.industry}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="주소"
                name="address"
                value={editData.address}
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
                label="이메일"
                name="email"
                type="email"
                value={editData.email}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose} startIcon={<CancelIcon />}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={<SaveIcon />}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default Company;
