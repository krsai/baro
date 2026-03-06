import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { activateRequestScope, deactivateRequestScope } from '../utils/apiClient';

const DEFAULT_GROUP_ID = 'workspace';

const RequestScopeContext = createContext({
  active: true,
  depth: 0,
  groupId: DEFAULT_GROUP_ID,
  scopeId: '',
});

let requestScopeBoundarySequence = 0;

const normalizeScopeSegment = (value) =>
  typeof value === 'string' ? value.trim() : '';

export const RequestScopeBoundary = ({
  active = true,
  children,
  groupId,
  scopeId = '',
}) => {
  const parentScope = useContext(RequestScopeContext);
  const boundaryTokenRef = useRef(null);

  if (!boundaryTokenRef.current) {
    requestScopeBoundarySequence += 1;
    boundaryTokenRef.current = `request-scope-boundary-${requestScopeBoundarySequence}`;
  }

  const normalizedScopeId = normalizeScopeSegment(scopeId);
  const resolvedGroupId = normalizeScopeSegment(groupId) || parentScope.groupId || DEFAULT_GROUP_ID;
  const resolvedActive = parentScope.active && active;
  const combinedScopeId = useMemo(() => {
    if (!normalizedScopeId) return parentScope.scopeId || '';
    return [parentScope.scopeId, normalizedScopeId].filter(Boolean).join('::');
  }, [normalizedScopeId, parentScope.scopeId]);
  const depth = normalizedScopeId ? parentScope.depth + 1 : parentScope.depth;

  useEffect(() => {
    if (!resolvedActive || !combinedScopeId) {
      deactivateRequestScope(resolvedGroupId, boundaryTokenRef.current);
      return () => {
        deactivateRequestScope(resolvedGroupId, boundaryTokenRef.current);
      };
    }

    activateRequestScope(
      resolvedGroupId,
      boundaryTokenRef.current,
      combinedScopeId,
      depth
    );

    return () => {
      deactivateRequestScope(resolvedGroupId, boundaryTokenRef.current);
    };
  }, [combinedScopeId, depth, resolvedActive, resolvedGroupId]);

  const contextValue = useMemo(
    () => ({
      active: resolvedActive,
      depth,
      groupId: resolvedGroupId,
      scopeId: combinedScopeId,
    }),
    [combinedScopeId, depth, resolvedActive, resolvedGroupId]
  );

  return (
    <RequestScopeContext.Provider value={contextValue}>
      {children}
    </RequestScopeContext.Provider>
  );
};

export const useRequestScopeContext = () => useContext(RequestScopeContext);

