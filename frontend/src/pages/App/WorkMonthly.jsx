import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

const WorkMonthly = () => {
  const { monthKey, factoryId, workerId } = useParams();
  if (monthKey && factoryId && workerId) {
    return <Navigate to={`/production-analysis/${monthKey}/${factoryId}/${workerId}`} replace />;
  }

  return <Navigate to="/production-analysis" replace />;
};

export default WorkMonthly;
