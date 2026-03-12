import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import {
  getOrganizationTypeLabel,
  normalizeOrganizationType,
  ORGANIZATION_TYPE_KEYS,
} from '../../constants/organizationType';

const WORKSPACE_PATH = '/workspace';

const TEST_ACCOUNT_EMAIL_SUFFIXES = ['@test.local', '@baro.local'];

const ORG_ROLE_LABEL_BY_KEY = {
  ADMIN: '\uAD00\uB9AC\uC790',
  OPERATOR: '\uC6B4\uC601\uC790',
  ACCOUNTANT: '\uD68C\uACC4\uC0AC',
  WORKER: '\uC791\uC5C5\uC790',
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

const Login = () => {
  const navigate = useNavigate();
  const {
    signInWithGoogle,
    isAuthenticated,
    hasWorkspaceAccess,
    requiresOnboarding,
    requiresSubscriptionContact,
    loading,
    isSupabaseConfigured,
    enableDevBypass,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [orgRoleProfiles, setOrgRoleProfiles] = useState([]);
  const [lineLeaderStartAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!isAuthenticated || loading) return;
    if (hasWorkspaceAccess) {
      navigate(WORKSPACE_PATH, { replace: true });
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
    requiresOnboarding,
    requiresSubscriptionContact,
  ]);

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
            const orgTypeRaw = normalizeUpper(org?.type);
            const orgType = normalizeOrganizationType(orgTypeRaw) || orgTypeRaw;
            const typeLabel = getOrganizationTypeLabel(orgType, orgType || '\uC870\uC9C1');
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
                (Array.isArray(lines) ? lines : []).map((l) => l.managerEmployeeId).filter(Boolean)
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

            const sortedProfiles = activeTestMemberships
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
                  label: `${org?.name || '\uC870\uC9C1'} ${roleLabelWithLineLeader}`,
                  entryType: 'ORG',
                  systemRole: 'USER',
                  orgType,
                  orgRole,
                  orgId,
                  orgName: org?.name ?? null,
                  employeeName: `${org?.name || '\uC870\uC9C1'} ${roleLabel} \uD14C\uC2A4\uD2B8`,
                  email: membership?.email || '',
                  subscription: org?.subscription ?? null,
                  isLineLeader,
                  managedLineNames,
                  lineLeaderStartAt: isLineLeader ? lineLeaderStartAt : null,
                  lineLeaderEndAt: null,
                };
              })
              .filter(Boolean)
              .sort((a, b) => sortRoleOrder(a.orgRole) - sortRoleOrder(b.orgRole));

            const profiles = sortedProfiles;

            return { org, orgType, typeLabel, profiles };
          })
        );

        const next = grouped
          .filter((group) => Array.isArray(group.profiles) && group.profiles.length > 0)
          .sort((a, b) => {
            const typeOrder = {
              [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 0,
              [ORGANIZATION_TYPE_KEYS.BRAND]: 1,
            };
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
    navigate(WORKSPACE_PATH, { replace: true });
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
            {orgRoleProfiles.length > 0 && <Divider />}

            {orgRoleProfiles.map(({ org, typeLabel, profiles, orgType }) => (
              <Stack key={org?.id || `${org?.name}-${typeLabel}`} spacing={0.8}>
                <Typography variant="caption" color="text.secondary">
                  {`${org?.name || '\uC870\uC9C1'} (${typeLabel})`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {orgType === ORGANIZATION_TYPE_KEYS.MANUFACTURER
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
        </Box>
      </Box>

      <Copyright sx={{ mt: 8, mb: 4 }} />
    </Container>
  );
};

export default Login;
