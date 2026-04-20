import React from 'react';
import { Box, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useLanguage } from '../../../context/LanguageContext';

const MONTHLY_LOG_LABELS = {
  ko: '\uC6D4\uAC04 \uAE30\uB85D',
  en: 'Monthly Logs',
  vi: 'Ghi chep thang',
};

const EMPTY_STATE_COPY = {
  ko: '\uC6D4\uAC04 \uAE30\uB85D \uD398\uC774\uC9C0 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4.',
  en: 'The monthly logs page is being prepared.',
  vi: 'Trang ghi chep thang dang duoc chuan bi.',
};

const resolveText = (bundle, languageCode) => bundle?.[languageCode] || bundle?.ko || '';

const WorkMonthlyBoard = () => {
  const { languageCode } = useLanguage();

  return (
    <AppPageContainer title={resolveText(MONTHLY_LOG_LABELS, languageCode)}>
      <Box
        sx={{
          minHeight: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 2,
          border: '1px dashed #c7d2de',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography color="text.secondary">
          {resolveText(EMPTY_STATE_COPY, languageCode)}
        </Typography>
      </Box>
    </AppPageContainer>
  );
};

export default WorkMonthlyBoard;
