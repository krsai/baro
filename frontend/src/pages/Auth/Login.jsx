import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Container, Button, Typography, Box, Link, CircularProgress, Stack } from '@mui/material';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';

const Login = () => {
  const navigate = useNavigate();
  const { signInWithGoogle, isAuthenticated, loading, isSupabaseConfigured, enableDevBypass } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadOrganizations = async () => {
      try {
        const data = await requestJSON('/organizations').catch(() => []);
        if (cancelled) return;
        setOrganizations(Array.isArray(data) ? data : []);
      } catch (_error) {
        if (!cancelled) setOrganizations([]);
      }
    };

    loadOrganizations();
    return () => {
      cancelled = true;
    };
  }, []);

  const manufacturerOrg = useMemo(
    () => organizations.find((org) => org?.type === 'MANUFACTURER') ?? null,
    [organizations]
  );
  const brandOrg = useMemo(
    () => organizations.find((org) => org?.type === 'BRAND') ?? null,
    [organizations]
  );

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await signInWithGoogle();
    setIsSubmitting(false);
  };

  const handleDevBypass = (profile) => {
    enableDevBypass(profile);
    navigate('/');
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          로그인
        </Typography>
        <Box sx={{ mt: 3, width: '100%' }}>
          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 1, mb: 2, backgroundColor: '#4285F4', '&:hover': { backgroundColor: '#357ae8' } }}
            startIcon={isSubmitting || loading ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={handleGoogleLogin}
            disabled={isSubmitting || loading || !isSupabaseConfigured}
          >
            {isSubmitting || loading ? '로그인 중...' : 'Google 계정으로 로그인'}
          </Button>

          <Stack spacing={1.2} sx={{ mb: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={() =>
                handleDevBypass({
                  key: 'SYSTEM_ADMIN',
                  label: '시스템 관리자',
                  entryType: 'SYSTEM',
                  systemRole: 'SYSTEM_ADMIN',
                  orgType: null,
                  orgRole: null,
                  orgId: null,
                  orgName: null,
                })
              }
            >
              개발 우회: 시스템 관리자
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() =>
                handleDevBypass({
                  key: 'MANUFACTURER_ADMIN',
                  label: '제조사 Admin',
                  entryType: 'ORG',
                  systemRole: 'USER',
                  orgType: 'MANUFACTURER',
                  orgRole: 'ADMIN',
                  orgId: manufacturerOrg?.id ?? null,
                  orgName: manufacturerOrg?.name ?? null,
                })
              }
            >
              {`개발 우회: 제조사 Admin${manufacturerOrg?.name ? ` (${manufacturerOrg.name})` : ''}`}
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() =>
                handleDevBypass({
                  key: 'BRAND_ADMIN',
                  label: '브랜드 Admin',
                  entryType: 'ORG',
                  systemRole: 'USER',
                  orgType: 'BRAND',
                  orgRole: 'ADMIN',
                  orgId: brandOrg?.id ?? null,
                  orgName: brandOrg?.name ?? null,
                })
              }
            >
              {`개발 우회: 브랜드 Admin${brandOrg?.name ? ` (${brandOrg.name})` : ''}`}
            </Button>
          </Stack>

          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 넣고 다시 실행해 주세요.
            </Typography>
          )}
          <Link component={RouterLink} to="/signup" variant="body2">
            계정이 없으신가요? 테스트 계정으로 시작하기
          </Link>
        </Box>
      </Box>
      <Copyright sx={{ mt: 8, mb: 4 }} />
    </Container>
  );
};

export default Login;
