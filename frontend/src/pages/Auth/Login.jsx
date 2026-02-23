import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const TEST_ACCOUNT_EMAIL_SUFFIX = '@test.local';

const ORG_TYPE_LABEL_BY_KEY = {
  MANUFACTURER: '\uC218\uC8FC\uC790',
  BRAND: '\uBC1C\uC8FC\uC790',
};

const ORG_ROLE_LABEL_BY_KEY = {
  ADMIN: '\uAD00\uB9AC\uC790',
  OPERATOR: '\uC6B4\uC601\uC790',
  ACCOUNTANT: '\uD68C\uACC4\uC0AC',
  WORKER: '\uC791\uC5C5\uC790',
};

const SYSTEM_ADMIN_PROFILE = {
  key: 'SYSTEM_ADMIN',
  label: '\uC2DC\uC2A4\uD15C \uAD00\uB9AC\uC790',
  entryType: 'SYSTEM',
  systemRole: 'SYSTEM_ADMIN',
  orgType: null,
  orgRole: null,
  orgId: null,
  orgName: null,
  email: 'system-admin@test.local',
  employeeName: '\uC2DC\uC2A4\uD15C \uAD00\uB9AC\uC790',
  isLineLeader: false,
  lineLeaderStartAt: null,
  lineLeaderEndAt: null,
};

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

const isTestAccountEmail = (value) =>
  String(value || '').trim().toLowerCase().endsWith(TEST_ACCOUNT_EMAIL_SUFFIX);

const sortRoleOrder = (role) => {
  const order = ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'WORKER'];
  const index = order.indexOf(role);
  return index === -1 ? 99 : index;
};

