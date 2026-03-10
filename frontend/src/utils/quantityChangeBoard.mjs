const normalizeBoardKey = (value) => String(value ?? '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveCardOriginId = (card) => normalizeBoardKey(card?.originOrderId || card?.id);

const buildCardLookup = (cards = []) =>
  new Map(
    cards
      .filter((card) => normalizeBoardKey(card?.id))
      .map((card) => [normalizeBoardKey(card.id), card])
  );

const resolveAssignmentOriginId = (assignment, cardById) => {
  const explicitOrigin = normalizeBoardKey(assignment?.originOrderId);
  if (explicitOrigin) return explicitOrigin;
  const cardId = normalizeBoardKey(assignment?.cardId);
  if (!cardId) return '';
  const linkedCard = cardById.get(cardId);
  const linkedOrigin = normalizeBoardKey(linkedCard?.originOrderId || linkedCard?.id);
  return linkedOrigin || cardId;
};

const resolvePreviousCard = (cards = [], originId) =>
  cards.find((card) => normalizeBoardKey(card?.id) === originId) ||
  cards.find((card) => normalizeBoardKey(card?.originOrderId) === originId) ||
  null;

export const reconcileBoardStateForQuantityChanges = ({
  currentCards = [],
  currentAssignments = [],
  changedVariantIds = [],
  nextVariantMap = new Map(),
  styleProcessSummaryById = new Map(),
  orderId = '',
  orderNumber = '',
  customerName = '',
  calculateProcessTotalForOrderQuantity = null,
}) => {
  const changedOriginIdSet = new Set(
    (Array.isArray(changedVariantIds) ? changedVariantIds : [])
      .map((value) => normalizeBoardKey(value))
      .filter(Boolean)
  );
  const cardById = buildCardLookup(currentCards);
  const nextAssignments = (Array.isArray(currentAssignments) ? currentAssignments : []).filter(
    (assignment) => !changedOriginIdSet.has(resolveAssignmentOriginId(assignment, cardById))
  );
  const cancelledAssignmentCount =
    (Array.isArray(currentAssignments) ? currentAssignments.length : 0) - nextAssignments.length;

  const normalizedWorkOrderId = normalizeBoardKey(orderId);
  const untouchedCards = (Array.isArray(currentCards) ? currentCards : []).filter((card) => {
    if (changedOriginIdSet.has(resolveCardOriginId(card))) return false;
    if (
      card?.type === 'DELTA' &&
      normalizeBoardKey(card?.workOrderId) === normalizedWorkOrderId
    ) {
      return false;
    }
    return true;
  });

  const variantMap = nextVariantMap instanceof Map ? nextVariantMap : new Map();
  const styleSummaryMap =
    styleProcessSummaryById instanceof Map ? styleProcessSummaryById : new Map();
  const canCalculateProcessTotal = typeof calculateProcessTotalForOrderQuantity === 'function';

  const rebuiltCards = Array.from(changedOriginIdSet)
    .map((originId) => {
      const nextVariant = variantMap.get(originId);
      const nextQty = toNumber(nextVariant?.quantity, 0);
      if (nextQty <= 0) return null;

      const previousCard = resolvePreviousCard(currentCards, originId);
      const { type: _legacyType, deltaType: _legacyDeltaType, ...previousCardBase } = previousCard || {};
      const styleId = normalizeBoardKey(nextVariant?.styleId);

      const previousQty = toNumber(previousCardBase.quantity, 0);
      const fallbackUnitPt =
        previousQty > 0 ? toNumber(previousCardBase.totalPt, 0) / previousQty : 0;
      const fallbackUnitAt =
        previousQty > 0 ? toNumber(previousCardBase.totalAt, 0) / previousQty : 0;

      const processSummary = styleSummaryMap.get(styleId) || null;
      const hasProcessSummary =
        canCalculateProcessTotal &&
        Array.isArray(processSummary?.processes) &&
        processSummary.processes.length > 0;
      const totalPt = hasProcessSummary
        ? calculateProcessTotalForOrderQuantity(processSummary.processes, 'pt', nextQty)
        : fallbackUnitPt * nextQty;
      const totalAt = hasProcessSummary
        ? calculateProcessTotalForOrderQuantity(processSummary.processes, 'at', nextQty)
        : fallbackUnitAt * nextQty;
      const status = totalPt > 0 ? 'PT' : 'NONE';
      const totalSeconds = totalPt;

      return {
        ...previousCardBase,
        id: originId,
        originOrderId: originId,
        orderNo: orderNumber || previousCardBase.orderNo || '-',
        customer: customerName || previousCardBase.customer || '-',
        styleId: styleId || previousCardBase.styleId || '',
        styleName:
          nextVariant?.styleName ||
          previousCardBase.styleName ||
          nextVariant?.styleCode ||
          previousCardBase.styleCode ||
          'STYLE',
        styleCode: nextVariant?.styleCode || previousCardBase.styleCode || '',
        colorId: nextVariant?.colorId || previousCardBase.colorId || '',
        colorName:
          nextVariant?.colorName ||
          previousCardBase.colorName ||
          nextVariant?.colorId ||
          previousCardBase.colorId ||
          '',
        gender: nextVariant?.gender || previousCardBase.gender || 'U',
        quantity: nextQty,
        processCount: hasProcessSummary
          ? toNumber(processSummary.processCount, 0)
          : toNumber(previousCardBase.processCount, 0),
        status,
        totalSeconds,
        totalPt,
        totalAt,
        previewUrl:
          (hasProcessSummary ? processSummary.previewUrl : '') ||
          previousCardBase.previewUrl ||
          '',
        pendingCtProposal: null,
      };
    })
    .filter(Boolean);

  return {
    cards: [...untouchedCards, ...rebuiltCards],
    assignments: nextAssignments,
    cancelledAssignmentCount,
    rebuiltCardsCount: rebuiltCards.length,
  };
};

