import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import { getUiMessage } from '../../../constants/uiMessages';
import { useLanguage } from '../../../context/LanguageContext';
import { RequestScopeBoundary } from '../../../context/RequestScopeContext';
import OrganizationDetail from './OrganizationDetail';
import FactoryBoard from './FactoryBoard';

const OrganizationBoard = () => {
  const { languageCode } = useLanguage();
  const [currentTab, setCurrentTab] = useState('business');
  const [loadedTabs, setLoadedTabs] = useState({
    business: true,
    factory: false,
  });

  const text = {
    title: getUiMessage('organizationBoard.title', 'Organization', languageCode),
    tabBusiness: getUiMessage('organizationBoard.tabBusiness', 'Business Info', languageCode),
    tabFactory: getUiMessage('organizationBoard.tabFactory', 'Factory Info', languageCode),
    toggleAriaLabel: getUiMessage(
      'organizationBoard.toggleAriaLabel',
      'organization management toggle',
      languageCode
    ),
  };

  const handleChange = (_event, newValue) => {
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
    <AppPageContainer
      title={text.title}
      toolbar={(
        <PageToolbar
          left={(
            <ToggleButtonGroup
              value={currentTab}
              exclusive
              onChange={handleChange}
              aria-label={text.toggleAriaLabel}
            >
              <ToggleButton value="business">{text.tabBusiness}</ToggleButton>
              <ToggleButton value="factory">{text.tabFactory}</ToggleButton>
            </ToggleButtonGroup>
          )}
        />
      )}
    >
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
