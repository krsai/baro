import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const OverrunBoard = () => {
  const { activeOrgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const data = await requestJSON('/assignment-overruns' + query).catch(() => []);
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const totalOverflow = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + (Number.isFinite(Number(row?.overflowQuantity)) ? Number(row.overflowQuantity) : 0),
        0
      ),
    [rows]
  );

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">초과 생산 모니터링</Typography>
          <Chip
            color={rows.length > 0 ? 'error' : 'default'}
            variant={rows.length > 0 ? 'filled' : 'outlined'}
            label={`초과 ${formatNumberWithCommas(totalOverflow, { fallback: '0', maximumFractionDigits: 0 })}개`}
          />
        </Box>
      }
    >
      <Alert severity="info" sx={{ mb: 2 }}>
        운영자/관리자가 초과 생산분을 확인해 고객 청구 여부를 판단하는 용도의 초기 화면입니다.
      </Alert>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>주문</TableCell>
                <TableCell>고객/스타일</TableCell>
                <TableCell>라인</TableCell>
                <TableCell align="right">기준 수량</TableCell>
                <TableCell align="right">누적 생산</TableCell>
                <TableCell align="right">초과</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableStatusRow
                loading={loading}
                empty={!loading && rows.length === 0}
                colSpan={6}
                loadingText="초과 생산 데이터를 확인하는 중입니다."
                emptyText="현재 초과 생산 건이 없습니다."
              />
              {!loading &&
                rows.map((row, index) => (
                  <TableRow key={`${String(row?.id || 'row')}-${index}`} hover>
                    <TableCell>{row?.orderNo || '-'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row?.customer || '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row?.label || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{row?.lineName || '-'}</TableCell>
                    <TableCell align="right">
                      {formatNumberWithCommas(row?.baselineQuantity || 0, {
                        fallback: '0',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {formatNumberWithCommas(row?.producedQuantity || 0, {
                        fallback: '0',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                      {formatNumberWithCommas(row?.overflowQuantity || 0, {
                        fallback: '0',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppPageContainer>
  );
};

export default OverrunBoard;
