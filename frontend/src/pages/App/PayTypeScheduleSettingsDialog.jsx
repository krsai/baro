import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import SaveButton from '../../components/SaveButton';
import { getPayTypeLabel } from '../../constants/payType';
import { labelChipSx, LABEL_PALETTE } from '../../theme/labelPalette';
import { resolveNativeInputLocale } from '../../utils/appLanguage';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const WEEKDAYS = { ko: ['월', '화', '수', '목', '금', '토', '일'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], vi: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] };
// 급여 체계 화면의 급여 타입 배지(사무=blue, 생산(고정)=green, 생산(변동)=orange)와 동일한 팔레트를 재사용한다.
const PAY_TYPE_PALETTE = { GENERAL: 'blue', OUTPUT_FIXED: 'green', OUTPUT: 'orange' };
const toPolicyDraft = (row) => ({ ...row, workWeekdays: [...(row.workWeekdays || [])].map(Number).sort(), breakMinutes: String(row.breakMinutes), workdayMinimumHours: String(Number(row.workdayMinimumMinutes) / 60) });
const policyPayload = (rows) => rows.map((row) => ({ payType: row.payType, workWeekdays: [...row.workWeekdays].sort(), standardClockIn: row.standardClockIn, standardClockOut: row.standardClockOut, breakMinutes: Number(row.breakMinutes), workdayMinimumMinutes: Math.round(Number(row.workdayMinimumHours) * 60) }));
const policySignature = (policies) => JSON.stringify(policyPayload(policies));
const timeMinutes = (value) => { const [hour, minute] = String(value || '').split(':').map(Number); return Number.isFinite(hour + minute) ? hour * 60 + minute : 0; };
const dailyMinutes = (row) => { let span = timeMinutes(row.standardClockOut) - timeMinutes(row.standardClockIn); if (span <= 0) span += 1440; return Math.max(0, span - Number(row.breakMinutes || 0)); };

const TEXT = {
  ko: { title: '급여 타입별 근무 기준', help: '급여 타입마다 근태 판단에 사용할 근무 일정과 근무일 인정 기준을 설정합니다.', days: '근무 요일', clockIn: '기준 출근', clockOut: '기준 퇴근', breakTime: '휴게시간', minutes: '분', clockInFull: '기준 출근 시간', clockOutFull: '기준 퇴근 시간', breakTimeFull: '휴게시간 (분)', minimum: '근무일 인정 기준', hours: '시간', daily: '1일 근무', cancel: '취소', save: '저장', saved: '급여 타입별 근무 기준을 저장했습니다.' },
  en: { title: 'Pay Type Work Standards', help: 'Set the work schedule and daily qualification threshold used for attendance judgment, for each pay type.', days: 'Workdays', clockIn: 'Clock-in', clockOut: 'Clock-out', breakTime: 'Break', minutes: 'min', clockInFull: 'Standard clock-in', clockOutFull: 'Standard clock-out', breakTimeFull: 'Break (minutes)', minimum: 'Workday threshold', hours: 'hrs', daily: 'Per day', cancel: 'Cancel', save: 'Save', saved: 'Saved pay type work standards.' },
  vi: { title: 'Tiêu chuẩn làm việc theo loại lương', help: 'Cài lịch làm việc và ngưỡng công nhận ngày công dùng để xét chấm công, theo từng loại lương.', days: 'Ngày làm việc', clockIn: 'Giờ vào', clockOut: 'Giờ ra', breakTime: 'Nghỉ', minutes: 'phút', clockInFull: 'Giờ vào chuẩn', clockOutFull: 'Giờ ra chuẩn', breakTimeFull: 'Nghỉ (phút)', minimum: 'Ngưỡng ngày công', hours: 'giờ', daily: 'Mỗi ngày', cancel: 'Hủy', save: 'Lưu', saved: 'Đã lưu tiêu chuẩn làm việc theo loại lương.' },
};

