import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { requestJSON } from '../../../utils/apiClient';
import { getOrganizationTypeLabel } from '../../../constants/organizationType';

const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: 'NOT_SUBSCRIBED', label: 'Not Subscribed' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'GRACE', label: 'Grace' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const toDateTimeText = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
};

const OnboardingBoard = () => {
  const { showNotification } = useApp();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState('');
  const [pendingCompanyRequests, setPendingCompanyRequests] = useState([]);
  const [companySubscriptionStatuses, setCompanySubscriptionStatuses] = useState({});

  const fetchRequests = async ({ isRefresh = false } = {}) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await requestJSON('/system/onboarding-requests');
      const companyRows = Array.isArray(data?.pendingCompanyRequests)
        ? data.pendingCompanyRequests
        : [];
      setPendingCompanyRequests(companyRows);
      setCompanySubscriptionStatuses((prev) => {
        const next = { ...prev };
        companyRows.forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = 'NOT_SUBSCRIBED';
          }
        });
        return next;
      });
    } catch (error) {
      showNotification(error?.message || '요청 목록 조회 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleCompanySubscriptionChange = (requestId, value) => {
    setCompanySubscriptionStatuses((prev) => ({
      ...prev,
      [requestId]: value,
    }));
  };

  const handleApproveCompany = async (requestRow) => {
    if (!requestRow?.id) return;
    const key = `company-approve-${requestRow.id}`;
    setProcessingKey(key);
    try {
      await requestJSON(`/system/company-requests/${requestRow.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionStatus:
            companySubscriptionStatuses[requestRow.id] || 'NOT_SUBSCRIBED',
        }),
      });
      showNotification('신규 회사 등록 요청을 승인했습니다.', 'success');
      await fetchRequests({ isRefresh: true });
    } catch (error) {
      showNotification(error?.message || '승인 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setProcessingKey('');
    }
  };

  const handleRejectCompany = async (requestRow) => {
    if (!requestRow?.id) return;
    const key = `company-reject-${requestRow.id}`;
    setProcessingKey(key);
    try {
      await requestJSON(`/system/company-requests/${requestRow.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      showNotification('신규 회사 등록 요청을 거절했습니다.', 'success');
      await fetchRequests({ isRefresh: true });
    } catch (error) {
      showNotification(error?.message || '거절 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setProcessingKey('');
    }
  };

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            신규 가입 요청
          </Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary' }}>
            신규 회사 등록 요청을 승인합니다.
          </Typography>
        </>
      }
    >
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Typography variant="h6">신규 회사 등록 요청</Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => fetchRequests({ isRefresh: true })}
                disabled={loading || refreshing}
                startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : null}
              >
                새로고침
              </Button>
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>요청일</TableCell>
                    <TableCell>요청자 이메일</TableCell>
                    <TableCell>회사명</TableCell>
                    <TableCell>업종</TableCell>
                    <TableCell>국가</TableCell>
                    <TableCell>회사 주소</TableCell>
                    <TableCell>사업자등록번호</TableCell>
                    <TableCell>대표 연락처</TableCell>
                    <TableCell>대표 이메일</TableCell>
                    <TableCell>구독 상태</TableCell>
                    <TableCell align="right">처리</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingCompanyRequests.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{toDateTimeText(row.createdAt)}</TableCell>
                      <TableCell>{row.requesterEmail}</TableCell>
                      <TableCell>{row.organizationNameEn}</TableCell>
                      <TableCell>{getOrganizationTypeLabel(row.organizationType)}</TableCell>
                      <TableCell>{row.country === 'VN' ? '베트남' : '한국'}</TableCell>
                      <TableCell>{row.companyAddress || '-'}</TableCell>
                      <TableCell>{row.businessNumber}</TableCell>
                      <TableCell>{row.contactPhone || '-'}</TableCell>
                      <TableCell>{row.contactEmail || '-'}</TableCell>
                      <TableCell sx={{ minWidth: 170 }}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          value={companySubscriptionStatuses[row.id] || 'NOT_SUBSCRIBED'}
                          onChange={(event) =>
                            handleCompanySubscriptionChange(row.id, event.target.value)
                          }
                          disabled={processingKey !== ''}
                        >
                          {SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'inline-flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => handleApproveCompany(row)}
                            disabled={processingKey !== ''}
                          >
                            {processingKey === `company-approve-${row.id}` ? '처리 중...' : '승인'}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRejectCompany(row)}
                            disabled={processingKey !== ''}
                          >
                            {processingKey === `company-reject-${row.id}` ? '처리 중...' : '거절'}
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingCompanyRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        대기 중인 신규 회사 등록 요청이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>
    </AppPageContainer>
  );
};

export default OnboardingBoard;
