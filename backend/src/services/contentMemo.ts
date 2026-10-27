import { createHash } from 'node:crypto';

// Bounded, content-addressed memo: updates and deletions change the key even
// when counts or timestamps are unchanged. Callers still read current DB data.
export function contentMemo<T>(limit = 8) {
  const entries = new Map<string, T>();
  return (input: unknown, calculate: () => T): T => {
    const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (entries.has(key)) return entries.get(key)!;
    const result = calculate();
    entries.set(key, result);
    if (entries.size > limit) entries.delete(entries.keys().next().value!);
    return result;
  };
}
