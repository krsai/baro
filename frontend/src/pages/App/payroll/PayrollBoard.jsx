import React from 'react';
import {
  Box,
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

const PayrollBoard = () => {
  const { navigateToPath } = useApp();

  const handleAdd = () => {
    navigateToPath('/payroll/new', { label: '급여 계산 추가' });
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
                  <TableCell sx={{ fontWeight: 700 }}>공장</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>대상 인원</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>총 급여</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableStatusRow
                  colSpan={5}
                  message="등록된 급여 계산 내역이 없습니다. 오른쪽 상단의 급여 계산 추가로 시작하세요."
                />
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </AppPageContainer>
  );
};

export default PayrollBoard;
