import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { RequestScopeBoundary } from '../../../context/RequestScopeContext';
import OrganizationDetail from './OrganizationDetail';
import FactoryBoard from './FactoryBoard';

const OrganizationBoard = () => {
  const [currentTab, setCurrentTab] = useState('business');
  const [loadedTabs, setLoadedTabs] = useState({
    business: true,
    factory: false,
  });

  const handleChange = (event, newValue) => {
    if (newValue !== null) {
      setCurrentTab(newValue);
      setLoadedTabs((prev) =>
        prev[newValue]
          ? prev
          : {
              ...prev,
              [newValue]: true,
            }
      );
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
      {loadedTabs.business && (
        <RequestScopeBoundary scopeId="business" active={currentTab === 'business'}>
          <Box sx={{ display: currentTab === 'business' ? 'block' : 'none' }}>
            <OrganizationDetail />
          </Box>
        </RequestScopeBoundary>
      )}
      {loadedTabs.factory && (
        <RequestScopeBoundary scopeId="factory" active={currentTab === 'factory'}>
          <Box sx={{ display: currentTab === 'factory' ? 'block' : 'none' }}>
            <FactoryBoard />
          </Box>
        </RequestScopeBoundary>
      )}
    </AppPageContainer>
  );
};

export default OrganizationBoard;
