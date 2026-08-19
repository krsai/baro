import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { fetchStyleProcessVersions, saveStyleProcessVersionBoundaries } from '../../../../utils/styleApi';

// One distinct color per version, git-log-graph style, so the branch line
// segment and dot a version "owns" in the timeline visually match the chip
// for that version on the left - cycles if there are more versions than colors.
const VERSION_GRAPH_COLORS = [
  '#1976d2', '#9c27b0', '#2e7d32', '#ed6c02',
  '#d32f2f', '#0288d1', '#6d4c41', '#5e35b1',
];

const ProcessVersionManager = ({ open, onClose, styleId, orgId, ownerOrgId, notify }) => {
  const [versions, setVersions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [boundaries, setBoundaries] = useState({});
  const [savedBoundaries, setSavedBoundaries] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      let data = await fetchStyleProcessVersions(styleId, { orgId, ownerOrgId });
      if (data.assignments.some((assignment) => assignment.needsSnapshotRefresh)) {
        const repairBoundaries = {};
        data.versions.forEach((version) => {
          const first = data.assignments.find((assignment) => assignment.versionId === version.id);
          if (first) repairBoundaries[version.id] = first.assignmentPlanId;
        });
        if (data.versions[0] && data.assignments[0]) {
          repairBoundaries[data.versions[0].id] = data.assignments[0].assignmentPlanId;
        }
        await saveStyleProcessVersionBoundaries(
          styleId,
          data.versions
            .map((version) => ({
              versionId: version.id,
              startAssignmentPlanId: repairBoundaries[version.id],
            }))
            .filter((row) => row.startAssignmentPlanId),
          { orgId, ownerOrgId }
        );
        data = await fetchStyleProcessVersions(styleId, { orgId, ownerOrgId });
      }
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

  const colorByVersionId = useMemo(() => {
    const map = new Map();
    versions.forEach((version, index) => {
      map.set(version.id, VERSION_GRAPH_COLORS[index % VERSION_GRAPH_COLORS.length]);
    });
    return map;
  }, [versions]);
  const resolveVersionColor = useCallback(
    (version) => (version ? colorByVersionId.get(version.id) ?? '#9e9e9e' : '#9e9e9e'),
    [colorByVersionId]
  );

  const boundarySignature = useCallback(
    (source) => versions.map((version) => `${version.id}:${source[version.id] ?? ''}`).join('|'),
    [versions]
  );
  const hasBoundaryChanges = boundarySignature(boundaries) !== boundarySignature(savedBoundaries);
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
              {versions.map((version) => {
                const versionColor = resolveVersionColor(version);
                return (
                  <Box key={version.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(version.id)); }}
                    sx={{ display: 'flex', alignItems: 'center', minHeight: 38, pl: .75, pr: .75, border: 1, borderColor: 'divider', borderLeft: 4, borderLeftColor: versionColor, borderRadius: 1, cursor: 'grab', bgcolor: 'background.paper', '&:active': { cursor: 'grabbing' } }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: versionColor, mr: .75, flexShrink: 0 }} />
                    <DragIndicatorIcon sx={{ mr: .5, color: 'text.secondary', fontSize: 18 }} />
                    <Typography variant="body2" fontWeight={700} sx={{ flex: 1, fontSize: '.78rem' }}>{version.name}</Typography>
                    <Chip size="small" variant="outlined" label={`${version.processCount}개`} sx={{ height: 22, fontSize: '.7rem' }} />
                  </Box>
                );
              })}
            </Stack>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ position: 'relative' }}>
              {assignmentsWithVersion.map((assignment, index) => {
                const isBoundary = Object.values(boundaries).includes(assignment.assignmentPlanId);
                const dotColor = resolveVersionColor(assignment.activeVersion);
                // Git-graph style: the segment leading INTO a row is colored by the
                // previous row's version, so the color visibly switches right at the
                // row where a new version's boundary starts (matches the drag target).
                const topColor = index === 0 ? null : resolveVersionColor(assignmentsWithVersion[index - 1]?.activeVersion);
                const hasBottomSegment = index < assignmentsWithVersion.length - 1;
                return (
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
                    {topColor && (
                      <Box sx={{ position: 'absolute', zIndex: 0, left: 11, top: 0, height: '50%', width: 2, bgcolor: topColor }} />
                    )}
                    {hasBottomSegment && (
                      <Box sx={{ position: 'absolute', zIndex: 0, left: 11, top: '50%', height: '50%', width: 2, bgcolor: dotColor }} />
                    )}
                    <Box sx={{
                      position: 'absolute', zIndex: 1,
                      left: isBoundary ? 4 : 6,
                      width: isBoundary ? 16 : 12,
                      height: isBoundary ? 16 : 12,
                      borderRadius: '50%',
                      bgcolor: isBoundary ? dotColor : 'background.paper',
                      border: 2,
                      borderColor: dotColor,
                      boxShadow: isBoundary ? `0 0 0 3px ${dotColor}26` : 'none',
                    }} />
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 70, fontSize: '.78rem' }}>{assignment.orderNo || assignment.externalId}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, fontSize: '.75rem' }}>배정 {assignment.assignmentQuantity} · {new Date(assignment.assignedAt).toLocaleDateString()}</Typography>
                      {assignment.workRecordCount > 0 && <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '.7rem' }}>기록 {assignment.workRecordCount}</Typography>}
                      <Chip size="small" variant="outlined" label={assignment.activeVersion?.confirmedDate || '미지정'} sx={{ height: 22, maxWidth: 110, fontSize: '.7rem', color: dotColor, borderColor: dotColor }} />
                    </Stack>
                  </Box>
                );
              })}
              {!busy && assignments.length === 0 && <Typography color="text.secondary">배정된 작업이 없습니다.</Typography>}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={save} disabled={busy || assignments.length === 0 || !hasBoundaryChanges}>저장</Button></DialogActions>
    </Dialog>
  );
};

export default ProcessVersionManager;
