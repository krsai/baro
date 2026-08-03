import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Divider,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveButton from '../../../../components/SaveButton';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../../constants/layout';
import { getStaticOptionOptions } from '../../../../constants/staticOptionRegistry';
import { getUiMessage } from '../../../../constants/uiMessages';
import { useLanguage } from '../../../../context/LanguageContext';
import { requestJSON } from '../../../../utils/apiClient';
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  normalizeFactoryManagementStartDateKey,
} from '../../../../utils/factoryManagementStart';
import {
  formatDigitsWithCommas,
  parseNumberLike,
} from '../../../../utils/numberFormat';
import FactoryWarehouseSection from './FactoryWarehouseSection';
const WORK_DAYS_PER_MONTH = 26;
const HOURS_PER_DAY = 8;
const SECONDS_PER_MONTH = WORK_DAYS_PER_MONTH * HOURS_PER_DAY * 60 * 60;
const COUNTRY_CODE_BY_COUNTRY = {
  KR: '+82',
  VN: '+84',
};
const DEFAULT_COUNTRY = 'VN';
const DEFAULT_COUNTRY_CODE = COUNTRY_CODE_BY_COUNTRY[DEFAULT_COUNTRY];
const EMPLOYEE_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const parseNumber = (value) => parseNumberLike(value);

const normalizeCountry = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || '';
};

const resolveCountryFromCountryCode = (countryCode) => {
  const normalized = String(countryCode || '').trim();
  if (normalized === COUNTRY_CODE_BY_COUNTRY.KR) return 'KR';
  if (normalized === COUNTRY_CODE_BY_COUNTRY.VN) return 'VN';
  return '';
};

const resolveDefaultCountryCode = (country) =>
  COUNTRY_CODE_BY_COUNTRY[normalizeCountry(country)] || DEFAULT_COUNTRY_CODE;

const normalizeFactoryCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);

const normalizeManagerEmployeeId = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed;
};

const buildEmployeeOptionLabel = (employee) => {
  const name = String(employee?.name || '').trim() || '-';
  const employeeNo = String(employee?.employeeNo || '').trim();
  return employeeNo ? `${name} (${employeeNo})` : name;
};

const buildFactoryFormData = (factory) => {
  const rawCountry = normalizeCountry(factory?.country);
  const countryFromCode = resolveCountryFromCountryCode(factory?.countryCode);
  const country = rawCountry || countryFromCode || DEFAULT_COUNTRY;
  return {
    name: factory?.name || '',
    nameKo: factory?.nameKo || '',
    nameVi: factory?.nameVi || '',
    factoryCode: factory?.factoryCode || '',
    managementStartDate:
      normalizeFactoryManagementStartDateKey(factory?.managementStartDate) ||
      DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
    address: factory?.address || '',
    country,
    countryCode: factory?.countryCode || resolveDefaultCountryCode(country),
    phoneNumber: factory?.phoneNumber || '',
    managerEmployeeId: normalizeManagerEmployeeId(factory?.managerEmployeeId),
    targetMonthlyWage: factory?.targetMonthlyWage ?? '',
    wagePerSecond: factory?.wagePerSecond ?? '',
  };
};

