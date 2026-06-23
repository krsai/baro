import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
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
  businessNumber: data.businessNumber ?? '',
  representative: data.representative ?? '',
  industry: String(data.industry ?? '').trim() || getOrganizationTypeLabel(data.type, ''),
  address: data.address ?? '',
  phone: data.phone ?? '',
  email: data.email ?? '',
});

const InfoRow = ({ label, value, name, onChange }) => (
  <Box sx={{ py: 1.5, borderBottom: '1px solid #eee' }}>
    <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
      {label}
    </Typography>
    <TextField
      fullWidth
      name={name}
      value={value}
      onChange={onChange}
      sx={{ '& .MuiInputBase-input': { fontWeight: 500 } }}
    />
  </Box>
);

const OrganizationDetail = () => {
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const { updateActiveProfile } = useAuth();
  const [organizationId, setOrganizationId] = useState(null);
  const [formData, setFormData] = useState(buildCompanyInfo());
  const [savedFormData, setSavedFormData] = useState(buildCompanyInfo());
  const [isSaving, setIsSaving] = useState(false);
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
      <Paper variant="outlined" sx={{ width: '100%', p: 3, borderRadius: 2 }}>
        <InfoRow
          label={text.name}
          name="name"
          value={formData.name}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.businessNumber}
          name="businessNumber"
          value={formData.businessNumber}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.representative}
          name="representative"
          value={formData.representative}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.industry}
          name="industry"
          value={formData.industry}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.address}
          name="address"
          value={formData.address}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.phone}
          name="phone"
          value={formData.phone}
          onChange={handleInputChange}
        />
        <InfoRow
          label={text.email}
          name="email"
          value={formData.email}
          onChange={handleInputChange}
        />
      </Paper>
    </AppPageContainer>
  );
};

export default OrganizationDetail;
