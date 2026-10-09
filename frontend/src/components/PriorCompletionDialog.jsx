import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';

const TEXT = {
  ko: { title: '작업기록 없이 이전 완료 등록', reason: '사유', period: '완료 시점', month: '월만 알고 있음', day: '정확한 날짜', style: '스타일', order: '주문량', prior: '이전 완료', quantity: '추가 등록 수량', save: '등록', close: '닫기', separate: '기존 작업기록에 포함되지 않은 완료 수량입니다.', history: '등록 이력', cancel: '등록 취소', note: '취소 사유', canceled: '취소됨', hint: '월만 입력하면 달력의 임의 날짜에 배치하지 않습니다. AT·공임·급여에는 반영하지 않습니다.', failed: '등록에 실패했습니다. 입력값과 최신 이력을 확인해 주세요.' },
  en: { title: 'Register previously completed production', reason: 'Reason', period: 'Completed in/on', month: 'Month only', day: 'Exact date', style: 'Style', order: 'Ordered', prior: 'Previous completion', quantity: 'Additional quantity', save: 'Register', close: 'Close', separate: 'These garments are not included in existing work records.', history: 'History', cancel: 'Cancel entry', note: 'Cancellation reason', canceled: 'Canceled', hint: 'Month-only entries are not assigned an invented calendar date. No effect on AT, labor pay or payroll.', failed: 'Unable to save. Check the input and latest history.' },
  vi: { title: 'Ghi nhận sản lượng đã hoàn thành trước đây', reason: 'Lý do', period: 'Thời điểm hoàn thành', month: 'Chỉ biết tháng', day: 'Ngày chính xác', style: 'Kiểu', order: 'Đặt hàng', prior: 'Đã hoàn thành trước', quantity: 'Số lượng ghi nhận thêm', save: 'Ghi nhận', close: 'Đóng', separate: 'Sản lượng này chưa được tính trong nhật ký công việc hiện có.', history: 'Lịch sử', cancel: 'Hủy ghi nhận', note: 'Lý do hủy', canceled: 'Đã hủy', hint: 'Không gán ngày tùy ý khi chỉ biết tháng. Không ảnh hưởng AT, tiền công hoặc bảng lương.', failed: 'Không thể lưu. Vui lòng kiểm tra dữ liệu và lịch sử mới nhất.' },
};
const ERROR = {
  ko: { PRIOR_QUANTITY_EXCEEDS_ORDER: '이전 완료 합계가 주문량을 초과합니다. 최신 수량을 확인하세요.', EXISTING_COMPLETION_REQUIRES_REVIEW: '이미 완료 승인된 배정이 있습니다. 중복 집계를 막기 위해 기존 완료 근거를 먼저 확인해 주세요.', ORDER_FINALLY_LOCKED: '최종 정산이 잠긴 주문입니다.', ACTIVE_EMPLOYEE_REQUIRED: '이 조직의 활성 관리 직원 계정이 필요합니다.', INVALID_COMPLETION_PERIOD: '올바른 완료 월 또는 날짜를 입력하세요.', FUTURE_COMPLETION_PERIOD: '미래 완료 시점은 등록할 수 없습니다.' },
  en: { PRIOR_QUANTITY_EXCEEDS_ORDER: 'Previous completion exceeds the order quantity.', EXISTING_COMPLETION_REQUIRES_REVIEW: 'An assignment is already approved as completed. Review its completion before adding quantities.', ORDER_FINALLY_LOCKED: 'The order is finally locked.', ACTIVE_EMPLOYEE_REQUIRED: 'An active management employee in this organization is required.', INVALID_COMPLETION_PERIOD: 'Enter a valid completion month or date.', FUTURE_COMPLETION_PERIOD: 'Completion cannot be in the future.' },
  vi: { PRIOR_QUANTITY_EXCEEDS_ORDER: 'Tổng sản lượng trước đây vượt số lượng đặt hàng.', EXISTING_COMPLETION_REQUIRES_REVIEW: 'Đã có phân công được xác nhận hoàn thành. Hãy kiểm tra trước để tránh tính trùng.', ORDER_FINALLY_LOCKED: 'Đơn hàng đã khóa quyết toán.', ACTIVE_EMPLOYEE_REQUIRED: 'Cần tài khoản nhân viên quản lý đang hoạt động trong tổ chức.', INVALID_COMPLETION_PERIOD: 'Nhập tháng hoặc ngày hoàn thành hợp lệ.', FUTURE_COMPLETION_PERIOD: 'Không thể ghi nhận hoàn thành trong tương lai.' },
};

