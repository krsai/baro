import { createHttpError } from "./http";

type Card = { id: string; workOrderId: number; styleId: number; cardQuantity: number;
  cardPtTotalSeconds?: number | null; cardAtTotalSeconds?: number | null;
  cardStTotalSeconds?: number | null; [field: string]: any };
type Plan = { id: number; workOrderId: number | null; styleId: number | null;
  assignmentQuantity: number | null; assignmentCard: { cardId: string } | null };
const fail = (message: string): never => { throw createHttpError(409, `ORDER_ASSIGNMENT_REVIEW: ${message}`); };
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail("invalid card or assignment quantity");
  return value;
};
const key = (row: { workOrderId: number | null; styleId: number | null }) => {
  if (!Number.isSafeInteger(row.workOrderId) || Number(row.workOrderId) <= 0 ||
      !Number.isSafeInteger(row.styleId) || Number(row.styleId) <= 0) return fail("missing order/style reference");
  return `${row.workOrderId}:${row.styleId}`;
};
const sum = (values: number[]) => count(values.reduce((total, value) => total + count(value), 0));

/** Rebuild only the unassigned pool. Placed cards and every plan remain unchanged. */
export function reconcileAssignmentCards({ baseCards, savedCards, plans, sourceOrderIds }: {
  baseCards: Card[]; savedCards: Card[]; plans: Plan[]; sourceOrderIds: number[];
}): Card[] {
  const savedById = new Map<string, Card>();
  for (const card of savedCards) {
    if (!card.id || savedById.has(card.id)) fail("duplicate saved card identifier");
    savedById.set(card.id, card);
  }
  const assignedIds = new Set<string>();
  const allocated = new Map<string, number>();
  for (const plan of plans) {
    const card = savedById.get(plan.assignmentCard?.cardId ?? "");
    if (!card || key(plan) !== key(card) || assignedIds.has(card.id)) return fail("repair assignment card references before rebuilding");
    const assigned = count(plan.assignmentQuantity);
    if (count(card.cardQuantity) !== assigned) fail("card and assignment quantities differ; review the existing assignment");
    assignedIds.add(card.id);
    allocated.set(key(plan), sum([allocated.get(key(plan)) ?? 0, assigned]));
  }
  const sourceIds = new Set(sourceOrderIds);
  const unassignedByKey = new Map<string, Card[]>();
  for (const card of savedCards) {
    if (assignedIds.has(card.id) || !sourceIds.has(card.workOrderId)) continue;
    const groupKey = key(card);
    const group = unassignedByKey.get(groupKey) ?? [];
    group.push(card);
    unassignedByKey.set(groupKey, group);
  }
  const baseKeys = new Set<string>();
  const usedIds = new Set<string>();
  const result: Card[] = [];
  const append = (card: Card) => {
    if (usedIds.has(card.id)) fail("duplicate rebuilt card identifier");
    usedIds.add(card.id);
    result.push(card);
  };
  // Retain assigned cards, including historical zero-quantity/removed-style cards.
  // Orders outside this rebuild's authorized source scope stay intact.
  for (const card of savedCards) {
    if (assignedIds.has(card.id) || !sourceIds.has(card.workOrderId)) append(card);
  }
  for (const base of baseCards) {
    const groupKey = key(base);
    if (!sourceIds.has(base.workOrderId) || baseKeys.has(groupKey)) fail("invalid rebuild source scope");
    baseKeys.add(groupKey);
    const total = count(base.cardQuantity);
    const remaining = total - (allocated.get(groupKey) ?? 0);
    if (remaining < 0) fail(`style ${base.styleId} has more assigned quantity than the order`);
    if (!remaining) continue;
    const unassigned = unassignedByKey.get(groupKey) ?? [];
    // A deliberate split remains a split on repeated saves or display/style updates.
    if (sum(unassigned.map(card => card.cardQuantity)) === remaining) {
      for (const card of unassigned) append({ ...card, ...scale(base, card.cardQuantity, card.id) });
    } else {
      let id = base.id;
      // Keep an existing free pool identifier when possible; never borrow a placed ID.
      const reusable = unassigned.find(card => card.id === base.id) ?? unassigned[0];
      if (reusable) id = reusable.id;
      while (usedIds.has(id)) id += "-R";
      append({ ...(reusable ?? {}), ...scale(base, remaining, id) });
    }
  }
  return result;
}

function scale(base: Card, quantity: number, id: string): Card {
  const fraction = quantity / count(base.cardQuantity);
  // Same proportional totals as a user splitting an unassigned card on the board.
  const seconds = (value: number | null | undefined) => value == null ? null : Math.round(value * fraction);
  return { ...base, id, originOrderId: base.id, cardQuantity: quantity,
    cardPtTotalSeconds: seconds(base.cardPtTotalSeconds),
    cardAtTotalSeconds: seconds(base.cardAtTotalSeconds),
    cardStTotalSeconds: seconds(base.cardStTotalSeconds) };
}
