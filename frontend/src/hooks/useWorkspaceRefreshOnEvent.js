import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppActions } from '../context/AppContext';
import { subscribeWorkspaceDataChanged } from '../utils/workspaceDataEvents';

export default function useWorkspaceRefreshOnEvent({
  orgId = null, topics = [], isActive = true, isBlocked = false,
  onRefresh, shouldHandle, onBlocked,
}) {
  const { pathname } = useLocation();
  const { markTabChanged, clearTabChanged } = useAppActions();
  const tabPath = useRef(pathname).current;
  const visible = pathname === tabPath && isActive;
  const previousVisible = useRef(visible);
  const current = useRef(null);
  current.current = { visible, isBlocked, onRefresh, shouldHandle, onBlocked };
  const pump = useRef(null);
  const retry = useRef(null);
  const topicKey = [...new Set(Array.isArray(topics) ? topics : [topics])].filter(Boolean).sort().join('|');

  useEffect(() => {
    if (!(Number(orgId) > 0) || !topicKey) return undefined;
    const accepted = new Set(topicKey.split('|'));
    const source = Symbol(tabPath);
    let disposed = false;
    let pending = null;
    let running = false;
    let warned = false;
    let failed = false;

    const refresh = async () => {
      if (disposed || running || failed) return false;
      if (!pending) return null;
      const state = current.current;
      if (!state.visible || document.visibilityState === 'hidden') return false;
      if (state.isBlocked) {
        if (!warned && state.onBlocked) {
          warned = true;
          state.onBlocked(pending);
        }
        return false;
      }
      if (!state.onRefresh) return false;
      const event = pending;
      pending = null;
      warned = false;
      running = true;
      try {
        const result = await state.onRefresh();
        // Callers displaying their own error may return false instead of throwing.
        if (result === false) throw new Error('WORKSPACE_REFRESH_FAILED');
      } catch {
        failed = true;
        if (!disposed) {
          pending ||= event;
          markTabChanged(tabPath, source);
        }
        return false;
      } finally {
        running = false;
      }
      if (disposed) return false;
      if (pending) return refresh();
      else clearTabChanged(tabPath, source);
      return true;
    };

    const unsubscribe = subscribeWorkspaceDataChanged(event => {
      if (!event || (event.orgId != null && Number(event.orgId) !== Number(orgId))) return;
      if (!event.topics?.some(topic => accepted.has(topic))) return;
      if (current.current.shouldHandle && !current.current.shouldHandle(event)) return;
      pending = event;
      failed = false;
      markTabChanged(tabPath, source);
      void refresh();
    });
    pump.current = refresh;
    const retryRefresh = () => { failed = false; return refresh(); };
    retry.current = retryRefresh;
    document.addEventListener('visibilitychange', retryRefresh);
    window.addEventListener('focus', retryRefresh);
    return () => {
      disposed = true;
      pump.current = null;
      retry.current = null;
      unsubscribe();
      clearTabChanged(tabPath, source);
      document.removeEventListener('visibilitychange', retryRefresh);
      window.removeEventListener('focus', retryRefresh);
    };
  }, [orgId, topicKey, tabPath, markTabChanged, clearTabChanged]);

  useEffect(() => {
    const returned = visible && !previousVisible.current;
    previousVisible.current = visible;
    void (returned ? retry.current?.() : pump.current?.());
  }, [visible, isBlocked]);
  return useCallback(() => retry.current?.(), []);
}
