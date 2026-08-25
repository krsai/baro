import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../constants/layout';
import { useAppActions } from '../context/AppContext';
import { buildQueryString, requestJSON } from '../utils/apiClient';

// Extracted from AssignBoard.jsx (right-click a queued/assigned card ->
// "수량 확인") so the customer production report can open the exact same
// drawer for a single AssignmentPlan by its externalId.
const QuantityReviewProcessTable = ({ processTotals, workRecords, planned, label, onOpenWorkLog }) => {
  const [expandedProcessKey, setExpandedProcessKey] = useState('');

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
        {label('공정별 수량', 'Quantity by process', 'Số lượng theo công đoạn')}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{label('공정', 'Process', 'Công đoạn')}</TableCell>
              <TableCell align="right">{label('목표 수량', 'Target', 'Muc tieu')}</TableCell>
              <TableCell align="right">{label('기록 수량', 'Recorded', 'Đã ghi')}</TableCell>
              <TableCell align="right">{label('차이', 'Diff', 'Chenh lech')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processTotals.map((process, index) => {
              const processKey = String(process?.styleProcessId || `${process?.processCode || 'process'}:${index}`);
              const expanded = expandedProcessKey === processKey;
              const quantity = Math.max(0, Number(process?.quantity) || 0);
              // A MALE_ONLY/FEMALE_ONLY process's own target (applicableQuantity),
              // not the assignment's full blended `planned` quantity.
              const processTarget = Number(process?.applicableQuantity ?? planned) || 0;
              const difference = quantity - processTarget;
              const linkedRecords = workRecords.filter((record) =>
                process?.styleProcessId
                  ? String(record?.styleProcessId || '') === String(process.styleProcessId)
                  : String(record?.processCode || '') === String(process?.processCode || '')
              );
              return (
                <React.Fragment key={processKey}>
                  <TableRow
                    hover
                    onClick={() => setExpandedProcessKey((current) => current === processKey ? '' : processKey)}
                    aria-expanded={expanded}
                    sx={{ cursor: 'pointer', '& > td': { backgroundColor: expanded ? 'action.hover' : undefined } }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <IconButton size="small" tabIndex={-1} aria-hidden="true">
                          {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                        <Typography variant="body2">
                          {[process?.processCode, process?.processName].filter(Boolean).join(' · ') || `${label('공정', 'Process', 'Công đoạn')} ${index + 1}`}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{processTarget.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{quantity.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ color: difference === 0 ? 'success.main' : 'error.main', fontWeight: 800 }}>
                      {difference > 0 ? '+' : ''}{difference.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ p: 0, backgroundColor: '#fafcff' }}>
                        <Table size="small" aria-label={label('연결된 작업기록', 'Linked work records', 'Nhật ký công việc liên kết')}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ pl: 6 }}>{label('작업일', 'Work date', 'Ngày làm')}</TableCell>
                              <TableCell>{label('작업자', 'Worker', 'Người làm')}</TableCell>
                              <TableCell align="right">{label('수량', 'Quantity', 'Số lượng')}</TableCell>
                              <TableCell align="right">{label('바로가기', 'Open', 'Mở')}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {linkedRecords.length ? linkedRecords.map((record, recordIndex) => (
                              <TableRow key={record?.id || recordIndex}>
                                <TableCell sx={{ pl: 6 }}>{record?.coverageStartDate && record?.coverageStartDate !== record?.coverageEndDate ? `${record.coverageStartDate} ~ ${record.coverageEndDate}` : record?.workDate || record?.coverageEndDate || '-'}</TableCell>
                                <TableCell>{record?.isOutsourced ? `${label('외주', 'Outsourced', 'Gia công')} · ${record?.workerName || '-'}` : record?.workerName || '-'}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>{Math.max(0, Number(record?.quantity) || 0).toLocaleString()}</TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    endIcon={<OpenInNewIcon fontSize="small" />}
                                    disabled={!record?.workLogId}
                                    onClick={() => onOpenWorkLog?.(record)}
                                    sx={{
                                      minWidth: 0,
                                      height: 26,
                                      px: 0.75,
                                      fontSize: '0.72rem',
                                      whiteSpace: 'nowrap',
                                      '& .MuiButton-endIcon': { ml: 0.35, mr: 0 },
                                      '& .MuiSvgIcon-root': { fontSize: 14 },
                                    }}
                                  >
                                    {label('작업 기록', 'Work log', 'Nhật ký')}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )) : (
                              <TableRow><TableCell colSpan={4} align="center">{label('연결된 작업기록이 없습니다.', 'No linked work records.', 'Không có nhật ký công việc liên kết.')}</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

/**
 * Right-click "수량 확인" drawer, standalone so any page can open it for a
 * single AssignmentPlan by externalId - same drawer AssignBoard.jsx uses.
 *
 * @param externalId AssignmentPlan.externalId, or falsy to keep the drawer closed.
 * @param headerOrderNo / headerStyleLabel - shown in the header immediately,
 *   before (or if) the API's own values arrive - callers that already have
 *   this from their own list data (e.g. the customer production report) can
 *   pass it straight through instead of waiting on a second fetch.
 * @param headerQuantity fallback quantity if the API response has no
 *   plannedQuantity yet (matches AssignBoard's own `reason.plannedQuantity ?? quantityReviewAssignment.quantity`).
 */
const QuantityReviewDrawer = ({
  externalId,
  orgId,
  languageCode,
  headerOrderNo,
  headerStyleLabel,
  headerQuantity,
  onClose,
}) => {
  const { navigateToPath } = useAppActions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const assignmentId = String(externalId || '').trim();
    const normalizedOrgId = Number(orgId);
    if (!assignmentId || !Number.isFinite(normalizedOrgId) || normalizedOrgId <= 0) {
      setData(null);
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    const abortController = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    requestJSON(
      `/assignment-plans/${encodeURIComponent(assignmentId)}/quantity-review` +
        buildQueryString({ orgId: normalizedOrgId }),
      {
        forceRefresh: true,
        skipGlobalLoading: true,
        signal: abortController.signal,
      }
    )
      .then((result) => {
        if (!cancelled) setData(result || null);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError?.message ||
              (languageCode === 'ko'
                ? '수량 정보를 불러오지 못했습니다.'
                : 'Failed to load quantity details.')
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [externalId, orgId, languageCode]);

  const handleOpenWorkLog = useCallback((record) => {
    const workLogId = Number(record?.workLogId);
    if (!Number.isInteger(workLogId) || workLogId <= 0) return;
    const workDate = String(record?.workDate || record?.coverageEndDate || '').trim();
    const title = languageCode === 'ko'
      ? '작업 기록 상세'
      : languageCode === 'vi'
        ? 'Chi tiết nhật ký công việc'
        : 'Work Log Detail';
    // Close synchronously instead of relying on a route-change effect (the
    // original AssignBoard-only version watched its own route to auto-close
    // after navigating away) - works the same regardless of which page hosts
    // this drawer.
    onClose?.();
    navigateToPath(`/work-history/${workLogId}?quantityReviewRefresh=${Date.now()}`, {
      label: workDate ? `${title}: ${workDate}` : title,
    });
  }, [languageCode, navigateToPath, onClose]);

  const open = Boolean(externalId);
  const label = (ko, en, vi) => (languageCode === 'ko' ? ko : languageCode === 'vi' ? vi : en);
  const reason = data || {};
  const planned = Math.max(0, Number(reason.plannedQuantity ?? headerQuantity) || 0);
  const processTotals = Array.isArray(reason.processTotals) ? reason.processTotals : [];
  const workRecords = Array.isArray(reason.workRecords) ? reason.workRecords : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { ...TOP_OFFSET_DRAWER_PAPER_SX, width: { xs: '100%', md: 760 }, p: 2.5, overflowY: 'auto' } }}
    >
      {open ? (
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={800}>
                {label('수량 확인', 'Quantity review', 'Kiểm tra số lượng')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[headerOrderNo, headerStyleLabel].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading ? (
            <Stack spacing={1.25} alignItems="center" sx={{ py: 8 }}>
              <CircularProgress size={30} />
              <Typography variant="body2" color="text.secondary">
                {label('수량 정보를 불러오는 중입니다.', 'Loading quantity details.', 'Đang tải chi tiết số lượng.')}
              </Typography>
            </Stack>
          ) : data ? (
            <>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Paper variant="outlined" sx={{ p: 1.5, minWidth: 150 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label('주문·배정 수량', 'Order / assigned qty', 'SL đơn / phân công')}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>{planned.toLocaleString()}</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, minWidth: 150 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label('확인 생산수량', 'Verified output', 'Sản lượng xác nhận')}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {Math.max(0, Number(reason.producedQuantity) || 0).toLocaleString()}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, minWidth: 150 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label('작업기록 합계', 'Work-record total', 'Tổng nhật ký')}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {Math.max(0, Number(reason.recordedTotalQuantity) || 0).toLocaleString()}
                  </Typography>
                </Paper>
              </Stack>
              <QuantityReviewProcessTable
                processTotals={processTotals}
                workRecords={workRecords}
                planned={planned}
                label={label}
                onOpenWorkLog={handleOpenWorkLog}
              />
            </>
          ) : null}
        </Stack>
      ) : null}
    </Drawer>
  );
};

export default QuantityReviewDrawer;
