import React, { useEffect, useState } from 'react';
import {
  Box,
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
import PageSectionHeader from '../../../components/PageSectionHeader';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} 동`;

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);

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
          showNotification(error?.message || '급여 확정 내역을 불러오지 못했습니다.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeOrgId, showNotification]);

  const handleAdd = () => {
    navigateToPath('/payroll/new', { label: '급여 계산 추가' });
  };

  const handleRowClick = (snapshot) => {
    navigateToPath(`/payroll/${snapshot.month}`, { label: `급여 ${snapshot.month}` });
  };

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="급여 계산"
          actionLabel="급여 계산 추가"
          actionIcon={<AddIcon />}
          onAction={handleAdd}
        />
      }
    >
      <Box>
        <Paper variant="outlined" sx={{ width: '100%' }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>정산 월</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">대상 인원</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">총 급여</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>확정자</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>확정 일시</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">상태</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow colSpan={6} message="불러오는 중..." />
                ) : snapshots.length === 0 ? (
                  <TableStatusRow
                    colSpan={6}
                    message="확정된 급여 내역이 없습니다. '급여 계산 추가'로 시작하세요."
                  />
                ) : (
                  snapshots.map((snapshot) => {
                    const employees = Array.isArray(snapshot.data) ? snapshot.data : [];
                    const totalEarnings = employees.reduce(
                      (sum, e) => sum + Number(e.finalEarnings ?? e.totalEarnings ?? 0),
                      0
                    );
                    return (
                      <TableRow
                        key={snapshot.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => handleRowClick(snapshot)}
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
                          <Chip size="small" label="확정됨" color="success" variant="outlined" />
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
