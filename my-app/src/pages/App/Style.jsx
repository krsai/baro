import React from 'react';
import { Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';

const Style = () => {
  return (
    <AppPageContainer
      header={
        <>
          <Typography variant="h4" component="h1" gutterBottom>
            스타일 관리
          </Typography>
          <Typography>
            스타일 관리 페이지입니다.
          </Typography>
        </>
      }
    >
      {/* Actual content goes here if any */}
    </AppPageContainer>
  );
};

export default Style;
