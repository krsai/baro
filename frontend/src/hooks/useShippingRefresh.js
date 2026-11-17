import {useRequestScopeContext} from '../context/RequestScopeContext';
import useWorkspaceRefreshOnEvent from './useWorkspaceRefreshOnEvent';
import {WORKSPACE_DATA_TOPICS} from '../utils/workspaceDataEvents';

// Local saves and authenticated server events invalidate the relevant tabs.
// Never reload a form while its draft or save is in progress.
export default function useShippingRefresh({orgId, blocked = false, onRefresh}) {
  const {active} = useRequestScopeContext();
  useWorkspaceRefreshOnEvent({orgId, topics: [WORKSPACE_DATA_TOPICS.SHIPPING, WORKSPACE_DATA_TOPICS.CUSTOMERS, 'business-partners'], isActive: active, isBlocked: blocked, onRefresh});
}
