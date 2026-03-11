import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { requestJSON } from '../../../utils/apiClient';
import { getOrganizationTypeLabel } from '../../../constants/organizationType';
import {
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS,
  ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS,
} from '../../../constants/organizationAccess';

const toDateOnlyText = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR');
};

const toDateTimeText = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
};

const toCountryLabel = (countryCode) => {
  if (countryCode === 'VN') return '베트남';
  if (countryCode === 'KR') return '한국';
  return '-';
};

const toDisplayText = (value) => {
  const text = String(value ?? '').trim();
  return text || '-';
};

const OnboardingBoard = () => {
  const { showNotification } = useApp();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState('');
  const [pendingCompanyRequests, setPendingCompanyRequests] = useState([]);
  const [companySubscriptionStatuses, setCompanySubscriptionStatuses] = useState({});
  const [contextMenuState, setContextMenuState] = useState(null);
  const [detailRequestId, setDetailRequestId] = useState(null);

  const detailRow = useMemo(() => {
    if (!detailRequestId) return null;
    return pendingCompanyRequests.find((row) => Number(row.id) === Number(detailRequestId)) || null;
  }, [detailRequestId, pendingCompanyRequests]);

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
            next[row.id] = ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED;
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

  useEffect(() => {
    if (!detailRequestId) return;
    if (detailRow) return;
    setDetailRequestId(null);
  }, [detailRequestId, detailRow]);

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
            companySubscriptionStatuses[requestRow.id] ||
            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
        }),
      });
      showNotification('가입 요청을 승인했습니다.', 'success');
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
      showNotification('가입 요청을 거절했습니다.', 'success');
      await fetchRequests({ isRefresh: true });
    } catch (error) {
      showNotification(error?.message || '거절 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setProcessingKey('');
    }
  };

  const handleRowContextMenu = (event, row) => {
    event.preventDefault();
    setContextMenuState({
      requestId: row.id,
      mouseX: event.clientX,
      mouseY: event.clientY,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenuState(null);
  };

  const handleOpenDetailFromContextMenu = () => {
    if (!contextMenuState?.requestId) return;
    setDetailRequestId(contextMenuState.requestId);
    setContextMenuState(null);
  };

  const handleCloseDetailDrawer = () => {
    setDetailRequestId(null);
  };

  const detailItems = useMemo(() => {
    if (!detailRow) return [];
    return [
      { label: '요청 ID', value: detailRow.id },
      { label: '상태', value: detailRow.status },
      { label: '요청일시', value: toDateTimeText(detailRow.createdAt) },
      { label: '요청자 이메일', value: detailRow.requesterEmail },
      { label: '업종', value: getOrganizationTypeLabel(detailRow.organizationType) },
      { label: '국가', value: toCountryLabel(detailRow.country) },
      { label: '회사명', value: detailRow.organizationNameEn },
      { label: '회사 주소', value: detailRow.companyAddress },
      { label: '사업자등록번호', value: detailRow.businessNumber },
      { label: '담당자 이름', value: detailRow.contactName },
      { label: '대표 연락처', value: detailRow.contactPhone },
      { label: '대표 이메일', value: detailRow.contactEmail },
      { label: '승인 조직 ID', value: detailRow.organizationId },
      { label: '승인자', value: detailRow.approvedBy },
      { label: '승인일시', value: toDateTimeText(detailRow.approvedAt) },
      { label: '거절자', value: detailRow.rejectedBy },
      { label: '거절일시', value: toDateTimeText(detailRow.rejectedAt) },
      { label: '거절 사유', value: detailRow.rejectionReason },
    ];
  }, [detailRow]);

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            가입 승인
          </Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary' }}>
            가입 요청을 검토하고 승인 또는 거절할 수 있습니다.
          </Typography>
        </>
      }
    >
      <Box sx={{ width: '100%' }}>
        <Paper variant="outlined" sx={{ p: 3, width: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Typography variant="h6">가입 요청 목록</Typography>
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
              <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                <Table size="small" sx={{ width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell>요청일</TableCell>
                    <TableCell>업종</TableCell>
                    <TableCell>회사명</TableCell>
                    <TableCell>이름</TableCell>
                    <TableCell>대표 연락처</TableCell>
                    <TableCell>구독 상태</TableCell>
                    <TableCell align="right">처리</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingCompanyRequests.map((row) => (
                    <TableRow key={row.id} onContextMenu={(event) => handleRowContextMenu(event, row)}>
                      <TableCell>{toDateOnlyText(row.createdAt)}</TableCell>
                      <TableCell>{getOrganizationTypeLabel(row.organizationType)}</TableCell>
                      <TableCell>{toDisplayText(row.organizationNameEn)}</TableCell>
                      <TableCell>{toDisplayText(row.contactName)}</TableCell>
                      <TableCell>{toDisplayText(row.contactPhone)}</TableCell>
                      <TableCell sx={{ minWidth: 170 }}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          value={
                            companySubscriptionStatuses[row.id] ||
                            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
                          }
                          onChange={(event) =>
                            handleCompanySubscriptionChange(row.id, event.target.value)
                          }
                          disabled={processingKey !== ''}
                        >
                          {ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
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
                      <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        대기 중인 가입 요청이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                </Table>
              </TableContainer>
            )}
        </Paper>
      </Box>

      <Menu
        open={Boolean(contextMenuState)}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuState
            ? { top: contextMenuState.mouseY, left: contextMenuState.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleOpenDetailFromContextMenu}>상세보기</MenuItem>
      </Menu>

      <Drawer
        anchor="right"
        open={Boolean(detailRow)}
        onClose={handleCloseDetailDrawer}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 460 },
            p: 2.5,
            overflowY: 'auto',
          },
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">가입 요청 상세</Typography>
            <IconButton onClick={handleCloseDetailDrawer} aria-label="닫기">
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Divider />
          {detailItems.map((item) => (
            <Box key={item.label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
              <Typography variant="caption" color="text.secondary">
                {item.label}
              </Typography>
              <Typography variant="body2">{toDisplayText(item.value)}</Typography>
            </Box>
          ))}
        </Stack>
      </Drawer>
    </AppPageContainer>
  );
};

export default OnboardingBoard;
