import React from 'react';
import { Paper, Typography } from '@mui/material';

const WorkList = () => {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography>
        작업 기록 목록이 여기에 표시됩니다.
      </Typography>
    </Paper>
  );
};

export default WorkList;