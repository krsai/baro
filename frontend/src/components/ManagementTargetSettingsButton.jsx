import React, { useId, useState } from 'react';
import { Box, Dialog, DialogTitle } from '@mui/material';
import { managementTargetText } from '../constants/managementTargets';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import ManagementTargetSettings from './ManagementTargetSettings';
import PageSettingsButton from './PageSettingsButton';
import { usePageDialogs } from './PageDialogProvider';

export default function ManagementTargetSettingsButton({ orgId, languageCode = 'en', kind }) {
  const text = managementTargetText[languageCode] || managementTargetText.en;
  const titleId = useId();
  const dialogs = usePageDialogs();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ dirty: false, locked: false });

  useUnsavedChanges(open && state.dirty);

  const close = async () => {
    if (state.locked) return;
    if (state.dirty && !await dialogs.confirm(text.discard, { purpose: 'discard' })) return;
    setOpen(false);
    setState({ dirty: false, locked: false });
  };

  return <>
    <PageSettingsButton label={text[kind]} disabled={!orgId} onClick={() => setOpen(true)} />
    <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{text[kind]}</DialogTitle>
      {open && <Box sx={{ overflowY: 'auto' }}>
        <ManagementTargetSettings
          embedded
          open
          kind={kind}
          orgId={orgId}
          languageCode={languageCode}
          onStateChange={setState}
        />
      </Box>}
    </Dialog>
  </>;
}
