/** Canonical, validated quantities supplied by the order write path. No display-name matching. */
export type OrderImpactItem = {
  styleId: number;
  totalQuantity: number;
  gender: "M" | "W" | "U" | null;
};
export type OrderImpactAssignment = {
  id: number;
  styleId: number;
  assignmentQuantity: number;
  hasWorkRecords: boolean;
  isCompleted: boolean;
  isPayrollLocked: boolean;
};

const requireInteger = (value: number, minimum: number) => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error("ORDER_ASSIGNMENT_IMPACT_INVALID_INPUT");
  }
  return value;
};
const addQuantity = (a: number, b: number) => requireInteger(a + b, 0);
const summarize = (items: readonly OrderImpactItem[]) => {
  const result = new Map<number, { total: number; male: number; female: number; unspecified: number }>();
  for (const item of items) {
    requireInteger(item.styleId, 1);
    requireInteger(item.totalQuantity, 0);
    if (!["M", "W", "U", null].includes(item.gender)) {
      throw new Error("ORDER_ASSIGNMENT_IMPACT_INVALID_INPUT");
    }
    const bucket = result.get(item.styleId) ?? { total: 0, male: 0, female: 0, unspecified: 0 };
    const key = item.gender === "M" ? "male" : item.gender === "W" ? "female" : "unspecified";
    bucket.total = addQuantity(bucket.total, item.totalQuantity);
    bucket[key] = addQuantity(bucket[key], item.totalQuantity);
    result.set(item.styleId, bucket);
  }
  return result;
};

/**
 * Read-only impact facts for ONE order and ONE organization's assignments.
 * Callers must enforce that scope using FKs. This is not a save permission or
 * a redistribution plan: existing quantities, snapshots and work records stay intact.
 */
export function analyzeOrderAssignmentImpact({ beforeItems, afterItems, assignments }: {
  beforeItems: readonly OrderImpactItem[];
  afterItems: readonly OrderImpactItem[];
  assignments: readonly OrderImpactAssignment[];
}) {
  const before = summarize(beforeItems);
  const after = summarize(afterItems);
  const groups = new Map<number, OrderImpactAssignment[]>();
  const ids = new Set<number>();
  for (const plan of assignments) {
    requireInteger(plan.id, 1);
    requireInteger(plan.styleId, 1);
    requireInteger(plan.assignmentQuantity, 0);
    if (ids.has(plan.id) || [plan.hasWorkRecords, plan.isCompleted, plan.isPayrollLocked]
      .some(value => typeof value !== "boolean")) {
      throw new Error("ORDER_ASSIGNMENT_IMPACT_INVALID_INPUT");
    }
    ids.add(plan.id);
    const group = groups.get(plan.styleId) ?? [];
    group.push(plan);
    groups.set(plan.styleId, group);
  }
  const empty = { total: 0, male: 0, female: 0, unspecified: 0 };
  return [...new Set([...before.keys(), ...after.keys(), ...groups.keys()])]
    .sort((a, b) => a - b).map(styleId => {
      const previous = before.get(styleId) ?? empty;
      const next = after.get(styleId) ?? empty;
      const plans = groups.get(styleId) ?? [];
      const assignedQuantity = plans.reduce((sum, plan) => addQuantity(sum, plan.assignmentQuantity), 0);
      const quantityChanged = previous.total !== next.total;
      const genderQuantitiesChanged = previous.male !== next.male || previous.female !== next.female ||
        previous.unspecified !== next.unspecified;
      const styleAdded = !before.has(styleId) && after.has(styleId);
      const styleRemoved = before.has(styleId) && !after.has(styleId);
      return {
        styleId, previous: { ...previous }, next: { ...next },
        styleAdded, styleRemoved, quantityChanged, genderQuantitiesChanged,
        assignedQuantity,
        remainingQuantity: Math.max(0, next.total - assignedQuantity),
        overAssignedQuantity: Math.max(0, assignedQuantity - next.total),
        isSplit: plans.length > 1,
        // A linked zero-quantity plan must also remain visible for review.
        requiresAssignmentReview: plans.length > 0 &&
          (quantityChanged || genderQuantitiesChanged || styleAdded || styleRemoved),
        assignmentIds: plans.map(plan => plan.id).sort((a, b) => a - b),
        workRecordAssignmentIds: plans.filter(plan => plan.hasWorkRecords).map(plan => plan.id).sort((a, b) => a - b),
        completedAssignmentIds: plans.filter(plan => plan.isCompleted).map(plan => plan.id).sort((a, b) => a - b),
        payrollLockedAssignmentIds: plans.filter(plan => plan.isPayrollLocked).map(plan => plan.id).sort((a, b) => a - b),
      };
    });
}
