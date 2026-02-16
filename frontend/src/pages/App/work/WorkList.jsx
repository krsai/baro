import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useApp } from '../../../context/AppContext';
import { loadWorkLogs } from './workLogStorage';

const formatSeconds = (value) => {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}시간 ${minutes}분`;
};

const formatNote = (note) => {
  if (!note) return '-';
  if (note === 'Attendance integration pending') return '출결 연동 예정';
  return note;
};

const WorkList = () => {
  const { navigateToPath } = useApp();
  const [workLogs] = useState(() => loadWorkLogs());

  const sortedLogs = useMemo(
    () =>
      [...workLogs].sort(
        (a, b) =>
          new Date(b.workDate || b.createdAt || 0).getTime() -
          new Date(a.workDate || a.createdAt || 0).getTime()
      ),
    [workLogs]
  );

  const handleAdd = () => {
    navigateToPath('/work-history/new', { label: '작업 기록 추가' });
  };
  const handleEdit = (log) => {
    if (!log?.id) return;
    const labelSuffix = log.workDate || log.factoryName || log.id;
    navigateToPath(`/work-history/${log.id}`, {
      label: `작업 기록 ${labelSuffix}`,
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">작업 기록</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          작업 기록 추가
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>작업일자</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>공장</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>기준</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>작업자 수</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>항목 수</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>총 CT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    등록된 작업 기록이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                sortedLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    hover
                    onDoubleClick={() => handleEdit(log)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{log.workDate || '-'}</TableCell>
                    <TableCell>{log.factoryName || '-'}</TableCell>
                    <TableCell>{log.ctBasis || 'CT'}</TableCell>
                    <TableCell>{log.workerCount ?? 0}</TableCell>
                    <TableCell>{log.itemCount ?? 0}</TableCell>
                    <TableCell>{formatSeconds(log.totalContractedSeconds)}</TableCell>
                    <TableCell>{formatNote(log.note)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default WorkList;
