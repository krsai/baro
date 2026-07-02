import { useEffect, useMemo, useState } from 'react';
import {
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import {
  ORGANIZATION_TYPE_KEYS,
  normalizeOrganizationType,
} from '../../../constants/organizationType';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { requestJSON } from '../../../utils/apiClient';

const EMPLOYEE_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const normalizePositiveId = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
};

const buildCompanyInfo = (data = {}) => {
  const representativeEmployee = data.representativeEmployee || null;
  return {
    name: data.name ?? '',
    nameKo: data.nameKo ?? '',
    nameVi: data.nameVi ?? '',
    businessNumber: data.businessNumber ?? '',
    representativeEmployeeId: normalizePositiveId(data.representativeEmployeeId),
    representative: representativeEmployee?.name ?? data.representative ?? '',
    industry: normalizeOrganizationType(data.industry) || normalizeOrganizationType(data.type),
    address: data.address ?? '',
    phone: representativeEmployee ? representativeEmployee.phone ?? '' : data.phone ?? '',
    email: representativeEmployee ? representativeEmployee.email ?? '' : data.email ?? '',
  };
};

const buildEmployeeOptionLabel = (employee) => {
  const name = String(employee?.name || '').trim() || '-';
  const employeeNo = String(employee?.employeeNo || '').trim();
  return employeeNo ? `${name} (${employeeNo})` : name;
};

