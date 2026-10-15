import { isDeepStrictEqual } from 'node:util';

// Compare persisted fields only. Display fields are supplied by FK joins.
export function assignmentCardNeedsWrite(existing: any, next: any): boolean {
  if (!existing) return true;
  return ['sortOrder', 'styleId', 'workOrderId', 'buyerOrgId'].some(key => existing[key] !== next[key])
    || !isDeepStrictEqual(existing.payload, JSON.parse(JSON.stringify(next.payload)));
}
