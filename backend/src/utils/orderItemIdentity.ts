type StoredItem = { id: number; itemId: string };

/** Match the public row identifier only within the current order. Never guess by style/color. */
export function planOrderItemWrites<T extends { itemId: string }>(
  existing: StoredItem[], incoming: T[]
) {
  const fail = () => { throw Object.assign(new Error("ORDER_ITEM_ID_CONFLICT: duplicate order item identifier"), { status: 409 }); };
  const byKey = new Map<string, StoredItem>();
  for (const row of existing) {
    const key = row.itemId || String(row.id);
    if (byKey.has(key)) fail();
    byKey.set(key, row);
  }
  const seen = new Set<string>();
  const retained = new Set<number>();
  const writes = incoming.map(data => {
    const key = data.itemId;
    // New legacy clients may omit identifiers; each such row is a new row.
    if (key && seen.has(key)) fail();
    if (key) seen.add(key);
    const row = key ? byKey.get(key) : undefined;
    if (row) retained.add(row.id);
    return { id: row?.id ?? null, data };
  });
  return { writes, deleteIds: existing.filter(row => !retained.has(row.id)).map(row => row.id) };
}
