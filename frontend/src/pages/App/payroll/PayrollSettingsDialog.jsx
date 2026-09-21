import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { isFormerEmployee } from '../attendance/attendanceEmployment';
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
  ko: { title: '출퇴근·급여 관리 대상 설정', section: '직원별 관리 구분', help: '출퇴근 관리 제외 직원은 출퇴근 대상 인원·기록 등록에서 제외하고 급여는 만근으로 계산합니다. 급여 제외 직원은 출퇴근과 급여 모두 제외합니다. 제외 시 과거 출퇴근 기록도 관리 안 함으로 보존하며, 일반 직원으로 되돌리면 다시 관리합니다.', normal: '일반 직원', attendance: '출퇴근 관리 제외', payroll: '출퇴근·급여 제외', showRetired: '퇴사 직원까지 보기', retired: '퇴사', factory: '공장', all: '전체 공장', search: '이름 또는 사번 검색', empty: '직원이 없습니다.', cancel: '취소', save: '저장', saved: '출퇴근·급여 관리 대상 설정을 저장했습니다.' },
  en: { title: 'Attendance and Payroll Settings', section: 'Employee Management', help: 'Attendance-exempt employees are excluded from attendance counts and entry, with payroll calculated as fully present. Payroll-exempt employees are excluded from both. Previous attendance is retained as unmanaged; returning to standard reactivates it.', normal: 'Standard Employees', attendance: 'Attendance Exempt', payroll: 'Attendance & Payroll Exempt', showRetired: 'Include former employees', retired: 'Former', factory: 'Factory', all: 'All Factories', search: 'Search name or employee no.', empty: 'No employees.', cancel: 'Cancel', save: 'Save', saved: 'Attendance and payroll settings saved.' },
  vi: { title: 'Cài đặt đối tượng chấm công và tính lương', section: 'Phân loại nhân viên', help: 'Nhân viên miễn chấm công không nằm trong số người cần chấm công và không nhập chấm công, nhưng được tính đủ công khi tính lương. Nhân viên miễn tính lương được loại khỏi cả hai. Dữ liệu cũ được giữ ở trạng thái không quản lý; chuyển về thông thường sẽ quản lý lại.', normal: 'Nhân viên thông thường', attendance: 'Miễn chấm công', payroll: 'Miễn chấm công và tính lương', showRetired: 'Hiện cả nhân viên đã nghỉ', retired: 'Đã nghỉ', factory: 'Nhà máy', all: 'Tất cả nhà máy', search: 'Tìm tên hoặc mã nhân viên', empty: 'Không có nhân viên.', cancel: 'Hủy', save: 'Lưu', saved: 'Đã lưu cài đặt chấm công và tính lương.' },
};

const EmployeeList = ({ id, title, rows, empty, retired, disabled }) => <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography><Chip size="small" variant="outlined" label={rows.length} />
  </Stack>
  <Droppable droppableId={id}>{(provided, snapshot) => <Stack ref={provided.innerRef} {...provided.droppableProps} spacing={0.75} sx={{ p: 1, minHeight: 300, maxHeight: 440, overflowY: 'auto', bgcolor: snapshot.isDraggingOver ? 'action.hover' : 'background.paper' }}>
    {rows.map((employee, index) => <Draggable key={employee.id} draggableId={String(employee.id)} index={index} isDragDisabled={disabled}>{(drag, state) => <Paper ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} variant="outlined" sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', boxShadow: state.isDragging ? 4 : 0 }}>
      <DragIndicatorIcon fontSize="small" color="disabled" /><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{employee.name || employee.email || '-'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{[employee.employeeNo, employee.role?.name].filter(Boolean).join(' · ') || '-'}</Typography></Box>
      {isFormerEmployee(employee) && <Chip size="small" label={retired} />}
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
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    setEmployeeBaseline('');
    setEmployees([]);
    setLoading(true);
    requestJSON('/payroll/settings' + buildQueryString({ orgId }), { forceRefresh: true })
      .then((settings) => {
        if (cancelled) return;
        const rows = Array.isArray(settings?.employees) ? settings.employees : [];
        const nextSelected = new Set(rows.filter((row) => row.alwaysFullAttendance).map((row) => Number(row.id)));
        const nextPayrollExcluded = new Set(rows.filter((row) => row.payrollExcluded).map((row) => Number(row.id)));
        setEmployees(rows); setAttendanceSelected(nextSelected); setPayrollExcluded(nextPayrollExcluded);
        setEmployeeBaseline(employeeSettingsSignature(nextSelected, nextPayrollExcluded));
      }).catch((error) => showNotification(error?.message || 'Failed to load payroll settings.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orgId, showNotification]);

  const factories = useMemo(() => Array.from(new Map(employees.filter((row) => row.factory).map((row) => [row.factory.id, row.factory])).values()), [employees]);
  const visible = useMemo(() => employees.filter((row) => (showRetired || !isFormerEmployee(row)) && (!factoryId || String(row.factoryId) === factoryId) && (!search.trim() || `${row.name || ''} ${row.employeeNo || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [employees, factoryId, search, showRetired]);
  const dirty = employeeBaseline !== '' && employeeSettingsSignature(attendanceSelected, payrollExcluded) !== employeeBaseline;
  useUnsavedChanges(open && dirty);
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
        <FormControlLabel control={<Switch checked={showRetired} onChange={(event) => setShowRetired(event.target.checked)} />} label={text.showRetired} />
        <DragDropContext onDragEnd={move}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}><EmployeeList id="normal" title={text.normal} rows={visible.filter((row) => !attendanceSelected.has(Number(row.id)) && !payrollExcluded.has(Number(row.id)))} empty={text.empty} retired={text.retired} disabled={loading || saving} /><EmployeeList id="attendance-exception" title={text.attendance} rows={visible.filter((row) => attendanceSelected.has(Number(row.id)))} empty={text.empty} retired={text.retired} disabled={loading || saving} /><EmployeeList id="payroll-exception" title={text.payroll} rows={visible.filter((row) => payrollExcluded.has(Number(row.id)))} empty={text.empty} retired={text.retired} disabled={loading || saving} /></Stack></DragDropContext>
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>{text.cancel}</Button><SaveButton onClick={save} loading={saving} disabled={loading || !dirty}>{text.save}</SaveButton></DialogActions>
  </Dialog>;
};

export default PayrollSettingsDialog;
