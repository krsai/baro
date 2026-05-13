import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import WorkList from './work/WorkList';
import WorkMonthlyBoard from './work/WorkMonthlyBoard';

const WORK_VIEW_MODES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
};

const resolveViewMode = (search = '') => {
  const params = new URLSearchParams(search);
  return params.get('view') === WORK_VIEW_MODES.MONTHLY
    ? WORK_VIEW_MODES.MONTHLY
    : WORK_VIEW_MODES.DAILY;
};

const Work = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode = useMemo(() => resolveViewMode(location.search), [location.search]);

  const handleViewModeChange = useCallback(
    (nextMode) => {
      if (nextMode !== WORK_VIEW_MODES.DAILY && nextMode !== WORK_VIEW_MODES.MONTHLY) return;
      const nextPath = `/work-history${
        nextMode === WORK_VIEW_MODES.MONTHLY ? '?view=monthly' : ''
      }`;
      const currentPath = `${location.pathname}${location.search}`;
      if (nextPath === currentPath) return;
      navigate(nextPath, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  if (viewMode === WORK_VIEW_MODES.MONTHLY) {
    return (
      <WorkMonthlyBoard
        viewMode={WORK_VIEW_MODES.MONTHLY}
        onViewModeChange={handleViewModeChange}
      />
    );
  }

  return (
    <WorkList
      viewMode={WORK_VIEW_MODES.DAILY}
      onViewModeChange={handleViewModeChange}
    />
  );
};

export default Work;
