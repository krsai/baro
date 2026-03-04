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
import { fetchAttributes } from '../../../utils/attributeApi';

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

const WORKER_JOB_ROLE_CODES = new Set([
  'WORKER_CUTTING',
  'WORKER_SEWING',
  'WORKER_IRONING',
  'WORKER_INSPECTION',
  'WORKER_PACKING',
  'WORKER_OTHER',
]);
const DEFAULT_WORKER_JOB_ROLE_CODE = 'WORKER_SEWING';
const ORG_ROLE_LABELS = ORG_ROLE_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});

const PAY_TYPE_OPTIONS = [
  { value: 'CT', label: '성과급(CT)' },
  { value: 'FIXED', label: '고정급' },
];

const getRoleOptionsByOrgType = (orgType) =>
  String(orgType || '').toUpperCase() === 'BRAND'
    ? ORG_ROLE_OPTIONS.filter((option) => option.value !== 'WORKER')
    : ORG_ROLE_OPTIONS;

const isAdminOrgRole = (value) => String(value || '').toUpperCase() === 'ADMIN';
const isWorkerOrgRole = (value) => String(value || '').toUpperCase() === 'WORKER';
const isWorkerJobRoleOption = (role) =>
  WORKER_JOB_ROLE_CODES.has(String(role?.code || '').trim().toUpperCase());
const getOrgRoleLabel = (value) => ORG_ROLE_LABELS[String(value || '').toUpperCase()] || '-';

const sortJobRoleOptions = (rows = []) =>
  [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.name || a?.code || '').localeCompare(String(b?.name || b?.code || ''));
  });

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const buildEmployeeDraft = (member, employee) => ({
  name: employee?.name || '',
  bankName: employee?.bankName || '',
  bankAccountNumber: employee?.bankAccountNumber || '',
  orgRole: String(member?.role || 'WORKER').toUpperCase(),
  jobRoleId: employee?.roleId ? String(employee.roleId) : '',
  payType: String(employee?.payType || employee?.effectivePayType || 'FIXED').toUpperCase(),
  factoryId: employee?.factoryId ? String(employee.factoryId) : '',
  status: member.status,
});

