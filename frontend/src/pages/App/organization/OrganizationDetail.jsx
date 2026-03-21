import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { requestJSON } from '../../../utils/apiClient';

const buildCompanyInfo = (data = {}) => ({
  name: data.name ?? '',
  businessNumber: data.businessNumber ?? '',
  representative: data.representative ?? '',
  industry: data.industry ?? '',
  address: data.address ?? '',
  phone: data.phone ?? '',
  email: data.email ?? '',
});

const TEXT = {
  title: '\uD68C\uC0AC \uC815\uBCF4',
  save: '\uC800\uC7A5',
  name: '\uD68C\uC0AC\uBA85',
  businessNumber: '\uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638',
  representative: '\uB300\uD45C\uC790\uBA85',
  industry: '\uC5C5\uC885',
  address: '\uC8FC\uC18C',
  phone: '\uC5F0\uB77D\uCC98',
  email: '\uC774\uBA54\uC77C',
  saveSuccess: '\uD68C\uC0AC \uC815\uBCF4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
  saveError: '\uD68C\uC0AC \uC815\uBCF4 \uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.',
};

const OrganizationDetail = () => {
  const { showNotification } = useApp();
  const { updateActiveProfile } = useAuth();
  const [organizationId, setOrganizationId] = useState(null);
  const [formData, setFormData] = useState(buildCompanyInfo());
  const [savedFormData, setSavedFormData] = useState(buildCompanyInfo());
  const [isSaving, setIsSaving] = useState(false);

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
      showNotification(TEXT.saveSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || TEXT.saveError, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const InfoRow = ({ label, value, name }) => (
    <Box sx={{ py: 1.5, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
      </Typography>
      <TextField
        fullWidth
        name={name}
        value={value}
        onChange={handleInputChange}
        sx={{ '& .MuiInputBase-input': { fontWeight: 500 } }}
      />
    </Box>
  );

  return (
    <AppPageContainer
      title={TEXT.title}
      titleActions={(
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {TEXT.save}
        </Button>
      )}
    >
      <Paper variant="outlined" sx={{ width: '100%', p: 3, borderRadius: 2 }}>
        <InfoRow label={TEXT.name} name="name" value={formData.name} />
        <InfoRow
          label={TEXT.businessNumber}
          name="businessNumber"
          value={formData.businessNumber}
        />
        <InfoRow
          label={TEXT.representative}
          name="representative"
          value={formData.representative}
        />
        <InfoRow label={TEXT.industry} name="industry" value={formData.industry} />
        <InfoRow label={TEXT.address} name="address" value={formData.address} />
        <InfoRow label={TEXT.phone} name="phone" value={formData.phone} />
        <InfoRow label={TEXT.email} name="email" value={formData.email} />
      </Paper>
    </AppPageContainer>
  );
};

export default OrganizationDetail;
