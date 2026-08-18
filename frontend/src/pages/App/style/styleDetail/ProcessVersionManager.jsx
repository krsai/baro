import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { fetchStyleProcessVersions, saveStyleProcessVersionBoundaries } from '../../../../utils/styleApi';

const ProcessVersionManager = ({ open, onClose, styleId, orgId, ownerOrgId, notify }) => {
  const [versions, setVersions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [boundaries, setBoundaries] = useState({});
  const [savedBoundaries, setSavedBoundaries] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await fetchStyleProcessVersions(styleId, { orgId, ownerOrgId });
      setVersions(data.versions);
      setAssignments(data.assignments);
      const next = {};
      data.versions.forEach((version) => {
        const first = data.assignments.find((assignment) => assignment.versionId === version.id);
        if (first) next[version.id] = first.assignmentPlanId;
      });
      if (data.versions[0] && data.assignments[0]) next[data.versions[0].id] = data.assignments[0].assignmentPlanId;
      setBoundaries(next);
      setSavedBoundaries(next);
    } catch (error) { notify(error?.message || '공정 버전을 불러오지 못했습니다.', 'error'); }
    finally { setBusy(false); }
  }, [notify, orgId, ownerOrgId, styleId]);

  useEffect(() => { if (open) load(); }, [load, open]);

  const assignmentsWithVersion = useMemo(() => assignments.map((assignment, index) => {
    const matchingVersions = versions.filter((version) => {
      const startId = boundaries[version.id];
      const startIndex = assignments.findIndex((item) => item.assignmentPlanId === startId);
      return startIndex >= 0 && startIndex <= index;
    });
    const active = matchingVersions[matchingVersions.length - 1];
    return { ...assignment, activeVersion: active };
  }), [assignments, boundaries, versions]);

  const boundarySignature = useCallback(
    (source) => versions.map((version) => `${version.id}:${source[version.id] ?? ''}`).join('|'),
    [versions]
  );
  const hasBoundaryChanges = boundarySignature(boundaries) !== boundarySignature(savedBoundaries);
  const needsSnapshotRefresh = assignments.some((assignment) => assignment.needsSnapshotRefresh);

  const save = async () => {
    setBusy(true);
    try {
      await saveStyleProcessVersionBoundaries(styleId, versions.map((version) => ({ versionId: version.id, startAssignmentPlanId: boundaries[version.id] })).filter((row) => row.startAssignmentPlanId), { orgId, ownerOrgId });
      setSavedBoundaries(boundaries);
      notify('공정 버전 적용 구간을 저장했습니다.', 'success'); onClose();
    } catch (error) { notify(error?.message || '적용 구간을 저장하지 못했습니다.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>공정 버전 관리</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Box sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
            <Stack spacing={.75}>
              {versions.map((version) => (
                <Box key={version.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(version.id)); }}
                  sx={{ display: 'flex', alignItems: 'center', minHeight: 38, px: .75, border: 1, borderColor: 'divider', borderRadius: 1, cursor: 'grab', bgcolor: 'background.paper', '&:active': { cursor: 'grabbing' } }}>
                  <DragIndicatorIcon sx={{ mr: .5, color: 'text.secondary', fontSize: 18 }} />
                  <Typography variant="body2" fontWeight={700} sx={{ flex: 1, fontSize: '.78rem' }}>{version.name}</Typography>
                  <Chip size="small" variant="outlined" label={`${version.processCount}개`} sx={{ height: 22, fontSize: '.7rem' }} />
                </Box>
              ))}
            </Stack>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ position: 'relative', '&::before': assignments.length > 1 ? { content: '""', position: 'absolute', left: 11, top: 18, bottom: 18, width: 2, bgcolor: 'divider' } : undefined }}>
              {assignmentsWithVersion.map((assignment) => (
                <Box key={assignment.assignmentPlanId} onDragEnter={(event) => { event.preventDefault(); event.currentTarget.dataset.dragover = 'true'; }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) delete event.currentTarget.dataset.dragover; }} onDrop={(event) => {
                  delete event.currentTarget.dataset.dragover;
                  const versionId = Number(event.dataTransfer.getData('text/plain'));
                  const version = versions.find((item) => item.id === versionId);
                  if (version?.versionNumber === 1 && assignment.assignmentPlanId !== assignments[0]?.assignmentPlanId) {
                    notify('Ver.1은 가장 오래된 첫 배정부터 적용됩니다.', 'info');
                    return;
                  }
                  if (versionId) setBoundaries((current) => ({ ...current, [versionId]: assignment.assignmentPlanId }));
                }} sx={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 34, pl: 3.5, pr: .5, borderRadius: 1, transition: 'background-color .15s', '&[data-dragover="true"]': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ position: 'absolute', zIndex: 1, left: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 4 : 6, width: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 16 : 12, height: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 16 : 12, borderRadius: '50%', bgcolor: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 'primary.main' : 'background.paper', border: 2, borderColor: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 'primary.main' : 'text.disabled', boxShadow: Object.values(boundaries).includes(assignment.assignmentPlanId) ? '0 0 0 3px rgba(25, 118, 210, .14)' : 'none' }} />
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 70, fontSize: '.78rem' }}>{assignment.orderNo || assignment.externalId}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, fontSize: '.75rem' }}>배정 {assignment.assignmentQuantity} · {new Date(assignment.assignedAt).toLocaleDateString()}</Typography>
                    {assignment.workRecordCount > 0 && <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '.7rem' }}>기록 {assignment.workRecordCount}</Typography>}
                    <Chip size="small" color="primary" variant="outlined" label={assignment.activeVersion?.confirmedDate || '미지정'} sx={{ height: 22, maxWidth: 110, fontSize: '.7rem' }} />
                  </Stack>
                </Box>
              ))}
              {!busy && assignments.length === 0 && <Typography color="text.secondary">배정된 작업이 없습니다.</Typography>}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={save} disabled={busy || assignments.length === 0 || (!hasBoundaryChanges && !needsSnapshotRefresh)}>적용 구간 저장</Button></DialogActions>
    </Dialog>
  );
};

export default ProcessVersionManager;