const getExtraText = (languageCode) => {
  if (languageCode === 'ko') {
    return {
      identitySection: '공장 기본 정보',
      identityDescription: '기본 공장명, 운영 시작 기준일과 관리자를 설정합니다.',
      localizedSection: '다국어 공장명',
      localizedDescription: '한글/베트남어 이름을 함께 저장해 화면과 문서에서 일관되게 사용합니다.',
      contactSection: '위치 및 연락처',
      contactDescription: '주소와 전화 연락 정보를 관리합니다.',
      payrollSection: '생산수당 설정',
      payrollDescription: '공장 공통 생산수당 초당 단가를 관리합니다.',
      payrollUpdatedAt: '생산수당 초당 단가 업데이트 날짜',
      nameKo: '공장명 (한글)',
      nameVi: '공장명 (베트남어)',
      managementStartDate: '관리 시작일',
      managementStartDateHelper:
        '작업기록, 생산분석, 배정 보드와 생산수당 계산의 최소 시작 기준일입니다.',
    };
  }

  if (languageCode === 'vi') {
    return {
      identitySection: 'Thong tin nha may',
      identityDescription: 'Dat ten nha may, ngay bat dau quan ly va nguoi quan ly.',
      localizedSection: 'Ten da ngon ngu',
      localizedDescription: 'Luu ten tieng Han va tieng Viet de dung nhat quan tren man hinh va tai lieu.',
      contactSection: 'Vi tri va lien he',
      contactDescription: 'Quan ly dia chi va thong tin dien thoai.',
      payrollSection: 'Cai dat phu cap san luong',
      payrollDescription: 'Quan ly don gia phu cap san luong theo giay cua nha may.',
      payrollUpdatedAt: 'Ngay cap nhat don gia phu cap san luong',
      nameKo: 'Ten nha may (tieng Han)',
      nameVi: 'Ten nha may (tieng Viet)',
      managementStartDate: 'Ngay bat dau quan ly',
      managementStartDateHelper:
        'La moc ngay toi thieu cho ghi chep, phan tich san xuat, bang phan cong va tinh phu cap san luong.',
    };
  }

  return {
    identitySection: 'Factory Identity',
    identityDescription: 'Set the factory name, management start date, and manager.',
    localizedSection: 'Localized Names',
    localizedDescription: 'Store Korean and Vietnamese names for consistent UI and document labels.',
    contactSection: 'Location & Contact',
    contactDescription: 'Manage the address and telephone contact details.',
    payrollSection: 'Production Allowance Settings',
    payrollDescription: 'Manage the factory-wide production allowance rate per second.',
    payrollUpdatedAt: 'Production allowance rate updated',
    nameKo: 'Factory Name (Korean)',
    nameVi: 'Factory Name (Vietnamese)',
    managementStartDate: 'Management Start Date',
    managementStartDateHelper:
      'Used as the minimum start date for work logs, production analysis, assignments, and production allowance calculation.',
  };
};

const SectionBlock = ({ title, description, children }) => (
  <Stack
    spacing={2}
    sx={{
      p: 2,
      borderRadius: 2.5,
      border: '1px solid',
      borderColor: 'divider',
      background:
        'linear-gradient(180deg, rgba(248,250,252,0.7) 0%, rgba(255,255,255,0.98) 100%)',
    }}
  >
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
);

