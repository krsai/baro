import React from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import MonthSelector from './MonthSelector';
import { currentVersionMonth, shiftVersionMonth } from '../utils/versionApplication.mjs';

const TEXT = {
  ko: { future: '지금부터 새로 시작되는 대상', futureHelp: '기존 대상을 선택하지 않아도 새로 생성되는 대상에는 최신 버전이 자동 적용됩니다. 기존 대상의 적용 구간은 필요할 때 지정하세요.', month: '적용 시작월', now: '이번 달부터', next: '다음 달부터', none: '미적용', since: month => `${month}부터 이후에 적용`, help: '새 버전은 기본 시작월부터 이후에 적용됩니다. 다른 시작월이 필요하면 직접 변경하세요.' },
  en: { future: 'New work from now on', futureHelp: 'The latest version applies to newly created work without selecting existing work. Set a historical range only when needed.', month: 'Effective month', now: 'This month', next: 'Next month', none: 'Not applied', since: month => `Applies from ${month} onward`, help: 'New versions apply from the default month onward. Change the start month only when needed.' },
  vi: { future: 'Đối tượng mới từ bây giờ', futureHelp: 'Phiên bản mới nhất tự động áp dụng cho đối tượng mới, không cần chọn đối tượng cũ. Chỉ đặt phạm vi cũ khi cần.', month: 'Tháng áp dụng', now: 'Từ tháng này', next: 'Từ tháng sau', none: 'Chưa áp dụng', since: month => `Áp dụng từ ${month} trở đi`, help: 'Phiên bản mới áp dụng từ tháng mặc định trở đi. Chỉ đổi tháng bắt đầu khi cần.' },
};
const VersionApplicationStart = ({ languageCode = 'en', mode = 'month', value, defaultMonth = currentVersionMonth(), onChange, versionNumber, disabled = false, min, label, showHelp = false }) => {
  const text = TEXT[languageCode] || TEXT.en;
  if (mode === 'future') return <Box sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}><Typography variant="body2" fontWeight={700}>{text.future}</Typography>{Boolean(versionNumber) && <Chip size="small" label={`Ver.${versionNumber}`} />}</Stack>
    <Typography variant="caption" color="text.secondary">{text.futureHelp}</Typography>
  </Box>;
  return <Stack spacing={0.75}>
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ rowGap: 1.5 }}>
      <Button size="small" disabled={disabled} onClick={() => onChange?.(defaultMonth)}>{text.now}</Button>
      <Button size="small" disabled={disabled} onClick={() => onChange?.(shiftVersionMonth(defaultMonth,1))}>{text.next}</Button>
      <MonthSelector allowFuture label={label || text.month} value={value || ''} onChange={onChange} min={min} disabled={disabled} />
    </Stack>
    <Typography variant="caption" color="text.secondary">{value ? text.since(value) : text.none}</Typography>
    {showHelp && <Typography variant="caption" color="text.secondary">{text.help}</Typography>}
  </Stack>;
};
export default VersionApplicationStart;
