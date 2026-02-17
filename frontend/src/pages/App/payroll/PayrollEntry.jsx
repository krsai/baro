import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const { navigateToPath, showNotification } = useApp();
  const isEditMode = Boolean(payrollId) && payrollId !== 'new';

  const [payMonth, setPayMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [factoryName, setFactoryName] = useState('');
  const [note, setNote] = useState('');

  const closeEntry = useCallback(() => {
    if (isEditMode && payrollId) {
      navigateToPath('/payroll', {
        label: '급여 계산',
        closeTabId: `/payroll/${payrollId}`,
      });
      return;
    }
    navigateToPath('/payroll', {
      label: '급여 계산',
      closeTabId: '/payroll/new',
    });
  }, [isEditMode, navigateToPath, payrollId]);

  const handleSave = () => {
    showNotification('급여 계산 페이지가 연결되었습니다. 저장 기능은 다음 단계에서 구현하세요.', 'info');
    closeEntry();
  };

  return (
    <AppPageContainer>
      <Box sx={{ maxWidth: 840 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">{isEditMode ? '급여 계산 상세' : '급여 계산 추가'}</Typography>
          <Typography variant="body2" color="text.secondary">
            회계 관리 메뉴와 연결된 기본 입력 페이지입니다.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <TextField
              label="정산 월"
              type="month"
              value={payMonth}
              onChange={(event) => setPayMonth(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="공장명"
              value={factoryName}
              onChange={(event) => setFactoryName(event.target.value)}
              placeholder="예: A공장"
              fullWidth
            />
            <TextField
              label="비고"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minRows={3}
              multiline
              fullWidth
            />
          </Stack>
        </Paper>

        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={closeEntry}>
            취소
          </Button>
          <Button variant="contained" onClick={handleSave}>
            저장
          </Button>
        </Stack>
      </Box>
    </AppPageContainer>
  );
};

export default PayrollEntry;
