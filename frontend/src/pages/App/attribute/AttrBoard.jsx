import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AppPageContainer from '../../../components/AppPageContainer';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

// 초기 Mock Data 정의
const initialData = {
  colors: [
    { id: 1, code: 'BLK', name: 'Black' },
    { id: 2, code: 'WHT', name: 'White' },
    { id: 3, code: 'RED', name: 'Red' },
    { id: 4, code: 'BLU', name: 'Blue' },
  ],
  sizes: [
    { id: 1, code: 'S', name: 'Small' },
    { id: 2, code: 'M', name: 'Medium' },
    { id: 3, code: 'L', name: 'Large' },
    { id: 4, code: 'XL', name: 'X-Large' },
  ],
  genders: [
    { id: 1, code: 'M', name: 'Men' },
    { id: 2, code: 'W', name: 'Women' },
    { id: 3, code: 'U', name: 'Unisex' },
  ],
  categories: [
    { id: 1, code: 'OUT', name: 'Outer' },
    { id: 2, code: 'TOP', name: 'Top' },
    { id: 3, code: 'BTM', name: 'Bottom' },
    { id: 4, code: 'DRS', name: 'Dress' },
    { id: 5, code: 'ACC', name: 'Accessory' },
  ],
  roles: [
    { id: 1, code: 'ADMIN', name: '관리자' },
    { id: 2, code: 'MGR', name: '공장장' },
    { id: 3, code: 'WORKER', name: '작업자' },
  ],
  processes: [
    { id: 1, code: 'P01', name: '주머니 달기' },
    { id: 2, code: 'P02', name: '소매 달기' },
    { id: 3, code: 'P03', name: '단추 달기' },
    { id: 4, code: 'P04', name: '지퍼 달기' },
    { id: 5, code: 'P05', name: '라벨 부착' },
  ],
};

// 섹션 설정 (테이블 컬럼 및 타이틀)
const sectionConfigs = [
  {
    key: 'colors',
    title: '색상 (Color)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '색상명', width: '60%' },
    ],
  },
  {
    key: 'sizes',
    title: '사이즈 (Size)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '사이즈명', width: '60%' },
    ],
  },
  {
    key: 'genders',
    title: '성별 (Gender)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '성별', width: '60%' },
    ],
  },
  {
    key: 'categories',
    title: '카테고리 (Category)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '카테고리명', width: '60%' },
    ],
  },
  {
    key: 'roles',
    title: '역할 (Role)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '역할명', width: '60%' },
    ],
  },
  {
    key: 'processes',
    title: '공정 (Process)',
    columns: [
      { field: 'code', label: '코드', width: '30%' },
      { field: 'name', label: '공정명', width: '60%' },
    ],
  },
];

