import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddBusinessRoundedIcon from '@mui/icons-material/AddBusinessRounded';
import { requestJSON } from '../../utils/apiClient';
import { useAuth } from '../../context/AuthContext';
import SystemProviderFooter from '../../components/SystemProviderFooter';
import {
  ORGANIZATION_TYPE_OPTIONS,
  normalizeOrganizationType,
} from '../../constants/organizationType';

const WORKSPACE_PATH = '/workspace';
const COUNTRY_OPTIONS = [
  { value: 'KR', label: '한국' },
  { value: 'VN', label: '베트남' },
];

const HIDDEN_ONBOARDING_ORG_CODES = new Set(['BARO', 'TSMF', 'TSBR']);
const HIDDEN_ONBOARDING_ORG_NAMES = new Set(['baro', '테스트수주자', '테스트발주자']);

const ONBOARDING_COMPANY_NAME_MIN_LENGTH = 2;
const ONBOARDING_COMPANY_NAME_MAX_LENGTH = 120;
const ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH = 40;
const KR_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{3}-\d{2}-\d{5})$/;
const VN_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{13}|\d{10}-\d{3})$/;

const normalizeCompactLower = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const normalizeUpper = (value) => String(value || '').trim().toUpperCase();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeBusinessNumber = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '');

const isValidBusinessNumberFormat = (country, value) => {
  const normalized = normalizeBusinessNumber(value);
  if (!normalized) return false;
  if (country === 'KR') return KR_BUSINESS_NUMBER_REGEX.test(normalized);
  if (country === 'VN') return VN_BUSINESS_NUMBER_REGEX.test(normalized);
  return false;
};

const businessNumberErrorMessageByCountry = (country) => {
  if (country === 'VN') {
    return '베트남 사업자등록번호 형식이 올바르지 않습니다. (10자리 또는 13자리)';
  }
  return '한국 사업자등록번호 형식이 올바르지 않습니다. (10자리 또는 3-2-5)';
};

const isHiddenOnboardingOrganization = (organization) => {
  const nameKey = normalizeCompactLower(organization?.name);
  const codeKey = normalizeUpper(organization?.code);
  if (HIDDEN_ONBOARDING_ORG_NAMES.has(nameKey)) return true;
  if (HIDDEN_ONBOARDING_ORG_CODES.has(codeKey)) return true;
  return false;
};

const getOrganizationSearchKey = (organization) => {
  const name = normalizeCompactLower(organization?.name);
  const code = normalizeCompactLower(organization?.code);
  return `${name} ${code}`.trim();
};

const buildRegisterFormDefault = (requesterEmail = '') => ({
  organizationName: '',
  organizationType: '',
  country: 'KR',
  companyAddress: '',
  businessNumber: '',
  representativeContact: '',
  representativeEmail: requesterEmail || '',
});

