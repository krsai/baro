import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import SaveButton from '../../../components/SaveButton';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const TEXT = {
  ko: { title: '급여 계산 설정', section: '상시 만근', help: '출퇴근 기록과 관계없이 한 달 만근으로 처리할 직원을 설정합니다.', off: '미적용 직원', on: '적용 직원', factory: '공장', all: '전체 공장', search: '이름 또는 사번 검색', empty: '직원이 없습니다.', cancel: '취소', save: '저장', saved: '급여 계산 설정을 저장했습니다.' },
  en: { title: 'Payroll Settings', section: 'Always Full Attendance', help: 'Choose employees treated as fully present for the month regardless of attendance records.', off: 'Not Applied', on: 'Applied', factory: 'Factory', all: 'All Factories', search: 'Search name or employee no.', empty: 'No employees.', cancel: 'Cancel', save: 'Save', saved: 'Payroll settings saved.' },
  vi: { title: 'Cài đặt tính lương', section: 'Luôn đủ công', help: 'Chọn nhân viên được tính đủ công cả tháng không phụ thuộc dữ liệu chấm công.', off: 'Chưa áp dụng', on: 'Đã áp dụng', factory: 'Nhà máy', all: 'Tất cả nhà máy', search: 'Tìm tên hoặc mã nhân viên', empty: 'Không có nhân viên.', cancel: 'Hủy', save: 'Lưu', saved: 'Đã lưu cài đặt tính lương.' },
};

const EmployeeList = ({ id, title, rows, empty }) => <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography><Chip size="small" variant="outlined" label={rows.length} />
  </Stack>
  <Droppable droppableId={id}>{(provided, snapshot) => <Stack ref={provided.innerRef} {...provided.droppableProps} spacing={0.75} sx={{ p: 1, minHeight: 300, maxHeight: 440, overflowY: 'auto', bgcolor: snapshot.isDraggingOver ? 'action.hover' : 'background.paper' }}>
    {rows.map((employee, index) => <Draggable key={employee.id} draggableId={String(employee.id)} index={index}>{(drag, state) => <Paper ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} variant="outlined" sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', boxShadow: state.isDragging ? 4 : 0 }}>
      <DragIndicatorIcon fontSize="small" color="disabled" /><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{employee.name || employee.email || '-'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{[employee.employeeNo, employee.role?.name].filter(Boolean).join(' · ') || '-'}</Typography></Box>
    </Paper>}</Draggable>)}
    {!rows.length && <Typography align="center" color="text.secondary" variant="body2" sx={{ py: 6 }}>{empty}</Typography>}{provided.placeholder}
  </Stack>}</Droppable>
</Paper>;

const PayrollSettingsDialog = ({ open, onClose, orgId, languageCode, onSaved, showNotification }) => {
  const text = TEXT[languageCode] || TEXT.en;
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [factoryId, setFactoryId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    requestJSON('/payroll/settings' + buildQueryString({ orgId }), { forceRefresh: true })
      .then((data) => { const rows = Array.isArray(data?.employees) ? data.employees : []; setEmployees(rows); setSelected(new Set(rows.filter((row) => row.alwaysFullAttendance).map((row) => Number(row.id)))); })
      .catch((error) => showNotification(error?.message || 'Failed to load payroll settings.', 'error'))
      .finally(() => setLoading(false));
  }, [open, orgId, showNotification]);
  const factories = useMemo(() => Array.from(new Map(employees.filter((row) => row.factory).map((row) => [row.factory.id, row.factory])).values()), [employees]);
  const visible = useMemo(() => employees.filter((row) => (!factoryId || String(row.factoryId) === factoryId) && (!search.trim() || `${row.name || ''} ${row.employeeNo || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [employees, factoryId, search]);
  const move = ({ destination, source, draggableId }) => { if (!destination || destination.droppableId === source.droppableId) return; setSelected((before) => { const next = new Set(before); destination.droppableId === 'full-on' ? next.add(Number(draggableId)) : next.delete(Number(draggableId)); return next; }); };
  const save = async () => { setSaving(true); try { await requestJSON('/payroll/settings' + buildQueryString({ orgId }), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alwaysFullAttendanceEmployeeIds: Array.from(selected) }) }); showNotification(text.saved, 'success'); onSaved?.(); onClose(); } catch (error) { showNotification(error?.message || 'Failed to save payroll settings.', 'error'); } finally { setSaving(false); } };
  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md"><DialogTitle>{text.title}</DialogTitle><DialogContent dividers><Stack spacing={2}>
    <Box><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{text.section}</Typography><Typography variant="body2" color="text.secondary">{text.help}</Typography></Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{factories.length > 1 && <TextField select size="small" label={text.factory} value={factoryId} onChange={(event) => setFactoryId(event.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">{text.all}</MenuItem>{factories.map((factory) => <MenuItem key={factory.id} value={String(factory.id)}>{languageCode === 'ko' ? factory.nameKo || factory.name : languageCode === 'vi' ? factory.nameVi || factory.name : factory.name}</MenuItem>)}</TextField>}<TextField size="small" fullWidth placeholder={text.search} value={search} onChange={(event) => setSearch(event.target.value)} /></Stack>
    <DragDropContext onDragEnd={move}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ opacity: loading ? 0.5 : 1 }}><EmployeeList id="full-off" title={text.off} rows={visible.filter((row) => !selected.has(Number(row.id)))} empty={text.empty} /><EmployeeList id="full-on" title={text.on} rows={visible.filter((row) => selected.has(Number(row.id)))} empty={text.empty} /></Stack></DragDropContext>
  </Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>{text.cancel}</Button><SaveButton onClick={save} loading={saving} disabled={loading}>{text.save}</SaveButton></DialogActions></Dialog>;
};

export default PayrollSettingsDialog;
