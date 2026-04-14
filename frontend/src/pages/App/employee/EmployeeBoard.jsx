import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Drawer,
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
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getPayTypeOptions } from '../../../constants/payType';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../constants/layout';
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
  'WORKER_SUPERVISOR',
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
const ORG_ROLE_SORT_ORDER = {
  ADMIN: 1,
  OPERATOR: 2,
  ACCOUNTANT: 3,
  WORKER: 4,
};

const getRoleOptionsByOrgType = (orgType) =>
  String(orgType || '').toUpperCase() === 'BRAND'
    ? ORG_ROLE_OPTIONS.filter((option) => option.value !== 'WORKER')
    : ORG_ROLE_OPTIONS;
const MEMBER_REVIEWER_ROLES = new Set(['ADMIN', 'OPERATOR']);
const LOGIN_REQUIRED_ROLES = new Set(['ADMIN', 'OPERATOR']);
const INTERNAL_MEMBER_EMAIL_PREFIX = 'emp+';
const INTERNAL_MEMBER_EMAIL_DOMAIN = 'baro.local';
const ORG_MEMBERSHIPS_UPDATED_EVENT = 'baro:org-memberships-updated';
const resolveDefaultInviteRole = (roleOptions = []) => {
  const workerOption = roleOptions.find((option) => option.value === 'WORKER');
  if (workerOption?.value) return workerOption.value;
  const firstOption = roleOptions[0];
  if (firstOption?.value) return firstOption.value;
  return 'WORKER';
};
const isInternalMemberEmail = (value) => {
  const normalized = normalizeEmail(value);
  return normalized.startsWith(INTERNAL_MEMBER_EMAIL_PREFIX)
    && normalized.endsWith(`@${INTERNAL_MEMBER_EMAIL_DOMAIN}`);
};
const getMemberUniqueCode = (memberId, orgId) => {
  const orgText = String(Math.max(0, Number(orgId) || 0)).padStart(3, '0');
  const idText = String(Math.max(0, Number(memberId) || 0)).padStart(5, '0');
  return `EMP-${orgText}-${idText}`;
};
const getMemberIdentityLabel = (member) =>
  isInternalMemberEmail(member?.email)
    ? getMemberUniqueCode(member?.id, member?.orgId)
    : String(member?.email || '-');
const isLoginRequiredRole = (role) =>
  LOGIN_REQUIRED_ROLES.has(String(role || '').toUpperCase());

const isAdminOrgRole = (value) => String(value || '').toUpperCase() === 'ADMIN';
const isWorkerOrgRole = (value) => String(value || '').toUpperCase() === 'WORKER';
const isWorkerJobRoleOption = (role) =>
  WORKER_JOB_ROLE_CODES.has(String(role?.code || '').trim().toUpperCase());
const getOrgRoleLabel = (value) => ORG_ROLE_LABELS[String(value || '').toUpperCase()] || '-';
const getOrgRoleSortOrder = (value) =>
  ORG_ROLE_SORT_ORDER[String(value || '').toUpperCase()] || Number.MAX_SAFE_INTEGER;
const getEmployeeStatusLabel = (value) =>
  EMPLOYEE_STATUS_OPTIONS.find((option) => option.value === String(value || '').toUpperCase())
    ?.label || '-';
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const emitMembershipUpdated = ({ orgId, pendingCount }) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ORG_MEMBERSHIPS_UPDATED_EVENT, {
      detail: {
        orgId: Number(orgId) || null,
        pendingCount: Number.isFinite(Number(pendingCount))
          ? Math.max(0, Number(pendingCount))
          : undefined,
      },
    })
  );
};

const sortJobRoleOptions = (rows = []) =>
  [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.name || a?.code || '').localeCompare(String(b?.name || b?.code || ''));
  });