const formatProductionAllowanceUpdatedAt = (value, languageCode) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const FactoryDetail = ({ open, onClose, onSave, factory }) => {
  const { languageCode } = useLanguage();
  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );
  const managerMessages = useMemo(() => {
    if (languageCode === 'ko') {
      return {
        helper: '해당 공장 소속 직원 중에서 관리자를 선택합니다.',
        empty: '이 공장에 소속된 직원이 없습니다.',
        saveFirst: '공장을 먼저 저장한 뒤 관리자를 선택할 수 있습니다.',
        loading: '공장 소속 직원 목록을 불러오는 중입니다.',
        none: '없음',
      };
    }
    if (languageCode === 'vi') {
      return {
        helper: 'Chi co the chon quan ly trong danh sach nhan vien cua nha may nay.',
        empty: 'Nha may nay chua co nhan vien.',
        saveFirst: 'Hay luu nha may truoc, sau do moi chon quan ly.',
        loading: 'Dang tai danh sach nhan vien cua nha may.',
        none: 'Khong co',
      };
    }
    return {
      helper: 'Select the manager from employees assigned to this factory.',
      empty: 'No employees are assigned to this factory yet.',
      saveFirst: 'Save the factory first, then choose a manager.',
      loading: 'Loading factory employees.',
      none: 'None',
    };
  }, [languageCode]);

  const extraText = useMemo(() => getExtraText(languageCode), [languageCode]);
  const text = useMemo(
    () => ({
      editTitle: getUiMessage('factoryDetail.editTitle', 'Edit Factory', languageCode),
      createTitle: getUiMessage('factoryDetail.createTitle', 'Add Factory', languageCode),
      name: getUiMessage('factoryDetail.name', 'Factory Name', languageCode),
      factoryCode: getUiMessage('factoryDetail.factoryCode', 'Factory Code', languageCode),
      factoryCodeHelper: getUiMessage(
        'factoryDetail.factoryCodeHelper',
        languageCode === 'ko'
          ? '영문 2~3자리 (예: HN, SEO)'
          : languageCode === 'vi'
            ? '2-3 ky tu chu in hoa (vi du: HN, SEO)'
            : '2-3 uppercase letters (e.g. HN, SEO)',
        languageCode
      ),
      address: getUiMessage('factoryDetail.address', 'Address', languageCode),
      manager: getUiMessage('factoryDetail.manager', 'Manager', languageCode),
      country: getUiMessage('factoryDetail.country', 'Country', languageCode),
      countryCode: getUiMessage('factoryDetail.countryCode', 'Country Code', languageCode),
      phoneNumber: getUiMessage('factoryDetail.phoneNumber', 'Phone Number', languageCode),
      targetMonthlyWage: getUiMessage(
        'factoryDetail.targetMonthlyWage',
        'Target Monthly Production Allowance',
        languageCode
      ),
      wagePerSecond: getUiMessage(
        'factoryDetail.wagePerSecond',
        'Wage / sec (auto)',
        languageCode
      ),
      wagePerSecondHelper: getUiMessage(
        'factoryDetail.wagePerSecondHelper',
        'Automatically calculated from monthly target wage.',
        languageCode
      ),
      targetMonthlyWageHelper: getUiMessage(
        'factoryDetail.targetMonthlyWageHelper',
        'Converted using 26 days/month and 8 hours/day.',
        languageCode
      ),
    }),
    [languageCode]
  );

  const [formData, setFormData] = useState(buildFactoryFormData(null));
  const [managerEmployees, setManagerEmployees] = useState([]);
  const [managerEmployeesLoading, setManagerEmployeesLoading] = useState(false);

  useEffect(() => {
    setFormData(buildFactoryFormData(factory));
  }, [factory, open]);

  useEffect(() => {
    let active = true;
    const factoryId = Number(factory?.id);
    if (!open || !Number.isFinite(factoryId) || factoryId <= 0) {
      setManagerEmployees([]);
      setManagerEmployeesLoading(false);
      return () => {
        active = false;
      };
    }

    setManagerEmployeesLoading(true);
    requestJSON(`/employees?factoryId=${factoryId}`)
      .then((data) => {
        if (!active) return;
        const safeEmployees = (Array.isArray(data) ? data : [])
          .filter((employee) => Number(employee?.factoryId) === factoryId)
          .sort((left, right) =>
            EMPLOYEE_COLLATOR.compare(
              buildEmployeeOptionLabel(left),
              buildEmployeeOptionLabel(right)
            )
          );
        setManagerEmployees(safeEmployees);
      })
      .catch(() => {
        if (!active) return;
        setManagerEmployees([]);
      })
      .finally(() => {
        if (!active) return;
        setManagerEmployeesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [factory?.id, open]);

  const factoryCodeError = useMemo(() => {
    const code = normalizeFactoryCode(formData.factoryCode);
    if (!code) return text.factoryCodeHelper;
    if (code.length < 2) return text.factoryCodeHelper;
    return '';
  }, [formData.factoryCode, text.factoryCodeHelper]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === 'factoryCode') {
      setFormData((prev) => ({ ...prev, factoryCode: normalizeFactoryCode(value) }));
      return;
    }
    if (name === 'country') {
      const nextCountry = normalizeCountry(value) || DEFAULT_COUNTRY;
      setFormData((prev) => ({
        ...prev,
        country: nextCountry,
        countryCode: resolveDefaultCountryCode(nextCountry),
      }));
      return;
    }
    if (name === 'targetMonthlyWage') {
      setFormData((prev) => ({
        ...prev,
        targetMonthlyWage: value.replace(/[^\d]/g, ''),
      }));
      return;
    }
    if (name === 'managementStartDate') {
      setFormData((prev) => ({
        ...prev,
        managementStartDate: value || DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
      }));
      return;
    }
    if (name === 'managerEmployeeId') {
      setFormData((prev) => ({
        ...prev,
        managerEmployeeId: normalizeManagerEmployeeId(value),
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const computedWagePerSecond = useMemo(() => {
    const target = parseNumber(formData.targetMonthlyWage);
    if (Number.isFinite(target)) {
      const value = target / SECONDS_PER_MONTH;
      return Math.round(value * 100) / 100;
    }
    const fallback = parseNumber(formData.wagePerSecond);
    return Number.isFinite(fallback) ? fallback : Number.NaN;
  }, [formData.targetMonthlyWage, formData.wagePerSecond]);

  const computedWageDisplay = Number.isFinite(computedWagePerSecond)
    ? computedWagePerSecond.toFixed(2)
    : '';

  const managerHelperText = !factory?.id
    ? managerMessages.saveFirst
    : managerEmployeesLoading
      ? managerMessages.loading
      : managerEmployees.length === 0
        ? managerMessages.empty
        : managerMessages.helper;

  const handleSave = () => {
    const targetMonthlyWage = parseNumber(formData.targetMonthlyWage);
    const wagePerSecond = Number.isFinite(computedWagePerSecond)
      ? computedWagePerSecond
      : formData.wagePerSecond ?? '';

    onSave?.({
      ...factory,
      ...formData,
      country: normalizeCountry(formData.country) || DEFAULT_COUNTRY,
      managerEmployeeId: normalizeManagerEmployeeId(formData.managerEmployeeId) || null,
      managementStartDate:
        normalizeFactoryManagementStartDateKey(formData.managementStartDate) ||
        DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
      targetMonthlyWage: Number.isFinite(targetMonthlyWage) ? targetMonthlyWage : '',
      wagePerSecond,
    });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          ...TOP_OFFSET_DRAWER_PAPER_SX,
          width: { xs: '100%', sm: 580 },
        },
      }}
    >
      <Box sx={{ width: '100%', height: '100%', overflowY: 'auto', p: 3 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {factory ? text.editTitle : text.createTitle}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Stack spacing={2}>
          <SectionBlock
            title={extraText.identitySection}
            description={extraText.identityDescription}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.name}
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.factoryCode}
                  name="factoryCode"
                  value={formData.factoryCode}
                  onChange={handleInputChange}
                  required
                  inputProps={{ maxLength: 3, style: { textTransform: 'uppercase' } }}
                  helperText={factoryCodeError || ' '}
                  error={Boolean(factoryCodeError)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={extraText.managementStartDate}
                  name="managementStartDate"
                  type="date"
                  value={formData.managementStartDate}
                  onChange={handleInputChange}
                  helperText={extraText.managementStartDateHelper}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label={text.manager}
                  name="managerEmployeeId"
                  value={formData.managerEmployeeId}
                  onChange={handleInputChange}
                  disabled={managerEmployeesLoading || !factory?.id}
                  helperText={managerHelperText}
                >
                  <MenuItem value="">{managerMessages.none}</MenuItem>
                  {managerEmployees.map((employee) => (
                    <MenuItem key={employee.id} value={employee.id}>
                      {buildEmployeeOptionLabel(employee)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </SectionBlock>

          <SectionBlock
            title={extraText.localizedSection}
            description={extraText.localizedDescription}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={extraText.nameKo}
                  name="nameKo"
                  value={formData.nameKo}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={extraText.nameVi}
                  name="nameVi"
                  value={formData.nameVi}
                  onChange={handleInputChange}
                />
              </Grid>
            </Grid>
          </SectionBlock>

          <SectionBlock
            title={extraText.contactSection}
            description={extraText.contactDescription}
          >
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.address}
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  multiline
                  minRows={2}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label={text.country}
                  name="country"
                  value={normalizeCountry(formData.country) || DEFAULT_COUNTRY}
                  onChange={handleInputChange}
                >
                  {countryOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.countryCode}
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleInputChange}
                  inputProps={{ maxLength: 4 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.phoneNumber}
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                />
              </Grid>
            </Grid>
          </SectionBlock>

          <SectionBlock
            title={extraText.payrollSection}
            description={extraText.payrollDescription}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.targetMonthlyWage}
                  name="targetMonthlyWage"
                  value={formatDigitsWithCommas(formData.targetMonthlyWage)}
                  onChange={handleInputChange}
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                  helperText={text.targetMonthlyWageHelper}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.wagePerSecond}
                  name="wagePerSecond"
                  value={computedWageDisplay}
                  InputProps={{ readOnly: true }}
                  helperText={text.wagePerSecondHelper}
                  sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  {extraText.payrollUpdatedAt}:{' '}
                  {formatProductionAllowanceUpdatedAt(
                    factory?.productionAllowanceUpdatedAt,
                    languageCode
                  )}
                </Typography>
              </Grid>
            </Grid>
          </SectionBlock>

          <FactoryWarehouseSection factoryId={factory?.id || null} />
        </Stack>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <SaveButton onClick={handleSave} disabled={Boolean(factoryCodeError)} />
        </Box>
      </Box>
    </Drawer>
  );
};

export default FactoryDetail;
