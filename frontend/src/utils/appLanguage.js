const SUPPORTED_LANGUAGE_CODES = ['ko', 'en', 'vi'];
const DEFAULT_LANGUAGE_CODE = 'en';
const LANGUAGE_OVERRIDE_STORAGE_KEY = 'baro_language_override';

let currentLanguageCode = DEFAULT_LANGUAGE_CODE;

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

export const getDefaultLanguageCode = () => DEFAULT_LANGUAGE_CODE;

const getLegacyStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

export const normalizeLanguageCode = (value, fallback = DEFAULT_LANGUAGE_CODE) => {
  const raw = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return fallback;
  const primaryCode = raw.split('-')[0];
  return SUPPORTED_LANGUAGE_CODES.includes(primaryCode) ? primaryCode : fallback;
};

export const getSupportedLanguageCodes = () => [...SUPPORTED_LANGUAGE_CODES];

// 브라우저 네이티브 <input type="time"|"date">는 앱 언어 상태가 아니라 이 BCP47
// lang 속성을 보고 오전/오후 표기, 12/24시간 표기 등을 렌더링한다. 이게 없으면
// OS/브라우저 로케일(예: 한국어 Windows)을 그대로 따라가 화면 언어와 어긋난다.
const NATIVE_INPUT_LOCALE_BY_LANGUAGE_CODE = { ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' };
export const resolveNativeInputLocale = (languageCode) =>
  NATIVE_INPUT_LOCALE_BY_LANGUAGE_CODE[normalizeLanguageCode(languageCode)] || NATIVE_INPUT_LOCALE_BY_LANGUAGE_CODE.en;

export const resolveLanguageCodeFromNavigator = () => {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE_CODE;
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
    navigator.userLanguage,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate, '');
    if (normalized) return normalized;
  }
  return DEFAULT_LANGUAGE_CODE;
};

export const resolveLanguageCodeFromUser = (user) => {
  const identityCandidates = Array.isArray(user?.identities)
    ? user.identities.flatMap((identity) => [
        identity?.identity_data?.locale,
        identity?.identity_data?.language,
        identity?.identity_data?.lang,
        identity?.identity_data?.preferred_language,
      ])
    : [];
  const candidates = [
    user?.user_metadata?.preferred_language,
    user?.user_metadata?.locale,
    user?.user_metadata?.language,
    user?.user_metadata?.lang,
    user?.app_metadata?.preferred_language,
    user?.app_metadata?.locale,
    user?.app_metadata?.language,
    user?.app_metadata?.lang,
    ...identityCandidates,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate, '');
    if (normalized) return normalized;
  }
  return '';
};

export const readLanguageOverride = () => {
  const storage = getStorage();
  const legacyStorage = getLegacyStorage();
  try {
    const persistedValue = normalizeLanguageCode(storage?.getItem(LANGUAGE_OVERRIDE_STORAGE_KEY), '');
    if (persistedValue) return persistedValue;

    const legacyValue = normalizeLanguageCode(
      legacyStorage?.getItem(LANGUAGE_OVERRIDE_STORAGE_KEY),
      ''
    );
    if (!legacyValue) return '';

    storage?.setItem(LANGUAGE_OVERRIDE_STORAGE_KEY, legacyValue);
    legacyStorage?.removeItem(LANGUAGE_OVERRIDE_STORAGE_KEY);
    return legacyValue;
  } catch (_error) {
    return '';
  }
};

export const writeLanguageOverride = (value) => {
  const storage = getStorage();
  if (!storage) return;
  const normalized = normalizeLanguageCode(value, '');
  if (!normalized) return;
  storage.setItem(LANGUAGE_OVERRIDE_STORAGE_KEY, normalized);
};

export const clearLanguageOverride = () => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(LANGUAGE_OVERRIDE_STORAGE_KEY);
};

export const getCurrentLanguageCode = () => currentLanguageCode;

export const setCurrentLanguageCode = (value) => {
  currentLanguageCode = normalizeLanguageCode(value);
  return currentLanguageCode;
};

const toTrimmedText = (value) => {
  const text = String(value ?? '').trim();
  return text || '';
};

export const resolveLocalizedAttributeName = (item, languageCode = currentLanguageCode) => {
  const code = normalizeLanguageCode(languageCode);
  const name = toTrimmedText(item?.name);
  const nameKo = toTrimmedText(item?.nameKo);
  const nameEn = toTrimmedText(item?.nameEn);
  const nameVi = toTrimmedText(item?.nameVi);
  const attributeCode = toTrimmedText(item?.code);

  if (code === 'ko') return nameKo || nameEn || name || nameVi || attributeCode;
  if (code === 'en') return nameEn || name || nameKo || nameVi || attributeCode;
  if (code === 'vi') return nameVi || nameEn || name || nameKo || attributeCode;
  return nameEn || name || nameKo || nameVi || attributeCode;
};

export const resolveCustomerDisplayName = (customer, languageCode = currentLanguageCode) => {
  const code = normalizeLanguageCode(languageCode);
  const name = toTrimmedText(customer?.name);
  const nameKo = toTrimmedText(customer?.nameKo);
  const nameVi = toTrimmedText(customer?.nameVi);
  if (code === 'ko') return nameKo || name || nameVi || '';
  if (code === 'vi') return nameVi || name || nameKo || '';
  return name || nameKo || nameVi || '';
};

export const collectAttributeTextCandidates = (item, languageCode = currentLanguageCode) =>
  Array.from(
    new Set(
      [
        resolveLocalizedAttributeName(item, languageCode),
        toTrimmedText(item?.name),
        toTrimmedText(item?.nameKo),
        toTrimmedText(item?.nameEn),
        toTrimmedText(item?.nameVi),
        toTrimmedText(item?.code),
      ].filter(Boolean)
    )
  );

export const buildAttributeSearchText = (item, languageCode = currentLanguageCode) =>
  collectAttributeTextCandidates(item, languageCode).join(' ');

export const matchesAttributeText = (item, value, languageCode = currentLanguageCode) => {
  const target = toTrimmedText(value).toLowerCase();
  if (!target) return false;
  return collectAttributeTextCandidates(item, languageCode).some(
    (candidate) => candidate.toLowerCase() === target
  );
};
