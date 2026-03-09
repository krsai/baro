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
  [ORG_ROLE_KEYS.ADMIN]: '관리자',
  [ORG_ROLE_KEYS.OPERATOR]: '운영자',
  [ORG_ROLE_KEYS.ACCOUNTANT]: '회계사',
  [ORG_ROLE_KEYS.WORKER]: '작업자',
};

export const ORG_ROLE_OPTIONS = [
  {
    value: ORG_ROLE_KEYS.ADMIN,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.ADMIN],
    label: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.ADMIN],
  },
  {
    value: ORG_ROLE_KEYS.OPERATOR,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.OPERATOR],
    label: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.OPERATOR],
  },
  {
    value: ORG_ROLE_KEYS.ACCOUNTANT,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.ACCOUNTANT],
    label: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.ACCOUNTANT],
  },
  {
    value: ORG_ROLE_KEYS.WORKER,
    labelKey: ORG_ROLE_LABEL_KEYS[ORG_ROLE_KEYS.WORKER],
    label: ORG_ROLE_DEFAULT_LABELS[ORG_ROLE_KEYS.WORKER],
  },
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
  [ORG_MEMBERSHIP_STATUS_KEYS.PENDING]: '승인 대기',
  [ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE]: '활성',
  [ORG_MEMBERSHIP_STATUS_KEYS.REJECTED]: '거절',
  [ORG_MEMBERSHIP_STATUS_KEYS.SUSPENDED]: '정지',
  [ORG_MEMBERSHIP_STATUS_KEYS.TERMINATED]: '종료',
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
    'organizationSubscriptionStatus.notSubscribed',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: 'organizationSubscriptionStatus.trial',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: 'organizationSubscriptionStatus.active',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: 'organizationSubscriptionStatus.grace',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]:
    'organizationSubscriptionStatus.suspended',
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]: '미구독',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: '체험',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: '활성',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: '유예',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]: '중지',
};

export const ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS = [
  {
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
      ],
    label:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
      ],
  },
  {
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
      ],
    label:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL
      ],
  },
  {
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
      ],
    label:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
      ],
  },
  {
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE
      ],
    label:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE
      ],
  },
  {
    value: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED,
    labelKey:
      ORGANIZATION_SUBSCRIPTION_STATUS_LABEL_KEYS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED
      ],
    label:
      ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[
        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED
      ],
  },
];

export const ORGANIZATION_SUBSCRIPTION_STATUS_CHIP_COLOR = {
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE]: 'success',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.TRIAL]: 'info',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.GRACE]: 'warning',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.SUSPENDED]: 'error',
  [ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED]: 'default',
};

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

export const normalizeOrgRole = (value) => {
  const upper = normalizeUpper(value);
  return ORG_ROLE_DEFAULT_LABELS[upper] ? upper : '';
};

export const getOrgRoleOption = (value) => {
  const normalized = normalizeOrgRole(value);
  if (!normalized) return null;
  return ORG_ROLE_OPTIONS.find((option) => option.value === normalized) || null;
};

export const getOrgRoleLabel = (value, fallback = '-') => {
  const option = getOrgRoleOption(value);
  return option?.label || fallback;
};

export const normalizeOrgMembershipStatus = (value) => {
  const upper = normalizeUpper(value);
  return ORG_MEMBERSHIP_STATUS_DEFAULT_LABELS[upper] ? upper : '';
};

export const getOrgMembershipStatusLabel = (value, fallback = '-') => {
  const normalized = normalizeOrgMembershipStatus(value);
  return ORG_MEMBERSHIP_STATUS_DEFAULT_LABELS[normalized] || fallback;
};

export const getOrgMembershipStatusChipColor = (value) => {
  const normalized = normalizeOrgMembershipStatus(value);
  return ORG_MEMBERSHIP_STATUS_CHIP_COLOR[normalized] || 'default';
};

export const isOrgMembershipStatusFilled = (value) =>
  normalizeOrgMembershipStatus(value) === ORG_MEMBERSHIP_STATUS_KEYS.ACTIVE;

export const normalizeOrganizationSubscriptionStatus = (value) => {
  const upper = normalizeUpper(value);
  return ORGANIZATION_SUBSCRIPTION_STATUS_DEFAULT_LABELS[upper] ? upper : '';
};

export const getOrganizationSubscriptionStatusOption = (value) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  if (!normalized) return null;
  return (
    ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.find((option) => option.value === normalized) ||
    null
  );
};

export const getOrganizationSubscriptionStatusLabel = (value, fallback = '-') => {
  const option = getOrganizationSubscriptionStatusOption(value);
  return option?.label || fallback;
};

export const getOrganizationSubscriptionStatusChipColor = (value) => {
  const normalized = normalizeOrganizationSubscriptionStatus(value);
  return ORGANIZATION_SUBSCRIPTION_STATUS_CHIP_COLOR[normalized] || 'default';
};

export const isOrganizationSubscriptionStatusFilled = (value) =>
  normalizeOrganizationSubscriptionStatus(value) ===
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE;
