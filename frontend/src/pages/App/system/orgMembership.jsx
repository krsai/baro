import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import { getUiMessage } from '../../../constants/uiMessages';
import {
  ORG_ROLE_KEYS,
  ORG_ROLE_OPTIONS,
  ORGANIZATION_SUBSCRIPTION_STATUS_KEYS,
  ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS,
  getOrganizationSubscriptionStatusChipColor,
  getOrganizationSubscriptionStatusDescription,
  getOrganizationSubscriptionStatusLabel,
  isOrganizationSubscriptionStatusFilled,
} from '../../../constants/organizationAccess';
import { ORGANIZATION_TYPE_KEYS } from '../../../constants/organizationType';
import {
  getStaticOptionLabel,
  getStaticOptionOptions,
} from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON } from '../../../utils/apiClient';

const PAGE_MESSAGES = {
  summary: {
    ko: '과금 기준은 회사의 BARO 구독 상태입니다. 직원 수, 직무, 역할은 과금 기준이 아닙니다.',
    en: 'Billing is based only on the company subscription. Employee count, job, and role are not billing factors.',
    vi: 'Chi phi chi duoc tinh theo goi dich vu cua cong ty. So nhan vien, chuc vu va vai tro khong phai tieu chi tinh phi.',
  },
  companyList: { ko: '회사 목록', en: 'Organizations', vi: 'Danh sach cong ty' },
  addOrganization: { ko: '회사 추가', en: 'Add Organization', vi: 'Them cong ty' },
  closeCreateForm: { ko: '추가 닫기', en: 'Close Form', vi: 'Dong form' },
  noOrganizations: { ko: '등록된 회사가 없습니다.', en: 'No organizations found.', vi: 'Chua co cong ty nao.' },
  createTitle: { ko: '회사 등록', en: 'Create Organization', vi: 'Tao cong ty' },
  editTitle: { ko: '구독 편집', en: 'Edit Subscription', vi: 'Sua goi dich vu' },
  status: { ko: '구독 상태', en: 'Subscription Status', vi: 'Trang thai goi dich vu' },
  serviceContactEmail: { ko: '서비스 담당 이메일', en: 'Service Contact Email', vi: 'Email phu trach dich vu' },
  billingEmail: { ko: '청구 이메일', en: 'Billing Email', vi: 'Email thanh toan' },
  activeEndsAt: { ko: '활성 종료일', en: 'Active Until', vi: 'Het han hoat dong' },
  activeEndsAtHelper: { ko: '비우면 무기한으로 유지됩니다.', en: 'Leave empty for no end date.', vi: 'De trong neu khong co ngay ket thuc.' },
  companyName: { ko: '회사명', en: 'Organization Name', vi: 'Ten cong ty' },
  companyCode: { ko: '회사 코드', en: 'Organization Code', vi: 'Ma cong ty' },
  companyType: { ko: '회사 유형', en: 'Organization Type', vi: 'Loai cong ty' },
  companyEmail: { ko: '회사 이메일', en: 'Organization Email', vi: 'Email cong ty' },
  representative: { ko: '대표자', en: 'Representative', vi: 'Nguoi dai dien' },
  phone: { ko: '전화번호', en: 'Phone', vi: 'So dien thoai' },
  address: { ko: '주소', en: 'Address', vi: 'Dia chi' },
  actions: { ko: '작업', en: 'Actions', vi: 'Tac vu' },
  optionalAccessSection: { ko: '초기 관리자 할당', en: 'Initial Admin Assignment', vi: 'Gan quan tri ban dau' },
  optionalAccessHelper: { ko: '이 섹션은 접근 권한 설정용입니다. 회사 과금과는 무관합니다.', en: 'This section is only for access control. It does not affect company billing.', vi: 'Phan nay chi dung de cap quyen truy cap. Khong anh huong den phi cua cong ty.' },
  initialAdminEmail: { ko: '초기 관리자 이메일', en: 'Initial Admin Email', vi: 'Email quan tri ban dau' },
  initialAdminRole: { ko: '초기 관리자 역할', en: 'Initial Admin Role', vi: 'Vai tro ban dau' },
  companyRequired: { ko: '회사명을 입력해주세요.', en: 'Organization name is required.', vi: 'Hay nhap ten cong ty.' },
  activeEmailsRequired: { ko: '활성 구독은 서비스 담당 이메일과 청구 이메일이 필요합니다.', en: 'Active subscriptions require both a service contact email and a billing email.', vi: 'Goi dang hoat dong can email phu trach dich vu va email thanh toan.' },
  subscriptionUpdated: { ko: '구독 정보가 저장되었습니다.', en: 'Subscription saved.', vi: 'Da luu thong tin goi dich vu.' },
  subscriptionUpdateError: { ko: '구독 정보를 저장하지 못했습니다.', en: 'Failed to save the subscription.', vi: 'Khong the luu thong tin goi dich vu.' },
  organizationCreated: { ko: '회사가 등록되었습니다.', en: 'Organization created.', vi: 'Da tao cong ty.' },
  organizationCreatedWithAdmin: { ko: '회사 등록과 함께 초기 관리자 권한을 할당했습니다.', en: 'Organization created and the initial admin was assigned.', vi: 'Da tao cong ty va gan quan tri ban dau.' },
  organizationCreateError: { ko: '회사를 등록하지 못했습니다.', en: 'Failed to create the organization.', vi: 'Khong the tao cong ty.' },
  emptyCell: { ko: '—', en: '—', vi: '—' },
};

