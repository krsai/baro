import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Fab,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Copyright from '../../components/Copyright';
import AppVersionLabel from '../../components/AppVersionLabel';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { resolveFirstAccessiblePath } from '../../utils/accessControl';
import {
  getOrganizationTypeLabel,
  normalizeOrganizationType,
  ORGANIZATION_TYPE_KEYS,
} from '../../constants/organizationType';
const TEST_PANEL_PASSWORD = '0031';

const TEST_ACCOUNT_EMAIL_SUFFIXES = ['@test.local', '@baro.local'];

const LOGIN_COPY_BY_LANGUAGE = {
  ko: {
    languageLabel: '언어',
    loginLoading: '로그인 중...',
    loginWithGoogle: 'Google 계정으로 로그인',
    testPanelTrigger: '테스트 계정',
    testPanelTitle: '테스트 계정',
    testPanelSubtitle: '개발용 로그인 우회 계정 묶음',
    testPanelHelper: '비밀번호를 입력하면 테스트 계정 목록이 열립니다.',
    testPanelPasswordLabel: '비밀번호',
    testPanelPasswordPlaceholder: '4자리 숫자',
    testPanelUnlock: '열기',
    close: '닫기',
    testPanelPasswordError: '비밀번호가 올바르지 않습니다.',
    testPanelLoading: 'DB 테스트 계정 확인 중...',
    testPanelLoadedHint: 'DB에 등록된 @test.local / @baro.local 계정만 표시합니다.',
    testPanelEmpty: 'DB에 활성 테스트 계정이 없습니다.',
    manufacturerProfiles: '관리자/운영자/회계사/작업자 테스트 계정',
    brandProfiles: '관리자/운영자/회계사 테스트 계정 (작업자 제외)',
    supabaseRequired:
      'Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 넣고 다시 실행해 주세요.',
  },
  en: {
    languageLabel: 'Language',
    loginLoading: 'Signing in...',
    loginWithGoogle: 'Continue with Google',
    testPanelTrigger: 'Test Accounts',
    testPanelTitle: 'Test Accounts',
    testPanelSubtitle: 'Developer bypass bundle',
    testPanelHelper: 'Enter the password to open the test account list.',
    testPanelPasswordLabel: 'Password',
    testPanelPasswordPlaceholder: '4 digits',
    testPanelUnlock: 'Open',
    close: 'Close',
    testPanelPasswordError: 'Incorrect password.',
    testPanelLoading: 'Loading test accounts from DB...',
    testPanelLoadedHint: 'Only @test.local / @baro.local accounts registered in DB are shown.',
    testPanelEmpty: 'There are no active test accounts in the DB.',
    manufacturerProfiles: 'Admin / Operator / Accountant / Worker test accounts',
    brandProfiles: 'Admin / Operator / Accountant test accounts (no worker)',
    supabaseRequired:
      'Supabase configuration is required. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env` and restart.',
  },
  vi: {
    languageLabel: 'Ngôn ngữ',
    loginLoading: 'Đang đăng nhập...',
    loginWithGoogle: 'Đăng nhập bằng Google',
    testPanelTrigger: 'Tài khoản test',
    testPanelTitle: 'Tài khoản test',
    testPanelSubtitle: 'Nhóm đăng nhập vượt qua cho phát triển',
    testPanelHelper: 'Nhập mật khẩu để mở danh sách tài khoản test.',
    testPanelPasswordLabel: 'Mật khẩu',
    testPanelPasswordPlaceholder: '4 chữ số',
    testPanelUnlock: 'Mở',
    close: 'Đóng',
    testPanelPasswordError: 'Mật khẩu không đúng.',
    testPanelLoading: 'Đang kiểm tra tài khoản test trong DB...',
    testPanelLoadedHint:
      'Chỉ hiển thị các tài khoản @test.local / @baro.local đã đăng ký trong DB.',
    testPanelEmpty: 'Không có tài khoản test đang hoạt động trong DB.',
    manufacturerProfiles: 'Tài khoản test quản trị / vận hành / kế toán / công nhân',
    brandProfiles: 'Tài khoản test quản trị / vận hành / kế toán (không có công nhân)',
    supabaseRequired:
      'Cần cấu hình Supabase. Thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` vào `.env` rồi chạy lại.',
  },
};