// 급여 타입(사무/생산(고정)/생산(변동))별 근무 요일·기준 출퇴근 시간·휴게시간·근무일 인정
// 기준은 공장이 아니라 조직 전체에 적용되는 값이라, 급여 체계 화면의 공장 탭 선택과
// 무관하게 항상 같은 값을 조회/저장한다.
const PayTypeScheduleSettingsDialog = ({ open, onClose, orgId, languageCode, showNotification }) => {
  const text = TEXT[languageCode] || TEXT.en;
  const nativeInputLocale = resolveNativeInputLocale(languageCode);
  const [policies, setPolicies] = useState([]);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    requestJSON('/employee-pay-type-policies' + buildQueryString({ orgId }), { forceRefresh: true })
      .then((rows) => {
        const next = (Array.isArray(rows) ? rows : []).map(toPolicyDraft);
        setPolicies(next);
        setBaseline(policySignature(next));
      })
      .catch((error) => showNotification(error?.message || 'Failed to load pay type work standards.', 'error'))
      .finally(() => setLoading(false));
  }, [open, orgId, showNotification]);

  const dirty = baseline !== '' && policySignature(policies) !== baseline;
  useUnsavedChanges(open && dirty);
  const valid = policies.length === 3 && policies.every((row) => row.workWeekdays.length && dailyMinutes(row) > 0 && Number(row.workdayMinimumHours) > 0 && Number(row.workdayMinimumHours) * 60 <= dailyMinutes(row));
  const editPolicy = (type, key, value) => setPolicies((rows) => rows.map((row) => row.payType === type ? { ...row, [key]: value } : row));
  const setWeekdays = (type, days) => setPolicies((rows) => rows.map((row) => row.payType === type ? { ...row, workWeekdays: [...days].map(Number).sort((a, b) => a - b) } : row));

  const save = async () => {
    if (!dirty || !valid) return;
    setSaving(true);
    try {
      await requestJSON('/employee-pay-type-policies' + buildQueryString({ orgId }), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policies: policyPayload(policies) }) });
      setBaseline(policySignature(policies));
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId, source: 'pay-type-schedule-settings-save' });
      showNotification(text.saved, 'success');
      onClose();
    } catch (error) {
      showNotification(error?.message || 'Failed to save pay type work standards.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>{text.title}</DialogTitle>
    <DialogContent dividers sx={{ bgcolor: 'grey.50' }}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">{text.help}</Typography>
        {policies.map((row) => {
          const palette = LABEL_PALETTE[PAY_TYPE_PALETTE[row.payType]] || LABEL_PALETTE.blue;
          const hours = dailyMinutes(row) / 60;
          return <Paper key={row.payType} variant="outlined" sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: palette.border, bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={getPayTypeLabel(row.payType, row.payType, languageCode)} sx={labelChipSx(PAY_TYPE_PALETTE[row.payType])} />
                <Typography variant="caption" color="text.secondary">{row.payType}</Typography>
              </Stack>
              <Chip size="small" variant="outlined" label={`${text.daily} ${Number.isFinite(hours) ? hours : 0}${text.hours}`} sx={{ fontWeight: 700, borderColor: palette.border, color: palette.text, bgcolor: palette.background }} />
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>{text.days}</Typography>
            <ToggleButtonGroup
              value={row.workWeekdays}
              onChange={(_event, days) => setWeekdays(row.payType, days)}
              size="small"
              sx={{
                mb: 2, gap: 0.75, flexWrap: 'wrap',
                '& .MuiToggleButtonGroup-grouped': {
                  border: '1px solid', borderColor: 'divider', borderRadius: '50% !important',
                  m: 0, width: 34, height: 34, minWidth: 34, p: 0, fontSize: '0.72rem', fontWeight: 600,
                },
              }}
            >
              {(WEEKDAYS[languageCode] || WEEKDAYS.en).map((label, index) => {
                // 일요일은 선택 여부와 무관하게 항상 빨간 글자로 표시한다(한국 달력 관례).
                const isSunday = index === 6;
                const selected = row.workWeekdays.includes(index + 1);
                return <ToggleButton
                  key={label}
                  value={index + 1}
                  sx={{
                    color: `${isSunday ? '#c62828' : (selected ? palette.text : 'rgba(0, 0, 0, 0.6)')} !important`,
                    bgcolor: selected ? `${palette.background} !important` : undefined,
                    borderColor: selected ? `${palette.border} !important` : 'divider',
                  }}
                >{label}</ToggleButton>;
              })}
            </ToggleButtonGroup>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(130px, 1fr))' }, gap: 1.25 }}>
              <TextField size="small" type="time" label={text.clockIn} value={row.standardClockIn} onChange={(event) => editPolicy(row.payType, 'standardClockIn', event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ lang: nativeInputLocale }} />
              <TextField size="small" type="time" label={text.clockOut} value={row.standardClockOut} onChange={(event) => editPolicy(row.payType, 'standardClockOut', event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ lang: nativeInputLocale }} />
              <TextField size="small" type="number" label={text.breakTime} value={row.breakMinutes} onChange={(event) => editPolicy(row.payType, 'breakMinutes', event.target.value)} InputLabelProps={{ shrink: true }} InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>{text.minutes}</Typography> }} />
              <TextField size="small" type="number" label={text.minimum} value={row.workdayMinimumHours} onChange={(event) => editPolicy(row.payType, 'workdayMinimumHours', event.target.value)} inputProps={{ min: .5, step: .5 }} InputLabelProps={{ shrink: true }} InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>{text.hours}</Typography> }} />
            </Box>
          </Paper>;
        })}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>{text.cancel}</Button>
      <SaveButton onClick={save} loading={saving} disabled={loading || !dirty || !valid}>{text.save}</SaveButton>
    </DialogActions>
  </Dialog>;
};

export default PayTypeScheduleSettingsDialog;
