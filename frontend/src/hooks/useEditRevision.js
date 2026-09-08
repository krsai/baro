import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJSON } from '../utils/apiClient';

export const isStaleEditError = (error) => String(error?.message || '').includes('STALE_EDIT:');

export default function useEditRevision({ scope, url, enabled = true, busy = false }) {
  const [state, setState] = useState({ scope, revision: null, stale: false });
  const revision = state.scope === scope ? state.revision : null;
  const stale = state.scope === scope && state.stale;
  const current = useRef({ scope, revision, busy });
  current.current = { scope, revision, busy };
  const accept = useCallback((value) => {
    if (current.current.scope === scope) setState({ scope, revision: value || null, stale: false });
  }, [scope]);
  const markStale = useCallback(() => {
    if (current.current.scope === scope) setState(value => ({ ...value, stale: true }));
  }, [scope]);
  useEffect(() => {
    if (!enabled || !url || !revision || stale) return undefined;
    let cancelled = false;
    let running = false;
    const check = async () => {
      if (running || current.current.busy || document.visibilityState === 'hidden') return;
      const expected = current.current.revision;
      running = true;
      try {
        const result = await requestJSON(url, { forceRefresh: true, skipGlobalLoading: true });
        if (!cancelled && current.current.scope === scope && !current.current.busy && current.current.revision === expected && result?.editRevision && result.editRevision !== expected) markStale();
      } catch { /* A failed poll must not discard edits; the save endpoint still checks. */ }
      finally { running = false; }
    };
    const timer = setInterval(check, 15000);
    void check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [scope, enabled, url, revision, stale, markStale]);
  return { revision, stale, markStale, accept };
}
