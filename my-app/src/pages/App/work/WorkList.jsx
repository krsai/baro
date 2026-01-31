import React, { useState } from 'react';
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
  Drawer,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import WorkDetail from './WorkDetail';

const WorkList = () => {
  // 임시 데이터 (추후 API 연동 시 교체)
  const [workLogs] = useState([
    {
      id: 1,
      date: '2023-10-26',
      factory: '하노이 1공장',
      wageStandard: 'PT',
      workerCount: 15,
      processCount: 4,
      totalStandardTime: 48600,
      totalWorkingHours: 54000,
    },
    {
      id: 2,
      date: '2023-10-26',
      factory: '다낭 2공장',
      wageStandard: 'ST',
      workerCount: 10,
      processCount: 3,
      totalStandardTime: 32000,
      totalWorkingHours: 36000,
    },
    {
      id: 3,
      date: '2023-10-25',
      factory: '하노이 1공장',
      wageStandard: 'PT',
      workerCount: 14,
      processCount: 4,
      totalStandardTime: 45000,
      totalWorkingHours: 50400,
    },
  ]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const toggleDrawer = (open) => () => {
    setIsDrawerOpen(open);
  };

  const formatAverageTime = (totalSeconds, count) => {
    if (!count) return '0시간 0분';
    const avgSeconds = totalSeconds / count;
    const hours = Math.floor(avgSeconds / 3600);
    const minutes = Math.floor((avgSeconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={toggleDrawer(true)}>
          작업 기록 추가
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>날짜</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>공장</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>작업자 수</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>총 공정 종류</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>인당 평균 작업 시간 (PT/ST)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>인당 평균 근로 시간</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>생산 효율</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workLogs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>{log.date}</TableCell>
                  <TableCell>{log.factory}</TableCell>
                  <TableCell>{log.workerCount}명</TableCell>
                  <TableCell>{log.processCount}개</TableCell>
                  <TableCell>
                    {formatAverageTime(log.totalStandardTime, log.workerCount)} ({log.wageStandard})
                  </TableCell>
                  <TableCell>{formatAverageTime(log.totalWorkingHours, log.workerCount)}</TableCell>
                  <TableCell>
                    {((log.totalStandardTime / log.totalWorkingHours) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 오른쪽 슬라이드 패널 (Drawer) */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={toggleDrawer(false)}
      >
        <WorkDetail onClose={toggleDrawer(false)} />
      </Drawer>
    </Box>
  );
};

export default WorkList;