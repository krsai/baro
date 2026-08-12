import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

const resolveLocalizedText = (localizedText, languageCode = getCurrentLanguageCode()) => {
  if (!localizedText || typeof localizedText !== 'object') return '';
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'ko');
  return (
    localizedText[normalizedLanguageCode] ||
    localizedText.en ||
    localizedText.ko ||
    localizedText.vi ||
    ''
  );
};

export const ORDER_PARTY_ROLE_KEYS = {
  BUYER: 'BUYER',
  SELLER: 'SELLER',
};

export const ORDER_PARTY_ROLE_DEFAULT_LABELS = {
  [ORDER_PARTY_ROLE_KEYS.BUYER]: {
    ko: '발주자',
    en: 'Buyer',
    vi: 'Ben dat hang',
  },
  [ORDER_PARTY_ROLE_KEYS.SELLER]: {
    ko: '수주자',
    en: 'Seller',
    vi: 'Ben nhan don',
  },
};

export const ORDER_PARTY_ROLE_TYPED_LABELS = {
  [ORDER_PARTY_ROLE_KEYS.BUYER]: {
    ko: '발주자(브랜드)',
    en: 'Buyer (Brand)',
    vi: 'Ben dat hang (Thuong hieu)',
  },
  [ORDER_PARTY_ROLE_KEYS.SELLER]: {
    ko: '수주자(제조사)',
    en: 'Seller (Manufacturer)',
    vi: 'Ben nhan don (Nhà máy)',
  },
};

export const ORDER_PARTY_TEXT = {
  searchPlaceholder: {
    ko: '주문번호, 발주자, 수주자, 스타일 검색..',
    en: 'Search order no., buyer, seller, style..',
    vi: 'Tim so don, ben dat hang, ben nhan don, ma hang..',
  },
  loadingPlaceholder: {
    ko: '불러오는 중...',
    en: 'Loading...',
    vi: 'Đang tải du lieu...',
  },
  selectBuyer: {
    ko: '발주자를 선택해 주세요.',
    en: 'Select a buyer.',
    vi: 'Hay chon ben dat hang.',
  },
  selectSeller: {
    ko: '수주자를 선택해 주세요.',
    en: 'Select a seller.',
    vi: 'Hay chon ben nhan don.',
  },
  selectBuyerFirst: {
    ko: '발주자를 먼저 선택해 주세요.',
    en: 'Select a buyer first.',
    vi: 'Hay chon ben dat hang truoc.',
  },
  linkedPairOnly: {
    ko: '연결된 관계의 발주자/수주자 조합만 선택할 수 있습니다.',
    en: 'Only linked buyer/seller pairs can be selected.',
    vi: 'Chi co the chon cap ben dat hang/ben nhan don da duoc lien ket.',
  },
};

const normalizeOrderPartyRole = (value) => {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === ORDER_PARTY_ROLE_KEYS.BUYER) return ORDER_PARTY_ROLE_KEYS.BUYER;
  if (upper === ORDER_PARTY_ROLE_KEYS.SELLER) return ORDER_PARTY_ROLE_KEYS.SELLER;
  return '';
};

export const getOrderPartyRoleLabel = (value, fallback = '-', languageCode) => {
  const normalized = normalizeOrderPartyRole(value);
  if (!normalized) return fallback;
  return resolveLocalizedText(ORDER_PARTY_ROLE_DEFAULT_LABELS[normalized], languageCode) || fallback;
};

export const getOrderPartyRoleLabelWithType = (value, fallback = '-', languageCode) => {
  const normalized = normalizeOrderPartyRole(value);
  if (!normalized) return fallback;
  return resolveLocalizedText(ORDER_PARTY_ROLE_TYPED_LABELS[normalized], languageCode) || fallback;
};

export const getOrderPartyText = (key, fallback = '', languageCode) =>
  resolveLocalizedText(ORDER_PARTY_TEXT[key], languageCode) || fallback;