const Onboarding = () => {
  const navigate = useNavigate();
  const {
    user,
    accessProfile,
    loading,
    isAuthenticated,
    hasWorkspaceAccess,
    requiresOnboarding,
    signOut,
  } = useAuth();

  const [organizations, setOrganizations] = useState([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [companySearchText, setCompanySearchText] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  const [registerDrawerOpen, setRegisterDrawerOpen] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState(buildRegisterFormDefault(''));
  const [registerErrorMessage, setRegisterErrorMessage] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const requesterEmail = useMemo(() => {
    const fromUser = normalizeEmail(user?.email);
    const fromProfile = normalizeEmail(accessProfile?.email);
    return fromUser || fromProfile;
  }, [accessProfile?.email, user?.email]);

  useEffect(() => {
    setRegisterForm((prev) => {
      if (prev.representativeEmail) return prev;
      return { ...prev, representativeEmail: requesterEmail || '' };
    });
  }, [requesterEmail]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    if (hasWorkspaceAccess) {
      navigate(WORKSPACE_PATH, { replace: true });
      return;
    }
    if (!requiresOnboarding) {
      navigate('/login', { replace: true });
    }
  }, [hasWorkspaceAccess, isAuthenticated, loading, navigate, requiresOnboarding]);

  useEffect(() => {
    let cancelled = false;
    const loadOrganizations = async () => {
      setLoadingOrganizations(true);
      try {
        const data = await requestJSON('/organizations', { skipGlobalLoading: true });
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        const visibleRows = rows.filter((row) => !isHiddenOnboardingOrganization(row));
        setOrganizations(visibleRows);
      } catch (_error) {
        if (cancelled) return;
        setOrganizations([]);
      } finally {
        if (!cancelled) {
          setLoadingOrganizations(false);
        }
      }
    };

    loadOrganizations();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearchText = normalizeCompactLower(companySearchText);
  const matchedOrganizations = useMemo(() => {
    if (!normalizedSearchText) return [];
    return organizations.filter((organization) =>
      getOrganizationSearchKey(organization).includes(normalizedSearchText)
    );
  }, [normalizedSearchText, organizations]);

  const hasSearchInput = companySearchText.trim().length > 0;
  const hasMatchedOrganizations = matchedOrganizations.length > 0;
  const canJoinSelectedOrganization =
    !!selectedOrganization?.id && !joinSubmitting && !loadingOrganizations;

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setRegisterErrorMessage('');
  };

  const handleJoinCompany = async () => {
    clearMessages();
    const orgIdNum = Number(selectedOrganization?.id);
    if (!Number.isFinite(orgIdNum) || orgIdNum <= 0) {
      setErrorMessage('소속 회사를 먼저 선택해 주세요.');
      return;
    }
    if (!requesterEmail) {
      setErrorMessage('로그인 이메일을 확인할 수 없습니다.');
      return;
    }

    setJoinSubmitting(true);
    try {
      await requestJSON('/org-memberships/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: orgIdNum,
          email: requesterEmail,
          role: 'OPERATOR',
        }),
      });
      setSuccessMessage('소속 회사 승인 요청이 접수되었습니다. 승인 후 이메일로 안내드립니다.');
    } catch (error) {
      setErrorMessage(error?.message || '소속 회사 요청 중 오류가 발생했습니다.');
    } finally {
      setJoinSubmitting(false);
    }
  };

  const handleOpenRegisterDrawer = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    clearMessages();
    setRegisterForm((prev) => ({
      ...prev,
      organizationName: prev.organizationName || companySearchText.trim(),
      representativeEmail: prev.representativeEmail || requesterEmail || '',
    }));
    window.setTimeout(() => {
      setRegisterDrawerOpen(true);
    }, 0);
  };

  const handleCloseRegisterDrawer = (_event, reason) => {
    if (registerSubmitting) return;
    if (reason === 'backdropClick') return;
    setRegisterDrawerOpen(false);
  };

  const handleRegisterChange = (event) => {
    const { name, value } = event.target;
    if (registerErrorMessage) {
      setRegisterErrorMessage('');
    }
    setRegisterForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterCompany = async () => {
    clearMessages();

    const organizationName = String(registerForm.organizationName || '').trim();
    const organizationType = normalizeOrganizationType(registerForm.organizationType);
    const country = normalizeUpper(registerForm.country || 'KR');
    const companyAddress = String(registerForm.companyAddress || '').trim();
    const businessNumber = normalizeBusinessNumber(registerForm.businessNumber);
    const representativeContact = String(registerForm.representativeContact || '').trim();
    const representativeEmail = normalizeEmail(registerForm.representativeEmail);

    if (
      !organizationName ||
      organizationName.length < ONBOARDING_COMPANY_NAME_MIN_LENGTH ||
      organizationName.length > ONBOARDING_COMPANY_NAME_MAX_LENGTH
    ) {
      setRegisterErrorMessage(`회사명은 ${ONBOARDING_COMPANY_NAME_MIN_LENGTH}~${ONBOARDING_COMPANY_NAME_MAX_LENGTH}자로 입력해 주세요.`);
      return;
    }
    if (!organizationType) {
      setRegisterErrorMessage('\uC5C5\uC885\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.');
      return;
    }
    if (country !== 'KR' && country !== 'VN') {
      setRegisterErrorMessage('국가를 선택해 주세요.');
      return;
    }
    if (!companyAddress) {
      setRegisterErrorMessage('회사 주소를 입력해 주세요.');
      return;
    }
    if (!businessNumber) {
      setRegisterErrorMessage('사업자등록번호를 입력해 주세요.');
      return;
    }
    if (!isValidBusinessNumberFormat(country, businessNumber)) {
      setRegisterErrorMessage(businessNumberErrorMessageByCountry(country));
      return;
    }
    if (
      !representativeContact ||
      representativeContact.length > ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH
    ) {
      setRegisterErrorMessage(`대표 연락처를 입력해 주세요. (최대 ${ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH}자)`);
      return;
    }
    if (!representativeEmail || !representativeEmail.includes('@')) {
      setRegisterErrorMessage('대표 이메일을 입력해 주세요.');
      return;
    }

    setRegisterSubmitting(true);
    try {
      await requestJSON('/onboarding/company-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationNameEn: organizationName,
          organizationType,
          country,
          companyAddress,
          businessNumber,
          contactPhone: representativeContact,
          contactEmail: representativeEmail,
        }),
      });
      setSuccessMessage('신규 회사 등록 요청이 접수되었습니다. 승인 후 이메일로 안내드립니다.');
      setRegisterDrawerOpen(false);
      setRegisterForm(buildRegisterFormDefault(requesterEmail));
    } catch (error) {
      setRegisterErrorMessage(error?.message || '신규 회사 등록 요청 중 오류가 발생했습니다.');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleGoLogin = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const searchHintText = (() => {
    if (!hasSearchInput) return '회사명 또는 코드 일부를 입력하면 일치 업체만 표시됩니다.';
    if (hasMatchedOrganizations) return `${matchedOrganizations.length}개 업체가 검색되었습니다.`;
    return '일치하는 업체가 없습니다. 신규 회사 등록을 진행해 주세요.';
  })();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f6f8fc' }}>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 }, flex: 1 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
              신규 계정 확인이 필요합니다
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              소속 회사를 검색해서 승인 요청하거나, 회사가 없으면 신규 등록을 진행해 주세요.
            </Typography>
          </Box>

          {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 3,
              background: 'linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)',
            }}
          >
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                spacing={1}
              >
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  소속 회사 선택
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleOpenRegisterDrawer}
                  startIcon={<AddBusinessRoundedIcon />}
                >
                  신규 회사 등록
                </Button>
              </Stack>

              <Autocomplete
                options={matchedOrganizations}
                value={selectedOrganization}
                inputValue={companySearchText}
                onInputChange={(_event, nextInputValue, reason) => {
                  setCompanySearchText(nextInputValue);
                  if (reason === 'input' || !nextInputValue.trim()) {
                    setSelectedOrganization(null);
                  }
                }}
                onChange={(_event, nextOrganization) => {
                  setSelectedOrganization(nextOrganization || null);
                  if (nextOrganization?.name) {
                    setCompanySearchText(nextOrganization.name);
                  }
                }}
                isOptionEqualToValue={(option, value) => Number(option?.id) === Number(value?.id)}
                filterOptions={(options) => options}
                noOptionsText={hasSearchInput ? '일치 업체 없음' : '회사명을 입력해 주세요'}
                getOptionLabel={(option) =>
                  option?.code ? `${option.name} (${option.code})` : option?.name || ''
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="회사명 또는 코드 검색"
                    placeholder="예: lineos, LNSO"
                    helperText={searchHintText}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack spacing={0.2}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        코드: {option.code || '-'}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                loading={loadingOrganizations}
                loadingText="업체 목록 불러오는 중..."
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                <Button
                  variant="contained"
                  onClick={handleJoinCompany}
                  disabled={!canJoinSelectedOrganization}
                  startIcon={joinSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {joinSubmitting ? '요청 중...' : '소속 회사 승인 요청'}
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary">
                소속 회사 승인 요청은 해당 회사의 관리자/운영자에게 전달되며 승인 후 이메일로 안내됩니다.
              </Typography>
            </Stack>
          </Paper>

          <Box sx={{ mt: 0.5 }}>
            <Button variant="text" onClick={handleGoLogin}>
              다른 계정으로 다시 로그인
            </Button>
          </Box>
        </Stack>
      </Container>

      <Drawer
        anchor="right"
        open={registerDrawerOpen}
        onClose={handleCloseRegisterDrawer}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 460 },
          },
        }}
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                신규 회사 등록
              </Typography>
              <Typography variant="body2" color="text.secondary">
                사업자등록 정보를 정확히 입력해 주세요.
              </Typography>
            </Box>
            <IconButton onClick={handleCloseRegisterDrawer} disabled={registerSubmitting} aria-label="닫기">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {registerErrorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {registerErrorMessage}
            </Alert>
          ) : null}

          <Stack spacing={1.6}>
            <TextField
              fullWidth
              required
              select
              label={'\uC5C5\uC885'}
              name="organizationType"
              value={registerForm.organizationType}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            >
              <MenuItem value="">
                <em>{'\uC120\uD0DD\uD574 \uC8FC\uC138\uC694'}</em>
              </MenuItem>
              {ORGANIZATION_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              required
              label="회사명"
              name="organizationName"
              value={registerForm.organizationName}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              select
              label="국가"
              name="country"
              value={registerForm.country}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              required
              label="회사 주소"
              name="companyAddress"
              value={registerForm.companyAddress}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label="사업자등록번호"
              name="businessNumber"
              value={registerForm.businessNumber}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label="대표 연락처"
              name="representativeContact"
              value={registerForm.representativeContact}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label="대표 이메일"
              name="representativeEmail"
              type="email"
              value={registerForm.representativeEmail}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
          </Stack>

          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleRegisterCompany}
                disabled={registerSubmitting}
                startIcon={registerSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {registerSubmitting ? '등록 요청 중...' : '등록 요청 보내기'}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleCloseRegisterDrawer}
                disabled={registerSubmitting}
              >
                취소
              </Button>
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <SystemProviderFooter />
    </Box>
  );
};

export default Onboarding;
