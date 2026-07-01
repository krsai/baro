import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import { getOrganizationTypeLabel } from '../../../constants/organizationType';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { requestJSON } from '../../../utils/apiClient';

const buildCompanyInfo = (data = {}) => ({
  name: data.name ?? '',
  nameKo: data.nameKo ?? '',
  nameVi: data.nameVi ?? '',
  businessNumber: data.businessNumber ?? '',
  representative: data.representative ?? '',
  industry: String(data.industry ?? '').trim() || getOrganizationTypeLabel(data.type, ''),
  address: data.address ?? '',
  phone: data.phone ?? '',
  email: data.email ?? '',
});

const getLocalizedText = (languageCode) => {
  if (languageCode === 'ko') {
    return {
      identitySection: '법인 기본 정보',
      identityDescription: '대표 회사명과 사업자 기본 식별 정보를 관리합니다.',
      localizedSection: '다국어 회사명',
      localizedDescription: '화면 표시와 문서용 한글/베트남어 이름을 함께 관리합니다.',
      contactSection: '대표자 및 연락처',
      contactDescription: '실무 담당자가 바로 찾을 수 있도록 연락 정보를 묶었습니다.',
      addressSection: '주소 및 메모성 정보',
      addressDescription: '주소와 업종처럼 자주 함께 보는 항목을 한곳에 배치했습니다.',
      nameKo: '회사명 (한글)',
      nameVi: '회사명 (베트남어)',
    };
  }

  if (languageCode === 'vi') {
    return {
      identitySection: 'Thong tin doanh nghiep',
      identityDescription: 'Quan ly ten cong ty chinh va thong tin dang ky co ban.',
      localizedSection: 'Ten da ngon ngu',
      localizedDescription: 'Luu ten tieng Han va tieng Viet de hien thi tren man hinh va tai lieu.',
      contactSection: 'Nguoi dai dien va lien he',
      contactDescription: 'Gom cac thong tin lien lac de bo phan van hanh de tim nhanh hon.',
      addressSection: 'Dia chi va thong tin bo sung',
      addressDescription: 'Dat dia chi va nganh nghe vao cung mot nhom de de xem hon.',
      nameKo: 'Ten cong ty (tieng Han)',
      nameVi: 'Ten cong ty (tieng Viet)',
    };
  }

  return {
    identitySection: 'Company Identity',
    identityDescription: 'Manage the primary company name and business registration details.',
    localizedSection: 'Localized Names',
    localizedDescription: 'Store Korean and Vietnamese names for UI and document display.',
    contactSection: 'Representative & Contact',
    contactDescription: 'Keep the main business contact details together for faster review.',
    addressSection: 'Address & Context',
    addressDescription: 'Group address and industry details that are usually reviewed together.',
    nameKo: 'Company Name (Korean)',
    nameVi: 'Company Name (Vietnamese)',
  };
};

const SectionCard = ({ title, description, children }) => (
  <Paper
    variant="outlined"
    sx={{
      width: '100%',
      p: { xs: 2, md: 3 },
      borderRadius: 3,
      borderColor: 'divider',
      background:
        'linear-gradient(180deg, rgba(248,250,252,0.72) 0%, rgba(255,255,255,0.96) 100%)',
    }}
  >
    <Stack spacing={2.25}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      {children}
    </Stack>
  </Paper>
);

const OrganizationDetail = () => {
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const { updateActiveProfile } = useAuth();
  const [organizationId, setOrganizationId] = useState(null);
  const [formData, setFormData] = useState(buildCompanyInfo());
  const [savedFormData, setSavedFormData] = useState(buildCompanyInfo());
  const [isSaving, setIsSaving] = useState(false);

  const extraText = useMemo(() => getLocalizedText(languageCode), [languageCode]);
  const text = useMemo(
    () => ({
      title: getUiMessage('organizationDetail.title', 'Company Info', languageCode),
      name: getUiMessage('organizationDetail.name', 'Company Name', languageCode),
      businessNumber: getUiMessage(
        'organizationDetail.businessNumber',
        'Business Registration Number',
        languageCode
      ),
      representative: getUiMessage(
        'organizationDetail.representative',
        'Representative',
        languageCode
      ),
      industry: getUiMessage('organizationDetail.industry', 'Industry', languageCode),
      address: getUiMessage('organizationDetail.address', 'Address', languageCode),
      phone: getUiMessage('organizationDetail.phone', 'Contact', languageCode),
      email: getUiMessage('organizationDetail.email', 'Email', languageCode),
      saveSuccess: getUiMessage(
        'organizationDetail.saveSuccess',
        'Company information has been saved.',
        languageCode
      ),
      saveError: getUiMessage(
        'organizationDetail.saveError',
        'Failed to save company information.',
        languageCode
      ),
    }),
    [languageCode]
  );

  useEffect(() => {
    let active = true;

    const fetchOrganization = async () => {
      try {
        const data = await requestJSON('/organizations/primary');
        if (!active || !data) return;
        const nextFormData = buildCompanyInfo(data);
        setOrganizationId(data.id ?? null);
        setFormData(nextFormData);
        setSavedFormData(nextFormData);
      } catch (_error) {
        // ignore fetch errors in UI for now
      }
    };

    fetchOrganization();
    return () => {
      active = false;
    };
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(savedFormData),
    [formData, savedFormData]
  );
  useUnsavedChanges(isDirty);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name?.trim(),
        nameKo: formData.nameKo?.trim() || null,
        nameVi: formData.nameVi?.trim() || null,
        businessNumber: formData.businessNumber?.trim(),
        representative: formData.representative?.trim(),
        industry: formData.industry?.trim(),
        address: formData.address?.trim(),
        phone: formData.phone?.trim(),
        email: formData.email?.trim(),
      };

      const saved = await requestJSON(
        organizationId ? `/organizations/${organizationId}` : '/organizations',
        {
          method: organizationId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const nextFormData = buildCompanyInfo(saved);
      setOrganizationId(saved.id ?? null);
      setFormData(nextFormData);
      setSavedFormData(nextFormData);
      updateActiveProfile({
        orgName: nextFormData.name?.trim() || null,
      });
      showNotification(text.saveSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || text.saveError, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppPageContainer
      title={text.title}
      titleActions={(
        <SaveButton
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          loading={isSaving}
        />
      )}
    >
      <Stack spacing={2}>
        <SectionCard
          title={extraText.identitySection}
          description={extraText.identityDescription}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label={text.name}
                name="name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={text.businessNumber}
                name="businessNumber"
                value={formData.businessNumber}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={text.representative}
                name="representative"
                value={formData.representative}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={text.industry}
                name="industry"
                value={formData.industry}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </SectionCard>

        <SectionCard
          title={extraText.localizedSection}
          description={extraText.localizedDescription}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={extraText.nameKo}
                name="nameKo"
                value={formData.nameKo}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={extraText.nameVi}
                name="nameVi"
                value={formData.nameVi}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </SectionCard>

        <SectionCard
          title={extraText.contactSection}
          description={extraText.contactDescription}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={text.phone}
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={text.email}
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </SectionCard>

        <SectionCard
          title={extraText.addressSection}
          description={extraText.addressDescription}
        >
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={text.address}
            name="address"
            value={formData.address}
            onChange={handleInputChange}
          />
        </SectionCard>
      </Stack>
    </AppPageContainer>
  );
};

export default OrganizationDetail;
