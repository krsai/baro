// Move complete color blocks (including every gender) without changing item identity or quantities.
export function reorderOrderColorItems(items, groupIds, movingIds, targetIds) {
  const ids = groupIds.map(String), moving = new Set(movingIds.map(String)), targets = new Set(targetIds.map(String));
  if (!moving.size || !targets.size || [...moving].some(id => !ids.includes(id)) || [...targets].some(id => !ids.includes(id)) || [...moving].some(id => targets.has(id))) return items;
  const from = ids.findIndex(id => moving.has(id)), to = ids.findIndex(id => targets.has(id));
  const rest = ids.filter(id => !moving.has(id));
  const targetPositions = rest.map((id, index) => targets.has(id) ? index : -1).filter(index => index >= 0);
  rest.splice(from < to ? Math.max(...targetPositions) + 1 : Math.min(...targetPositions), 0, ...ids.filter(id => moving.has(id)));
  const byId = new Map(items.map(item => [String(item.id), item]));
  const groupSet = new Set(ids);
  if (ids.some(id => !byId.has(id))) return items;
  let index = 0;
  return items.map(item => groupSet.has(String(item.id)) ? byId.get(rest[index++]) : item);
}
