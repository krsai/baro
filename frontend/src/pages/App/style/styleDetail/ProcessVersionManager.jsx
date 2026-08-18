import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import { confirmStyleProcessVersion, fetchStyleProcessVersions, saveStyleProcessVersionBoundaries } from '../../../../utils/styleApi';

const ProcessVersionManager = ({ open, onClose, styleId, orgId, ownerOrgId, notify }) => {
  const [versions, setVersions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [boundaries, setBoundaries] = useState({});
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

  const confirmVersion = async () => {
    setBusy(true);
    try { await confirmStyleProcessVersion(styleId, { orgId, ownerOrgId }); await load(); notify('현재 공정 목록을 새 날짜 버전으로 확정했습니다.', 'success'); }
    catch (error) { notify(error?.message || '버전을 확정하지 못했습니다.', 'error'); setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveStyleProcessVersionBoundaries(styleId, versions.map((version) => ({ versionId: version.id, startAssignmentPlanId: boundaries[version.id] })).filter((row) => row.startAssignmentPlanId), { orgId, ownerOrgId });
      notify('공정 버전 적용 구간을 저장했습니다.', 'success'); onClose();
    } catch (error) { notify(error?.message || '적용 구간을 저장하지 못했습니다.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>공정 버전 확정 및 배정 적용</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
            <Typography fontWeight={700}>확정된 공정 버전</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 1.5 }}>버전을 끌어서 오른쪽 배정의 시작 위치에 놓으세요.</Typography>
            <Stack spacing={1}>
              {versions.map((version) => (
                <Box key={version.id} draggable={version.versionNumber !== 1} onDragStart={(event) => event.dataTransfer.setData('versionId', String(version.id))}
                  sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5, cursor: version.versionNumber === 1 ? 'default' : 'grab', bgcolor: 'background.paper' }}>
                  <Typography fontWeight={700}>{version.name}</Typography>
                  <Typography variant="caption" color="text.secondary">공정 {version.processCount}개 · {version.confirmedBy}</Typography>
                </Box>
              ))}
            </Stack>
            <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={confirmVersion} disabled={busy}>현재 공정으로 새 버전 확정</Button>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700}>배정 작업 순서</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 1.5 }}>적용일은 배정의 순서에서 자동 결정되며 라인은 사용하지 않습니다.</Typography>
            <Stack spacing={.75}>
              {assignmentsWithVersion.map((assignment, index) => (
                <Box key={assignment.assignmentPlanId} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  const versionId = Number(event.dataTransfer.getData('versionId'));
                  if (versionId) setBoundaries((current) => ({ ...current, [versionId]: assignment.assignmentPlanId }));
                }} sx={{ p: 1.25, border: 1, borderStyle: 'dashed', borderColor: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 'primary.main' : 'divider', borderRadius: 1.5, bgcolor: Object.values(boundaries).includes(assignment.assignmentPlanId) ? 'action.selected' : 'background.paper' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography color="text.secondary" sx={{ width: 28 }}>{index + 1}</Typography>
                    <Box sx={{ flex: 1 }}><Typography fontWeight={600}>{assignment.orderNo || assignment.externalId}</Typography><Typography variant="caption" color="text.secondary">배정 {assignment.assignmentQuantity} · {new Date(assignment.assignedAt).toLocaleDateString()}</Typography></Box>
                    {assignment.workRecordCount > 0 && <Chip size="small" label={`작업기록 ${assignment.workRecordCount}건`} />}
                    <Chip size="small" color="primary" variant="outlined" label={assignment.activeVersion?.name || '미지정'} />
                  </Stack>
                </Box>
              ))}
              {!busy && assignments.length === 0 && <Typography color="text.secondary">배정된 작업이 없습니다.</Typography>}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>닫기</Button><Button variant="contained" onClick={save} disabled={busy || assignments.length === 0}>적용 구간 저장</Button></DialogActions>
    </Dialog>
  );
};

export default ProcessVersionManager;
