import React from 'react';
import { Paper, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';

const LineDetail = () => {
  return (
    <AppPageContainer>
      <Typography variant="h4" gutterBottom>
        라인 상세
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography>라인 상세 정보 페이지입니다.</Typography>
      </Paper>
    </AppPageContainer>
  );
};

export default LineDetail;
