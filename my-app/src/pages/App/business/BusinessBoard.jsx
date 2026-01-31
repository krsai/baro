import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import BusinessDetail from './BusinessDetail';
import FactoryList from './FactoryList';

const BusinessBoard = () => {
  const [currentTab, setCurrentTab] = useState('business');

  const handleChange = (event, newValue) => {
    if (newValue !== null) {
      setCurrentTab(newValue);
    }
  };

  return (
    <AppPageContainer>
      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={currentTab}
          exclusive
          onChange={handleChange}
          aria-label="business management toggle"
        >
          <ToggleButton
            value="business"
          >
            법인 정보
          </ToggleButton>
          <ToggleButton
            value="factory"
          >
            공장 정보
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {currentTab === 'business' && <BusinessDetail />}
      {currentTab === 'factory' && <FactoryList />}
    </AppPageContainer>
  );
};

export default BusinessBoard;