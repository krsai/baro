export const ASSIGNMENT_CT_STATUS_KEYS = {
  PENDING: 'PENDING',
  AGREED: 'AGREED',
};

export const ASSIGNMENT_CT_STATUS_LABEL_KEYS = {
  [ASSIGNMENT_CT_STATUS_KEYS.PENDING]: 'assignmentStatus.pending',
  [ASSIGNMENT_CT_STATUS_KEYS.AGREED]: 'assignmentStatus.agreed',
};

export const ASSIGNMENT_CT_STATUS_DEFAULT_LABELS = {
  [ASSIGNMENT_CT_STATUS_KEYS.PENDING]: '\uB300\uAE30',
  [ASSIGNMENT_CT_STATUS_KEYS.AGREED]: '\uD655\uC815',
};

export const ASSIGNMENT_CT_STATUS_OPTIONS = [
  {
    value: ASSIGNMENT_CT_STATUS_KEYS.PENDING,
    labelKey: ASSIGNMENT_CT_STATUS_LABEL_KEYS[ASSIGNMENT_CT_STATUS_KEYS.PENDING],
    label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS[ASSIGNMENT_CT_STATUS_KEYS.PENDING],
  },
  {
    value: ASSIGNMENT_CT_STATUS_KEYS.AGREED,
    labelKey: ASSIGNMENT_CT_STATUS_LABEL_KEYS[ASSIGNMENT_CT_STATUS_KEYS.AGREED],
    label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS[ASSIGNMENT_CT_STATUS_KEYS.AGREED],
  },
];

export const ASSIGNMENT_CT_STATUS_SORT_ORDER = {
  [ASSIGNMENT_CT_STATUS_KEYS.PENDING]: 0,
  [ASSIGNMENT_CT_STATUS_KEYS.AGREED]: 1,
};

const ASSIGNMENT_CT_STATUS_LOCKED_VALUES = new Set([
  ASSIGNMENT_CT_STATUS_KEYS.AGREED,
]);

export const normalizeAssignmentCtStatus = (value) => {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === ASSIGNMENT_CT_STATUS_KEYS.AGREED) return ASSIGNMENT_CT_STATUS_KEYS.AGREED;
  return ASSIGNMENT_CT_STATUS_KEYS.PENDING;
};

export const getAssignmentCtStatusLabel = (value, fallback = '-') => {
  const normalized = normalizeAssignmentCtStatus(value);
  return ASSIGNMENT_CT_STATUS_DEFAULT_LABELS[normalized] || fallback;
};

export const isAssignmentCtStatusLocked = (value) =>
  ASSIGNMENT_CT_STATUS_LOCKED_VALUES.has(normalizeAssignmentCtStatus(value));
