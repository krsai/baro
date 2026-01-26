import React from 'react';
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


  const handleRowClick = (style) => {
    navigateToPath(`/style/${style.id}`, { label: `스타일: ${style.name}` });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', { label: '새 스타일' });
  };

  return (
    <AppPageContainer
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            스타일 목록
          </Typography>
          <Button
            onClick={handleAddNewClick}
            variant="contained"
            color="primary"
          >
            새 스타일 추가
          </Button>
        </div>
      }
    >
      <Paper sx={{ width: '100%', overflow: 'hidden' }} elevation={3}>
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
              {mockStyles.map((style) => (
                <TableRow
                  hover
                  key={style.id}
                  onClick={() => handleRowClick(style)}
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
