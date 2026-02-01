import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import AttrColor from './attribute/AttrColor';
import AttrSize from './attribute/AttrSize';
import AttrGender from './attribute/AttrGender';
import AttrProcess from './attribute/AttrProcess';

const Attribute = () => {
  const [currentView, setCurrentView] = useState('color');

  const handleChange = (event, newView) => {
    if (newView !== null) {
      setCurrentView(newView);
    }
  };

  return (
    <AppPageContainer>
      <Box>
        <Box sx={{ mb: 3 }}>
          <ToggleButtonGroup
            value={currentView}
            exclusive
            onChange={handleChange}
            aria-label="Attribute type"
          >
            <ToggleButton value="color">
              색상
            </ToggleButton>
            <ToggleButton value="size">
              사이즈
            </ToggleButton>
            <ToggleButton value="gender">
              성별
            </ToggleButton>
            <ToggleButton value="process">
              공정
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        
        {currentView === 'color' && <AttrColor />}
        {currentView === 'size' && <AttrSize />}
        {currentView === 'gender' && <AttrGender />}
        {currentView === 'process' && <AttrProcess />}
      </Box>
    </AppPageContainer>
  );
};

export default Attribute;
