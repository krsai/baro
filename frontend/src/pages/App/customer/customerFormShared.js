const COUNTRY_CODE_BY_COUNTRY = Object.freeze({
  KR: '+82',
  VN: '+84',
});

export const DEFAULT_COUNTRY = 'VN';
export const DEFAULT_COUNTRY_CODE = COUNTRY_CODE_BY_COUNTRY[DEFAULT_COUNTRY];

export const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeCountry = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'KR' || normalized === 'VN' ? normalized : '';
};

export const inferCountryFromCountryCode = (value) => {
  const normalizedCode = String(value || '').trim();
  if (normalizedCode === COUNTRY_CODE_BY_COUNTRY.KR) return 'KR';
  if (normalizedCode === COUNTRY_CODE_BY_COUNTRY.VN) return 'VN';
  return '';
};

export const resolveDefaultCountryCode = (country) =>
  COUNTRY_CODE_BY_COUNTRY[normalizeCountry(country)] || DEFAULT_COUNTRY_CODE;

export const resolveCountryForForm = (customer) => {
  const fromPayload = normalizeCountry(customer?.country);
  if (fromPayload) return fromPayload;
  const fromCode = inferCountryFromCountryCode(customer?.countryCode);
  if (fromCode) return fromCode;
  return DEFAULT_COUNTRY;
};

export const resolveCountryForDisplay = (customer) => {
  const fromPayload = normalizeCountry(customer?.country);
  if (fromPayload) return fromPayload;
  return inferCountryFromCountryCode(customer?.countryCode);
};

export const combinePhone = (countryCode, phoneNumber) =>
  [String(countryCode || '').trim(), String(phoneNumber || '').trim()]
    .filter(Boolean)
    .join(' ');

export const buildCustomerFormData = (customer = {}) => {
  const country = resolveCountryForForm(customer);
  const countryCode =
    String(customer?.countryCode || '').trim() || resolveDefaultCountryCode(country);

  return {
    id: customer?.id ?? null,
    brandOrgId: toPositiveIntOrNull(customer?.brandOrgId),
    manufacturerOrgId: toPositiveIntOrNull(customer?.manufacturerOrgId),
    code: customer?.code ?? '',
    name: customer?.name ?? '',
    nameKo: customer?.nameKo ?? '',
    nameVi: customer?.nameVi ?? '',
    country,
    address: customer?.address ?? '',
    countryCode,
    phoneNumber: customer?.phoneNumber ?? customer?.phone ?? '',
    manager: customer?.manager ?? '',
    email: customer?.email ?? '',
    registeredAt: customer?.registeredAt ?? null,
  };
};

export const createEmptyCustomerFormData = () => buildCustomerFormData();

export const buildCustomerPayload = (formData = {}) => ({
  code: String(formData.code || '').trim().toUpperCase(),
  name: String(formData.name || '').trim(),
  nameKo: String(formData.nameKo || '').trim() || null,
  nameVi: String(formData.nameVi || '').trim() || null,
  country: normalizeCountry(formData.country) || null,
  address: String(formData.address || '').trim(),
  countryCode: String(formData.countryCode || '').trim(),
  phoneNumber: String(formData.phoneNumber || '').trim(),
  manager: String(formData.manager || '').trim(),
  email: String(formData.email || '').trim(),
});

export const formatCustomerDate = (value, languageCode) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';
  return date.toLocaleDateString(locale);
};

export const resolveCustomerStyleOwnerOrgId = (customer, fallbackOrgId = null) => {
  const brandOrgId = toPositiveIntOrNull(customer?.brandOrgId);
  if (brandOrgId !== null) return brandOrgId;
  return toPositiveIntOrNull(fallbackOrgId);
};
