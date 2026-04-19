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
import { matchesAutocompleteSearch } from '../../utils/autocompleteSearch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
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
const ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH = 80;
const ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH = 40;
const KR_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{3}-\d{2}-\d{5})$/;
const VN_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{13}|\d{10}-\d{3})$/;

const ONBOARDING_TEXT = {
  countryKr: { ko: '\ud55c\uad6d', en: 'Korea', vi: 'Han Quoc' },
  countryVn: { ko: '\ubca0\ud2b8\ub0a8', en: 'Vietnam', vi: 'Viet Nam' },
  businessNumberErrorVn: {
    ko: '\ubca0\ud2b8\ub0a8 \uc0ac\uc5c5\uc790\ub4f1\ub85d\ubc88\ud638 \ud615\uc2dd\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. (10\uc790\ub9ac \ub610\ub294 13\uc790\ub9ac)',
    en: 'Vietnam business registration number format is invalid. (10 or 13 digits)',
    vi: 'Dinh dang ma so doanh nghiep Viet Nam khong hop le. (10 hoac 13 chu so)',
  },
  businessNumberErrorKr: {
    ko: '\ud55c\uad6d \uc0ac\uc5c5\uc790\ub4f1\ub85d\ubc88\ud638 \ud615\uc2dd\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. (10\uc790\ub9ac \ub610\ub294 3-2-5)',
    en: 'Korea business registration number format is invalid. (10 digits or 3-2-5)',
    vi: 'Dinh dang so dang ky kinh doanh Han Quoc khong hop le. (10 chu so hoac 3-2-5)',
  },
  selectOrganizationFirst: {
    ko: '\uc18c\uc18d \ud68c\uc0ac\ub97c \uba3c\uc800 \uc120\ud0dd\ud574 \uc8fc\uc138\uc694.',
    en: 'Please choose your company first.',
    vi: 'Vui long chon cong ty cua ban truoc.',
  },
  loginEmailMissing: {
    ko: '\ub85c\uadf8\uc778 \uc774\uba54\uc77c\uc744 \ud655\uc778\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.',
    en: 'We could not confirm your login email.',
    vi: 'Khong the xac nhan email dang nhap cua ban.',
  },
  joinSuccess: {
    ko: '\uc18c\uc18d \ud68c\uc0ac \uc2b9\uc778 \uc694\uccad\uc774 \uc811\uc218\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc2b9\uc778 \ud6c4 \uc774\uba54\uc77c\ub85c \uc548\ub0b4\ub4dc\ub9bd\ub2c8\ub2e4.',
    en: 'Your company access request has been submitted. We will notify you by email after approval.',
    vi: 'Yeu cau tham gia cong ty da duoc gui. Chung toi se thong bao qua email sau khi duoc phe duyet.',
  },
  joinError: {
    ko: '\uc18c\uc18d \ud68c\uc0ac \uc694\uccad \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.',
    en: 'An error occurred while requesting company access.',
    vi: 'Da xay ra loi khi gui yeu cau tham gia cong ty.',
  },
  registerNameError: {
    ko: '\ud68c\uc0ac\uba85\uc740 {min}~{max}\uc790\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694.',
    en: 'Company name must be between {min} and {max} characters.',
    vi: 'Ten cong ty phai dai tu {min} den {max} ky tu.',
  },
  registerOrganizationTypeError: {
    ko: '\uc5c5\uc885\uc744 \uc120\ud0dd\ud574 \uc8fc\uc138\uc694.',
    en: 'Please choose an organization type.',
    vi: 'Vui long chon loai hinh to chuc.',
  },
  registerCountryError: {
    ko: '\uad6d\uac00\ub97c \uc120\ud0dd\ud574 \uc8fc\uc138\uc694.',
    en: 'Please choose a country.',
    vi: 'Vui long chon quoc gia.',
  },
  registerAddressError: {
    ko: '\ud68c\uc0ac \uc8fc\uc18c\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694.',
    en: 'Please enter the company address.',
    vi: 'Vui long nhap dia chi cong ty.',
  },
  registerBusinessNumberRequired: {
    ko: '\uc0ac\uc5c5\uc790\ub4f1\ub85d\ubc88\ud638\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694.',
    en: 'Please enter the business registration number.',
    vi: 'Vui long nhap so dang ky kinh doanh.',
  },
  registerRepresentativeNameError: {
    ko: '\ub2f4\ub2f9\uc790 \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694. (\ucd5c\ub300 {max}\uc790)',
    en: 'Please enter a contact name. (Max {max} characters)',
    vi: 'Vui long nhap ten nguoi lien he. (Toi da {max} ky tu)',
  },
  registerRepresentativeContactError: {
    ko: '\ub300\ud45c \uc5f0\ub77d\ucc98\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694. (\ucd5c\ub300 {max}\uc790)',
    en: 'Please enter the primary contact. (Max {max} characters)',
    vi: 'Vui long nhap so lien he chinh. (Toi da {max} ky tu)',
  },
  registerRepresentativeEmailError: {
    ko: '\ub300\ud45c \uc774\uba54\uc77c\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.',
    en: 'Please enter the primary email.',
    vi: 'Vui long nhap email chinh.',
  },
  registerSuccess: {
    ko: '\uc2e0\uaddc \ud68c\uc0ac \ub4f1\ub85d \uc694\uccad\uc774 \uc811\uc218\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc2b9\uc778 \ud6c4 \uc774\uba54\uc77c\ub85c \uc548\ub0b4\ub4dc\ub9bd\ub2c8\ub2e4.',
    en: 'Your new company registration request has been submitted. We will notify you by email after approval.',
    vi: 'Yeu cau dang ky cong ty moi da duoc gui. Chung toi se thong bao qua email sau khi duoc phe duyet.',
  },
  registerError: {
    ko: '\uc2e0\uaddc \ud68c\uc0ac \ub4f1\ub85d \uc694\uccad \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.',
    en: 'An error occurred while submitting the new company registration request.',
    vi: 'Da xay ra loi khi gui yeu cau dang ky cong ty moi.',
  },
  searchHintEmpty: {
    ko: '\ud68c\uc0ac\uba85 \ub610\ub294 \ucf54\ub4dc \uc77c\ubd80\ub97c \uc785\ub825\ud558\uba74 \uc77c\uce58 \uc5c5\uccb4\ub9cc \ud45c\uc2dc\ub429\ub2c8\ub2e4.',
    en: 'Enter part of the company name or code to see matching organizations only.',
    vi: 'Nhap mot phan ten cong ty hoac ma de chi hien thi cac cong ty phu hop.',
  },
  searchHintResults: {
    ko: '{count}\uac1c \uc5c5\uccb4\uac00 \uac80\uc0c9\ub418\uc5c8\uc2b5\ub2c8\ub2e4.',
    en: '{count} matching organizations found.',
    vi: 'Da tim thay {count} cong ty phu hop.',
  },
  searchHintNoMatch: {
    ko: '\uc77c\uce58\ud558\ub294 \uc5c5\uccb4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4. \uc2e0\uaddc \ud68c\uc0ac \ub4f1\ub85d\uc744 \uc9c4\ud589\ud574 \uc8fc\uc138\uc694.',
    en: 'No matching organization was found. Please proceed with new company registration.',
    vi: 'Khong tim thay cong ty phu hop. Vui long tiep tuc dang ky cong ty moi.',
  },
  pageTitle: {
    ko: '\uc2e0\uaddc \uacc4\uc815 \ud655\uc778\uc774 \ud544\uc694\ud569\ub2c8\ub2e4',
    en: 'New account verification is required',
    vi: 'Can xac minh tai khoan moi',
  },
  pageSubtitle: {
    ko: '\uc18c\uc18d \ud68c\uc0ac\ub97c \uac80\uc0c9\ud574\uc11c \uc2b9\uc778 \uc694\uccad\ud558\uac70\ub098, \ud68c\uc0ac\uac00 \uc5c6\uc73c\uba74 \uc2e0\uaddc \ub4f1\ub85d\uc744 \uc9c4\ud589\ud574 \uc8fc\uc138\uc694.',
    en: 'Search for your company to request approval, or register a new one if it does not exist.',
    vi: 'Tim cong ty cua ban de gui yeu cau phe duyet, hoac dang ky cong ty moi neu chua co.',
  },
  selectCompany: {
    ko: '\uc18c\uc18d \ud68c\uc0ac \uc120\ud0dd',
    en: 'Select your company',
    vi: 'Chon cong ty cua ban',
  },
  registerCompany: {
    ko: '\uc2e0\uaddc \ud68c\uc0ac \ub4f1\ub85d',
    en: 'Register new company',
    vi: 'Dang ky cong ty moi',
  },
  noOptionsMatched: {
    ko: '\uc77c\uce58 \uc5c5\uccb4 \uc5c6\uc74c',
    en: 'No matching organizations',
    vi: 'Khong co cong ty phu hop',
  },
  noOptionsEmpty: {
    ko: '\ud68c\uc0ac\uba85\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694',
    en: 'Please enter a company name',
    vi: 'Vui long nhap ten cong ty',
  },
  searchLabel: {
    ko: '\ud68c\uc0ac\uba85 \ub610\ub294 \ucf54\ub4dc \uac80\uc0c9',
    en: 'Search company name or code',
    vi: 'Tim ten cong ty hoac ma',
  },
  searchPlaceholder: {
    ko: '\uc608: lineos, LNSO',
    en: 'e.g. lineos, LNSO',
    vi: 'vi du: lineos, LNSO',
  },
  codeLabel: { ko: '\ucf54\ub4dc', en: 'Code', vi: 'Ma' },
  organizationLoading: {
    ko: '\uc5c5\uccb4 \ubaa9\ub85d \ubd88\ub7ec\uc624\ub294 \uc911...',
    en: 'Loading organizations...',
    vi: 'Dang tai danh sach cong ty...',
  },
  joinSubmitting: { ko: '\uc694\uccad \uc911...', en: 'Submitting...', vi: 'Dang gui...' },
  joinRequest: {
    ko: '\uc18c\uc18d \ud68c\uc0ac \uc2b9\uc778 \uc694\uccad',
    en: 'Request company approval',
    vi: 'Gui yeu cau phe duyet cong ty',
  },
  joinHelper: {
    ko: '\uc18c\uc18d \ud68c\uc0ac \uc2b9\uc778 \uc694\uccad\uc740 \ud574\ub2f9 \ud68c\uc0ac\uc758 \uad00\ub9ac\uc790/\uc6b4\uc601\uc790\uc5d0\uac8c \uc804\ub2ec\ub418\uba70 \uc2b9\uc778 \ud6c4 \uc774\uba54\uc77c\ub85c \uc548\ub0b4\ub429\ub2c8\ub2e4.',
    en: 'Approval requests are sent to that company\'s admins/operators, and we will notify you by email after approval.',
    vi: 'Yeu cau phe duyet se duoc gui toi quan tri vien va nguoi van hanh cua cong ty do, va chung toi se thong bao qua email sau khi duoc phe duyet.',
  },
  goLogin: {
    ko: '\ub2e4\ub978 \uacc4\uc815\uc73c\ub85c \ub2e4\uc2dc \ub85c\uadf8\uc778',
    en: 'Sign in with a different account',
    vi: 'Dang nhap lai bang tai khoan khac',
  },
  drawerTitle: {
    ko: '\uc2e0\uaddc \ud68c\uc0ac \ub4f1\ub85d',
    en: 'Register new company',
    vi: 'Dang ky cong ty moi',
  },
  drawerSubtitle: {
    ko: '\uc0ac\uc5c5\uc790\ub4f1\ub85d \uc815\ubcf4\ub97c \uc815\ud655\ud788 \uc785\ub825\ud574 \uc8fc\uc138\uc694.',
    en: 'Please enter accurate business registration information.',
    vi: 'Vui long nhap chinh xac thong tin dang ky kinh doanh.',
  },
  close: { ko: '\ub2eb\uae30', en: 'Close', vi: 'Dong' },
  organizationType: { ko: '\uc5c5\uc885', en: 'Organization type', vi: 'Loai hinh to chuc' },
  organizationTypeManufacturer: { ko: '\uacf5\uc7a5', en: 'Manufacturer', vi: 'Nha may' },
  organizationTypeBrand: { ko: '\ube0c\ub79c\ub4dc', en: 'Brand', vi: 'Thuong hieu' },
  selectPrompt: { ko: '\uc120\ud0dd\ud574 \uc8fc\uc138\uc694', en: 'Please select', vi: 'Vui long chon' },
  companyName: { ko: '\ud68c\uc0ac\uba85', en: 'Company name', vi: 'Ten cong ty' },
  countryLabel: { ko: '\uad6d\uac00', en: 'Country', vi: 'Quoc gia' },
  companyAddress: { ko: '\ud68c\uc0ac \uc8fc\uc18c', en: 'Company address', vi: 'Dia chi cong ty' },
  businessNumber: { ko: '\uc0ac\uc5c5\uc790\ub4f1\ub85d\ubc88\ud638', en: 'Business registration no.', vi: 'So dang ky kinh doanh' },
  representativeName: { ko: '\ub2f4\ub2f9\uc790 \uc774\ub984', en: 'Contact name', vi: 'Ten nguoi lien he' },
  representativeContact: { ko: '\ub300\ud45c \uc5f0\ub77d\ucc98', en: 'Primary contact', vi: 'So lien he chinh' },
  representativeEmail: { ko: '\ub300\ud45c \uc774\uba54\uc77c', en: 'Primary email', vi: 'Email chinh' },
  registerSubmitting: { ko: '\ub4f1\ub85d \uc694\uccad \uc911...', en: 'Submitting registration...', vi: 'Dang gui dang ky...' },
  registerSubmit: { ko: '\ub4f1\ub85d \uc694\uccad \ubcf4\ub0b4\uae30', en: 'Send registration request', vi: 'Gui yeu cau dang ky' },
  cancel: { ko: '\ucde8\uc18c', en: 'Cancel', vi: 'Huy' },
};

