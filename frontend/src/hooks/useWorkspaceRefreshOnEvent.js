import { useEffect, useRef } from 'react';
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
  const current = useRef(null);
  current.current = { visible, isBlocked, onRefresh, shouldHandle, onBlocked };
  const pump = useRef(null);
  const topicKey = [...new Set(Array.isArray(topics) ? topics : [topics])].filter(Boolean).sort().join('|');

  useEffect(() => {
    if (!(Number(orgId) > 0) || !topicKey) return undefined;
    const accepted = new Set(topicKey.split('|'));
    let disposed = false;
    let pending = null;
    let running = false;
    let warned = false;

    const refresh = async () => {
      if (disposed || !pending || running) return;
      const state = current.current;
      if (!state.visible || document.visibilityState === 'hidden') return;
      if (state.isBlocked) {
        if (!warned && state.onBlocked) {
          warned = true;
          state.onBlocked(pending);
        }
        return;
      }
      if (!state.onRefresh) return;
      const event = pending;
      pending = null;
      warned = false;
      running = true;
      try {
        await state.onRefresh();
      } catch {
        if (!disposed) pending ||= event;
        return;
      } finally {
        running = false;
      }
      if (disposed) return;
      if (pending) void refresh();
      else clearTabChanged(tabPath);
    };

    const unsubscribe = subscribeWorkspaceDataChanged(event => {
      if (!event || (event.orgId != null && Number(event.orgId) !== Number(orgId))) return;
      if (!event.topics?.some(topic => accepted.has(topic))) return;
      if (current.current.shouldHandle && !current.current.shouldHandle(event)) return;
      pending = event;
      if (!current.current.visible || current.current.isBlocked || document.visibilityState === 'hidden') {
        markTabChanged(tabPath);
      }
      void refresh();
    });
    pump.current = refresh;
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      pump.current = null;
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [orgId, topicKey, tabPath, markTabChanged, clearTabChanged]);

  useEffect(() => { void pump.current?.(); }, [visible, isBlocked]);
}
