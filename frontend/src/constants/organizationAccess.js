import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

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

const createLocalizedOption = ({ value, labelKey, labelText, descriptionText = null }) => ({
  value,
  labelKey,
  get label() {
    return resolveLocalizedText(labelText);
  },
  ...(descriptionText
    ? {
        get description() {
          return resolveLocalizedText(descriptionText);
        },
      }
    : {}),
});

export const ORG_ROLE_KEYS = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  ACCOUNTANT: 'ACCOUNTANT',
  WORKER: 'WORKER',
};

export const ORG_ROLE_LABEL_KEYS = {
  [ORG_ROLE_KEYS.ADMIN]: 'orgRole.admin',
  [ORG_ROLE_KEYS.OPERATOR]: 'orgRole.operator',
  [ORG_ROLE_KEYS.ACCOUNTANT]: 'orgRole.accountant',
  [ORG_ROLE_KEYS.WORKER]: 'orgRole.worker',
};

export const ORG_ROLE_DEFAULT_LABELS = {
  [ORG_ROLE_KEYS.ADMIN]: {
    ko: '\uAD00\uB9AC\uC790',
    en: 'Admin',
    vi: 'Quan tri',
  },
  [ORG_ROLE_KEYS.OPERATOR]: {
    ko: '\uC6B4\uC601\uC790',
    en: 'Operator',
    vi: 'Van hanh',
  },
  [ORG_ROLE_KEYS.ACCOUNTANT]: {
    ko: '\uD68C\uACC4\uC0AC',
    en: 'Accountant',
    vi: 'Kế toán',
  },
  [ORG_ROLE_KEYS.WORKER]: {
    ko: '\uC791\uC5C5\uC790',
    en: 'Worker',
    vi: 'Cong nhan',
  },
};

export const ORG_ROLE_OPTIONS = [
  createLocalizedOption({
    value: ORG_ROLE_KEYS.ADMIN,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.ADMIN],
    labelText: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.ADMIN],
  }),
  createLocalizedOption({
    value: ORG_ROLE_KEYS.OPERATOR,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.OPERATOR],
    labelText: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.OPERATOR],
  }),
  createLocalizedOption({
    value: ORG_ROLE_KEYS.ACCOUNTANT,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.ACCOUNTANT],
    labelText: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.ACCOUNTANT],
  }),
  createLocalizedOption({
    value: ORG_ROLE_KEYS.WORKER,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.WORKER],
    labelText: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.WORKER],
  }),
];

export const ORG_MEMBERSHIP_STATUS_KEYS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  TERMINATED: 'TERMINATED',
};

export const ORG_MEMBERSHIP_STATUS_LABEL_KEYS = {
  [ORG_MEMBERSHIP_STATUS_KEYS.PENDING]: 'orgMembershipStatus.pending',
  [ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE]: 'orgMembershipStatus.active',
  [ORG_MEMBERSHIP_STATUS_KEYS.REJECTED]: 'orgMembershipStatus.rejected',
  [ORG_MEMBERSHIP_STATUS_KEYS.SUSPENDED]: 'orgMembershipStatus.suspended',
  [ORG_MEMBERSHIP_STATUS_KEYS.TERMINATED]: 'orgMembershipStatus.terminated',
};

export const ORG_MEMBERSHIP_STATUS_DEFAULT_LABELS = {
  [ORG_MEMBERSHIP_STATUS_KEYS.PENDING]: {
    ko: '\uC2B9\uC778 \uB300\uAE30',
    en: 'Pending',
    vi: 'Cho phe duyet',
  },
  [ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE]: {
    ko: '\uD65C\uC131',
    en: 'Active',
    vi: 'Hoat dong',
  },
  [ORG_MEMBERSHIP_STATUS_KEYS.REJECTED]: {
    ko: '\uAC70\uC808',
    en: 'Rejected',
    vi: 'Tu choi',
  },
  [ORG_MEMBERSHIP_STATUS_KEYS.SUSPENDED]: {
    ko: '\uC815\uC9C0',
    en: 'Suspended',
    vi: 'Tam dung',
  },
  [ORG_MEMBERSHIP_STATUS_KEYS.TERMINATED]: {
    ko: '\uC885\uB8CC',
    en: 'Terminated',
    vi: 'Ket thuc',
  },
};

