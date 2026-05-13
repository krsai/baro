import React from 'react';
import { useLocation } from 'react-router-dom';
import { Alert } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import AttrBoard from './attribute/AttrBoard';
import ProcessMasterBoard from './attribute/ProcessMasterBoard';
import { useAuth } from '../../context/AuthContext';
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

const resolveProcessMasterViewKey = (pathname, isSystemAdmin) => {
  if (!isSystemAdmin) return 'overview';

  const normalizedPath = typeof pathname === 'string' ? pathname.trim() : '';
  const withoutHash = normalizedPath.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  const subPath = withoutQuery.replace(/^\/attribute\/?/, '');
  const segments = subPath.split('/').filter(Boolean);

  if (segments[0] !== 'processes') return 'overview';

  const viewKey = segments[1] || '';
  if (viewKey === 'targets' || viewKey === 'actions' || viewKey === 'specs') {
    return viewKey;
  }
  return 'overview';
};

const Attribute = () => {
  const { activeProfile } = useAuth();
  const location = useLocation();
  const isSystemAdmin = activeProfile?.entryType === 'SYSTEM';
  const sectionKey = resolveAttributeSectionKey(location.pathname, isSystemAdmin);
  const processMasterViewKey = resolveProcessMasterViewKey(location.pathname, isSystemAdmin);
  const isProcessMasterRoute = sectionKey === 'processes';

  if (!PROCESS_MANAGEMENT_ENABLED && isProcessMasterRoute && !isSystemAdmin) {
    return (
      <AppPageContainer title="공정 관리">
        <Alert severity="info" sx={{ maxWidth: 640 }}>
          공정 관리 페이지는 현재 비활성화되어 있습니다.
        </Alert>
      </AppPageContainer>
    );
  }

  const renderSystemBoard = (targetSectionKey) => (
    <AttrBoard sectionKey={targetSectionKey} orgId={null} />
  );

  return (
    <>
      {isSystemAdmin
        ? (
            sectionKey === 'processes'
              ? <ProcessMasterBoard viewKey={processMasterViewKey} />
              : renderSystemBoard(sectionKey)
          )
        : <AttrBoard sectionKey="processes" orgId={null} />}
    </>
  );
};

export default Attribute;