const ORG_ROLE_LABEL_BY_KEY = {
  ADMIN: '관리자',
  OPERATOR: '운영자',
  ACCOUNTANT: '회계사',
  WORKER: '작업자',
};

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

const isTestAccountEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return TEST_ACCOUNT_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
};

const sortRoleOrder = (role) => {
  const order = ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'WORKER'];
  const index = order.indexOf(role);
  return index === -1 ? 99 : index;
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
    enableDevBypass,
    devBypass,
    devProfile,
    accessProfile,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigatingAfterAuth, setIsNavigatingAfterAuth] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [orgRoleProfiles, setOrgRoleProfiles] = useState([]);
  const [isTestPanelOpen, setIsTestPanelOpen] = useState(false);
  const [isTestPanelUnlocked, setIsTestPanelUnlocked] = useState(false);
  const [testPanelPassword, setTestPanelPassword] = useState('');
  const [testPanelError, setTestPanelError] = useState('');
  const [lineLeaderStartAt] = useState(() => new Date().toISOString());
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
    () =>
      resolveFirstAccessiblePath({
        isAuthenticated,
        devBypass,
        devProfile,
        accessProfile,
      }),
    [accessProfile, devBypass, devProfile, isAuthenticated]
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
  ]);

  useEffect(() => {
    if (isAuthenticated) return;
    setIsNavigatingAfterAuth(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isTestPanelUnlocked) {
      setLoadingProfiles(false);
      return undefined;
    }

    let cancelled = false;

    const loadDevProfilesFromDb = async () => {
      setLoadingProfiles(true);
      try {
        const organizationRows = await requestJSON('/organizations').catch(() => []);
        const organizations = Array.isArray(organizationRows) ? organizationRows : [];

        const grouped = await Promise.all(
          organizations.map(async (org) => {
            const orgId = Number(org?.id);
            if (!Number.isFinite(orgId) || orgId <= 0) {
              return { org, profiles: [] };
            }

            const membershipRows = await requestJSON(
              `/org-memberships${buildQueryString({ orgId })}`
            ).catch(() => []);
            const memberships = Array.isArray(membershipRows) ? membershipRows : [];
            const orgTypeRaw = normalizeUpper(org?.type);
            const orgType = normalizeOrganizationType(orgTypeRaw) || orgTypeRaw;
            const typeLabel = getOrganizationTypeLabel(orgType, orgType || '조직');
            const activeTestMemberships = memberships
              .filter((membership) => normalizeUpper(membership?.status) === 'ACTIVE')
              .filter((membership) => isTestAccountEmail(membership?.email));

            let lineManagerLineNamesByEmail = new Map();
            const hasPotentialLineLeaders =
              orgType === ORGANIZATION_TYPE_KEYS.MANUFACTURER &&
              activeTestMemberships.some(
                (membership) => normalizeUpper(membership?.role) === 'WORKER'
              );

            if (hasPotentialLineLeaders) {
              const [lineWorkers, lines] = await Promise.all([
                requestJSON(`/line-workers${buildQueryString({ orgId })}`).catch(() => []),
                requestJSON(`/lines${buildQueryString({ orgId })}`).catch(() => []),
              ]);
              const managerEmpIds = new Set(
                (Array.isArray(lines) ? lines : []).map((line) => line.managerEmployeeId).filter(Boolean)
              );
              const lineNamesByManagerId = new Map();
              (Array.isArray(lines) ? lines : []).forEach((line) => {
                const managerEmployeeId = Number(line?.managerEmployeeId);
                if (!Number.isFinite(managerEmployeeId) || managerEmployeeId <= 0) return;
                const lineName = String(line?.name || '').trim();
                if (!lineName) return;
                const current = lineNamesByManagerId.get(managerEmployeeId) || [];
                current.push(lineName);
                lineNamesByManagerId.set(managerEmployeeId, current);
              });
              lineManagerLineNamesByEmail = (Array.isArray(lineWorkers) ? lineWorkers : []).reduce(
                (map, worker) => {
                  const workerId = Number(worker?.id);
                  if (!managerEmpIds.has(workerId)) return map;
                  const email = String(worker?.email || '').trim().toLowerCase();
                  if (!email) return map;
                  const managedLineNames = lineNamesByManagerId.get(workerId) || [];
                  if (managedLineNames.length === 0) return map;
                  const existing = map.get(email) || [];
                  const merged = Array.from(new Set([...existing, ...managedLineNames]));
                  map.set(email, merged);
                  return map;
                },
                new Map()
              );
            }

            const profiles = activeTestMemberships
              .map((membership) => {
                const orgRole = normalizeUpper(membership?.role);
                const roleLabel = ORG_ROLE_LABEL_BY_KEY[orgRole];
                const membershipEmail = String(membership?.email || '').trim().toLowerCase();
                const managedLineNames =
                  orgRole === 'WORKER'
                    ? lineManagerLineNamesByEmail.get(membershipEmail) || []
                    : [];
                if (!roleLabel) return null;
                if (orgType === ORGANIZATION_TYPE_KEYS.BRAND && orgRole === 'WORKER') return null;
                if (orgRole === 'WORKER' && managedLineNames.length === 0) return null;

                const isLineLeader = orgRole === 'WORKER';
                const lineLeaderRoleSuffix =
                  isLineLeader && managedLineNames.length > 0
                    ? `(라인장:${managedLineNames.join(', ')})`
                    : isLineLeader
                      ? '(라인장)'
                      : '';
                const roleLabelWithLineLeader = isLineLeader
                  ? `${roleLabel}${lineLeaderRoleSuffix}`
                  : roleLabel;

                return {
                  key: `ORG_${orgId}_${membership?.id}`,
                  roleLabel: roleLabelWithLineLeader,
                  orgType,
                  orgRole,
                  orgId,
                  email: membership?.email || '',
                  entryType: 'ORG',
                  systemRole: 'USER',
                  orgName: org?.name ?? null,
                  employeeName: `${org?.name || '조직'} ${roleLabel} 테스트`,
                  subscription: org?.subscription ?? null,
                  isLineLeader,
                  managedLineNames,
                  lineLeaderStartAt: isLineLeader ? lineLeaderStartAt : null,
                  lineLeaderEndAt: null,
                };
              })
              .filter(Boolean)
              .sort((left, right) => sortRoleOrder(left.orgRole) - sortRoleOrder(right.orgRole));

            return { org, orgType, typeLabel, profiles };
          })
        );

        const next = grouped
          .filter((group) => Array.isArray(group.profiles) && group.profiles.length > 0)
          .sort((left, right) => {
            const typeOrder = {
              [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 0,
              [ORGANIZATION_TYPE_KEYS.BRAND]: 1,
            };
            const leftType = typeOrder[left.orgType] ?? 99;
            const rightType = typeOrder[right.orgType] ?? 99;
            if (leftType !== rightType) return leftType - rightType;
            return Number(left.org?.id || 0) - Number(right.org?.id || 0);
          });

        if (!cancelled) setOrgRoleProfiles(next);
      } catch (_error) {
        if (!cancelled) setOrgRoleProfiles([]);
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    };

    loadDevProfilesFromDb();

    return () => {
      cancelled = true;
    };
  }, [isTestPanelUnlocked, lineLeaderStartAt]);

  const hasDevOrgProfiles = useMemo(
    () => orgRoleProfiles.some((group) => Array.isArray(group.profiles) && group.profiles.length > 0),
    [orgRoleProfiles]
  );

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevBypass = (profile) => {
    enableDevBypass(profile);
    navigate('/', { replace: true });
  };

  const handleTestPanelOpen = () => {
    setIsTestPanelOpen(true);
    setIsTestPanelUnlocked(false);
    setTestPanelPassword('');
    setTestPanelError('');
  };

  const handleTestPanelClose = () => {
    setIsTestPanelOpen(false);
    setIsTestPanelUnlocked(false);
    setLoadingProfiles(false);
    setTestPanelPassword('');
    setTestPanelError('');
  };

  const handleTestPanelUnlock = (event) => {
    event.preventDefault();
    if (testPanelPassword === TEST_PANEL_PASSWORD) {
      setIsTestPanelUnlocked(true);
      setTestPanelError('');
      return;
    }
    setTestPanelError(loginCopy.testPanelPasswordError);
  };

  const handleTestPanelPasswordChange = (event) => {
    const nextValue = String(event.target.value || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    setTestPanelPassword(nextValue);
    if (testPanelError) {
      setTestPanelError('');
    }
  };

  const isLoginLocked =
    isSubmitting ||
    loading ||
    isOAuthReturnPending ||
    isNavigatingAfterAuth ||
    isAuthenticated;

  const profileFooterMessage = loadingProfiles
    ? loginCopy.testPanelLoading
    : hasDevOrgProfiles
      ? loginCopy.testPanelLoadedHint
      : loginCopy.testPanelEmpty;

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
            startIcon={
              isLoginLocked ? <CircularProgress size={16} color="inherit" /> : null
            }
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
        </Box>
      </Box>

      <Copyright sx={{ mt: 8, mb: 4 }} />
      <AppVersionLabel sx={{ display: 'block', mb: 2 }} />

      {isTestPanelOpen && (
        <Paper
          elevation={12}
          sx={{
            position: 'fixed',
            right: 16,
            left: { xs: 16, sm: 'auto' },
            bottom: 88,
            width: { xs: 'auto', sm: 360 },
            p: 2,
            zIndex: (theme) => theme.zIndex.modal,
            borderRadius: 2,
          }}
        >
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {loginCopy.testPanelTitle}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {loginCopy.testPanelSubtitle}
                </Typography>
              </Box>
              <Button size="small" onClick={handleTestPanelClose} sx={{ textTransform: 'none' }}>
                {loginCopy.close}
              </Button>
            </Box>

            {!isTestPanelUnlocked ? (
              <Box component="form" onSubmit={handleTestPanelUnlock}>
                <Stack spacing={1.25}>
                  <Typography variant="caption" color="text.secondary">
                    {loginCopy.testPanelHelper}
                  </Typography>
                  <TextField
                    autoFocus
                    size="small"
                    type="password"
                    label={loginCopy.testPanelPasswordLabel}
                    placeholder={loginCopy.testPanelPasswordPlaceholder}
                    value={testPanelPassword}
                    onChange={handleTestPanelPasswordChange}
                    error={Boolean(testPanelError)}
                    helperText={testPanelError || ' '}
                    inputProps={{
                      inputMode: 'numeric',
                      pattern: '[0-9]*',
                      maxLength: 4,
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={testPanelPassword.length !== 4}
                    sx={{ textTransform: 'none' }}
                  >
                    {loginCopy.testPanelUnlock}
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Stack spacing={1.25}>
                {orgRoleProfiles.length > 0 && <Divider />}

                <Stack
                  spacing={1.2}
                  divider={orgRoleProfiles.length > 1 ? <Divider flexItem /> : null}
                  sx={{ maxHeight: 340, overflowY: 'auto', pr: 0.5 }}
                >
                  {orgRoleProfiles.map(({ org, typeLabel, profiles, orgType }) => (
                    <Stack key={org?.id || `${org?.name}-${typeLabel}`} spacing={0.8}>
                      <Typography variant="caption" color="text.secondary">
                        {`${org?.name || '조직'} (${typeLabel})`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {orgType === ORGANIZATION_TYPE_KEYS.MANUFACTURER
                          ? loginCopy.manufacturerProfiles
                          : loginCopy.brandProfiles}
                      </Typography>

                      {profiles.map((profile) => (
                        <Button
                          key={profile.key}
                          fullWidth
                          variant="outlined"
                          disabled={loadingProfiles || !profile?.orgId}
                          onClick={() => handleDevBypass(profile)}
                          sx={{
                            justifyContent: 'flex-start',
                            textTransform: 'none',
                          }}
                        >
                          {profile.roleLabel}
                        </Button>
                      ))}
                    </Stack>
                  ))}
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  {profileFooterMessage}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      <Fab
        variant="extended"
        onClick={isTestPanelOpen ? handleTestPanelClose : handleTestPanelOpen}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: (theme) => theme.zIndex.modal,
          px: 2,
          border: '1px solid',
          borderColor: 'divider',
          color: isTestPanelOpen ? 'common.white' : 'text.primary',
          backgroundColor: isTestPanelOpen ? 'grey.900' : 'background.paper',
          '&:hover': {
            backgroundColor: isTestPanelOpen ? 'grey.800' : 'grey.100',
          },
        }}
      >
        <LockOutlinedIcon sx={{ mr: 1, fontSize: 20 }} />
        {isTestPanelOpen ? loginCopy.close : loginCopy.testPanelTrigger}
      </Fab>
    </Container>
  );
};

export default Login;
