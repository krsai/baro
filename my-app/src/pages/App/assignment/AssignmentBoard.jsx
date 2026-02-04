import React from 'react';
import { Box, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';

function AssignmentBoard() {
  return (
    <AppPageContainer title="작업 배정">
      <Typography variant="h6">작업 배정 보드</Typography>
      <Box>
        {/* 작업 배정 목록, 필터, 검색 기능 등이 여기에 위치합니다. */}
      </Box>
    </AppPageContainer>
  );
}

export default AssignmentBoard;
