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
import PageToolbar from '../../../components/PageToolbar';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../constants/layout';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON } from '../../../utils/apiClient';
import { getOrganizationTypeLabel } from '../../../constants/organizationType';
import {
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS,
  ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS,
  getOrganizationSubscriptionStatusDescription,
} from '../../../constants/organizationAccess';

const LOCALES = { ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' };
const TEXT = {
  ko: { title:'가입 승인', refresh:'새로고침', list:'가입 요청 목록', requestDate:'요청일', industry:'업종', company:'회사명', name:'이름', phone:'대표 연락처', subscription:'구독 상태', action:'처리', activeEnd:'활성 종료일, 비우면 무기한', processing:'처리 중...', approve:'승인', reject:'거절', empty:'대기 중인 가입 요청이 없습니다.', detailView:'상세보기', detail:'가입 요청 상세', close:'닫기', loadError:'요청 목록 조회 중 오류가 발생했습니다.', approved:'가입 요청을 승인했습니다.', approveError:'승인 처리 중 오류가 발생했습니다.', rejected:'가입 요청을 거절했습니다.', rejectError:'거절 처리 중 오류가 발생했습니다.', vietnam:'베트남', korea:'한국' },
  en: { title:'Onboarding Approval', refresh:'Refresh', list:'Registration Requests', requestDate:'Requested', industry:'Industry', company:'Company', name:'Name', phone:'Main Contact', subscription:'Subscription Status', action:'Action', activeEnd:'Active end date; leave blank for unlimited', processing:'Processing...', approve:'Approve', reject:'Reject', empty:'There are no pending registration requests.', detailView:'View details', detail:'Registration Request Details', close:'Close', loadError:'Failed to load registration requests.', approved:'Registration request approved.', approveError:'Failed to approve the request.', rejected:'Registration request rejected.', rejectError:'Failed to reject the request.', vietnam:'Vietnam', korea:'South Korea' },
  vi: { title:'Duyệt đăng ký', refresh:'Làm mới', list:'Danh sách yêu cầu đăng ký', requestDate:'Ngày yêu cầu', industry:'Ngành nghề', company:'Công ty', name:'Tên', phone:'Liên hệ chính', subscription:'Trạng thái đăng ký', action:'Xử lý', activeEnd:'Ngày kết thúc hoạt động; để trống nếu không giới hạn', processing:'Đang xử lý...', approve:'Phê duyệt', reject:'Từ chối', empty:'Không có yêu cầu đăng ký đang chờ.', detailView:'Xem chi tiết', detail:'Chi tiết yêu cầu đăng ký', close:'Đóng', loadError:'Không thể tải danh sách yêu cầu.', approved:'Đã phê duyệt yêu cầu đăng ký.', approveError:'Không thể phê duyệt yêu cầu.', rejected:'Đã từ chối yêu cầu đăng ký.', rejectError:'Không thể từ chối yêu cầu.', vietnam:'Việt Nam', korea:'Hàn Quốc' },
};

const toDateOnlyText = (value, locale) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(locale);
};

const toDateTimeText = (value, locale) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(locale);
};

const toCountryLabel = (countryCode, text) => {
  if (countryCode === 'VN') return text.vietnam;
  if (countryCode === 'KR') return text.korea;
  return '-';
};

const toDisplayText = (value) => {
  const text = String(value ?? '').trim();
  return text || '-';
};

const OnboardingBoard = () => {
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.ko;
  const locale = LOCALES[languageCode] || LOCALES.ko;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState('');
  const [pendingCompanyRequests, setPendingCompanyRequests] = useState([]);
  const [companySubscriptionStatuses, setCompanySubscriptionStatuses] = useState({});
  const [companyActiveEndDates, setCompanyActiveEndDates] = useState({});
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
            next[row.id] = ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL;
          }
        });
        return next;
      });
    } catch (error) {
      showNotification(error?.message || text.loadError, 'error');
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

  const handleCompanyActiveEndDateChange = (requestId, value) => {
    setCompanyActiveEndDates((prev) => ({
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
            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL,
          activeEndsAt:
            (companySubscriptionStatuses[requestRow.id] || '') ===
            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
              ? companyActiveEndDates[requestRow.id] || null
              : null,
        }),
      });
      showNotification(text.approved, 'success');
      await fetchRequests({ isRefresh: true });
    } catch (error) {
      showNotification(error?.message || text.approveError, 'error');
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
      showNotification(text.rejected, 'success');
      await fetchRequests({ isRefresh: true });
    } catch (error) {
      showNotification(error?.message || text.rejectError, 'error');
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
      title={text.title}
      toolbar={(
        <PageToolbar
          right={(
            <Button
              variant="outlined"
              size="small"
              onClick={() => fetchRequests({ isRefresh: true })}
              disabled={loading || refreshing}
              startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : null}
            >
              {text.refresh}
            </Button>
          )}
        />
      )}
    >
      <Box sx={{ width: '100%' }}>
        <Paper variant="outlined" sx={{ p: 3, width: '100%', borderRadius: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Typography variant="h6">{text.list}</Typography>
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
                    <TableCell>{text.requestDate}</TableCell><TableCell>{text.industry}</TableCell><TableCell>{text.company}</TableCell><TableCell>{text.name}</TableCell><TableCell>{text.phone}</TableCell><TableCell>{text.subscription}</TableCell><TableCell align="right">{text.action}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingCompanyRequests.map((row) => (
                    <TableRow key={row.id} onContextMenu={(event) => handleRowContextMenu(event, row)}>
                      <TableCell>{toDateOnlyText(row.createdAt, locale)}</TableCell>
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
                            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
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
                        {(
                          companySubscriptionStatuses[row.id] ||
                          ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
                        ) === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE ? (
                          <TextField
                            fullWidth
                            size="small"
                            type="date"
                            value={companyActiveEndDates[row.id] || ''}
                            onChange={(event) =>
                              handleCompanyActiveEndDateChange(row.id, event.target.value)
                            }
                            disabled={processingKey !== ''}
                            sx={{ mt: 1 }}
                            helperText={text.activeEnd}
                            InputLabelProps={{ shrink: true }}
                          />
                        ) : null}
                        <Typography variant="caption" color="text.secondary">
                          {getOrganizationSubscriptionStatusDescription(
                            companySubscriptionStatuses[row.id] ||
                              ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'inline-flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => handleApproveCompany(row)}
                            disabled={processingKey !== ''}
                          >
                            {processingKey === `company-approve-${row.id}` ? text.processing : text.approve}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRejectCompany(row)}
                            disabled={processingKey !== ''}
                          >
                            {processingKey === `company-reject-${row.id}` ? text.processing : text.reject}
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingCompanyRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        {text.empty}
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
        <MenuItem onClick={handleOpenDetailFromContextMenu}>{text.detailView}</MenuItem>
      </Menu>

      <Drawer
        anchor="right"
        open={Boolean(detailRow)}
        onClose={handleCloseDetailDrawer}
        PaperProps={{
          sx: {
            ...TOP_OFFSET_DRAWER_PAPER_SX,
            width: { xs: '100%', sm: 460 },
            p: 2.5,
            overflowY: 'auto',
          },
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">{text.detail}</Typography>
            <IconButton onClick={handleCloseDetailDrawer} aria-label={text.close}>
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