const Login = () => {
  const navigate = useNavigate();
  const {
    signInWithGoogle,
    isAuthenticated,
    hasWorkspaceAccess,
    loading,
    isSupabaseConfigured,
    enableDevBypass,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [orgRoleProfiles, setOrgRoleProfiles] = useState([]);
  const [lineLeaderStartAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!isAuthenticated || !hasWorkspaceAccess) return;
    navigate('/', { replace: true });
  }, [hasWorkspaceAccess, isAuthenticated, navigate]);

  useEffect(() => {
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
            const orgType = normalizeUpper(org?.type);
            const typeLabel = ORG_TYPE_LABEL_BY_KEY[orgType] || orgType || '\uC870\uC9C1';

            let lineManagerEmails = new Set();
            if (orgType === 'MANUFACTURER') {
              const [lineWorkers, lines] = await Promise.all([
                requestJSON(`/line-workers${buildQueryString({ orgId })}`).catch(() => []),
                requestJSON(`/lines${buildQueryString({ orgId })}`).catch(() => []),
              ]);
              const managerEmpIds = new Set(
                (Array.isArray(lines) ? lines : []).map((l) => l.managerEmployeeId).filter(Boolean)
              );
              lineManagerEmails = new Set(
                (Array.isArray(lineWorkers) ? lineWorkers : [])
                  .filter((w) => managerEmpIds.has(w.id))
                  .map((w) => String(w.email || '').trim().toLowerCase())
                  .filter(Boolean)
              );
            }

            const profiles = memberships
              .filter((membership) => normalizeUpper(membership?.status) === 'ACTIVE')
              .filter((membership) => isTestAccountEmail(membership?.email))
              .map((membership) => {
                const orgRole = normalizeUpper(membership?.role);
                const roleLabel = ORG_ROLE_LABEL_BY_KEY[orgRole];
                if (!roleLabel) return null;
                if (orgType === 'BRAND' && orgRole === 'WORKER') return null;
                if (orgRole === 'WORKER' && !lineManagerEmails.has(membership?.email?.toLowerCase())) return null;

                const isLineLeader = orgRole === 'WORKER';
                const roleLabelWithLineLeader = isLineLeader
                  ? `${roleLabel}(\uB77C\uC778\uC7A5)`
                  : roleLabel;
                return {
                  key: `ORG_${orgId}_${membership?.id}`,
                  roleLabel: roleLabelWithLineLeader,
                  label: `${org?.name || '\uC870\uC9C1'} ${roleLabelWithLineLeader}`,
                  entryType: 'ORG',
                  systemRole: 'USER',
                  orgType,
                  orgRole,
                  orgId,
                  orgName: org?.name ?? null,
                  employeeName: `${org?.name || '\uC870\uC9C1'} ${roleLabel} \uD14C\uC2A4\uD2B8`,
                  email: membership?.email || '',
                  isLineLeader,
                  lineLeaderStartAt: isLineLeader ? lineLeaderStartAt : null,
                  lineLeaderEndAt: null,
                };
              })
              .filter(Boolean)
              .sort((a, b) => sortRoleOrder(a.orgRole) - sortRoleOrder(b.orgRole));

            return { org, orgType, typeLabel, profiles };
          })
        );

        const next = grouped
          .filter((group) => Array.isArray(group.profiles) && group.profiles.length > 0)
          .sort((a, b) => {
            const typeOrder = { MANUFACTURER: 0, BRAND: 1 };
            const aType = typeOrder[a.orgType] ?? 99;
            const bType = typeOrder[b.orgType] ?? 99;
            if (aType !== bType) return aType - bType;
            return Number(a.org?.id || 0) - Number(b.org?.id || 0);
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
  }, [lineLeaderStartAt]);

  const hasDevOrgProfiles = useMemo(
    () => orgRoleProfiles.some((group) => Array.isArray(group.profiles) && group.profiles.length > 0),
    [orgRoleProfiles]
  );

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await signInWithGoogle();
    setIsSubmitting(false);
  };

  const handleDevBypass = (profile) => {
    enableDevBypass(profile);
    navigate('/', { replace: true });
  };

  const handleSystemAdminBypass = () => {
    handleDevBypass(SYSTEM_ADMIN_PROFILE);
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
            sx={{
              mt: 1,
              mb: 2,
              backgroundColor: '#4285F4',
              '&:hover': { backgroundColor: '#357ae8' },
            }}
            startIcon={
              isSubmitting || loading ? <CircularProgress size={16} color="inherit" /> : null
            }
            onClick={handleGoogleLogin}
            disabled={isSubmitting || loading || !isSupabaseConfigured}
          >
            {isSubmitting || loading ? '\uB85C\uADF8\uC778 \uC911...' : 'Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778'}
          </Button>

          <Stack spacing={1.2} sx={{ mb: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              color="error"
              onClick={handleSystemAdminBypass}
            >
              개발 우회: 시스템 관리자
            </Button>

            <Divider />

            {orgRoleProfiles.map(({ org, typeLabel, profiles, orgType }) => (
              <Stack key={org?.id || `${org?.name}-${typeLabel}`} spacing={0.8}>
                <Typography variant="caption" color="text.secondary">
                  {`${org?.name || '\uC870\uC9C1'} (${typeLabel})`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {orgType === 'MANUFACTURER'
                    ? '\uAD00\uB9AC\uC790/\uC6B4\uC601\uC790/\uD68C\uACC4\uC0AC/\uC791\uC5C5\uC790 \uD14C\uC2A4\uD2B8 \uACC4\uC815'
                    : '\uAD00\uB9AC\uC790/\uC6B4\uC601\uC790/\uD68C\uACC4\uC0AC \uD14C\uC2A4\uD2B8 \uACC4\uC815 (\uC791\uC5C5\uC790 \uC81C\uC678)'}
                </Typography>

                {profiles.map((profile) => (
                  <Button
                    key={profile.key}
                    fullWidth
                    variant="outlined"
                    disabled={loadingProfiles || !profile?.orgId}
                    onClick={() => handleDevBypass(profile)}
                  >
                    {`개발 우회: ${profile.roleLabel}`}
                  </Button>
                ))}
              </Stack>
            ))}

            <Typography variant="caption" color="text.secondary">
              {loadingProfiles
                ? 'DB \uD14C\uC2A4\uD2B8 \uACC4\uC815 \uD655\uC778 \uC911...'
                : hasDevOrgProfiles
                  ? 'DB\uC5D0 \uB4F1\uB85D\uB41C @test.local \uACC4\uC815\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4.'
                  : 'DB\uC5D0 \uD65C\uC131 \uD14C\uC2A4\uD2B8 \uACC4\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD14C\uC2A4\uD2B8 \uC870\uC9C1/\uACC4\uC815\uC744 \uBA3C\uC800 \uC0DD\uC131\uD574 \uC8FC\uC138\uC694.'}
            </Typography>
          </Stack>

          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과
              `VITE_SUPABASE_ANON_KEY`를 넣고 다시 실행해 주세요.
            </Typography>
          )}

          <Link component={RouterLink} to="/signup" variant="body2">
            계정이 없으면 테스트 계정으로 시작하기
          </Link>
        </Box>
      </Box>

      <Copyright sx={{ mt: 8, mb: 4 }} />
    </Container>
  );
};

export default Login;
