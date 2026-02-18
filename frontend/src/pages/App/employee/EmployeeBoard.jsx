import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAuth } from '../../../context/AuthContext';
import { useApp } from '../../../context/AppContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '재직' },
  { value: 'SUSPENDED', label: '휴직' },
  { value: 'TERMINATED', label: '퇴사' },
];

const ORG_ROLE_OPTIONS = [
  { value: 'ADMIN', label: '관리자' },
  { value: 'OPERATOR', label: '운영자' },
  { value: 'ACCOUNTANT', label: '회계사' },
  { value: 'WORKER', label: '작업자' },
];

const getRoleOptionsByOrgType = (orgType) =>
  String(orgType || '').toUpperCase() === 'BRAND'
    ? ORG_ROLE_OPTIONS.filter((option) => option.value !== 'WORKER')
    : ORG_ROLE_OPTIONS;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const buildEmployeeDraft = (member, employee) => ({
  name: employee?.name || '',
  bankName: employee?.bankName || '',
  bankAccountNumber: employee?.bankAccountNumber || '',
  role: String(member?.role || 'WORKER').toUpperCase(),
  factoryId: employee?.factoryId ? String(employee.factoryId) : '',
  status: member.status,
});

const EmployeeRow = React.memo(
  ({
    member,
    employee,
    factories,
    roleOptions,
    selectedOrgType,
    isUpdating,
    onSave,
  }) => {
    const baseDraft = useMemo(() => buildEmployeeDraft(member, employee), [member, employee]);
    const [draft, setDraft] = useState(baseDraft);
    const [isDirty, setIsDirty] = useState(false);
    const joinedAt = employee?.joinedAt || member.approvedAt;
    const leftAt = employee?.leftAt;

    useEffect(() => {
      if (!isDirty) {
        setDraft(baseDraft);
      }
    }, [baseDraft, isDirty]);

    const handleDraftChange = (patch) => {
      setDraft((prev) => ({ ...prev, ...patch }));
      setIsDirty(true);
    };

    const handleSave = async () => {
      const didSave = await onSave(member, draft);
      if (didSave) {
        setIsDirty(false);
      }
    };

    return (
      <TableRow>
        <TableCell>
          {selectedOrgType === 'BRAND' ? (
            <Typography variant="body2" color="text.secondary">
              공장 없음
            </Typography>
          ) : (
            <TextField
              select
              size="small"
              value={draft.factoryId}
              onChange={(e) => handleDraftChange({ factoryId: e.target.value })}
              disabled={isUpdating}
            >
              <MenuItem value="">미지정</MenuItem>
              {factories.map((factory) => (
                <MenuItem key={factory.id} value={String(factory.id)}>
                  {factory.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </TableCell>

        <TableCell>
          <TextField
            size="small"
            value={draft.name}
            onChange={(e) => handleDraftChange({ name: e.target.value })}
            disabled={isUpdating}
          />
        </TableCell>

        <TableCell>{member.email}</TableCell>

        <TableCell>
          <TextField
            size="small"
            value={draft.bankName}
            onChange={(e) => handleDraftChange({ bankName: e.target.value })}
            disabled={isUpdating}
          />
        </TableCell>

        <TableCell>
          <TextField
            size="small"
            value={draft.bankAccountNumber}
            onChange={(e) => handleDraftChange({ bankAccountNumber: e.target.value })}
            disabled={isUpdating}
          />
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.role}
            onChange={(e) => handleDraftChange({ role: e.target.value })}
            disabled={isUpdating}
          >
            {roleOptions.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </TextField>
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.status}
            onChange={(e) => handleDraftChange({ status: e.target.value })}
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

        <TableCell>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={isUpdating || !isDirty}
          >
            저장
          </Button>
        </TableCell>
      </TableRow>
    );
  }
);

const EmployeeBoard = () => {
  const { user } = useAuth();
  const { showNotification } = useApp();

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [factories, setFactories] = useState([]);
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
    () => organizations.find((org) => String(org.id) === String(selectedOrgId)) || null,
    [organizations, selectedOrgId]
  );
  const roleOptions = useMemo(
    () => getRoleOptionsByOrgType(selectedOrg?.type),
    [selectedOrg?.type]
  );

  const employeeByMembership = useMemo(() => {
    const map = new Map();
    employees.forEach((item) => {
      map.set(item.orgMembershipId, item);
    });
    return map;
  }, [employees]);

  useEffect(() => {
    setMyEmail(user?.email || '');
  }, [user?.email]);

  useEffect(() => {
    if (!statusMessage) return;
    showNotification(statusMessage.text, statusMessage.type || 'info');
    setStatusMessage(null);
  }, [showNotification, statusMessage]);

  const fetchOrganizations = async () => {
    try {
      const data = await requestJSON('/organizations');
      const list = Array.isArray(data) ? data : [];
      setOrganizations(list);
      if (!selectedOrgId && list.length > 0) {
        setSelectedOrgId(String(list[0].id));
      }
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '조직 목록을 불러오지 못했습니다.' });
    }
  };

  const fetchMemberships = useCallback(async (orgId) => {
    try {
      const data = await requestJSON(`/org-memberships${buildQueryString({ orgId })}`);
      const list = Array.isArray(data) ? data : [];
      setPendingMembers(list.filter((item) => item.status === 'PENDING'));
      setActiveMembers(
        list.filter((item) => item.status !== 'PENDING' && item.status !== 'REJECTED')
      );
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '조직 멤버 정보를 불러오지 못했습니다.' });
    }
  }, []);

  const fetchFactories = async (orgId, orgType) => {
    if (!orgId) return;
    if (orgType === 'BRAND') {
      setFactories([]);
      return;
    }

    try {
      const data = await requestJSON(`/factories${buildQueryString({ orgId })}`);
      setFactories(Array.isArray(data) ? data : []);
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '공장 정보를 불러오지 못했습니다.' });
    }
  };

  const fetchEmployees = useCallback(async (orgId) => {
    if (!orgId) return;
    try {
      const data = await requestJSON(`/employees${buildQueryString({ orgId })}`);
      setEmployees(Array.isArray(data) ? data : []);
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '직원 정보를 불러오지 못했습니다.' });
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (!selectedOrgId) return;
    fetchMemberships(selectedOrgId);
    fetchEmployees(selectedOrgId);
    fetchFactories(selectedOrgId, selectedOrg?.type);
  }, [selectedOrgId, selectedOrg?.type, fetchMemberships, fetchEmployees]);

  const handleApprove = async (member) => {
    if (approvingId) return;
    setApprovingId(member.id);
    setStatusMessage(null);

    const factoryId = pendingFactoryOverrides[member.id] || '';
    const selectedRole = String(
      pendingRoleOverrides[member.id] || member.role || ''
    ).toUpperCase();

    if (selectedOrg?.type !== 'BRAND' && !factoryId) {
      setStatusMessage({ type: 'error', text: '승인 전에 공장을 선택해 주세요.' });
      setApprovingId(null);
      return;
    }

    if (!selectedRole) {
      setStatusMessage({ type: 'error', text: '승인 전에 역할을 선택해 주세요.' });
      setApprovingId(null);
      return;
    }

    try {
      await requestJSON(`/org-memberships/${member.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          approvedBy: myEmail,
          factoryId: factoryId ? Number(factoryId) : null,
        }),
      });

      await fetchMemberships(selectedOrgId);
      await fetchEmployees(selectedOrgId);
      setStatusMessage({ type: 'success', text: '승인을 완료했습니다.' });
    } catch (error) {
      setStatusMessage({ type: 'error', text: error?.message || '승인에 실패했습니다.' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (member) => {
    if (rejectingId) return;
    setRejectingId(member.id);
    setStatusMessage(null);

    try {
      await requestJSON(`/org-memberships/${member.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: myEmail }),
      });

      await fetchMemberships(selectedOrgId);
      setStatusMessage({ type: 'success', text: '반려 처리를 완료했습니다.' });
    } catch (error) {
      setStatusMessage({ type: 'error', text: error?.message || '반려 처리에 실패했습니다.' });
    } finally {
      setRejectingId(null);
    }
  };

  const handleEmployeeSave = useCallback(
    async (member, draft) => {
      if (updatingEmployeeIds[member.id] || updatingMembershipIds[member.id]) return false;

      setUpdatingEmployeeIds((prev) => ({ ...prev, [member.id]: true }));
      setUpdatingMembershipIds((prev) => ({ ...prev, [member.id]: true }));
      setStatusMessage(null);

      try {
        const employeePayload = {
          orgMembershipId: member.id,
          name: draft.name,
          bankName: draft.bankName,
          bankAccountNumber: draft.bankAccountNumber,
        };

        if (draft.factoryId) employeePayload.factoryId = Number(draft.factoryId);

        await requestJSON('/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(employeePayload),
        });

        if (draft.status !== member.status || draft.role !== member.role) {
          await requestJSON(`/org-memberships/${member.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: draft.status,
              role: draft.role,
              approvedBy: myEmail,
            }),
          });
        }

        await fetchEmployees(selectedOrgId);
        await fetchMemberships(selectedOrgId);
        setStatusMessage({ type: 'success', text: '직원 정보가 저장되었습니다.' });
        return true;
      } catch (error) {
        setStatusMessage({ type: 'error', text: error?.message || '직원 정보 저장에 실패했습니다.' });
        return false;
      } finally {
        setUpdatingEmployeeIds((prev) => ({ ...prev, [member.id]: false }));
        setUpdatingMembershipIds((prev) => ({ ...prev, [member.id]: false }));
      }
    },
    [fetchEmployees, fetchMemberships, myEmail, selectedOrgId, updatingEmployeeIds, updatingMembershipIds]
  );

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

      const aIndex = factoryOrder.has(aFactoryId)
        ? factoryOrder.get(aFactoryId)
        : Number.MAX_SAFE_INTEGER;
      const bIndex = factoryOrder.has(bFactoryId)
        ? factoryOrder.get(bFactoryId)
        : Number.MAX_SAFE_INTEGER;

      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a.email).localeCompare(String(b.email));
    });
  }, [activeMembers, employeeByMembership, factoryOrder]);

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h6">직원 관리</Typography>
            <TextField
              select
              size="small"
              label="조직 선택"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              {organizations.map((org) => (
                <MenuItem key={org.id} value={String(org.id)}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Paper>

        {statusMessage && (
          <Alert severity={statusMessage.type || 'info'}>{statusMessage.text}</Alert>
        )}

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
                    <TableCell>공장</TableCell>
                    <TableCell>역할</TableCell>
                    <TableCell>요청일</TableCell>
                    <TableCell>액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>

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
                            sx={{ minWidth: 150 }}
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
                            <TextField
                              select
                              size="small"
                              value={pendingRoleOverrides[member.id] || member.role || ''}
                              onChange={(e) =>
                                setPendingRoleOverrides((prev) => ({
                                  ...prev,
                                  [member.id]: e.target.value,
                                }))
                              }
                              sx={{ minWidth: 150 }}
                            >
                              {roleOptions.map((role) => (
                                <MenuItem key={role.value} value={role.value}>
                                  {role.label}
                                </MenuItem>
                              ))}
                        </TextField>
                      </TableCell>

                      <TableCell>{formatDate(member.requestedAt)}</TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleApprove(member)}
                            disabled={Boolean(approvingId) || Boolean(rejectingId)}
                          >
                            {approvingId === member.id ? '승인 중...' : '승인'}
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleReject(member)}
                            disabled={Boolean(approvingId) || Boolean(rejectingId)}
                          >
                            {rejectingId === member.id ? '반려 중...' : '반려'}
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 3, width: '100%' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            재직/퇴직 직원 목록
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>공장</TableCell>
                  <TableCell>이름</TableCell>
                  <TableCell>이메일</TableCell>
                  <TableCell>은행</TableCell>
                  <TableCell>계좌번호</TableCell>
                  <TableCell>역할</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>입사일</TableCell>
                  <TableCell>퇴사일</TableCell>
                  <TableCell>저장</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedActiveMembers.length === 0 ? (
                  <TableStatusRow colSpan={10} message="표시할 직원이 없습니다." sx={{ py: 2 }} />
                ) : (
                  sortedActiveMembers.map((member) => {
                    const employee = employeeByMembership.get(member.id) || null;
                    const isUpdating =
                      Boolean(updatingEmployeeIds[member.id]) ||
                      Boolean(updatingMembershipIds[member.id]);

                    return (
                      <EmployeeRow
                        key={member.id}
                        member={member}
                        employee={employee}
                        factories={factories}
                        roleOptions={roleOptions}
                        selectedOrgType={selectedOrg?.type}
                        isUpdating={isUpdating}
                        onSave={handleEmployeeSave}
                      />
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

export default EmployeeBoard;
