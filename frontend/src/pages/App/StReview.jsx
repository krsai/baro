import React from 'react';
import { Alert, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';

const StReview = () => {
  return (
    <AppPageContainer
      header={
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            표준 공임 검토
          </Typography>
          <Typography variant="body2" color="text.secondary">
            표준 공임 기준점 간 충돌과 검토 경고를 모아보는 메뉴입니다.
          </Typography>
        </Stack>
      }
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            메뉴 자리만 먼저 만들었습니다. 표준 공임 검토 로직과 경고 목록은 다음 작업에서
            연결하면 됩니다.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            예정 기능:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            1. 스타일+공정별 ST 기준점 비교
          </Typography>
          <Typography variant="body2" color="text.secondary">
            2. 수량 증가/감소 대비 ST 추세 이상 경고
          </Typography>
          <Typography variant="body2" color="text.secondary">
            3. 운영팀 수동 검토 대상 목록
          </Typography>
        </Stack>
      </Paper>
    </AppPageContainer>
  );
};

export default StReview;
