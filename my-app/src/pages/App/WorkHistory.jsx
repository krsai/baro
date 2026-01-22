import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';

const WorkHistory = () => {
  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Typography component="h1" variant="h4">
            작업 기록
          </Typography>
          {/* Add any action buttons here if needed */}
        </Box>
      }
    >
      <Paper sx={{ p: 3 }}>
        <Typography>
          작업 기록 페이지입니다.
        </Typography>
        {/* Actual content for work history will go here */}
      </Paper>
    </AppPageContainer>
  );
};

export default WorkHistory;
