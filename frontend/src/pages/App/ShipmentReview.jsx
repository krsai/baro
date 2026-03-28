import React from 'react';
import { Alert, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';

const ShipmentReview = () => {
  return (
    <AppPageContainer
      header={
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            출고 검토
          </Typography>
          <Typography variant="body2" color="text.secondary">
            작업 기록 수량과 실제 생산 수량을 출고 전에 비교 검토하는 메뉴입니다.
          </Typography>
        </Stack>
      }
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            메뉴 자리만 먼저 만들었습니다. 작업 기록 누계와 생산/출고 수량 비교 로직은 다음
            작업에서 연결하면 됩니다.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            예정 기능:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            1. 주문/스타일별 작업 기록 누계와 생산 수량 비교
          </Typography>
          <Typography variant="body2" color="text.secondary">
            2. 공정 누락, 과다 생산, 허용 오차 초과 경고
          </Typography>
          <Typography variant="body2" color="text.secondary">
            3. 출고 승인 전 검토 메모와 확인 상태 표시
          </Typography>
        </Stack>
      </Paper>
    </AppPageContainer>
  );
};

export default ShipmentReview;
