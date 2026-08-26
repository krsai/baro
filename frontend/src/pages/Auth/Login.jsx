import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Typography,
} from '@mui/material';
import Copyright from '../../components/Copyright';
import AppVersionLabel from '../../components/AppVersionLabel';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { canAccessPath, resolveFirstAccessiblePath } from '../../utils/accessControl';
import { readPersonalPreferences } from '../../utils/personalPreferences';

const LOGIN_COPY_BY_LANGUAGE = {
  ko: {
    loginLoading: '로그인 중...',
    loginWithGoogle: 'Google 계정으로 로그인',
    authContextError: '로그인 후 사용자 접근 정보를 불러오지 못했습니다.',
    restartSession: '세션 다시 시작',
    supabaseRequired:
      'Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 추가한 뒤 다시 실행해 주세요.',
  },
  en: {
    loginLoading: 'Signing in...',
    loginWithGoogle: 'Continue with Google',
    authContextError: 'We could not load your account access context after sign-in.',
    restartSession: 'Restart session',
    supabaseRequired:
      'Supabase configuration is required. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env` and restart.',
  },
  vi: {
    loginLoading: 'Đang đăng nhập...',
    loginWithGoogle: 'Đăng nhập bằng Google',
    authContextError: 'Không thể tai thong tin truy cap tai khoan sau khi dang nhap.',
    restartSession: 'Bat dau lai phien',
    supabaseRequired:
      'Cần cấu hình Supabase. Thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` vào `.env` rồi khởi động lại.',
  },
};

const getLoginCopy = (languageCode) => LOGIN_COPY_BY_LANGUAGE[languageCode] || LOGIN_COPY_BY_LANGUAGE.ko;

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { languageCode, setLanguageCode } = useLanguage();
  const {
    signInWithGoogle,
    isAuthenticated,
    hasWorkspaceAccess,
    requiresOnboarding,
    requiresSubscriptionContact,
    loading,
    isSupabaseConfigured,
    accessProfile,
    accessError,
    signOut,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigatingAfterAuth, setIsNavigatingAfterAuth] = useState(false);
  const hasOAuthCallbackParams = useMemo(() => {
    const searchParams = new URLSearchParams(location.search || '');
    const hasSearchCallbackParam =
      searchParams.has('code') ||
      searchParams.has('state') ||
      searchParams.has('error') ||
      searchParams.has('error_code') ||
      searchParams.has('error_description');
    const hasHashToken =
      typeof location.hash === 'string' && location.hash.includes('access_token');
    return hasSearchCallbackParam || hasHashToken;
  }, [location.hash, location.search]);
  const [isOAuthReturnPending, setIsOAuthReturnPending] = useState(
    () => hasOAuthCallbackParams
  );

  const loginCopy = getLoginCopy(languageCode);
  const postAuthPath = useMemo(
    () => {
      const authState = {
        isAuthenticated,
        devBypass: false,
        devProfile: null,
        accessProfile,
      };
      if (
        readPersonalPreferences(accessProfile, null).openDashboardOnLogin &&
        canAccessPath('/dashboard', authState)
      ) {
        return '/dashboard';
      }
      return resolveFirstAccessiblePath(authState);
    },
    [accessProfile, isAuthenticated]
  );

  useEffect(() => {
    if (!hasOAuthCallbackParams) return;
    setIsOAuthReturnPending(true);
  }, [hasOAuthCallbackParams]);

  useEffect(() => {
    if (!isOAuthReturnPending) return;
    if (loading) return;
    if (isAuthenticated) return;
    setIsOAuthReturnPending(false);
  }, [isAuthenticated, isOAuthReturnPending, loading]);

  useEffect(() => {
    if (!isAuthenticated || loading) return;
    if (accessError) {
      setIsNavigatingAfterAuth(false);
      return;
    }
    setIsNavigatingAfterAuth(true);
    if (hasWorkspaceAccess) {
      navigate(postAuthPath, { replace: true });
      return;
    }
    if (requiresSubscriptionContact) {
      navigate('/subscription-required', { replace: true });
      return;
    }
    if (requiresOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    hasWorkspaceAccess,
    isAuthenticated,
    loading,
    navigate,
    postAuthPath,
    requiresOnboarding,
    requiresSubscriptionContact,
    accessError,
  ]);

  useEffect(() => {
    if (isAuthenticated) return;
    setIsNavigatingAfterAuth(false);
  }, [isAuthenticated]);

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartSession = async () => {
    await signOut();
    setIsNavigatingAfterAuth(false);
    setIsSubmitting(false);
  };

  const isLoginLocked =
    isSubmitting ||
    loading ||
    isOAuthReturnPending ||
    isNavigatingAfterAuth;

  return (
    <Container component="main" maxWidth="xs" sx={{ pb: 12 }}>
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <LanguageSwitcher languageCode={languageCode} onChange={setLanguageCode} />
      </Box>

      <Box
        sx={{
          mt: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography
          component="h1"
          variant="h4"
          sx={{ mt: { xs: 6, sm: 7 }, fontWeight: 700, letterSpacing: 1.2 }}
        >
          LINEOS
        </Typography>

        <Box sx={{ mt: 3, width: '100%' }}>
          <Button
            fullWidth
            variant="contained"
            sx={{
              mt: 1,
              mb: 2,
              backgroundColor: '#4285F4',
              '&:hover': { backgroundColor: '#357ae8' },
            }}
            startIcon={isLoginLocked ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={handleGoogleLogin}
            disabled={isLoginLocked || !isSupabaseConfigured}
          >
            {isLoginLocked ? loginCopy.loginLoading : loginCopy.loginWithGoogle}
          </Button>

          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {loginCopy.supabaseRequired}
            </Typography>
          )}

          {isAuthenticated && accessError && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="body2" color="error">
                {loginCopy.authContextError}
              </Typography>
              <Button
                size="small"
                onClick={handleRestartSession}
                sx={{ mt: 1, px: 0, textTransform: 'none' }}
              >
                {loginCopy.restartSession}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      <Copyright sx={{ mt: 8, mb: 4 }} />
      <AppVersionLabel sx={{ display: 'block', mb: 2 }} />
    </Container>
  );
};

export default Login;
