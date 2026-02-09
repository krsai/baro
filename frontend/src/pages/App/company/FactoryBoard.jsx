import React, { useState } from 'react';
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

// Mock Data: 초기 공장 데이터
const initialFactories = [
  {
    id: 1,
    name: '하노이 제1공장',
    address: 'Lot J5-2, Que Vo Industrial Park, Nam Son Ward, Bac Ninh City, Bac Ninh Province, Vietnam',
    countryCode: '+84',
    phoneNumber: '222-3456-7890',
    manager: '김철수',
    wageStandard: 'PT',
    wagePerSecond: 12,
  },
  {
    id: 2,
    name: '다낭 제2공장',
    address: 'Road No. 2, Hoa Khanh Industrial Zone, Lien Chieu District, Da Nang City, Vietnam',
    countryCode: '+84',
    phoneNumber: '236-9876-5432',
    manager: '이영희',
    wageStandard: 'ST',
    wagePerSecond: 15,
  },
  {
    id: 3,
    name: '호치민 제3공장',
    address: 'Tan Thuan Export Processing Zone, District 7, Ho Chi Minh City, Vietnam',
    countryCode: '+84',
    phoneNumber: '283-1122-3344',
    manager: '박민수',
    wageStandard: 'PT',
    wagePerSecond: 11,
  },
];

const FactoryList = () => {
  const [factories, setFactories] = useState(initialFactories);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState(null);

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

  const handleSave = (savedData) => {
    if (savedData.id) {
      // Update existing factory
      setFactories(factories.map((f) => (f.id === savedData.id ? savedData : f)));
    } else {
      // Add new factory
      const newFactory = { ...savedData, id: Date.now() }; // Use timestamp for temp ID
      setFactories([...factories, newFactory]);
    }
    handleDetailClose();
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
                  <TableCell>{factory.wagePerSecond ? `${factory.wagePerSecond}원` : '-'}</TableCell>
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