export const ORG_MEMBERSHIP_STATUS_CHIP_COLOR = {
  [ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE]: 'success',
  [ORG_MEMBERSHIP_STATUS_KEYS.PENDING]: 'warning',
  [ORG_MEMBERSHIP_STATUS_KEYS.SUSPENDED]: 'error',
  [ORG_MEMBERSHIP_STATUS_KEYS.REJECTED]: 'default',
  [ORG_MEMBERSHIP_STATUS_KEYS.TERMINATED]: 'default',
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_KEYS = {
  NOT_SUBSCRIBED: 'NOT_SUBSCRIBED',
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  GRACE: 'GRACE',
  SUSPENDED: 'SUSPENDED',
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]:
    'organizationSubscriptionStatus.pending',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: 'organizationSubscriptionStatus.trial',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: 'organizationSubscriptionStatus.active',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: 'organizationSubscriptionStatus.grace',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]:
    'organizationSubscriptionStatus.suspended',
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]: {
    ko: '\uB300\uAE30',
    en: 'Pending',
    vi: 'Cho duyet',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: {
    ko: '\uCCB4\uD5D8',
    en: 'Trial',
    vi: 'Dung thu',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: {
    ko: '\uD65C\uC131',
    en: 'Active',
    vi: 'Hoat dong',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: {
    ko: '\uC720\uC608',
    en: 'Grace',
    vi: 'Gia han',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]: {
    ko: '\uC911\uC9C0',
    en: 'Suspended',
    vi: 'Tam dung',
  },
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]: {
    ko: '\uD68C\uC0AC \uAC00\uC785 \uC694\uCCAD\uC774 \uB4F1\uB85D\uB418\uC5C8\uACE0 \uAD00\uB9AC\uC790 \uC2B9\uC778 \uC804 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.',
    en: 'The company registration request is waiting for admin approval.',
    vi: 'Yeu cau dang ky cong ty dang cho quan tri vien phe duyet.',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: {
    ko: '\uC2B9\uC778\uC77C \uAE30\uC900 30\uC77C \uCCB4\uD5D8 \uD6C4 \uAD6C\uB3C5 \uBCC0\uACBD\uC774 \uC5C6\uC73C\uBA74 \uC790\uB3D9\uC73C\uB85C \uC911\uC9C0\uB429\uB2C8\uB2E4.',
    en: 'It runs as a 30-day trial from approval and automatically becomes suspended if not changed.',
    vi: 'Duoc dung thu 30 ngay tu ngay phe duyet va se tu dong tam dung neu khong doi trang thai.',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: {
    ko: '\uD560\uB2F9\uB41C \uAD8C\uD55C\uC744 \uBAA8\uB450 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD65C\uC131 \uC885\uB8CC\uC77C\uC744 \uBE44\uC6B0\uBA74 \uBB34\uAE30\uD55C\uC785\uB2C8\uB2E4.',
    en: 'All assigned permissions are available. Leave the active end date empty for unlimited use.',
    vi: 'Co the su dung toan bo quyen da cap. De trong ngay ket thuc hoat dong de su dung vo thoi han.',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: {
    ko: '\uD65C\uC131 \uAE30\uAC04 \uC885\uB8CC \uD6C4 30\uC77C \uC720\uC608 \uC0C1\uD0DC\uC774\uBA70 \uAE30\uAC04 \uC5F0\uC7A5\uC774 \uC5C6\uC73C\uBA74 \uC911\uC9C0\uB429\uB2C8\uB2E4.',
    en: 'The active period has ended and the subscription is in a 30-day grace period before suspension.',
    vi: 'Thời gian hoat dong da het han va dang o giai doan gia han 30 ngay truoc khi tam dung.',
  },
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]: {
    ko: '\uBBF8\uB0A9 \uB610\uB294 \uAE30\uAC04 \uB9CC\uB8CC\uB85C \uC0AC\uC6A9\uC774 \uC911\uC9C0\uB41C \uC0C1\uD0DC\uC785\uB2C8\uB2E4.',
    en: 'Use is suspended because payment was not made or the period expired.',
    vi: 'Da tam dung su dung do chua thanh toan hoac het han su dung.',
  },
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS = [
  createLocalizedOption({
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
      ],
    labelText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
      ],
    descriptionText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
      ],
  }),
  createLocalizedOption({
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
      ],
    labelText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
      ],
    descriptionText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
      ],
  }),
  createLocalizedOption({
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
      ],
    labelText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
      ],
    descriptionText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
      ],
  }),
  createLocalizedOption({
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE
      ],
    labelText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE
      ],
    descriptionText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE
      ],
  }),
  createLocalizedOption({
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED
      ],
    labelText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED
      ],
    descriptionText:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED
      ],
  }),
];

