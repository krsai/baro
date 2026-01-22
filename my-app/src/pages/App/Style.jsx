import React, { useState } from 'react';
import {  Typography, Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import StyleBasicInfo from './style/StyleBasicInfo'; // Using style-specific BasicInfo
import StyleBom from './style/StyleBom'; // Using style-specific Bom
import StyleProcess from './style/StyleProcess'; // New Process Info component

const initialStyleFormData = {
  styleCode: '',
  styleName: '',
  designer: '',
  collection: '',
  season: '',
  bomNotes: '', // Placeholder for BOM notes
  processName: '',
  processDescription: '',
};

const Style = () => {
  const [currentTab, setCurrentTab] = useState('basicInfo');
  const [styleFormData, setStyleFormData] = useState(initialStyleFormData);

  const handleChange = (event, newValue) => {
    // Only update if newValue is not null (prevents unselecting all)
    if (newValue !== null) {
      setCurrentTab(newValue);
    }
  };

  const handleStyleInputChange = (e) => {
    const { name, value } = e.target;
    setStyleFormData((prev) => ({ ...prev, [name]: value }));
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
      <div className="toggle-button-group-wrapper">
        <ToggleButtonGroup
          value={currentTab}
          exclusive
          onChange={handleChange}
          aria-label="style management toggle"
        >
          <ToggleButton value="basicInfo" aria-label="basic info" className="toggle-button">
            기본 정보
          </ToggleButton>
          <ToggleButton value="processInfo" aria-label="process info" className="toggle-button">
            공정 정보
          </ToggleButton>
          <ToggleButton value="bom" aria-label="bom" className="toggle-button">
            BOM
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      {currentTab === 'basicInfo' && <StyleBasicInfo formData={styleFormData} handleInputChange={handleStyleInputChange} />}
      {currentTab === 'processInfo' && <StyleProcess formData={styleFormData} handleInputChange={handleStyleInputChange} />}
      {currentTab === 'bom' && <StyleBom formData={styleFormData} handleInputChange={handleStyleInputChange} />}
    </AppPageContainer>
  );
};

export default Style;
