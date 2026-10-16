import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { buildQueryString, requestJSON } from '../utils/apiClient';
import { subscribeWorkspaceDataChanged } from '../utils/workspaceDataEvents';

const Context = createContext({ startDate: null, factories: [], loading: false });
export const useManagementPeriod = () => useContext(Context);
export function ManagementPeriodProvider({ children }) {
  const { activeOrgId } = useAuth();
  const [state,setState] = useState({ orgId: null, startDate: null, factories: [], loading: true });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!activeOrgId) { if (alive) setState({ orgId: activeOrgId, startDate: null, factories: [], loading: false }); return; }
      try {
        const result = await requestJSON(`/management-period${buildQueryString({ orgId: activeOrgId })}`, { skipGlobalLoading: true, skipCache: true });
        if (alive) setState({ ...result, orgId: activeOrgId, loading: false });
      } catch { if (alive) setState({ orgId: activeOrgId, startDate: null, factories: [], loading: false, error: true }); }
    };
    load();
    window.addEventListener('focus',load);
    const unsubscribe = subscribeWorkspaceDataChanged(detail => {
      if (Number(detail.orgId) === Number(activeOrgId) && detail.topics?.includes('production-allowance-settings')) load();
    });
    return () => { alive = false; unsubscribe(); window.removeEventListener('focus',load); };
  }, [activeOrgId]);
  return <Context.Provider value={state.orgId === activeOrgId ? state : { startDate: null, factories: [], loading: true }}>{children}</Context.Provider>;
}
