import React from 'react';
import { Typography } from '@mui/material'; // Only Typography is needed
import AppPageContainer from '../../components/AppPageContainer';

const BasicInfo = () => {
  return (
    <AppPageContainer
      title="기본 정보"
      description="기본 정보 페이지입니다."
    >
      {/* Actual content goes here if any */}
      {/* For now, it's just the description */}
    </AppPageContainer>
  );
};

export default BasicInfo;
