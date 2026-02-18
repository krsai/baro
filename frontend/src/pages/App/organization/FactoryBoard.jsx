import React, { useEffect, useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AppPageContainer from '../../../components/AppPageContainer';
import PageSectionHeader from '../../../components/PageSectionHeader';
import TableStatusRow from '../../../components/TableStatusRow';
import FactoryDetail from './factoryDetail/FactoryDetail';
import { useApp } from '../../../context/AppContext';
import { requestJSON } from '../../../utils/apiClient';

const FactoryList = () => {
  const [factories, setFactories] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingFactoryId, setDeletingFactoryId] = useState(null);
  const { showNotification } = useApp();

  const fetchFactories = async () => {
    setLoading(true);
    try {
      const data = await requestJSON('/factories');
      setFactories(Array.isArray(data) ? data : []);
    } catch (_error) {
      showNotification('공장 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactories();
  }, []);

  const handleAddClick = () => {
    setSelectedFactory(null);
    setIsDetailOpen(true);
  };

  const handleRowDoubleClick = (factory) => {
    setSelectedFactory(factory);
    setIsDetailOpen(true);
  };

  const handleDetailClose = () => {
    setIsDetailOpen(false);
    setSelectedFactory(null);
  };

  const handleSave = async (savedData) => {
    if (saving) return;
    setSaving(true);

    const payload = {
      name: savedData.name,
      address: savedData.address,
      countryCode: savedData.countryCode,
      phoneNumber: savedData.phoneNumber,
      manager: savedData.manager,
      targetMonthlyWage: savedData.targetMonthlyWage,
      wagePerSecond: savedData.wagePerSecond,
    };

    try {
      const isEdit = Boolean(savedData.id);
      const data = await requestJSON(
        isEdit ? `/factories/${savedData.id}` : '/factories',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (isEdit) {
        setFactories((prev) =>
          prev.map((factory) => (factory.id === data.id ? data : factory))
        );
      } else {
        setFactories((prev) => [...prev, data]);
      }

      handleDetailClose();
      showNotification('공장 정보를 저장했습니다.', 'success');
    } catch (_error) {
      showNotification('공장 정보 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFactory = async (factory, event) => {
    event?.stopPropagation?.();
    if (!factory?.id || deletingFactoryId) return;
    const confirmed = window.confirm(
      `'${factory.name || '공장'}'를 삭제하시겠습니까?\n관련 라인/직원/라인배정도 함께 삭제됩니다.`
    );
    if (!confirmed) return;

    setDeletingFactoryId(factory.id);
    try {
      const result = await requestJSON(`/factories/${factory.id}`, {
        method: 'DELETE',
      });
      setFactories((prev) => prev.filter((item) => item.id !== factory.id));
      if (selectedFactory?.id === factory.id) {
        handleDetailClose();
      }
      const deletedEmployees = Number(result?.deletedEmployees) || 0;
      const deletedLines = Number(result?.deletedLines) || 0;
      showNotification(
        `공장을 삭제했습니다. 라인 ${deletedLines}개, 직원 ${deletedEmployees}명도 함께 삭제되었습니다.`,
        'success'
      );
    } catch (error) {
      showNotification(error?.message || '공장 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingFactoryId(null);
    }
  };

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="공장 관리"
          actionLabel="공장 추가"
          actionIcon={<AddIcon />}
          onAction={handleAddClick}
        />
      }
    >
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>공장명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>주소</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>관리자</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>초당 급여</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 80, textAlign: 'center' }}>
                  관리
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow colSpan={6} message="불러오는 중..." />
              ) : factories.length === 0 ? (
                <TableStatusRow colSpan={6} message="등록된 공장이 없습니다." />
              ) : (
                factories.map((factory) => {
                  const rawWage = factory.wagePerSecond;
                  const wage =
                    rawWage === '' || rawWage === null || rawWage === undefined
                      ? Number.NaN
                      : Number(rawWage);

                  return (
                    <TableRow
                      key={factory.id}
                      hover
                      onDoubleClick={() => handleRowDoubleClick(factory)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{factory.name || '-'}</TableCell>
                      <TableCell>{factory.address || '-'}</TableCell>
                      <TableCell>
                        {`${factory.countryCode || ''} ${factory.phoneNumber || ''}`.trim() || '-'}
                      </TableCell>
                      <TableCell>{factory.manager || '-'}</TableCell>
                      <TableCell>{Number.isFinite(wage) ? wage.toFixed(2) : '-'}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Tooltip title="공장 삭제">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(event) => handleDeleteFactory(factory, event)}
                              disabled={deletingFactoryId === factory.id}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <FactoryDetail
        open={isDetailOpen}
        onClose={handleDetailClose}
        onSave={handleSave}
        factory={selectedFactory}
      />
    </AppPageContainer>
  );
};

export default FactoryList;
