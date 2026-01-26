import React, { useState } from 'react';
import { Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import StyleBasicInfo from './StyleBasicInfo';
import StyleBom from './StyleBom';
import StyleProcess from './StyleProcess';

// Mock data fetching function based on styleId
const fetchStyleData = (styleId) => {
  if (styleId === 'new') {
    return {
      styleCode: '',
      styleName: '새 스타일',
      designer: '',
      collection: '',
      season: '',
      bomNotes: '',
      processName: '',
      processDescription: '',
    };
  }
  // In a real application, you would fetch this data from an API
  console.log(`Fetching data for style ID: ${styleId}`);
  return {
    styleCode: styleId,
    styleName: `디자인 ${styleId}`,
    designer: '김디자이너',
    collection: '2026 F/W',
    season: '가을',
    bomNotes: '',
    processName: '',
    processDescription: '',
  };
};

const StyleDetail = () => {
  const { styleId } = useParams(); // Get styleId from URL
  const [currentTab, setCurrentTab] = useState('basicInfo');
  
  // Initialize form data based on the fetched style data
  const [styleFormData, setStyleFormData] = useState(() => fetchStyleData(styleId));

  const handleChange = (event, newValue) => {
    if (newValue !== null) {
      setCurrentTab(newValue);
    }
  };

  const handleStyleInputChange = (e) => {
    const { name, value } = e.target;
    setStyleFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <AppPageContainer>
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

export default StyleDetail;