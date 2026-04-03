import React from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Box, MenuItem, TextField } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import AttrBoard from './attribute/AttrBoard';
import ProcessMasterBoard from './attribute/ProcessMasterBoard';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';
import { PROCESS_MANAGEMENT_ENABLED } from '../../constants/featureFlags';

const resolveAttributeSectionKey = (pathname, isSystemAdmin) => {
  if (!isSystemAdmin) return 'processes';

  const normalizedPath = typeof pathname === 'string' ? pathname.trim() : '';
  const withoutHash = normalizedPath.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  const subPath = withoutQuery.replace(/^\/attribute\/?/, '');
  const section = subPath.split('/')[0] || '';

  if (section === 'colors' || section === 'categories' || section === 'processes') {
    return section;
  }
  return 'colors';
};

const Attribute = () => {
  const { activeProfile } = useAuth();
  const location = useLocation();
  const isSystemAdmin = activeProfile?.entryType === 'SYSTEM';
  const sectionKey = resolveAttributeSectionKey(location.pathname, isSystemAdmin);
  const isProcessMasterRoute = sectionKey === 'processes';
  const [organizations, setOrganizations] = React.useState([]);
  const [selectedOrgId, setSelectedOrgId] = React.useState('');

  if (!PROCESS_MANAGEMENT_ENABLED && isProcessMasterRoute && !isSystemAdmin) {
    return (
      <AppPageContainer title="공정 관리">
        <Alert severity="info" sx={{ maxWidth: 640 }}>
          공정 관리 페이지는 현재 비활성화되어 있습니다.
        </Alert>
      </AppPageContainer>
    );
  }

  React.useEffect(() => {
    if (!isSystemAdmin) return;

    let cancelled = false;
    requestJSON('/organizations', { skipGlobalLoading: true })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setOrganizations(rows);
        if (rows.length > 0) {
          setSelectedOrgId((prev) => {
            if (prev && rows.some((row) => String(row.id) === prev)) return prev;
            return String(rows[0].id);
          });
        } else {
          setSelectedOrgId('');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOrganizations([]);
        setSelectedOrgId('');
      });

    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin]);

  const selectedOrgIdNumber = Number.parseInt(selectedOrgId, 10);
  const resolvedOrgId =
    Number.isFinite(selectedOrgIdNumber) && selectedOrgIdNumber > 0
      ? selectedOrgIdNumber
      : null;

  const renderSystemBoard = (targetSectionKey) => (
    <AttrBoard sectionKey={targetSectionKey} orgId={resolvedOrgId} />
  );

  return (
    <>
      {isSystemAdmin && !isProcessMasterRoute ? (
        <Box sx={{ px: 1, pt: 1.5 }}>
          <TextField
            select
            size="small"
            label="조직 선택"
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            sx={{ minWidth: 260 }}
          >
            {organizations.map((org) => (
              <MenuItem key={org.id} value={String(org.id)}>
                {org.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      ) : null}

      {isSystemAdmin
        ? (sectionKey === 'processes' ? <ProcessMasterBoard /> : renderSystemBoard(sectionKey))
        : <AttrBoard sectionKey="processes" orgId={null} />}
    </>
  );
};

export default Attribute;