export default function PriorCompletionDialog({ rows, selectedStyleId, orgId, languageCode, onClose, onSaved }) {
  const text = TEXT[languageCode] || TEXT.en;
  const [entries, setEntries] = useState(() => rows.map(row => ({ row, selected: row.styleId === selectedStyleId && row.orderedQuantity > row.producedQuantity, quantity: Math.max(0, row.orderedQuantity - row.producedQuantity), clientKey: crypto.randomUUID() })));
  const [reasons, setReasons] = useState([]);
  const [reasonId, setReasonId] = useState('');
  const [precision, setPrecision] = useState('month');
  const [period, setPeriod] = useState('');
  const [separate, setSeparate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    let active = true;
    requestJSON(`/prior-completion-reasons${buildQueryString({ orgId })}`, { skipCache: true }).then(result => {
      if (active) { setReasons(result); setReasonId(result[0]?.id || ''); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [orgId]);
  const selected = entries.filter(entry => entry.selected);
  const selectable = entries.filter(entry => entry.row.orderedQuantity > entry.row.producedQuantity);
  const showError = e => setError(ERROR[languageCode]?.[e.message] || ERROR.en[e.message] || text.failed);
  const save = async () => {
    setSaving(true); setError('');
    try {
      await requestJSON(`/prior-production-completions${buildQueryString({ orgId })}`, { method: 'POST', body: JSON.stringify({ entries: selected.map(entry => ({ workOrderId: entry.row.workOrderId, styleId: entry.row.styleId, quantity: Number(entry.quantity), reasonId: Number(reasonId), completedPeriod: period, clientKey: entry.clientKey, acknowledgeSeparateRecords: separate })) }) });
      await onSaved(); onClose();
    } catch (e) { showError(e); } finally { setSaving(false); }
  };
  const cancel = async () => {
    setSaving(true); setError('');
    try {
      await requestJSON(`/prior-production-completions/${cancelId}/cancel${buildQueryString({ orgId })}`, { method: 'POST', body: JSON.stringify({ note }) });
      await onSaved(); onClose();
    } catch (e) { showError(e); } finally { setSaving(false); }
  };
  return <Dialog open onClose={() => { if (!saving) onClose(); }} maxWidth="md" fullWidth>
    <DialogTitle>{text.title}</DialogTitle>
    <DialogContent>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }}>
        <TextField select label={text.reason} value={reasonId} onChange={e => setReasonId(e.target.value)} size="small" sx={{ flex: 1 }} disabled={saving}>{reasons.map(reason => <MenuItem key={reason.id} value={reason.id}>{languageCode === 'ko' ? reason.nameKo : languageCode === 'vi' ? reason.nameVi : reason.nameEn}</MenuItem>)}</TextField>
        <TextField select label={text.period} value={precision} onChange={e => { setPrecision(e.target.value); setPeriod(''); }} size="small" disabled={saving}><MenuItem value="month">{text.month}</MenuItem><MenuItem value="date">{text.day}</MenuItem></TextField>
        <TextField type={precision} label={text.period} value={period} onChange={e => setPeriod(e.target.value)} InputLabelProps={{ shrink: true }} size="small" disabled={saving} />
      </Stack>
      <Table size="small"><TableHead><TableRow><TableCell padding="checkbox"><Checkbox inputProps={{ 'aria-label': text.style }} disabled={saving || !selectable.length} checked={selectable.length > 0 && selected.length === selectable.length} indeterminate={selected.length > 0 && selected.length < selectable.length} onChange={e => { setSeparate(false); setEntries(items => items.map(item => ({ ...item, selected: e.target.checked && item.row.orderedQuantity > item.row.producedQuantity }))); }} /></TableCell><TableCell>{text.style}</TableCell><TableCell align="right">{text.order}</TableCell><TableCell align="right">{text.prior}</TableCell><TableCell>{text.quantity}</TableCell></TableRow></TableHead>
        <TableBody>{entries.map((entry, index) => <TableRow key={entry.row.styleId}>
          <TableCell padding="checkbox"><Checkbox inputProps={{ 'aria-label': entry.row.styleName || entry.row.styleCode }} disabled={saving || entry.row.orderedQuantity <= entry.row.producedQuantity} checked={entry.selected} onChange={e => { setSeparate(false); setEntries(items => items.map((item, i) => i === index ? { ...item, selected: e.target.checked } : item)); }} /></TableCell>
          <TableCell>{entry.row.styleName || entry.row.styleCode}</TableCell><TableCell align="right">{entry.row.orderedQuantity}</TableCell><TableCell align="right">{entry.row.priorQuantity || 0}</TableCell>
          <TableCell><TextField type="number" size="small" value={entry.quantity} disabled={saving || !entry.selected} inputProps={{ min: 1, max: entry.row.orderedQuantity - (entry.row.priorQuantity || 0), step: 1 }} onChange={e => setEntries(items => items.map((item, i) => i === index ? { ...item, quantity: e.target.value, clientKey: crypto.randomUUID() } : item))} sx={{ width: 120 }} /></TableCell>
        </TableRow>)}</TableBody></Table>
      <FormControlLabel control={<Checkbox checked={separate} disabled={saving} onChange={e => setSeparate(e.target.checked)} />} label={text.separate} />
      <Typography variant="caption" display="block" color="text.secondary">{text.hint}</Typography>
      {entries.some(entry => entry.row.priorCompletions?.length) && <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography fontWeight={700}>{text.history}</Typography>
        {entries.flatMap(entry => (entry.row.priorCompletions || []).map(history => <Stack key={history.id} direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ flex: 1 }}>{entry.row.styleName} · {history.quantity} · {history.completedPeriod} · {languageCode === 'ko' ? history.reason.nameKo : languageCode === 'vi' ? history.reason.nameVi : history.reason.nameEn} · {history.createdByEmployee.name || history.createdByEmployee.employeeNo} (#{history.createdByEmployee.id}) · {new Date(history.createdAt).toLocaleString()}{history.canceledAt ? ` · ${text.canceled}: ${history.canceledByEmployee?.name || history.canceledByEmployee?.employeeNo} · ${history.cancellationNote}` : ''}</Typography>
          {!history.canceledAt && <Button size="small" disabled={saving} onClick={() => { setCancelId(history.id); setNote(''); }}>{text.cancel}</Button>}
        </Stack>))}
      </Stack>}
      {cancelId && <Stack direction="row" spacing={1} sx={{ mt: 2 }}><TextField label={text.note} value={note} onChange={e => setNote(e.target.value)} size="small" fullWidth disabled={saving} /><Button color="error" disabled={saving || !note.trim()} onClick={cancel}>{text.cancel}</Button></Stack>}
    </DialogContent>
    <DialogActions><Button disabled={saving} onClick={onClose}>{text.close}</Button><Button variant="contained" disabled={saving || !separate || !period || !reasonId || !selected.length || selected.some(entry => !Number.isInteger(Number(entry.quantity)) || Number(entry.quantity) <= 0)} onClick={save}>{text.save}</Button></DialogActions>
  </Dialog>;
}
