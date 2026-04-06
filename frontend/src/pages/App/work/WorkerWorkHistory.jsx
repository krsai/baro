import React from 'react';
import { Alert, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { getUiMessage } from '../../../constants/uiMessages';
import { useLanguage } from '../../../context/LanguageContext';

const WorkerWorkHistory = () => {
  const { languageCode } = useLanguage();

  return (
    <AppPageContainer title={getUiMessage('menu.workerWorkHistory', '작업자별 기록', languageCode)}>
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
        <Stack spacing={1}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            작업자별 작업 기록 화면 준비 중
          </Typography>
          <Alert severity="info">
            화면 구성 확정 후 이 페이지에서 목록/필터/상세를 구현하면 됩니다.
          </Alert>
        </Stack>
      </Paper>
    </AppPageContainer>
  );
};

export default WorkerWorkHistory;
