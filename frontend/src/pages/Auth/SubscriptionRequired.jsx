import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getOrganizationSubscriptionStatusDescription, getOrganizationSubscriptionStatusLabel } from '../../constants/organizationAccess';

const TEXT = {
  ko: { organization: '소속 조직', title: '접근 제한', askAdmin: '시스템 관리자에게 문의하세요.', status: '{org}의 현재 구독 상태는 {status}입니다.', lastEnd: '최근 활성 종료일', contact: '시스템 관리자 연락처', retry: '다시 확인', logout: '로그아웃', locale: 'ko-KR' },
  en: { organization: 'Your organization', title: 'Access Restricted', askAdmin: 'Please contact your system administrator.', status: 'The current subscription status for {org} is {status}.', lastEnd: 'Most recent active end date', contact: 'System administrator contact', retry: 'Check again', logout: 'Logout', locale: 'en-US' },
  vi: { organization: 'Tổ chức của bạn', title: 'Hạn chế truy cập', askAdmin: 'Vui lòng liên hệ quản trị viên hệ thống.', status: 'Trạng thái đăng ký hiện tại của {org} là {status}.', lastEnd: 'Ngày kết thúc hoạt động gần nhất', contact: 'Liên hệ quản trị viên hệ thống', retry: 'Kiểm tra lại', logout: 'Đăng xuất', locale: 'vi-VN' },
};

const SubscriptionRequired = () => {
  const navigate = useNavigate();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.ko;
  const { activeProfile, signOut, hasWorkspaceAccess, requiresOnboarding } = useAuth();

  React.useEffect(() => {
    if (hasWorkspaceAccess) { navigate('/workspace', { replace: true }); return; }
    if (requiresOnboarding) navigate('/onboarding', { replace: true });
  }, [hasWorkspaceAccess, navigate, requiresOnboarding]);

  const orgName = activeProfile?.orgName || text.organization;
  const subscriptionStatus = activeProfile?.subscriptionStatus || '';
  const statusLabel = getOrganizationSubscriptionStatusLabel(subscriptionStatus, '-', languageCode);
  const contactEmail = activeProfile?.systemAdminContactEmail || '';
  const activeEndsAt = activeProfile?.subscription?.activeEndsAt || null;
  const statusText = text.status.replace('{org}', orgName).replace('{status}', statusLabel);

  return (
    <Container component="main" maxWidth="sm"><Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', py: 6 }}><Paper variant="outlined" sx={{ width: '100%', p: 4 }}><Stack spacing={2}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>{text.title}</Typography>
      <Typography variant="body1">{text.askAdmin}</Typography>
      <Typography variant="body2" color="text.secondary">{statusText}</Typography>
      <Typography variant="body2" color="text.secondary">{getOrganizationSubscriptionStatusDescription(subscriptionStatus, '', languageCode)}</Typography>
      {activeEndsAt ? <Typography variant="body2" color="text.secondary">{text.lastEnd}: {new Date(activeEndsAt).toLocaleDateString(text.locale)}</Typography> : null}
      <Box sx={{ pt: 1 }}><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{text.contact}</Typography><Typography variant="body2" color="text.secondary">{contactEmail || '-'}</Typography></Box>
      <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}><Button variant="contained" onClick={() => window.location.reload()}>{text.retry}</Button><Button variant="outlined" onClick={signOut}>{text.logout}</Button></Stack>
    </Stack></Paper></Box></Container>
  );
};

export default SubscriptionRequired;
