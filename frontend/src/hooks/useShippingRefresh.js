import {useEffect, useRef} from 'react';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import useWorkspaceRefreshOnEvent from './useWorkspaceRefreshOnEvent';
import {WORKSPACE_DATA_TOPICS} from '../utils/workspaceDataEvents';

// Same-browser mutations refresh cached tabs; focus/polling sees other users.
// Never reload a form while its draft or save is in progress.
export default function useShippingRefresh({orgId, blocked = false, onRefresh}) {
  const {active} = useRequestScopeContext();
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useWorkspaceRefreshOnEvent({orgId, topics: [WORKSPACE_DATA_TOPICS.SHIPPING], isActive: active, isBlocked: blocked, onRefresh});
  useEffect(() => {
    if (!active || blocked) return undefined;
    const run = () => { if (document.visibilityState !== 'hidden') refresh.current(); };
    window.addEventListener('focus', run);
    const timer = window.setInterval(run, 30000);
    return () => { window.removeEventListener('focus', run); window.clearInterval(timer); };
  }, [active, blocked, orgId]);
}
