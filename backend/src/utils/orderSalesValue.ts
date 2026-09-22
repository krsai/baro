type OrderItem = {
  styleId?: number | null;
  totalQuantity?: number | null;
  style?: { code?: string | null; name?: string | null } | null;
};

const positiveInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

const nonNegativeInt = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export const resolveSalesPriceBucket = (quantity: number, values: unknown[]): number | null => {
  const buckets = Array.from(new Set(values.filter((value): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  ))).sort((left, right) => left - right);
  if (!buckets.length) return null;
  let selected = buckets[0]!;
  for (const bucket of buckets) if (quantity >= bucket) selected = bucket;
  return selected;
};

export const calculateOrderSalesValue = (order: { workOrderItems?: OrderItem[] }, relationship: any) => {
  const quantityByStyleId = new Map<number, { quantity: number; styleCode: string; styleName: string }>();
  let hasMissingStyle = false;
  for (const item of order.workOrderItems ?? []) {
    const quantity = nonNegativeInt(item.totalQuantity);
    if (quantity <= 0) continue;
    const styleId = positiveInt(item.styleId);
    if (!styleId) { hasMissingStyle = true; continue; }
    const current = quantityByStyleId.get(styleId);
    quantityByStyleId.set(styleId, {
      quantity: (current?.quantity ?? 0) + quantity,
      styleCode: current?.styleCode || item.style?.code || "",
      styleName: current?.styleName || item.style?.name || "",
    });
  }
  if (!relationship || !quantityByStyleId.size || hasMissingStyle) {
    return { status: "MISSING_PRICE", pricingBasis: null, currencyCode: null, amount: null,
      hasMultipleScopes: false, lines: Array.from(quantityByStyleId, ([styleId, row]) => ({
        styleId, ...row, bucketQuantity: null, unitPrice: null, amount: null, status: "MISSING_PRICE",
      })) };
  }
  const scopes = new Set((relationship.salesPriceLists ?? []).map((list: any) =>
    `${list.pricingBasis}:${list.currency?.code || ""}`));
  const candidates: any[] = [];
  for (const scope of scopes) {
    const [pricingBasis, currencyCode] = String(scope).split(":");
    let complete = true;
    const lines = Array.from(quantityByStyleId, ([styleId, row]) => {
      const override = (relationship.salesBucketOverrides ?? []).find((item: any) => item.styleId === styleId);
      const version = override?.quantityBucketSetVersion || relationship.salesBucketSetVersion;
      const bucketQuantity = resolveSalesPriceBucket(row.quantity,
        (version?.entries ?? []).map((entry: any) => entry.bucketQuantity));
      const list = (relationship.salesPriceLists ?? []).find((item: any) =>
        item.styleId === styleId && item.pricingBasis === pricingBasis &&
        item.currency?.code === currencyCode && item.quantityBucketSetVersionId === version?.id);
      const price = (list?.prices ?? []).find((item: any) =>
        item.quantityBucketEntry?.bucketQuantity === bucketQuantity);
      const unitPrice = price == null ? null : Number(price.unitPrice);
      const hasPrice = typeof unitPrice === "number" && Number.isFinite(unitPrice);
      if (bucketQuantity == null || !hasPrice) complete = false;
      return { styleId, ...row, bucketQuantity, unitPrice,
        amount: hasPrice ? row.quantity * unitPrice : null,
        status: hasPrice ? "AVAILABLE" : "MISSING_PRICE" };
    });
    const amount = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
    candidates.push({ pricingBasis, currencyCode, amount: complete && Number.isFinite(amount) ? amount : null, lines, complete });
  }
  candidates.sort((left, right) => {
    const rank = (row: any) => (row.pricingBasis === "MANUFACTURING_SERVICE_PRICE" ? 0 : 10) +
      (row.currencyCode === "USD" ? 0 : 1);
    return rank(left) - rank(right);
  });
  const completeCandidates = candidates.filter((candidate) => candidate.complete);
  if (completeCandidates.length) {
    const { complete: _complete, ...selected } = completeCandidates[0];
    return { status: "AVAILABLE", ...selected, hasMultipleScopes: completeCandidates.length > 1 };
  }
  if (candidates.length) {
    const { complete: _complete, ...selected } = candidates[0];
    return { status: "MISSING_PRICE", ...selected, hasMultipleScopes: candidates.length > 1 };
  }
  return { status: "MISSING_PRICE", pricingBasis: null, currencyCode: null, amount: null,
    hasMultipleScopes: false, lines: Array.from(quantityByStyleId, ([styleId, row]) => ({
      styleId, ...row, bucketQuantity: null, unitPrice: null, amount: null, status: "MISSING_PRICE",
    })) };
};
