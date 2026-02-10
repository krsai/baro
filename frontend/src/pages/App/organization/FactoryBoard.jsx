import React, { useEffect, useState } from 'react';
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
  Chip,
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
      const data = await response.json();
      if (response.ok) {
        setFactories(Array.isArray(data) ? data : []);
      } else {
        showNotification(data?.error || '공장 목록을 불러오지 못했습니다.', 'error');
      }
    } catch (_error) {
      showNotification('공장 목록을 불러오지 못했습니다.', 'error');
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
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || '공장 저장에 실패했습니다.', 'error');
        return;
      }

      if (isEdit) {
        setFactories((prev) => prev.map((f) => (f.id === data.id ? data : f)));
      } else {
        setFactories((prev) => [...prev, data]);
      }
      handleDetailClose();
      showNotification('공장 정보가 저장되었습니다.', 'success');
    } catch (_error) {
      showNotification('공장 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };


  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick}>
          공장 추가
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>공장명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>주소</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>관리자</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>급여 기준</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>초당 급여</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    불러오는 중...
                  </TableCell>
                </TableRow>
              )}
              {!loading && factories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    등록된 공장이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {factories.map((factory) => (
                <TableRow
                  key={factory.id}
                  hover
                  onDoubleClick={() => handleRowDoubleClick(factory)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{factory.name}</TableCell>
                  <TableCell>{factory.address}</TableCell>
                  <TableCell>{factory.countryCode} {factory.phoneNumber}</TableCell>
                  <TableCell>{factory.manager}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={factory.wageStandard || '-'}
                      color={factory.wageStandard === 'ST' ? 'success' : 'warning'}
                      size="small"
                      sx={{ fontWeight: 'bold', minWidth: 50 }}
                    />
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const raw = factory.wagePerSecond;
                      const value =
                        raw === '' || raw === null || raw === undefined ? Number.NaN : Number(raw);
                      return Number.isFinite(value) ? `${value.toFixed(2)}동` : '-';
                    })()}
                  </TableCell>
                </TableRow>
              ))}
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
