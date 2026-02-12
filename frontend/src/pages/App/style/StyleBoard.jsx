import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
} from '@mui/material';
import { useApp } from '../../../context/AppContext';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleDetail from './StyleDetail';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import {
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcesses,
} from '../../../utils/processTime';

const StyleBoard = () => {
  const { styleId } = useParams();
  if (styleId) {
    return <StyleDetail />;
  }

  const { navigateToPath, showNotification } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshStyles = async () => {
    setLoading(true);
    try {
      const items = await fetchStylesFromApi();
      setStyles(items);
    } catch (error) {
      setStyles([]);
      showNotification(error?.message || '스타일 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStyles();
  }, []);

  const handleRowDoubleClick = (style) => {
    navigateToPath(`/style/${style.id}`, { label: `스타일 ${style.name || style.id}` });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', { label: '신규 스타일' });
  };

  const filteredStyles = useMemo(() => {
    if (!searchTerm) {
      return styles;
    }
    const lower = searchTerm.toLowerCase();
    return styles.filter(
      (style) =>
        (style.name || '').toLowerCase().includes(lower) ||
        (style.customer || '').toLowerCase().includes(lower) ||
        (style.styleCode || '').toLowerCase().includes(lower) ||
        (style.id || '').toLowerCase().includes(lower)
    );
  }, [styles, searchTerm]);

  const rows = useMemo(
    () =>
      filteredStyles.map((style) => {
        const processes = normalizeProcesses(style.processes);
        const totalPT = calculateProcessTotal(processes, 'pt');
        const totalST = calculateProcessTotal(processes, 'st');
        return {
          ...style,
          totalPT,
          totalST,
          hasTotalPT: hasAnyProcessTime(processes, 'pt'),
          hasTotalST: hasAnyProcessTime(processes, 'st'),
        };
      }),
    [filteredStyles]
  );

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="스타일명 또는 고객사 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          onClick={handleAddNewClick}
          variant="contained"
          color="primary"
        >
          스타일 추가
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="style list table" size="small">
            <TableHead>
              <TableRow>
                <TableCell>고객사</TableCell>
                <TableCell>스타일명</TableCell>
                <TableCell>스타일 코드</TableCell>
                <TableCell>총 PT</TableCell>
                <TableCell>총 ST</TableCell>
                <TableCell>등록일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    {loading ? '스타일 목록을 불러오는 중입니다.' : '등록된 스타일이 없습니다.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((style) => (
                <TableRow
                  hover
                  key={style.id}
                  onDoubleClick={() => handleRowDoubleClick(style)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{style.customer || '-'}</TableCell>
                  <TableCell>{style.name || '-'}</TableCell>
                  <TableCell>{style.styleCode || style.id || '-'}</TableCell>
                  <TableCell>{style.hasTotalPT ? formatSeconds(style.totalPT) : '-'}</TableCell>
                  <TableCell>{style.hasTotalST ? formatSeconds(style.totalST) : '-'}</TableCell>
                  <TableCell>{style.registrationDate || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppPageContainer>
  );
};

export default StyleBoard;
