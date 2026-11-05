import { isPolicyWorkday, type EmployeePayTypePolicyValue } from './employeePayTypePolicy';

type Punch = { workDate: string; clockIn?: string | null; clockOut?: string | null; workedSeconds?: number | null };
type ApprovedWork = { workDate: string; kind: 'OVERTIME' | 'SPECIAL'; approvedSeconds: number };
const clockMinutes = (value?: string | null): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60 : null;
};

/** Date-scoped payroll facts. Callers supply authorized approvals and eligible employment dates. */
export function dailyPayrollAttendance(input: {
  dateKeys: string[];
  entries: Punch[];
  approvals: ApprovedWork[];
  holidayDateKeys: Set<string>;
  excusedDateKeys: Set<string>;
  policy: EmployeePayTypePolicyValue;
  latenessGraceMinutes: number;
  overtimeToleranceMinutes: number;
}) {
  const { policy } = input;
  for (const minutes of [input.latenessGraceMinutes, input.overtimeToleranceMinutes]) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error('INVALID_ATTENDANCE_TOLERANCE');
  }
  const scheduledStart = clockMinutes(policy.standardClockIn)!;
  const days = [...new Set(input.dateKeys)].sort().map(workDate => {
    const scheduled = !input.holidayDateKeys.has(workDate) && isPolicyWorkday(workDate, policy);
    const rows = input.entries.filter(row => row.workDate === workDate);
    // Never turn a missing half of a punch into an absence or payable overtime.
    const complete = rows.length > 0 && rows.every(row => clockMinutes(row.clockIn) !== null
      && clockMinutes(row.clockOut) !== null && row.workedSeconds != null
      && Number.isFinite(row.workedSeconds) && row.workedSeconds >= 0);
    const workedSeconds = complete ? rows.reduce((sum, row) => sum + row.workedSeconds!, 0) : 0;
    const present = complete && workedSeconds > 0;
    const excused = input.excusedDateKeys.has(workDate);
    const firstPunch = complete ? Math.min(...rows.map(row => clockMinutes(row.clockIn)!)) : null;
    const late = scheduled && present && firstPunch! > scheduledStart + input.latenessGraceMinutes;
    const absence = scheduled && !excused && (rows.length === 0 || complete && workedSeconds === 0);
    const needsReview = rows.length > 0 && !complete;
    const kind = scheduled ? 'OVERTIME' : 'SPECIAL';
    const approvals = input.approvals.filter(row => row.workDate === workDate && row.kind === kind);
    // Duplicate approvals must not multiply the payable allowance for a day.
    const approvedSeconds = Math.max(0, ...approvals.map(row => row.approvedSeconds).filter(Number.isFinite));
    const actualExtraSeconds = present ? Math.max(0, workedSeconds - (scheduled ? policy.standardWorkMinutes * 60 : 0)) : 0;
    const recognizedSeconds = approvedSeconds > 0 && actualExtraSeconds > 0
      ? Math.min(approvedSeconds, actualExtraSeconds + (approvedSeconds - actualExtraSeconds <= input.overtimeToleranceMinutes * 60 ? input.overtimeToleranceMinutes * 60 : 0)) : 0;
    return { workDate, scheduled, present, late, absence, needsReview, workedSeconds, approvedSeconds,
      overtimeSeconds: scheduled ? recognizedSeconds : 0, specialSeconds: scheduled ? 0 : recognizedSeconds };
  });
  return { days, lateCount: days.filter(day => day.late).length, absenceCount: days.filter(day => day.absence).length,
    reviewCount: days.filter(day => day.needsReview).length, actualWorkdays: days.filter(day => day.scheduled && day.present).length,
    overtimeSeconds: days.reduce((sum, day) => sum + day.overtimeSeconds, 0), specialSeconds: days.reduce((sum, day) => sum + day.specialSeconds, 0) };
}
