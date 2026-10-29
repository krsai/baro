import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Chip, Stack, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';

export const VERSION_BOARD_TEXT = {
  ko: { help: '왼쪽 버전을 적용을 시작할 오른쪽 대상에 끌어 놓으세요. 적용 결과를 확인한 뒤 저장하세요.', versions: '버전', targets: '적용 대상', empty: '적용 대상이 없습니다.', none: '미지정', unapply: '적용 해제 — 버전을 여기에 놓으세요', locked: '버전 변경 불가', keyboard: 'Space로 버전을 잡고 방향키로 대상을 이동한 뒤 Space로 놓으세요. Esc로 취소합니다.' },
  en: { help: 'Drag a version on the left onto its first target on the right. Review the resulting range, then save.', versions: 'Versions', targets: 'Apply from', empty: 'No targets.', none: 'Unspecified', unapply: 'Remove range — drop a version here', locked: 'Version locked', keyboard: 'Press Space to pick up a version, use arrow keys to choose a target, then Space to drop. Escape cancels.' },
  vi: { help: 'Kéo phiên bản bên trái vào đối tượng bắt đầu áp dụng bên phải. Kiểm tra phạm vi rồi lưu.', versions: 'Phiên bản', targets: 'Áp dụng từ', empty: 'Không có đối tượng áp dụng.', none: 'Chưa chỉ định', unapply: 'Bỏ phạm vi — thả phiên bản vào đây', locked: 'Không thể đổi phiên bản', keyboard: 'Nhấn Space để chọn phiên bản, dùng phím mũi tên chọn đối tượng, rồi Space để thả. Escape để hủy.' },
};
const COLORS = ['#1976d2', '#9c27b0', '#2e7d32', '#ed6c02', '#d32f2f', '#0288d1', '#6d4c41', '#5e35b1'];

export function versionKeyboardCoordinates(event, { context, currentCoordinates }) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
  event.preventDefault();
  const targets = context.droppableContainers.getEnabled().filter(item => item.data.current?.target).sort((a, b) => a.data.current.order - b.data.current.order);
  if (!targets.length || !context.collisionRect) return;
  const index = targets.findIndex(item => item.id === context.over?.id);
  const next = event.code === 'Home' ? 0 : event.code === 'End' ? targets.length - 1
    : index < 0 ? 0 : Math.max(0, Math.min(targets.length - 1, index + (['ArrowUp', 'ArrowLeft'].includes(event.code) ? -1 : 1)));
  const rect = context.droppableRects.get(targets[next].id);
  if (rect) return { x: currentCoordinates.x + rect.left - context.collisionRect.left, y: currentCoordinates.y + rect.top - context.collisionRect.top };
}

