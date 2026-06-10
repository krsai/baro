import React, { useEffect, useState } from 'react';
import {
  Button,
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
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import FactoryDetail from './factoryDetail/FactoryDetail';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON } from '../../../utils/apiClient';

const FactoryList = () => {
  const [factories, setFactories] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingFactoryId, setDeletingFactoryId] = useState(null);
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();

  const text = {
    title: getUiMessage('factoryBoard.title', 'Factory', languageCode),
    addFactory: getUiMessage('factoryBoard.addFactory', 'Add Factory', languageCode),
    deleteFactory: getUiMessage('factoryBoard.deleteFactory', 'Delete Factory', languageCode),
    columnName: getUiMessage('factoryBoard.columnName', 'Factory Name', languageCode),
    columnCode: getUiMessage('factoryBoard.columnCode', '공장 코드', languageCode),
    columnAddress: getUiMessage('factoryBoard.columnAddress', 'Address', languageCode),
    columnContact: getUiMessage('factoryBoard.columnContact', 'Contact', languageCode),
    columnManager: getUiMessage('factoryBoard.columnManager', 'Manager', languageCode),
    columnWagePerSecond: getUiMessage('factoryBoard.columnWagePerSecond', 'Wage / sec', languageCode),
    columnAction: getUiMessage('factoryBoard.columnAction', 'Action', languageCode),
    loading: getUiMessage('factoryBoard.loading', 'Loading...', languageCode),
    empty: getUiMessage('factoryBoard.empty', 'No factories found.', languageCode),
    fetchError: getUiMessage('factoryBoard.fetchError', 'Failed to load factory list.', languageCode),
    saveSuccess: getUiMessage('factoryBoard.saveSuccess', 'Factory information has been saved.', languageCode),
    saveError: getUiMessage('factoryBoard.saveError', 'Failed to save factory information.', languageCode),
    deleteConfirm: getUiMessage(
      'factoryBoard.deleteConfirm',
      "Delete '{name}'?\nRelated lines, employees, and assignments will also be deleted.",
      languageCode
    ),
    deleteSuccess: getUiMessage(
      'factoryBoard.deleteSuccess',
      'Factory deleted. Lines {lineCount}, employees {employeeCount} were also deleted.',
      languageCode
    ),
    deleteError: getUiMessage('factoryBoard.deleteError', 'Failed to delete factory.', languageCode),
  };

  const formatWithParams = (template, params = {}) =>
    String(template || '').replace(/\{(\w+)\}/g, (_match, token) =>
      Object.prototype.hasOwnProperty.call(params, token) ? String(params[token] ?? '') : ''
    );

  const formatFactoryContact = (factory) => {
    const country = String(factory?.country || '').trim();
    const countryCode = String(factory?.countryCode || '').trim();
    const phoneNumber = String(factory?.phoneNumber || '').trim();
    return [country, countryCode, phoneNumber].filter(Boolean).join(' ') || '-';
  };

  const fetchFactories = async (options = {}) => {
    const isActive = options.isActive ?? (() => true);
    setLoading(true);
    try {
      const data = await requestJSON('/factories', {
      });
      if (!isActive()) return;
      setFactories(Array.isArray(data) ? data : []);
    } catch (_error) {
      if (!isActive()) return;
      showNotification(text.fetchError, 'error');
    } finally {
      if (!isActive()) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchFactories({ isActive: () => active });
    return () => {
      active = false;
    };
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
      country: savedData.country,
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
      showNotification(text.saveSuccess, 'success');
    } catch (_error) {
      showNotification(text.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFactory = async (factory, event) => {
    event?.stopPropagation?.();
    if (!factory?.id || deletingFactoryId) return;
    const confirmed = window.confirm(
      formatWithParams(text.deleteConfirm, {
        name: factory.name || text.title,
      })
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
        formatWithParams(text.deleteSuccess, {
          lineCount: deletedLines,
          employeeCount: deletedEmployees,
        }),
        'success'
      );
    } catch (error) {
      showNotification(error?.message || text.deleteError, 'error');
    } finally {
      setDeletingFactoryId(null);
    }
  };

  return (
    <AppPageContainer
      title={text.title}
      toolbar={(
        <PageToolbar
          right={(
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddClick}
            >
              {text.addFactory}
            </Button>
          )}
        />
      )}
    >
      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{text.columnName}</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 80 }}>{text.columnCode}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{text.columnAddress}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{text.columnContact}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{text.columnManager}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{text.columnWagePerSecond}</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 80, textAlign: 'center' }}>
                  {text.columnAction}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow colSpan={6} message={text.loading} />
              ) : factories.length === 0 ? (
                <TableStatusRow colSpan={7} message={text.empty} />
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
                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.main', letterSpacing: 1 }}>{factory.factoryCode || '-'}</TableCell>
                      <TableCell>{factory.address || '-'}</TableCell>
                      <TableCell>{formatFactoryContact(factory)}</TableCell>
                      <TableCell>{factory.manager || '-'}</TableCell>
                      <TableCell>{Number.isFinite(wage) ? wage.toFixed(2) : '-'}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Tooltip title={text.deleteFactory}>
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
