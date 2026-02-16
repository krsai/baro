import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Drawer,
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
import WorkDetail from './WorkDetail';

const STORAGE_KEY = 'baro_work_logs_v2';

const loadWorkLogs = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const saveWorkLogs = (logs) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
};

const formatSeconds = (value) => {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const WorkList = () => {
  const [workLogs, setWorkLogs] = useState(() => loadWorkLogs());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const sortedLogs = useMemo(
    () =>
      [...workLogs].sort(
        (a, b) => new Date(b.workDate || b.createdAt || 0).getTime() - new Date(a.workDate || a.createdAt || 0).getTime()
      ),
    [workLogs]
  );

  const toggleDrawer = (open) => () => setIsDrawerOpen(open);

  const handleSaveLog = (payload) => {
    const nextLog = {
      id: `work-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ctBasis: 'CT',
      ...payload,
    };
    setWorkLogs((prev) => {
      const next = [nextLog, ...prev];
      saveWorkLogs(next);
      return next;
    });
    setIsDrawerOpen(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Work Logs</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={toggleDrawer(true)}>
          Add Work Log
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Payroll basis is CT only. PT/AT are used as proposal data.
      </Alert>

      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Factory</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Basis</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Workers</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rows</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Total CT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    No work logs yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedLogs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>{log.workDate || '-'}</TableCell>
                    <TableCell>{log.factoryName || '-'}</TableCell>
                    <TableCell>{log.ctBasis || 'CT'}</TableCell>
                    <TableCell>{log.workerCount ?? 0}</TableCell>
                    <TableCell>{log.itemCount ?? 0}</TableCell>
                    <TableCell>{formatSeconds(log.totalContractedSeconds)}</TableCell>
                    <TableCell>{log.note || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Drawer anchor="right" open={isDrawerOpen} onClose={toggleDrawer(false)}>
        <WorkDetail onClose={toggleDrawer(false)} onSave={handleSaveLog} />
      </Drawer>
    </Box>
  );
};

export default WorkList;
