// Preparation is based on saved relational items, never the retired manual lock.
export const isOrderReadyForAssignment = (order: {
  id?: unknown;
  workOrderItems?: Array<{ styleId?: unknown; totalQuantity?: unknown }>;
} | null | undefined): boolean => {
  if (!Number.isSafeInteger(order?.id) || Number(order?.id) <= 0) return false;
  const items = order?.workOrderItems;
  return Array.isArray(items) && items.length > 0 && items.every(item =>
    Number.isSafeInteger(item.styleId) && Number(item.styleId) > 0 &&
    Number.isSafeInteger(item.totalQuantity) && Number(item.totalQuantity) >= 0
  ) && items.some(item => Number(item.totalQuantity) > 0);
};
