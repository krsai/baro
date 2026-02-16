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
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';

const ORG_TYPES = [
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'BRAND', label: 'Brand' },
];

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OPERATOR', label: 'Operator' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'WORKER', label: 'Worker' },
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: 'NOT_SUBSCRIBED', label: 'Not Subscribed' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'GRACE', label: 'Grace' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const OrgMembership = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification } = useApp();

  const [organizations, setOrganizations] = useState([]);
  const [members, setMembers] = useState([]);
  const [orgForm, setOrgForm] = useState({
    name: '',
    code: '',
    type: 'MANUFACTURER',
    email: '',
    subscriptionStatus: 'NOT_SUBSCRIBED',
    membershipEmail: '',
    billingEmail: '',
    representative: '',
    address: '',
    phone: '',
  });
  const [assignForm, setAssignForm] = useState({
    orgId: '',
    email: '',
    role: 'OPERATOR',
  });

  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const response = await fetch(`${API_BASE}/organizations`);
      const data = await response.json();
      if (response.ok) {
        setOrganizations(data);
        if (!assignForm.orgId && data.length > 0) {
          setAssignForm((prev) => ({ ...prev, orgId: String(data[0].id) }));
        }
      }
    } catch (_error) {
      // ignore fetch errors in UI for now
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchMembers = async (orgId) => {
    if (!orgId) return;
    try {
      const response = await fetch(`${API_BASE}/org-memberships?orgId=${orgId}`);
      const data = await response.json();
      if (response.ok) {
        setMembers(data);
      }
    } catch (_error) {
      // ignore fetch errors in UI for now
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [API_BASE]);

  useEffect(() => {
    if (assignForm.orgId) {
      fetchMembers(assignForm.orgId);
    }
  }, [assignForm.orgId]);

  const handleOrgChange = (e) => {
    const { name, value } = e.target;
    setOrgForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssignChange = (e) => {
    const { name, value } = e.target;
    setAssignForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateOrganization = async () => {
    if (savingOrg) return;
    const name = orgForm.name.trim();
    if (!name) {
      showNotification('Please enter an organization name.', 'error');
      return;
    }
    if (
      orgForm.subscriptionStatus === 'ACTIVE' &&
      (!orgForm.membershipEmail.trim() || !orgForm.billingEmail.trim())
    ) {
      showNotification('Active subscription requires membership and billing emails.', 'error');
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
        representative: orgForm.representative.trim(),
        address: orgForm.address.trim(),
        phone: orgForm.phone.trim(),
      };
      const response = await fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || 'Failed to create organization.', 'error');
        return;
      }

      setOrganizations((prev) => [...prev, data]);
      setAssignForm((prev) => ({ ...prev, orgId: String(data.id) }));
      setOrgForm((prev) => ({
        ...prev,
        name: '',
        code: '',
        email: '',
        subscriptionStatus: 'NOT_SUBSCRIBED',
        membershipEmail: '',
        billingEmail: '',
        representative: '',
        address: '',
        phone: '',
      }));
      showNotification('Organization created.', 'success');
    } catch (_error) {
      showNotification('An error occurred while creating the organization.', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleAssignOperator = async () => {
    if (assigning) return;
    if (!assignForm.orgId) {
      showNotification('Please select an organization.', 'error');
      return;
    }
    const email = assignForm.email.trim();
    if (!email) {
      showNotification('Please enter an operator email.', 'error');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`${API_BASE}/org-memberships/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: Number(assignForm.orgId),
          email,
          role: assignForm.role,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || 'Failed to assign operator.', 'error');
        return;
      }

      setAssignForm((prev) => ({ ...prev, email: '' }));
      await fetchMembers(assignForm.orgId);
      showNotification('Operator assigned.', 'success');
    } catch (_error) {
      showNotification('An error occurred while assigning the operator.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            Organization Membership / Operator Assignment
          </Typography>
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            Create organizations and assign operator access.
          </Typography>
        </>
      }
    >
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              1) Organization Registration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Organization Name"
                  name="name"
                  value={orgForm.name}
                  onChange={handleOrgChange}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Organization Code"
                  name="code"
                  value={orgForm.code}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Organization Type"
                  name="type"
                  value={orgForm.type}
                  onChange={handleOrgChange}
                >
                  {ORG_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Organization Email (Optional)"
                  name="email"
                  value={orgForm.email}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Subscription Status"
                  name="subscriptionStatus"
                  value={orgForm.subscriptionStatus}
                  onChange={handleOrgChange}
                >
                  {SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Membership Email"
                  name="membershipEmail"
                  value={orgForm.membershipEmail}
                  onChange={handleOrgChange}
                  placeholder="membership@domain.com"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Billing Email"
                  name="billingEmail"
                  value={orgForm.billingEmail}
                  onChange={handleOrgChange}
                  placeholder="billing@domain.com"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Representative (Optional)"
                  name="representative"
                  value={orgForm.representative}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address (Optional)"
                  name="address"
                  value={orgForm.address}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone (Optional)"
                  name="phone"
                  value={orgForm.phone}
                  onChange={handleOrgChange}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleCreateOrganization}
                  disabled={savingOrg}
                  startIcon={savingOrg ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {savingOrg ? 'Saving...' : 'Create Organization'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              2) Operator Assignment
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Select Organization"
                  name="orgId"
                  value={assignForm.orgId}
                  onChange={handleAssignChange}
                  disabled={loadingOrgs || organizations.length === 0}
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={String(org.id)}>
                      {org.name} ({org.type})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Operator Email"
                  name="email"
                  value={assignForm.email}
                  onChange={handleAssignChange}
                  placeholder="example@domain.com"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Role"
                  name="role"
                  value={assignForm.role}
                  onChange={handleAssignChange}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleAssignOperator}
                  disabled={assigning || organizations.length === 0}
                  startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  {assigning ? 'Assigning...' : 'Assign Operator'}
                </Button>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Assigned Operators
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.role}</TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        No operators assigned.
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

