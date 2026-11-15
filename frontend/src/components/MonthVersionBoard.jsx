import React from 'react';

import VersionAssignmentBoard from './VersionAssignmentBoard';

export default function MonthVersionBoard({ months, boundaries, versionForMonth, onAssign, languageCode = 'en', busy = false, ...props }) {
  const allMonths = [...new Set(months)].sort();
  const last = allMonths.at(-1);
  return <><VersionAssignmentBoard {...props} languageCode={languageCode} busy={busy}
    onAssign={(version, target) => onAssign(version, target.id)}
    onUnassign={version => onAssign(version, null)}
    targets={[...allMonths].reverse().map(month => ({ id: month, label: month, version: versionForMonth(month), boundary: Object.values(boundaries).includes(month) }))}
    rangeLabel={`${allMonths[0] || ''} ~ ${last || ''}`} /></>;
}
