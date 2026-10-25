import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import VersionAssignmentBoard from './VersionAssignmentBoard';
import { shiftVersionMonth } from '../utils/versionApplication.mjs';

export default function MonthVersionBoard({ months, boundaries, versionForMonth, onAssign, languageCode = 'en', busy = false, ...props }) {
  const [futureMonths, setFutureMonths] = useState([]);
  const allMonths = [...new Set([...months, ...futureMonths])].sort();
  const last = allMonths.at(-1);
  const addYear = () => setFutureMonths(current => [...current, ...Array.from({ length: 12 }, (_, index) => shiftVersionMonth(last, index + 1))]);
  return <><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{languageCode === 'ko' ? '대상 자료가 없어도 버전을 저장할 수 있습니다. 이후 자료에는 해당 월의 적용 버전을 사용합니다.' : languageCode === 'vi' ? 'Có thể lưu phiên bản trước khi có dữ liệu. Dữ liệu sau này dùng phiên bản áp dụng cho tháng tương ứng.' : 'Versions can be saved before any target data exists. Later data uses the version effective for its month.'}</Typography><VersionAssignmentBoard {...props} languageCode={languageCode} busy={busy}
    onAssign={(version, target) => onAssign(version, target.id)}
    onUnassign={version => onAssign(version, null)}
    targets={[...allMonths].reverse().map(month => ({ id: month, label: month, version: versionForMonth(month), boundary: Object.values(boundaries).includes(month) }))}
    rangeLabel={`${allMonths[0] || ''} ~ ${last || ''}`}
    targetActions={<Button size="small" onClick={addYear} disabled={busy || !last}>{languageCode === 'ko' ? '이후 12개월' : languageCode === 'vi' ? '12 tháng tiếp' : 'Next 12 months'}</Button>} /></>;
}
