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
      showNotification('Failed to load factories.', 'error');
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
      showNotification('Factory saved.', 'success');
    } catch (_error) {
      showNotification('Failed to save factory.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFactory = async (factory, event) => {
    event?.stopPropagation?.();
    if (!factory?.id || deletingFactoryId) return;
    const confirmed = window.confirm(
      `'${factory.name || 'Factory'}'를 삭제하시겠습니까?\n관련 라인/직원/라인배정도 함께 삭제됩니다.`
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
        `Factory deleted. lines: ${deletedLines}, employees: ${deletedEmployees}`,
        'success'
      );
    } catch (error) {
      showNotification(error?.message || 'Failed to delete factory.', 'error');
    } finally {
      setDeletingFactoryId(null);
    }
  };

  return (
    <AppPageContainer
      header={
        <PageSectionHeader
          title="Factories"
          actionLabel="Add Factory"
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
                <TableCell sx={{ fontWeight: 'bold' }}>Factory</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Address</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Contact</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Manager</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Wage / sec</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 80, textAlign: 'center' }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow colSpan={6} message="Loading..." />
              ) : factories.length === 0 ? (
                <TableStatusRow colSpan={6} message="No factories found." />
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
                        <Tooltip title="Delete factory">
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
