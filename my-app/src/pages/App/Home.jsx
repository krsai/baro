import React from 'react';
import { Typography } from '@mui/material'; // Only Typography is needed if no other Box is used in content
import AppPageContainer from '../../components/AppPageContainer';

const Home = () => {
  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            대시보드
          </Typography>
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            환영합니다!
          </Typography>
        </>
      }
    >
      {/* Actual content goes here if any */}
    </AppPageContainer>
  );
};

export default Home;