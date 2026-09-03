import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import SaveButton from '../../../components/SaveButton';
import { getPayTypeLabel } from '../../../constants/payType';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

const WEEKDAYS = { ko: ['월', '화', '수', '목', '금', '토', '일'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], vi: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] };
const toPolicyDraft = (row) => ({ ...row, workWeekdays: [...(row.workWeekdays || [])].map(Number).sort(), breakMinutes: String(row.breakMinutes), workdayMinimumHours: String(Number(row.workdayMinimumMinutes) / 60) });
const policyPayload = (rows) => rows.map((row) => ({ payType: row.payType, workWeekdays: [...row.workWeekdays].sort(), standardClockIn: row.standardClockIn, standardClockOut: row.standardClockOut, breakMinutes: Number(row.breakMinutes), workdayMinimumMinutes: Math.round(Number(row.workdayMinimumHours) * 60) }));
const settingsSignature = (policies, selected) => JSON.stringify({ policies: policyPayload(policies), alwaysFullAttendanceEmployeeIds: Array.from(selected).sort((a, b) => a - b) });
const timeMinutes = (value) => { const [hour, minute] = String(value || '').split(':').map(Number); return Number.isFinite(hour + minute) ? hour * 60 + minute : 0; };
const dailyMinutes = (row) => { let span = timeMinutes(row.standardClockOut) - timeMinutes(row.standardClockIn); if (span <= 0) span += 1440; return Math.max(0, span - Number(row.breakMinutes || 0)); };

