import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import OrganizationDetail from './OrganizationDetail';
import FactoryBoard from './FactoryBoard';

const OrganizationBoard = () => {
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
      {currentTab === 'business' && <OrganizationDetail />}
      {currentTab === 'factory' && <FactoryBoard />}
    </AppPageContainer>
  );
};

export default OrganizationBoard;
