import { todayDateKey } from './dateKey.mjs';
export const currentVersionMonth = () => todayDateKey().slice(0,7);
export const shiftVersionMonth = (month, offset) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return '';
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0,7);
};
// Include explicit future starts without generating thousands of intervening rows.
export const versionTimelineMonths = (months, currentMonth, boundaries = {}) =>
  [...new Set([...months, currentMonth, shiftVersionMonth(currentMonth,1), ...Object.values(boundaries)]
    .filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))))].sort();

// Match the server's effective-month order, including out-of-order historical
// starts and several revisions in one month. Unassigned versions never apply.
export const applicableMonthVersion = (versions, boundaries, month, baselineVersionNumber = null) => versions
  .map(version => ({ version, start: version.versionNumber === baselineVersionNumber ? '1900-01' : boundaries[version.id] }))
  .filter(row => row.start && row.start <= month)
  .sort((a, b) => b.start.localeCompare(a.start) || b.version.versionNumber - a.version.versionNumber)[0]?.version || null;