const TEXT = {
  ko: { title: '급여 계산 설정', section: '상시 만근', help: '출퇴근 기록과 관계없이 한 달 만근으로 처리할 직원을 설정합니다.', off: '미적용 직원', on: '적용 직원', factory: '공장', all: '전체 공장', search: '이름 또는 사번 검색', empty: '직원이 없습니다.', cancel: '취소', save: '저장', saved: '급여 계산 설정을 저장했습니다.' },
  en: { title: 'Payroll Settings', section: 'Always Full Attendance', help: 'Choose employees treated as fully present for the month regardless of attendance records.', off: 'Not Applied', on: 'Applied', factory: 'Factory', all: 'All Factories', search: 'Search name or employee no.', empty: 'No employees.', cancel: 'Cancel', save: 'Save', saved: 'Payroll settings saved.' },
  vi: { title: 'Cài đặt tính lương', section: 'Luôn đủ công', help: 'Chọn nhân viên được tính đủ công cả tháng không phụ thuộc dữ liệu chấm công.', off: 'Chưa áp dụng', on: 'Đã áp dụng', factory: 'Nhà máy', all: 'Tất cả nhà máy', search: 'Tìm tên hoặc mã nhân viên', empty: 'Không có nhân viên.', cancel: 'Hủy', save: 'Lưu', saved: 'Đã lưu cài đặt tính lương.' },
};
const SETTINGS_TEXT = {
  ko: { criteria: '급여 타입별 만근 기준', people: '상시 만근 직원', criteriaHelp: '급여 타입마다 만근 판단에 사용할 근무 일정과 근무일 인정 기준을 설정합니다.', days: '근무 요일', clockIn: '기준 출근 시간', clockOut: '기준 퇴근 시간', breakTime: '휴게시간 (분)', minimum: '근무일 인정 기준 (시간)', daily: '1일 기준 근무시간', invalid: '각 급여 타입의 근무 요일과 시간을 올바르게 입력해 주세요.' },
  en: { criteria: 'Full-attendance Criteria', people: 'Always-full Employees', criteriaHelp: 'Set the work schedule and daily qualification threshold for each pay type.', days: 'Workdays', clockIn: 'Standard clock-in', clockOut: 'Standard clock-out', breakTime: 'Break (minutes)', minimum: 'Workday threshold (hours)', daily: 'Standard daily hours', invalid: 'Enter valid workdays and hours for every pay type.' },
  vi: { criteria: 'Tiêu chí đủ công', people: 'Nhân viên luôn đủ công', criteriaHelp: 'Cài lịch làm việc và ngưỡng công nhận ngày công theo từng loại lương.', days: 'Ngày làm việc', clockIn: 'Giờ vào chuẩn', clockOut: 'Giờ ra chuẩn', breakTime: 'Nghỉ (phút)', minimum: 'Ngưỡng ngày công (giờ)', daily: 'Giờ làm chuẩn/ngày', invalid: 'Nhập ngày và giờ làm việc hợp lệ cho từng loại lương.' },
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
  const labels = SETTINGS_TEXT[languageCode] || SETTINGS_TEXT.en;
  const [tab, setTab] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [policies, setPolicies] = useState([]);
  const [baseline, setBaseline] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    Promise.all([
      requestJSON('/payroll/settings' + buildQueryString({ orgId }), { forceRefresh: true }),
      requestJSON('/employee-pay-type-policies' + buildQueryString({ orgId }), { forceRefresh: true }),
    ]).then(([settings, policyRows]) => {
      const rows = Array.isArray(settings?.employees) ? settings.employees : [];
      const nextSelected = new Set(rows.filter((row) => row.alwaysFullAttendance).map((row) => Number(row.id)));
      const nextPolicies = (Array.isArray(policyRows) ? policyRows : []).map(toPolicyDraft);
      setEmployees(rows); setSelected(nextSelected); setPolicies(nextPolicies);
      setBaseline(settingsSignature(nextPolicies, nextSelected));
    }).catch((error) => showNotification(error?.message || 'Failed to load payroll settings.', 'error'))
      .finally(() => setLoading(false));
  }, [open, orgId, showNotification]);

  const factories = useMemo(() => Array.from(new Map(employees.filter((row) => row.factory).map((row) => [row.factory.id, row.factory])).values()), [employees]);
  const visible = useMemo(() => employees.filter((row) => (!factoryId || String(row.factoryId) === factoryId) && (!search.trim() || `${row.name || ''} ${row.employeeNo || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [employees, factoryId, search]);
  const dirty = baseline !== '' && settingsSignature(policies, selected) !== baseline;
  const valid = policies.length === 3 && policies.every((row) => row.workWeekdays.length && dailyMinutes(row) > 0 && Number(row.workdayMinimumHours) > 0 && Number(row.workdayMinimumHours) * 60 <= dailyMinutes(row));
  const editPolicy = (type, key, value) => setPolicies((rows) => rows.map((row) => row.payType === type ? { ...row, [key]: value } : row));
  const toggleDay = (type, day) => setPolicies((rows) => rows.map((row) => row.payType !== type ? row : { ...row, workWeekdays: row.workWeekdays.includes(day) ? row.workWeekdays.filter((value) => value !== day) : [...row.workWeekdays, day].sort() }));
  const move = ({ destination, source, draggableId }) => { if (!destination || destination.droppableId === source.droppableId) return; setSelected((before) => { const next = new Set(before); destination.droppableId === 'full-on' ? next.add(Number(draggableId)) : next.delete(Number(draggableId)); return next; }); };
  const save = async () => {
    if (!dirty || !valid) return;
    setSaving(true);
    try {
      await Promise.all([
        requestJSON('/payroll/settings' + buildQueryString({ orgId }), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alwaysFullAttendanceEmployeeIds: Array.from(selected) }) }),
        requestJSON('/employee-pay-type-policies' + buildQueryString({ orgId }), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policies: policyPayload(policies) }) }),
      ]);
      setBaseline(settingsSignature(policies, selected));
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES, WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId, source: 'payroll-settings-save' });
      showNotification(text.saved, 'success'); onSaved?.(); onClose();
    } catch (error) { showNotification(error?.message || 'Failed to save payroll settings.', 'error'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>{text.title}</DialogTitle>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}><Tab label={labels.criteria} /><Tab label={labels.people} /></Tabs>
    <DialogContent dividers>
      {tab === 0 && <Stack spacing={2}><Typography variant="body2" color="text.secondary">{labels.criteriaHelp}</Typography>{policies.map((row) => <Paper key={row.payType} variant="outlined" sx={{ p: 2 }}><Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1.5 }}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{getPayTypeLabel(row.payType, row.payType, languageCode)}</Typography><Typography variant="caption" color="text.secondary">{row.payType}</Typography></Stack><Typography variant="body2">{labels.days}</Typography><Stack direction="row" flexWrap="wrap" sx={{ mb: 1.5 }}>{(WEEKDAYS[languageCode] || WEEKDAYS.en).map((label, index) => <FormControlLabel key={label} control={<Checkbox size="small" checked={row.workWeekdays.includes(index + 1)} onChange={() => toggleDay(row.payType, index + 1)} />} label={label} />)}</Stack><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1 }}><TextField size="small" type="time" label={labels.clockIn} value={row.standardClockIn} onChange={(event) => editPolicy(row.payType, 'standardClockIn', event.target.value)} InputLabelProps={{ shrink: true }} /><TextField size="small" type="time" label={labels.clockOut} value={row.standardClockOut} onChange={(event) => editPolicy(row.payType, 'standardClockOut', event.target.value)} InputLabelProps={{ shrink: true }} /><TextField size="small" type="number" label={labels.breakTime} value={row.breakMinutes} onChange={(event) => editPolicy(row.payType, 'breakMinutes', event.target.value)} /><TextField size="small" type="number" label={labels.minimum} value={row.workdayMinimumHours} onChange={(event) => editPolicy(row.payType, 'workdayMinimumHours', event.target.value)} inputProps={{ min: .5, step: .5 }} /><Paper variant="outlined" sx={{ px: 1.5, py: .75, bgcolor: 'grey.50' }}><Typography variant="caption" color="text.secondary">{labels.daily}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{dailyMinutes(row) / 60}h</Typography></Paper></Box></Paper>)}</Stack>}
      {tab === 1 && <Stack spacing={2}><Box><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{text.section}</Typography><Typography variant="body2" color="text.secondary">{text.help}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{factories.length > 1 && <TextField select size="small" label={text.factory} value={factoryId} onChange={(event) => setFactoryId(event.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">{text.all}</MenuItem>{factories.map((factory) => <MenuItem key={factory.id} value={String(factory.id)}>{languageCode === 'ko' ? factory.nameKo || factory.name : languageCode === 'vi' ? factory.nameVi || factory.name : factory.name}</MenuItem>)}</TextField>}<TextField size="small" fullWidth placeholder={text.search} value={search} onChange={(event) => setSearch(event.target.value)} /></Stack><DragDropContext onDragEnd={move}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}><EmployeeList id="full-off" title={text.off} rows={visible.filter((row) => !selected.has(Number(row.id)))} empty={text.empty} /><EmployeeList id="full-on" title={text.on} rows={visible.filter((row) => selected.has(Number(row.id)))} empty={text.empty} /></Stack></DragDropContext></Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>{text.cancel}</Button><SaveButton onClick={save} loading={saving} disabled={loading || !dirty || !valid}>{text.save}</SaveButton></DialogActions>
  </Dialog>;
};

export default PayrollSettingsDialog;
