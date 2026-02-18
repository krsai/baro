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
import { requestJSON } from '../../utils/apiClient';

const DEV_ORG_SEEDS = [
  {
    key: 'BARO',
    name: 'BARO',
    aliases: [
      'BARO',
      '\uBC14\uB85C',
      '\uBC14\uB85C\uAC00\uBA3C\uD2B8',
      '\uBC14\uB85C \uAC00\uBA3C\uD2B8',
    ],
    type: 'MANUFACTURER',
    typeLabel: '\uC218\uC8FC\uC790',
  },
  {
    key: 'DEOSAN',
    name: '\uB354\uC0B0',
    aliases: ['DEOSAN', '\uB354\uC0B0'],
    type: 'BRAND',
    typeLabel: '\uBC1C\uC8FC\uC790',
  },
];

const DEV_ROLE_PRESETS = [
  { key: 'ADMIN', label: '\uAD00\uB9AC\uC790' },
  { key: 'OPERATOR', label: '\uC6B4\uC601\uC790' },
  { key: 'ACCOUNTANT', label: '\uD68C\uACC4\uC0AC' },
  { key: 'WORKER', label: '\uC791\uC5C5\uC790' },
];

const normalizeNameKey = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const pickOrgBySeed = (organizations, seed) => {
  const orgs = (Array.isArray(organizations) ? organizations : []).filter(
    (org) => String(org?.type || '').toUpperCase() === seed.type
  );
  if (orgs.length === 0) return null;

  const aliasKeys = new Set(
    [seed.name, ...(Array.isArray(seed.aliases) ? seed.aliases : [])]
      .map(normalizeNameKey)
      .filter(Boolean)
  );
  const aliasList = Array.from(aliasKeys);
  const ranked = orgs
    .map((org) => {
      const nameKey = normalizeNameKey(org?.name);
      const codeKey = normalizeNameKey(org?.code);
      let score = 0;

      if (aliasKeys.has(nameKey)) score += 100;
      if (aliasKeys.has(codeKey)) score += 60;
      if (
        aliasList.some(
          (alias) => alias && nameKey && (alias.includes(nameKey) || nameKey.includes(alias))
        )
      ) {
        score += 20;
      }

      return { org, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.org?.id || 0) - Number(b.org?.id || 0);
    });

  if (ranked[0]?.score > 0) return ranked[0].org;
  return orgs[0];
};

const Login = () => {
  const navigate = useNavigate();
  const {
    signInWithGoogle,
    isAuthenticated,
    loading,
    isSupabaseConfigured,
    enableDevBypass,
  } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [lineLeaderStartAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadOrganizations = async () => {
      setLoadingOrgs(true);
      try {
        const data = await requestJSON('/organizations').catch(() => []);
        let nextOrganizations = Array.isArray(data) ? [...data] : [];

        for (const seed of DEV_ORG_SEEDS) {
          const existing = pickOrgBySeed(nextOrganizations, seed);
          if (existing) continue;

          try {
            const created = await requestJSON('/organizations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: seed.name,
                type: seed.type,
              }),
            });
            if (created?.id) {
              nextOrganizations = [...nextOrganizations, created];
            }
          } catch (_error) {
            // ignore organization seed errors in login UI
          }
        }

        if (cancelled) return;
        setOrganizations(nextOrganizations);
      } catch (_error) {
        if (!cancelled) setOrganizations([]);
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    };

    loadOrganizations();
    return () => {
      cancelled = true;
    };
  }, []);

  const orgBySeedKey = useMemo(
    () =>
      DEV_ORG_SEEDS.reduce((acc, seed) => {
        acc[seed.key] = pickOrgBySeed(organizations, seed);
        return acc;
      }, {}),
    [organizations]
  );

  const orgRoleProfiles = useMemo(
    () =>
      DEV_ORG_SEEDS.map((seed) => {
        const org = orgBySeedKey[seed.key];
        const profiles = DEV_ROLE_PRESETS.map((rolePreset) => {
          const isLineLeader =
            seed.type === 'MANUFACTURER' && rolePreset.key === 'WORKER';
          const roleLabel = isLineLeader
            ? `${rolePreset.label}(\uB77C\uC778\uC7A5)`
            : rolePreset.label;

          return {
            key: `${seed.key}_${rolePreset.key}`,
            label: `${seed.name} ${roleLabel}`,
            roleLabel,
            entryType: 'ORG',
            systemRole: 'USER',
            orgType: seed.type,
            orgRole: rolePreset.key,
            orgId: org?.id ?? null,
            orgName: org?.name ?? seed.name,
            employeeName: `${seed.name} ${rolePreset.label} \uD14C\uC2A4\uD2B8`,
            email: `${seed.key.toLowerCase()}-${rolePreset.key.toLowerCase()}@test.local`,
            isLineLeader,
            lineLeaderStartAt: isLineLeader ? lineLeaderStartAt : null,
            lineLeaderEndAt: null,
          };
        });

        return { seed, org, profiles };
      }),
    [lineLeaderStartAt, orgBySeedKey]
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
          \uB85C\uADF8\uC778
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
            {isSubmitting || loading
              ? '\uB85C\uADF8\uC778 \uC911...'
              : 'Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778'}
          </Button>

          <Stack spacing={1.2} sx={{ mb: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={() =>
                handleDevBypass({
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
                })
              }
            >
              \uAC1C\uBC1C \uC6B0\uD68C: \uC2DC\uC2A4\uD15C \uAD00\uB9AC\uC790
            </Button>

            <Divider />
            {orgRoleProfiles.map(({ seed, org, profiles }) => (
              <Stack key={seed.key} spacing={0.8}>
                <Typography variant="caption" color="text.secondary">
                  {`${seed.name} (${seed.typeLabel}) \uD14C\uC2A4\uD2B8 \uACC4\uC815`}
                </Typography>
                {profiles.map((profile) => (
                  <Button
                    key={profile.key}
                    fullWidth
                    variant="outlined"
                    disabled={loadingOrgs || !org?.id}
                    onClick={() => handleDevBypass(profile)}
                  >
                    {`\uAC1C\uBC1C \uC6B0\uD68C: ${profile.roleLabel}${org?.name ? ` (${org.name})` : ''}`}
                  </Button>
                ))}
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary">
              {loadingOrgs
                ? '\uD14C\uC2A4\uD2B8 \uC5C5\uCCB4 \uD655\uC778 \uC911...'
                : 'BARO/\uB354\uC0B0 \uAE30\uC900 \uC5ED\uD560\uBCC4 \uD14C\uC2A4\uD2B8 \uACC4\uC815\uC744 \uC81C\uACF5\uD569\uB2C8\uB2E4.'}
            </Typography>
          </Stack>

          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Supabase \uC124\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. `.env`\uC5D0
              `VITE_SUPABASE_URL`\uACFC `VITE_SUPABASE_ANON_KEY`\uB97C \uB123\uACE0 \uB2E4\uC2DC
              \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.
            </Typography>
          )}
          <Link component={RouterLink} to="/signup" variant="body2">
            \uACC4\uC815\uC774 \uC5C6\uC73C\uBA74 \uD14C\uC2A4\uD2B8 \uACC4\uC815\uC73C\uB85C \uC2DC\uC791\uD558\uAE30
          </Link>
        </Box>
      </Box>
      <Copyright sx={{ mt: 8, mb: 4 }} />
    </Container>
  );
};

export default Login;
