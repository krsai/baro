import React, { useState } from 'react';
import { Button } from '@mui/material';
import VersionAssignmentBoard from './VersionAssignmentBoard';
import { shiftVersionMonth } from '../utils/versionApplication.mjs';

export default function MonthVersionBoard({ months, boundaries, versionForMonth, onAssign, languageCode = 'en', busy = false, ...props }) {
  const [futureMonths, setFutureMonths] = useState([]);
  const allMonths = [...new Set([...months, ...futureMonths])].sort();
  const last = allMonths.at(-1);
  const addYear = () => setFutureMonths(current => [...current, ...Array.from({ length: 12 }, (_, index) => shiftVersionMonth(last, index + 1))]);
  return <VersionAssignmentBoard {...props} languageCode={languageCode} busy={busy}
    onAssign={(version, target) => onAssign(version, target.id)}
    onUnassign={version => onAssign(version, null)}
    targets={[...allMonths].reverse().map(month => ({ id: month, label: month, version: versionForMonth(month), boundary: Object.values(boundaries).includes(month) }))}
    rangeLabel={`${allMonths[0] || ''} ~ ${last || ''}`}
    targetActions={<Button size="small" onClick={addYear} disabled={busy || !last}>{languageCode === 'ko' ? '이후 12개월' : languageCode === 'vi' ? '12 tháng tiếp' : 'Next 12 months'}</Button>} />;
}
