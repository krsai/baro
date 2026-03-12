import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import {
  getOrganizationSubscriptionStatusDescription,
  getOrganizationSubscriptionStatusLabel,
} from '../../constants/organizationAccess';

const SubscriptionRequired = () => {
  const navigate = useNavigate();
  const { activeProfile, signOut, hasWorkspaceAccess, requiresOnboarding } = useAuth();

  React.useEffect(() => {
    if (hasWorkspaceAccess) {
      navigate('/workspace', { replace: true });
      return;
    }
    if (requiresOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [hasWorkspaceAccess, navigate, requiresOnboarding]);

  const orgName = activeProfile?.orgName || '소속 조직';
  const subscriptionStatus = activeProfile?.subscriptionStatus || '';
  const contactEmail = activeProfile?.systemAdminContactEmail || '';
  const activeEndsAt = activeProfile?.subscription?.activeEndsAt || null;

  return (
    <Container component="main" maxWidth="sm">
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', py: 6 }}>
        <Paper variant="outlined" sx={{ width: '100%', p: 4 }}>
          <Stack spacing={2}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              접근 제한
            </Typography>
            <Typography variant="body1">
              시스템 관리자에게 문의하세요.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {orgName}의 현재 구독 상태는 {getOrganizationSubscriptionStatusLabel(subscriptionStatus, '-')}입니다.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {getOrganizationSubscriptionStatusDescription(subscriptionStatus)}
            </Typography>
            {activeEndsAt ? (
              <Typography variant="body2" color="text.secondary">
                최근 활성 종료일: {new Date(activeEndsAt).toLocaleDateString('ko-KR')}
              </Typography>
            ) : null}
            <Box sx={{ pt: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                시스템 관리자 연락처
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {contactEmail || '-'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
              <Button variant="contained" onClick={() => window.location.reload()}>
                다시 확인
              </Button>
              <Button variant="outlined" onClick={signOut}>
                로그아웃
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
};

export default SubscriptionRequired;
