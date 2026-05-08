import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AppPageContainer from '../../../components/AppPageContainer';
import DeleteActionButton from '../../../components/DeleteActionButton';
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), {
    fallback: '0',
    maximumFractionDigits: 0,
  })} 동`;

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const rows = await requestJSON('/payroll/snapshots' + query);
        if (!cancelled) setSnapshots(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (!cancelled) {
          setSnapshots([]);
          showNotification(error?.message || '급여 스냅샷 내역을 불러오지 못했습니다.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, showNotification]);

  const handleAdd = () => {
    navigateToPath('/payroll/new', { label: '급여 계산 추가' });
  };

  const handleRowOpen = (snapshot) => {
    navigateToPath(`/payroll/${snapshot.month}`, { label: `급여 ${snapshot.month}` });
  };

  const handleDeleteSnapshot = async (snapshot) => {
    const month = String(snapshot?.month || '').trim();
    if (!month) return;
    if (!window.confirm(`${month} 급여 스냅샷을 삭제하시겠습니까?`)) return;

    setDeletingMonth(month);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON(`/payroll/snapshots/${month}` + query, { method: 'DELETE' });
      setSnapshots((prev) => prev.filter((row) => String(row?.month || '').trim() !== month));
      showNotification(`${month} 급여 스냅샷을 삭제했습니다.`, 'success');
    } catch (error) {
      if (error?.message?.includes('payroll month closed')) {
        showNotification('해당 월은 이미 지나서 삭제할 수 없습니다.', 'warning');
      } else {
        showNotification(error?.message || '급여 삭제에 실패했습니다.', 'error');
      }
    } finally {
      setDeletingMonth('');
    }
  };

  return (
    <AppPageContainer
      title="급여 계산"
      toolbar={(
        <PageToolbar
          right={(
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
              급여 계산 추가
            </Button>
          )}
        />
      )}
    >
      <Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>정산 월</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    대상 인원
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    총 급여
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>저장자</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>저장 일시</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    상태
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    삭제
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow colSpan={7} message="불러오는 중..." />
                ) : snapshots.length === 0 ? (
                  <TableStatusRow
                    colSpan={7}
                    message="저장된 급여 스냅샷이 없습니다. '급여 계산 추가'로 시작해보세요."
                  />
                ) : (
                  snapshots.map((snapshot) => {
                    const employees = Array.isArray(snapshot.data) ? snapshot.data : [];
                    const totalEarnings = employees.reduce(
                      (sum, employee) =>
                        sum + Number(employee.finalEarnings ?? employee.totalEarnings ?? 0),
                      0
                    );

                    return (
                      <TableRow
                        key={snapshot.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onDoubleClick={() => handleRowOpen(snapshot)}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{snapshot.month}</TableCell>
                        <TableCell align="right">{employees.length}명</TableCell>
                        <TableCell align="right">{formatDong(totalEarnings)}</TableCell>
                        <TableCell>{snapshot.lockedBy || '-'}</TableCell>
                        <TableCell>
                          {snapshot.lockedAt
                            ? new Date(snapshot.lockedAt).toLocaleString('ko-KR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" label="스냅샷" color="default" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">
                          <DeleteActionButton
                            stopPropagation
                            disabled={Boolean(deletingMonth)}
                            title={deletingMonth === snapshot.month ? '삭제 중...' : '삭제'}
                            onClick={() => handleDeleteSnapshot(snapshot)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </AppPageContainer>
  );
};

export default PayrollBoard;