const resolveMessage = (value, languageCode) =>
  (value && typeof value === 'object' && (value[languageCode] || value.ko || value.en || value.vi)) ||
  '';

const getPageMessage = (key, languageCode) => resolveMessage(PAGE_MESSAGES[key], languageCode);

const SubscriptionChip = ({ status, languageCode }) => (
  <Chip
    label={getOrganizationSubscriptionStatusLabel(status, status || '—', languageCode)}
    size="small"
    color={getOrganizationSubscriptionStatusChipColor(status)}
    variant={isOrganizationSubscriptionStatusFilled(status) ? 'filled' : 'outlined'}
  />
);

const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatDateCell = (value, languageCode) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = languageCode === 'vi' ? 'vi-VN' : languageCode === 'en' ? 'en-US' : 'ko-KR';
  return date.toLocaleDateString(locale);
};

const createEmptySubscriptionForm = () => ({
  subscriptionStatus: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
  serviceContactEmail: '',
  billingEmail: '',
  activeEndsAt: '',
});

const createEmptyOrgForm = () => ({
  name: '',
  code: '',
  type: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  email: '',
  subscriptionStatus: ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
  serviceContactEmail: '',
  billingEmail: '',
  activeEndsAt: '',
  representative: '',
  address: '',
  phone: '',
  initialMemberEmail: '',
  initialMemberRole: ORG_ROLE_KEYS.ADMIN,
});

const getSubscriptionServiceContactEmail = (subscription) =>
  subscription?.serviceContactEmail || subscription?.membershipEmail || '';

