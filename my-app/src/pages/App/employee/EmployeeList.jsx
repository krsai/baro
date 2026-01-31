import React, { useState, useMemo } from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useApp } from '../../../context/AppContext';
import SearchInput from '../../../components/SearchInput';

// Mock Data
const mockEmployees = [
  { id: 1, factoryId: 3, name: '김철수', roleId: 1, phone: '010-1234-5678' },
  { id: 2, factoryId: 3, name: '이영희', roleId: 4, phone: '010-2345-6789' },
];

const EmployeeList = () => {
  const { factories, roles, navigateToPath } = useApp();
  const [employees] = useState(mockEmployees);

  const [searchKeyword, setSearchKeyword] = useState('');

  const filteredEmployees = useMemo(() => {
    if (!searchKeyword.trim()) {
      return employees;
    }
    const keyword = searchKeyword.toLowerCase();
    return employees.filter((employee) => {
      const factory = factories.find((f) => f.id === employee.factoryId);
      const role = roles.find((r) => r.id === employee.roleId);
      const factoryName = factory?.name || '';
      const roleName = role?.name || '';
      return (
        employee.name.toLowerCase().includes(keyword) ||
        factoryName.toLowerCase().includes(keyword) ||
        roleName.toLowerCase().includes(keyword)
      );
    });
  }, [employees, searchKeyword, factories, roles]);

  const handleAddEmployee = () => {
    navigateToPath('/employee/new', { label: '새 직원' });
  };

  const handleRowDoubleClick = (employee) => {
    navigateToPath(`/employee/${employee.id}`, { label: `직원: ${employee.name}` });
  };

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SearchInput
          placeholder="이름, 소속, 역할로 검색..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddEmployee}
        >
          직원 추가
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ width: '100%' }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>소속(공장)</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>이름</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>역할</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEmployees.map((employee) => {
              const factory = factories.find((f) => f.id === employee.factoryId);
              const role = roles.find((r) => r.id === employee.roleId);
              return (
                <TableRow
                  key={employee.id}
                  hover
                  onDoubleClick={() => handleRowDoubleClick(employee)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{factory?.name || '-'}</TableCell>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell>{role?.name || '-'}</TableCell>
                  <TableCell>{employee.phone}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredEmployees.length === 0 && (
        <Box sx={{ width: '100%', textAlign: 'center', py: 5 }}>
          <Typography color="text.secondary">
            {searchKeyword ? '검색 결과가 없습니다.' : '직원 정보가 없습니다.'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default EmployeeList;
