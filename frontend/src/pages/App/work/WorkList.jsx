import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../../components/AppPageContainer';
import PageSectionHeader from '../../../components/PageSectionHeader';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { deleteWorkLog, loadWorkLogs } from './workLogStorage';

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
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [workLogs, setWorkLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const rows = await loadWorkLogs({ orgId: activeOrgId });
        if (!cancelled) {
          setWorkLogs(Array.isArray(rows) ? rows : []);
        }
      } catch (_error) {
        if (!cancelled) {
          setWorkLogs([]);
          showNotification('작업 기록 조회에 실패했습니다.', 'error');
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
    navigateToPath('/work-history/new', { label: '작업 상세' });
  };

  const handleEdit = (log) => {
    if (!log?.id) return;
    navigateToPath(`/work-history/${log.id}`, {
      label: '작업 상세',
    });
  };

  const handleDelete = async (event, log) => {
    event.stopPropagation();
    const workLogId = log?.id;
    if (!workLogId) return;

    const labelSuffix = log.workDate || log.factoryName || workLogId;
    const confirmed = window.confirm(
      `작업 기록 "${labelSuffix}"을(를) 삭제하시겠습니까?`
    );
    if (!confirmed) return;

    const currentId = String(workLogId);
    setDeletingId(currentId);
    try {
      const deleted = await deleteWorkLog(workLogId, { orgId: activeOrgId });
      setWorkLogs((prev) =>
        prev.filter((item) => String(item?.id || '') !== currentId)
      );
      showNotification(
        deleted
          ? '작업 기록을 삭제했습니다.'
          : '삭제할 작업 기록을 찾을 수 없습니다.',
        deleted ? 'success' : 'warning'
      );
    } catch (_error) {
      showNotification('작업 기록 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingId((prev) => (prev === currentId ? null : prev));
    }
  };

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="작업 기록"
          actionLabel="작업 기록 추가"
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
                  <TableCell sx={{ fontWeight: 700 }}>작업일자</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>공장</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>작업자 수</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>품목 수</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>평균 CT</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 64, textAlign: 'center' }}>
                    삭제
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow
                    colSpan={7}
                    message="작업 기록을 불러오는 중입니다."
                  />
                ) : sortedLogs.length === 0 ? (
                  <TableStatusRow
                    colSpan={7}
                    message="등록된 작업 기록이 없습니다."
                  />
                ) : (
                  sortedLogs.map((log) => {
                    const rowId = String(log.id);
                    const isDeleting = deletingId === rowId;
                    return (
                      <TableRow
                        key={log.id}
                        hover
                        onDoubleClick={() => handleEdit(log)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{log.workDate || '-'}</TableCell>
                        <TableCell>{log.factoryName || '-'}</TableCell>
                        <TableCell>{log.workerCount ?? 0}</TableCell>
                        <TableCell>{log.itemCount ?? 0}</TableCell>
                        <TableCell>{formatSeconds(Math.round((log.totalContractedSeconds ?? 0) / Math.max(1, log.workerCount ?? 1)))}</TableCell>
                        <TableCell>{formatNote(log.note)}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, log)}
                            disabled={Boolean(deletingId) || isDeleting}
                            aria-label="작업 기록 삭제"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
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

export default WorkList;
