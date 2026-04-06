import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../components/AppPageContainer';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';

const resolveNameFromEmail = (email) => {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized || !normalized.includes('@')) return '';
  return normalized.split('@')[0];
};

const resolveFallbackProfileName = ({ employeeName, userMetadata, email }) => {
  const profileName = typeof employeeName === 'string' ? employeeName.trim() : '';
  if (profileName) return profileName;

  const metadataCandidates = [
    userMetadata?.name,
    userMetadata?.full_name,
    userMetadata?.nickname,
  ];
  const metadataName = metadataCandidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim()
  );
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  return resolveNameFromEmail(email);
};

const buildProfileInfo = (data = {}, fallbackName = '') => ({
  email: data.email ?? '',
  name: data.name ?? fallbackName,
  phone: data.phone ?? '',
  bankName: data.bankName ?? '',
  bankAccountNumber: data.bankAccountNumber ?? '',
});

const TEXT = {
  title: '\uAC1C\uC778 \uC815\uBCF4',
  save: '\uC800\uC7A5',
  email: '\uC774\uBA54\uC77C',
  name: '\uC774\uB984',
  phone: '\uC5F0\uB77D\uCC98',
  bankName: '\uC740\uD589',
  bankAccountNumber: '\uACC4\uC88C\uBC88\uD638',
  readOnly: '(\uC218\uC815 \uBD88\uAC00)',
  saveSuccess: '\uAC1C\uC778 \uC815\uBCF4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
  saveError: '\uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.',
};

const MyProfile = () => {
  const { showNotification } = useAppActions();
  const { updateActiveProfile, user, activeProfile } = useAuth();
  const [formData, setFormData] = useState(buildProfileInfo());
  const [savedFormData, setSavedFormData] = useState(buildProfileInfo());
  const [isSaving, setIsSaving] = useState(false);
  const fallbackProfileName = useMemo(
    () =>
      resolveFallbackProfileName({
        employeeName: activeProfile?.employeeName,
        userMetadata: user?.user_metadata,
        email: activeProfile?.email || user?.email || '',
      }),
    [activeProfile?.email, activeProfile?.employeeName, user?.email, user?.user_metadata]
  );

  useEffect(() => {
    let active = true;

    const fetchProfile = async () => {
      try {
        const data = await requestJSON('/employees/me');
        if (!active || !data) return;
        const nextFormData = buildProfileInfo(data, fallbackProfileName);
        setFormData(nextFormData);
        setSavedFormData(nextFormData);
      } catch (_error) {
        // ignore fetch errors
      }
    };

    fetchProfile();
    return () => {
      active = false;
    };
  }, [fallbackProfileName]);

  useEffect(() => {
    if (!fallbackProfileName) return;
    setFormData((prev) => (prev.name ? prev : { ...prev, name: fallbackProfileName }));
    setSavedFormData((prev) => (prev.name ? prev : { ...prev, name: fallbackProfileName }));
  }, [fallbackProfileName]);

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
        phone: formData.phone?.trim(),
        bankName: formData.bankName?.trim(),
        bankAccountNumber: formData.bankAccountNumber?.trim(),
      };
      const saved = await requestJSON('/employees/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const nextFormData = buildProfileInfo(saved, fallbackProfileName);
      setFormData(nextFormData);
      setSavedFormData(nextFormData);
      updateActiveProfile({
        employeeName: nextFormData.name?.trim() || null,
      });
      showNotification(TEXT.saveSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || TEXT.saveError, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const InfoRow = ({ label, value, name, disabled }) => (
    <Box sx={{ py: 1.5, borderBottom: '1px solid #eee' }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
        {label}
        {disabled && (
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>
            {TEXT.readOnly}
          </Typography>
        )}
      </Typography>
      <TextField
        fullWidth
        name={name}
        value={value}
        onChange={disabled ? undefined : handleInputChange}
        InputProps={{ readOnly: disabled }}
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
        <InfoRow label={TEXT.email} value={formData.email} disabled />
        <InfoRow label={TEXT.name} name="name" value={formData.name} />
        <InfoRow label={TEXT.phone} name="phone" value={formData.phone} />
        <InfoRow label={TEXT.bankName} name="bankName" value={formData.bankName} />
        <InfoRow
          label={TEXT.bankAccountNumber}
          name="bankAccountNumber"
          value={formData.bankAccountNumber}
        />
      </Paper>
    </AppPageContainer>
  );
};

export default MyProfile;
