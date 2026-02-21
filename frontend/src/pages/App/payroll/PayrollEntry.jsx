import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), { fallback: '0', maximumFractionDigits: 0 })} 동`;

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId, activeProfile } = useAuth();

  // payrollId가 "new"면 신규, 아니면 확정 조회 (month 값)
  const isNew = !payrollId || payrollId === 'new';
  const monthFromParam = isNew ? null : payrollId;

  const [payMonth, setPayMonth] = useState(
    () => monthFromParam ?? new Date().toISOString().slice(0, 7)
  );
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [payrollData, setPayrollData] = useState(null); // { locked, month, employees, lockedAt, lockedBy }
  const [expandedWorkerId, setExpandedWorkerId] = useState(null);

  const closeEntry = useCallback(() => {
    navigateToPath('/payroll', {
      label: '급여 계산',
      closeTabId: isNew ? '/payroll/new' : `/payroll/${payrollId}`,
    });
  }, [isNew, navigateToPath, payrollId]);

  const fetchPayroll = useCallback(
    async (month) => {
      setLoading(true);
      setPayrollData(null);
      try {
        const query = buildQueryString({ orgId: activeOrgId, month });
        const data = await requestJSON('/payroll' + query);
        setPayrollData(data);
      } catch (error) {
        showNotification(error?.message || '급여 데이터를 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, showNotification]
  );

  // 조회 모드(확정된 월)면 마운트 시 자동 로드
  useEffect(() => {
    if (!isNew && monthFromParam) {
      fetchPayroll(monthFromParam);
    }
  }, [isNew, monthFromParam, fetchPayroll]);

  const handleCalculate = () => {
    if (!payMonth) {
      showNotification('정산 월을 선택하세요.', 'error');
      return;
    }
    fetchPayroll(payMonth);
  };

  const handleLock = async () => {
    if (!payrollData || payrollData.locked) return;
    if (!window.confirm(`${payMonth} 급여를 확정하시겠습니까? 확정 후에는 수정할 수 없습니다.`))
      return;

    setLocking(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/payroll/lock' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: payMonth,
          lockedBy: activeProfile?.email || activeProfile?.name || '관리자',
          employees: payrollData.employees,
        }),
      });
      showNotification(`${payMonth} 급여가 확정되었습니다.`, 'success');
      closeEntry();
    } catch (error) {
      if (error?.message?.includes('already locked')) {
        showNotification('이미 확정된 월입니다.', 'warning');
      } else {
        showNotification(error?.message || '급여 확정에 실패했습니다.', 'error');
      }
    } finally {
      setLocking(false);
    }
  };

  const employees = payrollData?.employees ?? [];
  const totalEarnings = employees.reduce((sum, e) => sum + Number(e.totalEarnings || 0), 0);
  const isLocked = payrollData?.locked === true;

  return (
    <AppPageContainer>
      <Box sx={{ maxWidth: 960 }}>
        {/* 헤더 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h6">
              {isNew ? '급여 계산' : `급여 ${monthFromParam}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isLocked
                ? `${payrollData.lockedBy || '-'} · ${payrollData.lockedAt ? new Date(payrollData.lockedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-'} 확정`
                : '작업 기록(WorkRecord)의 CT × 수량 × 공임단가 기준으로 집계됩니다.'}
            </Typography>
          </Box>
          {isLocked && (
            <Chip label="확정됨" color="success" variant="outlined" />
          )}
        </Box>

        {/* 월 선택 (신규 모드만) */}
        {isNew && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="정산 월"
                type="month"
                value={payMonth}
                onChange={(e) => {
                  setPayMonth(e.target.value);
                  setPayrollData(null);
                }}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 200 }}
              />
              <Button
                variant="contained"
                onClick={handleCalculate}
                disabled={loading || !payMonth}
              >
                {loading ? '계산 중...' : '계산하기'}
              </Button>
            </Stack>
          </Paper>
        )}

        {/* 결과 테이블 */}
        {payrollData && (
          <>
            {employees.length === 0 ? (
              <Alert severity="info">
                {payMonth} 기간에 작업 기록이 없습니다.
              </Alert>
            ) : (
              <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 2 }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    직원별 급여 내역
                  </Typography>
                  <Chip size="small" label={`${employees.length}명`} variant="outlined" />
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>직원명</TableCell>
                        <TableCell align="right">공정 수</TableCell>
                        <TableCell align="right">급여 합계</TableCell>
                        <TableCell align="center">상세</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {employees.map((emp, idx) => {
                        const key = emp.workerId ?? `n-${idx}`;
                        const expanded = expandedWorkerId === key;
                        return (
                          <React.Fragment key={key}>
                            <TableRow
                              hover
                              sx={{ cursor: 'pointer' }}
                              onClick={() =>
                                setExpandedWorkerId((prev) => (prev === key ? null : key))
                              }
                            >
                              <TableCell sx={{ fontWeight: 600 }}>
                                {emp.workerName || '-'}
                              </TableCell>
                              <TableCell align="right">
                                {Array.isArray(emp.processes) ? emp.processes.length : 0}개
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>
                                {formatDong(emp.totalEarnings)}
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="caption" color="primary">
                                  {expanded ? '접기' : '펼치기'}
                                </Typography>
                              </TableCell>
                            </TableRow>

                            {/* 공정별 상세 */}
                            <TableRow>
                              <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                                <Collapse in={expanded} unmountOnExit>
                                  <Box
                                    sx={{
                                      px: 3,
                                      py: 1.5,
                                      bgcolor: 'grey.50',
                                      borderBottom: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  >
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>공정</TableCell>
                                          <TableCell align="right">수량</TableCell>
                                          <TableCell align="right">급여</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {(emp.processes || []).map((proc, pIdx) => (
                                          <TableRow key={pIdx}>
                                            <TableCell>
                                              {proc.processName || proc.processCode || '-'}
                                            </TableCell>
                                            <TableCell align="right">
                                              {formatNumberWithCommas(proc.totalQuantity, {
                                                fallback: '0',
                                                maximumFractionDigits: 0,
                                              })}
                                            </TableCell>
                                            <TableCell align="right">
                                              {formatDong(proc.totalEarnings)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                          합계
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {formatDong(totalEarnings)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
              </Paper>
            )}

            {/* 액션 버튼 */}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={closeEntry}>
                {isLocked ? '닫기' : '취소'}
              </Button>
              {!isLocked && employees.length > 0 && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleLock}
                  disabled={locking}
                >
                  {locking ? '처리 중...' : '급여 확정'}
                </Button>
              )}
            </Stack>
          </>
        )}

        {/* 초기 상태 (신규, 아직 계산 안 함) */}
        {isNew && !payrollData && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            월을 선택하고 '계산하기'를 클릭하면 해당 월의 작업 기록을 집계합니다.
          </Typography>
        )}

        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            데이터를 불러오는 중입니다...
          </Typography>
        )}
      </Box>
    </AppPageContainer>
  );
};

export default PayrollEntry;