const AttrBoard = () => {
  // 전체 데이터 상태 관리
  const [formData, setFormData] = useState(() => JSON.parse(JSON.stringify(initialData)));
  const [originalData, setOriginalData] = useState(() => JSON.parse(JSON.stringify(initialData)));
  
  const [isDirty, setIsDirty] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [changes, setChanges] = useState([]);

  // 변경 사항 감지
  useEffect(() => {
    const isChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
    setIsDirty(isChanged);
  }, [formData, originalData]);

  // 커스텀 훅을 사용하여 저장되지 않은 변경사항 보호 (전역 재사용 가능)
  useUnsavedChanges(isDirty);

  // 데이터 변경 핸들러
  const handleRowChange = (sectionKey, id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleAddRow = (sectionKey) => {
    const newRow = { id: `new-${Date.now()}` };
    // 해당 섹션의 컬럼들에 빈 값 초기화
    const config = sectionConfigs.find(c => c.key === sectionKey);
    config.columns.forEach(col => {
      newRow[col.field] = '';
    });

    setFormData((prev) => ({
      ...prev,
      [sectionKey]: [...prev[sectionKey], newRow],
    }));
  };

  const handleDeleteRow = (sectionKey, id) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((item) => item.id !== id),
    }));
  };

  // 저장 로직
  const handleSaveClick = () => {
    // 변경 내역 분석
    const detectedChanges = [];
    sectionConfigs.forEach((section) => {
      const orgList = originalData[section.key];
      const curList = formData[section.key];
      const title = section.title.split(' (')[0]; // 한글 제목만 추출

      // 추가된 항목
      curList.forEach(item => {
        if (!orgList.find(o => o.id === item.id)) {
          detectedChanges.push(`[${title}] 추가: ${item.name || item.code || '새 항목'}`);
        }
      });

      // 삭제된 항목
      orgList.forEach(item => {
        if (!curList.find(c => c.id === item.id)) {
          detectedChanges.push(`[${title}] 삭제: ${item.name || item.code}`);
        }
      });

      // 수정된 항목
      curList.forEach(item => {
        const orgItem = orgList.find(o => o.id === item.id);
        if (orgItem && JSON.stringify(item) !== JSON.stringify(orgItem)) {
          detectedChanges.push(`[${title}] 수정: ${item.name || item.code}`);
        }
      });
    });

    setChanges(detectedChanges);
    setConfirmOpen(true);
  };

  const handleConfirmSave = () => {
    // [API 연동 포인트] 전체 데이터 저장 API 호출
    console.log('Saving all attributes:', formData);
    setOriginalData(JSON.parse(JSON.stringify(formData)));
    setConfirmOpen(false);
    alert('모든 속성 정보가 저장되었습니다.');
  };

  const handleRevert = () => {
    if (window.confirm('모든 변경 사항을 취소하고 되돌리시겠습니까?')) {
      setFormData(JSON.parse(JSON.stringify(originalData)));
    }
  };

  // 섹션 렌더링 헬퍼
  const renderSection = (config) => {
    return (
      <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
            {config.title}
          </Typography>
          <Button 
            size="small" 
            variant="outlined" 
            startIcon={<AddIcon />} 
            onClick={() => handleAddRow(config.key)}
          >
            추가
          </Button>
        </Box>
        <TableContainer sx={{ flexGrow: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {config.columns.map((col) => (
                  <TableCell key={col.field} sx={{ fontWeight: 'bold', width: col.width }}>
                    {col.label}
                  </TableCell>
                ))}
                <TableCell sx={{ width: '10%', textAlign: 'center' }}>삭제</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {formData[config.key].map((row) => (
                <TableRow key={row.id} hover>
                  {config.columns.map((col) => (
                    <TableCell key={col.field}>
                      <TextField
                        value={row[col.field] || ''}
                        onChange={(e) => handleRowChange(config.key, row.id, col.field, e.target.value)}
                        fullWidth
                        size="small"
                        type={col.type || 'text'}
                        placeholder={col.label}
                      />
                    </TableCell>
                  ))}
                  <TableCell sx={{ textAlign: 'center' }}>
                    <IconButton size="small" onClick={() => handleDeleteRow(config.key, row.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {formData[config.key].length === 0 && (
                <TableRow>
                  <TableCell colSpan={config.columns.length + 1} sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
                    데이터 없음
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  };

  return (
    <AppPageContainer>
      <Box>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            속성 관리 통합
          </Typography>

          {/* 저장/되돌리기 버튼 그룹 */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined" 
              onClick={handleRevert} 
              disabled={!isDirty}
            >
              되돌리기
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSaveClick} 
              disabled={!isDirty}
            >
              저장
            </Button>
          </Box>
        </Box>
        
        {/* 속성 섹션 그리드 배치 */}
        <Grid container spacing={3}>
          {sectionConfigs.map((config) => (
            <Grid item xs={12} md={config.fullWidth ? 12 : 6} key={config.key}>
              {renderSection(config)}
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* 변경 사항 확인 다이얼로그 */}
      <Dialog open={isConfirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>변경 사항 저장</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            다음 변경 사항을 저장하시겠습니까?
          </DialogContentText>
          <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1, maxHeight: '300px', overflow: 'auto' }}>
            {changes.length > 0 ? changes.map((msg, idx) => (
              <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>• {msg}</Typography>
            )) : <Typography variant="body2">변경 사항이 감지되지 않았습니다.</Typography>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button onClick={handleConfirmSave} variant="contained" autoFocus>확인</Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default AttrBoard;