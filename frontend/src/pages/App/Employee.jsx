import React, { useEffect, useState } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import EmployeeBoard from './employee/EmployeeBoard';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';

const Employee = () => {
  const { activeProfile } = useAuth();
  const isSystemAdmin = activeProfile?.entryType === 'SYSTEM';

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  useEffect(() => {
    if (!isSystemAdmin) return;
    requestJSON('/organizations')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOrganizations(list);
        if (list.length > 0) setSelectedOrgId(String(list[0].id));
      })
      .catch(() => {});
  }, [isSystemAdmin]);

  if (!isSystemAdmin) {
    return <EmployeeBoard />;
  }

  const selectedOrg = organizations.find((o) => String(o.id) === selectedOrgId);

  return (
    <>
      <Box sx={{ px: 1, pt: 1.5 }}>
        <TextField
          select
          size="small"
          label="조직 선택"
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          sx={{ minWidth: 240 }}
        >
          {organizations.map((org) => (
            <MenuItem key={org.id} value={String(org.id)}>
              {org.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {selectedOrg && (
        <EmployeeBoard
          orgId={Number(selectedOrgId)}
          orgType={selectedOrg.type}
        />
      )}
    </>
  );
};

export default Employee;