function VersionCard({ version, color, label, meta, subtitle, disabled }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `version:${version.id}`, data: { version }, disabled });
  return <Box ref={setNodeRef} {...attributes} {...listeners} data-version-id={version.id}
    aria-label={label} sx={{ flexShrink: 0, minWidth: 0, scrollMargin: '4px', p: 1, border: 1, borderColor: 'divider', borderLeft: 4, borderLeftColor: color, borderRadius: 1, bgcolor: 'background.paper', cursor: disabled ? 'default' : 'grab', opacity: isDragging ? 0.4 : 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
    <Stack direction="row" spacing={0.75} alignItems="center">
      {disabled ? <LockOutlinedIcon sx={{ fontSize: 17, color: 'text.disabled' }} /> : <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
      <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{label}</Typography>
      {meta && <Chip size="small" variant="outlined" label={meta} sx={{ height: 22, flexShrink: 0 }} />}
    </Stack>
    {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{subtitle}</Typography>}
  </Box>;
}

function TargetRow({ target, order, color, olderColor, first, last, busy, text }) {
  const { setNodeRef, isOver } = useDroppable({ id: `target:${target.id}`, data: { target, order }, disabled: busy || target.locked });
  return <Box ref={setNodeRef} data-version-target={target.id} data-dragover={isOver || undefined} aria-disabled={busy || target.locked || undefined}
    sx={{ position: 'relative', minHeight: 44, scrollMargin: '4px', display: 'flex', alignItems: 'center', pl: 3.5, pr: 0.75, py: 0.75, borderRadius: 1, bgcolor: isOver ? 'action.selected' : 'transparent', outline: isOver ? '2px solid' : 'none', outlineColor: 'primary.main' }}>
    {!first && <Box sx={{ position: 'absolute', left: 11, top: 0, height: '50%', width: 2, bgcolor: color }} />}
    {!last && <Box sx={{ position: 'absolute', left: 11, top: '50%', height: '50%', width: 2, bgcolor: olderColor }} />}
    <Box sx={{ position: 'absolute', left: target.boundary || first ? 4 : 6, width: target.boundary || first ? 16 : 12, height: target.boundary || first ? 16 : 12, borderRadius: '50%', bgcolor: color }} />
    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
      {target.locked && <LockOutlinedIcon fontSize="small" color="disabled" titleAccess={text.locked} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{target.label}</Typography>
        {target.description && <Typography variant="caption" color="text.secondary">{target.description}</Typography>}
        {target.adornment}
      </Box>
      <Chip size="small" variant="outlined" label={target.version ? `Ver.${target.version.versionNumber}` : text.none} title={target.version?.confirmedDate} sx={{ flexShrink: 0, color, borderColor: color }} />
    </Stack>
  </Box>;
}

function UnapplyTarget({ busy, text }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unapply', data: { target: { unapply: true }, order: Number.MAX_SAFE_INTEGER }, disabled: busy });
  return <Box ref={setNodeRef} data-version-unapply data-dragover={isOver || undefined} sx={{ p: 1.25, mt: 1, border: '1px dashed', borderColor: isOver ? 'primary.main' : 'divider', borderRadius: 1, bgcolor: isOver ? 'action.selected' : 'transparent' }}><Typography variant="caption" color="text.secondary">{text.unapply}</Typography></Box>;
}

// Callers own FK validation, range semantics, snapshots, and the explicit Save.
export default function VersionAssignmentBoard({ versions, targets, onAssign, onUnassign, languageCode = 'en', busy = false, getVersionLabel = version => version.name || `Ver.${version.versionNumber}`, getVersionMeta, getVersionSubtitle, isVersionDisabled = () => false, colors, rangeLabel, targetActions, emptyMessage }) {
  const text = VERSION_BOARD_TEXT[languageCode] || VERSION_BOARD_TEXT.en;
  const [dragged, setDragged] = useState(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: versionKeyboardCoordinates }));
  const ordered = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const colorFor = version => version ? colors?.get(version.id) || COLORS[Math.max(0, ordered.findIndex(item => item.id === version.id)) % COLORS.length] : '#9e9e9e';
  return <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)}
    accessibility={{ screenReaderInstructions: { draggable: text.keyboard } }}
    onDragStart={({ active }) => setDragged(active.data.current?.version || null)} onDragCancel={() => setDragged(null)}
    onDragEnd={({ active, over }) => { setDragged(null); const version = active.data.current?.version, target = over?.data.current?.target; if (!busy && version && target && !target.locked && !isVersionDisabled(version)) { if (target.unapply) onUnassign?.(version); else onAssign(version, target); } }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{text.help}</Typography>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} data-version-board>
      <Box sx={{ width: { xs: '100%', md: 280 }, minWidth: 0, flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{text.versions}</Typography>
        <Stack spacing={0.75} data-version-list sx={{ maxHeight: { xs: 200, md: 434 }, overflowY: 'auto', px: 0.5, py: 0.5, scrollPadding: '4px', scrollbarGutter: 'stable' }}>
          {[...ordered].reverse().map(version => <VersionCard key={version.id} version={version} color={colorFor(version)} label={getVersionLabel(version)} meta={getVersionMeta?.(version)} subtitle={getVersionSubtitle?.(version)} disabled={busy || isVersionDisabled(version)} />)}
        </Stack>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}><Typography variant="subtitle2">{text.targets}</Typography>{targetActions}</Stack>
        {rangeLabel && <Typography variant="caption" color="text.secondary">{rangeLabel}</Typography>}
        <Box data-version-target-list sx={{ maxHeight: { xs: 300, md: 434 }, overflowY: 'auto', px: 0.5, py: 0.5, scrollPadding: '4px', scrollbarGutter: 'stable' }}>
          {targets.map((target, index) => <TargetRow key={target.id} target={target} order={index} color={colorFor(target.version)} olderColor={colorFor(targets[index + 1]?.version)} first={index === 0} last={index === targets.length - 1} busy={busy} text={text} />)}
          {!targets.length && <Typography variant="body2" color="text.secondary">{emptyMessage || text.empty}</Typography>}
        </Box>
        {onUnassign && <UnapplyTarget busy={busy} text={text} />}
      </Box>
    </Stack>
    {createPortal(<DragOverlay zIndex={2000} style={{ pointerEvents: 'none' }}>{dragged ? <Box sx={{ p: 1.25, border: 1, borderColor: colorFor(dragged), borderRadius: 1, bgcolor: 'background.paper', boxShadow: 6 }}><Typography variant="body2" fontWeight={700}>{getVersionLabel(dragged)}</Typography></Box> : null}</DragOverlay>, document.body)}
  </DndContext>;
}
