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
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  normalizeFactoryManagementStartDateKey,
} from '../../../../utils/factoryManagementStart';
import {
  formatDigitsWithCommas,
  parseNumberLike,
} from '../../../../utils/numberFormat';

const WORK_DAYS_PER_MONTH = 26;
const HOURS_PER_DAY = 8;
const SECONDS_PER_MONTH = WORK_DAYS_PER_MONTH * HOURS_PER_DAY * 60 * 60;
const COUNTRY_CODE_BY_COUNTRY = {
  KR: '+82',
  VN: '+84',
};
const DEFAULT_COUNTRY = 'VN';
const DEFAULT_COUNTRY_CODE = COUNTRY_CODE_BY_COUNTRY[DEFAULT_COUNTRY];

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
    manager: factory?.manager || '',
    targetMonthlyWage: factory?.targetMonthlyWage ?? '',
    wagePerSecond: factory?.wagePerSecond ?? '',
  };
};

const getExtraText = (languageCode) => {
  if (languageCode === 'ko') {
    return {
      identitySection: '공장 기본 정보',
      identityDescription: '기본 공장명과 운영 시작 기준일을 먼저 설정합니다.',
      localizedSection: '다국어 공장명',
      localizedDescription: '한글/베트남어 이름을 함께 저장해 화면과 문서에서 일관되게 사용합니다.',
      contactSection: '위치 및 연락처',
      contactDescription: '주소, 관리자, 국가 정보를 같은 묶음으로 정리했습니다.',
      payrollSection: '급여 기준',
      payrollDescription: '월 목표 급여를 입력하면 초당 급여가 자동 계산됩니다.',
      nameKo: '공장명 (한글)',
      nameVi: '공장명 (베트남어)',
      managementStartDate: '관리 시작일',
      managementStartDateHelper:
        '작업기록, 생산분석, 배정 보드의 최소 시작 기준일입니다.',
    };
  }

  if (languageCode === 'vi') {
    return {
      identitySection: 'Thong tin nha may',
      identityDescription: 'Dat ten nha may chinh va ngay bat dau quan ly.',
      localizedSection: 'Ten da ngon ngu',
      localizedDescription: 'Luu ten tieng Han va tieng Viet de dung nhat quan tren man hinh va tai lieu.',
      contactSection: 'Vi tri va lien he',
      contactDescription: 'Gom dia chi, quan ly va thong tin quoc gia vao cung mot nhom.',
      payrollSection: 'Moc luong',
      payrollDescription: 'Nhap muc luong thang muc tieu de he thong tu dong tinh luong theo giay.',
      nameKo: 'Ten nha may (tieng Han)',
      nameVi: 'Ten nha may (tieng Viet)',
      managementStartDate: 'Ngay bat dau quan ly',
      managementStartDateHelper:
        'La moc ngay toi thieu cho ghi chep, phan tich san xuat va bang phan cong.',
    };
  }

  return {
    identitySection: 'Factory Identity',
    identityDescription: 'Set the main factory name and the management start date first.',
    localizedSection: 'Localized Names',
    localizedDescription: 'Store Korean and Vietnamese names for consistent UI and document labels.',
    contactSection: 'Location & Contact',
    contactDescription: 'Group address, manager, and country details together.',
    payrollSection: 'Wage Baseline',
    payrollDescription: 'Enter the target monthly wage to calculate wage-per-second automatically.',
    nameKo: 'Factory Name (Korean)',
    nameVi: 'Factory Name (Vietnamese)',
    managementStartDate: 'Management Start Date',
    managementStartDateHelper:
      'Used as the minimum start date for work logs, production analysis, and assignment views.',
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

const FactoryDetail = ({ open, onClose, onSave, factory }) => {
  const { languageCode } = useLanguage();
  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );

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
        'Target Monthly Wage',
        languageCode
      ),
      wagePerSecond: getUiMessage(
        'factoryDetail.wagePerSecond',
        'Wage / sec (auto)',
        languageCode
      ),
      targetMonthlyWageHelper: getUiMessage(
        'factoryDetail.targetMonthlyWageHelper',
        'Based on 26 days/month, 8 hours/day (08:00-17:00 with 1 hour lunch break).',
        languageCode
      ),
      wagePerSecondHelper: getUiMessage(
        'factoryDetail.wagePerSecondHelper',
        'Automatically calculated from monthly target wage.',
        languageCode
      ),
    }),
    [languageCode]
  );

  const [formData, setFormData] = useState(buildFactoryFormData(null));

  useEffect(() => {
    setFormData(buildFactoryFormData(factory));
  }, [factory, open]);

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

  const handleSave = () => {
    const targetMonthlyWage = parseNumber(formData.targetMonthlyWage);
    const wagePerSecond = Number.isFinite(computedWagePerSecond)
      ? computedWagePerSecond
      : formData.wagePerSecond ?? '';

    onSave?.({
      ...factory,
      ...formData,
      country: normalizeCountry(formData.country) || DEFAULT_COUNTRY,
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
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.manager}
                  name="manager"
                  value={formData.manager}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
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
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label={text.countryCode}
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} sm={8}>
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
            </Grid>
          </SectionBlock>
        </Stack>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <SaveButton onClick={handleSave} disabled={Boolean(factoryCodeError)} />
        </Box>
      </Box>
    </Drawer>
  );
};

export default FactoryDetail;