export const ORGANIZATION_SUBSCRIPTION_STATUS_CHIP_COLOR = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: 'success',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: 'info',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: 'warning',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]: 'error',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]: 'default',
};

export const ORGANIZATION_SUBSCRIPTION_WORKSPACE_ALLOWED = new Set([
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL,
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE,
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE,
]);

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

export const normalizeOrgRole = (value) => {
  const upper = normalizeUpper(value);
  return hasOwn(ORG_ROLE_DEFAULT_LABELS, upper) ? upper : '';
};

export const getOrgRoleOption = (value) => {
  const normalized = normalizeOrgRole(value);
  if (!normalized) return null;
  return ORG_ROLE_OPTIONS.find((option) => option.value === normalized) || null;
};

export const getOrgRoleLabel = (value, fallback = '-', languageCode) => {
  const normalized = normalizeOrgRole(value);
  if (!normalized) return fallback;
  return resolveLocalizedText(ORG_ROLE_DEFAULT_LABELS[normalized], languageCode) || fallback;
};

export const normalizeOrgMembershipStatus = (value) => {
  const upper = normalizeUpper(value);
  return hasOwn(ORG_MEMBERSHIP_STATUS_DEFAULT_LABELS, upper) ? upper : '';
};

export const getOrgMembershipStatusLabel = (value, fallback = '-', languageCode) => {
  const normalized = normalizeOrgMembershipStatus(value);
  if (!normalized) return fallback;
  return (
    resolveLocalizedText(ORG_MEMBERSHIP_STATUS_DEFAULT_LABELS[normalized], languageCode) ||
    fallback
  );
};

export const getOrgMembershipStatusChipColor = (value) => {
  const normalized = normalizeOrgMembershipStatus(value);
  return ORG_MEMBERSHIP_STATUS_CHIP_COLOR[normalized] || 'default';
};

export const isOrgMembershipStatusFilled = (value) =>
  normalizeOrgMembershipStatus(value) === ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE;

export const normalizeOrganizationSubscriptionStatus = (value) => {
  const upper = normalizeUpper(value);
  return hasOwn(ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS, upper) ? upper : '';
};

export const getOrganizationSubscriptionStatusOption = (value) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  if (!normalized) return null;
  return (
    ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.find((option) => option.value === normalized) ||
    null
  );
};

export const getOrganizationSubscriptionStatusLabel = (
  value,
  fallback = '-',
  languageCode
) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  if (!normalized) return fallback;
  return (
    resolveLocalizedText(
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[normalized],
      languageCode
    ) || fallback
  );
};

export const getOrganizationSubscriptionStatusDescription = (
  value,
  fallback = '',
  languageCode
) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  if (!normalized) return fallback;
  return (
    resolveLocalizedText(
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_DESCRIPTIONS[normalized],
      languageCode
    ) || fallback
  );
};

export const getOrganizationSubscriptionStatusChipColor = (value) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  return ORGANIZATION_SUBSCRIPTION_STATUS_CHIP_COLOR[normalized] || 'default';
};

export const isOrganizationSubscriptionStatusFilled = (value) =>
  normalizeOrganizationSubscriptionStatus(value) ===
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE;

export const canUseWorkspaceForOrganizationSubscriptionStatus = (value) =>
  ORGANIZATION_SUBSCRIPTION_WORKSPACE_ALLOWED.has(
    normalizeOrganizationSubscriptionStatus(value)
  );

export const isOrganizationSubscriptionBlocked = (value) =>
  !canUseWorkspaceForOrganizationSubscriptionStatus(value);
