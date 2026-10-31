import { LOCALIZED_NAME_HELP } from '../../../components/LocalizedNameFields';
import {ENTITY_CODE_TEXT,entityCodeError} from '../../../utils/entityCode.mjs';
import { normalizeLocalizedName, hasLocalizedName } from '../../../utils/localizedName.mjs';
import EntityBankAccounts from '../../../components/EntityBankAccounts';
import { createPortal } from 'react-dom';
import EntityDetailSection from '../../../components/EntityDetailSection';
import Grid from '@mui/material/Grid';
import PageContentStack from '../../../components/PageContentStack';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import {
  ORGANIZATION_TYPE_KEYS,
  normalizeOrganizationType,
} from '../../../constants/organizationType';
import { getUiMessage } from '../../../constants/uiMessages';
import { getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { getSizeSetOptions, normalizeSizeSetCode } from '../../../constants/productAttributes';
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
    code: data.code ?? '',
    businessNumber: data.businessNumber ?? '',
    representativeEmployeeId: normalizePositiveId(data.representativeEmployeeId),
    representative: representativeEmployee?.name ?? data.representative ?? '',
    industry: normalizeOrganizationType(data.industry) || normalizeOrganizationType(data.type),
    country: data.country ?? 'VN',
    defaultSizeSetCode: normalizeSizeSetCode(data.defaultSizeSetCode),
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
      representativeNone: 'Không có',
      representativeLoading: 'Đang tải nhan vien.',
      identityTitle: 'Thông tin phap nhan', identityHelp: 'Quản lý loai hinh, thong tin dang ky va ten cong ty.',
      contactTitle: 'Người đại diện va lien he', contactHelp: 'Thông tin lien he duoc lay tu nhan vien dai dien.',
      addressTitle: 'Địa chỉ doanh nghiep', addressHelp: 'Nhap dia chi day du cua doanh nghiep.',
      country: 'Quoc gia',
      orderTitle: 'Thiet lap don hang mac dinh', orderHelp: 'Chi ap dung cho to chuc thuong hieu.', sizeSet: 'Cach ghi kich co mac dinh', businessNumber: 'Ma so doanh nghiep',
      orgCode: 'Ma to chuc',
      industryOptions: {
        [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: 'Nhà máy',
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
      identityTitle: 'Legal entity information', identityHelp: 'Manage company type, registration, and official names.',
      contactTitle: 'Representative and contact', contactHelp: 'Contact details come from the selected representative.',
      addressTitle: 'Business address', addressHelp: 'Enter the full registered business address.',
      country: 'Country',
      orderTitle: 'Order defaults', orderHelp: 'Available only for brand organizations.', sizeSet: 'Default size notation', businessNumber: 'Business registration no.',
      orgCode: 'Organization Code',
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
    identityTitle: '법인 기본 정보', identityHelp: '업종, 등록 정보와 언어별 공식 회사명을 관리합니다.',
    contactTitle: '대표자 및 연락처', contactHelp: '선택한 대표 직원의 연락처가 자동으로 표시됩니다.',
    addressTitle: '사업장 주소', addressHelp: '법인의 전체 사업장 주소를 입력하세요.',
    country: '국가',
    orderTitle: '기본 주문 설정', orderHelp: '브랜드 법인에서만 사용하는 신규 주문 기본값입니다.', sizeSet: '기본 사이즈 표기 방식', businessNumber: '사업자등록번호',
    orgCode: '업체 코드',
    industryOptions: {
      [ORGANIZATION_TYPE_KEYS.MANUFACTURER]: '\uACF5\uC7A5',
      [ORGANIZATION_TYPE_KEYS.BRAND]: '\uBE0C\uB79C\uB4DC',
    },
  };
};

const OrganizationDetail = ({ headerActionsTarget } = {}) => {
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
  const sizeSetOptions = useMemo(() => getSizeSetOptions(languageCode), [languageCode]);
  const countryOptions = useMemo(() => getStaticOptionOptions('country', languageCode), [languageCode]);
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

  const isNameValid = hasLocalizedName(formData, 'name');

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
        code: formData.code?.trim() || '',
        name: normalizeLocalizedName(formData, 'name').name,
        nameKo: formData.nameKo?.trim() || null,
        nameVi: formData.nameVi?.trim() || null,
        businessNumber: formData.businessNumber?.trim() || null,
        representativeEmployeeId: formData.representativeEmployeeId || null,
        representative: formData.representative?.trim() || null,
        industry: formData.industry || null,
        country: formData.country || null,
        address: formData.address?.trim() || null,
        defaultSizeSetCode: formData.defaultSizeSetCode,
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
      showNotification(entityCodeError(error,languageCode,text.saveError), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const embedded = headerActionsTarget !== undefined;
  const Container = embedded ? Box : AppPageContainer;
  const saveAction = <SaveButton onClick={handleSave} disabled={!isDirty || isSaving || !isNameValid} loading={isSaving} />;
  return <>
    {headerActionsTarget && createPortal(saveAction,headerActionsTarget)}
    <Container {...(embedded ? {sx:{minWidth:0}} : {title:text.title,titleActions:saveAction,sx:{maxWidth:1280,width:'100%'}})}>
      <PageContentStack  >
      <EntityDetailSection title={localText.identityTitle}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:6,md:4}}>
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

          <Grid size={{xs:12,sm:6,md:4}}>
            <TextField fullWidth size="small" label={localText.businessNumber} name="businessNumber" value={formData.businessNumber} onChange={handleInputChange} />
          </Grid>
          <Grid size={{xs:12,sm:6,md:4}}>
            <TextField
              fullWidth
              size="small"
              label={localText.orgCode}
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              inputProps={{maxLength:40}}
              helperText={(ENTITY_CODE_TEXT[languageCode]||ENTITY_CODE_TEXT.en).help}
              disabled={isSaving}
            />
          </Grid>
          <Grid size={{xs:12,sm:6,md:4}}>
            <TextField
              fullWidth
              size="small"
              label={localText.nameEn}
              helperText={LOCALIZED_NAME_HELP[languageCode] || LOCALIZED_NAME_HELP.en}
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              error={Boolean(formData.name) && !isNameValid}
            />
          </Grid>
          <Grid size={{xs:12,sm:6,md:4}}>
            <TextField
              fullWidth
              size="small"
              label={localText.nameKo}
              name="nameKo"
              value={formData.nameKo}
              onChange={handleInputChange}
            />
          </Grid>
          <Grid size={{xs:12,sm:6,md:4}}>
            <TextField
              fullWidth
              size="small"
              label={localText.nameVi}
              name="nameVi"
              value={formData.nameVi}
              onChange={handleInputChange}
            />
          </Grid>

        </Grid>
      </EntityDetailSection>



      <EntityDetailSection title={localText.contactTitle}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,md:4}}>
            <TextField
              fullWidth
              select
              size="small"
              label={text.representative}
              name="representativeEmployeeId"
              value={formData.representativeEmployeeId}
              onChange={handleInputChange}
              disabled={employeesLoading}
              helperText={employeesLoading ? localText.representativeLoading : undefined}
            >
              <MenuItem value="">{localText.representativeNone}</MenuItem>
              {employeeOptions.map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>
                  {buildEmployeeOptionLabel(employee)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{xs:12,md:4}}>
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
          <Grid size={{xs:12,md:4}}>
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

        </Grid>
      </EntityDetailSection>

      <EntityDetailSection title={localText.addressTitle}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:4,md:3}}>
            <TextField fullWidth select size="small" label={localText.country} name="country" value={formData.country} onChange={handleInputChange}>
              {countryOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{xs:12,sm:8,md:9}}>
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
          </Grid></Grid>
      </EntityDetailSection>
      <EntityBankAccounts entityId={organizationId} languageCode={languageCode}/>
      {formData.industry === ORGANIZATION_TYPE_KEYS.BRAND && (
        <EntityDetailSection title={localText.orderTitle}>
          <TextField fullWidth select size="small" label={localText.sizeSet} name="defaultSizeSetCode" value={formData.defaultSizeSetCode} onChange={handleInputChange} sx={{ maxWidth: 480 }}>
            {sizeSetOptions.map((option) => <MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}
          </TextField>
        </EntityDetailSection>
      )}
      </PageContentStack>
    </Container>
  </>;
};

export default OrganizationDetail;
