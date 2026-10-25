import VersionAssignmentBoard from '../../../../components/VersionAssignmentBoard';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import VersionApplicationStart from '../../../../components/VersionApplicationStart';
import { fetchStyleProcessVersions, saveStyleProcessVersionBoundaries } from '../../../../utils/styleApi';
import { useLanguage } from '../../../../context/LanguageContext';

// One distinct color per version, git-log-graph style, so the branch line
// segment and dot a version "owns" in the timeline visually match the chip
// for that version on the left - cycles if there are more versions than colors.
const VERSION_GRAPH_COLORS = [
  '#1976d2', '#9c27b0', '#2e7d32', '#ed6c02',
  '#d32f2f', '#0288d1', '#6d4c41', '#5e35b1',
];

// Backend validation messages (createHttpError) are plain English and were
// leaking straight to the user - map the ones this screen can actually
// trigger to a Korean explanation instead of showing raw English.
const COPY = {
  ko: { oldest: '가장 오래된 배정에는 반드시 어떤 버전이든 하나가 적용되어야 합니다.', oneBoundary: '최소 하나의 공정 버전은 적용 구간이 지정되어야 합니다.', order: '버전 적용 순서가 올바르지 않습니다. 이후 버전은 이전 버전보다 나중 배정부터 적용되어야 합니다.', loadFail: '공정 버전을 불러오지 못했습니다.', saved: '공정 버전 적용 구간을 저장했습니다.', saveFail: '적용 구간을 저장하지 못했습니다.', title: '공정 버전 관리', processes: '개', moveOldest: '가장 오래된 배정은 반드시 어떤 버전이든 하나가 적용되어야 합니다. 다른 버전을 먼저 오래된 배정 쪽으로 옮겨주세요.', assignment: '배정', records: '기록', unspecified: '미지정', empty: '배정된 작업이 없습니다.', save: '저장' },
  en: { oldest: 'The oldest assignment must have a process version.', oneBoundary: 'At least one process version must have an effective boundary.', order: 'Version boundaries must follow version order.', loadFail: 'Failed to load process versions.', saved: 'Saved process version boundaries.', saveFail: 'Failed to save version boundaries.', title: 'Process Version Management', processes: ' processes', moveOldest: 'The oldest assignment must have a version. Move another version to the oldest assignment first.', assignment: 'Qty', records: 'Records', unspecified: 'Unspecified', empty: 'No assigned work.', save: 'Save' },
  vi: { oldest: 'Phân công cũ nhất phải được áp dụng một phiên bản công đoạn.', oneBoundary: 'Phải thiết lập phạm vi áp dụng cho ít nhất một phiên bản công đoạn.', order: 'Phạm vi áp dụng phải theo đúng thứ tự phiên bản.', loadFail: 'Không thể tải phiên bản công đoạn.', saved: 'Đã lưu phạm vi áp dụng phiên bản công đoạn.', saveFail: 'Không thể lưu phạm vi áp dụng.', title: 'Quản lý phiên bản công đoạn', processes: ' công đoạn', moveOldest: 'Phân công cũ nhất phải có một phiên bản. Hãy chuyển một phiên bản khác đến phân công cũ nhất trước.', assignment: 'Số lượng', records: 'Ghi chép', unspecified: 'Chưa chỉ định', empty: 'Không có công việc đã phân công.', save: 'Lưu' },
};

const translateVersionBoundaryError = (message, languageCode = 'en') => {
  const copy = COPY[languageCode] || COPY.en;
  if (!message) return null;
  if (message.includes('earliest-applied version must start at the oldest assignment')) {
    return copy.oldest;
  }
  if (message.includes('at least one process version boundary must be set')) {
    return copy.oneBoundary;
  }
  if (message.includes('version boundaries must follow version order')) {
    return copy.order;
  }
  return null;
};

export const deriveEditableVersionBoundaries = (versions, assignments) => {
  const next = {};
  versions.forEach(version => {
    const first = assignments.find(assignment => !assignment.isVersionLocked && assignment.versionId === version.id);
    if (first) next[version.id] = first.assignmentPlanId;
  });
  const firstEditable = assignments.find(assignment => !assignment.isVersionLocked);
  // Locked rows retain their own version independently of editable ranges.
  // Anchor the first editable range at the oldest row to retain the existing API contract.
  if (firstEditable && assignments.length) next[firstEditable.versionId] = assignments[0].assignmentPlanId;
  return next;
};