const resolveOnboardingText = (key, languageCode, params = null) => {
  const bundle = ONBOARDING_TEXT[key] || {};
  const template = bundle[languageCode] || bundle.en || '';
  if (!params || typeof params !== 'object') return template;
  return Object.entries(params).reduce(
    (message, [token, value]) => message.replace(`{${token}}`, String(value)),
    template
  );
};

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
  representativeName: '',
  representativeContact: '',
  representativeEmail: requesterEmail || '',
});

const getBusinessNumberErrorMessage = (country, languageCode) =>
  country === 'VN'
    ? resolveOnboardingText('businessNumberErrorVn', languageCode)
    : resolveOnboardingText('businessNumberErrorKr', languageCode);

const Onboarding = () => {
  const navigate = useNavigate();
  const { languageCode } = useLanguage();
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
  const t = (key, params = null) => resolveOnboardingText(key, languageCode, params);
  const countryOptions = useMemo(
    () =>
      COUNTRY_OPTIONS.map((option) => ({
        ...option,
        label: option.value === 'VN' ? t('countryVn') : t('countryKr'),
      })),
    [languageCode]
  );
  const organizationTypeOptions = useMemo(
    () =>
      ORGANIZATION_TYPE_OPTIONS.map((option) => ({
        ...option,
        label:
          option.value === 'MANUFACTURER'
            ? t('organizationTypeManufacturer')
            : t('organizationTypeBrand'),
      })),
    [languageCode]
  );

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

  const matchedOrganizations = useMemo(() => {
    const searchText = String(companySearchText || '').trim();
    if (!searchText) return [];
    return organizations.filter((organization) =>
      matchesAutocompleteSearch(
        {
          ...organization,
          searchText: getOrganizationSearchKey(organization),
        },
        searchText,
        (option) => option?.name || ''
      )
    );
  }, [companySearchText, organizations]);

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
      setErrorMessage(t('selectOrganizationFirst'));
      return;
    }
    if (!requesterEmail) {
      setErrorMessage(t('loginEmailMissing'));
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
      setSuccessMessage(t('joinSuccess'));
    } catch (error) {
      setErrorMessage(error?.message || t('joinError'));
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
    const representativeName = String(registerForm.representativeName || '').trim();
    const representativeContact = String(registerForm.representativeContact || '').trim();
    const representativeEmail = normalizeEmail(registerForm.representativeEmail);

    if (
      !organizationName ||
      organizationName.length < ONBOARDING_COMPANY_NAME_MIN_LENGTH ||
      organizationName.length > ONBOARDING_COMPANY_NAME_MAX_LENGTH
    ) {
      setRegisterErrorMessage(
        t('registerNameError', {
          min: ONBOARDING_COMPANY_NAME_MIN_LENGTH,
          max: ONBOARDING_COMPANY_NAME_MAX_LENGTH,
        })
      );
      return;
    }
    if (!organizationType) {
      setRegisterErrorMessage(t('registerOrganizationTypeError'));
      return;
    }
    if (country !== 'KR' && country !== 'VN') {
      setRegisterErrorMessage(t('registerCountryError'));
      return;
    }
    if (!companyAddress) {
      setRegisterErrorMessage(t('registerAddressError'));
      return;
    }
    if (!businessNumber) {
      setRegisterErrorMessage(t('registerBusinessNumberRequired'));
      return;
    }
    if (!isValidBusinessNumberFormat(country, businessNumber)) {
      setRegisterErrorMessage(getBusinessNumberErrorMessage(country, languageCode));
      return;
    }
    if (
      !representativeName ||
      representativeName.length > ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH
    ) {
      setRegisterErrorMessage(
        t('registerRepresentativeNameError', {
          max: ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH,
        })
      );
      return;
    }
    if (
      !representativeContact ||
      representativeContact.length > ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH
    ) {
      setRegisterErrorMessage(
        t('registerRepresentativeContactError', {
          max: ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH,
        })
      );
      return;
    }
    if (!representativeEmail || !representativeEmail.includes('@')) {
      setRegisterErrorMessage(t('registerRepresentativeEmailError'));
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
          contactName: representativeName,
          contactPhone: representativeContact,
          contactEmail: representativeEmail,
        }),
      });
      setSuccessMessage(t('registerSuccess'));
      setRegisterDrawerOpen(false);
      setRegisterForm(buildRegisterFormDefault(requesterEmail));
    } catch (error) {
      setRegisterErrorMessage(error?.message || t('registerError'));
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleGoLogin = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const searchHintText = (() => {
    if (!hasSearchInput) return t('searchHintEmpty');
    if (hasMatchedOrganizations) return t('searchHintResults', { count: matchedOrganizations.length });
    return t('searchHintNoMatch');
  })();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f6f8fc' }}>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 }, flex: 1 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
              {t('pageTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {t('pageSubtitle')}
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
                  {t('selectCompany')}
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleOpenRegisterDrawer}
                  startIcon={<AddBusinessRoundedIcon />}
                >
                  {t('registerCompany')}
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
                noOptionsText={hasSearchInput ? t('noOptionsMatched') : t('noOptionsEmpty')}
                getOptionLabel={(option) =>
                  option?.code ? `${option.name} (${option.code})` : option?.name || ''
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('searchLabel')}
                    placeholder={t('searchPlaceholder')}
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
                        {t('codeLabel')}: {option.code || '-'}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                loading={loadingOrganizations}
                loadingText={t('organizationLoading')}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                <Button
                  variant="contained"
                  onClick={handleJoinCompany}
                  disabled={!canJoinSelectedOrganization}
                  startIcon={joinSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {joinSubmitting ? t('joinSubmitting') : t('joinRequest')}
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary">
                {t('joinHelper')}
              </Typography>
            </Stack>
          </Paper>

          <Box sx={{ mt: 0.5 }}>
            <Button variant="text" onClick={handleGoLogin}>
              {t('goLogin')}
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
                {t('drawerTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('drawerSubtitle')}
              </Typography>
            </Box>
            <IconButton onClick={handleCloseRegisterDrawer} disabled={registerSubmitting} aria-label={t('close')}>
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
              label={t('organizationType')}
              name="organizationType"
              value={registerForm.organizationType}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            >
              <MenuItem value="">
                <em>{t('selectPrompt')}</em>
              </MenuItem>
              {organizationTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              required
              label={t('companyName')}
              name="organizationName"
              value={registerForm.organizationName}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              select
              label={t('countryLabel')}
              name="country"
              value={registerForm.country}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            >
              {countryOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              required
              label={t('companyAddress')}
              name="companyAddress"
              value={registerForm.companyAddress}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label={t('businessNumber')}
              name="businessNumber"
              value={registerForm.businessNumber}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label={t('representativeName')}
              name="representativeName"
              value={registerForm.representativeName}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label={t('representativeContact')}
              name="representativeContact"
              value={registerForm.representativeContact}
              onChange={handleRegisterChange}
              disabled={registerSubmitting}
            />
            <TextField
              fullWidth
              required
              label={t('representativeEmail')}
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
                {registerSubmitting ? t('registerSubmitting') : t('registerSubmit')}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleCloseRegisterDrawer}
                disabled={registerSubmitting}
              >
                {t('cancel')}
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
