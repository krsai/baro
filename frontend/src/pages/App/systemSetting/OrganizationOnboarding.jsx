import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  MenuItem,
  Button,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';

const ORG_TYPES = [
  { value: 'MANUFACTURER', label: '봉제 공장' },
  { value: 'BRAND', label: '고객사(브랜드)' },
  { value: 'BOTH', label: '복합(공장 + 고객사)' },
];

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: '관리자' },
  { value: 'OPERATOR', label: '운영자' },
  { value: 'ACCOUNTANT', label: '회계' },
  { value: 'WORKER', label: '작업자' },
];

const OrganizationOnboarding = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification } = useApp();

  const [organizations, setOrganizations] = useState([]);
  const [members, setMembers] = useState([]);
  const [orgForm, setOrgForm] = useState({
    name: '',
    type: 'MANUFACTURER',
    email: '',
    representative: '',
    address: '',
    phone: '',
  });
  const [assignForm, setAssignForm] = useState({
    orgId: '',
    email: '',
    role: 'OPERATOR',
  });

  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const response = await fetch(`${API_BASE}/organizations`);
      const data = await response.json();
      if (response.ok) {
        setOrganizations(data);
        if (!assignForm.orgId && data.length > 0) {
          setAssignForm((prev) => ({ ...prev, orgId: String(data[0].id) }));
        }
      }
    } catch (_error) {
      // ignore fetch errors in UI for now
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchMembers = async (orgId) => {
    if (!orgId) return;
    try {
      const response = await fetch(`${API_BASE}/organization-users?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        setMembers(data);
      }
    } catch (_error) {
      // ignore fetch errors in UI for now
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [API_BASE]);

  useEffect(() => {
    if (assignForm.orgId) {
      fetchMembers(assignForm.orgId);
    }
  }, [assignForm.orgId]);

  const handleOrgChange = (e) => {
    const { name, value } = e.target;
    setOrgForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssignChange = (e) => {
    const { name, value } = e.target;
    setAssignForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateOrganization = async () => {
    if (savingOrg) return;
    const name = orgForm.name.trim();
    if (!name) {
      showNotification('조직명을 입력해주세요.', 'error');
      return;
    }

    setSavingOrg(true);
    try {
      const payload = {
        name,
        type: orgForm.type,
        email: orgForm.email.trim(),
        representative: orgForm.representative.trim(),
        address: orgForm.address.trim(),
        phone: orgForm.phone.trim(),
      };
      const response = await fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || '조직 등록 실패', 'error');
        return;
      }

      setOrganizations((prev) => [...prev, data]);
      setAssignForm((prev) => ({ ...prev, orgId: String(data.id) }));
      setOrgForm((prev) => ({
        ...prev,
        name: '',
        email: '',
        representative: '',
        address: '',
        phone: '',
      }));
      showNotification('조직이 등록되었습니다.', 'success');
    } catch (_error) {
      showNotification('조직 등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleAssignOperator = async () => {
    if (assigning) return;
    if (!assignForm.orgId) {
      showNotification('조직을 선택해주세요.', 'error');
      return;
    }
    const email = assignForm.email.trim();
    if (!email) {
      showNotification('운영자 이메일을 입력해주세요.', 'error');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`${API_BASE}/organization-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: Number(assignForm.orgId),
          email,
          role: assignForm.role,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || '운영자 배정 실패', 'error');
        return;
      }

      setAssignForm((prev) => ({ ...prev, email: '' }));
      await fetchMembers(assignForm.orgId);
      showNotification('운영자 배정이 완료되었습니다.', 'success');
    } catch (_error) {
      showNotification('운영자 배정 중 오류가 발생했습니다.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            조직 등록 / 운영자 배정
          </Typography>
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            시스템 운영자가 조직을 먼저 등록한 뒤, 가입한 사용자의 이메일을 운영자로 배정합니다.
          </Typography>
        </>
      }
    >
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              1) 조직 등록
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="조직명"
                  name="name"
                  value={orgForm.name}
                  onChange={handleOrgChange}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="조직 유형"
                  name="type"
                  value={orgForm.type}
                  onChange={handleOrgChange}
                >
                  {ORG_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="대표 이메일(선택)"
                  name="email"
                  value={orgForm.email}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="대표자명(선택)"
                  name="representative"
                  value={orgForm.representative}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="주소(선택)"
                  name="address"
                  value={orgForm.address}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="연락처(선택)"
                  name="phone"
                  value={orgForm.phone}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleCreateOrganization}
                  disabled={savingOrg}
                  startIcon={savingOrg ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {savingOrg ? '등록 중' : '조직 등록'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              2) 운영자 배정
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="조직 선택"
                  name="orgId"
                  value={assignForm.orgId}
                  onChange={handleAssignChange}
                  disabled={loadingOrgs || organizations.length === 0}
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={String(org.id)}>
                      {org.name} ({org.type})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="운영자 이메일"
                  name="email"
                  value={assignForm.email}
                  onChange={handleAssignChange}
                  placeholder="example@domain.com"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="역할"
                  name="role"
                  value={assignForm.role}
                  onChange={handleAssignChange}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleAssignOperator}
                  disabled={assigning || organizations.length === 0}
                  startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {assigning ? '배정 중' : '운영자 배정'}
                </Button>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                현재 배정된 운영자
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>이메일</TableCell>
                    <TableCell>역할</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.role}</TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        배정된 운영자가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Grid>
      </Grid>

    </AppPageContainer>
  );
};

export default OrganizationOnboarding;