const EmployeeRow = React.memo(
  ({
    member,
    employee,
    factories,
    roleOptions,
    jobRoleOptions,
    selectedOrgType,
    isUpdating,
    onSave,
  }) => {
    const baseDraft = useMemo(() => buildEmployeeDraft(member, employee), [member, employee]);
    const [draft, setDraft] = useState(baseDraft);
    const [isDirty, setIsDirty] = useState(false);
    const joinedAt = employee?.joinedAt || member.approvedAt;
    const leftAt = employee?.leftAt;
    const isWorker = isWorkerOrgRole(draft.orgRole);
    const defaultWorkerJobRoleId = useMemo(() => {
      const matchedRole = jobRoleOptions.find(
        (role) => String(role?.code || '').trim().toUpperCase() === DEFAULT_WORKER_JOB_ROLE_CODE
      );
      return matchedRole?.id ? String(matchedRole.id) : '';
    }, [jobRoleOptions]);
    const effectiveJobRoleId = isWorker ? draft.jobRoleId || defaultWorkerJobRoleId : '';

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
      const didSave = await onSave(member, {
        ...draft,
        jobRoleId: effectiveJobRoleId,
      });
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
            value={draft.orgRole}
            onChange={(e) => handleDraftChange({ orgRole: e.target.value })}
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
          {isWorker ? (
            <TextField
              select
              size="small"
              value={effectiveJobRoleId}
              onChange={(e) => handleDraftChange({ jobRoleId: e.target.value })}
              disabled={isUpdating}
              sx={{ minWidth: 180 }}
            >
              {jobRoleOptions.map((role) => (
                <MenuItem key={role.id} value={String(role.id)}>
                  {role.name || role.code}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              size="small"
              value={getOrgRoleLabel(draft.orgRole)}
              disabled
              sx={{ minWidth: 180 }}
            />
          )}
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.payType}
            onChange={(e) => handleDraftChange({ payType: e.target.value })}
            disabled={isUpdating}
            sx={{ minWidth: 170 }}
          >
            {PAY_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option.value || 'default'} value={option.value}>
                {option.label}
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
          {draft.status === 'TERMINATED' && (
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              퇴사 처리 시 기존 생산/급여 집계 데이터는 보존됩니다.
            </Typography>
          )}
          {member.status === 'TERMINATED' && draft.status === 'ACTIVE' && (
            <Typography variant="caption" color="primary" display="block" mt={0.5}>
              재입사 처리됩니다. 저장 후 라인 배정을 확인해주세요.
            </Typography>
          )}
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
  const { user, activeOrgId, activeOrgType, activeOrgRole, activeFactoryId } = useAuth();
  const { showNotification } = useApp();

  const [factories, setFactories] = useState([]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jobRoleOptions, setJobRoleOptions] = useState([]);
  const [myEmail, setMyEmail] = useState(user?.email || '');
  const [selectedFactoryFilterId, setSelectedFactoryFilterId] = useState('');

  const [statusMessage, setStatusMessage] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);

  const [pendingFactoryOverrides, setPendingFactoryOverrides] = useState({});
  const [pendingRoleOverrides, setPendingRoleOverrides] = useState({});
  const [updatingMembershipIds, setUpdatingMembershipIds] = useState({});
  const [updatingEmployeeIds, setUpdatingEmployeeIds] = useState({});

  const roleOptions = useMemo(
    () => getRoleOptionsByOrgType(activeOrgType),
    [activeOrgType]
  );
  const isAdmin = isAdminOrgRole(activeOrgRole);
  const operatorFactoryId =
    !isAdmin && Number.isInteger(Number(activeFactoryId)) && Number(activeFactoryId) > 0
      ? String(activeFactoryId)
      : '';
  const canFilterByFactory = activeOrgType !== 'BRAND' && factories.length > 0;
  const defaultPendingFactoryId = operatorFactoryId || selectedFactoryFilterId || '';
  const selectedFactoryFilter = useMemo(
    () => factories.find((factory) => String(factory?.id) === String(selectedFactoryFilterId)) || null,
    [factories, selectedFactoryFilterId]
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

  const fetchFactories = useCallback(async (orgId, orgType) => {
    if (!orgId) return;
    if (orgType === 'BRAND') {
      setFactories([]);
      return;
    }

    try {
      const data = await requestJSON(`/factories${buildQueryString({ orgId })}`);
      const allFactories = Array.isArray(data) ? data : [];
      const visibleFactories = isAdmin
        ? allFactories
        : operatorFactoryId
          ? allFactories.filter((factory) => String(factory?.id) === operatorFactoryId)
          : [];
      setFactories(visibleFactories);
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '공장 정보를 불러오지 못했습니다.' });
    }
  }, [isAdmin, operatorFactoryId]);

  const fetchEmployees = useCallback(async (orgId, factoryId) => {
    if (!orgId) return;
    if (!isAdmin && !factoryId && activeOrgType !== 'BRAND') {
      setEmployees([]);
      return;
    }
    try {
      const data = await requestJSON(
        `/employees${buildQueryString({ orgId, factoryId: factoryId || undefined })}`
      );
      setEmployees(Array.isArray(data) ? data : []);
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '직원 정보를 불러오지 못했습니다.' });
    }
  }, [activeOrgType, isAdmin]);

  const fetchJobRoles = useCallback(async (orgId) => {
    if (!orgId) return;
    try {
      const data = await fetchAttributes({
        orgId,
        skipGlobalLoading: true,
      });
      const roles = Array.isArray(data?.roles) ? data.roles : [];
      setJobRoleOptions(sortJobRoleOptions(roles.filter(isWorkerJobRoleOption)));
    } catch (_error) {
      setJobRoleOptions([]);
      setStatusMessage({ type: 'error', text: '직무 정보를 불러오지 못했습니다.' });
    }
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    fetchMemberships(activeOrgId);
    fetchFactories(activeOrgId, activeOrgType);
    fetchJobRoles(activeOrgId);
  }, [activeOrgId, activeOrgType, fetchMemberships, fetchEmployees, fetchFactories, fetchJobRoles]);

  useEffect(() => {
    if (activeOrgType === 'BRAND') {
      setSelectedFactoryFilterId('');
      return;
    }
    if (!canFilterByFactory) {
      if (!isAdmin) {
        setSelectedFactoryFilterId(operatorFactoryId);
      }
      return;
    }
    if (!isAdmin) {
      setSelectedFactoryFilterId(operatorFactoryId);
      return;
    }
    setSelectedFactoryFilterId((prev) => {
      if (!prev) return '';
      const exists = factories.some((factory) => String(factory?.id) === String(prev));
      return exists ? prev : '';
    });
  }, [activeOrgType, canFilterByFactory, factories, isAdmin, operatorFactoryId]);

  useEffect(() => {
    if (!activeOrgId) return;
    fetchEmployees(activeOrgId, selectedFactoryFilterId);
  }, [activeOrgId, fetchEmployees, selectedFactoryFilterId]);

  const handleApprove = useCallback(
    async (member) => {
      if (approvingId) return;
      setApprovingId(member.id);
      setStatusMessage(null);

      const factoryId = pendingFactoryOverrides[member.id] || defaultPendingFactoryId || '';
      const selectedRole = String(
        pendingRoleOverrides[member.id] || member.role || ''
      ).toUpperCase();

      if (activeOrgType !== 'BRAND' && !factoryId) {
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

        await fetchMemberships(activeOrgId);
        await fetchEmployees(activeOrgId, selectedFactoryFilterId);
        setStatusMessage({ type: 'success', text: '승인을 완료했습니다.' });
      } catch (error) {
        setStatusMessage({ type: 'error', text: error?.message || '승인에 실패했습니다.' });
      } finally {
        setApprovingId(null);
      }
    },
    [
      activeOrgId,
      activeOrgType,
      approvingId,
      defaultPendingFactoryId,
      fetchEmployees,
      fetchMemberships,
      myEmail,
      pendingFactoryOverrides,
      pendingRoleOverrides,
      selectedFactoryFilterId,
    ]
  );

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

      await fetchMemberships(activeOrgId);
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
        const saveMembership = async () => {
          if (draft.status === member.status && draft.orgRole === member.role) return;
          await requestJSON(`/org-memberships/${member.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: draft.status,
              role: draft.orgRole,
              approvedBy: myEmail,
            }),
          });
        };
        const shouldSaveMembershipFirst =
          draft.orgRole !== member.role &&
          draft.orgRole === 'WORKER' &&
          draft.status === 'ACTIVE';

        if (shouldSaveMembershipFirst) {
          await saveMembership();
        }

        const employeePayload = {
          orgMembershipId: member.id,
          name: draft.name,
          bankName: draft.bankName,
          bankAccountNumber: draft.bankAccountNumber,
          roleId: draft.orgRole === 'WORKER' && draft.jobRoleId ? Number(draft.jobRoleId) : null,
          payType: draft.payType || 'FIXED',
        };

        if (draft.factoryId) employeePayload.factoryId = Number(draft.factoryId);

        await requestJSON('/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(employeePayload),
        });

        if (!shouldSaveMembershipFirst) {
          await saveMembership();
        }

        await fetchEmployees(activeOrgId, selectedFactoryFilterId);
        await fetchMemberships(activeOrgId);
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
    [activeOrgId, fetchEmployees, fetchMemberships, myEmail, selectedFactoryFilterId, updatingEmployeeIds, updatingMembershipIds]
  );

  const factoryOrder = useMemo(() => {
    const map = new Map();
    factories.forEach((factory, index) => {
      map.set(factory.id, index);
    });
    return map;
  }, [factories]);

  const visibleActiveMembers = useMemo(() => {
    if (!selectedFactoryFilterId) return activeMembers;
    return activeMembers.filter((member) => {
      const employee = employeeByMembership.get(member.id);
      return String(employee?.factoryId || '') === String(selectedFactoryFilterId);
    });
  }, [activeMembers, employeeByMembership, selectedFactoryFilterId]);

  const sortedActiveMembers = useMemo(() => {
    return [...visibleActiveMembers].sort((a, b) => {
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
  }, [employeeByMembership, factoryOrder, visibleActiveMembers]);

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        {statusMessage && (
          <Alert severity={statusMessage.type || 'info'}>{statusMessage.text}</Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            직원 관리
          </Typography>
          {canFilterByFactory && (
            <TextField
              select
              label="공장"
              size="small"
              value={selectedFactoryFilterId}
              onChange={(e) => setSelectedFactoryFilterId(e.target.value)}
              disabled={!isAdmin}
              sx={{ minWidth: 220 }}
            >
              {isAdmin && <MenuItem value="">전체 공장</MenuItem>}
              {factories.map((factory) => (
                <MenuItem key={factory.id} value={String(factory.id)}>
                  {factory.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

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
                      <TableCell>권한</TableCell>
                      <TableCell>요청일</TableCell>
                      <TableCell>액션</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                  {pendingMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>

                      <TableCell>
                        {activeOrgType === 'BRAND' ? (
                          <Typography variant="body2" color="text.secondary">
                            공장 없음
                          </Typography>
                        ) : (
                          <TextField
                            select
                            size="small"
                            value={pendingFactoryOverrides[member.id] || defaultPendingFactoryId}
                            onChange={(e) =>
                              setPendingFactoryOverrides((prev) => ({
                                ...prev,
                                [member.id]: e.target.value,
                              }))
                            }
                            disabled={!isAdmin}
                            sx={{ minWidth: 150 }}
                          >
                            {isAdmin && <MenuItem value="">공장 선택</MenuItem>}
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
          <Box
            sx={{
              mb: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              flexDirection: { xs: 'column', md: 'row' },
              gap: 1,
            }}
          >
            <Typography variant="h6">
              재직/퇴직 직원 목록
            </Typography>
            {selectedFactoryFilter && (
              <Typography variant="body2" color="text.secondary">
                {selectedFactoryFilter.name}
              </Typography>
            )}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>공장</TableCell>
                  <TableCell>이름</TableCell>
                  <TableCell>이메일</TableCell>
                  <TableCell>은행</TableCell>
                  <TableCell>계좌번호</TableCell>
                  <TableCell>권한</TableCell>
                  <TableCell>직무</TableCell>
                  <TableCell>급여 타입</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>입사일</TableCell>
                  <TableCell>퇴사일</TableCell>
                  <TableCell>저장</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedActiveMembers.length === 0 ? (
                  <TableStatusRow colSpan={12} message="표시할 직원이 없습니다." sx={{ py: 2 }} />
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
                        jobRoleOptions={jobRoleOptions}
                        selectedOrgType={activeOrgType}
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
