import React, { useEffect, useState } from 'react';
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
import StyleInfo from './styleDetail/StyleInfo';
import StyleBom from './styleDetail/StyleBom';
import StyleProcess from './styleDetail/StyleProcess';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useApp } from '../../../context/AppContext';
import {
  createStyle as createStyleOnApi,
  fetchStyleById,
  updateStyle as updateStyleOnApi,
} from '../../../utils/styleApi';

const createEmptyStyle = () => ({
  id: '',
  styleCode: '',
  name: '',
  customer: '',
  registrationDate: '',
  designer: '',
  collection: '',
  season: '',
  imageUrls: [],
  processes: [],
  bom: [],
  bomNotes: '',
});

const createStyleId = () => `S-${Date.now().toString(36).slice(-6).toUpperCase()}`;

const buildPayload = (data) => {
  const today = new Date().toISOString().slice(0, 10);
  const trimmedName = (data.name || '').trim();
  const trimmedCode = (data.styleCode || '').trim();
  const fallbackCode = (data.id || '').trim();
  return {
    ...createEmptyStyle(),
    ...data,
    id: data.id,
    name: trimmedName,
    customer: (data.customer || '').trim(),
    styleCode: trimmedCode || fallbackCode,
    registrationDate: data.registrationDate || today,
  };
};

const StyleDetail = () => {
  const { styleId: styleIdParam } = useParams();
  const styleId = styleIdParam ?? 'new';
  const isNew = styleId === 'new';
  const [currentTab, setCurrentTab] = useState('basicInfo');
  const { showNotification, navigateToPath, closeTab } = useApp();

  const [originalData, setOriginalData] = useState(createEmptyStyle);
  const [styleFormData, setStyleFormData] = useState(createEmptyStyle);
  const [loadingStyle, setLoadingStyle] = useState(true);

  useEffect(() => {
    let active = true;

    const loadStyle = async () => {
      if (isNew) {
        if (active) {
          const empty = createEmptyStyle();
          setOriginalData(empty);
          setStyleFormData(empty);
          setLoadingStyle(false);
        }
        return;
      }

      setLoadingStyle(true);
      try {
        const style = await fetchStyleById(styleId);
        const normalized = {
          ...createEmptyStyle(),
          ...style,
          id: style.id || styleId,
        };
        if (!active) return;
        setOriginalData(normalized);
        setStyleFormData(normalized);
      } catch (error) {
        if (!active) return;
        const fallback = {
          ...createEmptyStyle(),
          id: styleId,
          styleCode: styleId,
        };
        setOriginalData(fallback);
        setStyleFormData(fallback);
        showNotification(error?.message || '스타일 정보를 불러오지 못했습니다.', 'error');
      } finally {
        if (active) {
          setLoadingStyle(false);
        }
      }
    };

    loadStyle();

    return () => {
      active = false;
    };
  }, [isNew, showNotification, styleId]);

  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [changes, setChanges] = useState({});

  const isDirty = !loadingStyle && JSON.stringify(originalData) !== JSON.stringify(styleFormData);
  useUnsavedChanges(isDirty);

  const handleChange = (_event, newValue) => {
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

  const fieldLabels = {
    name: '스타일명',
    customer: '고객사',
    designer: '디자이너',
    collection: '카테고리',
    season: '시즌',
    imageUrls: '스타일 사진',
    processes: '공정 목록',
    bom: 'BOM',
  };

  const handleSave = async () => {
    if (!styleFormData.name?.trim()) {
      showNotification('스타일명을 입력하세요.', 'error');
      return;
    }
    if (!styleFormData.customer?.trim()) {
      showNotification('고객사를 선택하세요.', 'error');
      return;
    }

    if (isNew) {
      const newId = styleFormData.id || createStyleId();
      const payload = buildPayload({ ...styleFormData, id: newId });
      try {
        const saved = await createStyleOnApi(payload);
        showNotification('신규 스타일이 생성되었습니다.', 'success');
        setOriginalData(saved);
        setStyleFormData(saved);
        navigateToPath('/style', { label: '스타일' });
        closeTab('/style/new');
      } catch (error) {
        showNotification(error?.message || '스타일을 저장하지 못했습니다.', 'error');
      }
      return;
    }

    const detectedChanges = {};
    Object.keys(styleFormData).forEach((key) => {
      if (JSON.stringify(originalData[key]) !== JSON.stringify(styleFormData[key])) {
        detectedChanges[key] = {
          from: Array.isArray(originalData[key]) ? `${originalData[key].length}개 항목` : originalData[key],
          to: Array.isArray(styleFormData[key]) ? `${styleFormData[key].length}개 항목` : styleFormData[key],
        };
      }
    });
    setChanges(detectedChanges);
    setConfirmOpen(true);
  };

  const handleCloseConfirm = () => {
    setConfirmOpen(false);
  };

  const handleConfirmSave = async () => {
    const payload = buildPayload({
      ...styleFormData,
      id: originalData.id || styleId,
    });

    try {
      const saved = await updateStyleOnApi(styleId, payload);
      showNotification('스타일이 업데이트되었습니다.', 'success');
      setOriginalData(saved);
      setStyleFormData(saved);
      setConfirmOpen(false);
    } catch (error) {
      showNotification(error?.message || '스타일을 저장하지 못했습니다.', 'error');
    }
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
          <ToggleButton value="basicInfo">기본 정보</ToggleButton>
          <ToggleButton value="processInfo">공정 정보</ToggleButton>
          <ToggleButton value="bom">BOM</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleRevert}
            disabled={loadingStyle || isNew || !isDirty}
          >
            되돌리기
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={loadingStyle || (!isNew && !isDirty)}
          >
            저장
          </Button>
        </Box>
      </Box>

      {loadingStyle && !isNew ? (
        <Typography color="text.secondary">스타일 정보를 불러오는 중입니다.</Typography>
      ) : (
        <>
          {currentTab === 'basicInfo' && (
            <StyleInfo isNew={isNew} formData={styleFormData} handleInputChange={handleStyleInputChange} />
          )}
          {currentTab === 'processInfo' && (
            <StyleProcess processes={styleFormData.processes} onProcessesChange={handleProcessesChange} />
          )}
          {currentTab === 'bom' && (
            <StyleBom formData={styleFormData} handleInputChange={handleStyleInputChange} />
          )}
        </>
      )}

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
