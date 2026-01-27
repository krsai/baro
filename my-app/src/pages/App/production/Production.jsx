import React from 'react';
import { Typography } from '@mui/material'; // Only Typography is needed
import AppPageContainer from '../../../components/AppPageContainer';

const Production = () => {
  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            생산 관리
          </Typography>
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            생산 관리 페이지입니다.
          </Typography>
        </>
      }
    >
      {/* Actual content goes here if any */}
    </AppPageContainer>
  );
};

export default Production;
