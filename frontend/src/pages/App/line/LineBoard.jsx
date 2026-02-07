import React from 'react';
import { Paper, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';

const LineBoard = () => {
  return (
    <AppPageContainer>
      <Typography variant="h4" gutterBottom>
        라인 관리
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography>라인 관리 페이지입니다.</Typography>
      </Paper>
    </AppPageContainer>
  );
};

export default LineBoard;
