import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

const normalizeToken = (value) =>
  String(value || '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toUpperCase();

const dedupeAliases = (aliases = []) => {
  const seen = new Set();
  return aliases.filter((alias) => {
    const normalized = String(alias || '').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const createItem = (code, labels, aliases = []) => ({
  code,
  labels,
  aliases: dedupeAliases([code, ...aliases]),
});

const RAW_STATIC_OPTION_GROUPS = [
  {
    key: 'organizationType',
    title: '조직 유형',
    items: [
      createItem('MANUFACTURER', { ko: '공장', en: 'Manufacturer', vi: 'Nha may' }, [
        'manufacturer',
        'factory',
        '공장',
        '수주자',
        '테스트수주자',
      ]),
      createItem('BRAND', { ko: '브랜드', en: 'Brand', vi: 'Thuong hieu' }, [
        'brand',
        '브랜드',
        '발주자',
        '테스트발주자',
      ]),
    ],
  },
  {
    key: 'orgRole',
    title: '조직 역할',
    items: [
      createItem('ADMIN', { ko: '관리자', en: 'Admin', vi: 'Quan tri' }, ['관리자']),
      createItem('OPERATOR', { ko: '운영자', en: 'Operator', vi: 'Van hanh' }, ['운영자']),
      createItem('ACCOUNTANT', { ko: '회계사', en: 'Accountant', vi: 'Ke toan' }, ['회계사']),
      createItem('WORKER', { ko: '작업자', en: 'Worker', vi: 'Cong nhan' }, ['작업자']),
    ],
  },
  {
    key: 'orgMembershipStatus',
    title: '조직 멤버십 상태',
    items: [
      createItem('PENDING', { ko: '승인 대기', en: 'Pending', vi: 'Cho phe duyet' }, [
        '승인대기',
      ]),
      createItem('ACTIVE', { ko: '활성', en: 'Active', vi: 'Hoat dong' }, ['재직', '활성']),
      createItem('REJECTED', { ko: '거절', en: 'Rejected', vi: 'Tu choi' }, ['거절']),
      createItem('SUSPENDED', { ko: '정지', en: 'Suspended', vi: 'Tam dung' }, [
        '휴직',
        '정지',
      ]),
      createItem('TERMINATED', { ko: '종료', en: 'Terminated', vi: 'Ket thuc' }, [
        '퇴사',
        '종료',
      ]),
    ],
  },
  {
    key: 'organizationSubscriptionStatus',
    title: '구독 상태',
    items: [
      createItem(
        'NOT_SUBSCRIBED',
        { ko: '대기', en: 'Pending', vi: 'Cho duyet' },
        ['대기', 'PENDING']
      ),
      createItem('TRIAL', { ko: '체험', en: 'Trial', vi: 'Dung thu' }, ['체험']),
      createItem('ACTIVE', { ko: '활성', en: 'Active', vi: 'Hoat dong' }, ['활성']),
      createItem('GRACE', { ko: '유예', en: 'Grace', vi: 'Gia han' }, ['유예']),
      createItem('SUSPENDED', { ko: '중지', en: 'Suspended', vi: 'Tam dung' }, ['중지']),
    ],
  },
  {
    key: 'gender',
    title: '성별',
    items: [
      createItem('M', { ko: '남성', en: 'Men', vi: 'Nam' }, ['MEN', 'MALE', '남성']),
      createItem('W', { ko: '여성', en: 'Women', vi: 'Nu' }, [
        'WOMEN',
        'FEMALE',
        'F',
        '여성',
      ]),
      createItem('U', { ko: '공용', en: 'Unisex', vi: 'Unisex' }, ['UNISEX', '공용']),
    ],
  },
  {
    key: 'sizeCode',
    title: '사이즈 코드',
    items: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'FREE'].map((code) =>
      createItem(code, { ko: code, en: code, vi: code })
    ),
  },
  {
    key: 'payType',
    title: '급여 타입',
    items: [
      createItem('CT', { ko: '성과급', en: 'Piece Rate', vi: 'Luong san pham' }, [
        '성과급',
      ]),
      createItem('FIXED', { ko: '기본급', en: 'Base Salary', vi: 'Luong co ban' }, [
        '기본급',
        '고정급',
      ]),
    ],
  },
  {
    key: 'orderStatus',
    title: '주문 상태',
    items: [
      createItem('ORDER_RECEIVED', { ko: '접수', en: 'Received', vi: 'Da nhan' }, [
        '주문접수',
        '접수',
      ]),
    ],
  },
  {
    key: 'orderPartyRole',
    title: '주문 당사자 역할',
    items: [
      createItem('BUYER', { ko: '구매자', en: 'Buyer', vi: 'Ben mua' }, [
        'BUY',
        '구매자',
        '발주자',
      ]),
      createItem('SELLER', { ko: '판매자', en: 'Seller', vi: 'Ben ban' }, [
        'SELL',
        '판매자',
        '수주자',
      ]),
    ],
  },
  {
    key: 'country',
    title: '국가',
    items: [
      createItem('KR', { ko: '한국', en: 'Korea', vi: 'Han Quoc' }, [
        'KOREA',
        'SOUTHKOREA',
        '대한민국',
        '한국',
      ]),
      createItem('VN', { ko: '베트남', en: 'Vietnam', vi: 'Viet Nam' }, [
        'VIETNAM',
        '베트남',
      ]),
    ],
  },
  {
    key: 'jobRole',
    title: '직무 / 작업 역할',
    items: [
      createItem(
        'WORKER_SUPERVISOR',
        { ko: '감독', en: 'Supervisor', vi: 'Giam sat' },
        ['감독']
      ),
      createItem('WORKER_CUTTING', { ko: '재단', en: 'Cutting', vi: 'Cat' }, ['재단']),
      createItem('WORKER_SEWING', { ko: '봉제', en: 'Sewing', vi: 'May' }, ['봉제']),
      createItem('WORKER_IRONING', { ko: '다림', en: 'Ironing', vi: 'Ui' }, ['다림']),
      createItem('WORKER_INSPECTION', { ko: '검수', en: 'Inspection', vi: 'Kiem hang' }, [
        '검수',
      ]),
      createItem('WORKER_PACKING', { ko: '포장', en: 'Packing', vi: 'Dong goi' }, ['포장']),
      createItem('WORKER_OTHER', { ko: '기타', en: 'Other', vi: 'Khac' }, ['기타']),
    ],
  },
  {
    key: 'inventoryMovementType',
    title: '재고 이동 타입',
    items: [
      createItem(
        'INBOUND_CUSTOMER',
        { ko: '고객 입고(+)', en: 'Inbound from Customer (+)', vi: 'Nhap tu khach (+)' },
        ['고객입고', '입고']
      ),
      createItem(
        'ISSUE_TO_LINE',
        { ko: '라인 불출(-)', en: 'Issue to Line (-)', vi: 'Xuat cho chuyen (-)' },
        ['라인불출', '불출']
      ),
      createItem(
        'ADJUSTMENT',
        { ko: '재고 조정(+/-)', en: 'Stock Adjustment (+/-)', vi: 'Dieu chinh ton (+/-)' },
        ['재고조정', '조정']
      ),
    ],
  },
  {
    key: 'atReliabilityStatus',
    title: 'AT 신뢰도 상태',
    items: [
      createItem('COLLECTING', { ko: '수집 중', en: 'Collecting', vi: 'Dang thu thap' }, [
        '수집중',
      ]),
      createItem('UNRELIABLE', { ko: '불안정', en: 'Unreliable', vi: 'Khong on dinh' }, [
        '불안정',
      ]),
      createItem('INSUFFICIENT', { ko: '부족', en: 'Insufficient', vi: 'Chua du' }, ['부족']),
      createItem('USABLE', { ko: '사용 가능', en: 'Usable', vi: 'Co the su dung' }, [
        '사용가능',
      ]),
      createItem('TRUSTED', { ko: '신뢰', en: 'Trusted', vi: 'Dang tin cay' }, ['신뢰']),
      createItem('VERIFIED', { ko: '검증 완료', en: 'Verified', vi: 'Da xac minh' }, [
        '검증완료',
      ]),
    ],
  },
];

const buildStaticOptionGroup = (group) => {
  const codeMap = {};

  group.items.forEach((item) => {
    codeMap[normalizeToken(item.code)] = item.code;
    item.aliases.forEach((alias) => {
      codeMap[normalizeToken(alias)] = item.code;
    });
  });

  return {
    ...group,
    items: group.items.map((item) => ({ ...item })),
    codeMap,
  };
};

export const STATIC_OPTION_GROUPS = RAW_STATIC_OPTION_GROUPS.map(buildStaticOptionGroup);

export const STATIC_OPTION_REGISTRY = STATIC_OPTION_GROUPS.reduce((map, group) => {
  map[group.key] = group;
  return map;
}, {});

export const resolveStaticOptionText = (
  localizedText,
  languageCode = getCurrentLanguageCode()
) => {
  if (!localizedText || typeof localizedText !== 'object') return '';
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'ko');
  return (
    localizedText[normalizedLanguageCode] ||
    localizedText.ko ||
    localizedText.en ||
    localizedText.vi ||
    ''
  );
};

export const getStaticOptionGroup = (groupKey) => STATIC_OPTION_REGISTRY[groupKey] || null;

export const getStaticOptionItems = (groupKey) => getStaticOptionGroup(groupKey)?.items || [];

export const normalizeStaticOptionCode = (groupKey, value, fallback = '') => {
  const group = getStaticOptionGroup(groupKey);
  if (!group) return fallback;
  const normalizedToken = normalizeToken(value);
  if (!normalizedToken) return fallback;
  return group.codeMap[normalizedToken] || fallback;
};

export const getStaticOptionLabel = (
  groupKey,
  value,
  fallback = '-',
  languageCode = getCurrentLanguageCode()
) => {
  const normalizedCode = normalizeStaticOptionCode(groupKey, value, '');
  if (!normalizedCode) return fallback;
  const item = getStaticOptionItems(groupKey).find((candidate) => candidate.code === normalizedCode);
  return resolveStaticOptionText(item?.labels, languageCode) || fallback;
};

export const getStaticOptionOptions = (
  groupKey,
  languageCode = getCurrentLanguageCode()
) =>
  getStaticOptionItems(groupKey).map((item) => ({
    value: item.code,
    label: resolveStaticOptionText(item.labels, languageCode) || item.code,
  }));

export const countStaticOptionItems = () =>
  STATIC_OPTION_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
