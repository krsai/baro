import React from 'react';
import { Container, Typography } from '@mui/material';

const WorkHistory = () => {
  return (
    <Box component="main" sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        작업 기록
      </Typography>
      <Typography>
        작업 기록 페이지입니다.
      </Typography>
    </Box>
  );
};

export default WorkHistory;
