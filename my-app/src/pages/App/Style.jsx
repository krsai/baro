import React, { useState } from 'react';
import { Typography, Box, Tabs, Tab } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import BasicInfo from './customer/BasicInfo';
import Bom from './customer/Bom';

const Style = () => {
  const [currentTab, setCurrentTab] = useState('basicInfo');

  const handleChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  return (
    <AppPageContainer
      header={
        <>
          <Typography variant="h4" component="h1" gutterBottom>
            스타일 관리
          </Typography>

        </>
      }
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={handleChange} aria-label="style management tabs">
          <Tab label="기본 정보" value="basicInfo" />
          <Tab label="BOM" value="bom" />
        </Tabs>
      </Box>

      {currentTab === 'basicInfo' && <BasicInfo />}
      {currentTab === 'bom' && <Bom />}

    </AppPageContainer>
  );
};

export default Style;