const ProcessVersionManager = ({ open, onClose, styleId, orgId, ownerOrgId, notify }) => {
  const { languageCode } = useLanguage();
  const copy = COPY[languageCode] || COPY.en;
  const integrityWarning = languageCode === 'en'
    ? 'Some assignments need their process references reviewed. Press Save below to rebuild them from this version - completed or payroll-locked assignments are left untouched either way.'
    : languageCode === 'vi'
      ? 'Một số phân công cần kiểm tra liên kết công đoạn. Nhấn Lưu bên dưới để tạo lại theo phiên bản này - các phân công đã hoàn tất hoặc đã khóa lương vẫn được giữ nguyên.'
      : '공정 연결 확인이 필요한 배정이 있습니다. 아래 저장을 누르면 이 버전 기준으로 다시 계산합니다. 완료 확정되었거나 급여 잠금된 배정은 이 저장으로도 건드리지 않습니다.';
  const [versions, setVersions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [boundaries, setBoundaries] = useState({});
  const [savedBoundaries, setSavedBoundaries] = useState({});
  const [busy, setBusy] = useState(false);
  const lockText = languageCode === 'ko' ? '생산 완료·잠금 배정은 현재 공정 버전을 유지합니다. 새 버전의 적용 구간에 포함되어도 변경되지 않습니다.'
    : languageCode === 'vi' ? 'Phân công hoàn thành sản xuất hoặc đã khóa giữ nguyên phiên bản, kể cả khi nằm trong phạm vi phiên bản mới.'
    : 'Production-completed and locked assignments retain their current version, even inside a new version range.';

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await fetchStyleProcessVersions(styleId, { orgId, ownerOrgId });
      setVersions(data.versions);
      setAssignments(data.assignments);
      const next = deriveEditableVersionBoundaries(data.versions, data.assignments);
      setBoundaries(next);
      setSavedBoundaries(next);
    } catch (error) {
      notify(translateVersionBoundaryError(error?.message, languageCode) || error?.message || copy.loadFail, 'error');
    }
    finally { setBusy(false); }
  }, [copy.loadFail, languageCode, notify, orgId, ownerOrgId, styleId]);

  useEffect(() => { if (open) load(); }, [load, open]);

  const assignmentsWithVersion = useMemo(() => assignments.map((assignment, index) => {
    const matchingVersions = versions.filter((version) => {
      const startId = boundaries[version.id];
      const startIndex = assignments.findIndex((item) => item.assignmentPlanId === startId);
      return startIndex >= 0 && startIndex <= index;
    });
    const active = assignment.isVersionLocked
      ? versions.find(version => version.id === assignment.versionId)
      : matchingVersions[matchingVersions.length - 1];
    return { ...assignment, activeVersion: active };
  }), [assignments, boundaries, versions]);

  // Newest-first for display (git-log style) - the underlying chronological
  // `assignments`/`assignmentsWithVersion` order stays oldest-first since
  // boundary logic (some version must cover assignments[0]) depends on it.
  const displayAssignments = useMemo(
    () => [...assignmentsWithVersion].reverse(),
    [assignmentsWithVersion]
  );

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
  // The initial `boundaries`/`savedBoundaries` are both derived from each
  // assignment's CURRENTLY STORED versionId (load(), above), so they are
  // always identical right after opening the dialog - hasBoundaryChanges can
  // only become true by actually dragging a version onto a different
  // assignment. A style with a single version (the common case) has nothing
  // to drag: its one version's boundary is already pinned to the oldest
  // assignment, so hasBoundaryChanges would stay false forever and Save
  // could never be pressed, even though this dialog is the only place that
  // can repair an assignment whose stored CT/ST no longer matches its own
  // already-assigned version (needsSnapshotRefresh). Also allow Save when
  // there is something to repair, independent of any drag having happened.
  const hasRefreshableAssignments = assignments.some((item) => item.needsSnapshotRefresh && !item.isVersionLocked);
  const save = async () => {
    setBusy(true);
    try {
      await saveStyleProcessVersionBoundaries(styleId, versions.map((version) => ({ versionId: version.id, startAssignmentPlanId: boundaries[version.id] })).filter((row) => row.startAssignmentPlanId), { orgId, ownerOrgId });
      setSavedBoundaries(boundaries);
      notify(copy.saved, 'success'); onClose();
    } catch (error) {
      notify(String(error?.message || '').includes('SNAPSHOT_REFERENCE_INVALID') ? integrityWarning : translateVersionBoundaryError(error?.message, languageCode) || error?.message || copy.saveFail, 'error');
    }
    finally { setBusy(false); }
  };

  const assignVersionToAssignment = (version, assignment) => {
    if (busy || assignment.isVersionLocked) return;
    const versionId = version.id;
    const targetIndex = assignments.findIndex(
      (item) => item.assignmentPlanId === assignment.assignmentPlanId
    );
    if (targetIndex < 0) return;
    setBoundaries((current) => {
      const next = { ...current, [versionId]: assignment.assignmentPlanId };
      // Any other version whose current boundary would now violate
      // ordering relative to this drop (an earlier-numbered version
      // starting at/after this position, or a later-numbered version
      // starting at/before it) is being superseded by this drop - it
      // loses its boundary rather than blocking the action, so
      // dragging a version all the way onto the oldest assignment
      // (e.g. retroactively applying a newly gender-scoped version)
      // works instead of being permanently blocked by an earlier
      // version's fixed position.
      const resolveIndex = (planId) =>
        assignments.findIndex((item) => item.assignmentPlanId === planId);
      versions.forEach((other) => {
        if (other.id === versionId) return;
        const otherStartId = next[other.id];
        if (!otherStartId) return;
        const otherIndex = resolveIndex(otherStartId);
        if (otherIndex < 0) return;
        const conflicts = other.versionNumber < version.versionNumber
          ? otherIndex >= targetIndex
          : otherIndex <= targetIndex;
        if (conflicts) delete next[other.id];
      });
      const remainingIndexes = Object.entries(next)
        .map(([, planId]) => resolveIndex(planId))
        .filter((value) => value >= 0);
      const earliestIndex = remainingIndexes.length > 0 ? Math.min(...remainingIndexes) : -1;
      if (earliestIndex !== 0) {
        notify(
          copy.moveOldest,
          'error'
        );
        return current;
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent dividers>
        <VersionApplicationStart mode="future" languageCode={languageCode} versionNumber={Math.max(0, ...versions.map(version => version.versionNumber))} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{lockText}</Typography>
        {assignments.some(item => item.needsSnapshotRefresh) && <Alert severity="warning" sx={{ mb: 2 }}>{integrityWarning}</Alert>}
        <VersionAssignmentBoard versions={versions} languageCode={languageCode} busy={busy} colors={colorByVersionId}
          getVersionLabel={version => version.name || 'Ver.' + version.versionNumber}
          getVersionMeta={version => String(version.processCount) + copy.processes}
          onAssign={assignVersionToAssignment} emptyMessage={copy.empty}
          targets={displayAssignments.map(assignment => ({ ...assignment, id: assignment.assignmentPlanId,
            label: assignment.orderNo || assignment.externalId,
            description: copy.assignment + ' ' + assignment.assignmentQuantity + ' · ' + new Date(assignment.assignedAt).toLocaleDateString(),
            adornment: assignment.needsSnapshotRefresh ? <Chip size="small" color="warning" label={languageCode === 'en' ? 'Review references' : languageCode === 'vi' ? 'Kiểm tra liên kết' : '공정 연결 확인'} /> : assignment.workRecordCount > 0 ? <Typography variant="caption" color="text.secondary">{copy.records} {assignment.workRecordCount}</Typography> : null,
            version: assignment.activeVersion, locked: assignment.isVersionLocked,
            boundary: Object.values(boundaries).includes(assignment.assignmentPlanId),
          }))} />
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>{languageCode === 'ko' ? '닫기' : languageCode === 'vi' ? 'Đóng' : 'Close'}</Button><Button variant="contained" onClick={save} disabled={busy || assignments.length === 0 || (!hasBoundaryChanges && !hasRefreshableAssignments)}>{copy.save}</Button></DialogActions>
    </Dialog>
  );
};

export default ProcessVersionManager;
