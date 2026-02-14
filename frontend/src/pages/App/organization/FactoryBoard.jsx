import React, { useEffect, useState } from 'react';
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
import FactoryDetail from './factoryDetail/FactoryDetail';
import { useApp } from '../../../context/AppContext';

const FactoryList = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [factories, setFactories] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showNotification } = useApp();

  const fetchFactories = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/factories`);
      const data = await response.json().catch(() => null);
      if (response.ok) {
        setFactories(Array.isArray(data) ? data : []);
      } else {
        showNotification(data?.error || 'Failed to load factories.', 'error');
      }
    } catch (_error) {
      showNotification('Failed to load factories.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactories();
  }, [API_BASE]);

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
      wageStandard: savedData.wageStandard,
      targetMonthlyWage: savedData.targetMonthlyWage,
      wagePerSecond: savedData.wagePerSecond,
    };

    try {
      const isEdit = Boolean(savedData.id);
      const response = await fetch(
        isEdit ? `${API_BASE}/factories/${savedData.id}` : `${API_BASE}/factories`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        showNotification(data?.error || 'Failed to save factory.', 'error');
        return;
      }

      if (isEdit) {
        setFactories((prev) => prev.map((factory) => (factory.id === data.id ? data : factory)));
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick}>
          Add Factory
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Factory</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Address</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Contact</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Manager</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Proposal Basis</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Wage / sec</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              )}

              {!loading && factories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    No factories found.
                  </TableCell>
                </TableRow>
              )}

              {factories.map((factory) => {
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
                    <TableCell>{`${factory.countryCode || ''} ${factory.phoneNumber || ''}`.trim() || '-'}</TableCell>
                    <TableCell>{factory.manager || '-'}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={
                          factory.wageStandard === 'ST'
                            ? 'ST Proposal'
                            : factory.wageStandard === 'PT'
                              ? 'PT Proposal'
                              : '-'
                        }
                        color={factory.wageStandard === 'ST' ? 'success' : 'warning'}
                        size="small"
                        sx={{ fontWeight: 'bold', minWidth: 90 }}
                      />
                    </TableCell>
                    <TableCell>{Number.isFinite(wage) ? wage.toFixed(2) : '-'}</TableCell>
                  </TableRow>
                );
              })}
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
    </Box>
  );
};

export default FactoryList;
