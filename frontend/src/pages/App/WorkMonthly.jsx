import React from 'react';
import { Navigate } from 'react-router-dom';

const WorkMonthly = () => {
  return <Navigate to="/work-history?view=monthly" replace />;
};

export default WorkMonthly;
