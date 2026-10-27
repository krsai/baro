// Only share work that is currently running. Never reuse a completed result:
// subsequent reads must see source edits/deletions, including old months.
export function coalesceInFlightRead<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, read: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const result = Promise.resolve().then(read).finally(() => {
      if (pending.get(key) === result) pending.delete(key);
    });
    pending.set(key, result);
    return result;
  };
}
