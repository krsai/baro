// Read-only invoice preparation. Production is known by style, never by size.
export const buildInvoiceSource = (order: any, plans: any[], progressRows: any[], relationship: any) => {
  const progress = new Map(progressRows.map((row) => [row.id, row]));
  const items = order.workOrderItems || [];
  const styleIds = [...new Set(items.map((item: any) => item.styleId))];
  const styles = styleIds.map((styleId) => {
    const styleItems = items.filter((item: any) => item.styleId === styleId);
    const linked = plans.filter((plan) => plan.styleId === styleId);
    const rows = linked.map((plan) => ({ ...plan, progress: progress.get(plan.externalId) }));
    const ready = Boolean(styleId) && rows.length > 0 && rows.every((row) =>
      row.progress?.isCompleted && !row.progress?.hasInvalidProcessReferences && !row.progress?.isProgressUnknown);
    const override = relationship?.salesBucketOverrides?.find((row: any) => row.styleId === styleId);
    const version = override?.quantityBucketSetVersion || relationship?.salesBucketSetVersion;
    return {
      styleId, code: styleItems[0]?.style?.code || '', name: styleItems[0]?.style?.name || '',
      orderedQuantity: styleItems.reduce((sum: number, item: any) => sum + item.totalQuantity, 0),
      producedQuantity: rows.length && rows.every((row) => row.progress && !row.progress.isProgressUnknown)
        ? rows.reduce((sum, row) => sum + row.progress.producedQuantity, 0) : null,
      ready,
      assignments: rows.map((row) => ({ id: row.id, externalId: row.externalId,
        completed: Boolean(row.progress?.isCompleted), producedQuantity: row.progress?.producedQuantity ?? null,
        completionTargetQuantity: row.progress?.completionTargetQuantity ?? null,
        hasCompletionDifference: Boolean(row.progress?.isCompletionInconsistent) })),
      prices: (relationship?.salesPriceLists || []).filter((list: any) =>
        list.styleId === styleId && list.quantityBucketSetVersionId === version?.id
      ).map((list: any) => ({ id: list.id, pricingBasis: list.pricingBasis, currencyCode: list.currency.code,
        versionId: version.id,
        entries: (version.entries || []).map((entry: any) => {
          const price = list.prices.find((price: any) => price.quantityBucketEntryId === entry.id);
          return { entryId: entry.id, quantity: entry.bucketQuantity, priceId: price?.id ?? null,
            unitPrice: price ? String(price.unitPrice) : null };
        }).sort((a: any, b: any) => a.quantity - b.quantity) })),
    };
  });
  const party = (org: any) => ({ name: org?.name || '', address: org?.address || '',
    country: org?.country || '', taxId: org?.businessNumber || '', email: org?.email || '', phone: org?.phone || '' });
  return {
    orderId: order.orderId, orderNumber: order.orderNumber, sourceUpdatedAt: order.updatedAt,
    buyerOrgId: order.buyerOrgId ?? order.buyerOrg?.id, sellerOrgId: order.sellerOrgId ?? order.sellerOrg?.id,
    seller: party(order.sellerOrg), buyer: party(order.buyerOrg), styles,
    ready: styles.length > 0 && styles.every((style) => style.ready) &&
      plans.every((plan) => styleIds.includes(plan.styleId)),
    lines: items.flatMap((item: any) => {
      const sizes = Object.entries(item.sizeQuantities || {}).filter(([, quantity]) => Number(quantity) > 0);
      const validSizes = sizes.length && sizes.reduce((sum, [, quantity]) => sum + Number(quantity), 0) === item.totalQuantity;
      const rows = validSizes ? sizes : [['', item.totalQuantity]];
      return rows.map(([size, quantity]) => ({ key: `${item.id}:${size}`, itemId: item.id,
        styleId: item.styleId, styleCode: item.style?.code || '', description: item.style?.name || '',
        color: item.color?.name || item.color?.code || '', gender: item.gender || '', size,
        orderedQuantity: Number(quantity), quantity: String(quantity), adjustmentReason: '', hsCode: '', origin: '' }));
    }),
  };
};
