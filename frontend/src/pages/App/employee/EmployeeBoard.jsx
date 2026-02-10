import React, { useEffect, useMemo, useState } from 'react';
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
  TextField,
  MenuItem,
  Divider,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useAuth } from '../../../context/AuthContext';

const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '재직' },
  { value: 'SUSPENDED', label: '휴직' },
  { value: 'TERMINATED', label: '퇴사' },
];

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const EmployeeBoard = () => {
  const { user } = useAuth();
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [factories, setFactories] = useState([]);
  const [attrRoles, setAttrRoles] = useState([]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [myEmail, setMyEmail] = useState(user?.email || '');
  const [statusMessage, setStatusMessage] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [pendingFactoryOverrides, setPendingFactoryOverrides] = useState({});
  const [pendingRoleOverrides, setPendingRoleOverrides] = useState({});
  const [updatingMembershipIds, setUpdatingMembershipIds] = useState({});
  const [updatingEmployeeIds, setUpdatingEmployeeIds] = useState({});

  const selectedOrg = useMemo(
    () => organizations.find((org) => String(org.id) === String(selectedOrgId)),
    [organizations, selectedOrgId]
  );

  const employeeByMembership = useMemo(() => {
    const map = new Map();
    employees.forEach((item) => {
      map.set(item.orgUserId, item);
    });
    return map;
  }, [employees]);

  useEffect(() => {
    setMyEmail(user?.email || '');
  }, [user?.email]);

  const fetchOrganizations = async () => {
    try {
      const response = await fetch(`${API_BASE}/organizations`);
      const data = await response.json();
      if (response.ok) {
        setOrganizations(Array.isArray(data) ? data : []);
        if (!selectedOrgId && Array.isArray(data) && data.length > 0) {
          setSelectedOrgId(String(data[0].id));
        }
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '조직 목록을 불러오지 못했습니다.' });
    }
  };

  const fetchMemberships = async (orgId) => {
    try {
      const response = await fetch(`${API_BASE}/org-memberships?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        const list = Array.isArray(data) ? data : [];
        setPendingMembers(list.filter((item) => item.status === 'PENDING'));
        setActiveMembers(list.filter((item) => item.status !== 'PENDING' && item.status !== 'REJECTED'));
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '조직 멤버 정보를 불러오지 못했습니다.' });
    }
  };

  const fetchAttrRoles = async (orgId) => {
    if (!orgId) return;
    try {
      const response = await fetch(`${API_BASE}/attributes?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        setAttrRoles(Array.isArray(data?.roles) ? data.roles : []);
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '역할 정보를 불러오지 못했습니다.' });
    }
  };

  const fetchFactories = async (orgId, orgType) => {
    if (!orgId) return;
    if (orgType === 'BRAND') {
      setFactories([]);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/factories?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        setFactories(Array.isArray(data) ? data : []);
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '공장 정보를 불러오지 못했습니다.' });
    }
  };

  const fetchEmployees = async (orgId) => {
    if (!orgId) return;
    try {
      const response = await fetch(`${API_BASE}/employees?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        setEmployees(Array.isArray(data) ? data : []);
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '직원 정보를 불러오지 못했습니다.' });
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [API_BASE]);

  useEffect(() => {
    if (!selectedOrgId) return;
    fetchMemberships(selectedOrgId);
    fetchEmployees(selectedOrgId);
    fetchFactories(selectedOrgId, selectedOrg?.type);
    fetchAttrRoles(selectedOrgId);
  }, [selectedOrgId, selectedOrg?.type]);

  const handleApprove = async (member) => {
    if (approvingId) return;
    setApprovingId(member.id);
    setStatusMessage(null);
    const factoryId = pendingFactoryOverrides[member.id] || '';
    const roleId = pendingRoleOverrides[member.id] || '';
    if (selectedOrg?.type !== 'BRAND' && !factoryId) {
      setStatusMessage({ type: 'error', text: '승인 전에 공장을 선택해주세요.' });
      setApprovingId(null);
      return;
    }
    if (attrRoles.length > 0 && !roleId) {
      setStatusMessage({ type: 'error', text: '승인 전에 역할을 선택해주세요.' });
      setApprovingId(null);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/org-memberships/${member.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: member.role,
          approvedBy: myEmail,
          factoryId: factoryId ? Number(factoryId) : null,
          employeeRoleId: roleId ? Number(roleId) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage({ type: 'error', text: data?.error || '승인에 실패했습니다.' });
        return;
      }
      await fetchMemberships(selectedOrgId);
      await fetchEmployees(selectedOrgId);
      setStatusMessage({ type: 'success', text: '승인이 완료되었습니다.' });
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '승인 중 오류가 발생했습니다.' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (member) => {
    if (rejectingId) return;
    setRejectingId(member.id);
    setStatusMessage(null);
    try {
      const response = await fetch(`${API_BASE}/org-memberships/${member.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedBy: myEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage({ type: 'error', text: data?.error || '반려 처리에 실패했습니다.' });
        return;
      }
      await fetchMemberships(selectedOrgId);
      setStatusMessage({ type: 'success', text: '반려 처리되었습니다.' });
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '반려 처리 중 오류가 발생했습니다.' });
    } finally {
      setRejectingId(null);
    }
  };

  const handleMembershipUpdate = async (member, patch) => {
    if (!selectedOrgId) return;
    if (updatingMembershipIds[member.id]) return;
    setUpdatingMembershipIds((prev) => ({ ...prev, [member.id]: true }));
    setStatusMessage(null);
    try {
      const response = await fetch(`${API_BASE}/org-memberships/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patch,
          approvedBy: myEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage({ type: 'error', text: data?.error || '업데이트에 실패했습니다.' });
        return;
      }
      await fetchMemberships(selectedOrgId);
      await fetchEmployees(selectedOrgId);
      setStatusMessage({ type: 'success', text: '변경사항이 저장되었습니다.' });
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '업데이트 중 오류가 발생했습니다.' });
    } finally {
      setUpdatingMembershipIds((prev) => ({ ...prev, [member.id]: false }));
    }
  };

  const handleEmployeeRoleUpdate = async (member, roleId) => {
    if (!roleId) return;
    if (updatingEmployeeIds[member.id]) return;
    setUpdatingEmployeeIds((prev) => ({ ...prev, [member.id]: true }));
    setStatusMessage(null);
    try {
      const response = await fetch(`${API_BASE}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgUserId: member.id,
          roleId: Number(roleId),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage({ type: 'error', text: data?.error || '역할 변경에 실패했습니다.' });
        return;
      }
      await fetchEmployees(selectedOrgId);
      setStatusMessage({ type: 'success', text: '역할이 저장되었습니다.' });
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '역할 저장 중 오류가 발생했습니다.' });
    } finally {
      setUpdatingEmployeeIds((prev) => ({ ...prev, [member.id]: false }));
    }
  };

  const factoryOrder = useMemo(() => {
    const map = new Map();
    factories.forEach((factory, index) => {
      map.set(factory.id, index);
    });
    return map;
  }, [factories]);

  const sortedActiveMembers = useMemo(() => {
    return [...activeMembers].sort((a, b) => {
      const aFactoryId = employeeByMembership.get(a.id)?.factoryId ?? null;
      const bFactoryId = employeeByMembership.get(b.id)?.factoryId ?? null;
      const aIndex = factoryOrder.has(aFactoryId) ? factoryOrder.get(aFactoryId) : Number.MAX_SAFE_INTEGER;
      const bIndex = factoryOrder.has(bFactoryId) ? factoryOrder.get(bFactoryId) : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a.email).localeCompare(String(b.email));
    });
  }, [activeMembers, employeeByMembership, factoryOrder]);

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', mx: -1 }}>
        {pendingMembers.length > 0 && (
          <Paper variant="outlined" sx={{ p: 3, width: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              승인 대기 목록
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>이메일</TableCell>
                    <TableCell>신청일</TableCell>
                    <TableCell>역할</TableCell>
                    <TableCell>공장</TableCell>
                    <TableCell>액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{formatDate(member.requestedAt)}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={pendingRoleOverrides[member.id] || ''}
                          onChange={(e) =>
                            setPendingRoleOverrides((prev) => ({
                              ...prev,
                              [member.id]: e.target.value,
                            }))
                          }
                          disabled={attrRoles.length === 0}
                        >
                          <MenuItem value="">
                            {attrRoles.length === 0 ? '역할 없음' : '역할 선택'}
                          </MenuItem>
                          {attrRoles.map((role) => (
                            <MenuItem key={role.id} value={String(role.id)}>
                              {role.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        {selectedOrg?.type === 'BRAND' ? (
                          <Typography variant="body2" color="text.secondary">
                            공장 없음
                          </Typography>
                        ) : (
                          <TextField
                            select
                            size="small"
                            value={pendingFactoryOverrides[member.id] || ''}
                            onChange={(e) =>
                              setPendingFactoryOverrides((prev) => ({
                                ...prev,
                                [member.id]: e.target.value,
                              }))
                            }
                          >
                            <MenuItem value="">공장 선택</MenuItem>
                            {factories.map((factory) => (
                              <MenuItem key={factory.id} value={String(factory.id)}>
                                {factory.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleApprove(member)}
                            disabled={approvingId === member.id}
                          >
                            승인
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleReject(member)}
                            disabled={rejectingId === member.id}
                          >
                            반려
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        승인 대기 목록이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 3, width: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              직원 목록
            </Typography>
            {selectedOrg?.type === 'BRAND' && (
              <Typography sx={{ mb: 2 }} color="text.secondary">
                브랜드 조직은 공장 배정이 없습니다. (회원 승인까지만 진행)
              </Typography>
            )}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>공장</TableCell>
                    <TableCell>이메일</TableCell>
                    <TableCell>역할</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell>입사일</TableCell>
                    <TableCell>퇴사일</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedActiveMembers.map((member) => {
                    const employee = employeeByMembership.get(member.id);
                    const factoryName =
                      factories.find((factory) => factory.id === employee?.factoryId)?.name || '-';
                    const isUpdating = updatingMembershipIds[member.id];
                    const isUpdatingRole = updatingEmployeeIds[member.id];
                    const roleValue = employee?.roleId ? String(employee.roleId) : '';
                    const joinedAt = employee?.joinedAt || member.approvedAt;
                    const leftAt = employee?.leftAt;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>{factoryName}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={roleValue}
                            onChange={(e) => handleEmployeeRoleUpdate(member, e.target.value)}
                            disabled={isUpdatingRole || attrRoles.length === 0}
                          >
                            <MenuItem value="">
                              {attrRoles.length === 0 ? '역할 없음' : '역할 선택'}
                            </MenuItem>
                            {attrRoles.map((role) => (
                              <MenuItem key={role.id} value={String(role.id)}>
                                {role.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={member.status}
                            onChange={(e) =>
                              handleMembershipUpdate(member, { status: e.target.value })
                            }
                            disabled={isUpdating}
                          >
                            {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>{formatDate(joinedAt)}</TableCell>
                        <TableCell>{formatDate(leftAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {activeMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        승인된 직원이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
        </Paper>
      </Box>

      {statusMessage && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography color={statusMessage.type === 'error' ? 'error' : 'primary'}>
            {statusMessage.text}
          </Typography>
        </Box>
      )}
    </AppPageContainer>
  );
};

export default EmployeeBoard;
