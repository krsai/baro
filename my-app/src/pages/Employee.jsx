import React, { useState, useMemo } from 'react';
import {
  Container,
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
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useApp } from '../context/AppContext';

const Employee = () => {
  const { factories, roles } = useApp();
  const [employees, setEmployees] = useState([
    { id: 1, factoryId: 3, name: '김철수', roleId: 1, phone: '010-1234-5678' },
    { id: 2, factoryId: 3, name: '이영희', roleId: 4, phone: '010-2345-6789' },
  ]);

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
    // 나중에 추가 기능 구현
    console.log('사원 추가');
  };

  return (
    <Container component="main" maxWidth="lg">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 3 }}>
          <Typography component="h1" variant="h4">
            직원 관리
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddEmployee}
          >
            직원 추가
          </Button>
        </Box>

        <Box sx={{ width: '100%', mb: 2 }}>
          <TextField
            fullWidth
            placeholder="이름, 소속, 역할로 검색..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
            }}
            size="small"
            sx={{ maxWidth: 400 }}
          />
        </Box>

        <TableContainer component={Paper} sx={{ width: '100%' }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>소속(공장)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>이름</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>직책(직종)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.map((employee) => {
                const factory = factories.find((f) => f.id === employee.factoryId);
                const role = roles.find((r) => r.id === employee.roleId);
                return (
                  <TableRow key={employee.id} hover sx={{ '&:hover': { backgroundColor: '#fafafa' } }}>
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
    </Container>
  );
};

export default Employee;
