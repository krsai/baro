// A calendar-date rule; do not approximate six months with a fixed day count.
export const employmentDateKey = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value as any);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export const hasPreviousYearSixMonthsService = (employee: { joinedAt?: unknown; leftAt?: unknown }, month: string): boolean => {
  const year = Number(month.slice(0, 4));
  const joined = employmentDateKey(employee.joinedAt);
  const left = employmentDateKey(employee.leftAt);
  if (!joined || !Number.isInteger(year) || year < 2) return false;
  const startKey = joined > `${year - 1}-01-01` ? joined : `${year - 1}-01-01`;
  const start = new Date(`${startKey}T00:00:00Z`);
  const yearEndExclusive = new Date(Date.UTC(year, 0, 1));
  const leftEndExclusive = left ? new Date(new Date(`${left}T00:00:00Z`).getTime() + 86400000) : yearEndExclusive;
  const end = leftEndExclusive < yearEndExclusive ? leftEndExclusive : yearEndExclusive;
  const targetMonth = start.getUTCMonth() + 6;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const sixMonths = new Date(Date.UTC(start.getUTCFullYear(), targetMonth, Math.min(start.getUTCDate(), lastDay)));
  return Number.isFinite(start.getTime()) && end >= sixMonths;
};

const TENURE_NAMES = new Set(['근속수당','seniorityallowance','phụcấpthâmniên']);
export const isTenureSalaryItem = (item: any): boolean =>
  String(item?.code || item?.id || '') === 'seniority' || (Array.isArray(item?.formula) && item.formula.includes('TENURE_YEARS'))
  || (item?.category === 'ALLOWANCE' && [item.nameKo,item.nameEn,item.nameVi,item.name].some(name=>TENURE_NAMES.has(String(name || '').normalize('NFC').toLowerCase().replace(/\s/g,''))));

export const resolveSalaryTenureYears = (joinedAt: unknown, month: string): number => {
  const joined = employmentDateKey(joinedAt);
  if (!joined || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) return 0;
  const [year, monthNumber] = month.split('-').map(Number) as [number,number];
  const [joinedYear, joinedMonth, joinedDay] = joined.split('-').map(Number) as [number,number,number];
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0));
  // Clamp a leap-day anniversary to the last day of February in non-leap years.
  const anniversaryDay = Math.min(joinedDay, new Date(Date.UTC(year, joinedMonth, 0)).getUTCDate());
  const anniversary = new Date(Date.UTC(year, joinedMonth - 1, anniversaryDay));
  return Math.max(0, year - joinedYear - (monthEnd < anniversary ? 1 : 0));
};
