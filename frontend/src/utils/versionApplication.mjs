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