const resolveWorkerJobSortOrder = (employee, workerRoleOrderIndex) => {
  const roleCode = String(employee?.roleCode || '').trim().toUpperCase();
  if (roleCode === 'WORKER_SUPERVISOR') return -1;

  const roleIdKey = String(employee?.roleId || '').trim();
  if (roleIdKey && workerRoleOrderIndex.byId.has(roleIdKey)) {
    return workerRoleOrderIndex.byId.get(roleIdKey);
  }
  if (roleCode && workerRoleOrderIndex.byCode.has(roleCode)) {
    return workerRoleOrderIndex.byCode.get(roleCode);
  }
  return Number.MAX_SAFE_INTEGER;
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};
const formatDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localMs = date.getTime() - date.getTimezoneOffset() * 60000;
  return new Date(localMs).toISOString().slice(0, 10);
};
const sanitizeMoneyInput = (value) => String(value ?? '').replace(/[^\d]/g, '');
const formatMoneyInput = (value) => {
  const sanitized = sanitizeMoneyInput(value);
  if (!sanitized) return '';
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('en-US');
};
const parseMoneyInput = (value) => {
  const sanitized = sanitizeMoneyInput(value);
  if (!sanitized) return null;
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};
const isValidDateInput = (value) => {
  const text = String(value || '').trim();
  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00`);
  return !Number.isNaN(date.getTime());
};
const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const resolveNameFromEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return '';
  return normalized.split('@')[0];
};

const buildEmployeeDraft = (member, employee, options = {}) => {
  const orgRole = String(member?.role || 'WORKER').toUpperCase();
  const defaultPayType = orgRole === 'WORKER' ? 'CT' : 'FIXED';
  return {
    name:
      String(employee?.name || '').trim() ||
      String(options.currentUserName || '').trim() ||
      (options.useEmailFallback ? resolveNameFromEmail(member?.email) : ''),
    bankName: employee?.bankName || '',
    bankAccountNumber: employee?.bankAccountNumber || '',
    orgRole,
    jobRoleId: employee?.roleId ? String(employee.roleId) : '',
    payType: String(employee?.payType || employee?.effectivePayType || defaultPayType).toUpperCase(),
    fixedSalary: formatMoneyInput(employee?.fixedSalary),
    factoryId: employee?.factoryId ? String(employee.factoryId) : '',
    joinedAt: formatDateInput(employee?.joinedAt || member?.approvedAt),
    leftAt: formatDateInput(employee?.leftAt),
    status: member.status,
  };
};
const getEmployeeDisplayName = (member, employee, myEmail, currentUserName) => {
  const normalizedMemberEmail = normalizeEmail(member?.email);
  return (
    String(employee?.name || '').trim() ||
    (normalizedMemberEmail === normalizeEmail(myEmail) ? String(currentUserName || '').trim() : '') ||
    '-'
  );
};

const EmployeeRow = React.memo(
  ({
    member,
    employee,
    roleOptions,
    jobRoleOptions,
    useEmailFallback,
    currentUserName,
    isBulkSaving,
    isUpdating,
    onSave,
    onRowStateChange,
  }) => {
    const { languageCode } = useLanguage();
    const baseDraft = useMemo(
      () =>
        buildEmployeeDraft(member, employee, {
          useEmailFallback,
          currentUserName,
        }),
      [currentUserName, employee, member, useEmailFallback]
    );
    const payTypeOptions = useMemo(() => getPayTypeOptions(languageCode), [languageCode]);
    const [draft, setDraft] = useState(baseDraft);
    const [isDirty, setIsDirty] = useState(false);
    const latestDraftRef = useRef(baseDraft);
    const latestEffectiveJobRoleIdRef = useRef('');
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
    useEffect(() => {
      latestDraftRef.current = draft;
    }, [draft]);
    useEffect(() => {
      latestEffectiveJobRoleIdRef.current = effectiveJobRoleId;
    }, [effectiveJobRoleId]);

    const handleDraftChange = (patch) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        latestDraftRef.current = next;
        return next;
      });
      setIsDirty(true);
    };

    const handleSave = useCallback(async () => {
      const didSave = await onSave(member, {
        ...latestDraftRef.current,
        jobRoleId: latestEffectiveJobRoleIdRef.current,
      });
      if (didSave) {
        setIsDirty(false);
      }
      return didSave;
    }, [member, onSave]);

    useEffect(() => {
      if (typeof onRowStateChange !== 'function') return undefined;
      onRowStateChange(member.id, {
        isDirty,
        save: handleSave,
      });
      return () => {
        onRowStateChange(member.id, null);
      };
    }, [handleSave, isDirty, member.id, onRowStateChange]);

    return (
      <TableRow>
        <TableCell>
          <TextField
            size="small"
            value={draft.name}
            onChange={(e) => handleDraftChange({ name: e.target.value })}
            disabled={isUpdating || isBulkSaving}
          />
        </TableCell>

        <TableCell>{member.email}</TableCell>

        <TableCell>
          <TextField
            size="small"
            value={draft.bankName}
            onChange={(e) => handleDraftChange({ bankName: e.target.value })}
            disabled={isUpdating || isBulkSaving}
          />
        </TableCell>

        <TableCell>
          <TextField
            size="small"
            value={draft.bankAccountNumber}
            onChange={(e) => handleDraftChange({ bankAccountNumber: e.target.value })}
            disabled={isUpdating || isBulkSaving}
          />
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.orgRole}
            onChange={(e) => handleDraftChange({ orgRole: e.target.value })}
            disabled={isUpdating || isBulkSaving}
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
              disabled={isUpdating || isBulkSaving}
              sx={{ minWidth: 180 }}
            >
              {jobRoleOptions.map((role) => (
                <MenuItem key={role.id} value={String(role.id)}>
                  {role.name || role.code}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.payType}
            onChange={(e) => handleDraftChange({ payType: e.target.value })}
            disabled={isUpdating || isBulkSaving}
            sx={{ minWidth: 170 }}
          >
            {payTypeOptions.map((option) => (
              <MenuItem key={option.value || 'default'} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </TableCell>

        <TableCell>
          {draft.payType === 'FIXED' ? (
            <TextField
              size="small"
              value={draft.fixedSalary}
              onChange={(e) => handleDraftChange({ fixedSalary: formatMoneyInput(e.target.value) })}
              disabled={isUpdating || isBulkSaving}
              placeholder="예: 8,000,000"
              sx={{ minWidth: 150 }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              -
            </Typography>
          )}
        </TableCell>

        <TableCell>
          <TextField
            select
            size="small"
            value={draft.status}
            onChange={(e) => handleDraftChange({ status: e.target.value })}
            disabled={isUpdating || isBulkSaving}
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
      </TableRow>
    );
  }
);

const EmployeeBoard = ({ orgId: overrideOrgId, orgType: overrideOrgType }) => {
  const {
    user,
    activeProfile,
    activeOrgId: authOrgId,
    activeOrgType: authOrgType,
    activeOrgRole,
    activeFactoryId,
  } = useAuth();
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();

  const activeOrgId = overrideOrgId != null ? overrideOrgId : authOrgId;
  const activeOrgType = overrideOrgType != null ? overrideOrgType : authOrgType;
  const myEmail = useMemo(
    () => normalizeEmail(user?.email || activeProfile?.email || ''),
    [activeProfile?.email, user?.email]
  );

  const [factories, setFactories] = useState([]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jobRoleOptions, setJobRoleOptions] = useState([]);
  const [selectedFactoryFilterId, setSelectedFactoryFilterId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [statusMessage, setStatusMessage] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [isDrawerSaving, setIsDrawerSaving] = useState(false);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('create');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [drawerEmail, setDrawerEmail] = useState('');
  const [drawerDraft, setDrawerDraft] = useState({
    name: '',
    bankName: '',
    bankAccountNumber: '',
    orgRole: 'WORKER',
    jobRoleId: '',
    payType: 'CT',
    fixedSalary: '',
    factoryId: '',
    joinedAt: '',
    leftAt: '',
    status: 'ACTIVE',
  });

  const [pendingFactoryOverrides, setPendingFactoryOverrides] = useState({});
  const [pendingRoleOverrides, setPendingRoleOverrides] = useState({});
  const [updatingMembershipIds, setUpdatingMembershipIds] = useState({});
  const [updatingEmployeeIds, setUpdatingEmployeeIds] = useState({});

  const roleOptions = useMemo(
    () => getRoleOptionsByOrgType(activeOrgType),
    [activeOrgType]
  );
  const isAdmin = overrideOrgId != null ? true : isAdminOrgRole(activeOrgRole);
  const canManageMembers =
    overrideOrgId != null ||
    MEMBER_REVIEWER_ROLES.has(String(activeOrgRole || '').toUpperCase());
  const operatorFactoryId =
    !isAdmin && Number.isInteger(Number(activeFactoryId)) && Number(activeFactoryId) > 0
      ? String(activeFactoryId)
      : '';
  const canFilterByFactory = activeOrgType !== 'BRAND' && factories.length > 0;
  const defaultPendingFactoryId = operatorFactoryId || selectedFactoryFilterId || '';
  const currentUserName = String(activeProfile?.employeeName || '').trim();
  const payTypeOptions = useMemo(() => getPayTypeOptions(languageCode), [languageCode]);

  const employeeByMembership = useMemo(() => {
    const map = new Map();
    employees.forEach((item) => {
      map.set(item.orgMembershipId, item);
    });
    return map;
  }, [employees]);
  const factoryById = useMemo(() => {
    const map = new Map();
    factories.forEach((factory) => {
      map.set(String(factory.id), factory);
    });
    return map;
  }, [factories]);

  useEffect(() => {
    if (!statusMessage) return;
    showNotification(statusMessage.text, statusMessage.type || 'info');
    setStatusMessage(null);
  }, [showNotification, statusMessage]);

  const fetchMemberships = useCallback(async (orgId) => {
    try {
      const data = await requestJSON(`/org-memberships${buildQueryString({ orgId })}`);
      const list = Array.isArray(data) ? data : [];
      const pendingList = list.filter(
        (item) => String(item?.status || '').toUpperCase() === 'PENDING'
      );
      setPendingMembers(pendingList);
      setActiveMembers(
        list.filter((item) => {
          const status = String(item?.status || '').toUpperCase();
          return status !== 'PENDING' && status !== 'REJECTED';
        })
      );
      emitMembershipUpdated({ orgId, pendingCount: pendingList.length });
    } catch (_error) {
      emitMembershipUpdated({ orgId, pendingCount: 0 });
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
          : allFactories;
      setFactories(visibleFactories);
    } catch (_error) {
      setStatusMessage({ type: 'error', text: '공장 정보를 불러오지 못했습니다.' });
    }
  }, [isAdmin, operatorFactoryId]);

  const fetchEmployees = useCallback(async (orgId, factoryId) => {
    if (!orgId) return;
    if (!isAdmin && operatorFactoryId && !factoryId && activeOrgType !== 'BRAND') {
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
  }, [activeOrgType, isAdmin, operatorFactoryId]);

  const fetchJobRoles = useCallback(async (orgId) => {
    if (!orgId) return;
    try {
      const data = await fetchAttributes({
        orgId,
        includeColors: false,
        includeCategories: false,
        includeRoles: true,
        includeProcesses: false,
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

        await Promise.all([
          fetchMemberships(activeOrgId),
          fetchEmployees(activeOrgId, selectedFactoryFilterId),
        ]);
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

  const upsertActiveMember = useCallback((nextMember) => {
    if (!nextMember || !Number.isFinite(Number(nextMember.id))) return;
    const memberId = Number(nextMember.id);
    const normalizedStatus = String(nextMember.status || '').toUpperCase();

    setPendingMembers((prev) => prev.filter((item) => Number(item?.id) !== memberId));
    setActiveMembers((prev) => {
      const filtered = prev.filter((item) => Number(item?.id) !== memberId);
      if (normalizedStatus === 'PENDING' || normalizedStatus === 'REJECTED') {
        return filtered;
      }
      return [...filtered, nextMember].sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
    });
  }, []);

  const upsertEmployeeForCurrentFilter = useCallback(
    (nextEmployee) => {
      if (!nextEmployee || !Number.isFinite(Number(nextEmployee.orgMembershipId))) return;
      const membershipId = Number(nextEmployee.orgMembershipId);
      const activeFilterId = String(selectedFactoryFilterId || '');
      const nextFactoryId = String(nextEmployee?.factoryId || '');
      const shouldInclude = !activeFilterId || nextFactoryId === activeFilterId;

      setEmployees((prev) => {
        const filtered = prev.filter(
          (item) => Number(item?.orgMembershipId) !== membershipId
        );
        if (!shouldInclude) return filtered;
        return [...filtered, nextEmployee].sort(
          (a, b) => Number(a?.id || 0) - Number(b?.id || 0)
        );
      });
    },
    [selectedFactoryFilterId]
  );

  const handleEmployeeSave = useCallback(
    async (member, draft) => {
      if (updatingEmployeeIds[member.id] || updatingMembershipIds[member.id]) return false;

      setUpdatingEmployeeIds((prev) => ({ ...prev, [member.id]: true }));
      setUpdatingMembershipIds((prev) => ({ ...prev, [member.id]: true }));
      setStatusMessage(null);

      try {
        const saveMembership = async () => {
          const hasEmailPatch = typeof draft.email === 'string';
          const normalizedMemberEmail = normalizeEmail(member?.email);
          const normalizedDraftEmail = hasEmailPatch ? normalizeEmail(draft.email) : '';
          const shouldUpdateEmail = hasEmailPatch && normalizedDraftEmail !== normalizedMemberEmail;
          if (draft.status === member.status && draft.orgRole === member.role && !shouldUpdateEmail) {
            return member;
          }
          const updatedMembership = await requestJSON(`/org-memberships/${member.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: draft.status,
              role: draft.orgRole,
              approvedBy: myEmail,
              ...(hasEmailPatch ? { email: draft.email } : {}),
            }),
          });
          return updatedMembership || member;
        };
        const shouldSaveMembershipFirst =
          draft.status !== member.status ||
          (
            draft.orgRole !== member.role &&
            draft.orgRole === 'WORKER' &&
            draft.status === 'ACTIVE'
          );
        let savedMember = member;

        if (shouldSaveMembershipFirst) {
          savedMember = await saveMembership();
        }

        const employeePayload = {
          orgMembershipId: member.id,
          name: draft.name,
          bankName: draft.bankName,
          bankAccountNumber: draft.bankAccountNumber,
          roleId: draft.orgRole === 'WORKER' && draft.jobRoleId ? Number(draft.jobRoleId) : null,
          payType: draft.payType || (draft.orgRole === 'WORKER' ? 'CT' : 'FIXED'),
          fixedSalary:
            (draft.payType || (draft.orgRole === 'WORKER' ? 'CT' : 'FIXED')) === 'FIXED'
              ? parseMoneyInput(draft.fixedSalary)
              : null,
        };

        if (draft.factoryId) employeePayload.factoryId = Number(draft.factoryId);
        if (draft.joinedAt) employeePayload.joinedAt = draft.joinedAt;
        if (draft.leftAt) employeePayload.leftAt = draft.leftAt;

        const savedEmployee = await requestJSON('/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(employeePayload),
        });

        if (!shouldSaveMembershipFirst) {
          savedMember = await saveMembership();
        }

        upsertActiveMember(savedMember);
        upsertEmployeeForCurrentFilter(savedEmployee);
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
    [
      myEmail,
      updatingEmployeeIds,
      updatingMembershipIds,
      upsertActiveMember,
      upsertEmployeeForCurrentFilter,
    ]
  );

  const defaultWorkerJobRoleId = useMemo(() => {
    const matchedRole = jobRoleOptions.find(
      (role) => String(role?.code || '').trim().toUpperCase() === DEFAULT_WORKER_JOB_ROLE_CODE
    );
    return matchedRole?.id ? String(matchedRole.id) : '';
  }, [jobRoleOptions]);

  const openAddDrawer = useCallback(() => {
    const defaultRole = resolveDefaultInviteRole(roleOptions);
    const defaultFactoryId =
      activeOrgType === 'BRAND'
        ? ''
        : !isAdmin && operatorFactoryId
          ? operatorFactoryId
          : selectedFactoryFilterId || '';
    setDrawerMode('create');
    setSelectedMemberId(null);
    setDrawerEmail('');
    setDrawerDraft({
      name: '',
      bankName: '',
      bankAccountNumber: '',
      orgRole: defaultRole,
      jobRoleId: defaultRole === 'WORKER' ? defaultWorkerJobRoleId : '',
      payType: defaultRole === 'WORKER' ? 'CT' : 'FIXED',
      fixedSalary: '',
      factoryId: defaultFactoryId,
      joinedAt: formatDateInput(new Date()),
      leftAt: '',
      status: 'ACTIVE',
    });
    setIsAddDrawerOpen(true);
  }, [
    activeOrgType,
    defaultWorkerJobRoleId,
    isAdmin,
    operatorFactoryId,
    roleOptions,
    selectedFactoryFilterId,
  ]);

  const openEditDrawer = useCallback((member) => {
    const employee = employeeByMembership.get(member.id) || null;
    const normalizedMemberEmail = normalizeEmail(member?.email);
    setDrawerMode('edit');
    setSelectedMemberId(member.id);
    setDrawerEmail(isInternalMemberEmail(member?.email) ? '' : (member.email || ''));
    setDrawerDraft(
      buildEmployeeDraft(member, employee, {
        useEmailFallback: normalizedMemberEmail === myEmail,
        currentUserName: normalizedMemberEmail === myEmail ? currentUserName : '',
      })
    );
    setIsAddDrawerOpen(true);
  }, [currentUserName, employeeByMembership, myEmail]);

  const handleDrawerDraftChange = useCallback((patch) => {
    setDrawerDraft((prev) => {
      const next = { ...prev, ...patch };
      const normalizedRole = String(next.orgRole || '').toUpperCase();
      const normalizedPayType = String(next.payType || '').toUpperCase();

      if (!isWorkerOrgRole(normalizedRole)) {
        next.jobRoleId = '';
        if (!normalizedPayType || normalizedPayType === 'CT') {
          next.payType = 'FIXED';
        }
      } else if (!normalizedPayType) {
        next.payType = 'CT';
      }

      if (String(next.payType || '').toUpperCase() !== 'FIXED') {
        next.fixedSalary = '';
      }
      return next;
    });
  }, []);

  const handleDrawerSave = useCallback(async () => {
    if (isDrawerSaving || !activeOrgId) return;

    if (!canManageMembers) {
      setStatusMessage({ type: 'error', text: '직원 수정 권한이 없습니다.' });
      return;
    }

    const normalizedOrgRole = String(drawerDraft.orgRole || '').toUpperCase();
    const normalizedName = String(drawerDraft.name || '').trim();
    const isWorker = isWorkerOrgRole(normalizedOrgRole);
    const effectiveJobRoleId = isWorker
      ? drawerDraft.jobRoleId || defaultWorkerJobRoleId
      : '';
    const normalizedPayType = String(
      drawerDraft.payType || (isWorker ? 'CT' : 'FIXED')
    ).toUpperCase();
    const normalizedStatus = String(drawerDraft.status || 'ACTIVE').toUpperCase();
    const normalizedJoinedAt = String(drawerDraft.joinedAt || '').trim();
    const normalizedLeftAt = String(drawerDraft.leftAt || '').trim();
    const normalizedDrawerEmail = normalizeEmail(drawerEmail);
    const roleNeedsLoginEmail = isLoginRequiredRole(normalizedOrgRole);
    const selectedFactoryId =
      !isAdmin && operatorFactoryId ? operatorFactoryId : drawerDraft.factoryId;

    if (normalizedDrawerEmail && !normalizedDrawerEmail.includes('@')) {
      setStatusMessage({ type: 'error', text: '유효한 이메일 형식이 아닙니다.' });
      return;
    }
    if (!normalizedName) {
      setStatusMessage({ type: 'error', text: '이름은 필수 입력입니다.' });
      return;
    }
    if (roleNeedsLoginEmail && (!normalizedDrawerEmail || !normalizedDrawerEmail.includes('@'))) {
      setStatusMessage({ type: 'error', text: '관리자/운영자는 로그인 이메일이 필요합니다.' });
      return;
    }
    if (!isValidDateInput(normalizedJoinedAt) || !isValidDateInput(normalizedLeftAt)) {
      setStatusMessage({ type: 'error', text: '입사일/퇴사일 형식이 올바르지 않습니다.' });
      return;
    }
    if (normalizedJoinedAt && normalizedLeftAt && normalizedJoinedAt > normalizedLeftAt) {
      setStatusMessage({ type: 'error', text: '퇴사일은 입사일 이후여야 합니다.' });
      return;
    }

    if (activeOrgType !== 'BRAND') {
      if (!selectedFactoryId) {
        setStatusMessage({ type: 'error', text: '공장을 선택해 주세요.' });
        return;
      }
      if (!Number.isFinite(Number(selectedFactoryId))) {
        setStatusMessage({ type: 'error', text: '유효한 공장을 선택해 주세요.' });
        return;
      }
    }

    setIsDrawerSaving(true);
    setStatusMessage(null);

    try {
      let targetMember = null;
      let membershipEmailForSave;

      if (drawerMode === 'create') {
        if (normalizedDrawerEmail) {
          const duplicatedMember = [...pendingMembers, ...activeMembers].find(
            (member) => normalizeEmail(member?.email) === normalizedDrawerEmail
          );
          if (duplicatedMember) {
            throw new Error('이미 등록된 이메일입니다. 기존 직원을 선택해 수정해 주세요.');
          }
        }

        targetMember = await requestJSON('/org-memberships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: activeOrgId,
            role: normalizedOrgRole || resolveDefaultInviteRole(roleOptions),
            ...(normalizedDrawerEmail ? { email: normalizedDrawerEmail } : {}),
            ...(activeOrgType !== 'BRAND' && selectedFactoryId
              ? { factoryId: Number(selectedFactoryId) }
              : {}),
          }),
        });
      } else {
        targetMember = activeMembers.find((member) => member.id === selectedMemberId) || null;
        if (!targetMember) {
          throw new Error('선택한 직원 정보를 찾을 수 없습니다.');
        }

        const currentMemberEmail = normalizeEmail(targetMember.email);
        if (normalizedDrawerEmail && normalizedDrawerEmail !== currentMemberEmail) {
          const duplicatedMember = [...pendingMembers, ...activeMembers].find(
            (member) =>
              member.id !== targetMember.id
              && normalizeEmail(member?.email) === normalizedDrawerEmail
          );
          if (duplicatedMember) {
            throw new Error('이미 등록된 이메일입니다.');
          }
          membershipEmailForSave = normalizedDrawerEmail;
        } else if (
          !normalizedDrawerEmail
          && roleNeedsLoginEmail
          && isInternalMemberEmail(currentMemberEmail)
        ) {
          throw new Error('관리자/운영자는 로그인 이메일이 필요합니다.');
        } else if (
          !normalizedDrawerEmail
          && !roleNeedsLoginEmail
          && !isInternalMemberEmail(currentMemberEmail)
          && currentMemberEmail
        ) {
          membershipEmailForSave = '';
        }
      }

      const didSave = await handleEmployeeSave(targetMember, {
        ...drawerDraft,
        name: normalizedName,
        orgRole: normalizedOrgRole || resolveDefaultInviteRole(roleOptions),
        jobRoleId: effectiveJobRoleId,
        payType: normalizedPayType,
        status: normalizedStatus,
        factoryId:
          activeOrgType === 'BRAND'
            ? ''
            : selectedFactoryId
              ? String(selectedFactoryId)
              : '',
        ...(typeof membershipEmailForSave === 'string'
          ? { email: membershipEmailForSave }
          : {}),
        ...(normalizedJoinedAt ? { joinedAt: normalizedJoinedAt } : {}),
        ...(normalizedLeftAt ? { leftAt: normalizedLeftAt } : {}),
      });

      if (didSave) {
        setIsAddDrawerOpen(false);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: error?.message || '직원 저장에 실패했습니다.' });
    } finally {
      setIsDrawerSaving(false);
    }
  }, [
    activeMembers,
    activeOrgId,
    activeOrgType,
    canManageMembers,
    defaultWorkerJobRoleId,
    drawerDraft,
    drawerEmail,
    drawerMode,
    handleEmployeeSave,
    isAdmin,
    isDrawerSaving,
    operatorFactoryId,
    pendingMembers,
    roleOptions,
    selectedMemberId,
  ]);

  const visibleActiveMembers = useMemo(() => {
    if (!selectedFactoryFilterId) return activeMembers;
    return activeMembers.filter((member) => {
      const employee = employeeByMembership.get(member.id);
      if (!employee) return true;
      return String(employee?.factoryId || '') === String(selectedFactoryFilterId);
    });
  }, [activeMembers, employeeByMembership, selectedFactoryFilterId]);
  const filteredActiveMembers = useMemo(() => {
    const keyword = normalizeSearchText(searchTerm);
    if (!keyword) return visibleActiveMembers;

    return visibleActiveMembers.filter((member) => {
      const employee = employeeByMembership.get(member.id) || null;
      const roleLabel = getOrgRoleLabel(member.role);
      const jobRoleLabel =
        employee?.roleName ||
        jobRoleOptions.find((role) => String(role?.id) === String(employee?.roleId))?.name ||
        '';
      const statusLabel =
        EMPLOYEE_STATUS_OPTIONS.find((option) => option.value === member.status)?.label || '';
      const factoryName =
        factoryById.get(String(employee?.factoryId || ''))?.name || '';
      const searchableText = [
        employee?.name,
        getMemberIdentityLabel(member),
        getMemberUniqueCode(member?.id, member?.orgId),
        employee?.bankName,
        employee?.bankAccountNumber,
        roleLabel,
        jobRoleLabel,
        statusLabel,
        factoryName,
      ]
        .map(normalizeSearchText)
        .join(' ');

      return searchableText.includes(keyword);
    });
  }, [employeeByMembership, factoryById, jobRoleOptions, searchTerm, visibleActiveMembers]);
  const workerRoleOrderIndex = useMemo(() => {
    const byId = new Map();
    const byCode = new Map();
    jobRoleOptions.forEach((role, index) => {
      const order = Number.isFinite(Number(role?.sortOrder))
        ? Number(role.sortOrder)
        : index + 1;
      const roleIdKey = String(role?.id || '').trim();
      const roleCodeKey = String(role?.code || '').trim().toUpperCase();
      if (roleIdKey) byId.set(roleIdKey, order);
      if (roleCodeKey) byCode.set(roleCodeKey, order);
    });
    return { byId, byCode };
  }, [jobRoleOptions]);

  const sortedActiveMembers = useMemo(() => {
    return [...filteredActiveMembers].sort((a, b) => {
      const aEmployee = employeeByMembership.get(a.id) || null;
      const bEmployee = employeeByMembership.get(b.id) || null;

      const roleOrderDiff = getOrgRoleSortOrder(a.role) - getOrgRoleSortOrder(b.role);
      if (roleOrderDiff !== 0) return roleOrderDiff;
      if (isWorkerOrgRole(a.role) && isWorkerOrgRole(b.role)) {
        const workerJobDiff =
          resolveWorkerJobSortOrder(aEmployee, workerRoleOrderIndex)
          - resolveWorkerJobSortOrder(bEmployee, workerRoleOrderIndex);
        if (workerJobDiff !== 0) return workerJobDiff;
      }

      const aJoinedAt = new Date(aEmployee?.joinedAt || a?.approvedAt || '').getTime();
      const bJoinedAt = new Date(bEmployee?.joinedAt || b?.approvedAt || '').getTime();
      const safeAJoinedAt = Number.isFinite(aJoinedAt) ? aJoinedAt : Number.MAX_SAFE_INTEGER;
      const safeBJoinedAt = Number.isFinite(bJoinedAt) ? bJoinedAt : Number.MAX_SAFE_INTEGER;
      if (safeAJoinedAt !== safeBJoinedAt) return safeAJoinedAt - safeBJoinedAt;

      const aName = getEmployeeDisplayName(a, aEmployee, myEmail, currentUserName);
      const bName = getEmployeeDisplayName(b, bEmployee, myEmail, currentUserName);
      const nameDiff = aName.localeCompare(bName, 'ko');
      if (nameDiff !== 0) return nameDiff;

      return getMemberIdentityLabel(a).localeCompare(getMemberIdentityLabel(b), 'ko');
    });
  }, [
    currentUserName,
    employeeByMembership,
    filteredActiveMembers,
    myEmail,
    workerRoleOrderIndex,
  ]);
  const isCreateDrawerMode = drawerMode === 'create';
  const selectedMember = useMemo(
    () => activeMembers.find((member) => member.id === selectedMemberId) || null,
    [activeMembers, selectedMemberId]
  );
  const drawerIsWorker = isWorkerOrgRole(drawerDraft.orgRole);
  const drawerEffectiveJobRoleId = drawerIsWorker
    ? drawerDraft.jobRoleId || defaultWorkerJobRoleId
    : '';

  return (
    <AppPageContainer
      title="직원 관리"
      titleActions={(
        canManageMembers ? (
          <Button
            variant="outlined"
            onClick={openAddDrawer}
            disabled={!activeOrgId}
          >
            직원 추가
          </Button>
        ) : null
      )}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        {statusMessage && (
          <Alert severity={statusMessage.type || 'info'}>{statusMessage.text}</Alert>
        )}

        {canManageMembers && (
          <Drawer
            anchor="right"
            open={isAddDrawerOpen}
            onClose={() => {
              if (isDrawerSaving) return;
              setIsAddDrawerOpen(false);
            }}
            PaperProps={{
              sx: {
                ...TOP_OFFSET_DRAWER_PAPER_SX,
                width: { xs: '100%', sm: 420 },
              },
            }}
          >
            <Box
              sx={{
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <Typography variant="h6">{isCreateDrawerMode ? '직원 추가' : '직원 수정'}</Typography>
              <Typography variant="caption" color="error.main">
                * 표시 항목은 필수 입력입니다.
              </Typography>
              <TextField
                size="small"
                label="로그인 이메일"
                value={drawerEmail}
                onChange={(e) => setDrawerEmail(e.target.value)}
                placeholder="admin@company.com"
                disabled={isDrawerSaving}
                autoFocus
                helperText={
                  isLoginRequiredRole(drawerDraft.orgRole)
                    ? '관리자/운영자는 로그인 이메일이 필요합니다.'
                    : '작업자/회계사는 비워두면 사번(내부키)으로 생성됩니다.'
                }
              />
              {!isCreateDrawerMode && isInternalMemberEmail(selectedMember?.email) && (
                <Typography variant="caption" color="text.secondary">
                  사번: {getMemberUniqueCode(selectedMember?.id, selectedMember?.orgId)}
                </Typography>
              )}
              <TextField
                size="small"
                label="이름"
                required
                value={drawerDraft.name}
                onChange={(e) => handleDrawerDraftChange({ name: e.target.value })}
                disabled={isDrawerSaving}
                helperText="필수 입력"
              />
              <TextField
                size="small"
                label="은행"
                value={drawerDraft.bankName}
                onChange={(e) => handleDrawerDraftChange({ bankName: e.target.value })}
                disabled={isDrawerSaving}
              />
              <TextField
                size="small"
                label="계좌번호"
                value={drawerDraft.bankAccountNumber}
                onChange={(e) => handleDrawerDraftChange({ bankAccountNumber: e.target.value })}
                disabled={isDrawerSaving}
              />
              <TextField
                select
                size="small"
                label="권한"
                value={drawerDraft.orgRole}
                onChange={(e) => handleDrawerDraftChange({ orgRole: e.target.value })}
                disabled={isDrawerSaving}
              >
                {roleOptions.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </TextField>
              {drawerIsWorker && (
                <TextField
                  select
                  size="small"
                  label="직무"
                  value={drawerEffectiveJobRoleId}
                  onChange={(e) => handleDrawerDraftChange({ jobRoleId: e.target.value })}
                  disabled={isDrawerSaving}
                >
                  {jobRoleOptions.map((role) => (
                    <MenuItem key={role.id} value={String(role.id)}>
                      {role.name || role.code}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {activeOrgType !== 'BRAND' && (
                <TextField
                  select
                  size="small"
                  label="공장"
                  required
                  value={drawerDraft.factoryId}
                  onChange={(e) => handleDrawerDraftChange({ factoryId: e.target.value })}
                  disabled={isDrawerSaving || (!isAdmin && Boolean(operatorFactoryId))}
                  helperText={
                    !isAdmin && Boolean(operatorFactoryId)
                      ? '필수 항목(내 소속 공장으로 자동 설정)'
                      : '필수 입력'
                  }
                >
                  {isAdmin && <MenuItem value="">공장 선택</MenuItem>}
                  {factories.map((factory) => (
                    <MenuItem key={factory.id} value={String(factory.id)}>
                      {factory.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                select
                size="small"
                label="급여 타입"
                value={drawerDraft.payType}
                onChange={(e) => handleDrawerDraftChange({ payType: e.target.value })}
                disabled={isDrawerSaving}
              >
                {payTypeOptions.map((option) => (
                  <MenuItem key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {String(drawerDraft.payType || '').toUpperCase() === 'FIXED' && (
                <TextField
                  size="small"
                  label="고정급 금액"
                  value={drawerDraft.fixedSalary}
                  onChange={(e) =>
                    handleDrawerDraftChange({ fixedSalary: formatMoneyInput(e.target.value) })
                  }
                  disabled={isDrawerSaving}
                  placeholder="예: 8,000,000"
                />
              )}
              <TextField
                size="small"
                type="date"
                label="입사일"
                value={drawerDraft.joinedAt || ''}
                onChange={(e) => handleDrawerDraftChange({ joinedAt: e.target.value })}
                disabled={isDrawerSaving}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                type="date"
                label="퇴사일"
                value={drawerDraft.leftAt || ''}
                onChange={(e) => handleDrawerDraftChange({ leftAt: e.target.value })}
                disabled={isDrawerSaving}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                select
                size="small"
                label="상태"
                value={drawerDraft.status}
                onChange={(e) => handleDrawerDraftChange({ status: e.target.value })}
                disabled={isDrawerSaving}
              >
                {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <Typography variant="caption" color="text.secondary">
                직원 목록에서 선택한 항목을 여기서 수정하고 저장합니다.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => setIsAddDrawerOpen(false)}
                  disabled={isDrawerSaving}
                >
                  닫기
                </Button>
                <Button
                  variant="contained"
                  onClick={handleDrawerSave}
                  disabled={isDrawerSaving || !activeOrgId}
                >
                  {isDrawerSaving
                    ? '저장 중...'
                    : isCreateDrawerMode
                      ? '직원 추가'
                      : '수정 저장'}
                </Button>
              </Box>
            </Box>
          </Drawer>
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
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                width: { xs: '100%', md: 'auto' },
                flexDirection: { xs: 'column', md: 'row' },
              }}
            >
              <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 이메일, 직무 검색"
                sx={{ width: { xs: '100%', md: 280 } }}
              />
              {canFilterByFactory && (
                <TextField
                  select
                  label="공장"
                  size="small"
                  value={selectedFactoryFilterId}
                  onChange={(e) => setSelectedFactoryFilterId(e.target.value)}
                  disabled={!isAdmin}
                  sx={{ minWidth: 220, width: { xs: '100%', md: 'auto' } }}
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
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>이름</TableCell>
                  <TableCell>이메일/사번</TableCell>
                  <TableCell>권한</TableCell>
                  <TableCell>직무</TableCell>
                  <TableCell>급여 타입</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>입사일</TableCell>
                  <TableCell>퇴사일</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedActiveMembers.length === 0 ? (
                  <TableStatusRow
                    colSpan={8}
                    message={searchTerm ? '검색 결과가 없습니다.' : '표시할 직원이 없습니다.'}
                    sx={{ py: 2 }}
                  />
                ) : (
                  sortedActiveMembers.map((member) => {
                    const employee = employeeByMembership.get(member.id) || null;
                    const roleLabel = getOrgRoleLabel(member.role);
                    const jobRoleLabel =
                      employee?.roleName ||
                      jobRoleOptions.find((role) => String(role?.id) === String(employee?.roleId))
                        ?.name ||
                      '-';
                    const payTypeValue = String(
                      employee?.effectivePayType ||
                      employee?.payType ||
                      (isWorkerOrgRole(member.role) ? 'CT' : 'FIXED')
                    ).toUpperCase();
                    const payTypeLabel =
                      payTypeOptions.find((option) => option.value === payTypeValue)?.label ||
                      payTypeValue ||
                      '-';
                    const displayName = getEmployeeDisplayName(
                      member,
                      employee,
                      myEmail,
                      currentUserName
                    );
                    return (
                      <TableRow
                        key={member.id}
                        hover
                        onClick={canManageMembers ? () => openEditDrawer(member) : undefined}
                        sx={{ cursor: canManageMembers ? 'pointer' : 'default' }}
                      >
                        <TableCell>{displayName}</TableCell>
                        <TableCell>{getMemberIdentityLabel(member)}</TableCell>
                        <TableCell>{roleLabel}</TableCell>
                        <TableCell>{jobRoleLabel}</TableCell>
                        <TableCell>{payTypeLabel}</TableCell>
                        <TableCell>{getEmployeeStatusLabel(member.status)}</TableCell>
                        <TableCell>{formatDate(employee?.joinedAt || member.approvedAt)}</TableCell>
                        <TableCell>{formatDate(employee?.leftAt)}</TableCell>
                      </TableRow>
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

