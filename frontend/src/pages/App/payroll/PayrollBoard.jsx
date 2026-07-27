import React, { useEffect, useMemo, useState } from 'react';
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
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const PAYROLL_BOARD_TEXT = {
  fetchError: {
    ko: '\uAE09\uC5EC \uC2A4\uB0C5\uC0F7 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    en: 'Failed to load payroll snapshots.',
    vi: 'Khong the tai danh sach bang luong.',
  },
  deleteConfirm: {
    ko: '{month} \uAE09\uC5EC \uC2A4\uB0C5\uC0F7\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?',
    en: 'Delete the {month} payroll snapshot?',
    vi: 'Xoa ban luu bang luong thang {month}?',
  },
  deleteSuccess: {
    ko: '{month} \uAE09\uC5EC \uC2A4\uB0C5\uC0F7\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.',
    en: 'Deleted the {month} payroll snapshot.',
    vi: 'Da xoa ban luu bang luong thang {month}.',
  },
  deleteError: {
    ko: '\uAE09\uC5EC \uC2A4\uB0C5\uC0F7 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
    en: 'Failed to delete the payroll snapshot.',
    vi: 'Khong the xoa ban luu bang luong.',
  },
  deleting: {
    ko: '\uC0AD\uC81C \uC911...',
    en: 'Deleting...',
    vi: 'Dang xoa...',
  },
};

const resolveText = (bundle, languageCode, replacements = {}) => {
  const template =
    bundle?.[languageCode] || bundle?.en || bundle?.ko || bundle?.vi || '';
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
};

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), {
    fallback: '0',
    maximumFractionDigits: 0,
  })} VND`;

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState('');
  const text = useMemo(
    () => ({
      title: getUiMessage('menu.payroll', 'Payroll', languageCode),
      add: getUiMessage('payrollBoard.add', 'Add Payroll', languageCode),
      month: getUiMessage('payrollBoard.month', 'Payroll Month', languageCode),
      employees: getUiMessage('payrollBoard.employees', 'Employees', languageCode),
      total: getUiMessage('payrollBoard.total', 'Total Payroll', languageCode),
      savedBy: getUiMessage('payrollBoard.savedBy', 'Saved By', languageCode),
      savedAt: getUiMessage('payrollBoard.savedAt', 'Saved At', languageCode),
      status: getUiMessage('payrollBoard.status', 'Status', languageCode),
      delete: getUiMessage('payrollBoard.delete', 'Delete', languageCode),
      snapshot: getUiMessage('payrollBoard.snapshot', 'Snapshot', languageCode),
      loading: getUiMessage('payrollBoard.loading', 'Loading...', languageCode),
      empty: getUiMessage('payrollBoard.empty', 'No saved payroll snapshots.', languageCode),
      peopleSuffix: getUiMessage('payrollBoard.peopleSuffix', '', languageCode),
    }),
    [languageCode]
  );

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
          showNotification(
            error?.message || resolveText(PAYROLL_BOARD_TEXT.fetchError, languageCode),
            'error'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, languageCode, showNotification]);

  const handleAdd = () => {
    navigateToPath('/payroll/new', { label: text.add });
  };

  const handleRowOpen = (snapshot) => {
    navigateToPath(`/payroll/${snapshot.month}`, {
      label: `${text.title} ${snapshot.month}`,
    });
  };

  const handleDeleteSnapshot = async (snapshot) => {
    const month = String(snapshot?.month || '').trim();
    if (!month) return;
    if (
      !window.confirm(
        resolveText(PAYROLL_BOARD_TEXT.deleteConfirm, languageCode, { month })
      )
    ) {
      return;
    }

    setDeletingMonth(month);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON(`/payroll/snapshots/${month}` + query, { method: 'DELETE' });
      setSnapshots((prev) =>
        prev.filter((row) => String(row?.month || '').trim() !== month)
      );
      showNotification(
        resolveText(PAYROLL_BOARD_TEXT.deleteSuccess, languageCode, { month }),
        'success'
      );
    } catch (error) {
      showNotification(
        error?.message || resolveText(PAYROLL_BOARD_TEXT.deleteError, languageCode),
        'error'
      );
    } finally {
      setDeletingMonth('');
    }
  };

  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';

  return (
    <AppPageContainer
      title={text.title}
      toolbar={(
        <PageToolbar
          right={(
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
              {text.add}
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
                  <TableCell sx={{ fontWeight: 700 }}>{text.month}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{text.employees}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{text.total}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{text.savedBy}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{text.savedAt}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">{text.status}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">{text.delete}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow colSpan={7} message={text.loading} />
                ) : snapshots.length === 0 ? (
                  <TableStatusRow colSpan={7} message={text.empty} />
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
                        <TableCell align="right">
                          {employees.length}{text.peopleSuffix}
                        </TableCell>
                        <TableCell align="right">{formatDong(totalEarnings)}</TableCell>
                        <TableCell>{snapshot.lockedBy || '-'}</TableCell>
                        <TableCell>
                          {snapshot.lockedAt
                            ? new Date(snapshot.lockedAt).toLocaleString(locale, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={text.snapshot} variant="outlined" />
                        </TableCell>
                        <TableCell align="center">
                          <DeleteActionButton
                            stopPropagation
                            disabled={Boolean(deletingMonth)}
                            title={
                              deletingMonth === snapshot.month
                                ? resolveText(PAYROLL_BOARD_TEXT.deleting, languageCode)
                                : text.delete
                            }
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
