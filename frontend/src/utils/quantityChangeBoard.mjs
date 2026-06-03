const normalizeBoardKey = (value) => String(value ?? '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DEFAULT_TIME_REF_QUANTITY = 1000;

const findExactStSeconds = (values, orderQuantity) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const resolvedOrderQuantity = Math.max(1, Math.trunc(toNumber(orderQuantity, 1)));
  const matched = values.find((value) => {
    const quantity = Math.max(0, Math.trunc(toNumber(value?.bucketQuantity ?? value?.quantity, 0)));
    return quantity === resolvedOrderQuantity;
  });
  const seconds = toNumber(matched?.bucketStSeconds ?? matched?.seconds, NaN);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

const resolveProcessStPerPieceSeconds = (process, orderQuantity = 1) => {
  const stBuckets = Array.isArray(process?.stBuckets) ? process.stBuckets : process?.stValues;
  const exactSt = findExactStSeconds(stBuckets, orderQuantity);
  if (exactSt != null) return exactSt;

  const pt = toNumber(process?.pt, NaN);
  if (Number.isFinite(pt) && pt > 0) return pt;

  if (Array.isArray(stBuckets) && stBuckets.length > 0) {
    return null;
  }

  const legacyCt = toNumber(process?.ct, NaN);
  const legacyQuantity = Math.max(
    1,
    Math.trunc(toNumber(process?.timeRefQuantity, DEFAULT_TIME_REF_QUANTITY))
  );
  const resolvedOrderQuantity = Math.max(1, Math.trunc(toNumber(orderQuantity, 1)));
  if (
    process?.stManual === true &&
    Number.isFinite(legacyCt) &&
    legacyCt > 0 &&
    legacyQuantity === resolvedOrderQuantity
  ) {
    return legacyCt;
  }

  return null;
};

const resolveProcessStTotalSeconds = (process, orderQuantity = 1) => {
  const resolvedOrderQuantity = Math.max(1, Math.trunc(toNumber(orderQuantity, 1)));
  const stPerPiece = resolveProcessStPerPieceSeconds(process, resolvedOrderQuantity);
  if (stPerPiece == null) return 0;
  return stPerPiece * resolvedOrderQuantity;
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
      const { type: _legacyType, deltaType: _legacyDeltaType, ...previousCardBase } =
        previousCard || {};
      const styleId = normalizeBoardKey(nextVariant?.styleId);

      const previousQty = toNumber(
        previousCardBase.cardQuantity ?? previousCardBase.quantity,
        0
      );
      const fallbackUnitPt =
        previousQty > 0
          ? toNumber(
              previousCardBase.cardPtTotalSeconds ?? previousCardBase.totalPt,
              0
            ) / previousQty
          : 0;
      const fallbackUnitAt =
        previousQty > 0
          ? toNumber(
              previousCardBase.cardAtTotalSeconds ?? previousCardBase.totalAt,
              0
            ) / previousQty
          : 0;
      const fallbackUnitSt =
        previousQty > 0
          ? toNumber(
              previousCardBase.cardStTotalSeconds ?? previousCardBase.totalSt,
              0
            ) / previousQty
          : 0;

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
      const totalSt = hasProcessSummary
        ? processSummary.processes.reduce(
            (sum, process) =>
              sum + toNumber(resolveProcessStTotalSeconds(process, nextQty), 0),
            0
          )
        : fallbackUnitSt * nextQty;
      const hasSt = totalSt > 0;
      const hasPt = totalPt > 0;
      const status = hasSt ? 'ST' : hasPt ? 'PT' : 'NONE';
      const stTotalSeconds = hasSt ? totalSt : totalPt;

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
        colorId: nextVariant?.colorId ?? previousCardBase.colorId ?? '',
        colorName: nextVariant?.colorName ?? previousCardBase.colorName ?? '',
        gender: nextVariant?.gender ?? previousCardBase.gender ?? '',
        quantity: nextQty,
        processCount: hasProcessSummary
          ? toNumber(processSummary.processCount, 0)
          : toNumber(previousCardBase.processCount, 0),
        status,
        cardQuantity: nextQty,
        cardPtTotalSeconds: totalPt,
        cardAtTotalSeconds: totalAt,
        cardStTotalSeconds: totalSt,
        stTotalSeconds,
        totalPt,
        totalAt,
        previewUrl:
          (hasProcessSummary ? processSummary.previewUrl : '') ||
          previousCardBase.previewUrl ||
          '',
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
