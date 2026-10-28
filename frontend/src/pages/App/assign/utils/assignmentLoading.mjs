// Unknown completion is editable. Never omit a style merely because it is billed.
export function editableAssignmentStyleIds(cards, assignments) {
  const byCard = new Map();
  for (const assignment of assignments || []) {
    const key = String(assignment.cardId || '');
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key).push(assignment);
  }
  const ids = new Set();
  for (const card of cards || []) {
    const id = Number(card.styleId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const linked = byCard.get(String(card.id)) || [];
    if (!linked.length || linked.some(assignment => assignment.isCompleted !== true)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}
