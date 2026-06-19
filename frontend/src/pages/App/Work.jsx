import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import WorkList from './work/WorkList';

const Work = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'monthly') {
    return <Navigate to="/production-analysis" replace />;
  }

  return <WorkList />;
};

export default Work;
