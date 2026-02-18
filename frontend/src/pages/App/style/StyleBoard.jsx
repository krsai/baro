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
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import StyleDetail from './StyleDetail';
import {
  fetchStyles as fetchStylesFromApi,
  deleteStyle,
} from '../../../utils/styleApi';
import { buildQueryString } from '../../../utils/apiClient';
import {
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcesses,
} from '../../../utils/processTime';

const toOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const StyleBoard = () => {
  const { styleId } = useParams();
  if (styleId) {
    return <StyleDetail />;
  }

  const { devBypass, devProfile } = useAuth();
  const { navigateToPath, showNotification } = useApp();
  const activeOrgId = useMemo(
    () => (devBypass ? toOrgId(devProfile?.orgId) : null),
    [devBypass, devProfile?.orgId]
  );
  const isBrandOrg =
    devBypass && String(devProfile?.orgType || '').trim().toUpperCase() === 'BRAND';
  const canViewProcessSummary = !isBrandOrg;
  const [searchTerm, setSearchTerm] = useState('');
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState(null);

  const refreshStyles = async () => {
    setLoading(true);
    try {
      const items = await fetchStylesFromApi({ orgId: activeOrgId });
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
  }, [activeOrgId]);

  const handleRowDoubleClick = (style) => {
    const ownerOrgId = toOrgId(style?.ownerOrgId ?? style?.customerOrgId);
    const query = buildQueryString({ ownerOrgId });
    navigateToPath(`/style/${style.id}${query}`, { label: `스타일 ${style.name || style.id}` });
  };

  const handleAddNewClick = () => {
    navigateToPath('/style/new', { label: '신규 스타일' });
  };

  const handleDeleteClick = (style, event) => {
    event.stopPropagation();
    setStyleToDelete(style);
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
    setStyleToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!styleToDelete) return;

    try {
      await deleteStyle(styleToDelete.id, {
        orgId: activeOrgId,
        ownerOrgId: toOrgId(styleToDelete?.ownerOrgId ?? styleToDelete?.customerOrgId),
      });
      setStyles((prevStyles) => prevStyles.filter((s) => s.id !== styleToDelete.id));
      showNotification('스타일이 삭제되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '스타일 삭제에 실패했습니다.', 'error');
    } finally {
      handleConfirmClose();
    }
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
        if (!canViewProcessSummary) {
          return {
            ...style,
            totalPT: 0,
            totalAT: 0,
            hasTotalPT: false,
            hasTotalAT: false,
          };
        }
        const processes = normalizeProcesses(style.processes);
        const totalPT = calculateProcessTotal(processes, 'pt');
        const totalAT = calculateProcessTotal(processes, 'at');
        return {
          ...style,
          totalPT,
          totalAT,
          hasTotalPT: hasAnyProcessTime(processes, 'pt'),
          hasTotalAT: hasAnyProcessTime(processes, 'at'),
        };
      }),
    [canViewProcessSummary, filteredStyles]
  );

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="스타일명 또는 고객사 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button onClick={handleAddNewClick} variant="contained" color="primary">
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
                {canViewProcessSummary ? <TableCell>총 PT</TableCell> : null}
                {canViewProcessSummary ? <TableCell>총 AT</TableCell> : null}
                <TableCell>등록일</TableCell>
                <TableCell align="center">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canViewProcessSummary ? 7 : 5}
                    sx={{ textAlign: 'center', color: 'text.secondary' }}
                  >
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
                  {canViewProcessSummary ? (
                    <TableCell>{style.hasTotalPT ? formatSeconds(style.totalPT) : '-'}</TableCell>
                  ) : null}
                  {canViewProcessSummary ? (
                    <TableCell>{style.hasTotalAT ? formatSeconds(style.totalAT) : '-'}</TableCell>
                  ) : null}
                  <TableCell>{style.registrationDate || '-'}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      aria-label="delete"
                      size="small"
                      onClick={(e) => handleDeleteClick(style, e)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog open={isConfirmOpen} onClose={handleConfirmClose}>
        <DialogTitle>스타일 삭제 확인</DialogTitle>
        <DialogContent>
          <DialogContentText>
            정말로 '{styleToDelete?.name}' 스타일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose}>취소</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default StyleBoard;