const getLocalText = (languageCode) => {
  if (languageCode === 'vi') {
    return {
      nameEn: 'Ten cong ty (tieng Anh)',
      nameKo: 'Ten cong ty (tieng Han)',
      nameVi: 'Ten cong ty (tieng Viet)',
      representativeNone: 'Khong co',
      representativeLoading: 'Dang tai nhan vien.',
      industryOptions: {
        [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 'Nha may',
        [ORGANIZATION_TYPE_KEYS.BRAND]: 'Thuong hieu',
      },
    };
  }
  if (languageCode === 'en') {
    return {
      nameEn: 'Company Name (English)',
      nameKo: 'Company Name (Korean)',
      nameVi: 'Company Name (Vietnamese)',
      representativeNone: 'None',
      representativeLoading: 'Loading employees.',
      industryOptions: {
        [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 'Manufacturer',
        [ORGANIZATION_TYPE_KEYS.BRAND]: 'Brand',
      },
    };
  }
  return {
    nameEn: '\uD68C\uC0AC\uBA85 \uC601\uC5B4',
    nameKo: '\uD68C\uC0AC\uBA85 \uD55C\uAE00',
    nameVi: '\uD68C\uC0AC\uBA85 \uBCA0\uD2B8\uB0A8\uC5B4',
    representativeNone: '\uC5C6\uC74C',
    representativeLoading: '\uC9C1\uC6D0 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.',
    industryOptions: {
      [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: '\uACF5\uC7A5',
      [ORGANIZATION_TYPE_KEYS.BRAND]: '\uBE0C\uB79C\uB4DC',
    },
  };
};

const FormGroup = ({ children }) => (
  <Paper
    variant="outlined"
    sx={{
      width: '100%',
      p: { xs: 2, md: 3 },
      borderRadius: 2,
      borderColor: 'divider',
      backgroundColor: '#fff',
    }}
  >
    <Stack spacing={2.25}>{children}</Stack>
  </Paper>
);

const OrganizationDetail = () => {
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const { updateActiveProfile } = useAuth();
  const [organizationId, setOrganizationId] = useState(null);
  const [formData, setFormData] = useState(buildCompanyInfo());
  const [savedFormData, setSavedFormData] = useState(buildCompanyInfo());
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const localText = useMemo(() => getLocalText(languageCode), [languageCode]);
  const text = useMemo(
    () => ({
      title: getUiMessage('organizationDetail.title', 'Company Info', languageCode),
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
        // keep the page usable even if the optional detail fetch fails
      }
    };

    fetchOrganization();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setEmployeesLoading(true);
    requestJSON('/employees')
      .then((data) => {
        if (!active) return;
        const safeEmployees = (Array.isArray(data) ? data : []).sort((left, right) =>
          EMPLOYEE_COLLATOR.compare(
            buildEmployeeOptionLabel(left),
            buildEmployeeOptionLabel(right)
          )
        );
        setEmployees(safeEmployees);
      })
      .catch(() => {
        if (!active) return;
        setEmployees([]);
      })
      .finally(() => {
        if (!active) return;
        setEmployeesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const employeeOptions = useMemo(() => {
    const byId = new Map();
    employees.forEach((employee) => {
      const employeeId = normalizePositiveId(employee?.id);
      if (employeeId) byId.set(employeeId, employee);
    });
    const selectedId = normalizePositiveId(formData.representativeEmployeeId);
    if (selectedId && !byId.has(selectedId)) {
      byId.set(selectedId, {
        id: selectedId,
        name: formData.representative,
        phone: formData.phone,
        email: formData.email,
      });
    }
    return Array.from(byId.values()).sort((left, right) =>
      EMPLOYEE_COLLATOR.compare(buildEmployeeOptionLabel(left), buildEmployeeOptionLabel(right))
    );
  }, [
    employees,
    formData.email,
    formData.phone,
    formData.representative,
    formData.representativeEmployeeId,
  ]);

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(savedFormData),
    [formData, savedFormData]
  );
  useUnsavedChanges(isDirty);

  const isNameValid = formData.name.trim().length > 0;

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === 'representativeEmployeeId') {
      const representativeEmployeeId = normalizePositiveId(value);
      const selectedEmployee =
        employeeOptions.find((employee) => normalizePositiveId(employee?.id) === representativeEmployeeId) ||
        null;
      setFormData((prev) => ({
        ...prev,
        representativeEmployeeId,
        representative: selectedEmployee?.name ?? '',
        phone: selectedEmployee?.phone ?? '',
        email: selectedEmployee?.email ?? '',
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!isDirty || isSaving || !isNameValid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        nameKo: formData.nameKo?.trim() || null,
        nameVi: formData.nameVi?.trim() || null,
        businessNumber: formData.businessNumber?.trim() || null,
        representativeEmployeeId: formData.representativeEmployeeId || null,
        representative: formData.representative?.trim() || null,
        industry: formData.industry || null,
        address: formData.address?.trim() || null,
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
          disabled={!isDirty || isSaving || !isNameValid}
          loading={isSaving}
        />
      )}
    >
      <FormGroup>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              select
              size="small"
              label={text.industry}
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
            >
              <MenuItem value="">-</MenuItem>
              {Object.entries(localText.industryOptions).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              size="small"
              label={localText.nameEn}
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              error={Boolean(formData.name) && !isNameValid}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label={localText.nameKo}
              name="nameKo"
              value={formData.nameKo}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label={localText.nameVi}
              name="nameVi"
              value={formData.nameVi}
              onChange={handleInputChange}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              select
              size="small"
              label={text.representative}
              name="representativeEmployeeId"
              value={formData.representativeEmployeeId}
              onChange={handleInputChange}
              disabled={employeesLoading}
              helperText={employeesLoading ? localText.representativeLoading : ' '}
            >
              <MenuItem value="">{localText.representativeNone}</MenuItem>
              {employeeOptions.map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>
                  {buildEmployeeOptionLabel(employee)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label={text.phone}
              name="phone"
              value={formData.phone}
              InputProps={{ readOnly: true }}
              sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label={text.email}
              name="email"
              type="email"
              value={formData.email}
              InputProps={{ readOnly: true }}
              sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label={text.address}
              name="address"
              value={formData.address}
              onChange={handleInputChange}
            />
          </Grid>
        </Grid>
      </FormGroup>
    </AppPageContainer>
  );
};

export default OrganizationDetail;
