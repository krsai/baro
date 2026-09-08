import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import SaveButton from '../../../components/SaveButton';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

const employeeSettingsSignature = (attendanceSelected, payrollExcluded) => JSON.stringify({
  alwaysFullAttendanceEmployeeIds: Array.from(attendanceSelected).sort((a, b) => a - b),
  payrollExcludedEmployeeIds: Array.from(payrollExcluded).sort((a, b) => a - b),
});

const TEXT = {
  ko: { title: '급여 계산 설정', section: '직원별 예외 설정', help: '근태 예외 직원은 출퇴근 기록 없이 만근으로 처리하며, 급여 예외 직원은 재직 중이어도 급여 계산 대상에서 제외합니다.', normal: '일반 직원', attendance: '근태 예외 직원', payroll: '급여 예외 직원', factory: '공장', all: '전체 공장', search: '이름 또는 사번 검색', empty: '직원이 없습니다.', cancel: '취소', save: '저장', saved: '급여 계산 설정을 저장했습니다.' },
  en: { title: 'Payroll Settings', section: 'Employee Exceptions', help: 'Attendance exceptions are treated as fully present; payroll exceptions are excluded from payroll while still employed.', normal: 'Standard Employees', attendance: 'Attendance Exceptions', payroll: 'Payroll Exceptions', factory: 'Factory', all: 'All Factories', search: 'Search name or employee no.', empty: 'No employees.', cancel: 'Cancel', save: 'Save', saved: 'Payroll settings saved.' },
  vi: { title: 'Cài đặt tính lương', section: 'Ngoại lệ theo nhân viên', help: 'Ngoại lệ chấm công được tính đủ công; ngoại lệ tiền lương không được đưa vào tính lương dù vẫn đang làm việc.', normal: 'Nhân viên thông thường', attendance: 'Ngoại lệ chấm công', payroll: 'Ngoại lệ tiền lương', factory: 'Nhà máy', all: 'Tất cả nhà máy', search: 'Tìm tên hoặc mã nhân viên', empty: 'Không có nhân viên.', cancel: 'Hủy', save: 'Lưu', saved: 'Đã lưu cài đặt tính lương.' },
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

// 급여 타입별 근무 요일·시간 기준(근로 기준일)은 급여 체계 화면의 설정으로 옮겼다
// (PayTypeScheduleSettingsDialog, 조직 전체 값이라 공장 탭과 무관). 이 다이얼로그는
// 이제 급여 계산 실행 시점의 직원별 예외(근태 예외/급여 예외)만 관리한다.
const PayrollSettingsDialog = ({ open, onClose, orgId, languageCode, onSaved, showNotification }) => {
  const text = TEXT[languageCode] || TEXT.en;
  const [employees, setEmployees] = useState([]);
  const [attendanceSelected, setAttendanceSelected] = useState(new Set());
  const [payrollExcluded, setPayrollExcluded] = useState(new Set());
  const [employeeBaseline, setEmployeeBaseline] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    requestJSON('/payroll/settings' + buildQueryString({ orgId }), { forceRefresh: true })
      .then((settings) => {
        const rows = Array.isArray(settings?.employees) ? settings.employees : [];
        const nextSelected = new Set(rows.filter((row) => row.alwaysFullAttendance).map((row) => Number(row.id)));
        const nextPayrollExcluded = new Set(rows.filter((row) => row.payrollExcluded).map((row) => Number(row.id)));
        setEmployees(rows); setAttendanceSelected(nextSelected); setPayrollExcluded(nextPayrollExcluded);
        setEmployeeBaseline(employeeSettingsSignature(nextSelected, nextPayrollExcluded));
      }).catch((error) => showNotification(error?.message || 'Failed to load payroll settings.', 'error'))
      .finally(() => setLoading(false));
  }, [open, orgId, showNotification]);

  const factories = useMemo(() => Array.from(new Map(employees.filter((row) => row.factory).map((row) => [row.factory.id, row.factory])).values()), [employees]);
  const visible = useMemo(() => employees.filter((row) => (!factoryId || String(row.factoryId) === factoryId) && (!search.trim() || `${row.name || ''} ${row.employeeNo || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [employees, factoryId, search]);
  const dirty = employeeBaseline !== '' && employeeSettingsSignature(attendanceSelected, payrollExcluded) !== employeeBaseline;
  const move = ({ destination, source, draggableId }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const employeeId = Number(draggableId);
    setAttendanceSelected((before) => {
      const next = new Set(before);
      destination.droppableId === 'attendance-exception' ? next.add(employeeId) : next.delete(employeeId);
      return next;
    });
    setPayrollExcluded((before) => {
      const next = new Set(before);
      destination.droppableId === 'payroll-exception' ? next.add(employeeId) : next.delete(employeeId);
      return next;
    });
  };
  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await requestJSON('/payroll/settings' + buildQueryString({ orgId }), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alwaysFullAttendanceEmployeeIds: Array.from(attendanceSelected), payrollExcludedEmployeeIds: Array.from(payrollExcluded) }) });
      setEmployeeBaseline(employeeSettingsSignature(attendanceSelected, payrollExcluded));
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES, WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId, source: 'payroll-settings-save' });
      showNotification(text.saved, 'success'); onSaved?.(); onClose();
    } catch (error) { showNotification(error?.message || 'Failed to save payroll settings.', 'error'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>{text.title}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Box><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{text.section}</Typography><Typography variant="body2" color="text.secondary">{text.help}</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{factories.length > 1 && <TextField select size="small" label={text.factory} value={factoryId} onChange={(event) => setFactoryId(event.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">{text.all}</MenuItem>{factories.map((factory) => <MenuItem key={factory.id} value={String(factory.id)}>{languageCode === 'ko' ? factory.nameKo || factory.name : languageCode === 'vi' ? factory.nameVi || factory.name : factory.name}</MenuItem>)}</TextField>}<TextField size="small" fullWidth placeholder={text.search} value={search} onChange={(event) => setSearch(event.target.value)} /></Stack>
        <DragDropContext onDragEnd={move}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}><EmployeeList id="normal" title={text.normal} rows={visible.filter((row) => !attendanceSelected.has(Number(row.id)) && !payrollExcluded.has(Number(row.id)))} empty={text.empty} /><EmployeeList id="attendance-exception" title={text.attendance} rows={visible.filter((row) => attendanceSelected.has(Number(row.id)))} empty={text.empty} /><EmployeeList id="payroll-exception" title={text.payroll} rows={visible.filter((row) => payrollExcluded.has(Number(row.id)))} empty={text.empty} /></Stack></DragDropContext>
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>{text.cancel}</Button><SaveButton onClick={save} loading={saving} disabled={loading || !dirty}>{text.save}</SaveButton></DialogActions>
  </Dialog>;
};

export default PayrollSettingsDialog;
