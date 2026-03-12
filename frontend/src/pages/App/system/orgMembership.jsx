import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  MenuItem,
  Button,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Chip,
  Collapse,
  IconButton,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import {
  ORG_ROLE_KEYS,
  ORG_ROLE_OPTIONS,
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS,
  ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS,
  getOrgMembershipStatusChipColor,
  getOrgMembershipStatusLabel,
  getOrgRoleLabel,
  getOrganizationSubscriptionStatusChipColor,
  getOrganizationSubscriptionStatusDescription,
  getOrganizationSubscriptionStatusLabel,
  isOrgMembershipStatusFilled,
  isOrganizationSubscriptionStatusFilled,
} from '../../../constants/organizationAccess';
import {
  ORGANIZATION_TYPE_KEYS,
  ORGANIZATION_TYPE_OPTIONS,
  getOrganizationTypeLabel,
} from '../../../constants/organizationType';

const SubscriptionChip = ({ status }) => (
  <Chip
    label={getOrganizationSubscriptionStatusLabel(status, status || '—')}
    size="small"
    color={getOrganizationSubscriptionStatusChipColor(status)}
    variant={isOrganizationSubscriptionStatusFilled(status) ? 'filled' : 'outlined'}
  />
);

const toDateInputValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const OrgMembership = () => {
  const { showNotification } = useApp();

  const [organizations, setOrganizations] = useState([]);
  const [members, setMembers] = useState([]);

  // 구독 편집
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [subEditForm, setSubEditForm] = useState({
    subscriptionStatus: '',
    membershipEmail: '',
    billingEmail: '',
    activeEndsAt: '',
  });
  const [savingSubscription, setSavingSubscription] = useState(false);

  // 조직 등록 폼
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: '',
    code: '',
    type: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
    email: '',
    subscriptionStatus: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
    membershipEmail: '',
    billingEmail: '',
    activeEndsAt: '',
    representative: '',
    address: '',
    phone: '',
    initialMemberEmail: '',
    initialMemberRole: ORG_ROLE_KEYS.ADMIN,
  });

  // 멤버 할당 폼
  const [assignForm, setAssignForm] = useState({
    orgId: '',
    email: '',
    role: ORG_ROLE_KEYS.OPERATOR,
  });

  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const data = await requestJSON('/organizations');
      const list = Array.isArray(data) ? data : [];
      setOrganizations(list);
      if (!assignForm.orgId && list.length > 0) {
        setAssignForm((prev) => ({ ...prev, orgId: String(list[0].id) }));
      }
    } catch (_error) {
      // ignore
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchMembers = async (orgId) => {
    if (!orgId) return;
    try {
      const data = await requestJSON(`/org-memberships${buildQueryString({ orgId })}`);
      setMembers(Array.isArray(data) ? data : []);
    } catch (_error) {
      // ignore
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (assignForm.orgId) {
      fetchMembers(assignForm.orgId);
    }
  }, [assignForm.orgId]);

  // --- 구독 편집 ---

  const handleEditSubscription = (org) => {
    if (editingOrgId === org.id) {
      setEditingOrgId(null);
      return;
    }
    setEditingOrgId(org.id);
    setSubEditForm({
      subscriptionStatus:
        org.subscription?.status ?? ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
      membershipEmail: org.subscription?.membershipEmail ?? '',
      billingEmail: org.subscription?.billingEmail ?? '',
      activeEndsAt: toDateInputValue(org.subscription?.activeEndsAt),
    });
  };

  const handleSubEditChange = (e) => {
    const { name, value } = e.target;
    setSubEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateSubscription = async () => {
    if (savingSubscription || !editingOrgId) return;
    if (
      subEditForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE &&
      (!subEditForm.membershipEmail.trim() || !subEditForm.billingEmail.trim())
    ) {
      showNotification('Active 상태에는 Membership Email과 Billing Email이 필요합니다.', 'error');
      return;
    }
    setSavingSubscription(true);
    try {
      const updated = await requestJSON(`/organizations/${editingOrgId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionStatus: subEditForm.subscriptionStatus,
          membershipEmail: subEditForm.membershipEmail.trim(),
          billingEmail: subEditForm.billingEmail.trim(),
          activeEndsAt:
            subEditForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
              ? subEditForm.activeEndsAt || null
              : null,
        }),
      });
      setOrganizations((prev) =>
        prev.map((org) => (org.id === editingOrgId ? updated : org))
      );
      showNotification('구독 정보가 업데이트되었습니다.', 'success');
      setEditingOrgId(null);
    } catch (error) {
      showNotification(error?.message || '구독 업데이트 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingSubscription(false);
    }
  };

  // --- 조직 등록 ---

  const handleOrgChange = (e) => {
    const { name, value } = e.target;
    setOrgForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateOrganization = async () => {
    if (savingOrg) return;
    const name = orgForm.name.trim();
    if (!name) {
      showNotification('조직명을 입력해주세요.', 'error');
      return;
    }
    if (
      orgForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE &&
      (!orgForm.membershipEmail.trim() || !orgForm.billingEmail.trim())
    ) {
      showNotification('Active 상태에는 Membership Email과 Billing Email이 필요합니다.', 'error');
      return;
    }
    setSavingOrg(true);
    try {
      const payload = {
        name,
        code: orgForm.code.trim(),
        type: orgForm.type,
        email: orgForm.email.trim(),
        subscriptionStatus: orgForm.subscriptionStatus,
        membershipEmail: orgForm.membershipEmail.trim(),
        billingEmail: orgForm.billingEmail.trim(),
        activeEndsAt:
          orgForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
            ? orgForm.activeEndsAt || null
            : null,
        representative: orgForm.representative.trim(),
        address: orgForm.address.trim(),
        phone: orgForm.phone.trim(),
      };
      const data = await requestJSON('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // 초기 관리자 이메일이 입력되어 있으면 바로 할당
      const initialEmail = orgForm.initialMemberEmail.trim();
      if (initialEmail) {
        await requestJSON('/org-memberships/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: data.id,
            email: initialEmail,
            role: orgForm.initialMemberRole,
          }),
        });
      }

      setOrganizations((prev) => [...prev, data]);
      setAssignForm((prev) => ({ ...prev, orgId: String(data.id) }));
      setOrgForm({
        name: '',
        code: '',
        type: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
        email: '',
        subscriptionStatus: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
        membershipEmail: '',
        billingEmail: '',
        activeEndsAt: '',
        representative: '',
        address: '',
        phone: '',
        initialMemberEmail: '',
        initialMemberRole: ORG_ROLE_KEYS.ADMIN,
      });
      setShowCreateForm(false);
      showNotification(
        initialEmail ? '조직이 생성되고 관리자가 할당되었습니다.' : '조직이 생성되었습니다.',
        'success'
      );
    } catch (error) {
      showNotification(error?.message || '조직 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  // --- 멤버 할당 ---

  const handleAssignChange = (e) => {
    const { name, value } = e.target;
    setAssignForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssignOperator = async () => {
    if (assigning) return;
    if (!assignForm.orgId) {
      showNotification('조직을 선택해주세요.', 'error');
      return;
    }
    const email = assignForm.email.trim();
    if (!email) {
      showNotification('이메일을 입력해주세요.', 'error');
      return;
    }
    setAssigning(true);
    try {
      await requestJSON('/org-memberships/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: Number(assignForm.orgId),
          email,
          role: assignForm.role,
        }),
      });
      setAssignForm((prev) => ({ ...prev, email: '' }));
      await fetchMembers(assignForm.orgId);
      showNotification('역할이 할당되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '역할 할당 중 오류가 발생했습니다.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            조직 · 구독 · 멤버 관리
          </Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary' }}>
            시스템 관리자 전용 — 조직을 등록하고 구독 상태와 사용자 접근 권한을 설정합니다.
          </Typography>
        </>
      }
    >
      <Grid container spacing={3} sx={{ width: '100%', m: 0 }}>

        {/* ── 1. 조직 목록 ── */}
        <Grid item xs={12} sx={{ width: '100%' }}>
          <Paper variant="outlined" sx={{ p: 3, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">조직 목록</Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowCreateForm((v) => !v)}
              >
                {showCreateForm ? '취소' : '+ 새 조직 등록'}
              </Button>
            </Box>

            {loadingOrgs ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <TableContainer sx={{ width: '100%' }}>
                <Table size="small" sx={{ width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>조직명</TableCell>
                    <TableCell>유형</TableCell>
                    <TableCell>구독 상태</TableCell>
                    <TableCell>Membership Email</TableCell>
                    <TableCell>Billing Email</TableCell>
                    <TableCell align="right">구독 편집</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {organizations.map((org) => (
                    <React.Fragment key={org.id}>
                      <TableRow hover>
                        <TableCell sx={{ color: 'text.secondary' }}>{org.id}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{org.name}</TableCell>
                        <TableCell>
                          {getOrganizationTypeLabel(org.type, org.type || '—')}
                        </TableCell>
                        <TableCell>
                          <SubscriptionChip status={org.subscription?.status} />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {org.subscription?.membershipEmail || '—'}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {org.subscription?.billingEmail || '—'}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleEditSubscription(org)}
                          >
                            {editingOrgId === org.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </TableCell>
                      </TableRow>

                      {/* 인라인 구독 편집 */}
                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                          <Collapse in={editingOrgId === org.id} unmountOnExit>
                            <Box
                              sx={{
                                p: 2,
                                backgroundColor: 'action.hover',
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                                {org.name} — 구독 상태 편집
                              </Typography>
                              <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={4}>
                                  <TextField
                                    fullWidth
                                    select
                                    size="small"
                                    label="구독 상태"
                                    name="subscriptionStatus"
                                    value={subEditForm.subscriptionStatus}
                                    onChange={handleSubEditChange}
                                  >
                                    {ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                                      <MenuItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </MenuItem>
                                    ))}
                                    </TextField>
                                </Grid>
                                {subEditForm.subscriptionStatus ===
                                ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE ? (
                                  <Grid item xs={12} sm={4}>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      type="date"
                                      label="활성 종료일"
                                      name="activeEndsAt"
                                      value={subEditForm.activeEndsAt}
                                      onChange={handleSubEditChange}
                                      InputLabelProps={{ shrink: true }}
                                      helperText="비우면 무기한"
                                    />
                                  </Grid>
                                ) : null}
                                <Grid item xs={12} sm={4}>
                                  <Typography variant="caption" color="text.secondary">
                                    {getOrganizationSubscriptionStatusDescription(
                                      subEditForm.subscriptionStatus
                                    )}
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    label="Membership Email"
                                    name="membershipEmail"
                                    value={subEditForm.membershipEmail}
                                    onChange={handleSubEditChange}
                                    placeholder="membership@domain.com"
                                  />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    label="Billing Email"
                                    name="billingEmail"
                                    value={subEditForm.billingEmail}
                                    onChange={handleSubEditChange}
                                    placeholder="billing@domain.com"
                                  />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      onClick={handleUpdateSubscription}
                                      disabled={savingSubscription}
                                      startIcon={
                                        savingSubscription ? (
                                          <CircularProgress size={14} color="inherit" />
                                        ) : null
                                      }
                                    >
                                      저장
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => setEditingOrgId(null)}
                                    >
                                      취소
                                    </Button>
                                  </Box>
                                </Grid>
                              </Grid>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {organizations.length === 0 && !loadingOrgs && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                        등록된 조직이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* 조직 등록 폼 (토글) */}
            <Collapse in={showCreateForm} unmountOnExit>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                새 조직 등록
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="조직명"
                    name="name"
                    value={orgForm.name}
                    onChange={handleOrgChange}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="조직 코드 (선택)"
                    name="code"
                    value={orgForm.code}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="조직 유형"
                    name="type"
                    value={orgForm.type}
                    onChange={handleOrgChange}
                  >
                    {ORGANIZATION_TYPE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="조직 이메일 (선택)"
                    name="email"
                    value={orgForm.email}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    select
                    label="구독 상태"
                    name="subscriptionStatus"
                    value={orgForm.subscriptionStatus}
                    onChange={handleOrgChange}
                  >
                    {ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                {orgForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE ? (
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      type="date"
                      label="활성 종료일"
                      name="activeEndsAt"
                      value={orgForm.activeEndsAt}
                      onChange={handleOrgChange}
                      InputLabelProps={{ shrink: true }}
                      helperText="비우면 무기한"
                    />
                  </Grid>
                ) : null}
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    {getOrganizationSubscriptionStatusDescription(orgForm.subscriptionStatus)}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Membership Email"
                    name="membershipEmail"
                    value={orgForm.membershipEmail}
                    onChange={handleOrgChange}
                    placeholder="membership@domain.com"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Billing Email"
                    name="billingEmail"
                    value={orgForm.billingEmail}
                    onChange={handleOrgChange}
                    placeholder="billing@domain.com"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="대표자 (선택)"
                    name="representative"
                    value={orgForm.representative}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="전화번호 (선택)"
                    name="phone"
                    value={orgForm.phone}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="주소 (선택)"
                    name="address"
                    value={orgForm.address}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Divider sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      초기 관리자 설정 (선택)
                    </Typography>
                  </Divider>
                </Grid>
                <Grid item xs={12} sm={8}>
                  <TextField
                    fullWidth
                    label="관리자 이메일 (Google 계정)"
                    name="initialMemberEmail"
                    value={orgForm.initialMemberEmail}
                    onChange={handleOrgChange}
                    placeholder="admin@gmail.com"
                    helperText="입력하면 조직 생성과 동시에 해당 이메일에 접근 권한이 부여됩니다."
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    select
                    label="역할"
                    name="initialMemberRole"
                    value={orgForm.initialMemberRole}
                    onChange={handleOrgChange}
                  >
                    {ORG_ROLE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    onClick={handleCreateOrganization}
                    disabled={savingOrg}
                    startIcon={savingOrg ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {savingOrg ? '저장 중...' : '조직 생성'}
                  </Button>
                </Grid>
              </Grid>
            </Collapse>
          </Paper>
        </Grid>

        {/* ── 2. 멤버 할당 ── */}
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              사용자 접근 권한 할당
            </Typography>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  select
                  label="조직 선택"
                  name="orgId"
                  value={assignForm.orgId}
                  onChange={handleAssignChange}
                  disabled={loadingOrgs || organizations.length === 0}
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={String(org.id)}>
                      {org.name}
                      <Box
                        component="span"
                        sx={{ ml: 1, fontSize: '0.75rem', color: 'text.secondary' }}
                      >
                        (
                        {getOrganizationSubscriptionStatusLabel(
                          org.subscription?.status ??
                            ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED
                        )}
                        )
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="사용자 이메일 (Google 계정)"
                  name="email"
                  value={assignForm.email}
                  onChange={handleAssignChange}
                  placeholder="user@gmail.com"
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField
                  fullWidth
                  select
                  label="역할"
                  name="role"
                  value={assignForm.role}
                  onChange={handleAssignChange}
                >
                  {ORG_ROLE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleAssignOperator}
                  disabled={assigning || organizations.length === 0}
                  startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {assigning ? '할당 중...' : '할당'}
                </Button>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                할당된 멤버 —{' '}
                {organizations.find((o) => String(o.id) === assignForm.orgId)?.name ?? ''}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>이메일</TableCell>
                    <TableCell>역할</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell>승인일</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{getOrgRoleLabel(member.role, member.role || '—')}</TableCell>
                      <TableCell>
                        <Chip
                          label={getOrgMembershipStatusLabel(member.status, member.status || '—')}
                          size="small"
                          color={getOrgMembershipStatusChipColor(member.status)}
                          variant={
                            isOrgMembershipStatusFilled(member.status) ? 'filled' : 'outlined'
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {member.approvedAt ? new Date(member.approvedAt).toLocaleDateString('ko-KR') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        할당된 멤버가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </AppPageContainer>
  );
};

export default OrgMembership;
