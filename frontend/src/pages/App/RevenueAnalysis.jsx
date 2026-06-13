import React from 'react';
import Box from '@mui/material/Box';
import AppPageContainer from '../../components/AppPageContainer';
import { getUiMessage } from '../../constants/uiMessages';
import { useLanguage } from '../../context/LanguageContext';

const RevenueAnalysis = () => {
  const { languageCode } = useLanguage();

  return (
    <AppPageContainer
      title={getUiMessage('menu.revenueAnalysis', '수익 분석', languageCode)}
    >
      <Box sx={{ minHeight: 320 }} />
    </AppPageContainer>
  );
};

export default RevenueAnalysis;
