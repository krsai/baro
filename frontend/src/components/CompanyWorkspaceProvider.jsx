import React from 'react';
import {useAuth} from '../context/AuthContext';
import {AppProvider} from '../context/AppContext';

// Company and identity changes discard tab/form state. Refreshing a token in the
// same company keeps the provider mounted and preserves the user's work.
export default function CompanyWorkspaceProvider({children}){
  const {user,activeOrgId,activeProfile}=useAuth();
  const scope=[user?.id||user?.email||'anonymous',activeProfile?.entryType||'selection',activeOrgId||'none'].join(':');
  return <AppProvider key={scope}>{children}</AppProvider>;
}
