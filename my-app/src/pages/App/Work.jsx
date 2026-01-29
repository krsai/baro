import React from 'react';
import { Box, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import WorkList from './work/WorkList';

const Work = () => {
  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Typography component="h1" variant="h4">
            작업 기록
          </Typography>
          {/* 필요 시 여기에 액션 버튼을 추가할 수 있습니다. */}
        </Box>
      }
    >
      <WorkList />
    </AppPageContainer>
  );
};

export default Work;