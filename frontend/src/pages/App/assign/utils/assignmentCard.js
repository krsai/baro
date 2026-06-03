const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNonNegativeIntOrNull = (value) => {
  const parsed = toNumberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return Math.trunc(parsed);
};

const toPositiveSecondsOrNull = (value) => {
  const parsed = toNumberOrNull(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed);
};

export const getAssignmentCardStatus = (card) =>
  String(card?.status || '').trim().toUpperCase();

export const resolveCardQuantity = (card, fallback = 0) =>
  toNonNegativeIntOrNull(card?.cardQuantity ?? card?.quantity) ?? fallback;

export const resolveCardPtTotalSeconds = (card, fallback = 0) => {
  const hasExplicitStTotal =
    toPositiveSecondsOrNull(card?.cardStTotalSeconds ?? card?.totalSt) !== null;
  return (
    toPositiveSecondsOrNull(
      card?.cardPtTotalSeconds ??
        card?.totalPt ??
        (getAssignmentCardStatus(card) !== 'ST' && !hasExplicitStTotal
          ? card?.stTotalSeconds
          : null)
    ) ?? fallback
  );
};

export const resolveCardAtTotalSeconds = (card, fallback = 0) =>
  toPositiveSecondsOrNull(card?.cardAtTotalSeconds ?? card?.totalAt) ?? fallback;

export const resolveCardStOnlyTotalSeconds = (card, fallback = 0) => {
  const direct = toPositiveSecondsOrNull(card?.cardStTotalSeconds ?? card?.totalSt);
  if (direct !== null) return direct;
  return getAssignmentCardStatus(card) === 'ST'
    ? toPositiveSecondsOrNull(card?.stTotalSeconds) ?? fallback
    : fallback;
};

export const resolveAssignmentCardBasis = (card) => {
  const status = getAssignmentCardStatus(card);
  if (status === 'ST') return 'ST';
  if (status === 'PT' || status === 'CT' || status === 'AT') return 'PT';
  if (resolveCardStOnlyTotalSeconds(card, 0) > 0) return 'ST';
  if (resolveCardPtTotalSeconds(card, 0) > 0) return 'PT';
  return 'NONE';
};

export const resolveCardScheduleTotalSeconds = (card, fallback = 0) => {
  const basis = resolveAssignmentCardBasis(card);
  if (basis === 'ST') {
    return (
      resolveCardStOnlyTotalSeconds(card, 0) ||
      toPositiveSecondsOrNull(card?.cardStTotalSeconds ?? card?.stTotalSeconds) ||
      fallback
    );
  }
  if (basis === 'PT') {
    return resolveCardPtTotalSeconds(card, 0) || toPositiveSecondsOrNull(card?.stTotalSeconds) || fallback;
  }
  return fallback;
};

export const resolveAssignmentCardStatus = ({
  card = null,
  cardPtTotalSeconds = null,
  cardStTotalSeconds = null,
} = {}) => {
  const stPresent =
    toPositiveSecondsOrNull(cardStTotalSeconds) != null ||
    resolveCardStOnlyTotalSeconds(card, 0) > 0;
  const ptPresent =
    toPositiveSecondsOrNull(cardPtTotalSeconds) != null ||
    resolveCardPtTotalSeconds(card, 0) > 0;
  if (stPresent) return 'ST';
  if (ptPresent) return 'PT';
  return 'NONE';
};

export const normalizeAssignmentCardForBoard = (card) => {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
  const status = getAssignmentCardStatus(card);
  const cardQuantity = resolveCardQuantity(card, 0);
  const cardPtTotalSeconds = resolveCardPtTotalSeconds(card, 0);
  const cardAtTotalSeconds = resolveCardAtTotalSeconds(card, 0);
  const cardStTotalSeconds = resolveCardStOnlyTotalSeconds(card, 0);
  const nextStatus =
    status || resolveAssignmentCardStatus({ card, cardPtTotalSeconds, cardStTotalSeconds });
  const scheduledTotalSeconds =
    nextStatus === 'ST'
      ? cardStTotalSeconds || toPositiveSecondsOrNull(card?.stTotalSeconds) || 0
      : cardPtTotalSeconds || toPositiveSecondsOrNull(card?.stTotalSeconds) || 0;

  return {
    ...card,
    cardQuantity,
    cardPtTotalSeconds,
    cardAtTotalSeconds,
    cardStTotalSeconds,
    quantity: cardQuantity,
    totalPt: cardPtTotalSeconds,
    totalAt: cardAtTotalSeconds,
    stTotalSeconds: scheduledTotalSeconds,
    status: nextStatus,
  };
};

export const normalizeAssignmentCardForPersistence = (card) => {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
  const normalized = normalizeAssignmentCardForBoard(card);
  const {
    quantity: _quantity,
    totalPt: _totalPt,
    totalAt: _totalAt,
    totalSt: _totalSt,
    stTotalSeconds: _stTotalSeconds,
    totalSeconds: _totalSeconds,
    stSeconds: _stSeconds,
    contractedSeconds: _contractedSeconds,
    ctAgreedSnapshot: _ctAgreedSnapshot,
    ...rest
  } = normalized;
  return {
    ...rest,
    cardQuantity: normalized.cardQuantity,
    cardPtTotalSeconds: normalized.cardPtTotalSeconds,
    cardAtTotalSeconds: normalized.cardAtTotalSeconds,
    cardStTotalSeconds: normalized.cardStTotalSeconds,
  };
};
