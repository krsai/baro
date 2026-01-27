import React, { useState, useMemo } from 'react';
import {
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  TextField,
  Box,
} from '@mui/material';
import { useApp } from '../../context/AppContext';
import AppPageContainer from '../../components/AppPageContainer';

// Mock data for the list of styles
const mockStyles = [
  { id: 'S-001', name: '클래식 데님 자켓', customer: 'A고객사', registrationDate: '2026-01-15' },
  { id: 'S-002', name: '하이웨이스트 와이드 팬츠', customer: 'B고객사', registrationDate: '2026-01-16' },
  { id: 'S-003', name: '오버핏 린넨 셔츠', customer: 'A고객사', registrationDate: '2026-01-17' },
  { id: 'S-004', name: '플리츠 미디 스커트', customer: 'C고객사', registrationDate: '2026-01-18' },
];

const Style = () => {
  const { navigateToPath } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const handleRowDoubleClick = (style) => {
    navigateToPath(`/style/${style.id}`, { label: `스타일: ${style.name}` });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', { label: '새 스타일' });
  };

  const filteredStyles = useMemo(() => {
    if (!searchTerm) {
      return mockStyles;
    }
    return mockStyles.filter(
      (style) =>
        style.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        style.customer.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <AppPageContainer>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextField
          label="스타일명 또는 고객사 검색"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: '400px' }}
        />
        <Button
          onClick={handleAddNewClick}
          variant="contained"
          color="primary"
        >
          새 스타일 추가
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="style list table">
            <TableHead>
              <TableRow>
                <TableCell>고객사</TableCell>
                <TableCell>스타일명</TableCell>
                <TableCell>스타일코드</TableCell>
                <TableCell>등록일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStyles.map((style) => (
                <TableRow
                  hover
                  key={style.id}
                  onDoubleClick={() => handleRowDoubleClick(style)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{style.customer}</TableCell>
                  <TableCell>{style.name}</TableCell>
                  <TableCell>{style.id}</TableCell>
                  <TableCell>{style.registrationDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppPageContainer>
  );
};

export default Style;
