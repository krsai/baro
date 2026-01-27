import React, { useState, useEffect } from 'react';
import {
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import StyleBasicInfo from './StyleBasicInfo';
import StyleBom from './StyleBom';
import StyleProcess from './StyleProcess';

// Mock data for the list of styles
const mockStyles = [
  { id: 'S-001', name: '클래식 데님 자켓', customer: 'A고객사', registrationDate: '2026-01-15', designer: '김디자이너', collection: '2026 F/W', season: '가을' },
  { id: 'S-002', name: '하이웨이스트 와이드 팬츠', customer: 'B고객사', registrationDate: '2026-01-16', designer: '김디자이너', collection: '2026 F/W', season: '가을' },
  { id: 'S-003', name: '오버핏 린넨 셔츠', customer: 'A고객사', registrationDate: '2026-01-17', designer: '김디자이너', collection: '2026 F/W', season: '가을' },
  { id: 'S-004', name: '플리츠 미디 스커트', customer: 'C고객사', registrationDate: '2026-01-18', designer: '김디자이너', collection: '2026 F/W', season: '가을' },
];

// Mock data fetching function based on styleId
const fetchStyleData = (styleId) => {
  if (styleId === 'new') {
    return {
      styleCode: '',
      name: '새 스타일',
      customer: '',
      registrationDate: new Date().toISOString().slice(0, 10),
      designer: '',
      collection: '',
      season: '',
      bomNotes: '',
      processName: '',
      processDescription: '',
    };
  }

  const style = mockStyles.find(s => s.id === styleId);

  // In a real application, you would fetch this data from an API
  console.log(`Fetching data for style ID: ${styleId}`);
  return {
    styleCode: styleId,
    name: style ? style.name : `디자인 ${styleId}`,
    designer: '김디자이너',
    collection: '2026 F/W',
    season: '가을',
    processes: [ // Add mock processes for existing styles
      { id: 'P-001', name: '주머니 달기', smv: 10, etd: 12 },
      { id: 'P-002', name: '소매 부착', smv: 15, etd: 16 },
      { id: 'P-003', name: '단추 구멍', smv: 8, etd: 9 },
    ],
    bom: [], // Initially empty
    ...style, // 기본 데이터 덮어쓰기
  };
};

const StyleDetail = () => {
  const { styleId } = useParams();
  const [currentTab, setCurrentTab] = useState('basicInfo');

  // State for the original data to compare against
  const [originalData, setOriginalData] = useState(() => fetchStyleData(styleId));
  // State for the form data that the user edits
  const [styleFormData, setStyleFormData] = useState(originalData);
  // State to track if the form has been changed
  const [isDirty, setIsDirty] = useState(false);
  // State for the confirmation dialog
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  // State to hold the detected changes
  const [changes, setChanges] = useState({});

  const isNew = styleId === 'new';

  // Effect to check if the form is dirty
  useEffect(() => {
    // Only run this check if it's not a new style
    if (!isNew) {
      const hasChanged = JSON.stringify(originalData) !== JSON.stringify(styleFormData);
      setIsDirty(hasChanged);
    }
  }, [styleFormData, originalData, isNew]);

  const handleChange = (event, newValue) => {
    if (newValue !== null) {
      setCurrentTab(newValue);
    }
  };

  const handleStyleInputChange = (e) => {
    const { name, value } = e.target;
    setStyleFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProcessesChange = (newProcesses) => {
    setStyleFormData((prev) => ({ ...prev, processes: newProcesses }));
  };

  // An object to map field names to Korean labels for display
  const fieldLabels = {
    name: '스타일명',
    customer: '고객사',
    designer: '디자이너',
    collection: '컬렉션',
    season: '시즌',
    processes: '공정 목록',
    bom: 'BOM',
  };

  const handleSave = () => {
    if (isNew) {
      // For new styles, save directly without confirmation
      console.log('Creating new style:', styleFormData);
      alert('새 스타일이 생성되었습니다 (콘솔 확인)');
      // In a real app, you might navigate or update the state
    } else {
      // For existing styles, find changes and open confirmation dialog
      const detectedChanges = {};
      // This is a simple comparison. For arrays, it will show that the array
      // itself has changed, but not the specifics of what changed inside.
      // A more complex diffing function would be needed for a detailed view.
      Object.keys(styleFormData).forEach(key => {
        if (JSON.stringify(originalData[key]) !== JSON.stringify(styleFormData[key])) {
          detectedChanges[key] = {
            from: Array.isArray(originalData[key]) ? `${originalData[key].length}개 항목` : originalData[key],
            to: Array.isArray(styleFormData[key]) ? `${styleFormData[key].length}개 항목` : styleFormData[key],
          };
        }
      });
      setChanges(detectedChanges);
      setConfirmOpen(true);
    }
  };

  const handleCloseConfirm = () => {
    setConfirmOpen(false);
  };

  const handleConfirmSave = () => {
    console.log('Updating style with the following changes:', changes);
    alert('스타일이 업데이트되었습니다 (콘솔 확인)');
    
    // After a successful save, update the original data to the new state
    setOriginalData(styleFormData);
    // and reset the dirty flag
    setIsDirty(false);
    // Close the dialog
    handleCloseConfirm();
  };

  const handleRevert = () => {
    setStyleFormData(originalData);
  };

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={currentTab}
          exclusive
          onChange={handleChange}
          aria-label="style management toggle"
        >
          <ToggleButton
            value="basicInfo"
            aria-label="basic info"
            sx={{
              width: 110,
              textTransform: 'none',
              fontWeight: '600',
              '&.Mui-selected': {
                backgroundColor: 'primary.light',
                color: 'primary.contrastText',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'primary.main',
              },
            }}
          >
            기본 정보
          </ToggleButton>
          <ToggleButton
            value="processInfo"
            aria-label="process info"
            sx={{
              width: 110,
              textTransform: 'none',
              fontWeight: '600',
              '&.Mui-selected': {
                backgroundColor: 'primary.light',
                color: 'primary.contrastText',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'primary.main',
              },
            }}
          >
            공정 정보
          </ToggleButton>
          <ToggleButton
            value="bom"
            aria-label="bom"
            sx={{
              width: 110,
              textTransform: 'none',
              fontWeight: '600',
              '&.Mui-selected': {
                backgroundColor: 'primary.light',
                color: 'primary.contrastText',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'primary.main',
              },
            }}
          >
            BOM
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleRevert}
            disabled={isNew || !isDirty}
          >
            되돌리기
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={!isNew && !isDirty}
          >
            저장
          </Button>
        </Box>
      </Box>

      {currentTab === 'basicInfo' && <StyleBasicInfo formData={styleFormData} handleInputChange={handleStyleInputChange} />}
      {currentTab === 'processInfo' && <StyleProcess processes={styleFormData.processes} onProcessesChange={handleProcessesChange} />}
      {currentTab === 'bom' && <StyleBom formData={styleFormData} handleInputChange={handleStyleInputChange} />}

      <Dialog open={isConfirmOpen} onClose={handleCloseConfirm}>
        <DialogTitle>변경 내용 확인</DialogTitle>
        <DialogContent>
          <DialogContentText>
            아래 내용으로 스타일 정보를 저장하시겠습니까?
          </DialogContentText>
          <Box sx={{ mt: 2, p: 2, border: '1px solid #ddd', borderRadius: '4px' }}>
            {Object.keys(changes).length > 0 ? (
              Object.entries(changes).map(([key, value]) => (
                <Typography key={key} sx={{ mb: 1 }}>
                  <strong>{fieldLabels[key] || key}:</strong>{' '}
                  <span style={{ textDecoration: 'line-through', color: 'red' }}>'{value.from}'</span>
                  {' -> '}
                  <span style={{ color: 'green' }}>'{value.to}'</span>
                </Typography>
              ))
            ) : (
              <Typography>변경 사항이 없습니다.</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirm}>취소</Button>
          <Button onClick={handleConfirmSave} autoFocus>
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default StyleDetail;
    