const OrganizationSubscriptionBoard = () => {
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();

  const [organizations, setOrganizations] = useState([]);
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [subEditForm, setSubEditForm] = useState(createEmptySubscriptionForm);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgForm, setOrgForm] = useState(createEmptyOrgForm);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  const organizationTypeOptions = useMemo(
    () => getStaticOptionOptions('organizationType', languageCode),
    [languageCode]
  );

  const fetchOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const data = await requestJSON('/organizations');
      setOrganizations(Array.isArray(data) ? data : []);
    } catch {
      setOrganizations([]);
    } finally {
      setLoadingOrgs(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const validateSubscriptionForm = (form) => {
    if (form.subscriptionStatus !== ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE) {
      return true;
    }
    return Boolean(form.serviceContactEmail.trim() && form.billingEmail.trim());
  };

  const handleEditSubscription = (organization) => {
    if (editingOrgId === organization.id) {
      setEditingOrgId(null);
      setSubEditForm(createEmptySubscriptionForm());
      return;
    }

    setEditingOrgId(organization.id);
    setSubEditForm({
      subscriptionStatus:
        organization.subscription?.status ?? ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.NOT_SUBSCRIBED,
      serviceContactEmail: getSubscriptionServiceContactEmail(organization.subscription),
      billingEmail: organization.subscription?.billingEmail ?? '',
      activeEndsAt: toDateInputValue(organization.subscription?.activeEndsAt),
    });
  };

  const handleSubEditChange = (event) => {
    const { name, value } = event.target;
    setSubEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleOrgChange = (event) => {
    const { name, value } = event.target;
    setOrgForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateSubscription = async () => {
    if (!editingOrgId || savingSubscription) return;
    if (!validateSubscriptionForm(subEditForm)) {
      showNotification(getPageMessage('activeEmailsRequired', languageCode), 'error');
      return;
    }

    setSavingSubscription(true);
    try {
      const updated = await requestJSON(`/organizations/${editingOrgId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionStatus: subEditForm.subscriptionStatus,
          serviceContactEmail: subEditForm.serviceContactEmail.trim(),
          billingEmail: subEditForm.billingEmail.trim(),
          activeEndsAt:
            subEditForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
              ? subEditForm.activeEndsAt || null
              : null,
        }),
      });

      setOrganizations((prev) =>
        prev.map((organization) => (organization.id === editingOrgId ? updated : organization))
      );
      setEditingOrgId(null);
      setSubEditForm(createEmptySubscriptionForm());
      showNotification(getPageMessage('subscriptionUpdated', languageCode), 'success');
    } catch (error) {
      showNotification(
        error?.message || getPageMessage('subscriptionUpdateError', languageCode),
        'error'
      );
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (savingOrg) return;
    if (!orgForm.name.trim()) {
      showNotification(getPageMessage('companyRequired', languageCode), 'error');
      return;
    }
    if (!validateSubscriptionForm(orgForm)) {
      showNotification(getPageMessage('activeEmailsRequired', languageCode), 'error');
      return;
    }

    setSavingOrg(true);
    try {
      const created = await requestJSON('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgForm.name.trim(),
          code: orgForm.code.trim(),
          type: orgForm.type,
          email: orgForm.email.trim(),
          subscriptionStatus: orgForm.subscriptionStatus,
          serviceContactEmail: orgForm.serviceContactEmail.trim(),
          billingEmail: orgForm.billingEmail.trim(),
          activeEndsAt:
            orgForm.subscriptionStatus === ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
              ? orgForm.activeEndsAt || null
              : null,
          representative: orgForm.representative.trim(),
          address: orgForm.address.trim(),
          phone: orgForm.phone.trim(),
        }),
      });

      const initialMemberEmail = orgForm.initialMemberEmail.trim();
      if (initialMemberEmail) {
        await requestJSON('/org-memberships/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: created.id,
            email: initialMemberEmail,
            role: orgForm.initialMemberRole,
          }),
        });
      }

      setOrganizations((prev) => [...prev, created]);
      setOrgForm(createEmptyOrgForm());
      setShowCreateForm(false);
      showNotification(
        getPageMessage(
          initialMemberEmail ? 'organizationCreatedWithAdmin' : 'organizationCreated',
          languageCode
        ),
        'success'
      );
    } catch (error) {
      showNotification(
        error?.message || getPageMessage('organizationCreateError', languageCode),
        'error'
      );
    } finally {
      setSavingOrg(false);
    }
  };

  return (
    <AppPageContainer
      title={getUiMessage('menu.subscription', '구독 관리', languageCode)}
      titleActions={
        <Button variant="outlined" onClick={() => setShowCreateForm((prev) => !prev)}>
          {showCreateForm
            ? getPageMessage('closeCreateForm', languageCode)
            : getPageMessage('addOrganization', languageCode)}
        </Button>
      }
    >
      <Stack spacing={2.5}>
        <Alert severity="info">{getPageMessage('summary', languageCode)}</Alert>
        <Paper variant="outlined" sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6">{getPageMessage('companyList', languageCode)}</Typography>
          </Box>

          {loadingOrgs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>{getPageMessage('companyName', languageCode)}</TableCell>
                    <TableCell>{getPageMessage('companyType', languageCode)}</TableCell>
                    <TableCell>{getPageMessage('status', languageCode)}</TableCell>
                    <TableCell>{getPageMessage('serviceContactEmail', languageCode)}</TableCell>
                    <TableCell>{getPageMessage('billingEmail', languageCode)}</TableCell>
                    <TableCell>{getPageMessage('activeEndsAt', languageCode)}</TableCell>
                    <TableCell align="right">{getPageMessage('actions', languageCode)}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {organizations.map((organization) => (
                    <React.Fragment key={organization.id}>
                      <TableRow hover>
                        <TableCell sx={{ color: 'text.secondary' }}>{organization.id}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{organization.name}</TableCell>
                        <TableCell>
                          {getStaticOptionLabel(
                            'organizationType',
                            organization.type,
                            organization.type || getPageMessage('emptyCell', languageCode),
                            languageCode
                          )}
                        </TableCell>
                        <TableCell>
                          <SubscriptionChip
                            status={organization.subscription?.status}
                            languageCode={languageCode}
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {getSubscriptionServiceContactEmail(organization.subscription) ||
                            getPageMessage('emptyCell', languageCode)}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {organization.subscription?.billingEmail ||
                            getPageMessage('emptyCell', languageCode)}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {formatDateCell(organization.subscription?.activeEndsAt, languageCode)}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleEditSubscription(organization)}
                          >
                            {editingOrgId === organization.id ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={8} sx={{ p: 0, border: 0 }}>
                          <Collapse in={editingOrgId === organization.id} unmountOnExit>
                            <Box sx={{ p: 3, bgcolor: 'action.hover' }}>
                              <Stack spacing={2}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  {organization.name} · {getPageMessage('editTitle', languageCode)}
                                </Typography>

                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={3}>
                                    <TextField
                                      fullWidth
                                      select
                                      size="small"
                                      label={getPageMessage('status', languageCode)}
                                      name="subscriptionStatus"
                                      value={subEditForm.subscriptionStatus}
                                      onChange={handleSubEditChange}
                                    >
                                      {ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid item xs={12} md={3}>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      label={getPageMessage('serviceContactEmail', languageCode)}
                                      name="serviceContactEmail"
                                      value={subEditForm.serviceContactEmail}
                                      onChange={handleSubEditChange}
                                      placeholder="service@company.com"
                                    />
                                  </Grid>
                                  <Grid item xs={12} md={3}>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      label={getPageMessage('billingEmail', languageCode)}
                                      name="billingEmail"
                                      value={subEditForm.billingEmail}
                                      onChange={handleSubEditChange}
                                      placeholder="billing@company.com"
                                    />
                                  </Grid>
                                  <Grid item xs={12} md={3}>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      type="date"
                                      label={getPageMessage('activeEndsAt', languageCode)}
                                      name="activeEndsAt"
                                      value={subEditForm.activeEndsAt}
                                      onChange={handleSubEditChange}
                                      InputLabelProps={{ shrink: true }}
                                      helperText={getPageMessage('activeEndsAtHelper', languageCode)}
                                      disabled={
                                        subEditForm.subscriptionStatus !==
                                        ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
                                      }
                                    />
                                  </Grid>
                                </Grid>

                                <Typography variant="caption" color="text.secondary">
                                  {getOrganizationSubscriptionStatusDescription(
                                    subEditForm.subscriptionStatus,
                                    '',
                                    languageCode
                                  )}
                                </Typography>

                                <Box sx={{ display: 'flex', gap: 1 }}>
                                  <SaveButton
                                    size="small"
                                    onClick={handleUpdateSubscription}
                                    disabled={savingSubscription}
                                    loading={savingSubscription}
                                  />
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => {
                                      setEditingOrgId(null);
                                      setSubEditForm(createEmptySubscriptionForm());
                                    }}
                                  >
                                    {getUiMessage('common.cancel', '취소', languageCode)}
                                  </Button>
                                </Box>
                              </Stack>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}

                  {organizations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}
                      >
                        {getPageMessage('noOrganizations', languageCode)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
        <Collapse in={showCreateForm} unmountOnExit>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              <Typography variant="h6">{getPageMessage('createTitle', languageCode)}</Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={getPageMessage('companyName', languageCode)}
                    name="name"
                    value={orgForm.name}
                    onChange={handleOrgChange}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={getPageMessage('companyCode', languageCode)}
                    name="code"
                    value={orgForm.code}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label={getPageMessage('companyType', languageCode)}
                    name="type"
                    value={orgForm.type}
                    onChange={handleOrgChange}
                  >
                    {organizationTypeOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label={getPageMessage('companyEmail', languageCode)}
                    name="email"
                    value={orgForm.email}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label={getPageMessage('representative', languageCode)}
                    name="representative"
                    value={orgForm.representative}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label={getPageMessage('phone', languageCode)}
                    name="phone"
                    value={orgForm.phone}
                    onChange={handleOrgChange}
                  />
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label={getPageMessage('address', languageCode)}
                    name="address"
                    value={orgForm.address}
                    onChange={handleOrgChange}
                  />
                </Grid>
              </Grid>

              <Divider />

              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    select
                    label={getPageMessage('status', languageCode)}
                    name="subscriptionStatus"
                    value={orgForm.subscriptionStatus}
                    onChange={handleOrgChange}
                  >
                    {ORGANIZATION_SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label={getPageMessage('serviceContactEmail', languageCode)}
                    name="serviceContactEmail"
                    value={orgForm.serviceContactEmail}
                    onChange={handleOrgChange}
                    placeholder="service@company.com"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label={getPageMessage('billingEmail', languageCode)}
                    name="billingEmail"
                    value={orgForm.billingEmail}
                    onChange={handleOrgChange}
                    placeholder="billing@company.com"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="date"
                    label={getPageMessage('activeEndsAt', languageCode)}
                    name="activeEndsAt"
                    value={orgForm.activeEndsAt}
                    onChange={handleOrgChange}
                    InputLabelProps={{ shrink: true }}
                    helperText={getPageMessage('activeEndsAtHelper', languageCode)}
                    disabled={
                      orgForm.subscriptionStatus !== ORGANIZATION_SUBSCRIPTION_STATUS_KEYS.ACTIVE
                    }
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">
                    {getOrganizationSubscriptionStatusDescription(
                      orgForm.subscriptionStatus,
                      '',
                      languageCode
                    )}
                  </Typography>
                </Grid>
              </Grid>

              <Divider>
                <Typography variant="caption">
                  {getPageMessage('optionalAccessSection', languageCode)}
                </Typography>
              </Divider>

              <Typography variant="caption" color="text.secondary">
                {getPageMessage('optionalAccessHelper', languageCode)}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label={getPageMessage('initialAdminEmail', languageCode)}
                    name="initialMemberEmail"
                    value={orgForm.initialMemberEmail}
                    onChange={handleOrgChange}
                    placeholder="admin@company.com"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    label={getPageMessage('initialAdminRole', languageCode)}
                    name="initialMemberRole"
                    value={orgForm.initialMemberRole}
                    onChange={handleOrgChange}
                  >
                    {ORG_ROLE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <SaveButton
                  onClick={handleCreateOrganization}
                  disabled={savingOrg}
                  loading={savingOrg}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    setShowCreateForm(false);
                    setOrgForm(createEmptyOrgForm());
                  }}
                >
                  {getUiMessage('common.cancel', '취소', languageCode)}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Collapse>
      </Stack>
    </AppPageContainer>
  );
};

export default OrganizationSubscriptionBoard;
